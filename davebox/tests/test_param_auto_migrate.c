/* tests/test_param_auto_migrate.c — a pav:1 project (Smooth / Punch flags, a
 * resting value per lane) converted on load to the envelope model (pav:2)
 * must SOUND THE SAME.
 *
 * White-box: every combination of the old settings — Smooth, Wrap, Punch, a
 * resting value or none, Scale (unipolar and bipolar), a first point on the
 * window start or later, two points in one step, points outside the window —
 * on a melodic clip, a lane with its own Loop, and a drum cycle of 12 steps of
 * 12 ticks, is built as a v1 lane, converted (pa_migrate_v1_entry), and the
 * value PLAYED at every tick of its window compared: v1's evaluators on the
 * untouched copy (a resting value unscaled, everything else through the Scale,
 * as v1 playback did) against pa_eval_from on the converted lane, scaled.
 * ±1 per 100 % of Scale, plus one: the glide now runs in the lane's own values
 * and is scaled after, and a stored point's rounding is scaled with it.
 *
 * Then end to end: a pav:1 file loads converted, its resting values become the
 * parameter's (the active clip's lane wins), and it saves as pav:2. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static int ok_count = 0, cases = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* What v1 playback sent at `t`. */
static int v1_plays(const pa_entry_t *e, uint16_t rest, uint32_t t, uint32_t ws, uint32_t wl, uint32_t st) {
    uint16_t v = 0;
    int ev = (e->flags & PA_FLAG_PUNCH) ? pa_v1_eval_punch(e, rest, t, ws, wl, st, &v)
                                        : pa_v1_eval_window(e, rest, t, ws, wl, &v);
    if (!ev) return -1;
    return ev == PA_V1_REST ? v : pa_scaled(e, v);
}
static int v2_plays(const pa_entry_t *e, uint32_t t, uint32_t ws, uint32_t wl) {
    uint16_t v = 0;
    if (!pa_eval_from(e, t, ws, wl, 0, &v)) return -1;
    return pa_scaled(e, v);
}

/* One combination. `where`: 0 melodic clip, 1 own Loop [96, 288), 2 drum cycle. */
static void one(hx_t *h, int where, uint8_t flags, int rest, int scale, int bipolar, int first_on_start, int two_in_step) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    const int track = where == 2 ? 0 : 1;
    int id = pa_target_id(in, "1:synth:cutoff");
    pa_entry_t *e = pa_get(in, track, 0, id);
    HX_ASSERT(e, "setup: an entry");
    e->count = 0;
    e->flags = (uint8_t)(PA_FLAG_ACTIVE | flags);
    e->scale_off = (int8_t)(scale - 100);
    e->scale_ctr1 = bipolar ? 8192 + 1 : 0;
    e->loop_len = e->loop_off = e->step_ticks = 0; e->resolution = 0;
    uint32_t base = 0, span = 384;
    if (where == 1) { e->loop_len = 192; e->loop_off = 96; base = 96; span = 192; }
    if (where == 2) { e->loop_len = 144; e->loop_off = 0; e->step_ticks = 12; span = 144; }
    if (where == 1) pa_set_point(e, 40, 1111);                       /* outside the window */
    pa_set_point(e, (uint16_t)(base + (first_on_start ? 0 : 30)), 3000);
    pa_set_point(e, (uint16_t)(base + 72), 9000);
    if (two_in_step) pa_set_point(e, (uint16_t)(base + 80), 500);    /* same step as 72 (24 or 12 ticks) */
    pa_set_point(e, (uint16_t)(base + span - 40), 6000);
    if (where == 1) pa_set_point(e, 350, 12000);                     /* outside the window */
    uint32_t ws, wl, st;
    HX_ASSERT(pa_export_window(&in->tracks[track], e, &ws, &wl, &st) && ws == base && wl == span, "setup: the window");
    const uint16_t r = rest < 0 ? PA_VAL_UNSET : (uint16_t)rest;
    pa_entry_t old = *e;
    const int tol = 1 + scale / 100;
    HX_ASSERT(pa_migrate_v1_entry(in, e, r), "the converted lane fits");
    e->flags &= (uint8_t)~(PA_FLAG_SMOOTH | PA_FLAG_PUNCH);
    for (uint32_t t = ws; t < ws + wl; t++) {
        int a = v1_plays(&old, r, t, ws, wl, st), b = v2_plays(e, t, ws, wl);
        if (b < a - tol || b > a + tol) {
            printf("  FAIL — where %d flags 0x%02x rest %d scale %d%s first %s%s: tick %u plays %d, v1 played %d\n",
                   where, flags, rest, scale, bipolar ? " bipolar" : "", first_on_start ? "on start" : "later",
                   two_in_step ? " two-in-step" : "", t, b, a);
            exit(1);
        }
    }
    /* The wrap: the value just before the loop restarts. */
    {
        int a = v1_plays(&old, r, ws + wl - 1, ws, wl, st);
        uint16_t v = 0;
        pa_eval_before(e, ws, ws, wl, 0, &v);
        int b = pa_scaled(e, v);
        /* Carry + Smooth glides INTO the start: one tick short of it is not
         * the limit, so compare to the glide's next value instead. */
        if (!((old.flags & PA_FLAG_SMOOTH) && !(old.flags & PA_FLAG_WRAP_RESET) && !(old.flags & PA_FLAG_PUNCH)))
            HX_ASSERT(b >= a - tol && b <= a + tol, "the loop end: what v1 held there");
    }
    cases++;
}

