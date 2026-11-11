/* FILE-SCOPE HANDLER for set_param()'s tN_au_* AUDIO keys, plus the audio
 * thread's per-block work (au_render) and get_param's tN_au_* reads -- part of
 * the seq8.c single translation unit; #included at FILE scope by
 * seq8_set_param.c, NOT a standalone TU. Engine: seq8_audio.c.
 *
 * An Audio track is pad_mode PAD_MODE_AUDIO (tN_convert_to_audio): each clip
 * its own sample. A Slicer is PAD_MODE_SLICER (tN_convert_to_slicer): one
 * sample + chops for the track, in the slot au_store[t][AU_SLC]; its clips
 * are melodic clips whose notes are chops (pitch AU_NOTE_BASE + chop).
 *
 * Keys (C = clip, L = chop, all 0-based). On a Slicer every C names its slot
 * (C = 16, AU_SLC, names it outright); on an Audio track C is the clip:
 *   tN_au_pick    "C|<abs path>"   copy the file into the project, load it (one undo
 *                                  step; a Slicer's: 16 even chops, the steps kept)
 *   tN_au_pick_join "C|<abs path>" the same, joining the undo step already taken
 *                                  (In place / Flatten: tN_au_undo, the reset, this)
 *   tN_au_undo    "C C ..."        one undo step over these clips (Flatten)
 *   tN_au_undo_slc ""              a Slicer's chop editor opened: one undo step
 *                                  for the visit (the slot + every clip's steps)
 *   tN_au_clear   "C"              no sample (one undo step; a Slicer's steps stay)
 *   tN_au_edit    "C op ow [a b]"  Trim (op 0) / Normalize (op 1); ow 1 overwrites
 *                                  the project's copy (no undo), 0 makes a new
 *                                  sample (one undo step). A Slicer's Trim takes
 *                                  frames a..b and chops the result 16 even
 *   tN_au_set_<field>   "C <v>"    Audio: start (frames) / pitch / detune / gain /
 *                                  bpm (the sample's own Tempo x10) / orig (Tempo =
 *                                  the project's) / revrs / nudge / rot (Shift,
 *                                  ticks) / sync (0 Warp, 1 Vintage, 2 Pitch).
 *                                  Slicer: pitch / detune / gain / revrs / bpm /
 *                                  sync (0 Off, 1 Pitch) / sens (Transient's) and
 *                                  two tools that WRITE the chops: even (N equal)
 *                                  and trans (1: one per hit at the Sens)
 *   tN_au_slice_<field> "C L <v>"  (a Slicer's) start / end (frames; end 0 = home)
 *                                  / pitch / detune / gain / rev / play (0 One,
 *                                  1 Gate) / atk / dec
 *                                  (a key per field: two fields written to one
 *                                  key in one frame would keep only the second)
 *   tN_au_all_<field>   "C <v>"    the same sound field of EVERY chop (ALL SLICES)
 *   tN_au_mark_add "C F"           a marker at frame F: splits the chop there
 *                                  (later chops, and every clip's steps, move up one)
 *   tN_au_mark_del "C L"           chop L's start goes: it merges into L-1 (not 0)
 *   tN_au_manual  "C"              the chops become one, the whole sample
 *   tN_au_even_bake / trans_bake "C"  kept for the hand-set code paths (both tools
 *                                  write their chops at once now)
 *   tN_au_chop    "C [grow]"       >Seq: clip C's steps, one per chop at its place
 *                                  (one undo); a Slicer's
 *   tN_au_wipe    "C"              clip C's steps go, the clip still playing (one
 *                                  undo) — the tests' and a remote's; the UI
 *                                  clears with tN_cC_clear
 *   tN_au_layout  "0|1"            a Slicer's PAD MODE Layout: 4 Rows / 16 Pads
 *   tN_au_cond    "0|1"            a Slicer follows the Conductor (off by default)
 *   tN_au_lazy    "C 1|0"          Lazy chop: 1 arms it (the chops put aside),
 *                                  0 stops it (Back)
 *   tN_au_lazy_tap ""              a tap: the first starts the sample at its start,
 *                                  each later one drops a marker at the playhead
 *   tN_au_lazy_keep "1|0"          after it ended: keep the new chops, or put the
 *                                  old ones back
 * Reads (au_get_param): on, dir, stream, progress_C, info_C, sl_C_L, all_C,
 * marks_C, peaks_C, wave_C_A_B, pos, warp, layout, cond, lazy.
 * The prefix is consumed whole (a known-or-not tN_au_ key never falls through
 * to the pfx catch-all). */

