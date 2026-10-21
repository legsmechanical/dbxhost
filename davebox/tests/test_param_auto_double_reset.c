/* tests/test_param_auto_double_reset.c — Loop double on a Wrap: Reset lane:
 * the doubled clip must play like the old loop played TWICE.
 *
 * Josh, 2026-10-21: "If an automation lane's length is set to clip, then the
 * loop double function should also carry the automation when it doubles" —
 * and on the device the copy's first steps held what the first half ended on,
 * where each pass of the old loop started at rest. Asserted on what the lane
 * PLAYS — playback's evaluator, tick by tick, from each tick and just before
 * it, plus the step readout (tN_cC_pa_vals) — on a melodic track: a 16-step
 * clip doubled to 32 steps; ticks 384..767 must equal 0..383. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define TG "2:synth:cutoff"

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void page(hx_t *h, int base, int *raw) {
    char key[64], ans[4096];
    snprintf(key, sizeof key, "t1_c0_pa_vals_%d_24", base);
    HX_ASSERT(hx_get_param(h, key, ans, sizeof ans) > 0, "vals read answers");
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

static pa_entry_t *entry_of(hx_t *h) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    return pa_find(in, 1, 0, pa_target_lookup(in, TG));
}

/* A lane at rest 2000 with points 12000 at step 4 and 6000 at step 10 (they
 * glide), a punch on step 12, its Wrap, its Scale; optionally its start point
 * deleted. */
static hx_t *lane(int reset, int punch, int drop_start, int scale) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_c0_step_4_toggle", "60 100");
    char v[96];
    hx_set_param(h, "t1_pa_rest", "0 " TG " 2000");
    hx_set_param(h, "t1_pa_set", "0 " TG " 96 12000");
    hx_set_param(h, "t1_pa_set", "0 " TG " 240 6000");
    if (punch) hx_set_param(h, "t1_pa_hold_write", "0 " TG " 12 12 24 15000 1 0");
    snprintf(v, sizeof v, "0 " TG " %d", reset); hx_set_param(h, "t1_pa_wrap", v);
    if (scale != 100) { snprintf(v, sizeof v, "0 " TG " %d", scale); hx_set_param(h, "t1_pa_scale", v); }
    if (drop_start) {
        pa_entry_t *e = entry_of(h);
        HX_ASSERT(e->points[0].tick == 0, "setup: a start point");
        memmove(&e->points[0], &e->points[1], (size_t)(e->count - 1) * sizeof(pa_point_t));
        e->count--;
    }
    return h;
}

/* The doubled lane, tick by tick, against the old one played twice — and
 * the step readout (tN_cC_pa_vals) on both halves. */
static void same_twice(hx_t *h, const char *what) {
    int a[16], b[16], c[16];
    page(h, 0, a);
    pa_entry_t old = *entry_of(h);
    hx_set_param(h, "t1_loop_double_fill", "1");
    HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[1].clips[0].length == 32, "setup: doubled to 32 steps");
    const pa_entry_t *e = entry_of(h);
    for (uint32_t t = 0; t < 384; t++) {
        uint16_t x = 0, y = 0, z = 0;
        pa_eval_from(&old, t, 0, 384, 0, &x);
        pa_eval_from(e, t, 0, 768, 0, &y);
        pa_eval_from(e, t + 384, 0, 768, 0, &z);
        /* ±1: a seam that falls mid-glide is a stored (rounded) point where
         * the old loop computed the glide exactly — on both sides of it. */
        if (y < x - 1 || y > x + 1 || z < x - 1 || z > x + 1) {
            printf("  FAIL — %s: tick %u plays %u / %u, the old loop %u\n", what, t, y, z, x);
            exit(1);
        }
        uint16_t xb = 0, zb = 0;
        pa_eval_before(&old, t, 0, 384, 0, &xb);
        pa_eval_before(e, t + 384, 0, 768, 0, &zb);
        if (zb < xb - 1 || zb > xb + 1) {
            printf("  FAIL — %s: just before tick %u the copy plays %u, the old loop %u\n", what, t, zb, xb);
            exit(1);
        }
    }
    page(h, 0, b); page(h, 16, c);
    for (int s = 0; s < 16; s++)
        HX_ASSERT(b[s] >= a[s] - 1 && b[s] <= a[s] + 1 && c[s] >= a[s] - 1 && c[s] <= a[s] + 1,
                  "the step readout agrees on both halves");
    OK(what);
}

int main(void) {
    { hx_t *h = lane(1, 0, 0, 100); same_twice(h, "⭐ Reset: the copied bar holds, jumps back to its start, and glides as the old one did"); hx_destroy(h); }
    { hx_t *h = lane(1, 1, 0, 100); same_twice(h, "⭐ Reset with a punch: its jump pairs copied with it"); hx_destroy(h); }
    { hx_t *h = lane(1, 0, 0, 50);  same_twice(h, "Reset, Scale 50 %"); hx_destroy(h); }
    { hx_t *h = lane(1, 0, 1, 100); same_twice(h, "Reset, start point deleted: the copy plays the first point's value before it, as the loop did"); hx_destroy(h); }
    { hx_t *h = lane(0, 0, 0, 100); same_twice(h, "Carry: the glide across the seam, unchanged"); hx_destroy(h); }
    { hx_t *h = lane(0, 1, 1, 100); same_twice(h, "Carry, a punch, start point deleted: the wrap glide at the seam"); hx_destroy(h); }
    printf("test_param_auto_double_reset: %d ok\n", ok_count);
    return 0;
}
