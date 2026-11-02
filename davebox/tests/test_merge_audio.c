/* tests/test_merge_audio.c — LIVE MERGE on an Audio track records its SOUND
 * (seq8_merge_audio.c; Josh, 2026-11-02: "live merge for audio tracks should
 * be audio, not sequences (so live recording the track), pre fx.").
 *
 *   - a scene merge: each Audio track in it records its slot through the
 *     host's stem take (stems_start, the path the UI sent); a MIDI track
 *     still records notes; the Audio track's notes are not captured;
 *   - the take starts LEAD_BLOCKS renders after the merge's first tick, as a
 *     resample's does;
 *   - Rec ends it on the bar line, the take limited to those whole bars, and
 *     the transport plays on until the files have their last frame;
 *   - placement reports the tracks whose take has sound, and the clip;
 *   - Track View (a solo merge) on an Audio track waits for the bar line too;
 *     on a MIDI track it still ends at once (the control);
 *   - a path is for one merge; a refused take fails without holding the
 *     transport; Rec in the count-in records nothing; a transport stop mid-bar
 *     rounds the take up to whole bars. */
#include "harness.h"

#define T_AUD  4
#define T_MIDI 1
#define PATH   "/data/UserData/UserLibrary/Samples/x/T5 merge 120bpm.wav"

static void note_at(hx_t *h, int t, int c, int step, int pitch) {
    char k[48], v[16];
    snprintf(k, sizeof k, "t%d_c%d_step_%d_toggle", t, c, step);
    snprintf(v, sizeof v, "%d 100", pitch);
    hx_set_param(h, k, v);
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    note_at(h, T_MIDI, 0, 0, 60);
    note_at(h, T_MIDI, 0, 4, 62);
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(inst->tracks[T_AUD].pad_mode == PAD_MODE_AUDIO, "rig: t4 is not Audio");
    note_at(h, T_AUD, 0, 0, AU_NOTE_BASE);           /* a chop on its first step */
    note_at(h, T_AUD, 0, 8, AU_NOTE_BASE + 1);
    inst->tracks[T_AUD].active_clip = 0;
    inst->tracks[T_MIDI].active_clip = 0;
    return h;
}

/* Render one block at a time until `done` holds; the block count, or -1. */
#define RENDER_UNTIL(h, cond, max) ({ int _n = 0; while (!(cond) && _n < (max)) { hx_render((h), 1); _n++; } (cond) ? _n : -1; })

