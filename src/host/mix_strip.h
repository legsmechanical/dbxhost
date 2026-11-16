/* mix_strip.h — a mixer strip's channel processing: a console-style 3-band
 * EQ with a swept mid, and a one-knob compressor.
 *
 * Where it runs: on every strip (a chain slot, a Move FX bus) AFTER the
 * strip's insert FX and BEFORE its fader and pan — a console channel's order,
 * comp then EQ (as the Yamaha MG's channel: an EQ boost does not drive the
 * comp; Josh, 2026-11-15: "comp before eq").
 * The sends, which are post-fader, hear it; the "FX at unity" capture tap
 * does not (a bounce that goes on playing through the same strip would
 * otherwise be EQ'd and compressed twice).
 *
 * EQ (RBJ biquads, transposed direct form II, float):
 *   Low   shelf  100 Hz fixed, slope 1       ±15 dB
 *   Mid   peak   250 Hz .. 5 kHz, Q 0.9      ±15 dB   f = 250 * 20^p, p 0..1
 *                                                     (p 0.5 ≈ 1.1 kHz)
 *   High  shelf  10 kHz fixed, slope 1       ±15 dB
 * The corners and the sweep are the Yamaha MG's (MG16XU: 100 Hz / 10 kHz
 * shelves, mid 250 Hz - 5 kHz; Josh, 2026-11-16: "the high shelf seems to be
 * positioned really high. what are the yamaha standard settings?" → "yeah").
 *
 * Compressor — one knob, voiced as a mixing desk's "1-knob" channel comp
 * (Yamaha MG: ratio 1:1 to 4:1, threshold down ~30 dB, output 0 to +7 dB,
 * attack ~25 ms, release ~300 ms). Amount a, 0..1:
 *   threshold  -30 a dBFS        ratio  1 + 3 a        make-up  +7 a dB
 * Soft knee 6 dB, feed-forward, stereo-linked (both channels take the gain
 * of the louder), no lookahead (no latency). The detector takes the peak of
 * each 16-frame sub-block; the gain is interpolated per sample.
 *
 * COST: a strip whose EQ is flat and whose comp is 0 is returned UNTOUCHED
 * (mix_strip_run returns its input pointer) — zero cost, bit-identical. A band
 * at 0 dB is skipped on its own. Coefficients are recomputed only while a
 * smoothed value is moving (one-pole, ~30 ms, stepped per block).
 *
 * Header-only and allocation-free: runs on the SPI callback. The process
 * function carries its own optimisation level, because the shim it is
 * compiled into builds without one.
 */
#ifndef MIX_STRIP_H
#define MIX_STRIP_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include "mix_soft_clip.h"

/* `static inline`, so a file that includes this header without running a
 * strip emits nothing (and needs no libm); the shim, which runs it, gets one
 * out-of-line copy compiled at -O3 (it builds unoptimised, so never inlines). */
#if defined(__GNUC__) && !defined(__clang__)
#define MIX_STRIP_HOT __attribute__((optimize("O3")))
#else
#define MIX_STRIP_HOT
#endif

#define MIX_STRIP_SR          44100.0f
#define MIX_STRIP_PI          3.14159265358979f   /* (M_PI is not C11) */
#define MIX_STRIP_MAX_FRAMES  128
#define MIX_STRIP_EQ_DB_MAX   15.0f
#define MIX_STRIP_LOW_HZ      100.0f     /* Yamaha MG: 100 Hz shelf */
#define MIX_STRIP_HIGH_HZ     10000.0f   /* Yamaha MG: 10 kHz shelf */
#define MIX_STRIP_MID_LO_HZ   250.0f
#define MIX_STRIP_MID_SPAN    20.0f      /* Yamaha MG sweep: 250 Hz .. 5 kHz */
#define MIX_STRIP_MID_Q       0.9f
#define MIX_STRIP_FREQ_DEF    0.5f       /* ~1.1 kHz, the sweep's middle */
/* the comp's voicing */
#define MIX_STRIP_THRESH_DB   (-30.0f)   /* at a = 1 */
#define MIX_STRIP_RATIO_ADD   3.0f       /* ratio = 1 + 3a: 4:1 at a = 1 */
#define MIX_STRIP_MAKEUP_DB   7.0f       /* at a = 1 */
#define MIX_STRIP_KNEE_DB     6.0f
#define MIX_STRIP_ATTACK_MS   25.0f
#define MIX_STRIP_RELEASE_MS  300.0f
#define MIX_STRIP_SUB         16         /* detector sub-block, frames */
/* ~30 ms one-pole at the block rate (128 frames = 2.902 ms) */
#define MIX_STRIP_SMOOTH      0.0922f
/* a strip not run for this many blocks (a parked slot) starts clean */
#define MIX_STRIP_GAP_BLOCKS  4u

