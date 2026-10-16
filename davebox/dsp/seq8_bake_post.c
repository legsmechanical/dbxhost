/* seq8_bake_post.c — the OFFLINE bake of a clip whose track has a POST MIDI
 * FX module in play (Josh, 2026-10-15: "making post midifx module bake
 * offline"). #include'd into seq8.c's translation unit after seq8_bake.c.
 *
 * Live, a POST module runs FIRST: what the clip plays goes into it raw (its
 * timing, direction, ratchets, trig conditions and note length already
 * decided), and what it plays back goes through the track's own effects.
 * The bake does the same, in three steps:
 *
 *   1. print_offline: the clip's RAW notes for N passes (bake_post_collect),
 *      as on/off events, handed to the host's offline job
 *      (move_host_ext_v1_t.midi_fx_offline_begin), which runs a private copy
 *      of the module against a virtual transport on its own thread;
 *   2. render_block polls it (bake_post_poll); when it is done,
 *   3. bake_post_finish pairs the module's output into notes, runs the
 *      track's own effects on them as the offline bake does (NOTE FX / HARMZ,
 *      then MIDI delay and SEQ ARP over the whole span), and writes the clip
 *      — one undo step, like any bake. The UI then bypasses the module, so the
 *      clip does not play through it twice.
 *
 * A DRUM clip the same way, as the drum bake does: every lane's hits go in
 * as the lane's note; what comes back plays on the lane whose note it is
 * (a pitch no lane has is dropped, as it is live), with that lane's effects,
 * over a span as long as the longest lane's cycle times N. */

#define BAKE_POST_TAIL_TICKS  (TICKS_PER_STEP * 16)   /* a bar past the Stop, for late note-offs */

static move_midi_fx_offline_ev_t bake_post_ev[MOVE_MIDI_FX_OFFLINE_MAX_EV];

typedef struct { uint32_t on, off; uint8_t pitch, vel; } bake_post_note_t;
static bake_post_note_t bake_post_raw[MOVE_MIDI_FX_OFFLINE_MAX_EV / 2];

static int bake_post_note_cmp(const void *a, const void *b) {
    const bake_post_note_t *x = a, *y = b;
    if (x->on != y->on) return x->on < y->on ? -1 : 1;
    return (int)x->pitch - (int)y->pitch;
}
/* tick order; at one tick, note-offs first (a note re-struck on its own
 * end lands after its release) */
static int bake_post_ev_cmp(const void *a, const void *b) {
    const move_midi_fx_offline_ev_t *x = a, *y = b;
    int xo, yo;
    if (x->tick != y->tick) return x->tick < y->tick ? -1 : 1;
    xo = (x->status & 0xF0) == 0x80; yo = (y->status & 0xF0) == 0x80;
    return yo - xo;
}

/* The span a bake of clip c covers, N passes: its length in steps (clamped
 * to a clip's 256) and ticks. */
static void bake_post_span(const clip_t *cl, int loops, uint16_t *len_steps, uint32_t *ticks, uint16_t *tps_out) {
    const uint16_t tps = cl->ticks_per_step ? cl->ticks_per_step : (uint16_t)TICKS_PER_STEP;
    const uint16_t cycle_steps = playback_cycle_steps(cl->playback_dir, cl->playback_audio_reverse, cl->length);
    *len_steps = (uint16_t)clamp_i((int)cycle_steps * loops, 1, 256);
    *ticks = (uint32_t)*len_steps * tps;
    *tps_out = tps;
}

/* Step 1: what the clip PLAYS into the module, N passes: the notes in the
 * loop window at their directional positions, ratchets, quantize and trig
 * conditions, each at its own length (Len, Gate) — and none of the track's
 * pitch / velocity effects, which come after the module. A pitch struck
 * again while it still sounds is released first (the live raw path does the
 * same: the module never holds two of one note). Returns the event count,
 * or -1 if it does not fit. */