static int phase(seq8_instance_t *inst) { return inst->merge_stem_phase; }
static void audio(hx_t *h, int *ph, int *stems, int *mask, int *row) {
    char b[64];
    *ph = *stems = *mask = *row = -9;
    if (hx_get_param(h, "merge_audio", b, sizeof b) > 0) sscanf(b, "%d %d %d %d", ph, stems, mask, row);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    int n, blk, stops, starts, k, ph, stems, mask, row;
    uint32_t limit;

    /* ---- scene merge ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "1");
    HX_ASSERT(phase(inst) == MS_ARMED && inst->merge_stem_n == 1, "the Audio track is not armed to record");
    k = RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURING, 3000);
    HX_ASSERT(k > 0, "the count-in never ended");
    HX_ASSERT(hx_stub_stems(NULL, NULL, NULL, NULL) == 0, "the take started on the merge's first tick, before its sound");
    k = RENDER_UNTIL(h, hx_stub_stems(NULL, NULL, NULL, NULL) > 0, 50);
    HX_ASSERT(k == LEAD_BLOCKS + 1, "the take did not start LEAD_BLOCKS renders after the first tick");
    starts = hx_stub_stems(&n, &blk, &limit, &stops);
    HX_ASSERT(n == 1 && hx_stub_stems_slot(0) == inst->tracks[T_AUD].pfx.slot, "the take is not the Audio track's slot");
    HX_ASSERT(!strcmp(hx_stub_stems_path(0), PATH), "the take is not at the path the UI sent");
    HX_ASSERT(limit == 0 && phase(inst) == MS_RECORDING, "the take is not open-ended while the merge runs");
    HX_ASSERT(inst->merge_stem_path[T_AUD][0] == '\0', "the path stayed for the next merge");

    hx_render(h, 800);                                   /* into bar 2 (a bar is ~689 blocks) */
    hx_set_param(h, "merge_stop", "1");
    HX_ASSERT(inst->merge_state == MERGE_STATE_STOPPING, "Rec did not wait for the bar line");
    k = RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURED, 3000);
    HX_ASSERT(k > 0, "the merge never ended");
    HX_ASSERT(inst->merge_end_abs % RS_BAR_TICKS == 0, "the merge did not end on a bar line");
    hx_stub_stems(NULL, NULL, &limit, NULL);
    HX_ASSERT(limit == rs_ticks_to_frames(inst, inst->merge_end_abs), "the take is not limited to the merge's bars");
    HX_ASSERT(limit == 2 * 88200u, "a merge stopped in bar 2 is not 2 bars at 120 bpm");
    HX_ASSERT(inst->merge_pending_count[T_MIDI] > 0, "control: the MIDI track did not record notes");
    HX_ASSERT(inst->merge_pending_count[T_AUD] == 0, "the Audio track's chops were captured as notes");
    hx_render(h, 20);
    HX_ASSERT(inst->playing, "the transport stopped before the take had its last frame");
    HX_ASSERT(phase(inst) == MS_ENDING, "the phase is not ENDING");
    hx_stub_stems_finish(0);
    hx_render(h, 1);
    HX_ASSERT(!inst->playing, "the transport did not stop once the take was written");
    HX_ASSERT(phase(inst) == MS_DONE, "the phase is not DONE");

    hx_stub_stems_peak(0, 1234);
    hx_set_param(h, "merge_place_row", "3");
    audio(h, &ph, &stems, &mask, &row);
    HX_ASSERT(ph == MS_DONE && stems == (1 << T_AUD) && mask == (1 << T_AUD) && row == 3,
              "placement does not report the track with sound and its clip");
    HX_ASSERT(inst->tracks[T_MIDI].clips[3].note_count > 0, "control: the MIDI track's notes were not placed");
    HX_ASSERT(inst->tracks[T_AUD].clips[3].note_count == 0, "notes were placed on the Audio track");

    /* a path is for one merge: the next has none */
    hx_set_param(h, "merge_arm", "1");
    HX_ASSERT(inst->merge_stem_n == 0 && phase(inst) == MS_NONE, "a merge with no path sent recorded audio");
    hx_set_param(h, "merge_stop", "1");                  /* Rec in the count-in */
    hx_destroy(h);

    /* ---- a silent take is skipped ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "1");
    RENDER_UNTIL(h, phase(inst) == MS_RECORDING, 3000);
    hx_set_param(h, "merge_stop", "1");
    RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURED, 3000);
    hx_stub_stems_finish(0);
    hx_render(h, 1);
    hx_set_param(h, "merge_place_row", "2");             /* peak 0 */
    audio(h, &ph, &stems, &mask, &row);
    HX_ASSERT(mask == 0 && row == 2, "a take of silence was reported for loading");
    hx_destroy(h);

    /* ---- Track View: a solo merge of the Audio track waits for the bar ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "t4");
    HX_ASSERT(inst->merge_stem_n == 1, "a solo merge of the Audio track does not record it");
    RENDER_UNTIL(h, phase(inst) == MS_RECORDING, 3000);
    hx_render(h, 100);
    hx_set_param(h, "merge_stop", "1");
    HX_ASSERT(inst->merge_state == MERGE_STATE_STOPPING && inst->playing, "a solo Audio merge ended off the bar line");
    RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURED, 3000);
    HX_ASSERT(inst->merge_end_abs == RS_BAR_TICKS, "the solo take is not one bar");
    HX_ASSERT(inst->merge_solo_track == T_AUD, "the solo placement lost its track");
    hx_destroy(h);

    /* control: a solo merge of a MIDI track still ends at once */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);           /* out of its scope */
    hx_set_param(h, "merge_arm", "t1");
    HX_ASSERT(inst->merge_stem_n == 0, "a merge of another track recorded the Audio track");
    RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURING, 3000);
    hx_render(h, 100);
    hx_set_param(h, "merge_stop", "1");
    HX_ASSERT(inst->merge_state == MERGE_STATE_CAPTURED && !inst->playing, "control: a MIDI solo merge waited");
    HX_ASSERT(inst->merge_stem_path[T_AUD][0] == '\0', "the out-of-scope path stayed");
    hx_destroy(h);

    /* ---- a refused take fails, and holds nothing ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_stub_stems_refuse(1);
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "1");
    RENDER_UNTIL(h, phase(inst) == MS_FAILED, 3000);
    HX_ASSERT(phase(inst) == MS_FAILED, "a refused take is not FAILED");
    hx_set_param(h, "merge_stop", "1");
    RENDER_UNTIL(h, inst->merge_state == MERGE_STATE_CAPTURED, 3000);
    hx_render(h, 1);
    HX_ASSERT(!inst->playing, "a failed take held the transport");
    hx_stub_stems_peak(0, 999);
    hx_set_param(h, "merge_place_row", "1");
    audio(h, &ph, &stems, &mask, &row);
    HX_ASSERT(mask == 0, "a failed take was reported for loading");
    hx_destroy(h);

    /* ---- Rec in the count-in records nothing ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "1");
    hx_render(h, 50);
    hx_set_param(h, "merge_stop", "1");
    hx_render(h, 100);
    HX_ASSERT(hx_stub_stems(NULL, NULL, NULL, NULL) == 0 && phase(inst) == MS_NONE, "a cancelled count-in recorded");
    hx_destroy(h);

    /* ---- a transport stop mid-bar rounds up to whole bars ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "merge_stem", "4 |" PATH);
    hx_set_param(h, "merge_arm", "1");
    RENDER_UNTIL(h, phase(inst) == MS_RECORDING, 3000);
    hx_render(h, 300);                                   /* about half a bar */
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(inst->merge_state == MERGE_STATE_CAPTURED, "rig: the stop did not end the merge");
    hx_stub_stems(NULL, NULL, &limit, NULL);
    HX_ASSERT(limit == 88200u, "a half-bar take is not rounded up to one bar");
    /* ...and a cancel at the placement prompt ends the take now */
    hx_set_param(h, "merge_cancel", "1");
    hx_stub_stems(NULL, NULL, NULL, &stops);
    HX_ASSERT(stops == 1 && phase(inst) == MS_NONE, "a cancelled merge left its take running");
    hx_destroy(h);

    printf("PASS: Live merge records an Audio track's sound\n");
    return 0;
}
