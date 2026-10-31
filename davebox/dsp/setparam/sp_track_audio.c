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
 *   tN_au_set_<field>   "C <v>"    mode / even (0 Off, 2..32) / start (frames)
 *                                  / slen (Slice's Length, ticks; 0 = to the
 *                                  end) / pitch / gain / bpm (the sample's own
 *                                  Tempo x10) / orig (Tempo = the project's) /
 *                                  len_bars (the clip's length) / revrs / nudge
 *                                  / sync (0 Warp, 1 Vintage, 2 Pitch) / sens
 *                                  (Transient's).
 *                                  Mode Slice on a clip with no steps lays the
 *                                  chops on them
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
 *   tN_au_even_bake "C"            Even's (or Transient's) slices become the hand
 *                                  set; the override Off (a hand edit made
 *                                  while one is on bakes it first)
 *   tN_au_set_trans "C 1|0"        Transient chops: 1 on (Even Off), 0 cancel —
 *                                  the hand set was never touched. Not saved
 *   tN_au_trans_bake "C"           Transient's chops become the hand set
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

/* The loader's answers, once per block. A pick that lands sets a Loop clip's
 * length to the sample's, in whole bars at the tempo (at least one). */
static void au_apply_results(seq8_instance_t *inst) {
    au_drop_retry(inst);                        /* releases that found the ring full */
    for (;;) {
        uint32_t t = inst->au_res_tail, h = __atomic_load_n(&inst->au_res_head, __ATOMIC_ACQUIRE);
        if (t == h) return;
        au_res_t r = inst->au_res[t & (AU_RING - 1)];
        __atomic_store_n(&inst->au_res_tail, t + 1, __ATOMIC_RELEASE);
        if (r.track >= NUM_TRACKS || r.clip >= NUM_CLIPS) { au_drop(inst, r.smp); continue; }
        au_clip_t *cl = &inst->au_clip[r.track][r.clip];
        if (r.gen != cl->gen) { au_drop(inst, r.smp); continue; }       /* superseded */
        if (r.edit && !r.smp) {
            /* a Trim / Normalize that failed: the clip keeps the sample it had */
            cl->state = cl->smp ? 2 : 3;
            cl->err = r.err;
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
                 * positions where the audio went */
                au_clip_shift(cl, r.cut, r.smp->frames);
                if (r.ow && old) {
                    /* overwritten: every other clip on that file reloads it,
                     * its positions moved the same way */
                    int t2, c2;
                    for (t2 = 0; t2 < NUM_TRACKS; t2++)
                        for (c2 = 0; c2 < NUM_CLIPS; c2++) {
                            au_clip_t *o = &inst->au_clip[t2][c2];
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
                /* a new sample: the whole of it, and a hand set of one slice
                 * (frames of the old one mean nothing here) */
                int l;
                cl->rstart = cl->slen = 0;
                cl->nslices = 1;
                for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].start = cl->sl[l].end = 0;
            }
            au_trans_calc(cl);
            /* the sample's own Tempo: the loader's guess for a new sample, or
             * one a project never set */
            if ((was_pick || !cl->bpm10) && r.bpm10) cl->bpm10 = r.bpm10;
            if (was_pick && cl->mode == AU_MODE_LOOP) {
                /* a Loop clip as long as the sample, in whole bars at its Tempo */
                double bars = (double)r.smp->frames / (double)r.smp->rate * (cl->bpm10 ? cl->bpm10 / 10.0 : 120.0) / 240.0;
                int nb = (int)(bars + 0.5);
                au_clip_set_bars(inst, r.track, r.clip, nb < 1 ? 1 : nb > 64 ? 64 : nb);
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
                if (inst->tracks[t].pad_mode == PAD_MODE_AUDIO && v->active && v->smp && !v->smp->pcm) {
                    s = v->smp; pos = v->pos; step = v->step; lo = v->lo; hi = v->hi; loop = v->loop || v->mode_loop;
                    if (v->whi > v->wlo && pos >= v->wlo && pos < v->whi) { lo = v->wlo; hi = v->whi; loop = 1; }
                }
            } else {
                /* the spare slot: Warp's stretcher, where it reads */
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
    au_clip_t *cl = &inst->au_clip[t][c];
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
    cmd.pitch = au_tune(cl->pitch + inst->au_trk[t].cond, cl->detune);   /* the Conductor's, held till the wrap on Next */
    cmd.drift = w->drift;
    cmd.anchor_tick = w->cur_anchor;
    cmd.anchor_gen = w->gen;
    cmd.revrs = cl->revrs;
    cmd.run = 1;
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
    gn = au_db(inst->au_clip[t][w->clip].gain_db) * 32767.f / 64.f;
    go = au_db(inst->au_clip[t][w->oclip].gain_db) * 32767.f / 64.f;
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
    au_clip_t *cl = &inst->au_clip[t][c];
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
        uint32_t a = cl->revrs ? re - (uint32_t)x1 : rs + (uint32_t)x0;
        uint32_t b = cl->revrs ? re - (uint32_t)x0 : rs + (uint32_t)x1;
        uint32_t off = (uint32_t)(pd[i] * fscale);
        au_range_on(inst, t, c, AU_SLICE_NONE, a, b, 1.0f, off >= (uint32_t)frames ? (uint32_t)frames - 1 : off, 1);
        i = e;
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
            au_warp_off(inst, t);
            continue;
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
            au_clip_t *cl = &inst->au_clip[t][c];
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
                double ratio = au_tune(cl->pitch + at->cond, cl->detune) * (double)cl->smp->rate / 44100.0;
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
                 * each tick): the clip is at tick - 1, at this block's first
                 * frame. Read as-is, a loop launched on a tick began one tick
                 * into the sample and cut its first hit (measured on the
                 * device: 230 frames at 120 bpm). A block with no tick yet
                 * (the transport's first) is at `tick`. */
                int ticked = (uint64_t)inst->arp_master_tick != inst->au_tick0;
                double played = (ticked && tick > 0) ? (double)(tick - 1) : (double)tick;
                if (tick < 0) tick = 0;
                if (!warp) au_warp_off(inst, t);
                if (warp) {
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
                    if (lv && fill > 0) lv->step = cl->revrs ? -fill : fill;
                    /* Shift: the sample's start falls `rot` ticks into the clip,
                     * its end wrapping round before it — the voice starts again
                     * there, as at the loop's top */
                    double Lp = (double)lc->length * tps;
                    double rot = Lp > 0 ? au_wrap((double)cl->rot, Lp) : 0.0;
                    int at_rot = rot > 0 && at->last_tick >= 0 && (double)at->last_tick < rot && (double)tick >= rot;
                    if (!lv || at->loop_clip != c || tick < at->last_tick || at_rot) {
                        /* Nudge: the sample starts that much later (+) or earlier
                         * (-) against the bar. */
                        /* the Shift's point is a loop top of its own: the voice
                         * starts at the block the tick falls in, as at the
                         * wrap (where `played` is 0); anywhere else, the
                         * rotated time */
                        double pr = at_rot ? (double)tick - rot : rot > 0 ? au_wrap(played - rot, Lp) : played;
                        double off = fill > 0 ? (pr * fpt - (double)cl->nudge_ms * 44.1) * fill
                                              : pr * fpt * ratio - (double)cl->nudge_ms * (double)cl->smp->rate / 1000.0;
                        au_loop_start(inst, t, c, off, fill);
                    }
                }
                at->last_tick = tick;
            } else {
                if (lv) au_voice_release(lv, 64);
                if (at->sync_on) { au_release_chops(at); at->sync_on = 0; }
                at->last_tick = -1;
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
        if (!any) continue;
        {
            int32_t acc[256];
            int16_t out[256];
            /* Mute / solo silence the track's output, as on a bus: the
             * voices keep running, the level ramps over 64 frames. */
            int mtarget = effective_mute(inst, t) ? 0 : 64;
            memset(acc, 0, sizeof acc);
            for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) inst->au_underruns += au_voice_render(&at->v[i], acc, frames);
            if (at->w.on || at->w.fadeout || at->w.hold) au_warp_mix(inst, t, acc, frames);
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

/* Whichever override is on becomes the hand set: Transient's chops (each
 * end home), else Even's. */
static void au_gen_bake(au_clip_t *cl) {
    int k;
    if (cl->trans) {
        if (cl->smp && cl->tr_n) {
            for (k = 0; k < cl->tr_n; k++) {
                cl->sl[k].start = cl->tr_at[k];
                cl->sl[k].end = 0;
            }
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

    /* pick: one undo step; pick_join: part of the step already taken (In
     * place and Flatten: tN_au_undo, then the clip's reset, then this) */
    if (!strcmp(sub, "pick") || !strcmp(sub, "pick_join")) {
        au_req_t r;
        c = au_arg_clip(&p);
        if (c < 0 || *p != '|' || !p[1]) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        if (sub[4] == '\0') undo_begin_single(inst, tidx, c);
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
        if (sscanf(p, "%d %d", &op, &ow) < 1) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        if (!cl->smp || cl->state != 2 || !cl->name[0]) return 1;
        memset(&r, 0, sizeof r);
        r.kind = AU_REQ_EDIT;
        r.track = (uint8_t)tidx; r.clip = (uint8_t)c;
        r.op = op ? AU_EDIT_NORM : AU_EDIT_TRIM;
        r.ow = ow ? 1 : 0;
        snprintf(r.path, sizeof r.path, "%s", cl->name);
        au_samples_dir(inst, r.dir, sizeof r.dir);
        if (!r.dir[0]) return 1;
        if (r.op == AU_EDIT_TRIM) {
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
        if (!r.ow) undo_begin_single(inst, tidx, c);
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
        while (n < NUM_CLIPS && (c = au_arg_clip(&p)) >= 0) cs[n++] = (uint8_t)c;
        undo_begin_track_clips(inst, tidx, cs, n);
        return 1;
    }

    if (!strcmp(sub, "clear")) {
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        undo_begin_single(inst, tidx, c);
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
            cl->trans = 0;
        } else if (!strcmp(w, "trans")) {
            /* Transient: an override as Even is; 0 cancels it */
            if (v) {
                if (!cl->smp) return 1;
                if ((uint64_t)cl->smp->frames > (uint64_t)cl->smp->rate * AU_SLICE_MAX_SEC) { cl->err = AU_ERR_LONG; return 1; }
                cl->even = 0;
                cl->trans = 1;
                au_trans_calc(cl);
            } else {
                cl->trans = 0;
            }
        } else if (!strcmp(w, "start")) {
            /* frames, short of the sample's end by a slice at least.
             * Unloaded, taken as given. */
            uint32_t fr = cl->smp ? cl->smp->frames : 0;
            if (v < 0) v = 0;
            if (fr && fr <= AU_GAP) return 1;
            cl->rstart = fr ? (uint32_t)clamp_i(v, 0, (int)(fr - AU_GAP)) : (uint32_t)v;
            au_trans_calc(cl);
        } else if (!strcmp(w, "slen")) {
            /* Slice: Length from Start, ticks at the sample's Tempo (0 = to
             * its end). A Loop clip's Length is the clip's own. */
            cl->slen = (uint32_t)(v < 0 ? 0 : v);
            au_trans_calc(cl);
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
        } else if (!strcmp(w, "sync")) {
            v = clamp_i(v, 0, AU_SYNC_MAX);
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
            au_trans_calc(cl);
        } else if (!strcmp(w, "sens")) {
            cl->sens = (uint8_t)clamp_i(v, 0, 100);           /* Transient: which hits count */
            au_trans_calc(cl);
        } else if (!strcmp(w, "nudge")) {
            cl->nudge_ms = (int16_t)clamp_i(v, -500, 500);
        } else if (!strcmp(w, "rot")) {
            /* Shift: ticks, taken mod the clip's length where it plays */
            cl->rot = (uint32_t)(v < 0 ? 0 : v);
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
        au_clip_t *cl = &inst->au_clip[tidx][c];
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
        au_gen_bake(&inst->au_clip[tidx][c]);
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
        cl->trans = 0;
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
         *  revrs nudge jmpq count detune sync reach bpm10 hits sens trans slen|name"
         *  -- rstart / rend: what the clip plays of the sample, in frames, once
         *  loaded (Start + Length at the sample's Tempo — a Loop clip's Length
         *  its own; rend stops at the file); reach: how much of that sounds before the clip comes round
         *  (Nudge taken off); bpm10: the sample's own Tempo x10 (0 not known yet);
         *  hits: Transient's chops in it; slen: Slice's Length in ticks (0 = to
         *  the end) */
        c = my_atoi(k + 5);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
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
        return snprintf(out, out_len, "%d %d %d %d %d %d %u %u %d %d %u %u %d %d %d %d %d %d %d %u %d %u %d %d %u %u|%s",
                        cl->state, cl->err, cl->mode, cl->even, cl->nslices, cl->jump,
                        (unsigned)rs, (unsigned)ve, cl->pitch, cl->gain_db,
                        s ? (unsigned)s->frames : 0u, s ? (unsigned)s->rate : 0u, s ? s->ch : 0,
                        cl->revrs, cl->nudge_ms, cl->jmpq, au_count(cl), cl->detune, cl->sync, (unsigned)reach, cl->bpm10,
                        (unsigned)(s ? au_hit_count(s, rs, re, cl->sens) : 0), cl->sens, cl->trans, (unsigned)cl->slen, (unsigned)cl->rot, cl->name);
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
        if (at->w.on && at->w.live) {
            /* Warp has no voice: the frame under the clock, on the clip's map —
             * also while a launch waits for the new clip's first frame (the old
             * one still sounding), or the playhead blinked out for a block on
             * every switch */
            const au_clip_t *cl = &inst->au_clip[t][at->w.clip];
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
                        return snprintf(out, out_len, "1 %u -1", cl->revrs ? re - 1 - (uint32_t)x : rs + (uint32_t)x);
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
    if (!strcmp(k, "lazy")) {                     /* "<state AU_LAZY_*> <slices> <frame>" */
        int on = inst->au_lazy_track == t;
        return snprintf(out, out_len, "%d %d %u", on ? inst->au_lazy_state : 0, on ? inst->au_lazy_n : 0,
                        on ? (unsigned)inst->au_lazy_pos : 0u);
    }
    return -1;
}