static int bake_post_collect(seq8_instance_t *inst, int t, int c, int loops,
                             move_midi_fx_offline_ev_t *ev, int cap, uint32_t *total_out) {
    seq8_track_t *tr = &inst->tracks[t];
    clip_t *cl = &tr->clips[c];
    play_fx_t fx;
    uint16_t len_steps, tps;
    uint32_t total, clip_ticks, win_start, cycle_ticks;
    int nn = 0, i, loop, ne = 0;
    const int max_notes = (int)(sizeof bake_post_raw / sizeof bake_post_raw[0]);

    pfx_init_defaults(&fx);
    pfx_apply_params(&fx, &cl->pfx_params);
    fx.rng = 0xDEADBEEFu;                 /* the offline bake's own seed */
    bake_post_span(cl, loops, &len_steps, &total, &tps);
    clip_ticks  = (uint32_t)cl->length * tps;
    win_start   = (uint32_t)cl->loop_start * tps;
    cycle_ticks = (uint32_t)playback_cycle_steps(cl->playback_dir, cl->playback_audio_reverse, cl->length) * tps;
    *total_out = total;

    for (loop = 0; loop < loops; loop++) {
        const uint32_t loop_off = (uint32_t)loop * cycle_ticks;
        for (i = 0; i < cl->note_count; i++) {
            const note_t *n = &cl->notes[i];
            uint32_t rel, gate, pos[2];
            uint16_t sidx, sub_interval, final_gate;
            uint8_t  ratch;
            int ei, k, np;
            if (n->suppress_until_wrap) continue;
            if (n->tick < win_start || n->tick >= win_start + clip_ticks) continue;
            sidx = note_step(n->tick, cl->length, tps);
            if (!step_trig_pass(cl, sidx, (uint32_t)loop, &fx.rng)) continue;
            rel  = n->tick - win_start;
            gate = compute_effective_gate_ticks(tps, n->gate, cl->pfx_params.note_length_mode, fx.gate_time);
            if (gate < 1) gate = 1;
            np = compute_bake_emit_positions(cl->playback_dir, cl->playback_audio_reverse, cl->length, tps, rel, gate, pos);
            ratch = cl->step_ratchet[sidx]; if (ratch < 2) ratch = 1;
            sub_interval = ratch > 1 ? (uint16_t)(tps / ratch) : 0;
            final_gate   = ratch > 1 ? (sub_interval ? sub_interval : 1) : (uint16_t)gate;
            for (ei = 0; ei < np; ei++) {
                const uint32_t q = bake_apply_quantize(pos[ei], tps,
                    playback_cycle_steps(cl->playback_dir, cl->playback_audio_reverse, cl->length), fx.quantize);
                for (k = 0; k < ratch; k++) {
                    const uint32_t at = q + (uint32_t)k * sub_interval;
                    if (at >= cycle_ticks) break;
                    if (loop_off + at >= total) continue;
                    if (nn >= max_notes) return -1;
                    bake_post_raw[nn].on    = loop_off + at;
                    bake_post_raw[nn].off   = loop_off + at + final_gate;
                    bake_post_raw[nn].pitch = n->pitch;
                    bake_post_raw[nn].vel   = n->vel;
                    nn++;
                }
            }
        }
    }
    qsort(bake_post_raw, (size_t)nn, sizeof bake_post_raw[0], bake_post_note_cmp);
    /* one of a pitch at a time: a re-strike cuts the one before it short */
    for (i = 0; i < nn; i++) {
        int j;
        for (j = i + 1; j < nn; j++) {
            if (bake_post_raw[j].on >= bake_post_raw[i].off) break;
            if (bake_post_raw[j].pitch == bake_post_raw[i].pitch) { bake_post_raw[i].off = bake_post_raw[j].on; break; }
        }
    }
    {
        const uint8_t ch = (uint8_t)(tr->channel & 0x0F);
        for (i = 0; i < nn; i++) {
            if (ne + 2 > cap) return -1;
            ev[ne++] = (move_midi_fx_offline_ev_t){ bake_post_raw[i].on,  (uint8_t)(0x90 | ch), bake_post_raw[i].pitch, bake_post_raw[i].vel, 3 };
            ev[ne++] = (move_midi_fx_offline_ev_t){ bake_post_raw[i].off, (uint8_t)(0x80 | ch), bake_post_raw[i].pitch, 0, 3 };
        }
    }
    qsort(ev, (size_t)ne, sizeof ev[0], bake_post_ev_cmp);
    return ne;
}

