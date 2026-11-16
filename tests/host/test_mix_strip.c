/* A MIXER STRIP'S CHANNEL PROCESSING: 3-band EQ (swept mid) + one-knob comp
 * (mix_strip.h).
 *
 * Drives the header the way the mix loops do — whole 128-frame blocks of
 * interleaved int16 — and checks what a console channel promises: a flat
 * strip costs nothing and changes nothing; each band lands its gain where it
 * says; the comp follows its voicing (Yamaha MG-like: -30 dB / 4:1 / +7 dB at
 * full, 25 ms attack); both channels take one gain; nothing blows up. */
#include <stdio.h>
#include <math.h>
#include <string.h>
#include <time.h>
#include "mix_strip.h"

#define BLOCK 128
static int failures = 0;
static void check(int cond, const char *what) {
    if (cond) printf("  ok  %s\n", what);
    else { printf("FAIL: %s\n", what); failures++; }
}
static float db(float g) { return 20.0f * log10f(g); }

static uint32_t blk = 1;
static const int16_t *run(mix_strip_t *st, const int16_t *in, int16_t *out) {
    return mix_strip_run(st, in, out, BLOCK, blk++);
}

/* Steady sine through the strip; gain (out peak / in peak) in dB, measured
 * after `settle` blocks over `meas` blocks. `r_amp` puts a second sine on R. */
static float sine_gain(mix_strip_t *st, float hz, float amp, int settle, int meas) {
    int16_t in[BLOCK * 2], out[BLOCK * 2];
    double ph = 0.0, inc = 2.0 * M_PI * hz / 44100.0;
    float pin = 0.0f, pout = 0.0f;
    for (int b = 0; b < settle + meas; b++) {
        for (int f = 0; f < BLOCK; f++) {
            int16_t v = (int16_t)lrint(sin(ph) * amp * 32767.0);
            in[f * 2] = in[f * 2 + 1] = v; ph += inc;
        }
        const int16_t *o = run(st, in, out);
        if (b >= settle)
            for (int i = 0; i < BLOCK * 2; i++) {
                if (abs(in[i]) > pin) pin = (float)abs(in[i]);
                if (abs(o[i]) > pout) pout = (float)abs(o[i]);
            }
    }
    return db(pout / pin);
}

static mix_strip_t fresh(void) { mix_strip_t s; mix_strip_init(&s); return s; }

