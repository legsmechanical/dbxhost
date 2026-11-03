/* seq8_resample.c — RESAMPLE: record a scene's or one clip's audio to a WAV,
 * bar-exact.
 *
 * From a STOPPED transport, `resample_scene` launches scene row C (every
 * track) and `resample_clip` launches one track's clip alone, and the
 * transport starts (no count-in). The take is the host's module take
 * (move_host_ext_v1_t.capture_start): the full mix after Master FX — with one
 * track playing, that IS the track as you hear it ("Wet") — or, for a clip on
 * a Schwung chain, capture_start_src's one-slot stem ("Dry": its own chain at
 * its fader, no sends, no Master FX). A fixed number of frames, so the file
 * loops at exactly its bar length.
 *
 * Whatever was armed before a take (each track's clip and will_relaunch) is put
 * back when the transport stops after it, so Play resumes what you had.
 *
 *   ARMED     waiting for the pass the take starts on: tick 0, or one pass in
 *             with a warm-up pass (whose tails then sound under the take's
 *             first bars, so the file loops seamlessly)
 *   STARTING  that pass's first tick has been PLAYED. The take is armed in
 *             the NEXT render: the slots render before this module in each
 *             host cycle, so notes sent in render k are first heard in k+1.
 *             Arming in k would put one block of the previous pass (or of
 *             silence) at the front of the loop.
 *   RECORDING the host is capturing; `resample_done` counts frames (progress)
 *   DONE / CANCELLED / FAILED — terminal; the UI reads them, then clears.
 *
 * At the end of the pass every clip stops at the bar line (page stop), so tail
 * bars record ring-out, not the loop starting again. Transport stop mid-take
 * (Play, project load) cancels; the host ends the take at that block.
 *
 * The metronome is silent from arming until the UI clears the outcome: the
 * click is mixed BEFORE Master FX, so it cannot be taken out of the file. */

#define RS_IDLE       0
#define RS_ARMED      1
#define RS_STARTING   2
#define RS_RECORDING  3
#define RS_DONE       4
#define RS_CANCELLED  5
#define RS_FAILED     6

/* resample_err: why the last take did not run */
#define RS_ERR_PLAYING   1   /* transport running: a take starts from stopped */
#define RS_ERR_FOLLOW    2   /* following Move's clock: the start would wait on Move */
#define RS_ERR_NO_HOST   3   /* host has no module take */
#define RS_ERR_BUSY      4   /* a merge, print, count-in or take is under way */
#define RS_ERR_ARGS      5   /* bad scene / bars / path */
#define RS_ERR_SAMPLER   6   /* the host's sampler was busy when the take began */
#define RS_ERR_ROUTE     7   /* the track plays no instrument (external MIDI / none), or a one-source take without the host for it */
#define RS_ERR_MUTED     8   /* the track is muted, or soloed out */

#define RS_SRC_WET  0        /* the mix (capture_start) */
#define RS_SRC_DRY  1        /* one chain slot's own output (capture_start_src) */
#define RS_SRC_PRE  2        /* the slot's instrument, before its FX (an Audio-track bounce) */
#define RS_SRC_FX   3        /* after its FX at unity: a bounce that goes on through the same fader */
/* DRY / PRE / FX name a point on the TRACK, so a Move instrument has them too:
 * its Move FX bus after the inserts at its fader, before them, after them at
 * unity (resample_move; MOVE_CAPTURE_MOVE*). */
static int rs_capture_kind(const seq8_instance_t *inst) {
    const int s = inst->resample_src;
    if (inst->resample_move)
        return s == RS_SRC_PRE ? MOVE_CAPTURE_MOVE_PRE : s == RS_SRC_FX ? MOVE_CAPTURE_MOVE_FX : MOVE_CAPTURE_MOVE;
    return s == RS_SRC_PRE ? MOVE_CAPTURE_SLOT_PRE : s == RS_SRC_FX ? MOVE_CAPTURE_SLOT_FX : MOVE_CAPTURE_SLOT;
}

#define RS_BAR_TICKS     (16 * TICKS_PER_STEP)
#define RS_CAP_BARS      32

