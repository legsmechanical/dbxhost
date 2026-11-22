/* tests/test_track_solo_exclusive.c — track solo is EXCLUSIVE (ruled
 * 2026-11-21, flipped: it was additive, and the mixer's exclusive). Soloing a
 * track un-solos the others; mute still clears that track's solo; the
 * Conductor stays unsoloable; a saved multi-solo still loads as saved and the
 * next solo gesture collapses it. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;

    hx_set_param(h, "t2_solo", "1");
    hx_set_param(h, "t3_solo", "1");
    HX_ASSERT(I->solo[3] == 1, "control: t3 soloed");
    HX_ASSERT(I->solo[2] == 0, "soloing t3 un-soloed t2");
    HX_ASSERT(effective_mute(I, 2) == 1 && effective_mute(I, 3) == 0, "only t3 sounds");

    hx_set_param(h, "t3_mute", "1");
    HX_ASSERT(I->solo[3] == 0, "control: mute clears that track's solo");
    hx_set_param(h, "t3_mute", "0");

    hx_set_param(h, "t4_solo", "1");
    hx_set_param(h, "t4_solo", "0");
    for (int t = 0; t < 8; t++) HX_ASSERT(I->solo[t] == 0, "un-soloing leaves nothing soloed");

    hx_set_param(h, "t5_solo", "1");
    hx_set_param(h, "t7_convert_to_conduct", "1");
    hx_set_param(h, "t7_solo", "1");                   /* inert on the Conductor */
    HX_ASSERT(I->solo[5] == 1 && I->solo[7] == 0, "a Conductor solo request changes nothing");

    /* A snapshot (or project) saved with two solos reloads as saved... */
    hx_set_param(h, "snap_save", "1 0 0 0 0 0 0 0 0  0 1 1 0 0 0 0 0  0 0 0 0 0 0 0 0");
    hx_set_param(h, "snap_load", "1");
    HX_ASSERT(I->solo[1] == 1 && I->solo[2] == 1, "a saved multi-solo recalls as saved");
    /* ...and the next solo gesture collapses it to one. */
    hx_set_param(h, "t6_solo", "1");
    for (int t = 0; t < 8; t++) HX_ASSERT(I->solo[t] == (t == 6), "the next solo leaves only t6");

    hx_destroy(h);
    printf("PASS: track_solo_exclusive\n");
    return 0;
}
