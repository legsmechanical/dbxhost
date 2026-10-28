/* FILE-SCOPE HANDLER for set_param()'s tN_au_* AUDIO keys, plus the audio
 * thread's per-block work (au_render) and get_param's tN_au_* reads -- part of
 * the seq8.c single translation unit; #included at FILE scope by
 * seq8_set_param.c, NOT a standalone TU. Engine: seq8_audio.c.
 *
 * An Audio track is pad_mode PAD_MODE_AUDIO (tN_convert_to_audio), its clips
 * melodic clips whose notes are slices: pitch AU_NOTE_BASE + slice.
 *
 * Keys (C = clip, L = slice, all 0-based):
 *   tN_au_pick    "C|<abs path>"   copy the file into the project, load it
 *   tN_au_clear   "C"              the clip has no sample
 *   tN_au_set_<field>   "C <v>"    mode / even (0 Off, 2..32) / start / end
 *                                  (frames; end 0 = the sample's end) / pitch /
 *                                  gain / bars / revrs / nudge / tempo (0 Free,
 *                                  1 Sync). Mode Slice on a
 *                                  clip with no steps lays the chops on them
 *   tN_au_slice_<field> "C L <v>"  start / end (frames, the hand set, Even Off;
 *                                  end 0 = home) / pitch / gain / rev / play /
 *                                  atk / dec
 *                                  (a key per field: two fields written to one
 *                                  key in one frame would keep only the second)
 *   tN_au_all_<field>   "C <v>"    the same sound field of EVERY slice (ALL SLICES)
 *   tN_au_mark_add "C F"           a marker at frame F: splits the hand-set slice
 *                                  there (later slices, and their steps, move up one)
 *   tN_au_mark_del "C L"           slice L's start goes: it merges into L-1 (not 0)
 *   tN_au_manual  "C"              the hand set becomes one slice, Start..End; Even Off
 *   tN_au_even_bake "C"            Even's slices become the hand set; Even Off
 *                                  (a hand edit while Even is on bakes first)
 *   tN_au_chop    "C"              one step per slice, in order (one undo)
 *   tN_au_wipe    "C"              clip C's steps go (one undo) -- a converted
 *                                  clip that now plays its recording
 *   tN_au_layout  "0|1"            PAD MODE Layout: 4 Rows / 16 Pads (saved t%d_aul)
 *   tN_au_lazy    "C 1|0"          Lazy chop: 1 arms it (the hand set put aside),
 *                                  0 stops it (Back)
 *   tN_au_lazy_tap ""              a tap: the first starts the sample at Start,
 *                                  each later one drops a marker at the playhead
 *   tN_au_lazy_keep "1|0"          after it ended: keep the new chops, or put the
 *                                  old hand set back
 * The prefix is consumed whole (a known-or-not tN_au_ key never falls through
 * to the pfx catch-all). */

static void au_mark(seq8_instance_t *inst, int t, int c) {
    rui_mark(inst, t, c);
    inst->state_dirty = 1;
}

/* Set clip (t,c) to `bars` bars, at the clip's own resolution when that fits,
 * else the coarsest that does — a resolution is only changed on a clip with no
 * notes. */
static void au_clip_set_bars(seq8_instance_t *inst, int t, int c, int bars) {
    seq8_track_t *tr = &inst->tracks[t];
    clip_t *cl = &tr->clips[c];
    uint32_t ticks = (uint32_t)bars * PPQN * 4;
    uint16_t tps = cl->ticks_per_step ? cl->ticks_per_step : TICKS_PER_STEP;
    int k;
    if (bars < 1) return;
    if (ticks / tps > SEQ_STEPS && cl->note_count == 0)
        for (k = 0; k < 6; k++) if (TPS_VALUES[k] >= tps && ticks / TPS_VALUES[k] <= SEQ_STEPS) { tps = TPS_VALUES[k]; break; }
    cl->ticks_per_step = tps;
    {
        int len = (int)(ticks / tps);
        int max_len = SEQ_STEPS - (int)cl->loop_start;
        cl->length = (uint16_t)clamp_i(len, 1, max_len < 1 ? 1 : max_len);
    }
    if (c == tr->active_clip) {
        uint16_t le = (uint16_t)(cl->loop_start + cl->length);
        if (tr->current_step < cl->loop_start || tr->current_step >= le)
            tr->current_step = cl->loop_start;
        if (inst->playing) melodic_anchor_playhead(inst, tr, cl);
    }
    clip_migrate_to_notes(cl);
    au_mark(inst, t, c);
}

/* The loader's answers, once per block. A pick that lands sets a Loop clip's
 * length to the sample's, in whole bars at the tempo (at least one). */
static void au_apply_results(seq8_instance_t *inst) {
    for (;;) {
        uint32_t t = inst->au_res_tail, h = __atomic_load_n(&inst->au_res_head, __ATOMIC_ACQUIRE);
        if (t == h) return;
        au_res_t r = inst->au_res[t & (AU_RING - 1)];
        __atomic_store_n(&inst->au_res_tail, t + 1, __ATOMIC_RELEASE);
        if (r.track >= NUM_TRACKS || r.clip >= NUM_CLIPS) { au_drop(inst, r.smp); continue; }
        au_clip_t *cl = &inst->au_clip[r.track][r.clip];
        if (r.gen != cl->gen) { au_drop(inst, r.smp); continue; }       /* superseded */
        au_sample_t *old = cl->smp;
        if (old) { au_track_kill(inst, r.track, old); au_drop(inst, old); }
        cl->smp = r.smp;
        cl->err = r.err;
        cl->state = r.smp ? 2 : 3;
        if (r.smp) {
            int was_pick = cl->name[0] == '\0' || strcmp(cl->name, r.name) != 0;
            snprintf(cl->name, sizeof cl->name, "%s", r.name);
            if (cl->mig_rs || cl->mig_re) {
                /* an older project's Start / End, now that the length is known */
                cl->rstart = (uint32_t)((uint64_t)r.smp->frames * cl->mig_rs / 1000);
                cl->rend = cl->mig_re >= 1000 ? 0 : (uint32_t)((uint64_t)r.smp->frames * cl->mig_re / 1000);
                cl->mig_rs = cl->mig_re = 0;
            }
            if (was_pick) {
                /* a new sample: the whole of it, and a hand set of one slice
                 * (frames of the old one mean nothing here) */
                int l;
                cl->rstart = cl->rend = 0;
                cl->nslices = 1;
                for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
            }
            /* the sample's own length in bars: the loader's guess for a new
             * sample, or a project's that predates Bars */
            if ((was_pick || !cl->bars) && r.bars) cl->bars = r.bars;
            if (was_pick && cl->mode == AU_MODE_LOOP) au_clip_set_bars(inst, r.track, r.clip, cl->bars ? cl->bars : 1);
            au_mark(inst, r.track, r.clip);
        }
    }
}

