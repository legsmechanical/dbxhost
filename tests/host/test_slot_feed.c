/* Audio an overtake DSP hands a chain slot (slot_feed.h).
 *
 * A block handed over in overtake render k is mixed by the slot in frame k+1
 * and only then; two hand-overs in one render add up; a later render replaces
 * an earlier one; the slot stays live while fed and for a hold once its FX are
 * idle, never counting down while they still ring. */
#include "../../src/host/slot_feed.h"
#include <stdio.h>

static int fails = 0;
static void expect(int cond, const char *what) {
    printf("  %s %s\n", cond ? "ok  " : "FAIL", what);
    if (!cond) fails = 1;
}

int main(void) {
    static slot_feed_t f;
    int16_t a[256], b[256], dst[256];
    for (int i = 0; i < 256; i++) { a[i] = 1000; b[i] = 30000; dst[i] = 5; }

    expect(slot_feed_current(&f, 0) == 0, "nothing before the first overtake render");
    expect(slot_feed_current(&f, 1) == 0, "nothing never fed");

    slot_feed_put(&f, 7, a, 128);
    expect(slot_feed_current(&f, 7) != 0, "fed in render 7: mixed while the sequence reads 7");
    expect(slot_feed_current(&f, 8) == 0, "...and not in the frame after");
    slot_feed_put(&f, 7, a, 128);
    expect(f.lr[0] == 2000 && f.lr[255] == 2000, "two hand-overs in one render add up");
    slot_feed_put(&f, 7, b, 128);
    slot_feed_put(&f, 7, b, 128);
    expect(f.lr[3] == 32767, "the sum saturates");
    slot_feed_put(&f, 9, a, 64);
    expect(f.lr[0] == 1000 && f.lr[127] == 1000 && f.lr[128] == 0,
           "a later render replaces the earlier block; a short block leaves silence after it");

    slot_feed_mix(dst, slot_feed_current(&f, 9));
    expect(dst[0] == 1005 && dst[200] == 5, "mixing adds the block to the slot's output");

    /* liveness */
    static slot_feed_t g;
    expect(slot_feed_tick(&g, 3, 1) == 0, "an unfed slot is not live");
    slot_feed_put(&g, 3, a, 128);
    expect(slot_feed_tick(&g, 3, 1) == 1 && g.live == SLOT_FEED_HOLD, "fed: live, hold reset");
    int i;
    for (i = 0; i < 1000; i++) slot_feed_tick(&g, 4 + i, 0);
    expect(g.live == SLOT_FEED_HOLD, "no countdown while the FX still ring");
    for (i = 0; i < SLOT_FEED_HOLD - 1; i++) slot_feed_tick(&g, 2000 + i, 1);
    expect(g.live == 1, "counts down once the FX are idle");
    expect(slot_feed_tick(&g, 5000, 1) == 0, "...and lapses after the hold");

    printf(fails ? "FAIL: test_slot_feed\n" : "PASS: test_slot_feed\n");
    return fails;
}
