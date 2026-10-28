/* WARP's stretcher on its own (dsp/seq8_stretch.h over Bungee): a 440 Hz sine
 * at half speed comes out twice as long at the same pitch; at its own speed
 * with pitch 2 it comes out as long, an octave up; backwards it still sounds
 * 440. Driven the way the stretcher thread will: the caller places each grain
 * and fills the planar scratch, zeros outside the sample. */
#include "harness.h"
#include "seq8_stretch.h"
#include <math.h>

#define SR    44100
#define NSRC  (2 * SR)
static float g_src[NSRC];

/* run the stretcher over the whole source at `speed` (signed), `pitch`;
 * returns output frames, writes up to `cap` of channel L into out */
static int stretch(double speed, double pitch, float *out, int cap) {
    au_st_t *st = au_st_create(SR, SR);
    int max = au_st_max_input(st), n = 0, b, e, i, got;
    float *in = calloc(2 * (size_t)max, sizeof *in);
    const float *l, *r;
    double pos = speed > 0 ? 0 : NSRC - 1;
    HX_ASSERT(st && in, "no stretcher");
    au_st_reset(st, pos, speed, pitch);
    while (speed > 0 ? pos < NSRC : pos >= 0) {
        au_st_want(st, pos, speed, pitch, &b, &e);
        HX_ASSERT(e - b <= max, "the grain wants more input than au_st_max_input");
        for (i = 0; i < e - b; i++) {
            int k = b + i;
            in[i] = in[max + i] = (k >= 0 && k < NSRC) ? g_src[k] : 0.f;
        }
        got = au_st_grain(st, in, max, &l, &r);
        for (i = 0; i < got; i++) {
            if (n + i < cap) out[n + i] = l[i];
            HX_ASSERT(l[i] == r[i], "a mono source came out with different channels");
        }
        n += got;
        pos += speed * got;
        if (n > 8 * NSRC) break;
    }
    au_st_destroy(st);
    free(in);
    return n;
}

/* rising zero crossings per second over the middle of out[0..n) */
static double freq(const float *out, int n) {
    int a = n / 4, z = a + n / 2, i, c = 0;
    for (i = a + 1; i < z; i++) if (out[i - 1] < 0 && out[i] >= 0) c++;
    return c * (double)SR / (z - a);
}

int main(void) {
    static float out[8 * NSRC];
    int i, n;
    double f;
    for (i = 0; i < NSRC; i++) g_src[i] = 0.5f * sinf(2 * (float)M_PI * 440 * i / SR);

    n = stretch(0.5, 1, out, 8 * NSRC);
    f = freq(out, n);
    printf("  half speed: %d frames (source %d), %.1f Hz\n", n, NSRC, f);
    HX_ASSERT(abs(n - 2 * NSRC) < 4096, "half speed is not twice as long");
    HX_ASSERT(fabs(f - 440) < 5, "half speed changed the pitch");

    n = stretch(1, 2, out, 8 * NSRC);
    f = freq(out, n);
    printf("  pitch 2:    %d frames, %.1f Hz\n", n, f);
    HX_ASSERT(abs(n - NSRC) < 4096, "pitch 2 changed the length");
    HX_ASSERT(fabs(f - 880) < 10, "pitch 2 is not an octave up");

    n = stretch(-1.5, 1, out, 8 * NSRC);
    f = freq(out, n);
    printf("  backwards at 1.5x: %d frames, %.1f Hz\n", n, f);
    HX_ASSERT(abs(n - NSRC * 2 / 3) < 4096, "1.5x backwards is not two thirds as long");
    HX_ASSERT(fabs(f - 440) < 5, "backwards changed the pitch");

    printf("PASS: stretcher (half speed, pitch 2, backwards)\n");
    return 0;
}
