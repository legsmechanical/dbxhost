/* seq8_audio_rec.c — RECORD THE MOVE'S INPUT into an Audio clip (Rec on an
 * Audio track).
 *
 * Josh, 2026-11-12 (the model, one ruling at a time): a take is as long as
 * MIDI's — an empty clip records until Rec again, rounded up to the bar; a
 * clip that has a sample records exactly its length. Stopped: the count-in,
 * then the top. Playing: it waits for the clip's next loop (the next bar on an
 * empty clip). On a clip with a sample the take is a LAYER: the clip as heard
 * plus the input, into a new file, Undo restores the last. The input is heard
 * through the track while the take runs; the take holds it dry. Rec again on
 * a layer punches out.
 *
 * The take is composed here and handed to the host as it goes (a FEED take,
 * move_host_ext_v1_t.capture_feed), because only here are the clock, the
 * clip's own sound and the input known together. Positions are frames of the
 * render stream: ar_pos is this block's first frame. A tick played at frame
 * `off` of a block is heard (its sound fed to the slot) LEAD_FRAMES later when
 * the lead is on, so the take's frame 0 is fed at
 *
 *     P0 = ar_pos + off (+ LEAD_FRAMES)
 *
 * and what the player plays against it arrives at the input ar_lat frames
 * after that (the slot's next block, the output, the room or the cable, the
 * input). Take frame n is therefore
 *
 *     rec(n) = input(P0 + ar_lat + n) + base(P0 + n)
 *
 * base = the track's sequenced sound as fed (after the lead, before mute), held
 * back in a ring for ar_lat frames. An empty clip's base is silence.
 *
 *   ARMED      the path is in, the monitor on; waiting for the start tick
 *   RECORDING  the start tick has played; frames go to the host as the input
 *              reaches them
 *   ENDING     the end tick has played: the length is known
 *   DONE       every frame is handed over (the UI lands it when the host has
 *              written it: tN_au_rec_land)
 *   CANCELLED / FAILED — nothing to land (the UI removes any file)
 *
 * Included by seq8.c after seq8_merge_audio.c (RS_BAR_TICKS). */

#define AR_IDLE       0
#define AR_ARMED      1
#define AR_RECORDING  2
#define AR_ENDING     3
#define AR_DONE       4
#define AR_CANCELLED  5
#define AR_FAILED     6

#define AR_ERR_NONE     0
#define AR_ERR_TRACK    1   /* not an Audio track, or no slot to play through */
#define AR_ERR_BUSY     2   /* a resample, merge or print is running */
#define AR_ERR_LOADING  3   /* the clip's sample is still loading */
#define AR_ERR_SAMPLER  4   /* the host's sampler is busy (or refused the feed) */
#define AR_ERR_PATH     5
#define AR_ERR_SILENT   6   /* the take heard no input: nothing to land */
#define AR_ERR_CAP      7   /* (not an error) a growing take stopped at AR_MAX_BARS */

#define AR_MAX_BARS   64
#define AR_SILENT_PEAK 4     /* an input under this never moved */
#define AR_RAMP       64

static void au_clip_set_bars(seq8_instance_t *inst, int t, int c, int bars);   /* sp_track_audio.c */
static void au_mark(seq8_instance_t *inst, int t, int c);                      /* sp_track_audio.c */

static int ar_busy(const seq8_instance_t *inst) {
    return inst->ar_state == AR_ARMED || inst->ar_state == AR_RECORDING || inst->ar_state == AR_ENDING;
}

/* The slot an Audio track plays through, or -1. */
static int ar_slot(const seq8_instance_t *inst, int t) {
    const play_fx_t *fx = &inst->tracks[t].pfx;
    midi_dest_t dst = midi_dest_resolve(fx->route, fx->slot, fx->midi_to);
    if (inst->tracks[t].pad_mode != PAD_MODE_AUDIO || !dst.emit || dst.route != ROUTE_SCHWUNG) return -1;
    return dst.slot;
}

/* The clip's place in its loop, in ticks, for the tick about to play: its own
 * counters, or — a clip whose Dir runs back (a Loop clip always plays forwards
 * in time, au_render) — the master clock. */
static uint32_t ar_clip_tick(const seq8_instance_t *inst, const seq8_track_t *tr, const clip_t *lc) {
    uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
    if (lc->playback_dir != 0) {
        uint32_t lt = (uint32_t)(lc->length ? lc->length : 1) * tps;
        uint32_t el = (uint32_t)inst->global_tick * (uint32_t)TICKS_PER_STEP + inst->master_tick_in_step;
        return el % lt;
    }
    if (tr->current_step < lc->loop_start) return 0;
    return (uint32_t)(tr->current_step - lc->loop_start) * tps + tr->tick_in_step;
}

