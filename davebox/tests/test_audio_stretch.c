/* WARP's stretcher on its own (dsp/seq8_stretch.h over Bungee): a 440 Hz sine
 * at half speed comes out twice as long at the same pitch; at its own speed
 * with pitch 2 it comes out as long, an octave up; backwards it still sounds
 * 440 (the caller reads its input backwards); and the positions each output
 * chunk reports run on by speed x its frames. Driven the way the stretcher
 * thread does: the caller fills the planar scratch, zeros outside the sample. */
#include "harness.h"
#include "seq8_stretch.h"
#include <math.h>

#define SR    44100
#define NSRC  (2 * SR)
static float g_src[NSRC];

/* run the stretcher over the whole source at `speed`, `pitch` (backwards:
 * the input read from the end); returns output frames, writes up to `cap`
 * of channel L into out */
static int stretch(double speed, double pitch, int backwards, float *out, int cap) {
    au_st_t *st = au_st_create(SR, SR);
    int max = au_st_max_input(st), n = 0, b, e, i, got, chunks = 0;
    float *in = calloc(2 * (size_t)max, sizeof *in);
    const float *l, *r;
    double p0, p1 = 0;
    HX_ASSERT(st && in, "no stretcher");
    au_st_reset(st, 0, speed, pitch);
    while (!(p1 >= NSRC)) {
        au_st_want(st, speed, pitch, &b, &e);
        HX_ASSERT(e - b <= max, "the grain wants more input than au_st_max_input");
        for (i = 0; i < e - b; i++) {
            int k = b + i;
            if (backwards) k = NSRC - 1 - k;
            in[i] = in[max + i] = (k >= 0 && k < NSRC) ? g_src[k] : 0.f;
        }
        got = au_st_grain(st, in, max, &l, &r, &p0, &p1);
        for (i = 0; i < got; i++) {
            if (n + i < cap) out[n + i] = l[i];
            HX_ASSERT(l[i] == r[i], "a mono source came out with different channels");
        }
        if (got && p0 == p0 && p1 == p1) {
            chunks++;
            HX_ASSERT(fabs((p1 - p0) - speed * got) < 1.0, "a chunk's positions do not run on by speed x its frames");
        }
        if (p0 != p0) p1 = 0;
        n += got;
        if (n > 8 * NSRC) break;
    }
    HX_ASSERT(chunks > 10, "no output chunk reported its positions");
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

    n = stretch(0.5, 1, 0, out, 8 * NSRC);
    f = freq(out, n);
    printf("  half speed: %d frames (source %d), %.1f Hz\n", n, NSRC, f);
    HX_ASSERT(abs(n - 2 * NSRC) < 4096, "half speed is not twice as long");
    HX_ASSERT(fabs(f - 440) < 5, "half speed changed the pitch");

    n = stretch(1, 2, 0, out, 8 * NSRC);
    f = freq(out, n);
    printf("  pitch 2:    %d frames, %.1f Hz\n", n, f);
    HX_ASSERT(abs(n - NSRC) < 4096, "pitch 2 changed the length");
    HX_ASSERT(fabs(f - 880) < 10, "pitch 2 is not an octave up");

    n = stretch(1.5, 1, 1, out, 8 * NSRC);
    f = freq(out, n);
    printf("  backwards at 1.5x: %d frames, %.1f Hz\n", n, f);
    HX_ASSERT(abs(n - NSRC * 2 / 3) < 4096, "1.5x backwards is not two thirds as long");
    HX_ASSERT(fabs(f - 440) < 5, "backwards changed the pitch");

    printf("PASS: stretcher (half speed, pitch 2, backwards)\n");
    return 0;
}