static int rs_active(const seq8_instance_t *inst) {
    return inst->resample_state >= RS_ARMED && inst->resample_state <= RS_RECORDING;
}

static uint32_t rs_gcd(uint32_t a, uint32_t b) {
    while (b) { uint32_t t = a % b; a = b; b = t; }
    return a;
}

/* A clip counts if it holds a live note: note_count includes tombstones. */
static int rs_clip_has_notes(const clip_t *cl) {
    uint16_t i;
    for (i = 0; i < cl->note_count; i++)
        if (cl->notes[i].active) return 1;
    return 0;
}

/* Fold one clip's loop span (master ticks) into the running LCM and max.
 * `sounds`: it plays without notes (an Audio track's Loop clip with a sample). */
static void rs_fold(const clip_t *cl, int sounds, uint32_t *lcm, uint32_t *longest, int *over) {
    uint32_t span = (uint32_t)cl->length * (uint32_t)cl->ticks_per_step;
    if (!span || !(sounds || rs_clip_has_notes(cl))) return;
    if (span > *longest) *longest = span;
    if (*over) return;
    uint64_t l = (uint64_t)*lcm / rs_gcd(*lcm, span) * span;
    if (l > (uint64_t)RS_CAP_BARS * RS_BAR_TICKS) *over = 1;
    else *lcm = (uint32_t)l;
}

/* Fold track `t`'s clip `c` (each drum lane, or the melodic clip). An Audio
 * track's Loop clip plays its sample whatever its steps hold: it counts once it
 * has one; a Slice clip, like any, by its notes (the chops on its steps). */
static void rs_fold_track(const seq8_instance_t *inst, int t, int c, uint32_t *lcm, uint32_t *longest, int *over) {
    const seq8_track_t *tr = &inst->tracks[t];
    int l;
    if (tr->pad_mode == PAD_MODE_DRUM) {
        if (!tr->drum_clips[c]) return;
        for (l = 0; l < DRUM_LANES; l++)
            rs_fold(&tr->drum_clips[c]->lanes[l].clip, 0, lcm, longest, over);
    } else {
        const au_clip_t *ac = &inst->au_store[t][c];
        int loop = tr->pad_mode == PAD_MODE_AUDIO && ac->name[0];
        rs_fold(&tr->clips[c], loop, lcm, longest, over);
    }
}

static int rs_bars(uint32_t lcm, uint32_t longest, int over) {
    if (!longest) return 0;
    if (over) return (int)((longest + RS_BAR_TICKS - 1) / RS_BAR_TICKS);
    return (int)(lcm / RS_BAR_TICKS);
}

/* The scene's natural take length in bars: the shortest span after which
 * every non-empty clip in row `c` is back at its start, in whole bars. Past
 * 32 bars, the longest clip rounded up to whole bars. 0 = an empty scene. */
static int resample_scene_bars(const seq8_instance_t *inst, int c) {
    uint32_t lcm = RS_BAR_TICKS, longest = 0;
    int over = 0, t;
    if (c < 0 || c >= NUM_CLIPS) return 0;
    for (t = 0; t < NUM_TRACKS; t++) rs_fold_track(inst, t, c, &lcm, &longest, &over);
    return rs_bars(lcm, longest, over);
}

/* One track's clip C: its own length in whole bars — a drum clip's lanes may
 * differ, so where they line up (the same 32-bar cap). 0 = no notes. */
static int resample_clip_bars(const seq8_instance_t *inst, int t, int c) {
    uint32_t lcm = RS_BAR_TICKS, longest = 0;
    int over = 0;
    if (t < 0 || t >= NUM_TRACKS || c < 0 || c >= NUM_CLIPS) return 0;
    rs_fold_track(inst, t, c, &lcm, &longest, &over);
    return rs_bars(lcm, longest, over);
}

/* Frames in `ticks` master ticks at the running tempo — from the same
 * integers the tick clock runs on, so the file matches the playback. */
static uint32_t rs_ticks_to_frames(const seq8_instance_t *inst, uint32_t ticks) {
    if (!inst->tick_delta) return 0;
    return (uint32_t)(((uint64_t)ticks * inst->tick_threshold * MOVE_FRAMES_PER_BLOCK
                       + inst->tick_delta / 2) / inst->tick_delta);
}