/* Step 3: the module's output, through the track's own effects, written over
 * the clip. Audio thread (render_block), like every bake. */
static void bake_post_finish(seq8_instance_t *inst, int t, int c, int loops, int wrap,
                             const move_midi_fx_offline_ev_t *out, int n) {
    seq8_track_t *tr = &inst->tracks[t];
    clip_t *cl = &tr->clips[c];
    play_fx_t fx;
    uint16_t len_steps, tps;
    uint32_t total;
    int i, si, a = 0;
    static bake_note_t bp_a[BAKE_BUF * 4], bp_b[BAKE_BUF * 4];
    const int cap = BAKE_BUF * 4;
    uint32_t open_at[128];
    uint8_t  open_vel[128], is_open[128];
    const int scale_aware = (int)inst->scale_aware;

    bake_post_span(cl, loops, &len_steps, &total, &tps);
    pfx_init_defaults(&fx);
    pfx_apply_params(&fx, &cl->pfx_params);
    fx.track_idx = (uint8_t)t;
    fx.route     = ROUTE_SCHWUNG;
    fx.rng       = 0xDEADBEEFu;
    fx.note_random_walk = 0;
    memset(is_open, 0, sizeof is_open);

    undo_begin_single(inst, t, c);

    /* pair the module's notes; each through NOTE FX / HARMZ as it is closed */
#define BP_CLOSE(p, at) do {                                                         \
        uint32_t _on = open_at[p], _off = (at);                                       \
        uint8_t gen[MAX_GEN_NOTES];                                                   \
        int gc, gi, v;                                                                \
        is_open[p] = 0;                                                               \
        if (_on >= total) break;                                                      \
        if (_off <= _on) _off = _on + 1;                                              \
        if (_off - _on > 0xFFFF) _off = _on + 0xFFFF;                                 \
        v = clamp_i((int)open_vel[p] + fx.velocity_offset, 1, 127);                  \
        gc = pfx_build_gen_notes(inst, scale_aware, &fx, (p), 0 /* transpose is not baked */, gen); \
        for (gi = 0; gi < gc && a < cap; gi++)                                        \
            bp_a[a++] = (bake_note_t){ _on, (uint16_t)(_off - _on), gen[gi], (uint8_t)v, gen[0] }; \
    } while (0)
    for (i = 0; i < n; i++) {
        const uint8_t type = (uint8_t)(out[i].status & 0xF0), p = out[i].d1;
        if (p > 127) continue;
        if (type == 0x90 && out[i].d2 > 0) {
            if (is_open[p]) BP_CLOSE(p, out[i].tick);
            if (out[i].tick >= total) continue;
            is_open[p] = 1; open_at[p] = out[i].tick; open_vel[p] = out[i].d2;
        } else if ((type == 0x80 || type == 0x90) && is_open[p]) {
            BP_CLOSE(p, out[i].tick);
        }
    }
    for (i = 0; i < 128; i++) if (is_open[i]) BP_CLOSE(i, total);
#undef BP_CLOSE

    /* MIDI delay and SEQ ARP, over the whole span (the module's output is not
     * a repeat of one pass), as the offline bake runs them */
    {
        bake_note_t *in_buf = bp_a, *out_buf = bp_b;
        int in_n = a;
        for (si = 0; si < 2; si++) {
            int on;
            if (BAKE_STAGES[si] == BAKE_STAGE_MIDI_DLY)
                on = bake_stage_midi_dly(inst, scale_aware, &fx, total, wrap ? UINT32_MAX : total,
                                         in_buf, in_n, out_buf, cap);
            else
                on = bake_stage_arp_out(inst, &fx, total, in_buf, in_n, out_buf, cap);
            { bake_note_t *tmp = in_buf; in_buf = out_buf; out_buf = tmp; }
            in_n = on;
        }
        if (cl->length * (uint32_t)tps != total || cl->loop_start != 0)
            pa_pin_clip_length(inst, t, c, (uint32_t)cl->loop_start * (uint32_t)cl->ticks_per_step,
                               (uint32_t)cl->length * (uint32_t)cl->ticks_per_step);
        clip_init(cl);
        cl->ticks_per_step = tps;
        cl->length         = len_steps;
        for (i = 0; i < in_n; i++) {
            uint32_t tk = in_buf[i].tick;
            if (tk >= total) { if (!wrap) continue; tk %= total; }
            clip_insert_note(cl, tk, in_buf[i].gate, in_buf[i].pitch, in_buf[i].vel);
        }
    }
    clip_build_steps_from_notes(cl);
    if (c == tr->active_clip) pfx_sync_from_clip(tr);
    inst->state_dirty = 1;
}

