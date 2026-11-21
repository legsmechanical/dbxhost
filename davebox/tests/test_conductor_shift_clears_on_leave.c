/* tests/test_conductor_shift_clears_on_leave.c — when the Conductor track is
 * converted to another kind, the shift it was applying goes with it. Before:
 * a conversion only cleared conductor_track; the offsets and the sounding flag
 * stayed, so under Cond Lock a stale shift could survive until some other
 * Conductor played. Every way out of the role is checked. */
#include "harness.h"

static void arm_shift(hx_t *h, seq8_instance_t *I, int t) {
    char k[48];
    snprintf(k, sizeof(k), "t%d_convert_to_conduct", t);
    hx_set_param(h, k, "1");
    HX_ASSERT(I->conductor_track == t, "control: the track is the Conductor");
    I->conductor_sounding = 1;   /* as a held Conductor note leaves it */
    I->conductor_off_deg  = 2;
    I->conductor_off_semi = 3;
}
static void expect_clear(seq8_instance_t *I, const char *how) {
    if (I->conductor_track != -1 || I->conductor_sounding || I->conductor_off_deg || I->conductor_off_semi) {
        fprintf(stderr, "FAIL: %s left track %d sounding %d deg %d semi %d\n", how, I->conductor_track,
                I->conductor_sounding, I->conductor_off_deg, I->conductor_off_semi);
        exit(1);
    }
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;

    arm_shift(h, I, 5); hx_set_param(h, "t5_convert_to_melodic", "1"); expect_clear(I, "convert to melodic");
    arm_shift(h, I, 5); hx_set_param(h, "t5_convert_to_drum", "1");    expect_clear(I, "convert to drum");
    hx_set_param(h, "t5_convert_to_melodic", "1");
    arm_shift(h, I, 5); hx_set_param(h, "t5_convert_to_audio", "1");   expect_clear(I, "convert to audio");

    hx_destroy(h);
    printf("PASS: conductor_shift_clears_on_leave\n");
    return 0;
}