/* Tell the streamer where each streamed voice is and which way it goes,
 * and each streamed clip's range (it
 * reads nothing else of ours); then count the block (a chunk the
 * streamer empties is freed two blocks later). */
static void au_watch_publish(seq8_instance_t *inst) {
    int t, i;
    for (t = 0; t < NUM_TRACKS; t++) {
        au_track_t *at = &inst->au_trk[t];
        for (i = 0; i <= AU_VOICES; i++) {
            au_watch_t *w = &inst->au_watch[t][i];
            const au_sample_t *s = NULL;
            double pos = 0, step = 0, lo = 0, hi = 0;
            int loop = 0;
            if (i < AU_VOICES) {
                const au_voice_t *v = &at->v[i];
                if (inst->tracks[t].pad_mode == PAD_MODE_AUDIO && v->active && v->smp && !v->smp->pcm) {
                    s = v->smp; pos = v->pos; step = v->step; lo = v->lo; hi = v->hi; loop = v->loop || v->mode_loop;
                }
            }
            __atomic_store_n(&w->pos, (uint32_t)(pos < 0 ? 0 : pos), __ATOMIC_RELAXED);
            __atomic_store_n(&w->lo, (uint32_t)lo, __ATOMIC_RELAXED);
            __atomic_store_n(&w->hi, (uint32_t)hi, __ATOMIC_RELAXED);
            __atomic_store_n(&w->speed, (int32_t)(step * 256.0), __ATOMIC_RELAXED);
            __atomic_store_n(&w->loop, (uint8_t)loop, __ATOMIC_RELAXED);
            __atomic_store_n(&w->smp, (const void *)s, __ATOMIC_RELEASE);
        }
    }
    for (t = 0; t < NUM_TRACKS; t++)
        for (i = 0; i < NUM_CLIPS; i++) {
            const au_clip_t *cl = &inst->au_clip[t][i];
            au_clipw_t *w = &inst->au_clipw[t][i];
            const au_sample_t *s = (cl->smp && !cl->smp->pcm) ? cl->smp : NULL;
            uint32_t rs = 0, re = 0;
            int l, n = 0;
            if (s) au_range(cl, s, &rs, &re);
            /* a Slice clip's chops start on their own, so each is pinned; a
             * Loop clip on Vintage moves through the sample as Free does */
            int chops = s && cl->mode == AU_MODE_SLICE;
            if (chops) {
                n = au_count(cl);
                for (l = 0; l < n; l++) {
                    uint32_t a = 0, b = 0;
                    if (!au_slice_range(cl, s, l, &a, &b)) a = b = 0;
                    __atomic_store_n(&w->sa[l], a, __ATOMIC_RELAXED);
                    __atomic_store_n(&w->sb[l], b, __ATOMIC_RELAXED);
                }
            }
            __atomic_store_n(&w->rs, rs, __ATOMIC_RELAXED);
            __atomic_store_n(&w->re, re, __ATOMIC_RELAXED);
            __atomic_store_n(&w->mode, (uint8_t)(chops ? AU_MODE_SLICE : 0), __ATOMIC_RELAXED);
            __atomic_store_n(&w->n, (uint8_t)n, __ATOMIC_RELAXED);
            __atomic_store_n(&w->smp, (const void *)s, __ATOMIC_RELEASE);
        }
    __atomic_store_n(&inst->au_block, inst->au_block + 1, __ATOMIC_RELEASE);
}

/* x into [0, L). */
static double au_wrap(double x, double L) {
    while (x >= L) x -= L;
    while (x < 0) x += L;
    return x;
}

/* Every chop voice (not the loop's) of track `at` fades out (Sync stopped). */
static void au_release_chops(au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++) if (at->v[i].active && !at->v[i].mode_loop) au_voice_release(&at->v[i], 64);
}

/* Vintage (Josh, 2026-10-29: "make it as fine as possible and call it
 * "vintage" or something" — "without timestretch - gaps are totally expected
 * by users"): Start..End cut on the clock's own grid, one piece a tick (1/384
 * note), piece j on tick j of the sample's own Bars, Nudge on top; in Revrs
 * the pieces run from End back, each backwards. A piece plays at the clip's
 * pitch, so a slower tempo leaves a gap after each and a faster one cuts each
 * short; at the loop's own tempo they join (au_range_on) and it plays as Free
 * does. The user's chops play no part (Josh: "chops should just be completely
 * invisible in loop mode"). `tick` is the clip counter after this block's
 * ticks: the last one played is tick - 1, and what is left in the clock's
 * accumulator is how far past it the block ends. */
#define AU_VINTAGE_PER_BLOCK 16
#define AU_VINTAGE_OVER      8      /* frames */
/* the least whole number >= x (no libm here) */
static long au_ceil(double x) { long i = (long)x; return (double)i < x ? i + 1 : i; }
static void au_sync_block(seq8_instance_t *inst, int t, int c, int32_t tick, uint32_t len_ticks, double fpt, int frames) {
    au_clip_t *cl = &inst->au_clip[t][c];
    const au_sample_t *s = cl->smp;
    uint32_t rs, re;
    if (!s || !len_ticks || fpt <= 0) return;
    au_range(cl, s, &rs, &re);
    if (re <= rs) return;
    double L = (double)len_ticks, span = (double)frames / fpt, past = 0.0;
    double P = au_span_ticks(cl, s, rs, re), R = (double)(re - rs);
    if (P <= 0) return;
    if (!inst->follow_solo && !inst->clock_follow_on && inst->tick_delta)
        past = (double)inst->tick_accum / (double)inst->tick_delta * (double)frames / fpt;
    double end = au_wrap((double)tick - 1.0 + past, L), start = end - span;
    double nud = (double)cl->nudge_ms * 44.1 / fpt;
    long G = au_ceil(P - 1e-9);
    /* the pieces whose tick falls in this block, in the order they sound */
    long pj[AU_VINTAGE_PER_BLOCK];
    double pd[AU_VINTAGE_PER_BLOCK];
    int m = 0, q, i, k;
    for (q = -1; q <= 1; q++) {
        double lo = start - nud + q * L;
        long j;
        for (j = au_ceil(lo - 1e-9); (double)j < lo + span && m < AU_VINTAGE_PER_BLOCK; j++) {
            if (j < 0 || j >= G) continue;
            double T = (double)j + nud;
            if (T >= L || T < -L) continue;             /* past the clip's end: the clip comes round first */
            double d = au_wrap(T - start, L);
            if (d >= span) continue;
            for (k = m; k > 0 && pd[k - 1] > d; k--) { pd[k] = pd[k - 1]; pj[k] = pj[k - 1]; }
            pd[k] = d; pj[k] = j; m++;
        }
    }
    for (i = 0; i < m; i++) {
        double x0 = R * (double)pj[i] / P, x1 = R * (double)(pj[i] + 1) / P;
        if (x1 > R) x1 = R;
        /* each piece runs a few frames into the next, so the rounding of
         * its start against the block never ends it a frame early */
        x1 += AU_VINTAGE_OVER;
        if (x1 > R) x1 = R;
        uint32_t a = cl->revrs ? re - (uint32_t)x1 : rs + (uint32_t)x0;
        uint32_t b = cl->revrs ? re - (uint32_t)x0 : rs + (uint32_t)x1;
        uint32_t off = (uint32_t)(pd[i] * fpt);
        au_range_on(inst, t, c, AU_SLICE_NONE, a, b, 1.0f, off >= (uint32_t)frames ? (uint32_t)frames - 1 : off, 1);
    }
}

