/* seq8_merge_audio.c — LIVE MERGE on an Audio track records its SOUND.
 *
 * Josh, 2026-11-02: "live merge for audio tracks should be audio, not
 * sequences (so live recording the track), pre fx." A merge's Audio tracks
 * each record their chain slot's instrument before its FX — the sample as it
 * plays, pads and all — to a WAV of their own, all at once (the host's stem
 * take, move_host_ext_v1_t.stems_*). The other tracks still record notes.
 * Placement loads each WAV into the picked clip (the UI); a track that made
 * no sound is skipped, as a MIDI track with no notes is.
 *
 * The take is BAR-EXACT, so it loops: it starts with the merge's first tick
 * (LEAD_BLOCKS renders on, as a resample does: what a tick plays is heard
 * that much later) and ends after the merge's length in whole bars. A merge
 * with Audio tracks therefore always stops on a bar line (STOPPING, as a
 * scene merge does), and the transport keeps running until the files have
 * their last frame — the lead's worth past the bar — then stops.
 *
 *   ARMED     paths in, waiting for the merge's first tick
 *   STARTING  that tick has played; LEAD_BLOCKS renders to wait
 *   RECORDING the host is capturing
 *   ENDING    the merge is over; the host has its length
 *   DONE / FAILED — the files are complete / there are none
 *
 * Paths come from the UI ("merge_stem" = "T |path", before "merge_arm"): the
 * project's samples folder is the UI's. Included by seq8.c after
 * seq8_resample.c (rs_ticks_to_frames, RS_BAR_TICKS). */

#define MS_NONE       0
#define MS_ARMED      1
#define MS_STARTING   2
#define MS_RECORDING  3
#define MS_ENDING     4
#define MS_DONE       5
#define MS_FAILED     6

static void merge_stems_reset(seq8_instance_t *inst) {
    int t;
    inst->merge_stem_phase = MS_NONE;
    inst->merge_stem_n     = 0;
    inst->merge_stem_mask  = 0;
    for (t = 0; t < NUM_TRACKS; t++) inst->merge_stem_path[t][0] = '\0';
}

/* set_param "merge_stem" = "T |path" */
static void merge_stem_path_set(seq8_instance_t *inst, const char *val) {
    const char *path = val ? strchr(val, '|') : NULL;
    int t = val ? my_atoi(val) : -1;
    if (t < 0 || t >= NUM_TRACKS || !path || path[1] != '/'
            || strlen(path + 1) >= sizeof(inst->merge_stem_path[0])) return;
    snprintf(inst->merge_stem_path[t], sizeof(inst->merge_stem_path[0]), "%s", path + 1);
}

/* The slot an Audio track plays through, or -1. */
static int merge_stem_slot(const seq8_instance_t *inst, int t) {
    const play_fx_t *fx = &inst->tracks[t].pfx;
    midi_dest_t dst = midi_dest_resolve(fx->route, fx->slot, fx->midi_to);
    if (inst->tracks[t].pad_mode != PAD_MODE_AUDIO || !dst.emit || dst.route != ROUTE_SCHWUNG) return -1;
    return dst.slot;
}

/* merge_arm: the merge's Audio tracks that will record (in its scope, with a
 * path and a slot). Their notes are not captured either way (merge_capture). */
static void merge_stems_arm(seq8_instance_t *inst) {
    int t;
    inst->merge_stem_n = 0;
    inst->merge_stem_mask = 0;
    inst->merge_audio_mask = 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        if (inst->merge_solo_track != 0xFF && t != inst->merge_solo_track) continue;
        if (!inst->merge_stem_path[t][0] || merge_stem_slot(inst, t) < 0) continue;
        inst->merge_stem_track[inst->merge_stem_n++] = (uint8_t)t;
        inst->merge_stem_mask |= (uint8_t)(1u << t);
    }
    /* a path is for the merge it was sent for: none is left for the next */
    for (t = 0; t < NUM_TRACKS; t++)
        if (!(inst->merge_stem_mask & (1u << t))) inst->merge_stem_path[t][0] = '\0';
    inst->merge_stem_phase = inst->merge_stem_n ? MS_ARMED : MS_NONE;
}