enum { MIX_STRIP_EQ_LOW, MIX_STRIP_EQ_MID, MIX_STRIP_EQ_MID_FREQ, MIX_STRIP_EQ_HIGH,
       MIX_STRIP_COMP, MIX_STRIP_NPARAMS };

/* The keys, in field order (the strip's own namespace adds the prefix:
 * `slot:eq_low`, `move_fx:2:comp`). `comp_gr` is read-only. */
static const char *const MIX_STRIP_KEYS[MIX_STRIP_NPARAMS] = {
    "eq_low", "eq_mid", "eq_mid_freq", "eq_high", "comp" };

typedef struct { float b0, b1, b2, a1, a2; } mix_biquad_t;

typedef struct {
    float target[MIX_STRIP_NPARAMS];   /* what was set */
    float cur[MIX_STRIP_NPARAMS];      /* the smoothed value the audio uses */
    mix_biquad_t bq[3];                /* low, mid, high */
    float z[3][2][2];                  /* [band][channel][z1, z2] */
    uint8_t band_on[3];
    uint8_t dirty[3];                  /* coefficients owed */
    float env_db;                      /* the comp's gain reduction now, <= 0 */
    float gain;                        /* the last linear gain applied (incl. make-up) */
    float gr_db;                       /* readout: the block's deepest reduction, <= 0 */
    uint32_t last_block;
    uint8_t ran;
    uint8_t inited;                    /* 0 in a zeroed struct: the first touch inits */
} mix_strip_t;