/* Per block, after the sequencer: the loader's answers, each Audio track's
 * Loop voice following its clip, every voice rendered and fed to the track's
 * own chain slot. */
static void au_render(seq8_instance_t *inst, int frames) {
    int t, i, f;
    if (frames <= 0 || frames > 128) return;
    au_apply_results(inst);
    for (t = 0; t < NUM_TRACKS; t++) {
        seq8_track_t *tr = &inst->tracks[t];
        au_track_t *at = &inst->au_trk[t];
        int any = 0;
        if (tr->pad_mode != PAD_MODE_AUDIO) {
            for (i = 0; i < AU_VOICES; i++) at->v[i].active = 0;
            continue;
        }
        /* Loop mode: the voice follows the clip — starts with it, restarts on
         * each pass, stops with it. Lazy chop owns the track while it runs. */
        if (inst->au_lazy_track != t) {
            int c = tr->active_clip;
            au_clip_t *cl = &inst->au_clip[t][c];
            clip_t *lc = &tr->clips[c];
            au_voice_t *lv = au_loop_voice(at);
            /* Mute does not stop the loop: it plays on silently, like a
             * muted bus, so unmuting picks it up in place (below). */
            int run = inst->playing && tr->clip_playing && cl->mode == AU_MODE_LOOP && cl->smp;
            int sync = run && cl->tempo == AU_TEMPO_VINTAGE;
            if (run) {
                uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
                int32_t tick = (int32_t)(((int)tr->current_step - (int)lc->loop_start) * (int32_t)tps
                                         + (int32_t)tr->tick_in_step);
                /* A Loop clip always plays forwards in time: with Dir set
                 * Backward / Pingpong the step counter runs back, and reading
                 * it would restart the loop every block. Its place in the loop
                 * then comes from the master clock instead. */
                if (lc->playback_dir != 0) {
                    uint32_t lt = (uint32_t)(lc->length ? lc->length : 1) * tps;
                    uint32_t el = (uint32_t)inst->global_tick * (uint32_t)TICKS_PER_STEP + inst->master_tick_in_step;
                    tick = (int32_t)(el % lt);
                }
                double bpm = tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0;
                double fpt = 44100.0 * 60.0 / (bpm * PPQN);
                double ratio = au_tune(cl->pitch, cl->detune) * (double)cl->smp->rate / 44100.0;
                /* Tempo Pitch: retuned so Start..End fills the clip (Josh,
                 * 2026-10-28: ""Pitch" which would retune the loop to fill x
                 * bars") — the clip's Pitch knob gives way to it */
                double fill = 0.0;
                if (cl->tempo == AU_TEMPO_PITCH) {
                    /* x = the sample's own Bars, as Sync's (Josh, 2026-10-28:
                     * "does pitch sync'ing not respect the set bars?"); the
                     * clip's length only says when it comes round */
                    uint32_t frs, fre;
                    au_range(cl, cl->smp, &frs, &fre);
                    double P = au_span_ticks(cl, cl->smp, frs, fre);
                    if (P > 0) fill = (double)(fre - frs) / (P * fpt);
                    if (fill > 0) ratio = fill;
                }
                /* When this block PLAYED a tick, the clip counters have
                 * already moved past it (render_block advances them after
                 * each tick): the clip is at tick - 1, at this block's first
                 * frame. Read as-is, a loop launched on a tick began one tick
                 * into the sample and cut its first hit (measured on the
                 * device: 230 frames at 120 bpm). A block with no tick yet
                 * (the transport's first) is at `tick`. */
                int ticked = (uint64_t)inst->arp_master_tick != inst->au_tick0;
                double played = (ticked && tick > 0) ? (double)(tick - 1) : (double)tick;
                if (tick < 0) tick = 0;
                if (sync) {
                    /* Vintage: the sample cut on the clock (au_sync_block). */
                    if (lv) au_voice_release(lv, 64);
                    if (!at->sync_on || at->loop_clip != c) { at->sync_on = 1; at->sync_live = 0; at->loop_clip = (uint8_t)c; }
                    if (ticked) at->sync_live = 1;          /* the transport's first tick has played */
                    if (at->sync_live) au_sync_block(inst, t, c, tick, (uint32_t)lc->length * tps, fpt, frames);
                } else {
                    if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                    /* Pitch follows a tempo change at once, not at the wrap */
                    if (lv && fill > 0) lv->step = cl->revrs ? -fill : fill;
                    if (!lv || at->loop_clip != c || tick < at->last_tick) {
                        /* Nudge: the sample starts that much later (+) or earlier
                         * (-) against the bar. */
                        double off = fill > 0 ? (played * fpt - (double)cl->nudge_ms * 44.1) * fill
                                              : played * fpt * ratio - (double)cl->nudge_ms * (double)cl->smp->rate / 1000.0;
                        au_loop_start(inst, t, c, off, fill);
                    }
                }
                at->last_tick = tick;
            } else {
                if (lv) au_voice_release(lv, 64);
                if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                at->last_tick = -1;
            }
        }
        for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) { any = 1; break; }
        if (!any) continue;
        {
            int32_t acc[256];
            int16_t out[256];
            /* Mute / solo silence the track's output, as on a bus: the
             * voices keep running, the level ramps over 64 frames. */
            int mtarget = effective_mute(inst, t) ? 0 : 64;
            memset(acc, 0, sizeof acc);
            for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) inst->au_underruns += au_voice_render(&at->v[i], acc, frames);
            for (f = 0; f < frames; f++) {
                int32_t l = acc[f * 2], r = acc[f * 2 + 1];
                if (at->mgain != mtarget) at->mgain = (uint8_t)(at->mgain + (mtarget > at->mgain ? 1 : -1));
                if (at->mgain < 64) { l = l * at->mgain / 64; r = r * at->mgain / 64; }
                out[f * 2]     = (int16_t)(l > 32767 ? 32767 : l < -32768 ? -32768 : l);
                out[f * 2 + 1] = (int16_t)(r > 32767 ? 32767 : r < -32768 ? -32768 : r);
            }
            /* Only into a Schwung slot of its own: a track routed anywhere
             * else has no slot to play through (its `slot` is stale). */
            if (g_ext && g_ext->slot_audio_feed && tr->pfx.route == ROUTE_SCHWUNG)
                g_ext->slot_audio_feed((int)tr->pfx.slot, out, (uint32_t)frames);
        }
    }
    au_watch_publish(inst);
    /* Lazy chop: its voice ran to the end -> the chop is done. */
    if (inst->au_lazy_track >= 0 && inst->au_lazy_state == AU_LAZY_RUN) {
        au_track_t *at = &inst->au_trk[inst->au_lazy_track];
        int live = 0;
        for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) { live = 1; inst->au_lazy_pos = (uint32_t)at->v[i].pos; }
        if (!live) au_lazy_finish(inst);
    }
}

