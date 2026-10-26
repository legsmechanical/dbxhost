/* FILE-SCOPE HANDLER for set_param()'s tN_au_* AUDIO TRACK keys, plus the
 * audio thread's per-block work (au_render) and get_param's tN_au_* reads --
 * part of the seq8.c single translation unit; #included at FILE scope by
 * seq8_set_param.c, NOT a standalone TU. Engine: seq8_audio.c.
 *
 * Keys (C = clip, L = slice / lane, all 0-based):
 *   tN_au_on      "0|1"            the track is an Audio track (it must already be
 *                                  a drum track: the UI converts first); 0 drops
 *                                  every clip's sample association
 *   tN_au_pick    "C|<abs path>"   copy the file into the project, load it
 *   tN_au_clear   "C"              the clip has no sample
 *   tN_au_set     "C <field> <v>"  mode / slices / jump / start / end / pitch / gain
 *   tN_au_slice   "C L <field> <v>" pos (frames; makes it Manual) / nudge / len /
 *                                  pitch / gain / rev / play / atk / dec
 *   tN_au_chop    "C"              one trig per slice, in order (one undo)
 *   tN_au_jump    "K 1|0"          Loop: jump the playing loop to point K (press);
 *                                  stopped, a press auditions from there (release ends)
 *   tN_au_lazy    "C 1|0"          Lazy chop: play the sample, taps cut it
 *   tN_au_lazy_tap ""              a tap: the next slice starts here
 * The prefix is consumed whole (a known-or-not tN_au_ key never falls through
 * to the pfx catch-all). */

static void au_mark(seq8_instance_t *inst, int t, int c) {
    rui_mark(inst, t, c);
    inst->state_dirty = 1;
}

/* Set every lane of drum clip (t,c) to `bars` bars, at the clip's own
 * resolution when that fits, else the coarsest that does — but a resolution
 * is only changed on lanes with no notes. */
