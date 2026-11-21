/* tests/test_mute_solo_mark_dirty.c — mute and solo are saved state, so a
 * change schedules a save. Before: tN_mute, tN_solo, mute_all_clear and a
 * mute-snapshot recall never set state_dirty (device check: a mute made and
 * followed only by a power loss was gone). Drum lane mute/solo already did. */
#include "harness.h"

static seq8_instance_t *I;
static void expect_dirty(hx_t *h, const char *key, const char *val) {
    I->state_dirty = 0;
    hx_set_param(h, key, val);
    if (I->state_dirty != 1) { fprintf(stderr, "FAIL: %s=%s did not set state_dirty\n", key, val); exit(1); }
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    I = (seq8_instance_t *)h->inst;

    I->state_dirty = 0;
    { char b[64]; hx_get_param(h, "state_dirty", b, (int)sizeof(b)); }
    HX_ASSERT(I->state_dirty == 0, "control: a get_param does not dirty the state");

    expect_dirty(h, "t1_mute", "1");
    HX_ASSERT(I->mute[1] == 1, "control: t1 muted");
    expect_dirty(h, "t1_mute", "0");
    expect_dirty(h, "t2_solo", "1");
    HX_ASSERT(I->solo[2] == 1, "control: t2 soloed");
    expect_dirty(h, "mute_all_clear", "1");
    HX_ASSERT(I->solo[2] == 0, "control: cleared");
    /* snap_save carries the mute/solo/lane-mute set itself (the UI builds it). */
    hx_set_param(h, "snap_save", "0 0 0 0 1 0 0 0 0  0 0 0 0 0 0 0 0  0 0 0 0 0 0 0 0");
    expect_dirty(h, "snap_load", "0");
    HX_ASSERT(I->mute[3] == 1, "control: the snapshot restored t3's mute");
    expect_dirty(h, "t0_l3_mute", "1");   /* pin: lane mute already did */

    /* What the flag schedules carries the mute. */
    {
        static char buf[262144];
        I->state_dirty = 1;
        int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
        HX_ASSERT(n > 0, "state_full returned nothing");
        HX_ASSERT(strstr(buf, "\"mute\":\"00010000\"") != NULL, "serialized state has t3's mute");
    }

    hx_destroy(h);
    printf("PASS: mute_solo_mark_dirty\n");
    return 0;
}