/* "C ..." -> clip index, advancing *pp past it. -1 = bad. */
static int au_arg_clip(const char **pp) {
    const char *p = *pp;
    while (*p == ' ') p++;
    if (*p < '0' || *p > '9') return -1;
    int c = my_atoi(p);
    while (*p >= '0' && *p <= '9') p++;
    *pp = p;
    return (c >= 0 && c < NUM_CLIPS) ? c : -1;
}

/* One slice field `w` of sl set to v. 0 = not a field. */
static int au_slice_field(au_slice_t *sl, const char *w, int v) {
    if (!strcmp(w, "pitch"))      sl->pitch = (int8_t)clamp_i(v, -24, 24);
    else if (!strcmp(w, "detune")) sl->detune = (int8_t)clamp_i(v, -50, 50);
    else if (!strcmp(w, "gain"))  sl->gain_db = (int8_t)clamp_i(v, -40, 12);
    else if (!strcmp(w, "rev"))   sl->rev = (uint8_t)(v ? 1 : 0);
    else if (!strcmp(w, "play"))  sl->play = (uint8_t)clamp_i(v, 0, 2);
    else if (!strcmp(w, "atk"))   sl->attack_ms = (uint16_t)clamp_i(v, 0, 2000);
    else if (!strcmp(w, "dec"))   sl->decay_ms = (uint16_t)clamp_i(v, 0, 5000);
    else return 0;
    return 1;
}

/* Clip (t,c)'s steps go, as a melodic clear does, keeping its length,
 * resolution and effects. One undo step. */
static void au_wipe_steps(seq8_instance_t *inst, int t, int c) {
    seq8_track_t *tr = &inst->tracks[t];
    undo_begin_single(inst, t, c);
    if (c == tr->active_clip) silence_track_notes_v2(inst, tr);
    clip_wipe_notes(&tr->clips[c]);
    clip_note_finalize(inst, &tr->clips[c], t, c);
}

/* Clip (t,c)'s steps follow a hand-set edit, so the sequence keeps playing
 * the same pieces of the sample: a slice inserted at `at` (dir +1: slices
 * from `at` move up one; one pushed past the last slice goes) or slice `at`
 * removed (dir -1: its steps merge into at-1's, later ones move down). */
static void au_renumber_steps(seq8_instance_t *inst, int t, int c, int at, int dir) {
    seq8_track_t *tr = &inst->tracks[t];
    clip_t *cl = &tr->clips[c];
    int i, any = 0;
    for (i = 0; i < cl->note_count; i++) {
        note_t *n = &cl->notes[i];
        int k = (int)n->pitch - AU_NOTE_BASE;
        if (!n->active || k < at) continue;
        if (dir > 0) {
            if (k + 1 >= AU_MAX_SLICES) n->active = 0;
            else n->pitch = (uint8_t)(n->pitch + 1);
        } else {
            n->pitch = (uint8_t)(n->pitch - 1);
        }
        any = 1;
    }
    if (!any) return;
    if (c == tr->active_clip) silence_track_notes_v2(inst, tr);
    clip_note_finalize(inst, cl, t, c);
}

/* Even's slices become the hand set: N equal slices of Start..End, each end
 * home, the sound settings staying with their numbers; Even Off. Even is a
 * way to chop, not a lock (Josh, 2026-10-28: "even shouldn't lock the slices
 * - it's just a way to chop them"): it is baked by tN_au_even_bake and by
 * the first hand edit made while it is on. */
static void au_even_bake(au_clip_t *cl) {
    uint32_t rs, re;
    int k, n = cl->even;
    if (!n || !cl->smp) return;
    au_range(cl, cl->smp, &rs, &re);
    if (re <= rs) return;
    for (k = 0; k < n; k++) {
        cl->sl[k].start = rs + (uint32_t)((uint64_t)(re - rs) * (uint32_t)k / (uint32_t)n);
        cl->sl[k].end = 0;
    }
    cl->nslices = (uint8_t)n;
    cl->even = 0;
}

/* One step per slice, where the slice sits in the sample, so the clip plays
 * the sample back as it was — now as slices. The clip's steps are replaced; a
 * step holds one slice (a later slice landing on a taken step is left out).
 * One undo step. 0 = nothing done (no sample, recording). */
/* >Seq (Josh, 2026-10-28): each chop on the step of its place in the
 * sample's own Bars. `grow` (a clip whose length was never set by hand): the
 * clip becomes the sample's length, coarser where 256 steps will not hold it;
 * else its length stays and the chops past it wait out of bounds. */
static int au_chop_steps(seq8_instance_t *inst, int tidx, int c, int grow) {
    seq8_track_t *tr = &inst->tracks[tidx];
    au_clip_t *acl = &inst->au_clip[tidx][c];
    clip_t *cl = &tr->clips[c];
    int l;
    if (tr->recording || !acl->smp) return 0;
    const au_sample_t *s = acl->smp;
    uint32_t rs, re;
    au_range(acl, s, &rs, &re);
    if (re <= rs) return 0;
    undo_begin_single(inst, tidx, c);
    if (c == tr->active_clip) silence_track_notes_v2(inst, tr);
    clip_wipe_notes(cl);
    if (grow) {
        double bars = au_span_ticks(acl, s, rs, re) / (PPQN * 4.0);
        int nb = (int)bars;
        if ((double)nb < bars - 1e-6) nb++;
        au_clip_set_bars(inst, tidx, c, nb < 1 ? 1 : nb);
    }
    {
        uint32_t tps = cl->ticks_per_step ? cl->ticks_per_step : TICKS_PER_STEP;
        double P = au_span_ticks(acl, s, rs, re);
        uint32_t max_ticks = (uint32_t)SEQ_STEPS * tps;
        int32_t last_step = -1;
        int n = au_count(acl);
        for (l = 0; l < n; l++) {
            uint32_t a = 0, b = 0;
            if (!au_slice_range(acl, s, l, &a, &b) || a < rs || a >= re) continue;
            /* rounded: a chop a frame short of its step (5512 of 5512.5) is ON
             * that step, not on the one before it, where it was left out */
            uint32_t tick = (uint32_t)((double)(a - rs) * P / (double)(re - rs) + 0.5);
            uint32_t gate = (uint32_t)((double)(b - a) * P / (double)(re - rs) + 0.5);
            if (tick + tps / 2 >= max_ticks) break;      /* past what a clip can hold */
            if ((int32_t)(tick / tps) == last_step) continue;
            last_step = (int32_t)(tick / tps);
            if (gate < 1) gate = 1;
            clip_insert_note(cl, tick, (uint16_t)(gate > 65535 ? 65535 : gate),
                             (uint8_t)(AU_NOTE_BASE + l), (uint8_t)SEQ_VEL);
        }
    }
    clip_note_finalize(inst, cl, tidx, c);
    return 1;
}

