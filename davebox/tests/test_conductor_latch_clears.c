/* tests/test_conductor_latch_clears.c — a Conductor track turned into a drum
 * track gives the Conductor role back.
 *
 * THE BUG THIS PINS (2026-10-04 module review): only one track may be the
 * Conductor, tracked by inst->conductor_track. convert_to_melodic cleared it;
 * convert_to_drum did not — so after Conductor → Drum no other track could
 * become the Conductor until the project was reloaded. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;

    hx_set_param(h, "t5_convert_to_conduct", "1");
    HX_ASSERT(I->tracks[5].pad_mode == PAD_MODE_CONDUCT && I->conductor_track == 5,
              "control: t5 is the Conductor");
    /* Control: the latch refuses a second Conductor while one exists. */
    hx_set_param(h, "t6_convert_to_conduct", "1");
    HX_ASSERT(I->tracks[6].pad_mode != PAD_MODE_CONDUCT, "control: a second Conductor is refused");

    I->state_dirty = 0;
    hx_set_param(h, "t5_convert_to_drum", "1");
    HX_ASSERT(I->tracks[5].pad_mode == PAD_MODE_DRUM, "control: t5 became a drum track");
    HX_ASSERT(I->conductor_track == -1, "the Conductor role stayed latched on a drum track");
    HX_ASSERT(I->state_dirty == 1, "the change was not scheduled for saving");

    hx_set_param(h, "t6_convert_to_conduct", "1");
    HX_ASSERT(I->tracks[6].pad_mode == PAD_MODE_CONDUCT && I->conductor_track == 6,
              "another track could not take the Conductor role");

    /* A plain melodic → drum conversion leaves someone else's role alone. */
    hx_set_param(h, "t3_convert_to_drum", "1");
    HX_ASSERT(I->conductor_track == 6, "an unrelated conversion cleared the Conductor");

    hx_destroy(h);
    printf("PASS: conductor_latch_clears\n");
    return 0;
}