/* Transport stop (any path), at its START: a pending or running take is
 * cancelled. */
static void resample_on_transport_stop(seq8_instance_t *inst) {
    if (!rs_active(inst)) return;
    if (inst->resample_offline) {
        /* the host's take ends and removes its file; nothing here was launched */
        inst->resample_offline = 0;
        if (g_ext && g_ext->offline_take_cancel) g_ext->offline_take_cancel();
        inst->resample_state = RS_CANCELLED;
        return;
    }
    if (inst->resample_state == RS_RECORDING && g_ext && g_ext->capture_stop)
        g_ext->capture_stop();
    inst->resample_state = RS_CANCELLED;
}

/* Transport stop, at its END (after it has re-armed what was playing): put
 * back each track's clip and armed state from before the take, so Play
 * resumes what you had rather than what the take launched. */
static void resample_after_transport_stop(seq8_instance_t *inst) {
    int t;
    if (!inst->resample_restore) return;
    inst->resample_restore = 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        seq8_track_t *tr = &inst->tracks[t];
        tr->queued_clip       = -1;
        tr->pending_page_stop = 0;
        tr->will_relaunch     = inst->resample_prev_relaunch[t];
        if (tr->active_clip != inst->resample_prev_clip[t]) {
            tr->active_clip = inst->resample_prev_clip[t];
            pfx_sync_from_clip(tr);
        }
    }
}

/* Before a take launches anything: what to put back after it. */
static void rs_remember_armed(seq8_instance_t *inst) {
    int t;
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->resample_prev_clip[t]     = inst->tracks[t].active_clip;
        inst->resample_prev_relaunch[t] = inst->tracks[t].will_relaunch;
    }
    inst->resample_restore = 1;
}

/* ---- OFFLINE takes (move_host_ext_v1_t.offline_take_*) ----
 *
 * A clip take of a Schwung instrument, or of an Audio track's samples, before
 * the track's effects (Pre) or after them at unity (FX) hears nothing but the
 * track: the host can record it faster than real time, with a private copy of
 * THIS engine playing this same command against this project's state, into
 * copies of the slot's instrument (none on an Audio track: the copy's samples
 * are fed to it, au_offline_pump) and effects. The engine decides; the UI sees the states a
 * real-time take goes through (RECORDING with its frames, then DONE /
 * CANCELLED / FAILED), with no transport started.
 *
 * Real time instead whenever the copy could not sound the same: automation
 * the UI plays rather than the engine (bus levels, macros, a chain parameter
 * not yet resolved), or that writes anything of the slot's but its instrument
 * and effects; and every refusal of the host's (modulation, a MIDI FX, voices
 * on buses ...). A take the host then fails is recorded again in real time. */
static char rs_off_state[1u << 20];
static char rs_off_setup[PA_MAX_TARGETS * 192];
/* what the real-time take needs if the offline one fails */
static char rs_off_val[512];

static int rs_offline_automation_ok(const seq8_instance_t *inst, int slot) {
    int i;
    for (i = 0; i < PA_MAX_TARGETS; i++) {
        const char *n = inst->pa_targets[i];
        const pa_res_t *r = &inst->pa_res[i];
        if (!n[0] || pa_target_is_midi(n, NULL) || pa_target_is_seq(n, NULL, NULL)) continue;
        if (n[0] < '0' || n[0] > '9') return 0;                 /* bus:, mac:, ... the UI plays them */
        if (my_atoi(n) != slot) continue;                        /* another slot's */
        if (!r->valid || strcmp(r->name, n)) return 0;           /* the UI would write it */
        if (strncmp(r->key, "synth:", 6) &&
                !(r->key[0] == 'f' && r->key[1] == 'x' && r->key[2] >= '1' && r->key[2] <= '4' && r->key[3] == ':'))
            return 0;                                            /* the slot's level, pan, sends ... */
    }
    return 1;
}