static void ar_end(seq8_instance_t *inst, int state) {
    if ((inst->ar_state == AR_RECORDING || inst->ar_state == AR_ENDING) && g_ext && g_ext->capture_stop)
        g_ext->capture_stop();
    inst->ar_state = (uint8_t)state;
}

/* tN_au_rec_arm "C lat [gain mono] |/abs/path.wav": arm a take into clip C.
 * lat < 0 keeps the latency as it is. gain: the input's level x4096 (the UI's
 * Line In / Mic Gain, by the jack; absent = 4096), mono 1: the left channel on
 * both sides (the UI's Rec Input). Applied to the take and to the monitor. */
static void ar_arm(seq8_instance_t *inst, int t, const char *val) {
    const char *p = val, *path = val ? strchr(val, '|') : NULL;
    int c, lat;
    au_clip_t *cl;
    inst->ar_err = AR_ERR_NONE;
    if (ar_busy(inst) || !val) return;
    c = my_atoi(p);
    while (*p == ' ') p++;
    while (*p >= '0' && *p <= '9') p++;
    lat = my_atoi(p);
    {
        int g = 4096, mono = 0;
        while (*p == ' ') p++;
        if (*p == '-') p++;
        while (*p >= '0' && *p <= '9') p++;
        while (*p == ' ') p++;
        if (*p >= '0' && *p <= '9') {
            g = my_atoi(p);
            while (*p >= '0' && *p <= '9') p++;
            while (*p == ' ') p++;
            if (*p >= '0' && *p <= '9') mono = my_atoi(p) ? 1 : 0;
        }
        inst->ar_in_q12 = (uint32_t)(g < 0 ? 0 : g > 65535 ? 65535 : g);
        inst->ar_in_mono = (uint8_t)mono;
    }
    if (c < 0 || c >= NUM_CLIPS) return;
    if (!path || path[1] != '/' || strlen(path + 1) >= sizeof inst->ar_path) { inst->ar_err = AR_ERR_PATH; return; }
    if (inst->offline || ar_slot(inst, t) < 0) { inst->ar_err = AR_ERR_TRACK; return; }
    if (rs_active(inst) || inst->merge_state != MERGE_STATE_IDLE || inst->print_state) {
        inst->ar_err = AR_ERR_BUSY; return;
    }
    cl = au_cl(inst, t, c);
    if (cl->state == 1) { inst->ar_err = AR_ERR_LOADING; return; }
    if (lat >= 0 && lat < AR_RING - 256) inst->ar_lat = (uint32_t)lat;
    snprintf(inst->ar_path, sizeof inst->ar_path, "%s", path + 1);
    inst->ar_track    = (uint8_t)t;
    inst->ar_clip     = (uint8_t)c;
    inst->ar_fixed    = cl->smp ? 1 : 0;
    inst->ar_stop_req = 0;
    inst->ar_peak     = 0;
    inst->ar_total    = 0;
    inst->ar_done     = 0;
    inst->ar_ticks    = 0;
    inst->ar_in_gain  = AR_RAMP;
    inst->ar_state    = AR_ARMED;
}

/* tN_au_rec_stop: Rec again. A take that has not started is cancelled. */
static void ar_stop(seq8_instance_t *inst) {
    if (inst->ar_state == AR_ARMED) { ar_end(inst, AR_CANCELLED); return; }
    if (inst->ar_state == AR_RECORDING) inst->ar_stop_req = 1;
}

/* The transport stopped, a project is loading, the take was cancelled. */
static void ar_cancel(seq8_instance_t *inst) {
    if (ar_busy(inst)) ar_end(inst, AR_CANCELLED);
}

/* The tick loop, before any track plays the tick (seq8_render.c): the take
 * starts on its top and ends on its end, both on this tick's frame. */