/* Clip c has no steps at all. */
static int au_clip_stepless(const clip_t *cl) {
    int i;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active) return 0;
    return 1;
}

static int sp_track_audio(sp_ctx_t *cx) {
    seq8_instance_t *inst = cx->inst;
    const char *val = cx->val ? cx->val : "";
    int tidx = cx->tidx;
    seq8_track_t *tr = cx->tr;
    const char *sub = cx->sub;
    const char *p = val;
    int c, l;
    char w[16];

    if (strncmp(sub, "au_", 3)) return 0;
    sub += 3;

    if (!strcmp(sub, "pick")) {
        au_req_t r;
        c = au_arg_clip(&p);
        if (c < 0 || *p != '|' || !p[1]) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        memset(&r, 0, sizeof r);
        r.kind = AU_REQ_PICK;
        r.track = (uint8_t)tidx; r.clip = (uint8_t)c;
        snprintf(r.path, sizeof r.path, "%s", p + 1);
        au_samples_dir(inst, r.dir, sizeof r.dir);
        if (!r.dir[0]) { cl->state = 3; cl->err = AU_ERR_COPY; return 1; }
        r.gen = ++cl->gen;
        cl->state = 1;
        cl->name[0] = '\0';                        /* a pick: the result names it */
        cl->err = 0;
        au_req_push(inst, &r);
        return 1;
    }

    if (!strcmp(sub, "clear")) {
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        if (cl->smp) au_track_kill(inst, tidx, cl->smp);   /* NULL would kill every voice */
        au_drop(inst, cl->smp);
        cl->smp = NULL;
        cl->name[0] = '\0';
        cl->state = 0;
        cl->gen++;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strncmp(sub, "set_", 4)) {
        int v;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        snprintf(w, sizeof w, "%s", sub + 4);
        v = my_atoi(p);
        if (!strcmp(w, "mode")) {
            v = clamp_i(v, 0, 1);
            if (v == AU_MODE_SLICE && cl->smp &&
                (uint64_t)cl->smp->frames > (uint64_t)cl->smp->rate * AU_SLICE_MAX_SEC) {
                cl->err = AU_ERR_LONG;             /* the UI says "over 4 minutes" */
                return 1;
            }
            if (v != cl->mode) au_track_kill(inst, tidx, NULL);
            /* Loop -> Slice on a clip with no steps: the chops go onto them in
             * order, so it sounds as the loop did until they are moved (Josh,
             * 2026-10-28: the in-order sequence; the joins make it seamless). */
            if (v == AU_MODE_SLICE && cl->mode != AU_MODE_SLICE && au_clip_stepless(&tr->clips[c])) {
                cl->mode = (uint8_t)v;
                au_chop_steps(inst, tidx, c, 0);
            }
            cl->mode = (uint8_t)v;
        } else if (!strcmp(w, "even")) {
            /* Even: an override over the hand set, which stays as it is
             * (Josh: "it'd be nice if even chops are kind of like overrides
             * so that manual chop points are preserved") */
            cl->even = (uint8_t)(v < 2 ? 0 : clamp_i(v, 2, AU_MAX_SLICES));
        } else if (!strcmp(w, "start") || !strcmp(w, "end")) {
            /* frames; at least AU_GAP apart. Unloaded, taken as given. */
            uint32_t fr = cl->smp ? cl->smp->frames : 0, rs, re;
            if (v < 0) v = 0;
            cl->mig_rs = cl->mig_re = 0;
            if (!fr) {
                if (w[0] == 's') cl->rstart = (uint32_t)v; else cl->rend = (uint32_t)v;
            } else {
                au_range(cl, cl->smp, &rs, &re);
                if (fr <= AU_GAP) return 1;
                if (w[0] == 's') {
                    cl->rstart = (uint32_t)clamp_i(v, 0, (int)re - AU_GAP);
                } else {
                    if (v == 0) v = (int)fr;
                    v = clamp_i(v, (int)rs + AU_GAP, (int)fr);
                    cl->rend = (uint32_t)v >= fr ? 0 : (uint32_t)v;
                }
            }
        } else if (!strcmp(w, "pitch")) {
            cl->pitch = (int8_t)clamp_i(v, -24, 24);
        } else if (!strcmp(w, "detune")) {
            cl->detune = (int8_t)clamp_i(v, -50, 50);
        } else if (!strcmp(w, "gain")) {
            cl->gain_db = (int8_t)clamp_i(v, -40, 12);
        } else if (!strcmp(w, "revrs")) {
            cl->revrs = (uint8_t)(v ? 1 : 0);
            inst->au_trk[tidx].last_tick = -1;     /* the loop restarts from its new end */
            if (c == tr->active_clip) au_track_kill(inst, tidx, NULL);
        } else if (!strcmp(w, "tempo")) {
            v = AU_TEMPO_FIX(clamp_i(v, AU_TEMPO_FREE, AU_TEMPO_PITCH));
            if (v != cl->tempo && c == tr->active_clip) au_track_kill(inst, tidx, NULL);
            cl->tempo = (uint8_t)v;
        } else if (!strcmp(w, "nudge")) {
            cl->nudge_ms = (int16_t)clamp_i(v, -500, 500);
        } else if (!strcmp(w, "bars")) {
            /* the sample's own length in bars (the CLIP bank's K2) */
            cl->bars = (uint8_t)clamp_i(v, 1, AU_BARS_MAX);
        } else if (!strcmp(w, "len_bars")) {
            au_clip_set_bars(inst, tidx, c, clamp_i(v, 1, 64));
            return 1;
        } else {
            return 1;
        }
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strncmp(sub, "slice_", 6)) {
        int v;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        while (*p == ' ') p++;
        l = my_atoi(p);
        while (*p && *p != ' ') p++;
        if (l < 0 || l >= AU_MAX_SLICES) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        au_slice_t *sl = &cl->sl[l];
        snprintf(w, sizeof w, "%s", sub + 6);
        v = my_atoi(p);
        if (!strcmp(w, "start")) {
            /* a hand-set start: between its neighbours' starts, before its
             * own pinned end. Even, if on, becomes the hand set first. */
            if (!cl->smp) return 1;
            au_even_bake(cl);
            if (l >= cl->nslices) return 1;
            int lo = l > 0 ? (int)cl->sl[l - 1].start + AU_GAP : 0;
            int hi = l + 1 < cl->nslices ? (int)cl->sl[l + 1].start - AU_GAP : (int)cl->smp->frames - AU_GAP;
            if (sl->end && (int)sl->end - AU_GAP < hi) hi = (int)sl->end - AU_GAP;
            if (hi < lo) return 1;
            sl->start = (uint32_t)clamp_i(v, lo, hi);
        } else if (!strcmp(w, "end")) {
            /* a hand-set end: 0 (or the home frame itself) = home; else
             * pinned, past its start, anywhere up to the sample's end */
            if (!cl->smp) return 1;
            au_even_bake(cl);
            if (l >= cl->nslices) return 1;
            uint32_t home = au_home_end(cl, cl->smp, l);
            if (v <= 0 || (uint32_t)v == home) sl->end = 0;
            else sl->end = (uint32_t)clamp_i(v, (int)sl->start + AU_GAP, (int)cl->smp->frames);
        } else if (!au_slice_field(sl, w, v)) {
            return 1;
        }
        au_mark(inst, tidx, c);
        return 1;
    }

    /* ALL SLICES: one value into every slice (Josh, 2026-10-27: "it'd be nice
     * to be able to adjust settings for all slices at once" · "set all."). */
    if (!strncmp(sub, "all_", 4)) {
        int v;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        snprintf(w, sizeof w, "%s", sub + 4);
        v = my_atoi(p);
        for (l = 0; l < AU_MAX_SLICES; l++)
            if (!au_slice_field(&cl->sl[l], w, v)) return 1;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "mark_add")) {
        /* Splits the hand-set slice the frame falls in; the new slice has the
         * default sound, later slices keep theirs (and their steps). The
         * split slice's pinned end, if any, passes to the new one. */
        int f, k;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        f = my_atoi(p);
        if (!cl->smp) return 1;
        au_even_bake(cl);
        if (cl->nslices >= AU_MAX_SLICES || f < 0 || (uint32_t)f >= cl->smp->frames) return 1;
        for (k = 0; k < cl->nslices; k++) {
            int d = (int)cl->sl[k].start - f;
            if (d > -AU_GAP && d < AU_GAP) return 1;       /* too close to a marker */
        }
        for (k = 0; k < cl->nslices && cl->sl[k].start < (uint32_t)f; k++) {}
        /* k = the new slice's number: after the slice it splits */
        memmove(&cl->sl[k + 1], &cl->sl[k], sizeof cl->sl[0] * (size_t)(AU_MAX_SLICES - 1 - k));
        memset(&cl->sl[k], 0, sizeof cl->sl[k]);
        cl->sl[k].start = (uint32_t)f;
        if (k > 0) {
            cl->sl[k].end = cl->sl[k - 1].end > (uint32_t)f + AU_GAP ? cl->sl[k - 1].end : 0;
            cl->sl[k - 1].end = 0;
        }
        cl->nslices++;
        au_renumber_steps(inst, tidx, c, k, 1);
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "mark_del")) {
        /* Slice L's start goes: L merges into L-1, which takes L's end when
         * its own was home. Slice 1's start stays. */
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        l = my_atoi(p);
        au_even_bake(cl);
        if (l < 1 || l >= cl->nslices) return 1;
        if (!cl->sl[l - 1].end) cl->sl[l - 1].end = cl->sl[l].end;
        memmove(&cl->sl[l], &cl->sl[l + 1], sizeof cl->sl[0] * (size_t)(AU_MAX_SLICES - 1 - l));
        memset(&cl->sl[AU_MAX_SLICES - 1], 0, sizeof cl->sl[0]);
        cl->nslices--;
        au_renumber_steps(inst, tidx, c, l, -1);
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "even_bake")) {
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_even_bake(&inst->au_clip[tidx][c]);
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "manual")) {
        /* a fresh hand set: one slice, Start..End; Even Off. The UI asked
         * "Replace chops?" first. */
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        uint32_t rs = cl->rstart, re;
        if (cl->smp) au_range(cl, cl->smp, &rs, &re);
        for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
        cl->sl[0].start = rs;
        cl->nslices = 1;
        cl->even = 0;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "chop")) {
        c = au_arg_clip(&p);                       /* "C [grow]" */
        if (c >= 0) au_chop_steps(inst, tidx, c, my_atoi(p) ? 1 : 0);
        return 1;
    }

    if (!strcmp(sub, "wipe")) {
        c = au_arg_clip(&p);
        if (c < 0 || tr->recording) return 1;
        au_wipe_steps(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "layout")) {                 /* PAD MODE Layout: 0 4 Rows, 1 16 Pads */
        inst->au_trk[tidx].layout = (uint8_t)(my_atoi(p) ? 1 : 0);
        inst->state_dirty = 1;
        return 1;
    }

    if (!strcmp(sub, "lazy")) {
        int on;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        on = my_atoi(p);
        if (!on) { if (inst->au_lazy_track == tidx) au_lazy_finish(inst); return 1; }
        au_clip_t *cl = &inst->au_clip[tidx][c];
        if (!cl->smp || inst->au_lazy_track >= 0) return 1;
        if ((uint64_t)cl->smp->frames > (uint64_t)cl->smp->rate * AU_SLICE_MAX_SEC) { cl->err = AU_ERR_LONG; return 1; }
        au_track_kill(inst, tidx, NULL);
        /* the hand set is put aside until the new chops are kept */
        memcpy(inst->au_lazy_bak, cl->sl, sizeof cl->sl);
        inst->au_lazy_bak_n = cl->nslices;
        inst->au_lazy_bak_even = cl->even;
        inst->au_lazy_track = (int8_t)tidx;
        inst->au_lazy_clip = (int8_t)c;
        inst->au_lazy_n = 0;
        inst->au_lazy_state = AU_LAZY_ARMED;
        inst->au_lazy_pos = cl->rstart;
        return 1;
    }

    if (!strcmp(sub, "lazy_tap")) {
        if (inst->au_lazy_track != tidx) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][inst->au_lazy_clip];
        au_track_t *at = &inst->au_trk[tidx];
        if (!cl->smp) return 1;
        if (inst->au_lazy_state == AU_LAZY_ARMED) {
            /* the first tap: slice 1 at Start, and the sample plays once,
             * forwards, Start..End */
            uint32_t rs, re;
            uint8_t rv = cl->revrs;
            au_range(cl, cl->smp, &rs, &re);
            cl->revrs = 0;
            au_loop_start(inst, tidx, inst->au_lazy_clip, 0, 0);
            cl->revrs = rv;
            au_voice_t *lv = au_loop_voice(at);
            if (!lv) return 1;
            lv->mode_loop = 0; lv->loop = 0;
            for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
            cl->sl[0].start = rs;
            cl->nslices = 1;
            cl->even = 0;
            inst->au_lazy_n = 1;
            inst->au_lazy_pos = rs;
            inst->au_lazy_state = AU_LAZY_RUN;
            au_mark(inst, tidx, inst->au_lazy_clip);
            return 1;
        }
        if (inst->au_lazy_state != AU_LAZY_RUN || inst->au_lazy_n >= AU_MAX_SLICES) return 1;
        for (l = 0; l < AU_VOICES; l++) {
            if (!at->v[l].active || at->v[l].rel_len) continue;
            uint32_t pos = (uint32_t)at->v[l].pos;
            /* keep starts ascending */
            if (pos < cl->sl[inst->au_lazy_n - 1].start + AU_GAP) return 1;
            cl->sl[inst->au_lazy_n].start = pos;
            cl->sl[inst->au_lazy_n].end = 0;
            inst->au_lazy_n++;
            cl->nslices = inst->au_lazy_n;
            au_mark(inst, tidx, inst->au_lazy_clip);
            return 1;
        }
        return 1;
    }

    if (!strcmp(sub, "lazy_keep")) {
        if (inst->au_lazy_track != tidx || inst->au_lazy_state != AU_LAZY_ENDED) return 1;
        int c2 = inst->au_lazy_clip;
        au_lazy_keep(inst, my_atoi(p) ? 1 : 0);
        au_mark(inst, tidx, c2);
        return 1;
    }

    return 1;   /* the whole tN_au_ prefix is ours */
}