/* The merge's first tick (ARMED → CAPTURING). */
static void merge_stems_first_tick(seq8_instance_t *inst) {
    if (inst->merge_stem_phase != MS_ARMED) return;
    inst->merge_stem_phase = MS_STARTING;
    inst->merge_stem_lead  = LEAD_BLOCKS;
}

/* merge_finalize, CAPTURING/STOPPING → CAPTURED (merge_end_abs is set): the
 * take is the merge's length in whole bars. */
static void merge_stems_finalize(seq8_instance_t *inst) {
    uint32_t bars;
    if (inst->merge_stem_phase == MS_ARMED || inst->merge_stem_phase == MS_STARTING) {
        merge_stems_reset(inst);            /* over before it began: nothing recorded */
        return;
    }
    if (inst->merge_stem_phase != MS_RECORDING) return;
    bars = (inst->merge_end_abs + RS_BAR_TICKS - 1) / RS_BAR_TICKS;
    if (bars < 1) bars = 1;
    g_ext->stems_limit(rs_ticks_to_frames(inst, bars * RS_BAR_TICKS));
    inst->merge_stem_phase = MS_ENDING;
}

/* A merge thrown away before placement (cancel, a project load): the take
 * ends now. The UI removes the files. */
static void merge_stems_abandon(seq8_instance_t *inst) {
    if (inst->merge_stem_phase == MS_RECORDING || inst->merge_stem_phase == MS_ENDING)
        g_ext->stems_stop();
    if (inst->merge_stem_phase != MS_DONE && inst->merge_stem_phase != MS_FAILED)
        merge_stems_reset(inst);
}

/* Does a merge stop of this merge wait for the bar line? */
static int merge_stems_wait_bar(const seq8_instance_t *inst) {
    return inst->merge_stem_n > 0;
}

/* render_block, before the tick loop. */
static void merge_stems_render_start(seq8_instance_t *inst) {
    const int ph = inst->merge_stem_phase;
    if (ph == MS_STARTING) {
        int slots[NUM_TRACKS], i, ok;
        const char *paths[NUM_TRACKS];
        if (inst->merge_stem_lead > 0) { inst->merge_stem_lead--; return; }
        for (i = 0; i < inst->merge_stem_n; i++) {
            const int t = inst->merge_stem_track[i];
            slots[i] = merge_stem_slot(inst, t);
            paths[i] = inst->merge_stem_path[t];
        }
        ok = g_ext && g_ext->stems_start &&
             g_ext->stems_start(inst->merge_stem_n, slots, paths, 0);
        inst->merge_stem_phase = ok ? MS_RECORDING : MS_FAILED;
        for (i = 0; i < NUM_TRACKS; i++) inst->merge_stem_path[i][0] = '\0';   /* the host has them */
        return;
    }
    if (ph == MS_FAILED && inst->merge_stem_n && inst->playing
            && inst->merge_state == MERGE_STATE_CAPTURED) {
        ext_transport_stop(inst);            /* no take to wait for */
        return;
    }
    if (ph == MS_RECORDING || ph == MS_ENDING) {
        const int st = g_ext->stems_state(NULL, 0);
        if (st == MOVE_STEMS_FAILED) inst->merge_stem_phase = MS_FAILED;
        else if (ph == MS_ENDING && st != MOVE_STEMS_RECORDING) {
            /* the last frame is in: now the merge may stop playing */
            if (st == MOVE_STEMS_IDLE) inst->merge_stem_phase = MS_DONE;
            if (inst->playing && inst->merge_state == MERGE_STATE_CAPTURED) ext_transport_stop(inst);
        }
    }
}

/* merge_place: the tracks whose take has sound, for the UI to load into
 * clip `row` (merge_audio). */
static void merge_stems_place(seq8_instance_t *inst, int row) {
    uint16_t peaks[MOVE_STEMS_MAX];
    int i;
    inst->merge_audio_mask = 0;
    inst->merge_audio_row  = (int8_t)row;
    if (!inst->merge_stem_n || inst->merge_stem_phase == MS_FAILED) return;
    g_ext->stems_state(peaks, MOVE_STEMS_MAX);
    for (i = 0; i < inst->merge_stem_n; i++)
        if (peaks[i]) inst->merge_audio_mask |= (uint8_t)(1u << inst->merge_stem_track[i]);
}