/* 1 = the host took it. `val` is resample_clip's. */
static int rs_offline_try(seq8_instance_t *inst, int bars, int tail, int src, int slot,
                          const char *val, const char *path) {
    move_offline_take_t ot;
    FILE *fp;
    long pos;
    int r, i, n = 0;
    if (inst->offline || !g_ext || !g_ext->offline_take_begin || !g_ext->offline_take_state) return 0;
    if (src != RS_SRC_PRE && src != RS_SRC_FX) return 0;
    if (strlen(val) >= sizeof ot.val || !rs_offline_automation_ok(inst, slot)) return 0;
    fp = fmemopen(rs_off_state, sizeof rs_off_state - 1, "w");
    if (!fp) return 0;
    seq8_do_serialize(inst, fp);
    pos = ftell(fp);
    fclose(fp);
    if (pos <= 0 || pos >= (long)sizeof rs_off_state - 1) return 0;
    rs_off_state[pos] = '\0';
    rs_off_setup[0] = '\0';
    {   /* where the copy's Audio clips find their samples (first: the loads
         * are asked for as it arrives) */
        char dir[256];
        au_samples_dir(inst, dir, sizeof dir);
        if (dir[0]) {
            n = snprintf(rs_off_setup, sizeof rs_off_setup, "offline_samples %s\n", dir);
            if (n < 0 || (size_t)n >= sizeof rs_off_setup) return 0;
        }
    }
    for (i = 0; i < PA_MAX_TARGETS; i++) {
        const pa_res_t *rr = &inst->pa_res[i];
        int w;
        if (!rr->valid || !inst->pa_targets[i][0]) continue;
        w = snprintf(rs_off_setup + n, sizeof rs_off_setup - (size_t)n, "pa_resolve %s %d %s %d %.17g %.17g %.17g\n",
                     rr->name, (int)rr->slot, rr->key, (int)rr->kind, rr->min, rr->max, rr->step);
        if (w < 0 || (size_t)(n + w) >= sizeof rs_off_setup) return 0;
        n += w;
    }
    memset(&ot, 0, sizeof ot);
    ot.state = rs_off_state;
    ot.state_len = (uint32_t)pos;
    ot.setup = rs_off_setup;
    snprintf(ot.key, sizeof ot.key, "resample_clip");
    snprintf(ot.val, sizeof ot.val, "%s", val);
    ot.slot = slot;
    ot.kind = src == RS_SRC_PRE ? MOVE_CAPTURE_SLOT_PRE : MOVE_CAPTURE_SLOT_FX;
    ot.bpm = (float)inst->tracks[0].pfx.cached_bpm;
    r = g_ext->offline_take_begin(&ot);
    if (r != 1) return 0;
    snprintf(rs_off_val, sizeof rs_off_val, "%s", val);
    snprintf(inst->resample_path, sizeof(inst->resample_path), "%s", path + 1);
    inst->resample_src        = (uint8_t)src;
    inst->resample_move       = 0;
    inst->resample_slot       = (uint8_t)slot;
    inst->resample_frames     = rs_ticks_to_frames(inst, (uint32_t)(bars + tail) * RS_BAR_TICKS);
    inst->resample_bar_frames = rs_ticks_to_frames(inst, RS_BAR_TICKS);
    inst->resample_done       = 0;
    inst->resample_offline    = 1;
    inst->resample_state      = RS_RECORDING;
    return 1;
}

static void resample_clip_launch(seq8_instance_t *inst, const char *val, int offline_ok);

/* render_block: the host's take, as this take's progress and outcome. */
static void rs_offline_poll(seq8_instance_t *inst) {
    uint32_t done = 0, total = 0;
    int st;
    if (inst->resample_state != RS_RECORDING) return;
    st = g_ext->offline_take_state(&done, &total);
    if (total) inst->resample_frames = total;
    if (st == MOVE_OFFLINE_RUNNING) { inst->resample_done = done; return; }
    inst->resample_offline = 0;
    if (st == MOVE_OFFLINE_DONE) {
        inst->resample_done  = inst->resample_frames;
        inst->resample_state = RS_DONE;
        g_ext->offline_take_cancel();                 /* the outcome is read: the host is free */
        return;
    }
    /* FAILED (or gone): record it in real time, as if offline had not been tried */
    g_ext->offline_take_cancel();
    inst->resample_state = RS_IDLE;
    resample_clip_launch(inst, rs_off_val, 0);
}