/* tN_au_* reads. Returns -1 when the key is not one of ours. */
static int au_get_param(seq8_instance_t *inst, const char *key, char *out, int out_len) {
    int t, c, l;
    if (key[0] != 't' || key[1] < '0' || key[1] > '7' || strncmp(key + 2, "_au_", 4)) return -1;
    t = key[1] - '0';
    const char *k = key + 6;
    if (!strcmp(k, "on")) return snprintf(out, out_len, "%d", inst->tracks[t].pad_mode == PAD_MODE_AUDIO);
    if (!strcmp(k, "dir")) {                      /* the project's samples/ (the chooser lists it) */
        char d[256];
        au_samples_dir(inst, d, sizeof d);
        return snprintf(out, out_len, "%s", d);
    }
    if (!strcmp(k, "stream")) {                   /* streaming, for the device check: "samples chunks reads underruns" */
        au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
        int n = 0, i;
        if (S) for (i = 0; i < AU_POOL_MAX; i++) if (__atomic_load_n(&S->smp[i], __ATOMIC_RELAXED)) n++;
        return snprintf(out, out_len, "%d %u %u %u", n, S ? __atomic_load_n(&S->loaded, __ATOMIC_RELAXED) : 0u,
                        S ? __atomic_load_n(&S->reads, __ATOMIC_RELAXED) : 0u, (unsigned)inst->au_underruns);
    }
    if (!strncmp(k, "info_", 5)) {
        /* "state err mode even nslices jump rstart rend pitch gain frames rate ch
         *  revrs nudge jmpq count detune tempo reach bars|name" -- rstart / rend in frames as they play
         *  (rend the real end, never 0) once loaded; reach: how far into Start..End a Free
         *  loop gets before its clip wraps, in frames (End - Start when it all plays); bars: the
         *  sample's own length in bars (0 not known yet) */
        c = my_atoi(k + 5);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        const au_sample_t *s = cl->smp;
        uint32_t rs = cl->rstart, re = cl->rend;
        if (s) au_range(cl, s, &rs, &re);
        uint32_t reach = re > rs ? re - rs : 0;
        if (s && cl->tempo == AU_TEMPO_FREE && reach) {
            /* as au_render plays it: the clip's ticks at the tempo, the
             * sample's rate and pitch, Nudge taken off */
            const clip_t *lc = &inst->tracks[t].clips[c];
            double bpm = inst->tracks[t].pfx.cached_bpm > 0 ? inst->tracks[t].pfx.cached_bpm : 120.0;
            uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
            double r = (double)lc->length * tps * (44100.0 * 60.0 / (bpm * PPQN))
                       * au_tune(cl->pitch, cl->detune) * (double)s->rate / 44100.0
                       - (double)cl->nudge_ms * (double)s->rate / 1000.0;
            if (r < 0) r = 0;
            if (r < (double)reach) reach = (uint32_t)r;
        } else if (s && (cl->tempo == AU_TEMPO_VINTAGE || cl->tempo == AU_TEMPO_PITCH) && reach) {
            /* Vintage and Pitch: what of the sample's own Bars (plus Nudge)
             * falls before the clip comes round */
            const clip_t *lc = &inst->tracks[t].clips[c];
            double bpm = inst->tracks[t].pfx.cached_bpm > 0 ? inst->tracks[t].pfx.cached_bpm : 120.0;
            uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
            double P = au_span_ticks(cl, s, rs, re), L = (double)lc->length * tps;
            double nud = (double)cl->nudge_ms * 44.1 / (44100.0 * 60.0 / (bpm * PPQN));
            if (P > 0) {
                double r = (L - nud) / P * (double)(re - rs);
                if (r < 0) r = 0;
                if (r < (double)reach) reach = (uint32_t)r;
            }
        }
        return snprintf(out, out_len, "%d %d %d %d %d %d %u %u %d %d %u %u %d %d %d %d %d %d %d %u %d|%s",
                        cl->state, cl->err, cl->mode, cl->even, cl->nslices, cl->jump,
                        (unsigned)rs, (unsigned)re, cl->pitch, cl->gain_db,
                        s ? (unsigned)s->frames : 0u, s ? (unsigned)s->rate : 0u, s ? s->ch : 0,
                        cl->revrs, cl->nudge_ms, cl->jmpq, au_count(cl), cl->detune, cl->tempo, (unsigned)reach, cl->bars, cl->name);
    }
    if (!strncmp(k, "sl_", 3)) {                  /* sl_C_L: "a b pinned pitch gain rev play atk dec detune" */
        const char *q = k + 3;
        c = my_atoi(q);
        q = strchr(q, '_');
        if (!q || c < 0 || c >= NUM_CLIPS) return -1;
        l = my_atoi(q + 1);
        if (l < 0 || l >= AU_MAX_SLICES) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        const au_slice_t *sl = &cl->sl[l];
        uint32_t a = 0, b = 0;
        if (cl->smp) au_slice_range(cl, cl->smp, l, &a, &b);
        return snprintf(out, out_len, "%u %u %d %d %d %d %d %d %d %d", (unsigned)a, (unsigned)b,
                        !cl->even && l < cl->nslices && sl->end ? 1 : 0,
                        sl->pitch, sl->gain_db, sl->rev, sl->play, sl->attack_ms, sl->decay_ms, sl->detune);
    }
    if (!strncmp(k, "all_", 4)) {                 /* ALL SLICES: "pitch gain rev atk dec play detune", "x" where slices differ */
        int f, n = 0;
        c = my_atoi(k + 4);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        int cnt = au_count(cl);
        out[0] = '\0';
        for (f = 0; f < 7; f++) {
            int v0 = 0, same = 1;
            for (l = 0; l < cnt; l++) {
                const au_slice_t *sl = &cl->sl[l];
                int v = f == 0 ? sl->pitch : f == 1 ? sl->gain_db : f == 2 ? sl->rev
                      : f == 3 ? sl->attack_ms : f == 4 ? sl->decay_ms : f == 5 ? sl->play : sl->detune;
                if (l == 0) v0 = v; else if (v != v0) { same = 0; break; }
            }
            if (same) n += snprintf(out + n, (size_t)(out_len - n), f ? " %d" : "%d", v0);
            else n += snprintf(out + n, (size_t)(out_len - n), f ? " x" : "x");
        }
        return n;
    }
    if (!strncmp(k, "marks_", 6)) {               /* every slice as it plays: "a b" pairs, frames */
        c = my_atoi(k + 6);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        int n = 0, cnt = au_count(cl);
        out[0] = '\0';
        if (!cl->smp || !cl->smp->frames) return 0;
        for (l = 0; l < cnt && n < out_len - 24; l++) {
            uint32_t a = 0, b = 0;
            if (!au_slice_range(cl, cl->smp, l, &a, &b)) a = b = 0;
            n += snprintf(out + n, (size_t)(out_len - n), l ? " %u %u" : "%u %u", (unsigned)a, (unsigned)b);
        }
        return n;
    }
    if (!strncmp(k, "peaks_", 6)) {               /* 128 columns, "min max" as two hex bytes each */
        static const char hx[] = "0123456789abcdef";
        c = my_atoi(k + 6);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_sample_t *s = inst->au_clip[t][c].smp;
        if (!s || out_len < AU_PEAKS * 4 + 1) { out[0] = '\0'; return 0; }
        for (l = 0; l < AU_PEAKS; l++) {
            uint8_t lo = (uint8_t)s->peaks[l][0], hi = (uint8_t)s->peaks[l][1];
            out[l * 4] = hx[lo >> 4]; out[l * 4 + 1] = hx[lo & 15];
            out[l * 4 + 2] = hx[hi >> 4]; out[l * 4 + 3] = hx[hi & 15];
        }
        out[AU_PEAKS * 4] = '\0';
        return AU_PEAKS * 4;
    }
    if (!strncmp(k, "wave_", 5)) {
        /* wave_C_A_B: frames A..B as 128 columns, like peaks_ (the zoomed
         * editor). Reads the AU_MIP summary where a column spans more than
         * one entry, the samples themselves below that: bounded work either
         * way (and at most 64 entries a column, spread across it). */
        static const char hx[] = "0123456789abcdef";
        const char *q = k + 5;
        long A, B;
        c = my_atoi(q);
        if (c < 0 || c >= NUM_CLIPS || !(q = strchr(q, '_'))) return -1;
        A = strtol(q + 1, NULL, 10);
        if (!(q = strchr(q + 1, '_'))) return -1;
        B = strtol(q + 1, NULL, 10);
        const au_sample_t *s = inst->au_clip[t][c].smp;
        if (!s || out_len < AU_PEAKS * 4 + 1 || A < 0 || B <= A) { out[0] = '\0'; return 0; }
        if ((uint64_t)B > s->frames) B = (long)s->frames;
        if (B <= A) { out[0] = '\0'; return 0; }
        for (l = 0; l < AU_PEAKS; l++) {
            uint32_t a = (uint32_t)(A + (int64_t)(B - A) * l / AU_PEAKS);
            uint32_t b = (uint32_t)(A + (int64_t)(B - A) * (l + 1) / AU_PEAKS);
            int lo = 0, hi = 0;
            if (b <= a) b = a + 1;
            if (s->mip && b - a >= 2 * AU_MIP) {
                uint32_t m0 = a / AU_MIP, m1 = (b - 1) / AU_MIP, m, st;
                if (m1 >= s->nmip) m1 = s->nmip - 1;
                st = (m1 - m0) / 64 + 1;
                for (m = m0; m <= m1; m += st) {
                    if (s->mip[m][0] < lo) lo = s->mip[m][0];
                    if (s->mip[m][1] > hi) hi = s->mip[m][1];
                }
            } else {
                uint32_t i, st = (b - a) / 256 + 1;
                for (i = a; i < b && i < s->frames; i += st) {
                    const int16_t *fr = au_at(s, i);
                    int v;
                    if (!fr) {                      /* streamed, not in: its summary entry */
                        if (s->mip && i / AU_MIP < s->nmip) {
                            if (s->mip[i / AU_MIP][0] * 256 < lo) lo = s->mip[i / AU_MIP][0] * 256;
                            if (s->mip[i / AU_MIP][1] * 256 > hi) hi = s->mip[i / AU_MIP][1] * 256;
                        }
                        continue;
                    }
                    v = au_mono_fr(fr, s->ch);
                    if (v < lo) lo = v;
                    if (v > hi) hi = v;
                }
                lo /= 256; hi /= 256;
            }
            uint8_t ulo = (uint8_t)(int8_t)lo, uhi = (uint8_t)(int8_t)hi;
            out[l * 4] = hx[ulo >> 4]; out[l * 4 + 1] = hx[ulo & 15];
            out[l * 4 + 2] = hx[uhi >> 4]; out[l * 4 + 3] = hx[uhi & 15];
        }
        out[AU_PEAKS * 4] = '\0';
        return AU_PEAKS * 4;
    }
    if (!strcmp(k, "pos")) {
        /* "<sounding 0|1> <frame> <slice | -1 loop>" */
        const au_track_t *at = &inst->au_trk[t];
        for (l = 0; l < AU_VOICES; l++) {
            const au_voice_t *v = &at->v[l];
            if (!v->active || v->rel_len || !v->smp) continue;
            return snprintf(out, out_len, "1 %u %d", (unsigned)(v->pos < 0 ? 0 : v->pos), v->mode_loop ? -1 : v->slice);
        }
        return snprintf(out, out_len, "0 0 -1");
    }
    if (!strcmp(k, "layout")) return snprintf(out, out_len, "%d", (int)inst->au_trk[t].layout);
    if (!strcmp(k, "lazy")) {                     /* "<state AU_LAZY_*> <slices> <frame>" */
        int on = inst->au_lazy_track == t;
        return snprintf(out, out_len, "%d %d %u", on ? inst->au_lazy_state : 0, on ? inst->au_lazy_n : 0,
                        on ? (unsigned)inst->au_lazy_pos : 0u);
    }
    return -1;
}
