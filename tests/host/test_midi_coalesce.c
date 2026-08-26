/* test_midi_coalesce — relative-encoder CCs merge losslessly, and NOTHING else
 * is touched.
 *
 * The point of the helper is to put fewer knob events in the 64-slot ring that
 * drops silently when full, because a dropped RELEASE latches a modifier forever
 * (the stuck-Shift bug, Josh 2026-08-25). The risk it introduces is the mirror
 * image: merge one event too many and you delete a press or a release, which is
 * the very failure it exists to prevent. So the controls here matter as much as
 * the positive cases.
 */
#include <stdio.h>
#include <string.h>
#include "shadow_midi_coalesce.h"

static int fails = 0;

static void check(const char *what, int cond) {
    if (cond) { printf("  ok   %s\n", what); }
    else      { printf("  FAIL %s\n", what); fails = 1; }
}

/* count non-empty 4-byte packets */
static int packets(const uint8_t *b, int len) {
    int n = 0;
    for (int i = 0; i + 3 < len; i += 4)
        if (b[i] || b[i + 1] || b[i + 2] || b[i + 3]) n++;
    return n;
}

static void put(uint8_t *b, int slot, uint8_t cin, uint8_t st, uint8_t d1, uint8_t d2) {
    b[slot * 4 + 0] = cin; b[slot * 4 + 1] = st;
    b[slot * 4 + 2] = d1;  b[slot * 4 + 3] = d2;
}

int main(void) {
    printf("relative-encoder coalescing:\n");

    /* 1. Four +1 detents on one knob become a single +4. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        for (int i = 0; i < 4; i++) put(b, i, 0x0B, 0xB0, 79, 1);
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("four +1 detents collapse to one packet", packets(b, sizeof(b)) == 1);
        check("...carrying the summed value +4", b[3] == 4);
    }

    /* 2. Mixed directions sum, they do not merely count. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x0B, 0xB0, 79, 3);      /* +3 */
        put(b, 1, 0x0B, 0xB0, 79, 128 - 1);/* -1 */
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("+3 then -1 yields +2", packets(b, sizeof(b)) == 1 && b[3] == 2);
    }

    /* 2b. ⭑⭑ CONTROL: the PARAMETER knobs 71-78 are NOT merged.
     *     ccKnobDelta() reads only the SIGN and then COUNTS EVENTS for its
     *     acceleration ramp, so one event IS one click. Merging them throws
     *     clicks away and starves the ramp — shipped for one commit and caught
     *     on hardware as "really slow to go from min-to-max". */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        for (int i = 0; i < 4; i++) put(b, i, 0x0B, 0xB0, 71, 1);
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("knob 71: four detents stay FOUR events (accel counts them)",
              packets(b, sizeof(b)) == 4);
    }

    /* 3. A turn that returns to where it started emits NOTHING. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x0B, 0xB0, 79, 5);
        put(b, 1, 0x0B, 0xB0, 79, 128 - 5);
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("net-zero movement is dropped entirely", packets(b, sizeof(b)) == 0);
    }

    /* 4. A merged CC 79 run does not disturb neighbouring events. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x0B, 0xB0, 79, 1);
        put(b, 1, 0x0B, 0xB0, 71, 1);     /* a parameter knob: must survive */
        put(b, 2, 0x0B, 0xB0, 79, 1);
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("CC 79 merges while knob 71 survives beside it",
              packets(b, sizeof(b)) == 2);
        check("CC 79 summed to +2", b[3] == 2);
        check("knob 71 untouched at +1", b[7] == 1);
    }

    /* 5. ⭑⭑ CONTROL: notes are NEVER merged. Merging a press or a release is
     *    exactly the bug this feature exists to make rarer. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x09, 0x90, 68, 100);   /* pad on  */
        put(b, 1, 0x08, 0x80, 68, 0);     /* pad off */
        put(b, 2, 0x09, 0x90, 68, 100);   /* on again */
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("note on/off/on survives intact (3 packets)", packets(b, sizeof(b)) == 3);
    }

    /* 6. ⭑ CONTROL: a NON-encoder CC is left alone, even repeated. Shift (49) is
     *    a button on a CC — merging it would drop a release. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x0B, 0xB0, 49, 127);   /* Shift down */
        put(b, 1, 0x0B, 0xB0, 49, 0);     /* Shift up   */
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("Shift press+release both survive", packets(b, sizeof(b)) == 2);
        check("...and keep their values", b[3] == 127 && b[7] == 0);
    }

    /* 7. Clamp, never wrap. A wrap would REVERSE a turn's direction. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        for (int i = 0; i < 15; i++) put(b, i, 0x0B, 0xB0, 79, 9);  /* +135 */
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("an over-range sum clamps to +63", b[3] == 63);
        check("...and stays POSITIVE (a wrap would reverse the turn)",
              shadow_rel_decode(b[3]) > 0);
    }

    /* 8. Channel is part of identity — same CC on another channel is separate. */
    {
        uint8_t b[64]; memset(b, 0, sizeof(b));
        put(b, 0, 0x0B, 0xB0, 79, 1);
        put(b, 1, 0x0B, 0xB1, 79, 1);
        shadow_coalesce_relative_ccs(b, sizeof(b));
        check("same CC on a different channel is not merged", packets(b, sizeof(b)) == 2);
    }

    if (!fails) printf("PASS: coalescing is lossless and touches only encoders\n");
    else        printf("FAIL: coalescing contract broken\n");
    return fails;
}