/* render_block, before the tick loop: arm the take a render after its first
 * tick, and count what the host has captured. */
static void resample_render_start(seq8_instance_t *inst, int frames) {
    if (inst->resample_offline) { rs_offline_poll(inst); return; }
    if (inst->resample_state == RS_RECORDING) {
        inst->resample_done += (uint32_t)frames;
        if (inst->resample_done >= inst->resample_frames) {
            inst->resample_done  = inst->resample_frames;
            inst->resample_state = RS_DONE;
        }
    } else if (inst->resample_state == RS_STARTING) {
        int ok;
        /* What the take's tracks play is heard LEAD_BLOCKS blocks after the
         * tick that plays it (see LEAD_BLOCKS): the take starts as late. */
        if (inst->resample_lead_wait > 0) { inst->resample_lead_wait--; return; }
        if (inst->resample_src != RS_SRC_WET)
            ok = g_ext && g_ext->capture_start_src &&
                 g_ext->capture_start_src(inst->resample_path, inst->resample_frames,
                                          rs_capture_kind(inst), inst->resample_slot);
        else
            ok = g_ext && g_ext->capture_start &&
                 g_ext->capture_start(inst->resample_path, inst->resample_frames);
        if (ok) {
            inst->resample_done  = 0;
            inst->resample_state = RS_RECORDING;
        } else {
            inst->resample_err   = RS_ERR_SAMPLER;
            inst->resample_state = RS_FAILED;
        }
    }
}

/* The tick loop, at the top of each master tick (before any track plays it). */
static void resample_tick(seq8_instance_t *inst) {
    uint32_t abs;
    int t;
    if (inst->resample_state != RS_ARMED && inst->resample_state != RS_RECORDING
            && inst->resample_state != RS_STARTING) return;
    abs = inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step;
    if (inst->resample_state == RS_ARMED && abs >= inst->resample_start_tick) {
        inst->resample_state     = RS_STARTING;
        inst->resample_lead_wait = LEAD_BLOCKS;
    }
    /* The pass is over: every clip stops at this bar line, before any track
     * plays it, so the tail is ring-out. */
    if (abs == inst->resample_end_tick) {
        for (t = 0; t < NUM_TRACKS; t++) {
            inst->tracks[t].queued_clip       = -1;
            if (inst->tracks[t].clip_playing) inst->tracks[t].pending_page_stop = 1;
        }
    }
}

/* The refusals every take shares; 0 = it may start. Sets resample_err. */
static int rs_refuse(seq8_instance_t *inst, int c, int bars, int tail, const char *path) {
    inst->resample_err = 0;
    if (inst->playing)                         inst->resample_err = RS_ERR_PLAYING;
    else if (inst->clock_follow_on)            inst->resample_err = RS_ERR_FOLLOW;
    else if (!g_ext || !g_ext->capture_start)  inst->resample_err = RS_ERR_NO_HOST;
    else if (rs_active(inst) || inst->merge_state != MERGE_STATE_IDLE
             || inst->count_in_ticks > 0 || inst->print_state)
                                               inst->resample_err = RS_ERR_BUSY;
    else if (c < 0 || c >= NUM_CLIPS || bars < 1 || bars > 64 || tail < 0 || tail > 8
             || !path || path[1] != '/' || strlen(path + 1) >= sizeof(inst->resample_path))
                                               inst->resample_err = RS_ERR_ARGS;
    if (inst->resample_err) inst->resample_state = RS_FAILED;
    return inst->resample_err;
}

/* The pass (`pass` master ticks), its frames, and the start — after the
 * take's tracks are queued. */