/* ---- drum clips ---- */

static void bake_post_drum_fx(const drum_lane_t *dl, int t, play_fx_t *fx) {
    const drum_pfx_params_t *dp = &dl->pfx_params;
    pfx_init_defaults(fx);
    fx->gate_time       = dp->gate_time;
    fx->velocity_offset = dp->velocity_offset;
    fx->quantize        = dp->quantize;
    fx->delay_time_idx  = dp->delay_time_idx;
    fx->delay_level     = dp->delay_level;
    fx->repeat_times    = dp->repeat_times;
    fx->fb_velocity     = dp->fb_velocity;
    fx->fb_gate_time    = dp->fb_gate_time;
    fx->fb_clock        = dp->fb_clock;
    fx->delay_retrig    = dp->delay_retrig;
    fx->track_idx = (uint8_t)t;
    fx->route     = ROUTE_SCHWUNG;
    fx->rng       = 0xDEADBEEFu;
}

/* The drum bake's span: the longest non-empty lane's cycle, N times. */
static void bake_post_drum_span(const drum_clip_t *dc, int loops, uint16_t *len_steps, uint32_t *ticks, uint16_t *tps_out) {
    uint16_t ref_tps = (uint16_t)TICKS_PER_STEP;
    uint32_t ref = 0;
    int l;
    for (l = 0; l < DRUM_LANES; l++) {
        const clip_t *cl = &dc->lanes[l].clip;
        if (cl->note_count > 0 && cl->ticks_per_step > 0 && cl->length > 0) {
            const uint32_t ct = (uint32_t)playback_cycle_steps(cl->playback_dir, cl->playback_audio_reverse, cl->length) * cl->ticks_per_step;
            if (ct > ref) { ref = ct; ref_tps = cl->ticks_per_step; }
        }
    }
    if (ref == 0) ref = (uint32_t)SEQ_STEPS_DEFAULT * ref_tps;
    *len_steps = (uint16_t)clamp_i((int)(ref * (uint32_t)loops / ref_tps), 1, 256);
    *ticks = (uint32_t)*len_steps * ref_tps;
    *tps_out = ref_tps;
}

/* Step 1, drums: every lane's hits, raw, as the lane's note, each lane
 * looping on its own cycle across the span. */
