/* tests/test_geometry_moves_conditions.c — Shift, Stretch and Double carry a
 * step's conditions (Iter / Random / Ratchet, and the Slicer step fields) with
 * its notes, as Crop and page copy already did. Before: the notes moved and
 * the conditions stayed on the old step (device check: Shift +1 moved the note
 * from step 2 to 3 and left Iter on 2; Double gave the copy no condition). */
#include "harness.h"

static clip_t *MC(seq8_instance_t *I) { return &I->tracks[1].clips[I->tracks[1].active_clip]; }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    clip_t *c = MC(I);
    HX_ASSERT(c->length == 16 && c->loop_start == 0, "control: a 16-step clip at step 1");

    /* step 2 (index 2): a note, Iter 2:1 (0x21 = 33), Random 50, Ratchet 3 */
    hx_set_param(h, "t1_c0_step_2_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_2_iter", "33");
    hx_set_param(h, "t1_c0_step_2_rand", "50");
    hx_set_param(h, "t1_c0_step_2_ratch", "3");
    HX_ASSERT(c->step_iter[2] == 33 && c->step_random[2] == 50 && c->step_ratchet[2] == 3, "control: conditions set");

    /* Shift +1: note and conditions on step 3 */
    hx_set_param(h, "t1_clock_shift", "1");
    HX_ASSERT(c->step_note_count[3] > 0, "control: Shift moved the note to step 3");
    HX_ASSERT(c->step_iter[3] == 33 && c->step_random[3] == 50 && c->step_ratchet[3] == 3, "Shift +1: conditions moved with the note");
    HX_ASSERT(c->step_iter[2] == 0 && c->step_random[2] == 0, "Shift +1: the old step keeps none");
    /* Shift -1 back, and a wrap: the last step's conditions wrap to the first */
    hx_set_param(h, "t1_clock_shift", "-1");
    HX_ASSERT(c->step_iter[2] == 33, "Shift -1: back on step 2");

    /* Stretch x2: step 2 -> 4 */
    hx_set_param(h, "t1_beat_stretch", "1");
    HX_ASSERT(c->length == 32 && c->step_note_count[4] > 0, "control: stretch moved the note to step 4");
    HX_ASSERT(c->step_iter[4] == 33 && c->step_ratchet[4] == 3, "Stretch x2: conditions on step 4");
    HX_ASSERT(c->step_iter[2] == 0, "Stretch x2: step 2 keeps none");
    /* Stretch /2: step 4 -> 2 */
    hx_set_param(h, "t1_beat_stretch", "-1");
    HX_ASSERT(c->length == 16 && c->step_note_count[2] > 0, "control: stretch /2 moved the note back to 2");
    HX_ASSERT(c->step_iter[2] == 33 && c->step_random[2] == 50, "Stretch /2: conditions back on step 2");
    HX_ASSERT(c->step_iter[4] == 0, "Stretch /2: step 4 keeps none");

    /* Double: the copy on step 18 has them too */
    hx_set_param(h, "t1_loop_double_fill", "1");
    HX_ASSERT(c->length == 32 && c->step_note_count[18] > 0, "control: double copied the note to 18");
    HX_ASSERT(c->step_iter[18] == 33 && c->step_ratchet[18] == 3, "Double: the copy carries the conditions");
    HX_ASSERT(c->step_iter[2] == 33, "Double: the original keeps them");

    /* Drum lane: Shift and Double through the lane keys (shared helpers +
     * the lane's own double loop). */
    HX_ASSERT(I->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 drum");
    hx_set_param(h, "t0_l2_step_1_toggle", "100");
    hx_set_param(h, "t0_l2_step_1_rand", "40");
    clip_t *lc = &I->tracks[0].drum_clips[I->tracks[0].active_clip]->lanes[2].clip;
    hx_set_param(h, "t0_l2_clock_shift", "1");
    HX_ASSERT(lc->step_note_count[2] > 0, "control: lane shift moved the hit to step 2");
    HX_ASSERT(lc->step_random[2] == 40 && lc->step_random[1] == 0, "lane Shift: Random moved with the hit");
    hx_set_param(h, "t0_l2_loop_double_fill", "1");
    HX_ASSERT(lc->step_random[2 + 16] == 40, "lane Double: the copy carries Random");
    hx_set_param(h, "t0_all_lanes_double_fill", "1");
    HX_ASSERT(lc->length == 64 && lc->step_random[2 + 32] == 40, "all-lanes Double: the copy carries Random");

    hx_destroy(h);
    printf("PASS: geometry_moves_conditions\n");
    return 0;
}