int main(void) {
    int16_t in[BLOCK * 2], out[BLOCK * 2];
    for (int i = 0; i < BLOCK * 2; i++) in[i] = (int16_t)((i * 7919) % 20000 - 10000);

    /* ---- flat: the input pointer back, untouched ---- */
    {
        mix_strip_t s = fresh();
        check(run(&s, in, out) == in, "a flat strip with the comp at 0 returns its input (no cost, bit-identical)");
        check(mix_strip_idle(&s), "a fresh strip is idle");
        mix_strip_set(&s, MIX_STRIP_EQ_MID_FREQ, 0.9f);
        check(run(&s, in, out) == in, "moving only the mid's frequency leaves a flat strip bypassed");
    }

    /* ---- each band where it says ---- */
    {
        mix_strip_t s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 15.0f);
        float g20 = sine_gain(&s, 20.0f, 0.1f, 60, 40);
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 15.0f);
        float g100 = sine_gain(&s, 100.0f, 0.1f, 40, 20);
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 15.0f);
        float g5k = sine_gain(&s, 5000.0f, 0.1f, 20, 20);
        printf("     low +15: 20 Hz %+.2f  100 Hz %+.2f  5 kHz %+.2f\n", g20, g100, g5k);
        check(fabsf(g20 - 15.0f) < 0.6f, "low shelf +15 dB reaches ~+15 at 20 Hz");
        check(g100 > 6.0f && g100 < 9.5f, "low shelf is about half its gain at its 100 Hz corner (Yamaha MG)");
        check(fabsf(g5k) < 0.3f, "low shelf leaves 5 kHz alone");

        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, -15.0f);
        float c20 = sine_gain(&s, 20.0f, 0.5f, 60, 40);
        check(fabsf(c20 + 15.0f) < 0.6f, "low shelf -15 dB cuts ~15 at 20 Hz");

        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 15.0f);
        float h18 = sine_gain(&s, 18000.0f, 0.1f, 20, 20);
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 15.0f);
        float h10 = sine_gain(&s, 10000.0f, 0.1f, 20, 20);
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 15.0f);
        float h200 = sine_gain(&s, 200.0f, 0.1f, 20, 20);
        printf("     high +15: 18 kHz %+.2f  10 kHz %+.2f  200 Hz %+.2f\n", h18, h10, h200);
        check(h18 > 13.0f && h18 < 15.6f, "high shelf +15 dB is near full at 18 kHz");
        check(h10 > 6.0f && h10 < 9.5f, "high shelf is about half its gain at its 10 kHz corner (Yamaha MG)");
        check(fabsf(h200) < 0.3f, "high shelf leaves 200 Hz alone");

        const float pos[3] = { 0.0f, 0.5f, 1.0f }, hz[3] = { 250.0f, 1118.03f, 5000.0f };   /* Yamaha MG sweep: 250 Hz .. 5 kHz */
        for (int k = 0; k < 3; k++) {
            s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_MID_FREQ, pos[k]); mix_strip_set_now(&s, MIX_STRIP_EQ_MID, 15.0f);
            float g = sine_gain(&s, hz[k], 0.1f, 40, 20);
            char what[96]; snprintf(what, sizeof what, "mid +15 at position %.1f peaks ~+15 at %.0f Hz (%+.2f)", pos[k], hz[k], g);
            check(fabsf(g - 15.0f) < 0.4f, what);
        }
        check(fabsf(mix_strip_mid_hz(0.5f) - 1118.03f) < 0.5f, "the mid's centre position is ~1.1 kHz (the 250 Hz - 5 kHz sweep's middle)");
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_MID, 15.0f);
        float m30 = sine_gain(&s, 30.0f, 0.1f, 60, 40);
        check(fabsf(m30) < 1.0f, "a 1 kHz mid boost leaves 30 Hz (nearly) alone");
    }

    /* ---- glides to a setting and back to bypass ---- */
    {
        mix_strip_t s = fresh();
        mix_strip_set(&s, MIX_STRIP_EQ_MID, 6.0f);
        const int16_t *o = run(&s, in, out);
        check(o == out, "a band just set is engaged");
        check(s.cur[MIX_STRIP_EQ_MID] > 0.0f && s.cur[MIX_STRIP_EQ_MID] < 1.0f, "the gain GLIDES (no step to +6 in one block)");
        for (int b = 0; b < 200; b++) run(&s, in, out);
        check(s.cur[MIX_STRIP_EQ_MID] == 6.0f, "the glide settles exactly on its target");
        mix_strip_set(&s, MIX_STRIP_EQ_MID, 0.0f);
        for (int b = 0; b < 200; b++) run(&s, in, out);
        check(run(&s, in, out) == in, "back to flat, the strip is bypassed again");
        check(s.z[1][0][0] == 0.0f && s.z[1][1][1] == 0.0f, "a band dropped at 0 dB leaves no state behind");
    }

    /* ---- stability at the extremes, no denormals ---- */
    {
        mix_strip_t s = fresh();
        mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 15.0f); mix_strip_set_now(&s, MIX_STRIP_EQ_MID, 15.0f);
        mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 15.0f); mix_strip_set_now(&s, MIX_STRIP_COMP, 1.0f);
        uint32_t r = 12345; int ok = 1;
        for (int b = 0; b < 400; b++) {
            for (int i = 0; i < BLOCK * 2; i++) { r = r * 1103515245u + 12345u; in[i] = (int16_t)(r >> 16); }
            mix_strip_set(&s, MIX_STRIP_EQ_MID_FREQ, (b / 50) & 1 ? 1.0f : 0.0f);
            run(&s, in, out);
            for (int x = 0; x < 3; x++) for (int c = 0; c < 2; c++) for (int k = 0; k < 2; k++)
                if (!isfinite(s.z[x][c][k])) ok = 0;
        }
        check(ok, "all bands +15, comp full, full-scale noise, mid swept end to end: state stays finite");
        s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, -15.0f); mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 15.0f);
        memset(in, 0, sizeof in); in[0] = 30000;
        run(&s, in, out); in[0] = 0;
        for (int b = 0; b < 3500; b++) run(&s, in, out);              /* ~10 s of silence */
        int sub = 0;
        for (int x = 0; x < 3; x++) for (int c = 0; c < 2; c++) for (int k = 0; k < 2; k++)
            if (s.z[x][c][k] != 0.0f && fpclassify(s.z[x][c][k]) == FP_SUBNORMAL) sub = 1;
        check(!sub, "an impulse then 10 s of silence leaves no subnormal state");
    }

    /* ---- the comp's static curve (voicing) ---- */
    {
        const struct { float a, x, want; } pts[] = {
            { 1.0f, -6.0f, -6.0f - 18.0f + 7.0f },     /* T -30, 4:1: -24 out, +7 */
            { 0.5f, -6.0f, -6.0f - 5.4f + 3.5f },      /* T -15, 2.5:1: -11.4, +3.5 */
            { 0.5f, -40.0f, -40.0f + 3.5f },           /* under the knee: make-up only */
        };
        for (unsigned k = 0; k < sizeof pts / sizeof pts[0]; k++) {
            mix_strip_t s = fresh(); mix_strip_set_now(&s, MIX_STRIP_COMP, pts[k].a);
            float amp = powf(10.0f, pts[k].x / 20.0f);
            float g = sine_gain(&s, 1000.0f, amp, 600, 40);
            char what[120];
            snprintf(what, sizeof what, "comp %.0f%% on a %.0f dBFS sine: out %.1f dBFS (want %.1f)",
                     pts[k].a * 100, pts[k].x, pts[k].x + g, pts[k].want);
            check(fabsf(pts[k].x + g - pts[k].want) < 1.0f, what);
        }
        check(mix_strip_comp_curve(-6.0f, 0.0f) == 0.0f, "amount 0: no reduction at any level");
        float prev = 0.0f; int mono = 1;
        for (int i = 1; i <= 20; i++) { float c = mix_strip_comp_curve(-6.0f, i / 20.0f); if (c > prev + 1e-4f) mono = 0; prev = c; }
        check(mono, "turning the knob up only ever deepens the reduction (no step, no reversal)");
    }

    /* ---- attack ~25 ms, release slower ---- */
    {
        mix_strip_t s = fresh(); mix_strip_set_now(&s, MIX_STRIP_COMP, 1.0f);
        sine_gain(&s, 1000.0f, 0.01f, 100, 1);                       /* -40 dBFS: quiet */
        float want = mix_strip_comp_curve(-6.0f, 1.0f);              /* -18 */
        sine_gain(&s, 1000.0f, 0.5f, 9, 0);                          /* 9 blocks = 26 ms at -6 dBFS */
        float frac = s.env_db / want;
        printf("     after 26 ms: %.1f of %.1f dB (%.0f%%)\n", s.env_db, want, frac * 100);
        check(frac > 0.5f && frac < 0.8f, "a 20+ dB step gets ~63% of its reduction in ~25 ms");
        float before = s.env_db;
        sine_gain(&s, 1000.0f, 0.5f, 300, 0);
        float full = s.env_db;
        sine_gain(&s, 1000.0f, 0.01f, 9, 0);
        check(s.env_db < full * 0.85f && s.env_db < before, "release over the same 26 ms recovers far less (300 ms)");
    }

    /* ---- stereo link ---- */
    {
        mix_strip_t s = fresh(); mix_strip_set_now(&s, MIX_STRIP_COMP, 1.0f);
        int same = 1;
        for (int b = 0; b < 100; b++) {
            for (int f = 0; f < BLOCK; f++) { in[f * 2] = (int16_t)(16000 * sin(f * 0.3 + b)); in[f * 2 + 1] = (int16_t)(800 * sin(f * 0.11)); }
            const int16_t *o = run(&s, in, out);
            if (b > 50) for (int f = 0; f < BLOCK; f++)
                if (abs(in[f * 2]) > 4000 && abs(in[f * 2 + 1]) > 200) {
                    float gl = (float)o[f * 2] / in[f * 2], gr = (float)o[f * 2 + 1] / in[f * 2 + 1];
                    if (fabsf(gl - gr) > 0.02f) same = 0;
                }
        }
        check(same, "a loud left and a quiet right take ONE gain (stereo-linked)");
    }

    /* ---- comp off settles to bypass; gr readout ---- */
    {
        mix_strip_t s = fresh(); mix_strip_set(&s, MIX_STRIP_COMP, 1.0f);
        sine_gain(&s, 1000.0f, 0.5f, 300, 1);
        char buf[32]; mix_strip_get_key(&s, "comp_gr", buf, sizeof buf);
        check(atof(buf) < -10.0f, "comp_gr reads the reduction");
        mix_strip_set(&s, MIX_STRIP_COMP, 0.0f);
        sine_gain(&s, 1000.0f, 0.5f, 400, 1);
        check(run(&s, in, out) == in && s.gr_db == 0.0f, "comp back to 0: settles to bypass, reading 0");
    }

    /* ---- a strip not run for a while starts clean ---- */
    {
        mix_strip_t s = fresh(); mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 12.0f); mix_strip_set_now(&s, MIX_STRIP_COMP, 1.0f);
        sine_gain(&s, 60.0f, 0.5f, 50, 1);
        check(s.env_db < -1.0f, "(the strip was working)");
        blk += 10;
        memset(in, 0, sizeof in);
        run(&s, in, out);
        check(s.env_db == 0.0f && s.z[0][0][0] == 0.0f, "after a gap (a parked slot) the filters and comp start clean");
    }

    /* ---- a zeroed struct (a static array) is a valid, flat strip ---- */
    {
        mix_strip_t z; memset(&z, 0, sizeof z);
        char buf[32];
        check(mix_strip_get_key(&z, "eq_mid_freq", buf, sizeof buf) > 0 && fabs(atof(buf) - 0.5) < 1e-6, "a zeroed strip reads the default mid position");
        check(run(&z, in, out) == in, "a zeroed strip runs as flat (bypassed)");
        memset(&z, 0, sizeof z);
        mix_strip_set(&z, MIX_STRIP_EQ_LOW, 3.0f);
        check(z.target[MIX_STRIP_EQ_MID_FREQ] == 0.5f && z.target[MIX_STRIP_EQ_LOW] == 3.0f, "setting a zeroed strip inits it first (keeps the set, defaults the rest)");
    }

    /* ---- keys ---- */
    {
        mix_strip_t s = fresh();
        check(mix_strip_set_key(&s, "eq_low", "4.5") && s.target[MIX_STRIP_EQ_LOW] == 4.5f, "eq_low sets");
        check(mix_strip_set_key(&s, "eq_high", "99") && s.target[MIX_STRIP_EQ_HIGH] == 15.0f, "gains clamp to ±15");
        check(mix_strip_set_key(&s, "comp", "-1") && s.target[MIX_STRIP_COMP] == 0.0f, "comp clamps to 0..1");
        check(mix_strip_set_key(&s, "eq_mid_freq", "nan") && s.target[MIX_STRIP_EQ_MID_FREQ] == 0.5f, "a NaN position is the default");
        check(!mix_strip_set_key(&s, "volume", "1"), "a non-strip key is not taken");
        char buf[32];
        check(mix_strip_get_key(&s, "eq_low", buf, sizeof buf) > 0 && atof(buf) == 4.5, "eq_low reads back");
        check(mix_strip_get_key(&s, "pan", buf, sizeof buf) < 0, "a non-strip key is not answered");
        check(mix_strip_set_key(&s, "strip", "1.5 -2 0.25 3 0.6") && s.target[0] == 1.5f && s.target[1] == -2.0f &&
              s.target[2] == 0.25f && s.target[3] == 3.0f && s.target[4] == 0.6f, "`strip` sets all five in one write");
        mix_strip_get_key(&s, "strip", buf, sizeof buf);
        check(strcmp(buf, "1.50 -2.00 0.2500 3.00 0.6000") == 0, "`strip` reads all five back");
        check(mix_strip_set_key(&s, "strip", "4") && s.target[0] == 4.0f && s.target[2] == 0.5f && s.target[4] == 0.0f,
              "a short `strip` defaults the rest (an older save)");
        check(mix_strip_is_key("strip") && mix_strip_is_key("comp_gr") && mix_strip_is_key("eq_mid") && !mix_strip_is_key("volume"),
              "mix_strip_is_key knows the strip's keys");
    }

    /* ---- cost (informational: a Mac says nothing about the Move) ---- */
    {
        mix_strip_t s = fresh();
        mix_strip_set_now(&s, MIX_STRIP_EQ_LOW, 3.0f); mix_strip_set_now(&s, MIX_STRIP_EQ_MID, -4.0f);
        mix_strip_set_now(&s, MIX_STRIP_EQ_HIGH, 2.0f); mix_strip_set_now(&s, MIX_STRIP_COMP, 0.6f);
        for (int i = 0; i < BLOCK * 2; i++) in[i] = (int16_t)(12000 * sin(i * 0.05));
        const int N = 20000;
        clock_t t0 = clock();
        for (int b = 0; b < N; b++) run(&s, in, out);
        double ns = (double)(clock() - t0) / CLOCKS_PER_SEC * 1e9 / N;
        printf("     info: all engaged, %.0f ns per 128-frame block on this machine\n", ns);
    }

    if (failures) { printf("FAIL: %d check(s)\n", failures); return 1; }
    printf("PASS: mix strip — EQ bands, comp voicing, link, bypass, stability\n");
    return 0;
}