static int bake_post_collect_drum(seq8_instance_t *inst, int t, int c, int loops,
                                  move_midi_fx_offline_ev_t *ev, int cap, uint32_t *total_out) {
    seq8_track_t *tr = &inst->tracks[t];
    drum_clip_t *dc = tr->drum_clips[c];
    uint16_t len_steps, ref_tps;
    uint32_t total;
    int l, nn = 0, ne = 0, i;
    const int max_notes = (int)(sizeof bake_post_raw / sizeof bake_post_raw[0]);
    if (!dc) return -1;
    bake_post_drum_span(dc, loops, &len_steps, &total, &ref_tps);
    *total_out = total;
    for (l = 0; l < DRUM_LANES; l++) {
        drum_lane_t *dl = &dc->lanes[l];
        clip_t *cl = &dl->clip;
        play_fx_t fx;
        uint16_t tps, length, cycle_steps;
        uint32_t clip_ticks, win_start, cycle_ticks;
        int lane_loops, loop;
        if (cl->note_count == 0) continue;
        bake_post_drum_fx(dl, t, &fx);
        tps = cl->ticks_per_step ? cl->ticks_per_step : ref_tps;
        length = cl->length ? cl->length : (uint16_t)SEQ_STEPS_DEFAULT;
        clip_ticks = (uint32_t)length * tps;
        win_start = (uint32_t)cl->loop_start * tps;
        cycle_steps = playback_cycle_steps(cl->playback_dir, cl->playback_audio_reverse, length);
        cycle_ticks = (uint32_t)cycle_steps * tps;
        if (!cycle_ticks) continue;
        lane_loops = (int)((total + cycle_ticks - 1u) / cycle_ticks);
        for (loop = 0; loop < lane_loops; loop++) {
            const uint32_t loop_off = (uint32_t)loop * cycle_ticks;
            for (i = 0; i < cl->note_count; i++) {
                const note_t *n = &cl->notes[i];
                uint32_t rel, gate, pos[2];
                uint16_t sidx, sub_interval, final_gate;
                uint8_t ratch;
                int ei, k, np;
                if (n->suppress_until_wrap) continue;
                if (n->tick < win_start || n->tick >= win_start + clip_ticks) continue;
                sidx = note_step(n->tick, length, tps);
                if (!step_trig_pass(cl, sidx, (uint32_t)loop, &fx.rng)) continue;
                rel = n->tick - win_start;
                gate = compute_effective_gate_ticks(tps, n->gate, dl->pfx_params.note_length_mode, fx.gate_time);
                if (gate < 1) gate = 1;
                np = compute_bake_emit_positions(cl->playback_dir, cl->playback_audio_reverse, length, tps, rel, gate, pos);
                ratch = cl->step_ratchet[sidx]; if (ratch < 2) ratch = 1;
                sub_interval = ratch > 1 ? (uint16_t)(tps / ratch) : 0;
                final_gate   = ratch > 1 ? (sub_interval ? sub_interval : 1) : (uint16_t)gate;
                for (ei = 0; ei < np; ei++) {
                    const uint32_t q = bake_apply_quantize(pos[ei], tps, cycle_steps, fx.quantize);
                    for (k = 0; k < ratch; k++) {
                        const uint32_t at = q + (uint32_t)k * sub_interval;
                        if (at >= cycle_ticks) break;
                        if (loop_off + at >= total) continue;
                        if (nn >= max_notes) return -1;
                        bake_post_raw[nn].on    = loop_off + at;
                        bake_post_raw[nn].off   = loop_off + at + final_gate;
                        bake_post_raw[nn].pitch = dl->midi_note;
                        bake_post_raw[nn].vel   = n->vel;
                        nn++;
                    }
                }
            }
        }
    }
    qsort(bake_post_raw, (size_t)nn, sizeof bake_post_raw[0], bake_post_note_cmp);
    for (i = 0; i < nn; i++) {
        int j;
        for (j = i + 1; j < nn; j++) {
            if (bake_post_raw[j].on >= bake_post_raw[i].off) break;
            if (bake_post_raw[j].pitch == bake_post_raw[i].pitch) { bake_post_raw[i].off = bake_post_raw[j].on; break; }
        }
    }
    {
        const uint8_t ch = (uint8_t)(tr->channel & 0x0F);
        for (i = 0; i < nn; i++) {
            if (ne + 2 > cap) return -1;
            ev[ne++] = (move_midi_fx_offline_ev_t){ bake_post_raw[i].on,  (uint8_t)(0x90 | ch), bake_post_raw[i].pitch, bake_post_raw[i].vel, 3 };
            ev[ne++] = (move_midi_fx_offline_ev_t){ bake_post_raw[i].off, (uint8_t)(0x80 | ch), bake_post_raw[i].pitch, 0, 3 };
        }
    }
    qsort(ev, (size_t)ne, sizeof ev[0], bake_post_ev_cmp);
    return ne;
}

/* Step 3, drums: the module's notes, each on the lane whose note it is, with
 * that lane's effects (velocity, then delay and SEQ ARP over the span),
 * written over the clip as one undo step. */