static void au_clip_set_bars(seq8_instance_t *inst, int t, int c, int bars) {
    seq8_track_t *tr = &inst->tracks[t];
    drum_clip_t *dc = tr->drum_clips[c];
    int l;
    if (!dc || bars < 1) return;
    for (l = 0; l < DRUM_LANES; l++) {
        clip_t *cl = &dc->lanes[l].clip;
        uint32_t ticks = (uint32_t)bars * PPQN * 4;
        uint16_t tps = cl->ticks_per_step ? cl->ticks_per_step : 24;
        int k;
        if (ticks / tps > SEQ_STEPS && cl->note_count == 0)
            for (k = 0; k < 6; k++) if (TPS_VALUES[k] >= tps && ticks / TPS_VALUES[k] <= SEQ_STEPS) { tps = TPS_VALUES[k]; break; }
        cl->ticks_per_step = tps;
        int len = (int)(ticks / tps);
        int max_len = SEQ_STEPS - (int)cl->loop_start;
        cl->length = (uint16_t)clamp_i(len, 1, max_len < 1 ? 1 : max_len);
        if (c == tr->active_clip) {
            uint16_t le = (uint16_t)(cl->loop_start + cl->length);
            if (tr->drum_current_step[l] < cl->loop_start || tr->drum_current_step[l] >= le)
                tr->drum_current_step[l] = cl->loop_start;
            if (inst->playing) drum_lane_anchor_playhead(inst, tr, l, cl);
        }
        clip_migrate_to_notes(cl);
    }
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
        int picked = strcmp(cl->name, r.name) != 0 || cl->state == 1;
        if (old) { au_track_kill(inst, r.track, old); au_drop(inst, old); }
        cl->smp = r.smp;
        cl->err = r.err;
        cl->state = r.smp ? 2 : 3;
        if (r.smp) {
            int was_pick = cl->name[0] == '\0' || strcmp(cl->name, r.name) != 0;
            snprintf(cl->name, sizeof cl->name, "%s", r.name);
            if (was_pick && cl->mode == AU_MODE_LOOP) {
                double bpm = inst->tracks[r.track].pfx.cached_bpm > 0 ? inst->tracks[r.track].pfx.cached_bpm : 120.0;
                double bars = (double)r.smp->frames / (double)r.smp->rate * bpm / 240.0;
                int nb = (int)(bars + 0.5);
                au_clip_set_bars(inst, r.track, r.clip, nb < 1 ? 1 : nb);
            }
            au_mark(inst, r.track, r.clip);
        }
        (void)picked;
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
        if (!tr->audio) {
            for (i = 0; i < AU_VOICES; i++) at->v[i].active = 0;
            continue;
        }
        /* Loop mode: the voice follows the clip — starts with it, restarts on
         * each pass, stops with it. Lazy chop owns the track while it runs. */
        if (inst->au_lazy_track != t) {
            int c = tr->active_clip;
            au_clip_t *cl = &inst->au_clip[t][c];
            drum_clip_t *dc = tr->drum_clips[c];
            au_voice_t *lv = au_loop_voice(at);
            int run = inst->playing && tr->clip_playing && cl->mode == AU_MODE_LOOP && cl->smp && dc &&
                      !effective_mute(inst, t);
            if (run) {
                clip_t *lc = &dc->lanes[0].clip;
                uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : 24;
                int32_t tick = (int32_t)(((int)tr->drum_current_step[0] - (int)lc->loop_start) * (int32_t)tps
                                         + (int32_t)tr->drum_tick_in_step[0]);
                if (tick < 0) tick = 0;
                if (!lv || at->loop_clip != c || tick < at->last_tick) {
                    double bpm = tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0;
                    double fpt = 44100.0 * 60.0 / (bpm * PPQN);
                    double off = (double)tick * fpt * au_semi(cl->pitch) * (double)cl->smp->rate / 44100.0;
                    au_loop_start(inst, t, c, off);
                }
                at->last_tick = tick;
            } else {
                if (lv) au_voice_release(lv, 64);
                at->last_tick = -1;
            }
        }
        for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) { any = 1; break; }
        if (!any) continue;
        {
            int32_t acc[256];
            int16_t out[256];
            memset(acc, 0, sizeof acc);
            for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) au_voice_render(&at->v[i], acc, frames);
            for (f = 0; f < frames * 2; f++) {
                int32_t v = acc[f];
                out[f] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
            }
            if (g_ext && g_ext->slot_audio_feed)
                g_ext->slot_audio_feed((int)tr->pfx.slot, out, (uint32_t)frames);
        }
    }
    /* Lazy chop: its voice ran to the end -> the chop is done. */
    if (inst->au_lazy_track >= 0) {
        au_track_t *at = &inst->au_trk[inst->au_lazy_track];
        int live = 0;
        for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) { live = 1; inst->au_lazy_pos = (uint32_t)at->v[i].pos; }
        if (!live) au_lazy_finish(inst);
    }
}

