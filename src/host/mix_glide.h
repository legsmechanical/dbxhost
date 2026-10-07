/* mix_glide.h — the gain a mixer strip ACTUALLY applies, gliding per frame.
 *
 * A strip's volume and pan are read once per 128-frame block, so every change
 * was a hard gain STEP at a block boundary: a fader moved by hand, automation
 * sweeping it, a CC stepping 1/127 at a time, a mute. Heard as zipper noise
 * and clicks. Each strip instead keeps the gain it is applying and moves it
 * one frame at a time toward the block's target — a ~5 ms one-pole, fast
 * enough that a sweep tracks the hand, slow enough that a step is not heard.
 * Mute and solo become short fades for free: they are a target of zero.
 *
 * (From upstream #566. Upstream kept these fields on the chain slot and built
 * the pan targets from its -1..+1 equal-power law; this fork's pan is a 0..1
 * BALANCE (shadow_pan_gain_l/r), and it has a second kind of strip — the Move
 * FX bus — so the state is its own struct and the caller supplies the pan
 * gains.)
 *
 * Header-only, allocation-free, no libm: runs on the SPI callback, and
 * tests/host/test_mix_glide.c drives it directly.
 */
#ifndef MIX_GLIDE_H
#define MIX_GLIDE_H

#include <stdint.h>

/* ~5 ms one-pole at 44.1 kHz: 1 - exp(-1 / (0.005 * 44100)). */
#define MIX_GLIDE_SMOOTH 0.00452f

typedef struct {
    float vol, pan_l, pan_r;        /* what the mix loop multiplies by NOW */
    float vol_t, pan_l_t, pan_r_t;  /* this block's targets */
    uint8_t init;                   /* 0 until the first target: that one SNAPS */
} mix_glide_t;

/* Once per block, before the strip's mix loop. The first call snaps, so a
 * strip that has just appeared does not fade in from silence. */
static inline void mix_glide_target(mix_glide_t *g, float vol, float pan_l, float pan_r)
{
    g->vol_t = vol; g->pan_l_t = pan_l; g->pan_r_t = pan_r;
    if (!g->init) {
        g->vol = vol; g->pan_l = pan_l; g->pan_r = pan_r;
        g->init = 1;
    }
}

/* Once per stereo frame, after both of its samples have been mixed. */
static inline void mix_glide_advance(mix_glide_t *g)
{
    g->vol   += (g->vol_t   - g->vol)   * MIX_GLIDE_SMOOTH;
    g->pan_l += (g->pan_l_t - g->pan_l) * MIX_GLIDE_SMOOTH;
    g->pan_r += (g->pan_r_t - g->pan_r) * MIX_GLIDE_SMOOTH;
}

/* The gain for interleaved sample index i (even = left, odd = right). */
static inline float mix_glide_gain(const mix_glide_t *g, int i)
{
    return g->vol * ((i & 1) ? g->pan_r : g->pan_l);
}

/* A whole block's ramp of one plain value (the master volume): fills
 * ramp[0..frames) and leaves *state at the last value. *state < 0 = unset. */
static inline void mix_glide_ramp(float *state, float target, float *ramp, int frames)
{
    if (*state < 0.0f) *state = target;
    for (int f = 0; f < frames; f++) {
        *state += (target - *state) * MIX_GLIDE_SMOOTH;
        ramp[f] = *state;
    }
}

#endif /* MIX_GLIDE_H */