static void ar_tick(seq8_instance_t *inst) {
    seq8_track_t *tr;
    clip_t *lc;
    uint32_t abs, pos;
    uint64_t at;
    if (inst->ar_state != AR_ARMED && inst->ar_state != AR_RECORDING) return;
    tr = &inst->tracks[inst->ar_track];
    lc = &tr->clips[inst->ar_clip];
    /* the take is the clip's while it plays: another clip, or none, ends it */
    if (tr->active_clip != inst->ar_clip || tr->pad_mode != PAD_MODE_AUDIO) { ar_end(inst, AR_CANCELLED); return; }
    if (!tr->clip_playing) {
        if (inst->ar_state == AR_RECORDING) ar_end(inst, AR_CANCELLED);
        return;                              /* armed: it starts when the clip does */
    }
    abs = inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step;
    pos = ar_clip_tick(inst, tr, lc);
    at  = inst->ar_pos + inst->au_tick_off + (lead_active(inst) ? LEAD_FRAMES : 0);
    if (inst->ar_state == AR_ARMED) {
        int top = inst->ar_fixed ? (pos == 0) : (abs % RS_BAR_TICKS == 0);
        if (!top) return;
        if (!g_ext || !g_ext->capture_start_src || !g_ext->capture_feed
                || !g_ext->capture_start_src(inst->ar_path, 0, MOVE_CAPTURE_FEED, 0)) {
            inst->ar_err = AR_ERR_SAMPLER;
            inst->ar_state = AR_FAILED;
            return;
        }
        inst->ar_p0 = at;
        inst->ar_start_abs = abs;
        inst->ar_state = AR_RECORDING;
        return;
    }
    /* RECORDING: its end */
    {
        uint32_t el = abs - inst->ar_start_abs;
        int end = 0;
        if (el == 0) return;
        if (inst->ar_fixed) end = (pos == 0);
        else if (abs % RS_BAR_TICKS == 0) {
            if (inst->ar_stop_req) end = 1;
            else if (el >= (uint32_t)AR_MAX_BARS * RS_BAR_TICKS) { end = 1; inst->ar_err = AR_ERR_CAP; }
        }
        if (!end) return;
        inst->ar_ticks = el;
        inst->ar_total = at - inst->ar_p0;
        inst->ar_state = AR_ENDING;
    }
}

/* au_render, the take's track: its sequenced sound for this block, as fed. */
static inline void ar_base_put(seq8_instance_t *inst, int t, int f, int32_t l, int32_t r) {
    if (t == inst->ar_track && ar_busy(inst)) { inst->ar_blk[f * 2] = l; inst->ar_blk[f * 2 + 1] = r; }
}

/* au_render, after every track: the base into the ring, the input into the
 * take (and to the track, to be heard). */
static void ar_block(seq8_instance_t *inst, int frames) {
    int16_t out[256], mon[256];
    const int16_t *in = NULL;
    int f, n = 0, slot;
    if (frames <= 0 || frames > 128) return;
    if (ar_busy(inst)) {
        uint64_t b = inst->ar_pos;
        /* the monitor rides the track's mute and solo like its own sound
         * (au_render applies those itself: the slot is not muted) */
        int mtarget = effective_mute(inst, inst->ar_track) ? 0 : AR_RAMP;
        if (g_host && g_host->mapped_memory)
            in = (const int16_t *)(g_host->mapped_memory + g_host->audio_in_offset);
        for (f = 0; f < frames; f++) {
            uint64_t q = b + (uint64_t)f;              /* feed position == input position of this frame */
            int32_t *rg = &inst->ar_ring[(q % AR_RING) * 2];
            int32_t il = in ? in[f * 2] : 0, ir = in ? in[f * 2 + 1] : 0;
            /* the input as set: Mono takes the left channel, then its gain */
            if (inst->ar_in_mono) ir = il;
            if (inst->ar_in_q12 != 4096) {
                il = (int32_t)(((int64_t)il * inst->ar_in_q12) >> 12);
                ir = (int32_t)(((int64_t)ir * inst->ar_in_q12) >> 12);
                il = il > 32767 ? 32767 : il < -32768 ? -32768 : il;
                ir = ir > 32767 ? 32767 : ir < -32768 ? -32768 : ir;
            }
            rg[0] = inst->ar_blk[f * 2]; rg[1] = inst->ar_blk[f * 2 + 1];
            /* the monitor: the input through the track, ramped in and out */
            if (inst->ar_mon_gain != mtarget) inst->ar_mon_gain = (uint8_t)(inst->ar_mon_gain + (mtarget > inst->ar_mon_gain ? 1 : -1));
            mon[f * 2]     = (int16_t)(il * inst->ar_mon_gain / AR_RAMP);
            mon[f * 2 + 1] = (int16_t)(ir * inst->ar_mon_gain / AR_RAMP);
            if (inst->ar_state == AR_RECORDING || inst->ar_state == AR_ENDING) {
                uint64_t s = inst->ar_p0 + inst->ar_lat;   /* where the take's frame 0 reaches the input */
                if (q >= s) {
                    uint64_t k = q - s;                    /* take frame */
                    if (inst->ar_total && k >= inst->ar_total) continue;
                    {
                        const int32_t *bs = &inst->ar_ring[((inst->ar_p0 + k) % AR_RING) * 2];
                        int32_t al, ar_, l, r;
                        /* punch out: the input fades, the clip's sound runs on */
                        if (inst->ar_stop_req && inst->ar_fixed && inst->ar_in_gain) inst->ar_in_gain--;
                        al = il * inst->ar_in_gain / AR_RAMP; ar_ = ir * inst->ar_in_gain / AR_RAMP;
                        {
                            int32_t m = al < 0 ? -al : al, m2 = ar_ < 0 ? -ar_ : ar_;
                            if (m2 > m) m = m2;
                            if (m > inst->ar_peak) inst->ar_peak = (uint16_t)(m > 65535 ? 65535 : m);
                        }
                        l = al + bs[0]; r = ar_ + bs[1];
                        out[n * 2]     = (int16_t)(l > 32767 ? 32767 : l < -32768 ? -32768 : l);
                        out[n * 2 + 1] = (int16_t)(r > 32767 ? 32767 : r < -32768 ? -32768 : r);
                        n++;
                    }
                }
            }
        }
        if (n > 0) {
            if (!g_ext->capture_feed(out, (uint32_t)n)) { inst->ar_err = AR_ERR_SAMPLER; ar_end(inst, AR_FAILED); }
            else inst->ar_done += (uint64_t)n;
        }
        if (inst->ar_state == AR_ENDING && inst->ar_done >= inst->ar_total) {
            g_ext->capture_stop();
            inst->ar_state = inst->ar_peak < AR_SILENT_PEAK ? AR_CANCELLED : AR_DONE;
            if (inst->ar_peak < AR_SILENT_PEAK) inst->ar_err = AR_ERR_SILENT;
        }
        slot = ar_slot(inst, inst->ar_track);
        if (ar_busy(inst) && slot >= 0 && in && g_ext && g_ext->slot_audio_feed)
            g_ext->slot_audio_feed(slot, mon, (uint32_t)frames);
        memset(inst->ar_blk, 0, sizeof inst->ar_blk);
    } else inst->ar_mon_gain = 0;
    inst->ar_pos += (uint64_t)frames;
}