static void rs_launch_ticks(seq8_instance_t *inst, uint32_t pass, int warm, int tail, const char *path) {
    snprintf(inst->resample_path, sizeof(inst->resample_path), "%s", path + 1);
    inst->resample_start_tick = warm ? pass : 0;
    inst->resample_end_tick   = inst->resample_start_tick + pass;
    inst->resample_frames     = rs_ticks_to_frames(inst, pass + (uint32_t)tail * RS_BAR_TICKS);
    inst->resample_bar_frames = rs_ticks_to_frames(inst, RS_BAR_TICKS);
    inst->resample_done = 0;
    inst->resample_state = RS_ARMED;
    ext_transport_start(inst);
}
static void rs_launch(seq8_instance_t *inst, int bars, int warm, int tail, const char *path) {
    inst->resample_hear = 0;
    rs_launch_ticks(inst, (uint32_t)bars * RS_BAR_TICKS, warm, tail, path);
}

/* set_param "resample_scene" = "C bars warmup tail |path". Refusals leave the
 * transport untouched and report through resample_err. */
static void resample_scene_start(seq8_instance_t *inst, const char *val) {
    int c = -1, bars = 0, warm = 0, tail = 0, t;
    const char *path = strchr(val, '|');
    sscanf(val, "%d %d %d %d", &c, &bars, &warm, &tail);
    if (rs_refuse(inst, c, bars, tail, path)) return;
    rs_remember_armed(inst);
    inst->resample_src = RS_SRC_WET;
    inst->resample_move = 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = (int8_t)c;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    rs_launch(inst, bars, warm, tail, path);
}

/* set_param "resample_clip" = "T C bars warmup tail src |path": track T's clip
 * C ALONE (no other track plays), Wet (the mix) or one point on the track (Dry,
 * Pre, FX — its chain slot, or a Move instrument's Move FX bus). A MIDI track
 * that follows another records that track's instrument. */
static void resample_clip_launch(seq8_instance_t *inst, const char *val, int offline_ok) {
    int tr_i = -1, c = -1, bars = 0, warm = 0, tail = 0, src = 0, t;
    const char *path = strchr(val, '|');
    midi_dest_t dst;
    sscanf(val, "%d %d %d %d %d %d", &tr_i, &c, &bars, &warm, &tail, &src);
    if (tr_i < 0 || tr_i >= NUM_TRACKS) {
        inst->resample_err = RS_ERR_ARGS; inst->resample_state = RS_FAILED; return;
    }
    if (rs_refuse(inst, c, bars, tail, path)) return;
    {
        const play_fx_t *fx = &inst->tracks[tr_i].pfx;
        dst = midi_dest_resolve(fx->route, fx->slot, fx->midi_to);
    }
    if (src < RS_SRC_WET || src > RS_SRC_FX) src = RS_SRC_WET;
    if (!dst.emit || (dst.route != ROUTE_SCHWUNG && dst.route != ROUTE_MOVE)
            || (src != RS_SRC_WET && !g_ext->capture_start_src))
        inst->resample_err = RS_ERR_ROUTE;
    else if (effective_mute(inst, tr_i))
        inst->resample_err = RS_ERR_MUTED;
    if (inst->resample_err) { inst->resample_state = RS_FAILED; return; }
    /* faster than real time when the host can (rs_offline_try) */
    if (offline_ok && dst.route == ROUTE_SCHWUNG && rs_offline_try(inst, bars, tail, src, dst.slot, val, path)) return;
    rs_remember_armed(inst);
    inst->resample_src  = (uint8_t)src;
    inst->resample_move = dst.route == ROUTE_MOVE;
    if (inst->resample_move) {
        /* the Move track it plays: its channel (a follower's, the followed track's) */
        const int ch = dst.channel != MIDI_DEST_KEEP_CH ? dst.channel : (inst->tracks[tr_i].channel & 0x0F);
        inst->resample_slot = (uint8_t)(ch > 3 ? 3 : ch);
    } else {
        inst->resample_slot = dst.slot;
    }
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = -1;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    inst->tracks[tr_i].queued_clip = (int8_t)c;
    rs_launch(inst, bars, warm, tail, path);
}
static void resample_clip_start(seq8_instance_t *inst, const char *val) {
    resample_clip_launch(inst, val, 1);
}