static inline float mix_strip_clampf(float v, float lo, float hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

/* Field index of a key ("eq_low" ...), or -1. */
static inline int mix_strip_field(const char *key)
{
    if (!key) return -1;
    for (int i = 0; i < MIX_STRIP_NPARAMS; i++)
        if (strcmp(key, MIX_STRIP_KEYS[i]) == 0) return i;
    return -1;
}

static inline float mix_strip_default(int field)
{
    return field == MIX_STRIP_EQ_MID_FREQ ? MIX_STRIP_FREQ_DEF : 0.0f;
}

static inline float mix_strip_clamp_field(int field, float v)
{
    if (v != v) return mix_strip_default(field);              /* NaN */
    if (field == MIX_STRIP_EQ_MID_FREQ || field == MIX_STRIP_COMP) return mix_strip_clampf(v, 0.0f, 1.0f);
    return mix_strip_clampf(v, -MIX_STRIP_EQ_DB_MAX, MIX_STRIP_EQ_DB_MAX);
}

static inline void mix_strip_reset_state(mix_strip_t *st)
{
    memset(st->z, 0, sizeof st->z);
    st->env_db = 0.0f;
    st->gr_db = 0.0f;
    st->gain = -1.0f;                  /* unset: the first sub-block snaps */
}

/* Flat, comp off, clean. */
static inline void mix_strip_init(mix_strip_t *st)
{
    memset(st, 0, sizeof *st);
    for (int i = 0; i < MIX_STRIP_NPARAMS; i++) st->target[i] = st->cur[i] = mix_strip_default(i);
    mix_strip_reset_state(st);
    st->inited = 1;
}

/* A zeroed struct (a static array) is a valid strip: its first touch inits it. */
static inline void mix_strip_ensure(mix_strip_t *st) { if (!st->inited) mix_strip_init(st); }

/* Set a field (clamped). The audio glides to it. */
static inline void mix_strip_set(mix_strip_t *st, int field, float v)
{
    if (field < 0 || field >= MIX_STRIP_NPARAMS) return;
    mix_strip_ensure(st);
    st->target[field] = mix_strip_clamp_field(field, v);
}

/* Set a field and SNAP to it (a project load: no glide from the last one). */
static inline void mix_strip_set_now(mix_strip_t *st, int field, float v)
{
    if (field < 0 || field >= MIX_STRIP_NPARAMS) return;
    mix_strip_ensure(st);
    st->target[field] = st->cur[field] = mix_strip_clamp_field(field, v);
    if (field != MIX_STRIP_COMP) st->dirty[field == MIX_STRIP_EQ_MID_FREQ ? 1 : field == MIX_STRIP_EQ_HIGH ? 2 : field] = 1;
}

/* Parse "eq_low" + "3.5" into the strip. Returns 1 when the key is a strip
 * key (even if the value was junk), else 0. */
static inline int mix_strip_set_key(mix_strip_t *st, const char *key, const char *val)
{
    if (key && strcmp(key, "strip") == 0) {
        /* all five in ONE write, in field order, space-separated — a project
         * load's restore (one mailbox write per strip, not five); a value
         * missing from the end is its default */
        const char *p = val ? val : "";
        for (int f = 0; f < MIX_STRIP_NPARAMS; f++) {
            char *end = NULL;
            float v = strtof(p, &end);
            if (end == p) v = mix_strip_default(f);
            else p = end;
            mix_strip_set(st, f, v);
        }
        return 1;
    }
    int f = mix_strip_field(key);
    if (f < 0) return 0;
    if (val) mix_strip_set(st, f, (float)atof(val));
    return 1;
}

/* Is `key` (without its strip's prefix) one of the strip's? */
static inline int mix_strip_is_key(const char *key)
{
    return key && (mix_strip_field(key) >= 0 || strcmp(key, "comp_gr") == 0 || strcmp(key, "strip") == 0);
}

/* Format a strip key's value ("eq_low", "comp_gr", "strip" ...): bytes
 * written, or -1 when the key is not the strip's. */
static inline int mix_strip_get_key(const mix_strip_t *st, const char *key, char *buf, int len)
{
    if (!key || !buf || len <= 0) return -1;
    if (strcmp(key, "comp_gr") == 0) return snprintf(buf, (size_t)len, "%.2f", st->inited ? st->gr_db : 0.0f);
    if (strcmp(key, "strip") == 0) {
        float v[MIX_STRIP_NPARAMS];
        for (int f = 0; f < MIX_STRIP_NPARAMS; f++) v[f] = st->inited ? st->target[f] : mix_strip_default(f);
        return snprintf(buf, (size_t)len, "%.2f %.2f %.4f %.2f %.4f", v[0], v[1], v[2], v[3], v[4]);
    }
    int f = mix_strip_field(key);
    if (f < 0) return -1;
    return snprintf(buf, (size_t)len, (f == MIX_STRIP_EQ_MID_FREQ || f == MIX_STRIP_COMP) ? "%.4f" : "%.2f",
                    st->inited ? st->target[f] : mix_strip_default(f));
}

/* The mid band's centre frequency for a 0..1 position. */
static inline float mix_strip_mid_hz(float p)
{
    return MIX_STRIP_MID_LO_HZ * powf(MIX_STRIP_MID_SPAN, mix_strip_clampf(p, 0.0f, 1.0f));
}

/* RBJ cookbook. kind 0 low shelf, 1 peak, 2 high shelf; shelves at slope 1. */
static inline void mix_biquad_design(mix_biquad_t *c, int kind, float hz, float db, float q)
{
    const float A = powf(10.0f, db / 40.0f);
    const float w = 2.0f * MIX_STRIP_PI * hz / MIX_STRIP_SR;
    const float cw = cosf(w), sw = sinf(w);
    float b0, b1, b2, a0, a1, a2;
    if (kind == 1) {
        const float al = sw / (2.0f * q);
        b0 = 1.0f + al * A; b1 = -2.0f * cw; b2 = 1.0f - al * A;
        a0 = 1.0f + al / A; a1 = -2.0f * cw; a2 = 1.0f - al / A;
    } else {
        /* slope S = 1: alpha = sin(w)/2 * sqrt(2) */
        const float al = sw * 0.70710678f;
        const float sa = 2.0f * sqrtf(A) * al;
        if (kind == 0) {
            b0 = A * ((A + 1.0f) - (A - 1.0f) * cw + sa);
            b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cw);
            b2 = A * ((A + 1.0f) - (A - 1.0f) * cw - sa);
            a0 = (A + 1.0f) + (A - 1.0f) * cw + sa;
            a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cw);
            a2 = (A + 1.0f) + (A - 1.0f) * cw - sa;
        } else {
            b0 = A * ((A + 1.0f) + (A - 1.0f) * cw + sa);
            b1 = -2.0f * A * ((A - 1.0f) + (A + 1.0f) * cw);
            b2 = A * ((A + 1.0f) + (A - 1.0f) * cw - sa);
            a0 = (A + 1.0f) - (A - 1.0f) * cw + sa;
            a1 = 2.0f * ((A - 1.0f) - (A + 1.0f) * cw);
            a2 = (A + 1.0f) - (A - 1.0f) * cw - sa;
        }
    }
    const float n = 1.0f / a0;
    c->b0 = b0 * n; c->b1 = b1 * n; c->b2 = b2 * n; c->a1 = a1 * n; c->a2 = a2 * n;
}