static void bake_post_finish_drum(seq8_instance_t *inst, int t, int c, int loops, int wrap,
                                  const move_midi_fx_offline_ev_t *out, int n) {
    seq8_track_t *tr = &inst->tracks[t];
    drum_clip_t *dc = tr->drum_clips[c];
    uint16_t len_steps, ref_tps;
    uint32_t total;
    static bake_post_note_t got[MOVE_MIDI_FX_OFFLINE_MAX_EV / 2];
    static int8_t got_lane[MOVE_MIDI_FX_OFFLINE_MAX_EV / 2];
    static bake_note_t la[BAKE_BUF * 4], lb[BAKE_BUF * 4];
    static bake_note_t pool[BAKE_BUF * 8];
    const int lcap = BAKE_BUF * 4, pcap = BAKE_BUF * 8;
    int ng = 0, np = 0, i, l, si;
    uint32_t open_at[128];
    uint8_t open_vel[128], is_open[128];
    const int scale_aware = (int)inst->scale_aware;
    if (!dc) return;
    bake_post_drum_span(dc, loops, &len_steps, &total, &ref_tps);
    undo_begin_drum_clip(inst, t, c);
    memset(is_open, 0, sizeof is_open);

    /* pair the module's notes, and find each one's lane (the first whose note it is) */
#define BPD_CLOSE(p, at) do {                                                                  uint32_t _on = open_at[p], _off = (at);                                                 int _l;                                                                                 is_open[p] = 0;                                                                         if (_on >= total || ng >= (int)(sizeof got / sizeof got[0])) break;                     if (_off <= _on) _off = _on + 1;                                                        for (_l = 0; _l < DRUM_LANES && dc->lanes[_l].midi_note != (p); _l++) {}                if (_l >= DRUM_LANES) break;                    /* no lane plays it: dropped */         got[ng] = (bake_post_note_t){ _on, _off, (uint8_t)(p), open_vel[p] };                  got_lane[ng] = (int8_t)_l; ng++;                                                    } while (0)
    for (i = 0; i < n; i++) {
        const uint8_t type = (uint8_t)(out[i].status & 0xF0), p = out[i].d1;
        if (p > 127) continue;
        if (type == 0x90 && out[i].d2 > 0) {
            if (is_open[p]) BPD_CLOSE(p, out[i].tick);
            if (out[i].tick >= total) continue;
            is_open[p] = 1; open_at[p] = out[i].tick; open_vel[p] = out[i].d2;
        } else if ((type == 0x80 || type == 0x90) && is_open[p]) {
            BPD_CLOSE(p, out[i].tick);
        }
    }
    for (i = 0; i < 128; i++) if (is_open[i]) BPD_CLOSE(i, total);
#undef BPD_CLOSE

    /* each lane's notes through that lane's effects, into one pool */
    for (l = 0; l < DRUM_LANES; l++) {
        drum_lane_t *dl = &dc->lanes[l];
        play_fx_t fx;
        bake_note_t *in_buf = la, *out_buf = lb;
        int a = 0, in_n;
        bake_post_drum_fx(dl, t, &fx);
        fx.note_random_walk = 0;
        for (i = 0; i < ng && a < lcap; i++) {
            if (got_lane[i] != l) continue;
            {
                uint32_t g = got[i].off - got[i].on;
                if (g > 0xFFFF) g = 0xFFFF;
                la[a++] = (bake_note_t){ got[i].on, (uint16_t)g, dl->midi_note,
                                         (uint8_t)clamp_i((int)got[i].vel + fx.velocity_offset, 1, 127), dl->midi_note };
            }
        }
        if (!a) continue;
        in_n = a;
        for (si = 0; si < 2; si++) {
            int on;
            if (BAKE_STAGES[si] == BAKE_STAGE_MIDI_DLY)
                on = bake_stage_midi_dly(inst, scale_aware, &fx, total, wrap ? UINT32_MAX : total, in_buf, in_n, out_buf, lcap);
            else
                on = bake_stage_arp_out(inst, &fx, total, in_buf, in_n, out_buf, lcap);
            { bake_note_t *tmp = in_buf; in_buf = out_buf; out_buf = tmp; }
            in_n = on;
        }
        for (i = 0; i < in_n && np < pcap; i++) {
            uint32_t tk = in_buf[i].tick;
            if (tk >= total) { if (!wrap) continue; tk %= total; }
            pool[np] = in_buf[i]; pool[np].tick = tk; pool[np].pitch = dl->midi_note; pool[np].prim = (uint8_t)l;
            np++;
        }
    }

    /* write: every lane cleared, its effects reset (baked), the new length */
    for (l = 0; l < DRUM_LANES; l++) {
        drum_lane_t *dl = &dc->lanes[l];
        clip_init(&dl->clip);
        dl->clip.ticks_per_step = ref_tps;
        dl->clip.length = len_steps;
        drum_pfx_params_init(&dl->pfx_params);
    }
    if (c == (int)tr->active_clip) pfx_sync_from_clip(tr);
    for (i = 0; i < np; i++)
        clip_insert_note(&dc->lanes[pool[i].prim].clip, pool[i].tick, pool[i].gate, pool[i].pitch, pool[i].vel);
    for (l = 0; l < DRUM_LANES; l++)
        if (dc->lanes[l].clip.note_count > 0) clip_build_steps_from_notes(&dc->lanes[l].clip);
    inst->state_dirty = 1;
}

