/* A MIXER STRIP'S GAIN GLIDES; IT DOES NOT STEP (mix_glide.h, from upstream #566).
 *
 * Volume and pan are read once per 128-frame block. Applied as constants, every
 * change was a gain step at a block boundary — zipper noise under a fader
 * sweep or an automated level, a click on a mute. The strip now moves the gain
 * it applies one frame at a time toward the block's target.
 *
 * Runs whole blocks the way the mix loops do and bounds the largest per-frame
 * change. With the smoothing removed (advance jumping to the target) it fails. */
#include <stdio.h>
#include <math.h>
#include "mix_glide.h"

#define BLOCK 128
static int failures = 0;
static void check(int cond, const char *what) {
    if (cond) printf("  ok  %s\n", what);
    else { printf("FAIL: %s\n", what); failures++; }
}

/* One block of a mix loop; returns the largest per-frame change of the L gain. */
static float run_block(mix_glide_t *g, float vol, float pan_l, float pan_r, float *last_l) {
    float worst = 0.0f;
    mix_glide_target(g, vol, pan_l, pan_r);
    for (int i = 0; i < BLOCK * 2; i++) {
        float gain = mix_glide_gain(g, i);
        if (!(i & 1)) {
            float d = fabsf(gain - *last_l);
            if (d > worst) worst = d;
            *last_l = gain;
        }
        if (i & 1) mix_glide_advance(g);
    }
    return worst;
}

int main(void) {
    /* The FIRST target snaps: a strip that has just appeared is not faded in. */
    mix_glide_t g = {0};
    mix_glide_target(&g, 0.8f, 1.0f, 0.5f);
    check(g.vol == 0.8f && g.pan_l == 1.0f && g.pan_r == 0.5f, "the first target snaps (no fade-in from silence)");
    check(mix_glide_gain(&g, 0) == 0.8f && mix_glide_gain(&g, 1) == 0.4f, "the gain is volume x the channel's pan gain");

    /* A full-scale step down (a mute, or a fader slammed): no frame moves by
     * more than the one-pole's first step, and it gets there. */
    float last = mix_glide_gain(&g, 0);
    float worst = run_block(&g, 0.0f, 1.0f, 0.5f, &last);
    check(worst > 0.0f && worst <= 0.8f * MIX_GLIDE_SMOOTH * 1.01f,
          "a mute moves the gain by at most one smoothing step per frame");
    check(g.vol > 0.3f, "one block (2.9 ms) into a mute the strip is still audibly fading, not cut");
    int monotonic = 1; float prev = g.vol;
    for (int b = 0; b < 16; b++) {
        run_block(&g, 0.0f, 1.0f, 0.5f, &last);
        if (g.vol > prev || g.vol < 0.0f) monotonic = 0;
        prev = g.vol;
    }
    check(monotonic, "the fade only ever goes down, and never below zero");
    check(g.vol < 0.002f, "about 50 ms later the strip is silent");

    /* A small step (one CC value of 127): still spread over frames. */
    mix_glide_t h = {0};
    mix_glide_target(&h, 0.5f, 1.0f, 1.0f);
    last = mix_glide_gain(&h, 0);
    worst = run_block(&h, 0.5f + 1.0f / 127.0f, 1.0f, 1.0f, &last);
    check(worst <= (1.0f / 127.0f) * MIX_GLIDE_SMOOTH * 1.01f, "a 1/127 fader step is not applied in one frame");

    /* Pan glides too: swinging the balance must not step either side. */
    mix_glide_t p = {0};
    mix_glide_target(&p, 1.0f, 1.0f, 1.0f);
    last = mix_glide_gain(&p, 0);
    worst = run_block(&p, 1.0f, 0.0f, 1.0f, &last);       /* hard right: L goes to 0 */
    check(worst <= MIX_GLIDE_SMOOTH * 1.01f, "a pan swing glides the falling side");
    check(p.pan_r == 1.0f, "and leaves the side that did not change exactly where it was");

    /* The plain ramp (master volume). */
    float st = -1.0f, ramp[BLOCK];
    mix_glide_ramp(&st, 0.7f, ramp, BLOCK);
    check(fabsf(ramp[0] - 0.7f) < 1e-6f && fabsf(ramp[BLOCK - 1] - 0.7f) < 1e-6f, "an unset ramp snaps to its first target");
    mix_glide_ramp(&st, 0.2f, ramp, BLOCK);
    float wr = fabsf(ramp[0] - 0.7f);
    for (int f = 1; f < BLOCK; f++) { float d = fabsf(ramp[f] - ramp[f - 1]); if (d > wr) wr = d; }
    check(wr <= 0.5f * MIX_GLIDE_SMOOTH * 1.01f, "a master-volume jump is spread over frames");
    check(ramp[BLOCK - 1] < ramp[0] && ramp[BLOCK - 1] > 0.2f, "and is still on its way after one block");

    if (failures) { printf("\n%d check(s) failed\n", failures); return 1; }
    printf("test_mix_glide: PASS\n");
    return 0;
}
