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
#define RS_ERR_ROUTE     7   /* the track plays no instrument (external MIDI / none), or Dry off a chain */
#define RS_ERR_MUTED     8   /* the track is muted, or soloed out */

#define RS_SRC_WET  0        /* the mix (capture_start) */
#define RS_SRC_DRY  1        /* one chain slot's own output (capture_start_src) */
#define RS_SRC_PRE  2        /* the slot's instrument, before its FX (an Audio-track bounce) */

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
        const au_clip_t *ac = &inst->au_clip[t][c];
        int loop = tr->pad_mode == PAD_MODE_AUDIO && ac->mode == AU_MODE_LOOP && ac->name[0];
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

/* render_block, before the tick loop: arm the take a render after its first
 * tick, and count what the host has captured. */
static void resample_render_start(seq8_instance_t *inst, int frames) {
    if (inst->resample_state == RS_RECORDING) {
        inst->resample_done += (uint32_t)frames;
        if (inst->resample_done >= inst->resample_frames) {
            inst->resample_done  = inst->resample_frames;
            inst->resample_state = RS_DONE;
        }
    } else if (inst->resample_state == RS_STARTING) {
        int ok;
        if (inst->resample_src == RS_SRC_DRY || inst->resample_src == RS_SRC_PRE)
            ok = g_ext && g_ext->capture_start_src &&
                 g_ext->capture_start_src(inst->resample_path, inst->resample_frames,
                                          inst->resample_src == RS_SRC_PRE ? MOVE_CAPTURE_SLOT_PRE : MOVE_CAPTURE_SLOT,
                                          inst->resample_slot);
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
    if (inst->resample_state == RS_ARMED && abs >= inst->resample_start_tick)
        inst->resample_state = RS_STARTING;
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

/* The pass, its frames, and the start — after the take's tracks are queued. */
static void rs_launch(seq8_instance_t *inst, int bars, int warm, int tail, const char *path) {
    snprintf(inst->resample_path, sizeof(inst->resample_path), "%s", path + 1);
    {
        uint32_t pass = (uint32_t)bars * RS_BAR_TICKS;
        inst->resample_start_tick = warm ? pass : 0;
        inst->resample_end_tick   = inst->resample_start_tick + pass;
        inst->resample_frames     = rs_ticks_to_frames(inst, pass + (uint32_t)tail * RS_BAR_TICKS);
        inst->resample_bar_frames = rs_ticks_to_frames(inst, RS_BAR_TICKS);
    }
    inst->resample_done = 0;
    inst->resample_state = RS_ARMED;
    ext_transport_start(inst);
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
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = (int8_t)c;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    rs_launch(inst, bars, warm, tail, path);
}

/* set_param "resample_clip" = "T C bars warmup tail src |path": track T's clip
 * C ALONE (no other track plays), Wet (the mix) or Dry (T's chain slot). A
 * MIDI track that follows another records that track's instrument. */
static void resample_clip_start(seq8_instance_t *inst, const char *val) {
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
    if (!dst.emit || (dst.route != ROUTE_SCHWUNG && dst.route != ROUTE_MOVE)
            || ((src == RS_SRC_DRY || src == RS_SRC_PRE) && (dst.route != ROUTE_SCHWUNG
                                      || !g_ext->capture_start_src)))
        inst->resample_err = RS_ERR_ROUTE;
    else if (effective_mute(inst, tr_i))
        inst->resample_err = RS_ERR_MUTED;
    if (inst->resample_err) { inst->resample_state = RS_FAILED; return; }
    rs_remember_armed(inst);
    inst->resample_src  = (uint8_t)(src == RS_SRC_DRY ? RS_SRC_DRY : src == RS_SRC_PRE ? RS_SRC_PRE : RS_SRC_WET);
    inst->resample_slot = dst.slot;
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = -1;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    inst->tracks[tr_i].queued_clip = (int8_t)c;
    rs_launch(inst, bars, warm, tail, path);
}
