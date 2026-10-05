/* tests/test_last_note_off_clears_conditions.c — removing a melodic step's LAST
 * note with its pad clears the step's conditions.
 *
 * Josh, 2026-10-05 (asked how conditions get onto empty steps, then "yes" to
 * clearing them): holding a step and tapping its note's pad sends `_toggle`,
 * which removed the note but kept iteration / probability / ratchet. The step
 * went dark carrying them invisibly, and they came back on the next note added
 * there. A step tap (`_clear`) always wiped them; now the last note does too.
 *
 * Control: removing one of TWO notes keeps the conditions (the step still plays). */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    clip_t *cl = &inst->tracks[1].clips[0];

    /* Two notes, a ratchet, a probability and an iteration on step 3. */
    hx_set_param(h, "t1_c0_step_3_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_3_toggle", "64 100");
    hx_set_param(h, "t1_c0_step_3_ratch", "3");
    hx_set_param(h, "t1_c0_step_3_rand", "50");
    hx_set_param(h, "t1_c0_step_3_iter", "33");   /* 0x21: 1 of 2 */
    HX_ASSERT(cl->step_note_count[3] == 2 && cl->step_ratchet[3] == 3
              && cl->step_random[3] == 50 && cl->step_iter[3] == 0x21, "control: set up");

    /* Control: one note left, the conditions stay. */
    hx_set_param(h, "t1_c0_step_3_toggle", "64 100");
    HX_ASSERT(cl->step_note_count[3] == 1, "control: one note removed");
    HX_ASSERT(cl->step_ratchet[3] == 3 && cl->step_random[3] == 50 && cl->step_iter[3] == 0x21,
              "removing one of two notes must keep the step's conditions");

    /* The last note: the conditions go with it. */
    hx_set_param(h, "t1_c0_step_3_toggle", "60 100");
    HX_ASSERT(cl->step_note_count[3] == 0 && !cl->steps[3], "control: step empty");
    HX_ASSERT(cl->step_ratchet[3] == 0, "the last note's removal kept the ratchet");
    HX_ASSERT(cl->step_random[3] == 0, "the last note's removal kept the probability");
    HX_ASSERT(cl->step_iter[3] == 0, "the last note's removal kept the iteration");

    /* A new note there starts clean. */
    hx_set_param(h, "t1_c0_step_3_toggle", "67 100");
    HX_ASSERT(cl->step_ratchet[3] == 0, "a new note on the step brought back the old ratchet");

    hx_destroy(h);
    printf("PASS: last_note_off_clears_conditions\n");
    return 0;
}
