/* tests/test_param_auto_reset_smooth.c — Wrap: Reset + Smooth ramps up from
 * the resting value to the lane's first point instead of jumping to it.
 *
 * Josh, 2026-10-20: "smooth implies that the value never jumps. and on reset it
 * does." Ruling on the shape: "the part re ramping up from resting value makes
 * sense, but the later part seems to mimic what carry does, which we don't want
 * if we're at reset. reset means reset - so we're not concerned about the
 * transition from end to beginning."
 *
 * So, Reset + Smooth only: from the window start, ramp from the resting value
 * to what the first point PLAYS (scaled); after the last point hold its value
 * to the window end; the jump back to rest at the loop boundary stays.
 * Asserted on what the lane PLAYS (tN_cC_pa_vals — playback's evaluator and
 * its scaling) step by step. A 16-step clip at 24 ticks a step. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

#define TG "1:synth:cutoff"

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pt(hx_t *h, int tick, int val) {
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d %d", tick, val);
    hx_set_param(h, "t0_pa_set", v);
}
static void flag(hx_t *h, const char *key, int on) {
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d", on);
    hx_set_param(h, key, v);
}
/* The 14-bit value played at each of the 16 steps; -1 = none. */
static void plays(hx_t *h, int *raw) {
    char ans[4096];
    HX_ASSERT(hx_get_param(h, "t0_c0_pa_vals_0_24", ans, sizeof ans) > 0, "vals read answers");
    const char *p = strstr(ans, TG " ");
    HX_ASSERT(p != NULL, "a line for the lane");
    p += strlen(TG " ");
    for (int s = 0; s < 16; s++) {
        char d[5] = { 0 };
        memcpy(d, p + s * 4, 4);
        unsigned x = 0;
        sscanf(d, "%4x", &x);
        raw[s] = x == 0xffff ? -1 : (int)x;
    }
}
/* A lane: rest 2000, one point 10000 at step 8, Wrap Reset, Smooth as given. */
static hx_t *lane(int smooth, int with_rest) {
    hx_t *h = hx_create(NULL);
    if (with_rest) hx_set_param(h, "t0_pa_rest", "0 " TG " 2000");
    pt(h, 192, 10000);
    flag(h, "t0_pa_wrap", 1);
    flag(h, "t0_pa_smooth", smooth);
    return h;
}

int main(void) {
    int r[16];

    /* 1. The ramp: rest at the loop start, rising every step to the point. */
    {
        hx_t *h = lane(1, 1);
        plays(h, r);
        HX_ASSERT(r[0] == 2000, "step 1 plays the resting value");
        for (int s = 1; s <= 8; s++) HX_ASSERT(r[s] > r[s - 1], "rising every step up to the point");
        HX_ASSERT(r[8] == 10000, "the point plays its own value");
        HX_ASSERT(r[4] == 6000, "halfway in time is halfway in value (a straight ramp)");
        for (int s = 9; s < 16; s++) HX_ASSERT(r[s] == 10000, "after the last point: held, no ramp back toward rest");
        OK("⭐ Reset + Smooth: ramps from rest to the first point, holds after the last");
        hx_destroy(h);
    }

    /* 2. Scale 50 %: the ramp ends at what the point PLAYS (5000), not its raw
     *    value — no jump at the point — and still starts at rest (rest is never
     *    scaled). */
    {
        hx_t *h = lane(1, 1);
        hx_set_param(h, "t0_pa_scale", "0 " TG " 50");
        plays(h, r);
        HX_ASSERT(r[0] == 2000, "Scale: the ramp starts at the unscaled rest");
        HX_ASSERT(r[8] == 5000, "Scale: the point plays scaled");
        HX_ASSERT(r[7] < r[8] && r[7] > 4000, "Scale: step 8 is just below the scaled point (no jump onto it)");
        HX_ASSERT(r[4] == 3500, "Scale: halfway between rest and the scaled point");
        OK("Reset + Smooth with Scale: rest -> the scaled point, no jump at either end");
        hx_destroy(h);
    }

    /* 3. CONTROL: Reset without Smooth is unchanged — rest until the point. */
    {
        hx_t *h = lane(0, 1);
        plays(h, r);
        for (int s = 0; s < 8; s++) HX_ASSERT(r[s] == 2000, "Reset, Smooth off: rest before the point");
        HX_ASSERT(r[8] == 10000, "Reset, Smooth off: then the point");
        OK("CONTROL: Reset without Smooth still steps from rest to the point");
        hx_destroy(h);
    }

    /* 4. CONTROL: no resting value captured — the first point's value before
     *    it, as before (nothing to ramp from). */
    {
        hx_t *h = lane(1, 0);
        plays(h, r);
        for (int s = 0; s <= 8; s++) HX_ASSERT(r[s] == 10000, "no rest: the first point's value from the loop start");
        OK("CONTROL: no resting value -> the first point's value, flat");
        hx_destroy(h);
    }

    /* 5. A point ON the loop start: nothing before it, nothing to ramp. */
    {
        hx_t *h = lane(1, 1);
        pt(h, 0, 8000);
        plays(h, r);
        HX_ASSERT(r[0] == 8000, "a point at step 1 plays itself");
        for (int s = 1; s <= 8; s++) HX_ASSERT(r[s] > r[s - 1], "then the ordinary ramp between the two points");
        OK("a point on the loop start: no lead-in ramp, the points' own curve");
        hx_destroy(h);
    }

    printf("test_param_auto_reset_smooth: %d ok\n", ok_count);
    return 0;
}