/* The comp's static curve: gain change in dB (<= 0, make-up NOT included)
 * for a detector level x dBFS at amount a. */
static inline float mix_strip_comp_curve(float x, float a)
{
    if (a <= 0.0f) return 0.0f;
    const float T = MIX_STRIP_THRESH_DB * a;
    const float R = 1.0f + MIX_STRIP_RATIO_ADD * a;
    const float W = MIX_STRIP_KNEE_DB;
    const float over = x - T;
    if (2.0f * over <= -W) return 0.0f;
    if (2.0f * over < W) {
        const float k = over + W * 0.5f;
        return (1.0f / R - 1.0f) * k * k / (2.0f * W);
    }
    return (T + over / R) - x;
}

static inline float mix_strip_makeup_db(float a) { return MIX_STRIP_MAKEUP_DB * a; }

/* Is the strip doing nothing at all right now? (flat, comp off and settled) */
static inline int mix_strip_idle(const mix_strip_t *st)
{
    if (!st->inited) return 1;
    for (int i = 0; i < MIX_STRIP_NPARAMS; i++)
        if (i != MIX_STRIP_EQ_MID_FREQ && (st->target[i] != 0.0f || st->cur[i] != 0.0f)) return 0;
    return st->env_db == 0.0f;
}

/* Once per block: glide the values, recompute what moved, decide each band. */
static inline void mix_strip_step(mix_strip_t *st)
{
    for (int i = 0; i < MIX_STRIP_NPARAMS; i++) {
        float d = st->target[i] - st->cur[i];
        if (d == 0.0f) continue;
        /* settle: within 0.01 dB (gains), 1e-4 (positions, amount) */
        float eps = (i == MIX_STRIP_EQ_MID_FREQ || i == MIX_STRIP_COMP) ? 1e-4f : 0.01f;
        if (fabsf(d) < eps) st->cur[i] = st->target[i];
        else st->cur[i] += d * MIX_STRIP_SMOOTH;
        if (i == MIX_STRIP_EQ_LOW) st->dirty[0] = 1;
        else if (i == MIX_STRIP_EQ_MID || i == MIX_STRIP_EQ_MID_FREQ) st->dirty[1] = 1;
        else if (i == MIX_STRIP_EQ_HIGH) st->dirty[2] = 1;
    }
    static const int gain_field[3] = { MIX_STRIP_EQ_LOW, MIX_STRIP_EQ_MID, MIX_STRIP_EQ_HIGH };
    for (int b = 0; b < 3; b++) {
        const float g = st->cur[gain_field[b]];
        const int on = g != 0.0f;
        if (!on && st->band_on[b]) memset(st->z[b], 0, sizeof st->z[b]);     /* dropped at ~0 dB: click-free */
        st->band_on[b] = (uint8_t)on;
        if (on && st->dirty[b]) {
            if (b == 0)      mix_biquad_design(&st->bq[0], 0, MIX_STRIP_LOW_HZ, g, 0.0f);
            else if (b == 1) mix_biquad_design(&st->bq[1], 1, mix_strip_mid_hz(st->cur[MIX_STRIP_EQ_MID_FREQ]), g, MIX_STRIP_MID_Q);
            else             mix_biquad_design(&st->bq[2], 2, MIX_STRIP_HIGH_HZ, g, 0.0f);
            st->dirty[b] = 0;
        }
    }
    if (st->cur[MIX_STRIP_COMP] == 0.0f && st->target[MIX_STRIP_COMP] == 0.0f) {
        st->env_db = 0.0f; st->gr_db = 0.0f; st->gain = -1.0f;
    }
}

