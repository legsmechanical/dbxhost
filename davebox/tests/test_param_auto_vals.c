/* tests/test_param_auto_vals.c — tN_cC_pa_vals_<base>_<tps>: what each lane of a
 * clip PLAYS at 16 steps, for the AUTOMATION bank's intensity gradient.
 *
 * The colours must be what you HEAR, so the read goes through playback's own
 * evaluator: Smooth interpolates, Scale scales, a step outside the lane's
 * window reads "ff" (no value), and a lane's own Loop window extends past the
 * clip. Asserted against those rules on known points, not against the raw
 * point list — a read that dumped points would pass a "has values" check. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pa_set(hx_t *h, const char *tgt, int tick, int val) {
    char v[128];
    snprintf(v, sizeof(v), "0 %s %d %d", tgt, tick, val);
    hx_set_param(h, "t0_pa_set", v);
}

/* The 16 values of `tgt`'s line in the answer, -1 for "ffff"; 0 if absent.
 * `v` is on the gradient's 0..127 (derived as the UI does), `raw` the 14-bit
 * value itself when non-NULL. */
static int vals_for14(const char *ans, const char *tgt, int *v, int *raw) {
    char key[96];
    snprintf(key, sizeof(key), "%s ", tgt);
    const char *p = strstr(ans, key);
    if (!p) return 0;
    p += strlen(key);
    for (int s = 0; s < 16; s++) {
        char d[5] = { 0 };
        memcpy(d, p + s * 4, 4);
        unsigned x = 0;
        if (sscanf(d, "%4x", &x) != 1) return 0;
        const int v14 = x == 0xffff ? -1 : (int)x;
        if (raw) raw[s] = v14;
        v[s] = v14 < 0 ? -1 : (v14 * 127 + 8191) / 16383;
    }
    return 1;
}
static int vals_for(const char *ans, const char *tgt, int *v) { return vals_for14(ans, tgt, v, NULL); }

int main(void) {
    hx_t *h = hx_create(NULL);
    char ans[4096];
    int v[16];

    /* A 16-step clip (window ticks 0..383). Smooth ramp 0 → full over the clip. */
    pa_set(h, "1:synth:cutoff", 0, 0);
    pa_set(h, "1:synth:cutoff", 360, 16383);            /* step 15 */
    hx_set_param(h, "t0_pa_smooth", "0 1:synth:cutoff 1");

    HX_ASSERT(hx_get_param(h, "t0_c0_pa_vals_0_24", ans, sizeof(ans)) > 0, "the read answers");
    HX_ASSERT(vals_for(ans, "1:synth:cutoff", v), "a line for the lane");
    HX_ASSERT(v[0] == 0 && v[15] == 127, "the ramp runs 0 → 127 across the page");
    for (int s = 1; s < 16; s++) HX_ASSERT(v[s] > v[s - 1], "Smooth: every step higher than the last");
    HX_ASSERT(v[8] >= 66 && v[8] <= 70, "step 9 is about 8/15 of the way (68)");
    {
        int raw[16];
        vals_for14(ans, "1:synth:cutoff", v, raw);
        HX_ASSERT(raw[15] == 16383 && raw[0] == 0, "the ends read their exact 14-bit values");
        HX_ASSERT(raw[8] > 8738 - 40 && raw[8] < 8738 + 40, "step 9 reads at FULL resolution (~8738 of 16383), not 7-bit");
        HX_ASSERT(raw[8] % 129 != 0 || raw[7] % 129 != 0, "the values are not merely 7-bit values scaled up");
    }
    OK("⭐ a Smooth ramp reads as the ramp playback plays, step by step");

    /* Scale 50 % halves what plays. */
    hx_set_param(h, "t0_pa_scale", "0 1:synth:cutoff 50");
    hx_get_param(h, "t0_c0_pa_vals_0_24", ans, sizeof(ans));
    vals_for(ans, "1:synth:cutoff", v);
    HX_ASSERT(v[15] >= 62 && v[15] <= 65, "Scale 50 %: the top step reads about half (64)");
    hx_set_param(h, "t0_pa_scale", "0 1:synth:cutoff 100");
    OK("Scale applies — the gradient is what you hear, not the raw point");

    /* The next page is outside a 16-step clip: no value anywhere. */
    hx_get_param(h, "t0_c0_pa_vals_16_24", ans, sizeof(ans));
    HX_ASSERT(vals_for(ans, "1:synth:cutoff", v), "still a line for the lane");
    for (int s = 0; s < 16; s++) HX_ASSERT(v[s] == -1, "page 2 of a 1-page clip: every step ff");
    OK("steps outside the lane's window read ff (no value)");

    /* A lane with its OWN 32-step Loop plays past the 16-step clip. */
    pa_set(h, "1:synth:reso", 0, 16383);
    hx_set_param(h, "t0_pa_loop", "0 1:synth:reso 768 0 5");
    hx_get_param(h, "t0_c0_pa_vals_16_24", ans, sizeof(ans));
    HX_ASSERT(vals_for(ans, "1:synth:reso", v), "a line for the looped lane");
    for (int s = 0; s < 16; s++) HX_ASSERT(v[s] == 127, "page 2 of its own 2-bar loop has values");
    OK("a lane's own Loop window extends its values past the clip");

    /* Malformed keys are refused, not guessed at. */
    HX_ASSERT(hx_get_param(h, "t0_c0_pa_vals_16", ans, sizeof(ans)) < 0, "no tps: refused");
    HX_ASSERT(hx_get_param(h, "t0_c0_pa_vals_0_0", ans, sizeof(ans)) < 0, "tps 0: refused");
    OK("a malformed read is refused");

    hx_destroy(h);
    printf("test_param_auto_vals: %d ok\n", ok_count);
    return 0;
}