/* ---- The Ableton export's take (Josh, 2026-11-02: "let's simply flatten
 * audio tracks before exporting" · "export flattens") ----
 *
 * One Audio track's clip, recorded for Live as it sounds and as it loops:
 *   - its chain slot's own output (Dry: its effects, at its fader and pan; no
 *     sends, no Master FX — the export brings neither);
 *   - muted or soloed out, it still plays (resample_hear): Live gets every
 *     track;
 *   - `cond`: the Conductor's clip in the same row plays with it, so a
 *     responding track is moved as it is here (the export's Apply Conductor);
 *   - exactly as long as it loops — the clip's own span, or where it and the
 *     Conductor's clip are back at their start together — in TICKS, not whole
 *     bars: Live loops the take at its own length;
 *   - after one warm-up pass, so what rings over the loop point is at the
 *     take's start, as it is when the clip comes round.
 * Nothing in the project changes: the clips armed before are put back
 * (rs_remember_armed). */
#define RS_EXPORT_CAP_BARS 64

/* One clip's span in master ticks if it sounds, else 0. */
static uint32_t rs_clip_span(const seq8_instance_t *inst, int t, int c) {
    uint32_t lcm = 1, longest = 0;
    int over = 0;
    rs_fold_track(inst, t, c, &lcm, &longest, &over);
    return longest;
}

/* The take's length in ticks: 0 = nothing sounds; -1 = the clip and the
 * Conductor's do not line up within RS_EXPORT_CAP_BARS. */
static long export_take_ticks(const seq8_instance_t *inst, int t, int c, int cond) {
    if (t < 0 || t >= NUM_TRACKS || c < 0 || c >= NUM_CLIPS) return 0;
    uint32_t a = rs_clip_span(inst, t, c);
    if (!a) return 0;
    int ct = inst->conductor_track;
    if (cond && ct >= 0 && ct != t) {
        uint32_t b = rs_clip_span(inst, ct, c);
        if (b) {
            uint64_t l = (uint64_t)a / rs_gcd(a, b) * b;
            if (l > (uint64_t)RS_EXPORT_CAP_BARS * RS_BAR_TICKS) return -1;
            a = (uint32_t)l;
        }
    }
    return a > (uint32_t)RS_EXPORT_CAP_BARS * RS_BAR_TICKS ? -1 : (long)a;
}

/* set_param "export_take" = "T C ticks cond |path". Refusals as resample_clip's
 * (resample_err); `ticks` must be export_take_ticks's answer. */
static void export_take_start(seq8_instance_t *inst, const char *val) {
    int tr_i = -1, c = -1, cond = 0, t;
    unsigned ticks = 0;
    const char *path = strchr(val, '|');
    midi_dest_t dst;
    sscanf(val, "%d %d %u %d", &tr_i, &c, &ticks, &cond);
    if (tr_i < 0 || tr_i >= NUM_TRACKS || !ticks || ticks > (unsigned)RS_EXPORT_CAP_BARS * RS_BAR_TICKS) {
        inst->resample_err = RS_ERR_ARGS; inst->resample_state = RS_FAILED; return;
    }
    if (rs_refuse(inst, c, 1, 0, path)) return;
    {
        const play_fx_t *fx = &inst->tracks[tr_i].pfx;
        dst = midi_dest_resolve(fx->route, fx->slot, fx->midi_to);
    }
    if (!pad_mode_sampled(inst->tracks[tr_i].pad_mode) || !dst.emit || dst.route != ROUTE_SCHWUNG
            || !g_ext->capture_start_src) {
        inst->resample_err = RS_ERR_ROUTE; inst->resample_state = RS_FAILED; return;
    }
    rs_remember_armed(inst);
    inst->resample_src  = RS_SRC_DRY;
    inst->resample_move = 0;
    inst->resample_slot = dst.slot;
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = -1;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    inst->tracks[tr_i].queued_clip = (int8_t)c;
    if (cond && inst->conductor_track >= 0 && inst->conductor_track != tr_i)
        inst->tracks[inst->conductor_track].queued_clip = (int8_t)c;
    inst->resample_hear = (uint8_t)(tr_i + 1);
    rs_launch_ticks(inst, ticks, 1, 0, path);
}