/* print_offline "T C N W": start one. Refused (print_state stays 0, and
 * print_err says why) for anything but a POST track's clip. */
static void bake_post_start(seq8_instance_t *inst, int t, int c, int loops, int wrap) {
    seq8_track_t *tr;
    uint32_t total = 0;
    int ne;
    inst->print_err = 0;
    if (inst->print_state || inst->merge_state != MERGE_STATE_IDLE) { inst->print_err = 1; return; }
    if (t < 0 || t >= NUM_TRACKS || c < 0 || c >= NUM_CLIPS) { inst->print_err = 1; return; }
    tr = &inst->tracks[t];
    if (!tr->fx_post || tr->pad_mode == PAD_MODE_CONDUCT) { inst->print_err = 1; return; }
    if (tr->pad_mode == PAD_MODE_DRUM && !tr->drum_clips[c]) { inst->print_err = 1; return; }
    if (!g_ext || !g_ext->midi_fx_offline_begin) { inst->print_err = 2; return; }
    loops = clamp_i(loops, 1, 4);
    ne = tr->pad_mode == PAD_MODE_DRUM
       ? bake_post_collect_drum(inst, t, c, loops, bake_post_ev, MOVE_MIDI_FX_OFFLINE_MAX_EV, &total)
       : bake_post_collect(inst, t, c, loops, bake_post_ev, MOVE_MIDI_FX_OFFLINE_MAX_EV, &total);
    if (ne < 0) { inst->print_err = 3; return; }
    {
        float bpm = (float)tr->pfx.cached_bpm;
        if (!(bpm > 0.0f)) bpm = (float)BPM_DEFAULT;
        if (!g_ext->midi_fx_offline_begin((int)tr->pfx.slot, bpm, total, BAKE_POST_TAIL_TICKS, bake_post_ev, ne)) {
            inst->print_err = 4; return;
        }
    }
    inst->print_track = (uint8_t)t;
    inst->print_clip  = (uint8_t)c;
    inst->print_end   = total;
    inst->print_loops = (uint8_t)loops;
    inst->print_wrap  = (uint8_t)(wrap ? 1 : 0);
    inst->print_offline = 1;
    inst->print_state = 2;
}

/* Once a block while one runs: done -> write the clip (state 3, the UI
 * bypasses the module); failed or gone -> state 0 with print_err. */
static void bake_post_poll(seq8_instance_t *inst) {
    int n = 0, st;
    if (!inst->print_offline || inst->print_state != 2 || !g_ext || !g_ext->midi_fx_offline_poll) return;
    st = g_ext->midi_fx_offline_poll(bake_post_ev, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, 1);
    if (st == MOVE_MIDI_FX_OFFLINE_DONE) {
        if (inst->tracks[inst->print_track].pad_mode == PAD_MODE_DRUM)
            bake_post_finish_drum(inst, inst->print_track, inst->print_clip, inst->print_loops, inst->print_wrap, bake_post_ev, n);
        else
            bake_post_finish(inst, inst->print_track, inst->print_clip, inst->print_loops, inst->print_wrap, bake_post_ev, n);
        inst->print_offline = 0;
        inst->print_state = 3;
    } else if (st == MOVE_MIDI_FX_OFFLINE_FAILED || st == MOVE_MIDI_FX_OFFLINE_IDLE) {
        inst->print_err = st == MOVE_MIDI_FX_OFFLINE_FAILED ? 10 + n : 5;
        inst->print_offline = 0;
        inst->print_state = 0;
    }
}
