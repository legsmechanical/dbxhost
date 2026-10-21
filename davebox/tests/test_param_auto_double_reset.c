/* tests/test_param_auto_double_reset.c — Loop double on a Wrap: Reset lane:
 * the doubled clip must play like the old loop played TWICE.
 *
 * Josh, 2026-10-21: "If an automation lane's length is set to clip, then the
 * loop double function should also carry the automation when it doubles" —
 * and on the device the copy's first steps held what the first half ended on,
 * where each pass of the old loop started at rest. Asserted on what the lane
 * PLAYS (tN_cC_pa_vals, playback's evaluator) on a melodic track: a 16-step
 * clip, a lock on step 4, doubled to 32 steps; steps 16..31 must equal 0..15. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

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

static hx_t *lane(int reset, int smooth, int rest, int scale) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_c0_step_4_toggle", "60 100");
    char v[96];
    if (rest >= 0) { snprintf(v, sizeof v, "0 " TG " %d", rest); hx_set_param(h, "t1_pa_rest", v); }
    hx_set_param(h, "t1_pa_set", "0 " TG " 96 12000");
    hx_set_param(h, "t1_pa_set", "0 " TG " 240 6000");
    snprintf(v, sizeof v, "0 " TG " %d", reset); hx_set_param(h, "t1_pa_wrap", v);
    snprintf(v, sizeof v, "0 " TG " %d", smooth); hx_set_param(h, "t1_pa_smooth", v);
    if (scale != 100) { snprintf(v, sizeof v, "0 " TG " %d", scale); hx_set_param(h, "t1_pa_scale", v); }
    return h;
}

static void same_twice(hx_t *h, const char *what) {
    int a[16], b[16], c[16];
    page(h, 0, a);
    hx_set_param(h, "t1_loop_double_fill", "1");
    HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[1].clips[0].length == 32, "setup: doubled to 32 steps");
    page(h, 0, b); page(h, 16, c);
    for (int s = 0; s < 16; s++) {
        if (b[s] != a[s] || c[s] < a[s] - 1 || c[s] > a[s] + 1) {
            printf("  FAIL — %s: step %d plays %d / %d, the old loop %d\n", what, s, b[s], c[s], a[s]);
            exit(1);
        }
    }
    OK(what);
}

int main(void) {
    { hx_t *h = lane(1, 0, 2000, 100); same_twice(h, "⭐ Reset, Smooth off, rest 2000: the copied bar starts at rest again"); hx_destroy(h); }
    { hx_t *h = lane(1, 1, 2000, 100); same_twice(h, "⭐ Reset + Smooth: the copied bar glides up from rest again"); hx_destroy(h); }
    { hx_t *h = lane(1, 0, 2000, 50);  same_twice(h, "Reset, Scale 50 %: the pinned rest still plays as the rest"); hx_destroy(h); }
    { hx_t *h = lane(1, 0, -1, 100);   same_twice(h, "Reset, no rest captured: the copy starts on the first point's value"); hx_destroy(h); }
    { hx_t *h = lane(0, 0, 2000, 100); same_twice(h, "CONTROL: Carry, Smooth off — the copy carries the last value in, as the loop did"); hx_destroy(h); }
    { hx_t *h = lane(0, 1, 2000, 100); same_twice(h, "CONTROL: Carry + Smooth — the wrap ramp, unchanged"); hx_destroy(h); }
    printf("test_param_auto_double_reset: %d ok\n", ok_count);
    return 0;
}