/* Run one block of interleaved stereo int16 (frames <= 128). Returns `in`
 * when the strip does nothing (untouched, no cost), else `scratch`, which it
 * filled. `now_block` is a counter the caller advances once per block: a
 * strip that was not run for a few blocks (a parked slot) starts clean. */
static inline MIX_STRIP_HOT const int16_t *mix_strip_run(mix_strip_t *st, const int16_t *in, int16_t *scratch,
                                                  int frames, uint32_t now_block)
{
    mix_strip_ensure(st);
    if (st->ran && now_block - st->last_block > MIX_STRIP_GAP_BLOCKS) mix_strip_reset_state(st);
    st->ran = 1; st->last_block = now_block;
    mix_strip_step(st);
    const float a = st->cur[MIX_STRIP_COMP];
    if (!st->band_on[0] && !st->band_on[1] && !st->band_on[2] && a == 0.0f) return in;
    if (frames > MIX_STRIP_MAX_FRAMES) frames = MIX_STRIP_MAX_FRAMES;

    float buf[MIX_STRIP_MAX_FRAMES * 2];
    const int n = frames * 2;
    for (int i = 0; i < n; i++) buf[i] = (float)in[i] * (1.0f / 32768.0f);

    /* Comp — first, as on a mixing desk's channel (Yamaha MG: HPF, comp, EQ):
     * an EQ boost does not drive it */
    if (a > 0.0f || st->env_db != 0.0f) {
        const float att = 1.0f - expf(-(float)MIX_STRIP_SUB / (MIX_STRIP_ATTACK_MS * 0.001f * MIX_STRIP_SR));
        const float rel = 1.0f - expf(-(float)MIX_STRIP_SUB / (MIX_STRIP_RELEASE_MS * 0.001f * MIX_STRIP_SR));
        const float mk = mix_strip_makeup_db(a);
        float deepest = 0.0f;
        for (int s = 0; s < frames; s += MIX_STRIP_SUB) {
            const int e = (s + MIX_STRIP_SUB < frames ? s + MIX_STRIP_SUB : frames) * 2;
            float pk = 0.0f;
            for (int i = s * 2; i < e; i++) { const float v = fabsf(buf[i]); if (v > pk) pk = v; }
            const float x = pk > 1e-6f ? 6.0206f * log2f(pk) : -120.0f;     /* 20 log10 */
            const float want = mix_strip_comp_curve(x, a);
            st->env_db += (want - st->env_db) * (want < st->env_db ? att : rel);
            if (st->env_db > -1e-4f && a == 0.0f) st->env_db = 0.0f;
            if (st->env_db < deepest) deepest = st->env_db;
            const float g1 = exp2f((st->env_db + mk) * 0.16609640f);      /* 10^(dB/20) */
            const float g0 = st->gain < 0.0f ? g1 : st->gain;
            const int len = (e - s * 2) / 2;
            const float dg = (g1 - g0) / (float)len;
            float g = g0;
            for (int i = s * 2; i < e; i += 2) {
                g += dg;
                buf[i] *= g; buf[i + 1] *= g;
            }
            st->gain = g1;
        }
        st->gr_db = deepest;
    }

    /* EQ: each band that is on, one channel at a time (the state stays in registers) */
    for (int b = 0; b < 3; b++) {
        if (!st->band_on[b]) continue;
        const mix_biquad_t c = st->bq[b];
        for (int ch = 0; ch < 2; ch++) {
            float z1 = st->z[b][ch][0], z2 = st->z[b][ch][1];
            for (int i = ch; i < n; i += 2) {
                const float x = buf[i];
                const float y = c.b0 * x + z1;
                z1 = c.b1 * x - c.a1 * y + z2;
                z2 = c.b2 * x - c.a2 * y;
                buf[i] = y;
            }
            /* flush denormals and keep the state finite */
            if (!(fabsf(z1) > 1e-20f)) z1 = 0.0f;
            if (!(fabsf(z2) > 1e-20f)) z2 = 0.0f;
            st->z[b][ch][0] = z1; st->z[b][ch][1] = z2;
        }
    }

    for (int i = 0; i < n; i++) {
        const float v = buf[i] * 32768.0f;
        const int32_t q = (int32_t)(v >= 0.0f ? v + 0.5f : v - 0.5f);
        scratch[i] = mix_soft_clip(q);
    }
    return scratch;
}

#endif /* MIX_STRIP_H */
