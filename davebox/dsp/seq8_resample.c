/* seq8_resample.c — SCENE RESAMPLE: record a scene's audio to a WAV, bar-exact.
 *
 * From a STOPPED transport, `resample_scene` launches scene row C and starts
 * the transport (no count-in). The take is the host's module take
 * (move_host_ext_v1_t.capture_start): the full mix after Master FX, a fixed
 * number of frames, so the file loops at exactly its bar length.
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

/* Fold one clip's loop span (master ticks) into the running LCM and max. */
static void rs_fold(const clip_t *cl, uint32_t *lcm, uint32_t *longest, int *over) {
    uint32_t span = (uint32_t)cl->length * (uint32_t)cl->ticks_per_step;
    if (!span || !rs_clip_has_notes(cl)) return;
    if (span > *longest) *longest = span;
    if (*over) return;
    uint64_t l = (uint64_t)*lcm / rs_gcd(*lcm, span) * span;
    if (l > (uint64_t)RS_CAP_BARS * RS_BAR_TICKS) *over = 1;
    else *lcm = (uint32_t)l;
}

/* The scene's natural take length in bars: the shortest span after which
 * every non-empty clip in row `c` is back at its start, in whole bars. Past
 * 32 bars, the longest clip rounded up to whole bars. 0 = an empty scene. */
static int resample_scene_bars(const seq8_instance_t *inst, int c) {
    uint32_t lcm = RS_BAR_TICKS, longest = 0;
    int over = 0, t, l;
    if (c < 0 || c >= NUM_CLIPS) return 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        const seq8_track_t *tr = &inst->tracks[t];
        if (tr->pad_mode == PAD_MODE_DRUM) {
            if (!tr->drum_clips[c]) continue;
            for (l = 0; l < DRUM_LANES; l++)
                rs_fold(&tr->drum_clips[c]->lanes[l].clip, &lcm, &longest, &over);
        } else {
            rs_fold(&tr->clips[c], &lcm, &longest, &over);
        }
    }
    if (!longest) return 0;
    if (over) return (int)((longest + RS_BAR_TICKS - 1) / RS_BAR_TICKS);
    return (int)(lcm / RS_BAR_TICKS);
}

/* Frames in `ticks` master ticks at the running tempo — from the same
 * integers the tick clock runs on, so the file matches the playback. */
static uint32_t rs_ticks_to_frames(const seq8_instance_t *inst, uint32_t ticks) {
    if (!inst->tick_delta) return 0;
    return (uint32_t)(((uint64_t)ticks * inst->tick_threshold * MOVE_FRAMES_PER_BLOCK
                       + inst->tick_delta / 2) / inst->tick_delta);
}

/* Transport stop (any path): a pending or running take is cancelled. */
static void resample_on_transport_stop(seq8_instance_t *inst) {
    if (!rs_active(inst)) return;
    if (inst->resample_state == RS_RECORDING && g_ext && g_ext->capture_stop)
        g_ext->capture_stop();
    inst->resample_state = RS_CANCELLED;
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
        if (g_ext && g_ext->capture_start &&
                g_ext->capture_start(inst->resample_path, inst->resample_frames)) {
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

/* set_param "resample_scene" = "C bars warmup tail |path". Refusals leave the
 * transport untouched and report through resample_err. */
static void resample_scene_start(seq8_instance_t *inst, const char *val) {
    int c = -1, bars = 0, warm = 0, tail = 0, t;
    const char *path = strchr(val, '|');
    inst->resample_err = 0;
    sscanf(val, "%d %d %d %d", &c, &bars, &warm, &tail);
    if (inst->playing)                         inst->resample_err = RS_ERR_PLAYING;
    else if (inst->clock_follow_on)            inst->resample_err = RS_ERR_FOLLOW;
    else if (!g_ext || !g_ext->capture_start)  inst->resample_err = RS_ERR_NO_HOST;
    else if (rs_active(inst) || inst->merge_state != MERGE_STATE_IDLE
             || inst->count_in_ticks > 0 || inst->print_state)
                                               inst->resample_err = RS_ERR_BUSY;
    else if (c < 0 || c >= NUM_CLIPS || bars < 1 || bars > 64 || tail < 0 || tail > 8
             || !path || path[1] != '/' || strlen(path + 1) >= sizeof(inst->resample_path))
                                               inst->resample_err = RS_ERR_ARGS;
    if (inst->resample_err) {
        inst->resample_state = RS_FAILED;
        return;
    }
    snprintf(inst->resample_path, sizeof(inst->resample_path), "%s", path + 1);
    {
        uint32_t pass = (uint32_t)bars * RS_BAR_TICKS;
        inst->resample_start_tick = warm ? pass : 0;
        inst->resample_end_tick   = inst->resample_start_tick + pass;
        inst->resample_frames     = rs_ticks_to_frames(inst, pass + (uint32_t)tail * RS_BAR_TICKS);
        inst->resample_bar_frames = rs_ticks_to_frames(inst, RS_BAR_TICKS);
    }
    inst->resample_done = 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        inst->tracks[t].queued_clip       = (int8_t)c;
        inst->tracks[t].will_relaunch     = 0;
        inst->tracks[t].pending_page_stop = 0;
    }
    inst->resample_state = RS_ARMED;
    ext_transport_start(inst);
}