/* tN_au_rec_land "C": the UI saw the host write the file — the take becomes
 * the clip's sample, one undo step. A layer keeps the clip's length and plays
 * the new file straight (what was heard is in it); a growing take sets the
 * length and lands where it was played (its Offset). */
static void ar_land(seq8_instance_t *inst, int t) {
    int c = inst->ar_clip;
    au_clip_t *cl;
    au_req_t r;
    char dir[256];
    const char *nm;
    if (inst->ar_state != AR_DONE || t != inst->ar_track) return;
    inst->ar_state = AR_IDLE;
    cl = au_cl(inst, t, c);
    au_samples_dir(inst, dir, sizeof dir);
    if (!dir[0]) return;
    nm = strrchr(inst->ar_path, '/');
    undo_begin_single(inst, t, c);
    if (inst->ar_fixed) {
        /* baked: the file is the clip as it played */
        cl->rstart = cl->slen = 0;
        cl->pitch = 0; cl->detune = 0; cl->gain_db = 0;
        cl->revrs = 0; cl->nudge_ms = 0; cl->rot = 0;
    } else {
        uint32_t bars = inst->ar_ticks / RS_BAR_TICKS;
        uint32_t lt;
        au_clip_set_bars(inst, t, c, (int)(bars < 1 ? 1 : bars));
        lt = bars * RS_BAR_TICKS;
        /* the clip runs on the master clock (melodic_anchor_playhead): the
         * take's first frame is where the take began in it */
        cl->rot = lt ? inst->ar_start_abs % lt : 0;
        cl->rstart = cl->slen = 0;
    }
    memset(&r, 0, sizeof r);
    r.kind = AU_REQ_PICK;
    r.track = (uint8_t)t; r.clip = (uint8_t)c;
    r.keep = 1;
    {
        double bpm = inst->tracks[t].pfx.cached_bpm > 0 ? inst->tracks[t].pfx.cached_bpm : 120.0;
        r.bpm10 = (uint16_t)(bpm * 10.0 + 0.5);
    }
    snprintf(r.path, sizeof r.path, "%s", inst->ar_path);
    snprintf(r.dir, sizeof r.dir, "%s", dir);
    r.gen = ++cl->gen;
    cl->state = 1;
    cl->name[0] = '\0';
    cl->err = 0;
    au_req_push(inst, &r);
    au_mark(inst, t, c);
    (void)nm;
}

/* get "au_rec": "state track clip done total peak err ticks" */
static int ar_status(const seq8_instance_t *inst, char *out, int out_len) {
    return snprintf(out, out_len, "%d %d %d %llu %llu %u %d %u", inst->ar_state, inst->ar_track, inst->ar_clip,
                    (unsigned long long)inst->ar_done, (unsigned long long)inst->ar_total,
                    (unsigned)inst->ar_peak, inst->ar_err, (unsigned)inst->ar_ticks);
}
