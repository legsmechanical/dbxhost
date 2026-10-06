/* tests/test_row_cut_keeps_direction.c — moving a scene row keeps each clip's
 * playback direction.
 *
 * THE BUG THIS PINS (2026-10-04 module review): row_cut copied the notes and
 * the play-effects of every clip in the row but not playback_dir /
 * playback_audio_reverse — on melodic clips or drum lanes — so a reversed or
 * ping-pong clip played forward after the row was moved. row_copy and
 * clip_cut both carried them. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    HX_ASSERT(I->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 is a drum track");
    HX_ASSERT(I->tracks[1].pad_mode != PAD_MODE_DRUM, "control: t1 is melodic");
    HX_ASSERT(I->tracks[0].drum_clips[2] && I->tracks[0].drum_clips[5], "control: drum clips exist");

    /* Row 2: a reversed melodic clip and a reversed drum lane, with content. */
    hx_set_param(h, "t1_c2_step_0_toggle", "60 100");
    I->tracks[1].clips[2].playback_dir = 1;
    I->tracks[1].clips[2].playback_audio_reverse = 1;
    clip_t *lane = &I->tracks[0].drum_clips[2]->lanes[3].clip;
    lane->playback_dir = 2;
    lane->playback_audio_reverse = 1;
    HX_ASSERT(I->tracks[1].clips[5].playback_dir == 0, "control: the destination starts forward");

    hx_set_param(h, "row_cut", "2 5");

    HX_ASSERT(I->tracks[1].clips[5].note_count > 0, "control: the row moved (melodic notes arrived)");
    HX_ASSERT(I->tracks[1].clips[5].playback_dir == 1, "melodic clip lost its direction");
    HX_ASSERT(I->tracks[1].clips[5].playback_audio_reverse == 1, "melodic clip lost its reverse style");
    HX_ASSERT(I->tracks[1].clips[5].pp_dir_state == initial_pp_dir(1), "melodic ping-pong state not re-seeded");
    clip_t *dl = &I->tracks[0].drum_clips[5]->lanes[3].clip;
    HX_ASSERT(dl->playback_dir == 2, "drum lane lost its direction");
    HX_ASSERT(dl->playback_audio_reverse == 1, "drum lane lost its reverse style");
    /* ...and the source row is back to defaults. */
    HX_ASSERT(I->tracks[1].clips[2].playback_dir == 0, "the source clip kept a direction after the cut");

    hx_destroy(h);
    printf("PASS: row_cut_keeps_direction\n");
    return 0;
}