/* Even -> hand-set: the slices' starts become what Even was computing. */
static void au_to_manual(au_clip_t *cl) {
    int k;
    if (cl->method != AU_METH_EVEN || !cl->smp) { cl->method = AU_METH_MANUAL; return; }
    for (k = 0; k < cl->nslices; k++) {
        uint32_t a = 0, b = 0;
        if (au_slice_range(cl, cl->smp, k, &a, &b)) cl->sl[k].start = a;
    }
    cl->method = AU_METH_MANUAL;
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

static void au_word(const char **pp, char *w, size_t n) {
    const char *p = *pp;
    size_t k = 0;
    while (*p == ' ') p++;
    while (*p && *p != ' ' && k + 1 < n) w[k++] = *p++;
    w[k] = '\0';
    *pp = p;
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

    if (!strcmp(sub, "on")) {
        int on = my_atoi(val) ? 1 : 0;
        if (on && tr->pad_mode != PAD_MODE_DRUM) return 1;     /* the UI converts to drums first */
        if (!on && tr->audio) {
            /* Leaving Audio: the clips forget their samples (the files stay in
             * the project until a purge). */
            au_track_kill(inst, tidx, NULL);
            for (c = 0; c < NUM_CLIPS; c++) {
                au_clip_t *cl = &inst->au_clip[tidx][c];
                uint32_t gen = cl->gen;
                au_drop(inst, cl->smp);
                memset(cl, 0, sizeof *cl);
                cl->gen = gen + 1;
                cl->mode = AU_MODE_LOOP; cl->nslices = 8; cl->jump = 16; cl->rend = 1000;
                for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].len_pct = 100;
            }
        }
        if (on && !tr->audio) {
            /* One lane per slice, each its own note, whatever the drum kit was. */
            for (c = 0; c < NUM_CLIPS; c++) {
                drum_clip_t *dc = tr->drum_clips[c];
                if (!dc) continue;
                for (l = 0; l < DRUM_LANES; l++) dc->lanes[l].midi_note = (uint8_t)(DRUM_BASE_NOTE + l);
            }
            tr->fx_post = 0;
        }
        tr->audio = (uint8_t)on;
        au_mark(inst, tidx, tr->active_clip);
        return 1;
    }

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
        au_track_kill(inst, tidx, cl->smp);
        au_drop(inst, cl->smp);
        cl->smp = NULL;
        cl->name[0] = '\0';
        cl->state = 0;
        cl->gen++;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "set")) {
        int v;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        au_word(&p, w, sizeof w);
        v = my_atoi(p);
        if (!strcmp(w, "mode")) {
            v = clamp_i(v, 0, 1);
            if (v == AU_MODE_SLICE && cl->smp &&
                (uint64_t)cl->smp->frames > (uint64_t)cl->smp->rate * AU_SLICE_MAX_SEC) {
                cl->err = AU_ERR_LONG;             /* the UI says "over 4 minutes" */
                return 1;
            }
            if (v != cl->mode) au_track_kill(inst, tidx, NULL);
            cl->mode = (uint8_t)v;
        } else if (!strcmp(w, "slices")) {
            cl->nslices = (uint8_t)clamp_i(v, 1, AU_MAX_SLICES);
            cl->method = AU_METH_EVEN;
        } else if (!strcmp(w, "jump")) {
            int d = v <= 2 ? 2 : v <= 4 ? 4 : v <= 8 ? 8 : v <= 16 ? 16 : 32;
            cl->jump = (uint8_t)d;
        } else if (!strcmp(w, "start")) {
            cl->rstart = (uint16_t)clamp_i(v, 0, cl->rend - 1);
        } else if (!strcmp(w, "end")) {
            cl->rend = (uint16_t)clamp_i(v, cl->rstart + 1, 1000);
        } else if (!strcmp(w, "pitch")) {
            cl->pitch = (int8_t)clamp_i(v, -24, 24);
        } else if (!strcmp(w, "gain")) {
            cl->gain_db = (int8_t)clamp_i(v, -40, 12);
        } else if (!strcmp(w, "bars")) {
            au_clip_set_bars(inst, tidx, c, clamp_i(v, 1, 64));
            return 1;
        } else {
            return 1;
        }
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "slice")) {
        int v;
        c = au_arg_clip(&p);
        if (c < 0) return 1;
        while (*p == ' ') p++;
        l = my_atoi(p);
        while (*p && *p != ' ') p++;
        if (l < 0 || l >= AU_MAX_SLICES) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        au_slice_t *sl = &cl->sl[l];
        au_word(&p, w, sizeof w);
        v = my_atoi(p);
        if (!strcmp(w, "pos")) {
            /* A slice's start, by hand: between its neighbours. */
            if (!cl->smp || l >= cl->nslices) return 1;
            au_to_manual(cl);
            int lo = l > 0 ? (int)cl->sl[l - 1].start + 32 : 0;
            int hi = l + 1 < cl->nslices ? (int)cl->sl[l + 1].start - 32 : (int)cl->smp->frames - 32;
            if (hi < lo) return 1;
            sl->start = (uint32_t)clamp_i(v, lo, hi);
        }
        else if (!strcmp(w, "nudge")) sl->nudge_ms = (int16_t)clamp_i(v, -500, 500);
        else if (!strcmp(w, "len"))   sl->len_pct = (uint8_t)clamp_i(v, 1, 100);
        else if (!strcmp(w, "pitch")) sl->pitch = (int8_t)clamp_i(v, -24, 24);
        else if (!strcmp(w, "gain"))  sl->gain_db = (int8_t)clamp_i(v, -40, 12);
        else if (!strcmp(w, "rev"))   sl->rev = (uint8_t)(v ? 1 : 0);
        else if (!strcmp(w, "play"))  sl->play = (uint8_t)clamp_i(v, 0, 2);
        else if (!strcmp(w, "atk"))   sl->attack_ms = (uint16_t)clamp_i(v, 0, 2000);
        else if (!strcmp(w, "dec"))   sl->decay_ms = (uint16_t)clamp_i(v, 0, 5000);
        else return 1;
        au_mark(inst, tidx, c);
        return 1;
    }

    if (!strcmp(sub, "chop")) {
        /* One trig per slice, where the slice sits in the sample, so the clip
         * plays the sample back as it was — now as slices. Every lane's notes
         * are replaced. One undo step. */
        c = au_arg_clip(&p);
        if (c < 0 || tr->recording) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        drum_clip_t *dc = tr->drum_clips[c];
        if (!dc || !cl->smp) return 1;
        const au_sample_t *s = cl->smp;
        uint32_t rs = (uint32_t)((uint64_t)s->frames * cl->rstart / 1000);
        uint32_t re = (uint32_t)((uint64_t)s->frames * cl->rend / 1000);
        if (re <= rs) return 1;
        undo_begin_drum_clip(inst, tidx, c);
        for (l = 0; l < DRUM_LANES; l++) {
            drum_lane_t *ln = &dc->lanes[l];
            clip_t *lc = &ln->clip;
            uint32_t a = 0, b = 0;
            if (c == tr->active_clip) drum_pfx_note_off_imm(inst, tr, &tr->drum_lane_pfx[l], ln->midi_note);
            clip_wipe_notes(lc);
            if (l < cl->nslices && au_slice_range(cl, s, l, &a, &b) && a >= rs) {
                uint32_t len_ticks = (uint32_t)lc->length * lc->ticks_per_step;
                uint32_t tick = (uint32_t)((uint64_t)(a - rs) * len_ticks / (re - rs));
                uint32_t gate = (uint32_t)((uint64_t)(b - a) * len_ticks / (re - rs));
                char args[48];
                if (tick >= len_ticks) tick = len_ticks ? len_ticks - 1 : 0;
                if (gate < 1) gate = 1;
                snprintf(args, sizeof args, "%u 100 %u", (unsigned)tick, (unsigned)gate);
                lane_note_apply_op(lc, ln->midi_note, 'a', args);
            }
            clip_note_finalize(inst, lc, tidx, c);
        }
        return 1;
    }

    if (!strcmp(sub, "jump")) {
        int k = my_atoi(p), down;
        while (*p == ' ') p++;
        while (*p && *p != ' ') p++;
        down = *p ? my_atoi(p) : 1;
        c = tr->active_clip;
        au_clip_t *cl = &inst->au_clip[tidx][c];
        au_track_t *at = &inst->au_trk[tidx];
        if (!cl->smp || cl->mode != AU_MODE_LOOP || k < 0 || k >= cl->jump) return 1;
        uint32_t rs = (uint32_t)((uint64_t)cl->smp->frames * cl->rstart / 1000);
        uint32_t re = (uint32_t)((uint64_t)cl->smp->frames * cl->rend / 1000);
        double pos = (double)rs + (double)(re - rs) * k / cl->jump;
        au_voice_t *lv = au_loop_voice(at);
        if (lv && inst->playing) {
            if (down) lv->pos = pos;               /* live only: never recorded */
            return 1;
        }
        if (inst->playing) return 1;
        /* Stopped: hear it from there while the pad is held. */
        if (!down) {
            for (l = 0; l < AU_VOICES; l++)
                if (at->v[l].active && at->v[l].gated) au_voice_release(&at->v[l], 220);
            return 1;
        }
        au_loop_start(inst, tidx, c, pos - rs);
        lv = au_loop_voice(at);
        if (lv) { lv->mode_loop = 0; lv->loop = 0; lv->gated = 1; }
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
        au_loop_start(inst, tidx, c, 0);          /* the sample, Start to End, once */
        au_voice_t *lv = au_loop_voice(&inst->au_trk[tidx]);
        if (!lv) return 1;
        lv->mode_loop = 0; lv->loop = 0;
        inst->au_lazy_track = (int8_t)tidx;
        inst->au_lazy_clip = (int8_t)c;
        inst->au_lazy_n = 0;
        inst->au_lazy_pos = (uint32_t)lv->pos;
        return 1;
    }

    if (!strcmp(sub, "lazy_tap")) {
        if (inst->au_lazy_track != tidx || inst->au_lazy_n >= AU_MAX_SLICES) return 1;
        au_clip_t *cl = &inst->au_clip[tidx][inst->au_lazy_clip];
        au_track_t *at = &inst->au_trk[tidx];
        for (l = 0; l < AU_VOICES; l++) {
            if (!at->v[l].active || at->v[l].rel_len) continue;
            uint32_t pos = (uint32_t)at->v[l].pos;
            /* keep starts ascending */
            if (inst->au_lazy_n && pos <= cl->sl[inst->au_lazy_n - 1].start + 32) return 1;
            cl->sl[inst->au_lazy_n].start = pos;
            inst->au_lazy_n++;
            cl->nslices = inst->au_lazy_n;
            cl->method = AU_METH_LAZY;
            au_mark(inst, tidx, inst->au_lazy_clip);
            return 1;
        }
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
    if (!strcmp(k, "on")) return snprintf(out, out_len, "%d", inst->tracks[t].audio);
    if (!strcmp(k, "dir")) {                      /* the project's samples/ (the chooser lists it) */
        char d[256];
        au_samples_dir(inst, d, sizeof d);
        return snprintf(out, out_len, "%s", d);
    }
    if (!strncmp(k, "info_", 5)) {
        c = my_atoi(k + 5);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        const au_sample_t *s = cl->smp;
        return snprintf(out, out_len, "%d %d %d %d %d %d %d %d %d %d %u %u %d|%s",
                        cl->state, cl->err, cl->mode, cl->method, cl->nslices, cl->jump,
                        cl->rstart, cl->rend, cl->pitch, cl->gain_db,
                        s ? (unsigned)s->frames : 0u, s ? (unsigned)s->rate : 0u, s ? s->ch : 0, cl->name);
    }
    if (!strncmp(k, "sl_", 3)) {                  /* sl_C_L */
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
                        sl->nudge_ms, sl->len_pct, sl->pitch, sl->gain_db, sl->rev, sl->play,
                        sl->attack_ms, sl->decay_ms);
    }
    if (!strncmp(k, "starts_", 7)) {              /* every slice start, permille of the sample */
        c = my_atoi(k + 7);
        if (c < 0 || c >= NUM_CLIPS) return -1;
        const au_clip_t *cl = &inst->au_clip[t][c];
        int n = 0;
        out[0] = '\0';
        if (!cl->smp || !cl->smp->frames) return 0;
        for (l = 0; l < cl->nslices && n < out_len - 8; l++) {
            uint32_t a = 0, b = 0;
            if (!au_slice_range(cl, cl->smp, l, &a, &b)) break;
            n += snprintf(out + n, (size_t)(out_len - n), l ? " %u" : "%u",
                          (unsigned)((uint64_t)a * 1000 / cl->smp->frames));
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
    if (!strcmp(k, "pos")) {
        /* "<sounding 0|1> <permille of Start..End> <permille of the sample> <lane>" */
        const au_track_t *at = &inst->au_trk[t];
        for (l = 0; l < AU_VOICES; l++) {
            const au_voice_t *v = &at->v[l];
            if (!v->active || v->rel_len || !v->smp) continue;
            const au_clip_t *cl = &inst->au_clip[t][inst->tracks[t].active_clip];
            double rs = (double)v->smp->frames * cl->rstart / 1000.0, re = (double)v->smp->frames * cl->rend / 1000.0;
            int rel = re > rs ? (int)((v->pos - rs) * 1000.0 / (re - rs)) : 0;
            int abs_ = (int)(v->pos * 1000.0 / v->smp->frames);
            return snprintf(out, out_len, "1 %d %d %d", clamp_i(rel, 0, 999), clamp_i(abs_, 0, 999), v->mode_loop ? -1 : v->lane);
        }
        return snprintf(out, out_len, "0 0 0 -1");
    }
    if (!strcmp(k, "lazy")) {
        int on = inst->au_lazy_track == t;
        const au_sample_t *s = on ? inst->au_clip[t][inst->au_lazy_clip].smp : NULL;
        return snprintf(out, out_len, "%d %d %d", on, on ? inst->au_lazy_n : 0,
                        s && s->frames ? (int)((uint64_t)inst->au_lazy_pos * 1000 / s->frames) : 0);
    }
    return -1;
}