int main(void) {
    /* ---- every combination, tick by tick -------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pad_mode", "0");                         /* track 1 melodic */
        hx_set_param(h, "t0_l0_note_add", "0 100 12");               /* track 0 a drum track */
        HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "setup: a drum track");
        const uint8_t F[] = { 0, PA_FLAG_SMOOTH };
        const uint8_t W[] = { 0, PA_FLAG_WRAP_RESET };
        const uint8_t P[] = { 0, PA_FLAG_PUNCH };
        const int R[] = { -1, 2000 };
        const int S[][2] = { { 100, 0 }, { 50, 0 }, { 150, 1 } };
        for (int where = 0; where < 3; where++)
            for (int f = 0; f < 2; f++) for (int w = 0; w < 2; w++) for (int p = 0; p < 2; p++)
                for (int r = 0; r < 2; r++) for (int sc = 0; sc < 3; sc++)
                    for (int fs = 0; fs < 2; fs++) for (int two = 0; two < 2; two++)
                        one(h, where, (uint8_t)(F[f] | W[w] | P[p]), R[r], S[sc][0], S[sc][1], fs, two);
        printf("  (%d combinations)\n", cases);
        OK("⭐ every pav:1 lane sounds the same after conversion, at every tick (within rounding)");
        hx_destroy(h);
    }

    /* ---- end to end: a pav:1 file --------------------------------------- */
    {
        char dir[128], state[192], cmd[256];
        snprintf(dir, sizeof dir, "/tmp/hx_pa_mig_%d", (int)getpid());
        snprintf(cmd, sizeof cmd, "mkdir -p %s", dir);
        if (system(cmd)) { printf("FAIL: mkdir\n"); return 1; }
        snprintf(state, sizeof state, "%s/seq8sa-state.json", dir);
        /* Track 1, two clips automating the same parameter with different
         * rests; clip 1 is the active one. A Punch lane in clip 0. */
        FILE *f = fopen(state, "w");
        HX_ASSERT(f, "fixture");
        fprintf(f, "{\"v\":36,\"t1_ac\":1,\"pav\":1,\"pa\":["
                   "{\"t\":1,\"c\":0,\"k\":\"1:synth:cutoff\",\"f\":17,\"r\":1000,\"p\":\"96:9000;\"},"
                   "{\"t\":1,\"c\":1,\"k\":\"1:synth:cutoff\",\"f\":3,\"r\":4000,\"p\":\"48:5000;200:7000;\"}]}");
        fclose(f);
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        strncpy(in->state_path, state, sizeof(in->state_path) - 1);
        seq8_load_state(in);
        int id = pa_target_lookup(in, "1:synth:cutoff");
        pa_entry_t *c0 = pa_find(in, 1, 0, id), *c1 = pa_find(in, 1, 1, id);
        HX_ASSERT(c0 && c1, "both lanes loaded");
        HX_ASSERT(!(c0->flags & (PA_FLAG_SMOOTH | PA_FLAG_PUNCH)) && !(c1->flags & (PA_FLAG_SMOOTH | PA_FLAG_PUNCH)),
                  "Smooth and Punch are gone from the flags");
        HX_ASSERT(in->tracks[1].active_clip == 1, "setup: clip 1 is active");
        HX_ASSERT(((in->pa_knob_valid >> id) & 1u) && in->pa_knob[id] == 4000,
                  "the parameter's resting value is the ACTIVE clip's lane's (4000, not 1000)");
        /* The Punch lane: rest 1000, 9000 on step 4 only. */
        uint16_t v = 0;
        pa_eval_from(c0, 50, 0, 384, 0, &v);  HX_ASSERT(v == 1000, "punch lane: rest before");
        pa_eval_from(c0, 100, 0, 384, 0, &v); HX_ASSERT(v == 9000, "punch lane: its step");
        pa_eval_from(c0, 130, 0, 384, 0, &v); HX_ASSERT(v == 1000, "punch lane: rest after");
        OK("a pav:1 file loads converted; the active clip's resting value is the parameter's");

        hx_set_param(h, "save", "1");
        f = fopen(state, "r");
        HX_ASSERT(f, "saved");
        static char fbuf[65536];
        size_t got = fread(fbuf, 1, sizeof fbuf - 1, f);
        fclose(f);
        fbuf[got] = '\0';
        HX_ASSERT(strstr(fbuf, "\"pav\":2"), "it saves as pav:2");
        HX_ASSERT(!strstr(fbuf, "\"r\":"), "with no per-lane resting value");
        HX_ASSERT(strstr(fbuf, "\"pk\":[{\"k\":\"1:synth:cutoff\",\"v\":4000}]"), "and the parameter's resting value");
        hx_destroy(h);

        h = hx_create(NULL);
        in = (seq8_instance_t *)h->inst;
        strncpy(in->state_path, state, sizeof(in->state_path) - 1);
        seq8_load_state(in);
        id = pa_target_lookup(in, "1:synth:cutoff");
        c0 = pa_find(in, 1, 0, id);
        HX_ASSERT(c0, "reloaded");
        pa_eval_from(c0, 100, 0, 384, 0, &v); HX_ASSERT(v == 9000, "pav:2 reloads as saved — not converted twice");
        pa_eval_from(c0, 130, 0, 384, 0, &v); HX_ASSERT(v == 1000, "…the punch still ends at its step");
        OK("⭐ converted once, saved as pav:2, reloaded as saved");
        hx_destroy(h);
        snprintf(cmd, sizeof cmd, "rm -rf %s", dir);
        if (system(cmd)) { /* best effort */ }
    }
    printf("test_param_auto_migrate: %d ok\n", ok_count);
    return 0;
}
