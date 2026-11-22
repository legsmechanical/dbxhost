/* tests/test_conductor_survives_solo.c — soloing a track never mutes the
 * Conductor or drops the shift it applies (ruled 2026-11-21). Before: any
 * solo made the Conductor effectively muted (solo is refused on it), so the
 * per-tick mute check cleared the shift every tick and its notes were no
 * longer dispatched (device check: also when the responder itself was
 * soloed). A user MUTE of the Conductor still clears it. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t7_convert_to_conduct", "1");
    HX_ASSERT(I->conductor_track == 7, "control: t7 is the Conductor");
    hx_set_param(h, "t7_c0_step_0_toggle", "67 100");
    hx_set_param(h, "t7_c0_step_0_gate", "360");       /* held across most of the bar */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t7_launch_clip", "0");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    for (int i = 0; i < 400 && !I->conductor_sounding; i++) hx_render(h, 1);
    HX_ASSERT(I->conductor_sounding, "rig: the Conductor note never set a shift");
    int semi = I->conductor_off_semi;

    hx_set_param(h, "t0_solo", "1");
    hx_render(h, 20);
    HX_ASSERT(effective_mute(I, 7) == 0, "a solo elsewhere does not mute the Conductor");
    HX_ASSERT(I->conductor_sounding && I->conductor_off_semi == semi, "a solo elsewhere keeps the shift");
    hx_set_param(h, "t0_solo", "0");

    hx_set_param(h, "t1_solo", "1");                    /* the responder itself */
    hx_render(h, 20);
    HX_ASSERT(I->conductor_sounding && I->conductor_off_semi == semi, "soloing the responder keeps the shift");
    hx_set_param(h, "t1_solo", "0");

    hx_set_param(h, "t7_mute", "1");                    /* control: mute still works */
    hx_render(h, 4);
    HX_ASSERT(effective_mute(I, 7) == 1, "control: a muted Conductor is muted");
    HX_ASSERT(!I->conductor_sounding, "control: muting the Conductor clears its shift");

    hx_destroy(h);
    printf("PASS: conductor_survives_solo\n");
    return 0;
}