static void au_mark(seq8_instance_t *inst, int t, int c) {
    /* the Slicer's slot is every clip's: the remote UI hears it on the one playing */
    rui_mark(inst, t, c == AU_SLC ? (int)inst->tracks[t].active_clip : c);
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

/* Trim took `cut` frames off the front of a clip's file, now `frames` long:
 * its Start and its chops move back with the audio. A chop that now starts
 * past the end goes (it would stay lit and counted but play nothing), and an
 * end no longer past its start goes HOME (review). */
static void au_clip_shift(au_clip_t *cl, uint32_t cut, uint32_t frames) {
    int l;
    cl->rstart = cl->rstart > cut ? cl->rstart - cut : 0;
    if (frames && cl->rstart >= frames) cl->rstart = 0;
    for (l = 0; l < AU_MAX_SLICES; l++) {
        au_slice_t *sl = &cl->sl[l];
        if (!sl->start && !sl->end) continue;
        sl->start = sl->start > cut ? sl->start - cut : 0;
        if (sl->end) sl->end = sl->end > cut ? sl->end - cut : 0;       /* 0 = HOME */
        if (sl->end && sl->end <= sl->start) sl->end = 0;
    }
    if (frames) {
        int n = cl->nslices;
        for (l = 1; l < n; l++)                                         /* the hand set is ascending */
            if (cl->sl[l].start >= frames) { n = l; break; }
        for (l = n; l < cl->nslices; l++) memset(&cl->sl[l], 0, sizeof cl->sl[l]);
        cl->nslices = (uint8_t)(n < 1 ? 1 : n);
    }
}

static void au_even_bake(au_clip_t *cl);   /* below */

/* The loader's answers, once per block. A pick that lands sets a Loop clip's
 * length to the sample's, in whole bars at the tempo (at least one). */
static void au_apply_results(seq8_instance_t *inst) {
    au_drop_retry(inst);                        /* releases that found the ring full */
    for (;;) {
        uint32_t t = inst->au_res_tail, h = __atomic_load_n(&inst->au_res_head, __ATOMIC_ACQUIRE);
        if (t == h) return;
        au_res_t r = inst->au_res[t & (AU_RING - 1)];
        __atomic_store_n(&inst->au_res_tail, t + 1, __ATOMIC_RELEASE);
        if (r.track >= NUM_TRACKS || r.clip > AU_SLC) { au_drop(inst, r.smp); continue; }
        au_clip_t *cl = au_slot(inst, r.track, r.clip);
        if (r.gen != cl->gen) { au_drop(inst, r.smp); continue; }       /* superseded */
        if (r.edit && !r.smp) {
            /* a Trim / Normalize that failed: the clip keeps the sample it had */
            cl->state = cl->smp ? 2 : 3;
            cl->err = r.err;
            au_mark(inst, r.track, r.clip);
            continue;
        }
        /* a Slicer's sample: 4 minutes at most (Josh) — a longer one is
         * refused as it lands, the old one kept */
        if (r.smp && r.clip == AU_SLC &&
            (uint64_t)r.smp->frames > (uint64_t)r.smp->rate * AU_SLICE_MAX_SEC) {
            au_drop(inst, r.smp);
            if (!r.edit) { cl->name[0] = '\0'; }
            cl->state = cl->smp ? 2 : 3;
            cl->err = AU_ERR_LONG;
            au_mark(inst, r.track, r.clip);
            continue;
        }
        au_sample_t *old = cl->smp;
        if (old) { au_track_kill(inst, r.track, old); au_drop(inst, old); }
        cl->smp = r.smp;
        cl->err = r.err;
        cl->state = r.smp ? 2 : 3;
        if (r.smp) {
            int was_pick = !r.edit && (cl->name[0] == '\0' || strcmp(cl->name, r.name) != 0);
            if (r.edit) {
                /* Trim / Normalize: the same clip, its settings kept, its
                 * positions where the audio went — or, a Slicer's Trim, its
                 * chops 16 even over what is left (its steps stay) */
                au_clip_shift(cl, r.cut, r.smp->frames);
                if (r.rechop) {
                    int l;
                    for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
                    cl->rstart = cl->slen = 0;
                    cl->even = 16;
                    au_even_bake(cl);
                }
                if (r.ow && old) {
                    /* overwritten: every other clip on that file reloads it,
                     * its positions moved the same way */
                    int t2, c2;
                    for (t2 = 0; t2 < NUM_TRACKS; t2++)
                        for (c2 = 0; c2 <= AU_SLC; c2++) {
                            au_clip_t *o = au_slot(inst, t2, c2);
                            au_req_t q;
                            if (o == cl || o->smp != old) continue;
                            au_clip_shift(o, r.cut, r.smp->frames);
                            memset(&q, 0, sizeof q);
                            q.kind = AU_REQ_LOAD;
                            q.track = (uint8_t)t2; q.clip = (uint8_t)c2;
                            snprintf(q.path, sizeof q.path, "%s", o->name);
                            au_samples_dir(inst, q.dir, sizeof q.dir);
                            if (!q.dir[0]) continue;
                            q.gen = ++o->gen;
                            o->state = 1;
                            au_req_push(inst, &q);
                            au_mark(inst, t2, c2);
                        }
                }
            }
            snprintf(cl->name, sizeof cl->name, "%s", r.name);
            if (was_pick) {
                /* a new sample: the whole of it (frames of the old one mean
                 * nothing here). A Slicer's is cut into 16 even chops over
                 * the whole file, its steps left as they are — they play the
                 * new chops (Josh, 2026-11-02: "Yes"); an Audio clip has no
                 * chops. */
                int l;
                cl->rstart = cl->slen = 0;
                cl->nslices = 1;
                for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
                if (r.clip == AU_SLC) { cl->even = 16; au_even_bake(cl); }
            }
            au_trans_calc(cl);
            /* the sample's own Tempo: the loader's guess for a new sample, or
             * one a project never set */
            if ((was_pick || !cl->bpm10) && r.bpm10) cl->bpm10 = r.bpm10;
            if (was_pick && r.clip != AU_SLC) {
                /* a Loop clip as long as the sample, in whole bars at its Tempo */
                double bars = (double)r.smp->frames / (double)r.smp->rate * (cl->bpm10 ? cl->bpm10 / 10.0 : 120.0) / 240.0;
                int nb = (int)(bars + 0.5);
                /* up to 256 bars: the coarsest resolution (a bar a step) holds them
                 * (it stopped at 64, silently: review) */
                au_clip_set_bars(inst, r.track, r.clip, nb < 1 ? 1 : nb > SEQ_STEPS ? SEQ_STEPS : nb);
            }
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
                if (pad_mode_sampled(inst->tracks[t].pad_mode) && v->active && v->smp && !v->smp->pcm) {
                    s = v->smp; pos = v->pos; step = v->step; lo = v->lo; hi = v->hi; loop = v->loop || v->mode_loop;
                    if (v->whi > v->wlo && pos >= v->wlo && pos < v->whi) { lo = v->wlo; hi = v->whi; loop = 1; }
                }
            } else {
                /* the spare slot: Warp's stretcher, where it reads. W->cmd is
                 * read plainly here, on the SPI thread — fine, this thread is
                 * its only writer (the stretcher copies it out through the
                 * seqlock); the one place "the audio thread never reads W" bends */
                au_warper_t *X = (au_warper_t *)inst->au_warper;
                const au_warp_t *W = X ? X->trk[t] : NULL;
                if (W && at->w.on && W->cmd.smp && !W->cmd.smp->pcm && W->cmd.fpt > 0 && W->cmd.P > 0) {
                    s = W->cmd.smp;
                    pos = __atomic_load_n(&W->read_pos, __ATOMIC_RELAXED);
                    lo = W->cmd.rs;
                    hi = W->cmd.re;
                    step = (double)(W->cmd.re - W->cmd.rs) / W->cmd.P / W->cmd.fpt;
                    if (W->cmd.revrs) step = -step;
                    loop = 1;
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
        for (i = 0; i <= AU_SLC; i++) {
            const au_clip_t *cl = au_slot(inst, t, i);
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

/* ---------------- WARP: the audio thread's side ----------------
 * The stretcher (seq8_audio.c, STRETCHING) renders ahead into the track's
 * ring; here the command is published, anchors are set, and the ring is read
 * against the clock. */
static double au_wrap_signed(double x, double L) {
    x = au_wrap(x, L);
    return x >= L * 0.5 ? x - L : x;
}

/* A new anchor at clip tick `at_tick`. hold: what plays now plays on till the
 * new one is due (a launch, a snap while playing); else it fades (a stop). */
static void au_warp_anchor(au_warp_trk_t *w, double at_tick, int c, int hold) {
    int sounding = w->state == AU_WARP_PLAY || w->hold;
    if (hold && sounding) {
        if (w->state == AU_WARP_PLAY) { w->ogain = w->gain; w->oclip = w->clip; }
        w->hold = 1;
        w->fadeout = 0;
    } else {
        w->hold = 0;
        w->fadeout = w->state == AU_WARP_PLAY ? w->gain : 0;
    }
    w->xf = 0;
    w->gen++;
    w->state = AU_WARP_WAIT;
    w->gain = 0;
    w->on = 1;
    w->clip = (uint8_t)c;
    w->cur_anchor = at_tick;
    w->drift = 0;
    w->waited = 0;
}

static void au_warp_block(seq8_instance_t *inst, int t, int c, double L, double fpt, int playing, int ticked) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    au_warp_trk_t *w = &inst->au_trk[t].w;
    au_clip_t *cl = au_cl(inst, t, c);
    au_warp_cmd_t cmd;
    uint32_t rs, re;
    if (!X || !X->trk[t] || !cl->smp) return;
    au_range(cl, cl->smp, &rs, &re);
    if (!playing) {
        /* stopped: tick 0, ready for the downbeat */
        if (!w->on || w->clip != c || w->live) au_warp_anchor(w, 0.0, c, 0);
        w->live = 0;
    } else {
        if (!w->on || w->clip != c) {
            au_warp_anchor(w, au_wrap(w->tick + AU_WARP_LEAD / fpt, L), c, 1);
            w->live = 1;
        }
        if (ticked) w->live = 1;          /* the transport's first tick: the ring's tick 0 is due */
    }
    memset(&cmd, 0, sizeof cmd);
    cmd.smp = cl->smp;
    cmd.rs = rs;
    cmd.re = re;
    cmd.P = au_span_ticks(cl, cl->smp, rs, re);
    cmd.L = L;
    cmd.fpt = fpt;
    cmd.nud = (double)cl->nudge_ms * 44.1 / fpt;
    cmd.rot = L > 0 ? au_wrap((double)cl->rot, L) : 0.0;
    cmd.pitch = au_tune(au_pitch(cl) + inst->au_trk[t].cond, au_detune(cl));   /* the Conductor's, held till the wrap on Next */
    cmd.drift = w->drift;
    cmd.anchor_tick = w->cur_anchor;
    cmd.anchor_gen = w->gen;
    cmd.revrs = (uint8_t)au_revrs(cl);
    cmd.run = 1;
    /* REMIX: the stretcher reads through it (au_warp_src) */
    {
        au_track_t *at = &inst->au_trk[t];
        if (playing && at->rmx_on && at->rmx_n && at->rmx_clip == (uint8_t)c) {
            if (X->trk[t]->rmx_pub.gen != at->rmx_gen) au_warp_rmx_publish(X->trk[t], at->rmx_gen, at->rmx_e, at->rmx_n);
            cmd.rmx_gen = at->rmx_gen;
        }
    }
    au_warp_cmd_write(X->trk[t], &cmd);
}

/* The track goes quiet (not Warp any more, its clip stopped): the stretcher
 * idles, what was playing fades. */
static void au_warp_off(seq8_instance_t *inst, int t) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    au_warp_trk_t *w = &inst->au_trk[t].w;
    if (w->on) {
        w->fadeout = w->state == AU_WARP_PLAY ? w->gain : w->hold ? w->ogain : 0;
        if (w->hold) w->clip = w->oclip;
        w->hold = 0;
        w->xf = 0;
        w->gen++;
        w->on = 0;
        w->state = AU_WARP_WAIT;
    }
    /* (a kill clears `on` without telling the stretcher: tell it here) */
    if (X && X->trk[t] && X->trk[t]->cmd.run) {
        au_warp_cmd_t cmd = X->trk[t]->cmd;
        cmd.run = 0;
        cmd.anchor_gen = w->gen;
        au_warp_cmd_write(X->trk[t], &cmd);
    }
}

/* Read the ring for this block into acc (stereo, x32767 x the clip's gain).
 * Two cursors: W->tail plays the last anchor's frames out (held, or fading);
 * w->ntail reads ahead for the current anchor's, dropping its late ones. In
 * PLAY they are one, but for the AU_WARP_FADE frames of a hand-over. Returns
 * 1 if anything sounded. */
static int au_warp_mix(seq8_instance_t *inst, int t, int32_t *acc, int frames) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    au_warp_trk_t *w = &inst->au_trk[t].w;
    au_warp_t *W;
    double L, fpt;
    uint32_t tail, head;
    int f, any = 0;
    const uint32_t M = AU_WARP_RING - 1;
    float gn, go;
    if (!X || !(W = X->trk[t])) return 0;
    L = W->cmd.L;
    fpt = W->cmd.fpt;
    if (!(L > 0) || !(fpt > 0)) return 0;
    gn = au_db(au_gain(au_cl(inst, t, w->clip))) * 32767.f / 64.f;
    go = au_db(au_gain(au_cl(inst, t, w->oclip))) * 32767.f / 64.f;
    tail = W->tail;
    head = __atomic_load_n(&W->head, __ATOMIC_ACQUIRE);
    if ((int32_t)(w->ntail - tail) < 0 || (int32_t)(head - w->ntail) < 0) w->ntail = tail;
    /* how far off the clock the next frame is; too far: anchor again */
    if (w->on && w->live && w->state == AU_WARP_PLAY && !w->xf && head != tail) {
        uint32_t i = tail & M;
        if (W->gen[i] == w->gen && W->tag[i] >= 0) {
            w->drift = au_wrap_signed((double)W->tag[i] - w->tick, L) * fpt;
            if (w->drift > AU_WARP_SNAP || w->drift < -AU_WARP_SNAP) {
                au_warp_anchor(w, au_wrap(w->tick + AU_WARP_LEAD / fpt, L), w->clip, 1);
                go = gn;
            }
        }
    }
    for (f = 0; f < frames; f++) {
        double want = au_wrap(w->tick + (double)f / fpt, L);
        uint32_t i;
        if (w->state == AU_WARP_WAIT) {
            int ready = 0;
            if (w->on && w->live)
                while (w->ntail != head) {
                    i = w->ntail & M;
                    if (W->gen[i] != w->gen || W->tag[i] < 0) { w->ntail++; continue; }
                    double e = au_wrap_signed((double)W->tag[i] - want, L) * fpt;
                    if (e < -0.5) { w->ntail++; continue; }   /* late: skip it */
                    ready = e <= 0.5;                          /* else early: not yet */
                    break;
                }
            if (ready) {
                w->state = AU_WARP_PLAY;
                w->gain = 0;
                w->last_wait = w->waited + (uint32_t)f;
                if (w->hold && tail != w->ntail && W->gen[tail & M] != w->gen) w->xf = AU_WARP_FADE;
                else { tail = w->ntail; w->hold = 0; }
            } else {
                /* the last anchor's sound: on at its level till the new one is
                 * due (a launch), or fading (a stop) — held only while there is
                 * some left */
                if (w->hold && (tail == head || W->gen[tail & M] == w->gen)) w->hold = 0;
                if (tail != head && W->gen[tail & M] != w->gen && (w->hold || w->fadeout)) {
                    float k = w->hold ? (float)w->ogain : (float)w->fadeout;
                    i = tail & M;
                    acc[f * 2]     += (int32_t)(W->l[i] * go * k);
                    acc[f * 2 + 1] += (int32_t)(W->r[i] * go * k);
                    if (!w->hold) w->fadeout--;
                    if (w->ntail == tail) w->ntail++;
                    tail++;
                    any = 1;
                } else if (!w->hold && !w->fadeout) {
                    /* nothing to play out: drop the old frames, and the late
                     * ones the look-ahead skipped, so the ring has room (kept,
                     * a stretcher more than AU_WARP_AHEAD late found it full
                     * of frames nobody would read and stopped for good) */
                    while (tail != head && W->gen[tail & M] != w->gen) tail++;
                    if ((int32_t)(w->ntail - tail) < 0) w->ntail = tail;
                    else if (w->on && w->live) tail = w->ntail;
                }
                continue;
            }
        }
        /* PLAY */
        if (w->ntail == head) {
            if (w->on && w->live) inst->au_underruns++;
            continue;
        }
        i = w->ntail & M;
        if (w->gain < AU_WARP_FADE) w->gain++;
        acc[f * 2]     += (int32_t)(W->l[i] * gn * w->gain);
        acc[f * 2 + 1] += (int32_t)(W->r[i] * gn * w->gain);
        w->ntail++;
        if (w->xf) {
            /* the hand-over: the last anchor's frames fade as the new rise */
            if (tail != head && (int32_t)(w->ntail - 1 - tail) > 0 && W->gen[tail & M] != w->gen) {
                float k = (float)w->ogain * (float)(AU_WARP_FADE - w->gain) / (float)AU_WARP_FADE;
                uint32_t o = tail & M;
                acc[f * 2]     += (int32_t)(W->l[o] * go * k);
                acc[f * 2 + 1] += (int32_t)(W->r[o] * go * k);
                tail++;
            }
            if (--w->xf == 0) w->hold = 0;
        }
        if (!w->xf) tail = w->ntail;
        any = 1;
    }
    __atomic_store_n(&W->tail, tail, __ATOMIC_RELEASE);
    if (w->on && w->live && w->state == AU_WARP_WAIT) w->waited += (uint32_t)frames;
    return any || w->fadeout || w->hold;
}

/* Every chop voice (not the loop's) of track `at` fades out (Vintage stopped). */
static void au_release_chops(au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++) if (at->v[i].active && !at->v[i].mode_loop) au_voice_release(&at->v[i], 64);
}

/* Vintage (Josh, 2026-10-29: "make it as fine as possible and call it
 * "vintage" or something" — "without timestretch - gaps are totally expected
 * by users"): Start..End cut on the clock's own grid, one piece a tick (1/384
 * note), piece j on tick j of the sample's own Bars, Nudge on top; in Revrs
 * the pieces run from End back, each backwards. A piece plays at the clip's
 * pitch, so a slower tempo leaves a gap after each; at a faster one the voice
 * runs on into the next piece (au_range_on's join) until it is AU_JOIN behind,
 * then the next piece cuts it and it jumps to where the clock says. At the
 * loop's own tempo they join throughout and it plays as Free does. The user's chops play no part (Josh: "chops should just be completely
 * invisible in loop mode"). `tick` is the clip counter after this block's
 * ticks: the last one played is tick - 1; on our own clock, what is left in
 * its accumulator is how far past it the block ends (a followed clock: below). */
#define AU_VINTAGE_PER_BLOCK 16
#define AU_VINTAGE_OVER      8      /* frames */
/* The master ticks a block consumed: arp_master_tick now less au_tick0, its
 * value before the block. It is 32-bit, and a count-in's end (or a transport
 * start) resets it to 0 inside the block: then the ticks since the reset are
 * the count, and those before it were the count-in's (read through 64 bits
 * the count underflowed to ~1.8e19 and the render hung: found by review).
 * At most AU_VINTAGE_PER_BLOCK. */
static uint32_t au_block_ticks(uint32_t now, uint64_t before) {
    uint32_t t0 = (uint32_t)before, n = now >= t0 ? now - t0 : now;
    return n > AU_VINTAGE_PER_BLOCK ? AU_VINTAGE_PER_BLOCK : n;
}
/* the least whole number >= x (no libm here) */
static long au_ceil(double x) { long i = (long)x; return (double)i < x ? i + 1 : i; }
/* The clip ticks this block covers, for the pieces cut on the clock
 * (Vintage) and Warp's clock: from `start` (clip ticks, may be below 0 by up to the span) for
 * `span` ticks; a piece `d` ticks in lands at frame d * fscale. `tick` is the
 * clip counter after this block's ticks, L the clip's length in ticks. 0 = the
 * block has none (a followed clock between pulses). */
static int au_clock_window(seq8_instance_t *inst, int32_t tick, double L, double fpt, int frames,
                           double *start, double *span, double *fscale) {
    *span = (double)frames / fpt;
    *fscale = fpt;
    if (!inst->follow_solo && !inst->clock_follow_on && inst->tick_delta) {
        /* our own clock: the tick played lands `past` before the block's end */
        double past = (double)inst->tick_accum / (double)inst->tick_delta * (double)frames / fpt;
        *start = au_wrap((double)tick - 1.0 + past, L) - *span;
    } else {
        /* a followed clock (Move's 0xF8) puts its ticks on the block's frame
         * 0 (seq8_tick_frame) and says nothing between them: the pieces due
         * are the ticks this block consumed (au_tick0: the master tick
         * before it) — an 0xF8 brings PPQN / 24 at once, a backlog more,
         * follow_solo one — all at frame 0; a block with none has none.
         * (Read as our own clock's, the window ended ON the tick and every
         * piece fell just outside it, so Vintage was silent; a rolling window
         * from the last block's end then missed the first pulse's first ticks
         * and burst after a jump. Both found by review, 2026-10-29.) */
        double n = (double)au_block_ticks(inst->arp_master_tick, inst->au_tick0);
        if (n <= 0) return 0;
        *span = n;
        *start = au_wrap((double)tick - 1.0 - n + 1e-6, L);
        *fscale = 0.0;
    }
    return 1;
}
static void au_sync_block(seq8_instance_t *inst, int t, int c, int32_t tick, uint32_t len_ticks, double fpt, int frames) {
    au_clip_t *cl = au_cl(inst, t, c);
    const au_sample_t *s = cl->smp;
    uint32_t rs, re;
    if (!s || !len_ticks || fpt <= 0) return;
    au_range(cl, s, &rs, &re);
    if (re <= rs) return;
    double L = (double)len_ticks, span, start, fscale;
    double P = au_span_ticks(cl, s, rs, re), R = (double)(re - rs);
    if (P <= 0) return;
    if (!au_clock_window(inst, tick, L, fpt, frames, &start, &span, &fscale)) return;
    double nud = (double)cl->nudge_ms * 44.1 / fpt;
    /* Shift: the clip's time (after Nudge) rotated later, wrapping in the loop */
    double rot = au_wrap((double)cl->rot, L);
    long G = au_ceil(P - 1e-9);
    /* the pieces whose tick falls in this block, in the order they sound */
    long pj[AU_VINTAGE_PER_BLOCK];
    double pd[AU_VINTAGE_PER_BLOCK];
    int m = 0, q, i, k;
    for (q = -2; q <= 1; q++) {
        double lo = start - nud - rot + q * L;
        long j;
        for (j = au_ceil(lo - 1e-9); (double)j < lo + span && m < AU_VINTAGE_PER_BLOCK; j++) {
            if (j < 0 || j >= G) continue;
            double U = (double)j + nud;
            /* past the clip's end the clip comes round first; before its
             * start (a Nudge earlier) it never plays — the loop starts that
             * much further in, as Free's does (wrapped to the clip's end it
             * fought the pieces due there: found by review, 2026-10-29) */
            if (U >= L || U < 0) continue;
            double T = au_wrap(U + rot, L);
            double d = au_wrap(T - start, L);
            if (d >= span) continue;
            for (k = m; k > 0 && pd[k - 1] > d; k--) { pd[k] = pd[k - 1]; pj[k] = pj[k - 1]; }
            pd[k] = d; pj[k] = j; m++;
        }
    }
    for (i = 0; i < m; i++) {
        /* Pieces due on one frame in tick order are one stretch of the
         * sample: under a followed clock each 0xF8 brings 4 ticks at once,
         * and played as 4 pieces the third cut the first two — a stutter
         * and a gap every pulse (found by the second review). */
        int e = i;
        while (e + 1 < m && pj[e + 1] == pj[e] + 1 && (uint32_t)(pd[e + 1] * fscale) == (uint32_t)(pd[i] * fscale)) e++;
        double x0 = R * (double)pj[i] / P, x1 = R * (double)(pj[e] + 1) / P;
        if (x1 > R) x1 = R;
        /* each piece runs a few frames into the next, so the rounding of
         * its start against the block never ends it a frame early */
        x1 += AU_VINTAGE_OVER + 4.0 * AU_VINTAGE_XF;   /* ...and on through its fade-out, up to 4x speed */
        if (x1 > R) x1 = R;
        uint32_t a = au_revrs(cl) ? re - (uint32_t)x1 : rs + (uint32_t)x0;
        uint32_t b = au_revrs(cl) ? re - (uint32_t)x0 : rs + (uint32_t)x1;
        uint32_t off = (uint32_t)(pd[i] * fscale);
        au_range_on(inst, t, c, AU_SLICE_NONE, a, b, 1.0f, off >= (uint32_t)frames ? (uint32_t)frames - 1 : off, 1);
        i = e;
    }
}

/* ---------------- REMIX on a Loop clip ---------------- */


/* The setting in force for clip c, taken now (at a bar line, or as it
 * starts): one bar's events for the Loop phrase — a note on each 1/16, key =
 * its slot — remixed. Every bar of the clip remixes alike. */
static void au_rmx_latch(seq8_instance_t *inst, int t, int c) {
    au_track_t *at = &inst->au_trk[t];
    const clip_pfx_params_t *pp = &inst->tracks[t].clips[c].pfx_params;
    static rmx_ev_t in[16], out[RMX_MAX];
    int k, n;
    if (at->rmx_on == pp->rmx_on && at->rmx_type == pp->rmx_type && at->rmx_var == pp->rmx_var
        && at->rmx_clip == (uint8_t)c && (at->rmx_n || !pp->rmx_on)) return;
    at->rmx_on = pp->rmx_on; at->rmx_type = pp->rmx_type; at->rmx_var = pp->rmx_var;
    at->rmx_clip = (uint8_t)c;
    at->rmx_n = 0;
    if (!at->rmx_on) return;
    memset(in, 0, sizeof in);
    for (k = 0; k < 16; k++) {
        in[k].tick = k * (AU_RMX_BAR / 16); in[k].gate = AU_RMX_BAR / 16; in[k].vel = 100; in[k].key = (uint8_t)k;
    }
    n = rmx_bar(&inst->rmx_w, at->rmx_type, at->rmx_var, AU_RMX_BAR, in, 16, out, RMX_MAX);
    if (n > AU_RMX_EV) n = AU_RMX_EV;
    memcpy(at->rmx_e, out, (size_t)n * sizeof out[0]);
    at->rmx_n = (int16_t)n;
    if (++at->rmx_gen == 0) at->rmx_gen = 1;
}

/* Clip c's REMIX this block (Sync Vintage or Pitch): each event of each bar
 * whose clip tick falls in the block starts a piece — its source slot of the
 * SAME bar of Start..End, reversed / repitched as the event says, at its
 * velocity, released when its gate ends. The remix maps the clip's time
 * first; Shift and Nudge then apply as they do without it. */
static void au_rmx_block(seq8_instance_t *inst, int t, int c, int32_t tick, uint32_t len_ticks, double fpt, int frames) {
    au_track_t *at = &inst->au_trk[t];
    au_clip_t *cl = au_cl(inst, t, c);
    const au_sample_t *s = cl->smp;
    uint32_t rs, re;
    if (!s || !len_ticks || fpt <= 0 || !at->rmx_n) return;
    au_range(cl, s, &rs, &re);
    if (re <= rs) return;
    double L = (double)len_ticks, span, start, fscale;
    double P = au_span_ticks(cl, s, rs, re), R = (double)(re - rs);
    if (P <= 0) return;
    if (!au_clock_window(inst, tick, L, fpt, frames, &start, &span, &fscale)) return;
    double nud = (double)cl->nudge_ms * 44.1 / fpt;
    double rot = au_wrap((double)cl->rot, L);
    int cs = (int)at->cond;
    /* Pitch: the voice runs at the speed that fills the clip; Vintage: as recorded */
    double vk = 1.0;
    if (cl->sync == AU_SYNC_PITCH) {
        double base = au_tune(au_pitch(cl) + cs, au_detune(cl)) * (double)s->rate / 44100.0;
        if (base > 0) vk = (R / (P * fpt)) / base;
    }
    int nbars = (int)((len_ticks + AU_RMX_BAR - 1) / AU_RMX_BAR), b, i, m = 0;
    int pe[AU_VINTAGE_PER_BLOCK], pb[AU_VINTAGE_PER_BLOCK];
    double pd[AU_VINTAGE_PER_BLOCK];
    for (b = 0; b < nbars; b++) {
        for (i = 0; i < at->rmx_n && m < AU_VINTAGE_PER_BLOCK; i++) {
            double Td = (double)(b * AU_RMX_BAR + at->rmx_e[i].tick);
            if (Td >= L) continue;
            double d = au_wrap(Td - start, L);
            if (d >= span) continue;
            int k;
            for (k = m; k > 0 && pd[k - 1] > d; k--) { pd[k] = pd[k - 1]; pe[k] = pe[k - 1]; pb[k] = pb[k - 1]; }
            pd[k] = d; pe[k] = i; pb[k] = b; m++;
        }
    }
    for (i = 0; i < m; i++) {
        const rmx_ev_t *e = &at->rmx_e[pe[i]];
        double Us = (double)(pb[i] * AU_RMX_BAR + e->key * (AU_RMX_BAR / 16));
        if (Us >= L) continue;                           /* its source is past the clip's end */
        double j = au_wrap(Us - rot, L) - nud;
        if (j < 0 || j >= P) continue;
        /* the piece is its source slot (a slice, as on the RS7000: a longer
         * gate holds it, never plays on into the next slot); repitched, it
         * plays that slot faster or slower. It runs a few frames past its
         * end, on the side it plays toward, into its fade (as Vintage's). */
        double x0 = R * j / P, sl = R * (double)(AU_RMX_BAR / 16) / P, over = AU_VINTAGE_OVER + AU_VINTAGE_XF;
        double lo = au_revrs(cl) ? (double)re - x0 - sl : (double)rs + x0, hi = lo + sl;
        if ((au_revrs(cl) ? 1 : 0) ^ (e->rev ? 1 : 0)) lo -= over; else hi += over;
        if (lo < (double)rs) lo = (double)rs;
        if (hi > (double)re) hi = (double)re;
        if (hi <= lo) continue;
        uint32_t a = (uint32_t)lo, bb = (uint32_t)hi;
        uint32_t off = (uint32_t)(pd[i] * fscale);
        if (off >= (uint32_t)frames) off = (uint32_t)frames - 1;
        au_rmx_rev = e->rev; au_rmx_semi = e->pitch;
        au_voice_t *v = au_range_on_in(at, s, cs, cl, c, AU_SLICE_NONE, a, bb, (float)e->vel / 100.0f, off, 1, vk);
        au_rmx_rev = 0; au_rmx_semi = 0;
        if (v) {
            v->wlo = rs; v->whi = re;
            au_voice_release_at(v, 64, off + (uint32_t)((double)e->gate * fpt));
        }
    }
}

/* ---------------- Export: a Loop clip rendered offline ---------------- */

/* Clip (t,c), a Loop clip on Sync Pitch or Vintage, as audio for the Ableton
 * export — Live warps every clip, so it has neither (Josh, 2026-10-31: "the
 * mix": what Live can carry goes as the sample, what it cannot is rendered).
 * The clip plays as on the device with the clock exact: Pitch, one voice
 * retuned to fill the clip, started at the loop's top and at the Shift's
 * point; Vintage, one piece per tick of the sample's own Tempo, each where
 * the clock puts it (au_sync_block's arithmetic). Into a private track, two
 * passes, the second kept, `len` ticks at `bpm`, to `path` (44.1 kHz 16-bit
 * stereo). Left out: the Conductor, the Audio lanes. Returns frames, or -1. */
static long au_export_loop(seq8_instance_t *inst, int t, int c, uint32_t len, double bpm, const char *path) {
    au_clip_t *cl = au_cl(inst, t, c);
    au_sample_t *own = NULL;
    static au_track_t trk;
    uint8_t h[44];
    uint32_t rs, re;
    if (!cl->smp || cl->mode != AU_MODE_LOOP || cl->sync == AU_SYNC_WARP || !len || bpm <= 0) return -1;
    const au_sample_t *s = au_xsample(inst, cl, &own);
    if (!s) return -1;
    au_range(cl, s, &rs, &re);
    double fpt = 44100.0 * 60.0 / (bpm * (double)PPQN), L = (double)len;
    double P = au_span_ticks(cl, s, rs, re), R = (double)(re - rs);
    if (re <= rs + 32 || P <= 0) { au_sample_free(own); return -1; }
    uint32_t f0 = (uint32_t)(L * fpt + 0.5), total = (uint32_t)(2 * L * fpt + 0.5);
    double rot = au_wrap((double)cl->rot, L);
    FILE *f = fopen(path, "wb");
    if (!f) { au_sample_free(own); return -1; }
    au_wav_header(h, total - f0, 44100, 2);
    fwrite(h, 1, sizeof h, f);
    memset(&trk, 0, sizeof trk);
    uint32_t k, frame = 0;
    if (cl->sync == AU_SYNC_PITCH) {
        double fill = R / (P * fpt);
        for (k = 0; k < 2 * len; k++) {
            uint32_t tick = k % len;
            /* the loop's top, and the Shift's point: the sample starts again
             * (as the live block: `pr` the rotated time, 0 at the Shift) */
            if (tick == 0 || (rot > 0 && (double)tick == rot)) {
                double pr = (rot > 0 && (double)tick == rot) ? 0.0 : (rot > 0 ? au_wrap(-rot, L) : 0.0);
                double off = (pr * fpt - (double)cl->nudge_ms * 44.1) * fill;
                au_loop_start_in(&trk, cl, s, c, off, fill);
            }
            au_xrender(&trk, f, &frame, (uint32_t)((double)(k + 1) * fpt + 0.5), f0);
        }
    } else {
        /* Vintage: piece j of the sample (its own Tempo's ticks) sounds at the
         * clip's tick U = j + Nudge, rotated by the Shift; one before the
         * clip's start or past its end never plays */
        double nud = (double)cl->nudge_ms * 44.1 / fpt;
        long G = au_ceil(P - 1e-9), j;
        for (k = 0; k < 2 * len; k++) {
            uint32_t b0 = (uint32_t)((double)k * fpt + 0.5);
            double lo = (double)(k % len), hi = lo + 1.0;
            for (j = 0; j < G; j++) {
                double U = (double)j + nud;
                if (U >= L || U < 0) continue;
                double T = au_wrap(U + rot, L);
                if (T < lo || T >= hi) continue;
                double x0 = R * (double)j / P, x1 = R * (double)(j + 1) / P;
                if (x1 > R) x1 = R;
                x1 += AU_VINTAGE_OVER + 4.0 * AU_VINTAGE_XF;
                if (x1 > R) x1 = R;
                uint32_t a = au_revrs(cl) ? re - (uint32_t)x1 : rs + (uint32_t)x0;
                uint32_t b = au_revrs(cl) ? re - (uint32_t)x0 : rs + (uint32_t)x1;
                double at = ((double)(k - k % len) + T) * fpt;
                uint32_t off = at > (double)b0 ? (uint32_t)(at - (double)b0) : 0;
                au_range_on_in(&trk, s, 0, cl, c, AU_SLICE_NONE, a, b, 1.0f, off, 1, 1.0);
            }
            au_xrender(&trk, f, &frame, (uint32_t)((double)(k + 1) * fpt + 0.5), f0);
        }
    }
    int bad = ferror(f);
    au_sample_free(own);
    if (fclose(f) || bad) return -1;
    return (long)(total - f0);
}

/* Clip (t,c)'s whole sample backwards, for a Warp clip on Revrs: Live warps
 * the reversed file forwards (its frame 0 is the sample's end). Its own rate
 * and channels. Returns frames, or -1. */
static long au_export_reversed(seq8_instance_t *inst, int t, int c, const char *path) {
    au_clip_t *cl = au_cl(inst, t, c);
    au_sample_t *own = NULL;
    uint8_t h[44];
    static int16_t buf[2 * 4096];
    const au_sample_t *s = au_xsample(inst, cl, &own);
    if (!s || !s->frames) { au_sample_free(own); return -1; }
    FILE *f = fopen(path, "wb");
    if (!f) { au_sample_free(own); return -1; }
    au_wav_header(h, s->frames, s->rate, s->ch);
    fwrite(h, 1, sizeof h, f);
    uint32_t i = s->frames, n;
    while (i > 0) {
        for (n = 0; n < 4096 && i > 0; n++) {
            i--;
            memcpy(buf + n * s->ch, s->pcm + (size_t)i * s->ch, sizeof(int16_t) * s->ch);
        }
        fwrite(buf, sizeof(int16_t) * s->ch, n, f);
    }
    int bad = ferror(f);
    au_sample_free(own);
    if (fclose(f) || bad) return -1;
    return (long)s->frames;
}

/* A sounding voice follows its clip's Pitch, Detune and Gain — and its
 * chop's, ALL SLICES' lanes over them — as automation moves them (au_pitch,
 * au_sl_eff): its speed by the change since it last looked, its level from
 * both gains. A Tempo Pitch loop's speed is the tempo's, so only its level
 * follows. */
static void au_voice_follow(seq8_instance_t *inst, int t) {
    au_track_t *at = &inst->au_trk[t];
    int i;
    for (i = 0; i < AU_VOICES; i++) {
        au_voice_t *v = &at->v[i];
        if (!v->active || v->clip > AU_SLC) continue;
        const au_clip_t *cl = au_cl(inst, t, v->clip);
        au_slice_t sl;
        int g, ps, pc;
        if (v->usl && v->slice < AU_MAX_SLICES) au_sl_eff(cl, v->slice, &sl);
        else memset(&sl, 0, sizeof sl);
        g = au_gain(cl) + sl.gain_db;
        if (g != v->gdb) { v->gain = au_db(g) * v->vg; v->gdb = (int8_t)g; }
        if (!v->fpitch) continue;
        ps = au_pitch(cl) + sl.pitch; pc = au_detune(cl) + sl.detune;
        if (ps != v->ps || pc != v->pc) {
            int dc = pc - v->pc;                          /* up to 200: au_cents is good to 100 */
            v->step *= au_semi(ps - v->ps) * au_cents(dc / 2) * au_cents(dc - dc / 2);
            v->ps = (int8_t)ps; v->pc = (int16_t)pc;
        }
    }
}

/* Per block, after the sequencer: the loader's answers, each Audio track's
 * Loop voice following its clip, every voice rendered and fed to the track's
 * own chain slot. */
static void au_render(seq8_instance_t *inst, int frames) {
    int t, i, f;
    if (frames <= 0 || frames > 128) return;
    au_apply_results(inst);
    for (t = 0; t < NUM_TRACKS; t++)
        if (pad_mode_sampled(inst->tracks[t].pad_mode))
            for (i = 0; i <= AU_SLC; i++) au_trans_settle(au_slot(inst, t, i));
    for (t = 0; t < NUM_TRACKS; t++) {
        seq8_track_t *tr = &inst->tracks[t];
        au_track_t *at = &inst->au_trk[t];
        int any = 0;
        if (!pad_mode_sampled(tr->pad_mode)) {
            for (i = 0; i < AU_VOICES; i++) at->v[i].active = 0;
            au_warp_off(inst, t);
            continue;
        }
        /* a lane's live value is the PLAYING clip's: one left behind by a
         * clip switch is gone (its lane gives the value back at the switch).
         * A Slicer's slot is every clip's, the playing one's included. */
        if (tr->pad_mode == PAD_MODE_AUDIO)
            for (i = 0; i < NUM_CLIPS; i++) {
                au_clip_t *oc = au_slot(inst, t, i);
                if (i != tr->active_clip && (oc->ov || oc->ovs)) {
                    if (oc->ov & AU_OV_BPM) oc->tr_due = 1;
                    oc->ov = oc->ovs = 0;
                }
            }
        /* The Conductor on Now: a chop already sounding moves with it (the
         * Loop voice is Tempo Pitch's, whose speed the tempo sets) */
        if (au_cond_at_once(inst, t)) {
            int cn = au_cond_now(inst, t);
            for (i = 0; i < AU_VOICES; i++) {
                au_voice_t *v = &at->v[i];
                if (!v->active || v->mode_loop || v->cond == cn) continue;
                v->step *= au_semi(cn - v->cond);
                v->cond = (int8_t)cn;
            }
        }
        /* Loop mode: the voice follows the clip — starts with it, restarts on
         * each pass, stops with it. Lazy chop owns the track while it runs. */
        if (inst->au_lazy_track != t) {
            int c = tr->active_clip;
            au_clip_t *cl = au_cl(inst, t, c);
            clip_t *lc = &tr->clips[c];
            au_voice_t *lv = au_loop_voice(at);
            /* Mute does not stop the loop: it plays on silently, like a
             * muted bus, so unmuting picks it up in place (below). */
            int run = inst->playing && tr->clip_playing && cl->mode == AU_MODE_LOOP && cl->smp;
            int sync = run && cl->sync == AU_SYNC_VINTAGE;
            int warp = run && cl->sync == AU_SYNC_WARP;
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
                /* the Conductor's semitones in force: at once on Now, else
                 * taken when the loop comes round (or as it starts) */
                if (au_cond_at_once(inst, t) || at->last_tick < 0 || tick < at->last_tick)
                    at->cond = (int8_t)au_cond_now(inst, t);
                double ratio = au_tune(au_pitch(cl) + at->cond, au_detune(cl)) * (double)cl->smp->rate / 44100.0;
                /* Tempo Pitch: retuned so Start..End fills the clip (Josh,
                 * 2026-10-28: ""Pitch" which would retune the loop to fill x
                 * bars") — the clip's Pitch knob gives way to it */
                double fill = 0.0;
                if (cl->sync == AU_SYNC_PITCH) {
                    /* x = the sample's own Bars, as Vintage's (Josh, 2026-10-28:
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
                 * each tick). Read as-is, a loop launched on a tick began one
                 * tick into the sample and cut its first hit (measured on the
                 * device: 230 frames at 120 bpm). */
                int ticked = (uint64_t)inst->arp_master_tick != inst->au_tick0;
                if (tick < 0) tick = 0;
                /* REMIX: the clip's setting taken at each bar line (and as
                 * the clip starts), so a change lands on the next bar */
                if (at->rmx_bar < 0 || at->rmx_clip != c || tick / AU_RMX_BAR != at->rmx_bar
                    || (at->last_tick >= 0 && tick < at->last_tick)) {     /* the loop came round */
                    au_rmx_latch(inst, t, c);
                    at->rmx_bar = tick / AU_RMX_BAR;
                }
                int rmx = at->rmx_on && at->rmx_n && !warp;
                if (!warp) au_warp_off(inst, t);
                if (rmx) {
                    /* the remix's pieces stand in for the loop voice and
                     * Vintage's pieces (au_rmx_block) */
                    if (lv) au_voice_release(lv, 64);
                    if (!at->sync_on || at->loop_clip != c) { at->sync_on = 1; at->sync_live = 0; at->loop_clip = (uint8_t)c; }
                    if (ticked) at->sync_live = 1;
                    if (at->sync_live) au_rmx_block(inst, t, c, tick, (uint32_t)lc->length * tps, fpt, frames);
                } else if (warp) {
                    /* Warp: the stretcher's ring, read against the clock */
                    double L = (double)lc->length * tps, start, span, fscale;
                    if (lv) au_voice_release(lv, 64);
                    if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                    if (L > 0) {
                        double est = au_wrap(at->w.tick + (double)frames / fpt, L);
                        if (!au_clock_window(inst, tick, L, fpt, frames, &start, &span, &fscale)) {
                            at->w.tick = est;               /* a followed clock between pulses */
                        } else if (fscale > 0) {
                            at->w.tick = au_wrap(start, L); /* our own clock: exact */
                        } else {
                            /* a followed clock's pulse: its ticks land at frame 0, a
                             * few at once — steer toward it, never jump unless far */
                            double err = au_wrap_signed(au_wrap(start, L) - est, L);
                            if (err > 8.0 || err < -8.0) at->w.tick = au_wrap(start, L);
                            else at->w.tick = au_wrap(est + (err > 0.25 ? 0.25 : err < -0.25 ? -0.25 : err), L);
                        }
                        au_warp_block(inst, t, c, L, fpt, 1, ticked);
                    }
                } else if (sync) {
                    /* Vintage: the sample cut on the clock (au_sync_block). */
                    if (lv) au_voice_release(lv, 64);
                    if (!at->sync_on || at->loop_clip != c) { at->sync_on = 1; at->sync_live = 0; at->loop_clip = (uint8_t)c; }
                    if (ticked) at->sync_live = 1;          /* the transport's first tick has played */
                    if (at->sync_live) au_sync_block(inst, t, c, tick, (uint32_t)lc->length * tps, fpt, frames);
                } else {
                    if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                    /* Pitch follows a tempo change at once, not at the wrap */
                    if (lv && fill > 0) lv->step = au_revrs(cl) ? -fill : fill;
                    /* Shift: the sample's start falls `rot` ticks into the clip,
                     * its end wrapping round before it — the voice starts again
                     * there, as at the loop's top */
                    double Lp = (double)lc->length * tps;
                    double rot = Lp > 0 ? au_wrap((double)cl->rot, Lp) : 0.0;
                    /* The voice starts only on a block that played a tick,
                     * on that tick's own frame, as a sequenced chop does: the
                     * transport's first block is before its first tick, and a
                     * start at the block's top ran a tick ahead of the notes
                     * and crept 8 frames a bar onto block boundaries
                     * (measured 2026-11-01). After a tick the counter is one
                     * past it, so the tick played is tick - 1 (the loop's
                     * last tick when the counter has wrapped to 0); `s` is
                     * where that tick is in the sample, which starts at the
                     * Shift — so with a Shift the loop's top is not a restart. */
                    if (ticked && Lp > 0) {
                        double s  = au_wrap(au_wrap((double)tick - 1.0, Lp) - rot, Lp);
                        double s0 = at->last_tick >= 0 ? au_wrap(au_wrap((double)at->last_tick - 1.0, Lp) - rot, Lp) : s;
                        if (!lv || at->loop_clip != c || s < s0) {
                            /* where the sample is at this block's first frame,
                             * before the tick (negative: it starts after it).
                             * Nudge: the sample starts that much later (+) or
                             * earlier (-) against the bar. */
                            double pr = s - (double)inst->au_last_tick_off / fpt;
                            double off = fill > 0 ? (pr * fpt - (double)cl->nudge_ms * 44.1) * fill
                                                  : pr * fpt * ratio - (double)cl->nudge_ms * (double)cl->smp->rate / 1000.0;
                            au_loop_start(inst, t, c, off, fill);
                        }
                    }
                }
                at->last_tick = tick;
            } else {
                if (lv) au_voice_release(lv, 64);
                if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                at->last_tick = -1;
                at->rmx_bar = -1;                       /* the next start takes the setting afresh */
                at->cond = (int8_t)au_cond_now(inst, t);
                /* stopped on a Warp clip: its downbeat is rendered ahead */
                if (!inst->playing && cl->mode == AU_MODE_LOOP && cl->sync == AU_SYNC_WARP && cl->smp) {
                    uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
                    double bpm = tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0;
                    double L = (double)lc->length * tps;
                    if (L > 0) au_warp_block(inst, t, c, L, 44100.0 * 60.0 / (bpm * PPQN), 0, 0);
                } else au_warp_off(inst, t);
            }
        } else au_warp_off(inst, t);
        for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) { any = 1; break; }
        if (at->w.on || at->w.fadeout || at->w.hold) any = 1;
        if (at->dl_tail) any = 1;                 /* the lead's delay still playing out */
        if (!any) continue;
        {
            int32_t acc[256], accl[256];
            int16_t out[256];
            /* Mute / solo silence the track's output, as on a bus: the
             * voices keep running, the level ramps over 64 frames. */
            int mtarget = effective_mute(inst, t) ? 0 : 64;
            /* THE LEAD (LEAD_BLOCKS): what the sequencer played is heard
             * LEAD_FRAMES later, with the MIDI the lead holds — through dl.
             * A pad's voice (live) is heard at once. None while following
             * Move's clock, as for the MIDI. */
            int led = lead_active(inst);
            memset(acc, 0, sizeof acc);
            memset(accl, 0, sizeof accl);
            au_voice_follow(inst, t);
            for (i = 0; i < AU_VOICES; i++) if (at->v[i].active)
                inst->au_underruns += au_voice_render(&at->v[i], at->v[i].live ? accl : acc, frames);
            if (at->w.on || at->w.fadeout || at->w.hold) au_warp_mix(inst, t, acc, frames);
            if (!led && at->dl_tail) { memset(at->dl, 0, sizeof at->dl); at->dl_tail = 0; }
            for (f = 0; f < frames; f++) {
                int32_t l = acc[f * 2], r = acc[f * 2 + 1];
                if (led) {
                    int32_t *d = &at->dl[at->dl_pos * 2];
                    int32_t ol = d[0], or_ = d[1];
                    d[0] = l; d[1] = r;
                    if (l || r) at->dl_tail = LEAD_FRAMES;
                    else if (at->dl_tail) at->dl_tail--;
                    if (++at->dl_pos >= LEAD_FRAMES) at->dl_pos = 0;
                    l = ol; r = or_;
                }
                l += accl[f * 2]; r += accl[f * 2 + 1];
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

/* "C ..." -> clip index, advancing *pp past it; AU_SLC names a Slicer's
 * slot. -1 = bad. */
static int au_arg_clip(const char **pp) {
    const char *p = *pp;
    while (*p == ' ') p++;
    if (*p < '0' || *p > '9') return -1;
    int c = my_atoi(p);
    while (*p >= '0' && *p <= '9') p++;
    *pp = p;
    return (c >= 0 && c <= AU_SLC) ? c : -1;
}

/* What a key about clip C edits: an Audio clip's own sample and settings, or
 * — on a Slicer, any C, AU_SLC included — the track's slot. NULL: the slot
 * named on a track that is not a Slicer. */
static au_clip_t *au_key_cl(seq8_instance_t *inst, int t, int c) {
    if (c == AU_SLC && inst->tracks[t].pad_mode != PAD_MODE_SLICER) return NULL;
    return au_cl(inst, t, c);
}
/* ...and the storage index au_mark / the loader address it by. */
static int au_key_c(seq8_instance_t *inst, int t, int c) {
    return inst->tracks[t].pad_mode == PAD_MODE_SLICER ? AU_SLC : c;
}

/* One slice field `w` of sl set to v. 0 = not a field. */
static int au_slice_field(au_slice_t *sl, const char *w, int v) {
    if (!strcmp(w, "pitch"))      sl->pitch = (int8_t)clamp_i(v, -24, 24);
    else if (!strcmp(w, "detune")) sl->detune = (int8_t)clamp_i(v, -50, 50);
    else if (!strcmp(w, "gain"))  sl->gain_db = (int8_t)clamp_i(v, -40, 12);
    else if (!strcmp(w, "rev"))   sl->rev = (uint8_t)(v ? 1 : 0);
    else if (!strcmp(w, "play"))  sl->play = (uint8_t)clamp_i(v, AU_PLAY_ONE, AU_PLAY_GATE);   /* Loop left (Josh, 2026-11-02) */
    else if (!strcmp(w, "atk"))   sl->attack_ms = (uint16_t)clamp_i(v, 0, 2000);
    else if (!strcmp(w, "dec"))   sl->decay_ms = (uint16_t)clamp_i(v, 0, 5000);
    else return 0;
    return 1;
}


/* Clip (t,c)'s steps go, keeping its length, resolution, effects and its
 * place playing (a clip clear also stops it and resets every step's
 * velocity and gate). One undo step. tN_au_wipe: the tests' and a remote's —
 * the UI clears with tN_cC_clear. */
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
static void au_renumber_one(seq8_instance_t *inst, int t, int c, int at, int dir);
/* On a Slicer every clip plays the slot's chops: each follows. */
static void au_renumber_steps(seq8_instance_t *inst, int t, int c, int at, int dir) {
    if (inst->tracks[t].pad_mode == PAD_MODE_SLICER) {
        int k;
        for (k = 0; k < NUM_CLIPS; k++) au_renumber_one(inst, t, k, at, dir);
    } else if (c < NUM_CLIPS) au_renumber_one(inst, t, c, at, dir);
}
static void au_renumber_one(seq8_instance_t *inst, int t, int c, int at, int dir) {
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
    for (; k < AU_MAX_SLICES; k++) cl->sl[k].start = cl->sl[k].end = 0;   /* no stale marker past them */
    cl->nslices = (uint8_t)n;
    cl->even = 0;
}

/* Whichever override is on becomes the hand set: Transient's chops (each
 * end home), else Even's. */
static void au_gen_bake(au_clip_t *cl) {
    au_trans_settle(cl);
    int k;
    if (cl->trans) {
        if (cl->smp && cl->tr_n) {
            for (k = 0; k < cl->tr_n; k++) {
                cl->sl[k].start = cl->tr_at[k];
                cl->sl[k].end = 0;
            }
            for (; k < AU_MAX_SLICES; k++) cl->sl[k].start = cl->sl[k].end = 0;
            cl->nslices = cl->tr_n;
        }
        cl->trans = 0;
        return;
    }
    au_even_bake(cl);
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
    au_clip_t *acl = au_cl(inst, tidx, c);
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

/* One undo step for an edit of clip c's sample side: the clip itself, or a
 * Slicer's slot — with every clip of the track, whose steps play its chops. */
static void au_undo_one(seq8_instance_t *inst, int t, int c) {
    if (c == AU_SLC) undo_begin_slicer(inst, t);
    else undo_begin_single(inst, t, c);
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

    /* pick: one undo step; pick_join: part of the step already taken (In
     * place and Flatten: tN_au_undo, then the clip's reset, then this) */
    if (!strcmp(sub, "pick") || !strcmp(sub, "pick_join")) {
        au_req_t r;
        c = au_arg_clip(&p);
        if (c < 0 || *p != '|' || !p[1]) return 1;
        /* only a track that plays samples takes one (a queued take whose
         * track changed kind meanwhile must not resize a melodic clip) */
        if (!pad_mode_sampled(inst->tracks[tidx].pad_mode)) return 1;
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (sub[4] == '\0') au_undo_one(inst, tidx, c);
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

    /* "C op ow": Trim (op 0) — the file cut to what the clip plays, Start
     * for its Length — or Normalize (op 1); ow 1 overwrites the project's
     * copy, 0 makes a new sample for this clip (the loader does the work) */
    if (!strcmp(sub, "edit")) {
        au_req_t r;
        int op = 0, ow = 0;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        unsigned ta = 0, tb = 0;
        int nargs = sscanf(p, "%d %d %u %u", &op, &ow, &ta, &tb);
        if (nargs < 1) return 1;
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (!cl->smp || cl->state != 2 || !cl->name[0]) return 1;
        memset(&r, 0, sizeof r);
        r.kind = AU_REQ_EDIT;
        r.track = (uint8_t)tidx; r.clip = (uint8_t)c;
        r.op = op ? AU_EDIT_NORM : AU_EDIT_TRIM;
        r.ow = ow ? 1 : 0;
        snprintf(r.path, sizeof r.path, "%s", cl->name);
        au_samples_dir(inst, r.dir, sizeof r.dir);
        if (!r.dir[0]) return 1;
        if (r.op == AU_EDIT_TRIM && c == AU_SLC) {
            /* a Slicer's Trim is a step before chopping (Josh, 2026-11-02:
             * "Trim is a destructive operation so it has to be something you
             * do pre chop"): frames a..b from its own screen, then 16 even
             * chops over what is left (au_apply_results) */
            if (nargs < 4 || tb <= ta || tb > cl->smp->frames || tb - ta < AU_GAP) return 1;
            if (ta == 0 && tb >= cl->smp->frames) return 1;          /* nothing to trim */
            r.a = ta; r.b = tb;
            r.rechop = 1;
        } else if (r.op == AU_EDIT_TRIM) {
            uint32_t rs, re;
            au_range(cl, cl->smp, &rs, &re);
            if (cl->mode == AU_MODE_LOOP) {
                /* from Start (a loop start inside the clip stays where it is)
                 * to where the clip's length ends */
                const clip_t *lc = &inst->tracks[tidx].clips[c];
                uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
                double w = (double)rs + (double)lc->length * tps * au_fpt_s(cl, cl->smp);
                if (w < (double)re) re = (uint32_t)(w + 0.5);
                rs = cl->rstart < rs ? cl->rstart : rs;
            }
            if (re <= rs || (rs == 0 && re >= cl->smp->frames)) return 1;   /* nothing to trim */
            r.a = rs; r.b = re;
        }
        /* New: one undo step (the old file is still there). Overwrite cannot
         * be undone, and a snapshot of any clip on that file would put its
         * settings back over different audio: those go */
        if (!r.ow) au_undo_one(inst, tidx, c);
        else au_undo_forget(inst, cl->name);
        r.gen = ++cl->gen;
        cl->state = 1;
        cl->err = 0;
        au_req_push(inst, &r);
        au_mark(inst, tidx, c);
        return 1;
    }

    /* "C C ...": one undo step over these clips, before a Flatten replaces
     * them (each reset then joins it: tN_cC_hard_reset "j") */
    if (!strcmp(sub, "undo")) {
        uint8_t cs[NUM_CLIPS];
        int n = 0;
        while (n < NUM_CLIPS && (c = au_arg_clip(&p)) >= 0) if (c < NUM_CLIPS) cs[n++] = (uint8_t)c;
        undo_begin_track_clips(inst, tidx, cs, n);
        return 1;
    }

    if (!strcmp(sub, "clear")) {
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        au_undo_one(inst, tidx, c);
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
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        snprintf(w, sizeof w, "%s", sub + 4);
        v = my_atoi(p);
        int slot = (c == AU_SLC);
        /* (an Audio clip has no chops: Even, Transient and Sens are a
         * Slicer's; Start, Nudge and Shift an Audio clip's) */
        if (!strcmp(w, "even")) {
            /* Even: N equal chops of the whole sample, WRITTEN as its
             * markers — a tool, not a setting that stays (Josh, 2026-11-02:
             * chops are markers). The sound settings stay with their numbers. */
            if (!slot || !cl->smp || v < 2) return 1;
            cl->even = (uint8_t)clamp_i(v, 2, AU_MAX_SLICES);
            cl->trans = 0;
            au_even_bake(cl);
            au_track_kill(inst, tidx, NULL);
        } else if (!strcmp(w, "trans")) {
            /* Transient: a chop at every hit kept at the Sens, written as the
             * markers (as Even); 0 is a no-op kept for old callers */
            if (!slot || !v || !cl->smp) return 1;
            cl->even = 0;
            cl->trans = 1;
            au_trans_calc(cl);
            au_gen_bake(cl);
            au_track_kill(inst, tidx, NULL);
        } else if (slot && (!strcmp(w, "start") || !strcmp(w, "slen") || !strcmp(w, "nudge") ||
                            !strcmp(w, "rot"))) {
            return 1;
        } else if (!slot && !strcmp(w, "sens")) {
            return 1;
        } else if (!strcmp(w, "start")) {
            /* frames, short of the sample's end by a slice at least.
             * Unloaded, taken as given. */
            uint32_t fr = cl->smp ? cl->smp->frames : 0;
            if (v < 0) v = 0;
            if (fr && fr <= AU_GAP) return 1;
            cl->rstart = fr ? (uint32_t)clamp_i(v, 0, (int)(fr - AU_GAP)) : (uint32_t)v;
            cl->tr_due = 1;                                      /* au_trans_settle */
        } else if (!strcmp(w, "slen")) {
            /* Slice: Length from Start, ticks at the sample's Tempo (0 = to
             * its end). A Loop clip's Length is the clip's own. */
            cl->slen = (uint32_t)(v < 0 ? 0 : v);
            cl->tr_due = 1;                                      /* au_trans_settle */
        } else if (!strcmp(w, "pitch")) {
            /* a hand's setting is what plays: a lane's live value gives way
             * (each of these five; the lane takes it again at its next change) */
            cl->pitch = (int8_t)clamp_i(v, -24, 24);
            cl->ov &= (uint8_t)~AU_OV_PITCH;
        } else if (!strcmp(w, "detune")) {
            cl->detune = (int8_t)clamp_i(v, -50, 50);
            cl->ov &= (uint8_t)~AU_OV_DETUNE;
        } else if (!strcmp(w, "gain")) {
            cl->gain_db = (int8_t)clamp_i(v, -40, 12);
            cl->ov &= (uint8_t)~AU_OV_GAIN;
        } else if (slot && !strcmp(w, "shot")) {
            return 1;                                            /* an Audio clip's: a Slicer's clips are sequences */
        } else if (!strcmp(w, "shot")) {
            cl->shot = (uint8_t)(v ? 1 : 0);
        } else if (!strcmp(w, "revrs")) {
            cl->revrs = (uint8_t)(v ? 1 : 0);
            cl->ov &= (uint8_t)~AU_OV_REVRS;
            inst->au_trk[tidx].last_tick = -1;     /* the loop restarts from its new end */
            if (c == tr->active_clip) au_track_kill(inst, tidx, NULL);
        } else if (!strcmp(w, "sync")) {
            v = slot ? (v == AU_SLC_SYNC_PITCH ? AU_SLC_SYNC_PITCH : AU_SLC_SYNC_OFF) : clamp_i(v, 0, AU_SYNC_MAX);
            if (v != cl->sync && c == tr->active_clip) au_track_kill(inst, tidx, NULL);
            cl->sync = (uint8_t)v;
        } else if (!strcmp(w, "bpm") || !strcmp(w, "orig")) {
            /* the sample's own Tempo x10; Orig = the project's, so the sample
             * plays as it was recorded (Josh, 2026-10-29: "orig") */
            if (w[0] == 'o') {
                double bpm = tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0;
                v = (int)(bpm * 10.0 + 0.5);
            }
            cl->bpm10 = (uint16_t)clamp_i(v, AU_BPM10_MIN, AU_BPM10_MAX);
            cl->ov &= (uint8_t)~AU_OV_BPM;
            cl->tr_due = 1;                                      /* au_trans_settle */
        } else if (!strcmp(w, "sens")) {
            cl->sens = (uint8_t)clamp_i(v, 0, 100);           /* Transient: which hits count */
            cl->tr_due = 1;                                      /* au_trans_settle */
        } else if (!strcmp(w, "nudge")) {
            cl->nudge_ms = (int16_t)clamp_i(v, -500, 500);
        } else if (!strcmp(w, "rot")) {
            /* Shift: ticks, taken mod the clip's length where it plays */
            cl->rot = (uint32_t)(v < 0 ? 0 : v);
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
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        au_slice_t *sl = &cl->sl[l];
        snprintf(w, sizeof w, "%s", sub + 6);
        v = my_atoi(p);
        if (!strcmp(w, "start")) {
            /* a hand-set start: between its neighbours' starts, before its
             * own pinned end. Even, if on, becomes the hand set first. */
            if (!cl->smp) return 1;
            au_gen_bake(cl);
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
            au_gen_bake(cl);
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
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        snprintf(w, sizeof w, "%s", sub + 4);
        v = my_atoi(p);
        for (l = 0; l < AU_MAX_SLICES; l++)
            if (!au_slice_field(&cl->sl[l], w, v)) return 1;
        /* a hand's setting is what plays: ALL SLICES' lane on it gives way */
        cl->ovs &= (uint8_t)~(!strcmp(w, "atk") ? AU_OVS_ATK : !strcmp(w, "dec") ? AU_OVS_DEC
                            : !strcmp(w, "gain") ? AU_OVS_GAIN : !strcmp(w, "pitch") ? AU_OVS_PITCH
                            : !strcmp(w, "detune") ? AU_OVS_DETUNE : !strcmp(w, "rev") ? AU_OVS_REV : AU_OVS_PLAY);
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
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        f = my_atoi(p);
        if (!cl->smp) return 1;
        au_gen_bake(cl);
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
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        l = my_atoi(p);
        au_gen_bake(cl);
        if (l < 1 || l >= cl->nslices) return 1;
        if (!cl->sl[l - 1].end) cl->sl[l - 1].end = cl->sl[l].end;
        memmove(&cl->sl[l], &cl->sl[l + 1], sizeof cl->sl[0] * (size_t)(AU_MAX_SLICES - 1 - l));
        memset(&cl->sl[AU_MAX_SLICES - 1], 0, sizeof cl->sl[0]);
        cl->nslices--;
        au_renumber_steps(inst, tidx, c, l, -1);
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "even_bake") || !strcmp(sub, "trans_bake")) {
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        au_gen_bake(cl);
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "manual")) {
        /* a fresh hand set: one slice, Start..End; Even Off. The UI asked
         * "Replace chops?" first. */
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        uint32_t rs = cl->rstart, re;
        if (cl->smp) au_range(cl, cl->smp, &rs, &re);
        for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
        cl->sl[0].start = rs;
        cl->nslices = 1;
        cl->even = 0;
        cl->trans = 0;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "chop")) {
        c = au_arg_clip(&p);                       /* "C [grow]": C a sequencer clip */
        if (c >= 0 && c < NUM_CLIPS && tr->pad_mode == PAD_MODE_SLICER)
            au_chop_steps(inst, tidx, c, my_atoi(p) ? 1 : 0);
        return 1;
    }

    if (!strcmp(sub, "wipe")) {
        c = au_arg_clip(&p);
        if (c < 0 || c >= NUM_CLIPS || tr->recording) return 1;
        au_wipe_steps(inst, tidx, c);
        return 1;
    }

    /* A Slicer's chop editor opened: ONE undo step for the whole visit —
     * the slot and every clip's steps, which its edits renumber (Josh,
     * 2026-11-02: one undo per chop-editor visit) */
    if (!strcmp(sub, "undo_slc")) {
        if (tr->pad_mode == PAD_MODE_SLICER) undo_begin_slicer(inst, tidx);
        return 1;
    }

    if (!strcmp(sub, "layout")) {                 /* a Slicer's PAD MODE Layout: 0 4 Rows, 1 16 Pads */
        inst->au_trk[tidx].layout = (uint8_t)(my_atoi(p) ? 1 : 0);
        inst->state_dirty = 1;
        return 1;
    }

    if (!strcmp(sub, "cond")) {                   /* a Slicer follows the Conductor: 0|1 (off by default) */
        inst->au_trk[tidx].cond_on = (uint8_t)(my_atoi(p) ? 1 : 0);
        inst->state_dirty = 1;
        rui_mark(inst, tidx, (int)tr->active_clip);
        return 1;
    }

    if (!strcmp(sub, "lazy")) {
        int on;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        on = my_atoi(p);
        if (!on) { if (inst->au_lazy_track == tidx) au_lazy_finish(inst); return 1; }
        au_clip_t *cl = au_key_cl(inst, tidx, c);
        if (!cl) return 1;
        c = au_key_c(inst, tidx, c);
        if (c != AU_SLC) return 1;                /* chops are a Slicer's */
        if (!cl->smp || inst->au_lazy_track >= 0) return 1;
        if ((uint64_t)cl->smp->frames > (uint64_t)cl->smp->rate * AU_SLICE_MAX_SEC) { cl->err = AU_ERR_LONG; return 1; }
        au_track_kill(inst, tidx, NULL);
        /* the hand set is put aside until the new chops are kept */
        memcpy(inst->au_lazy_bak, cl->sl, sizeof cl->sl);
        inst->au_lazy_bak_n = cl->nslices;
        inst->au_lazy_bak_even = cl->even;
        cl->trans = 0;
        inst->au_lazy_track = (int8_t)tidx;
        inst->au_lazy_clip = (int8_t)c;
        inst->au_lazy_n = 0;
        inst->au_lazy_state = AU_LAZY_ARMED;
        inst->au_lazy_pos = cl->rstart;
        return 1;
    }

    if (!strcmp(sub, "lazy_tap")) {
        if (inst->au_lazy_track != tidx) return 1;
        au_clip_t *cl = au_cl(inst, tidx, inst->au_lazy_clip);
        au_track_t *at = &inst->au_trk[tidx];
        if (!cl->smp) return 1;
        if (inst->au_lazy_state == AU_LAZY_ARMED) {
            /* the first tap: slice 1 at Start, and the sample plays once,
             * forwards, Start..End */
            uint32_t rs, re;
            uint8_t rv = cl->revrs, ov = cl->ov;
            au_range(cl, cl->smp, &rs, &re);
            cl->revrs = 0;
            cl->ov &= (uint8_t)~AU_OV_REVRS;
            au_loop_start(inst, tidx, inst->au_lazy_clip, 0, 0);
            cl->revrs = rv;
            cl->ov = ov;
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

/* ---------------- PASTE between Audio and a Slicer ----------------
 * (Josh, 2026-11-02: "we need some way to bring audio clips into slice
 * tracks. my first inclination is to allow copy and paste from audio to
 * slicer tracks." — and "Don't allow an audio clip to pasted into a
 * slucercgrack that already has a sample loaded.") */

/* Audio clip (st,sc) onto Slicer clip (dt,dc): the slot takes the clip's
 * sample and sound, the part the clip plays marked out in 16 even chops,
 * laid on (dt,dc)'s steps in order (so it sounds as the loop did) — one undo
 * step. Refused (0) when the Slicer has a sample already, the clip has none
 * loaded, or it is longer than a Slicer takes. Sync Pitch stays Pitch; Warp
 * and Vintage become Off (Snap, their match, is parked). */
static int au_paste_to_slicer(seq8_instance_t *inst, int st, int sc, int dt, int dc) {
    au_clip_t *src = au_slot(inst, st, sc), *dst = au_slot(inst, dt, AU_SLC);
    const au_sample_t *s = src->smp;
    seq8_track_t *dtr = &inst->tracks[dt];
    const clip_t *lc = &inst->tracks[st].clips[sc];
    clip_t *cl = &dtr->clips[dc];
    uint32_t rs, re, tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
    int k;
    if (inst->tracks[st].pad_mode != PAD_MODE_AUDIO || dtr->pad_mode != PAD_MODE_SLICER) return 0;
    if (dst->name[0] || !src->name[0] || !s || src->state != 2 || dtr->recording) return 0;
    if ((uint64_t)s->frames > (uint64_t)s->rate * AU_SLICE_MAX_SEC) return 0;
    au_range(src, s, &rs, &re);
    {
        double w = (double)rs + (double)lc->length * tps * au_fpt_s(src, s);
        if (w < (double)re) re = (uint32_t)(w + 0.5);
    }
    if (re <= rs + 16 * AU_GAP) return 0;
    double P = au_span_ticks(src, s, rs, re);
    undo_begin_slicer(inst, dt);
    au_track_kill(inst, dt, NULL);
    au_clip_reset(inst, dt, AU_SLC);
    snprintf(dst->name, sizeof dst->name, "%s", src->name);
    dst->pitch = src->pitch; dst->detune = src->detune; dst->gain_db = src->gain_db;
    dst->revrs = src->revrs;
    dst->bpm10 = src->bpm10;
    dst->sync = src->sync == AU_SYNC_PITCH ? AU_SLC_SYNC_PITCH : AU_SLC_SYNC_OFF;
    for (k = 0; k < AU_MAX_SLICES; k++) dst->sl[k].start = dst->sl[k].end = 0;
    for (k = 0; k < 16; k++) dst->sl[k].start = rs + (uint32_t)((uint64_t)(re - rs) * (uint32_t)k / 16u);
    if (re < s->frames) dst->sl[15].end = re;      /* the last chop ends where the clip did */
    dst->nslices = 16;
    au_request_load(inst, dt, AU_SLC);
    /* the steps: chop k where it falls in the loop, the clip as long */
    if (dc == dtr->active_clip) silence_track_notes_v2(inst, dtr);
    clip_wipe_notes(cl);
    cl->ticks_per_step = (uint16_t)tps;
    cl->loop_start = 0;
    cl->length = lc->length;
    for (k = 0; k < 16 && P > 0; k++) {
        uint32_t tick = (uint32_t)((double)k * P / 16.0 + 0.5);
        uint32_t gate = (uint32_t)(P / 16.0 + 0.5);
        if (tick / tps >= (uint32_t)SEQ_STEPS) break;
        clip_insert_note(cl, tick, (uint16_t)(gate < 1 ? 1 : gate > 65535 ? 65535 : gate),
                         (uint8_t)(AU_NOTE_BASE + k), (uint8_t)SEQ_VEL);
    }
    clip_note_finalize(inst, cl, dt, dc);
    au_mark(inst, dt, AU_SLC);
    return 1;
}

/* A Slicer's clip onto Audio clip (dt,dc): the Slicer's sample and sound
 * into it, the whole file, as long as the sample in bars at its Tempo; the
 * steps go (an Audio clip has none to play). One undo step. 0: the Slicer
 * has no sample loaded. */
static int au_paste_to_audio(seq8_instance_t *inst, int st, int dt, int dc) {
    au_clip_t *src = au_slot(inst, st, AU_SLC), *dst;
    const au_sample_t *s = src->smp;
    seq8_track_t *dtr = &inst->tracks[dt];
    clip_t *cl = &dtr->clips[dc];
    if (inst->tracks[st].pad_mode != PAD_MODE_SLICER || dtr->pad_mode != PAD_MODE_AUDIO) return 0;
    if (!src->name[0] || !s || src->state != 2 || dtr->recording) return 0;
    undo_begin_single(inst, dt, dc);
    au_clip_reset(inst, dt, dc);
    dst = au_slot(inst, dt, dc);
    snprintf(dst->name, sizeof dst->name, "%s", src->name);
    dst->pitch = src->pitch; dst->detune = src->detune; dst->gain_db = src->gain_db;
    dst->revrs = src->revrs;
    dst->bpm10 = src->bpm10;
    dst->sync = src->sync == AU_SLC_SYNC_PITCH ? AU_SYNC_PITCH : AU_SYNC_WARP;
    au_request_load(inst, dt, dc);
    if (dc == dtr->active_clip) silence_track_notes_v2(inst, dtr);
    clip_wipe_notes(cl);
    {
        double bars = (double)s->frames / (double)s->rate * (dst->bpm10 ? dst->bpm10 / 10.0 : 120.0) / 240.0;
        int nb = (int)(bars + 0.5);
        au_clip_set_bars(inst, dt, dc, nb < 1 ? 1 : nb > SEQ_STEPS ? SEQ_STEPS : nb);
    }
    clip_note_finalize(inst, cl, dt, dc);
    au_mark(inst, dt, dc);
    return 1;
}

/* The kind a pad mode is for pasting: 1 Audio, 2 Slicer, 0 anything else. */
static int au_kind(uint8_t pm) {
    return pm == PAD_MODE_AUDIO ? 1 : pm == PAD_MODE_SLICER ? 2 : 0;
}

/* tN_au_* reads. Returns -1 when the key is not one of ours. */
static int au_get_param(seq8_instance_t *inst, const char *key, char *out, int out_len) {
    int t, c, l;
    if (key[0] != 't' || key[1] < '0' || key[1] > '7' || strncmp(key + 2, "_au_", 4)) return -1;
    t = key[1] - '0';
    for (c = 0; c <= AU_SLC; c++) au_trans_settle(au_slot(inst, t, c));   /* a read sees the knob's last turn */
    const char *k = key + 6;
    if (!strcmp(k, "on")) return snprintf(out, out_len, "%d", pad_mode_sampled(inst->tracks[t].pad_mode));
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
    if (!strncmp(k, "progress_", 9)) {           /* progress_C: "done total" frames while the loader reads clip C, else "0 0" */
        c = atoi(k + 9);
        if (inst->tracks[t].pad_mode == PAD_MODE_SLICER) c = AU_SLC;
        if (c >= 0 && c <= AU_SLC && au_ld_key == t * (NUM_CLIPS + 1) + c)
            return snprintf(out, out_len, "%u %u", (unsigned)au_ld_done, (unsigned)au_ld_total);
        return snprintf(out, out_len, "0 0");
    }
    if (!strncmp(k, "info_", 5)) {
        /* "state err mode even nslices jump rstart rend pitch gain frames rate ch
         *  revrs nudge jmpq count detune sync reach bpm10 hits sens trans slen rot shot|name"
         *  -- rstart / rend: what the clip plays of the sample, in frames, once
         *  loaded (Start + Length at the sample's Tempo — a Loop clip's Length
         *  its own; rend stops at the file); reach: how much of that sounds before the clip comes round
         *  (Nudge taken off); bpm10: the sample's own Tempo x10 (0 not known yet);
         *  hits: Transient's chops in it; slen: Slice's Length in ticks (0 = to
         *  the end) */
        c = my_atoi(k + 5);
        if (c < 0 || c > AU_SLC) return -1;
        au_clip_t *cl = au_key_cl(inst, t, c);
        if (!cl) return -1;
        const au_sample_t *s = cl->smp;
        uint32_t rs = cl->rstart, re = cl->rstart;
        if (s) au_range(cl, s, &rs, &re);
        uint32_t reach = re > rs ? re - rs : 0;
        if (s && reach && cl->mode == AU_MODE_LOOP) {
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
        /* a Loop clip reads on past its window (au_range); what it PLAYS ends
         * at Start + its length, and that is the end the screen shows */
        uint32_t ve = re;
        if (s && cl->mode == AU_MODE_LOOP) {
            const clip_t *lc = &inst->tracks[t].clips[c];
            uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
            double w = (double)rs + (double)lc->length * tps * au_fpt_s(cl, s);
            ve = w >= (double)re ? re : (uint32_t)(w + 0.5);
        }
        return snprintf(out, out_len, "%d %d %d %d %d %d %u %u %d %d %u %u %d %d %d %d %d %d %d %u %d %u %d %d %u %u %d|%s",
                        cl->state, cl->err, cl->mode, cl->even, cl->nslices, cl->jump,
                        (unsigned)rs, (unsigned)ve, au_pitch(cl), au_gain(cl),
                        s ? (unsigned)s->frames : 0u, s ? (unsigned)s->rate : 0u, s ? s->ch : 0,
                        au_revrs(cl), cl->nudge_ms, cl->jmpq, au_count(cl), au_detune(cl), cl->sync, (unsigned)reach, au_bpm10(cl),
                        (unsigned)au_hit_count_cached(cl, rs, re), cl->sens, cl->trans, (unsigned)cl->slen, (unsigned)cl->rot, (int)cl->shot, cl->name);
    }
    if (!strncmp(k, "sl_", 3)) {                  /* sl_C_L: "a b pinned pitch gain rev play atk dec detune" */
        const char *q = k + 3;
        c = my_atoi(q);
        q = strchr(q, '_');
        if (!q || c < 0 || c > AU_SLC) return -1;
        l = my_atoi(q + 1);
        if (l < 0 || l >= AU_MAX_SLICES) return -1;
        const au_clip_t *cl = au_key_cl(inst, t, c);
        if (!cl) return -1;
        au_slice_t se;                            /* as it plays: ALL SLICES' lanes over it */
        const au_slice_t *sl = &se;
        uint32_t a = 0, b = 0;
        au_sl_eff(cl, l, &se);
        if (cl->smp) au_slice_range(cl, cl->smp, l, &a, &b);
        return snprintf(out, out_len, "%u %u %d %d %d %d %d %d %d %d", (unsigned)a, (unsigned)b,
                        !cl->even && l < cl->nslices && sl->end ? 1 : 0,
                        sl->pitch, sl->gain_db, sl->rev, sl->play, sl->attack_ms, sl->decay_ms, sl->detune);
    }
    if (!strncmp(k, "all_", 4)) {                 /* ALL SLICES: "pitch gain rev atk dec play detune", "x" where slices differ */
        int f, n = 0;
        c = my_atoi(k + 4);
        if (c < 0 || c > AU_SLC) return -1;
        const au_clip_t *cl = au_key_cl(inst, t, c);
        if (!cl) return -1;
        int cnt = au_count(cl);
        out[0] = '\0';
        for (f = 0; f < 7; f++) {
            int v0 = 0, same = 1;
            for (l = 0; l < cnt; l++) {
                au_slice_t se;
                const au_slice_t *sl = &se;
                au_sl_eff(cl, l, &se);
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
        if (c < 0 || c > AU_SLC) return -1;
        const au_clip_t *cl = au_key_cl(inst, t, c);
        if (!cl) return -1;
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
        if (c < 0 || c > AU_SLC || !au_key_cl(inst, t, c)) return -1;
        const au_sample_t *s = au_key_cl(inst, t, c)->smp;
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
        if (c < 0 || c > AU_SLC || !au_key_cl(inst, t, c) || !(q = strchr(q, '_'))) return -1;
        A = strtol(q + 1, NULL, 10);
        if (!(q = strchr(q + 1, '_'))) return -1;
        B = strtol(q + 1, NULL, 10);
        const au_sample_t *s = au_key_cl(inst, t, c)->smp;
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
        if (at->w.on && at->w.live) {
            /* Warp has no voice: the frame under the clock, on the clip's map —
             * also while a launch waits for the new clip's first frame (the old
             * one still sounding), or the playhead blinked out for a block on
             * every switch */
            const au_clip_t *cl = au_cl(inst, t, at->w.clip);
            const au_sample_t *s = cl->smp;
            uint32_t rs, re;
            if (s) {
                au_range(cl, s, &rs, &re);
                double P = au_span_ticks(cl, s, rs, re), fpt = 0;
                au_warper_t *X = (au_warper_t *)inst->au_warper;
                double L = 0;
                if (X && X->trk[t]) { fpt = X->trk[t]->cmd.fpt; L = X->trk[t]->cmd.L; }
                if (P > 0 && fpt > 0 && re > rs) {
                    double wt = L > 0 ? au_wrap(at->w.tick - au_wrap((double)cl->rot, L), L) : at->w.tick;
                    double x = (wt - (double)cl->nudge_ms * 44.1 / fpt) * (double)(re - rs) / P;
                    if (x >= 0 && x < (double)(re - rs))
                        return snprintf(out, out_len, "1 %u -1", au_revrs(cl) ? re - 1 - (uint32_t)x : rs + (uint32_t)x);
                }
            }
        }
        return snprintf(out, out_len, "0 0 -1");
    }
    if (!strcmp(k, "warp")) {                     /* Warp, for the device check: "<anchors> <state> <last wait frames> <underruns>" */
        const au_warp_trk_t *w = &inst->au_trk[t].w;
        return snprintf(out, out_len, "%u %d %u %u", (unsigned)w->gen, (int)w->state, (unsigned)w->last_wait,
                        (unsigned)inst->au_underruns);
    }
    if (!strcmp(k, "layout")) return snprintf(out, out_len, "%d", (int)inst->au_trk[t].layout);
    if (!strcmp(k, "cond")) return snprintf(out, out_len, "%d", (int)inst->au_trk[t].cond_on);
    if (!strcmp(k, "lazy")) {                     /* "<state AU_LAZY_*> <slices> <frame>" */
        int on = inst->au_lazy_track == t;
        return snprintf(out, out_len, "%d %d %u", on ? inst->au_lazy_state : 0, on ? inst->au_lazy_n : 0,
                        on ? (unsigned)inst->au_lazy_pos : 0u);
    }
    return -1;
}
