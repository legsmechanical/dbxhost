/* tests/test_param_auto_extend.c — tN_pa_extend: hold a point on the
 * AUTOMATION bank, press a later step, and the value the held step plays is
 * carried through the END of the pressed step (the note-length gesture's
 * twin for automation).
 *
 * Asserted on what the lane PLAYS (tN_cC_pa_vals, playback's own evaluator)
 * step by step, so a write that left the right points but played wrong — or
 * the reverse — goes red. A 16-step clip at 24 ticks a step: window 0..383. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

#define TG "1:synth:cutoff"

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pt(hx_t *h, int tick, int val) {
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d %d", tick, val);
    hx_set_param(h, "t0_pa_set", v);
}
static void extend(hx_t *h, int from, int to) {
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d %d 24", from, to);
    hx_set_param(h, "t0_pa_extend", v);
}
static void reextend(hx_t *h, int from, int to) {     /* a later press in the same hold */
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d %d 24 1", from, to);
    hx_set_param(h, "t0_pa_extend", v);
}
/* The 14-bit value played at each of the 16 steps; -1 = none. */
static void plays(hx_t *h, int *raw) {
    char ans[4096];
    for (int s = 0; s < 16; s++) raw[s] = -2;
    HX_ASSERT(hx_get_param(h, "t0_c0_pa_vals_0_24", ans, sizeof ans) > 0, "vals read answers");
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
static pa_entry_t *entry(hx_t *h) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &in->pa_entries[i];
        if (e->used && e->count && !strcmp(in->pa_targets[e->target], TG)) return e;
    }
    return NULL;
}
static int value_at_tick(pa_entry_t *e, int tick) {
    for (int i = 0; i < e->count; i++) if (e->points[i].tick == tick) return e->points[i].val;
    return -1;
}

int main(void) {
    int r[16];

    /* 1. Stepped lane: 1000 at step 2, 5000 at step 4, 9000 at step 6. Hold
     *    step 2, press step 5: steps 2..5 play 1000, step 6 still 9000. */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 200); pt(h, 48, 1000); pt(h, 96, 5000); pt(h, 144, 9000);
        extend(h, 2, 5);
        plays(h, r);
        HX_ASSERT(r[0] == 200 && r[1] == 200, "before the span: untouched");
        for (int s = 2; s <= 5; s++) HX_ASSERT(r[s] == 1000, "steps 2..5 carry the held value");
        HX_ASSERT(r[6] == 9000, "step 6 keeps its own point");
        OK("stepped: carried through the pressed step, the next point untouched");
        hx_destroy(h);
    }

    /* 2. The restore point: the old step-6 value came from a point INSIDE the
     *    span (step 4), so it must be put back on step 6. */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 200); pt(h, 48, 1000); pt(h, 96, 5000);
        extend(h, 2, 5);
        plays(h, r);
        for (int s = 2; s <= 5; s++) HX_ASSERT(r[s] == 1000, "span carries 1000");
        for (int s = 6; s < 16; s++) HX_ASSERT(r[s] == 5000, "after the span: what played before (5000)");
        HX_ASSERT(value_at_tick(entry(h), 144) == 5000, "a restore point at step 6");
        OK("restore: the tick after the span plays what it played before");
        hx_destroy(h);
    }

    /* 3. Smooth: a ramp 0 → 16000 over the clip; extend from step 4 (between
     *    points — an interpolated value) to step 7. Flat across, ramp resumes. */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 0); pt(h, 360, 15000);
        hx_set_param(h, "t0_pa_smooth", "0 " TG " 1");
        int before[16]; plays(h, before);
        extend(h, 4, 7);
        plays(h, r);
        HX_ASSERT(before[4] > 0 && before[4] < 15000, "setup: step 4 is between points");
        for (int s = 4; s <= 7; s++) HX_ASSERT(r[s] == before[4], "Smooth: flat at the interpolated value");
        for (int s = 8; s < 16; s++) HX_ASSERT(r[s] == before[s], "Smooth: the ramp after the span is unchanged");
        for (int s = 0; s < 4; s++) HX_ASSERT(r[s] == before[s], "Smooth: before the span unchanged");
        OK("smooth: an interpolated value carried flat, the curve around it intact");
        hx_destroy(h);
    }

    /* 4. Punch: a point lasts only its own step, so every step of the span
     *    needs one; after it, rest returns. */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_pa_rest", "0 " TG " 300");
        pt(h, 48, 1000);
        hx_set_param(h, "t0_pa_mode", "0 " TG " 1");
        extend(h, 2, 5);
        plays(h, r);
        HX_ASSERT(r[1] == 300, "Punch: rest before");
        for (int s = 2; s <= 5; s++) HX_ASSERT(r[s] == 1000, "Punch: every step of the span plays it");
        HX_ASSERT(r[6] == 300, "Punch: rest after");
        OK("punch: one point a step, rest after the span");
        hx_destroy(h);
    }

    /* 5. Wrap: hold step 13, press step 2 — the span runs 13..15 then 0..2. */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 100); pt(h, 96, 4000); pt(h, 312, 7000);
        extend(h, 13, 2);
        plays(h, r);
        for (int s = 13; s < 16; s++) HX_ASSERT(r[s] == 7000, "wrap: 13..15 carry");
        for (int s = 0; s <= 2; s++) HX_ASSERT(r[s] == 7000, "wrap: 0..2 carry");
        HX_ASSERT(r[3] == 100, "wrap: step 3 plays what it did (restored)");
        HX_ASSERT(r[4] == 4000, "wrap: step 4 keeps its point");
        OK("wrap: an earlier step carries round the end of the window");
        hx_destroy(h);
    }

    /* 6. Refusals: nothing to carry (a resting step), and no lane at all. */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_pa_rest", "0 " TG " 300");
        pt(h, 240, 1000);
        hx_set_param(h, "t0_pa_mode", "0 " TG " 1");
        const int n0 = entry(h)->count;
        extend(h, 2, 5);                       /* step 2 plays rest */
        HX_ASSERT(entry(h)->count == n0, "a resting step carries nothing");
        hx_set_param(h, "t0_pa_extend", "0 1:synth:reso 2 5 24");
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        int lanes = 0;
        for (int i = 0; i < PA_MAX_ENTRIES; i++) if (in->pa_entries[i].used) lanes++;
        HX_ASSERT(lanes == 1, "an unknown lane is not created");
        /* A target the store knows (clip 1 has it) but this clip has no lane
         * for: refused, and no empty lane is left behind on clip 0. */
        hx_set_param(h, "t0_pa_set", "1 1:synth:drive 0 500");
        hx_set_param(h, "t0_pa_extend", "0 1:synth:drive 2 5 24");
        lanes = 0;
        for (int i = 0; i < PA_MAX_ENTRIES; i++) if (in->pa_entries[i].used) lanes++;
        HX_ASSERT(lanes == 2, "no empty lane made on the clip without one");
        OK("refused: a resting step, an unknown lane, a lane this clip lacks");
        hx_destroy(h);
    }

    /* 7. The budget: a lane one point short of full refuses whole. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pt(h, 0, 100);
        pa_entry_t *e = entry(h);
        /* Fill the rest of the lane past the window (ticks the span never
         * touches), leaving room for fewer points than Punch needs. */
        for (int i = 1; e->count < PA_ENTRY_POINTS - 2; i++) pt(h, 400 + i, 50);
        hx_set_param(h, "t0_pa_mode", "0 " TG " 1");
        in->pa_store_full = 0;
        const int n0 = e->count;
        extend(h, 0, 10);
        HX_ASSERT(e->count == n0, "nothing written");
        HX_ASSERT(in->pa_store_full == PA_FULL_POINTS, "the store says full");
        OK("budget: refused whole when the points would not fit");
        hx_destroy(h);
    }

    /* 8. SHORTEN: a later press in the same hold rebuilds from the lane as it
     *    was before the hold's first extend. 1000 @2, 5000 @4, 9000 @6,
     *    3000 @9: extend 2 → 10, then back to 5 — steps 6..9 play what they
     *    did originally; then back to the held step — the original lane. */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 200); pt(h, 48, 1000); pt(h, 96, 5000); pt(h, 144, 9000); pt(h, 216, 3000);
        int orig[16]; plays(h, orig);
        extend(h, 2, 10);
        plays(h, r);
        for (int s = 2; s <= 10; s++) HX_ASSERT(r[s] == 1000, "setup: 2..10 carry");
        reextend(h, 2, 5);
        plays(h, r);
        for (int s = 2; s <= 5; s++) HX_ASSERT(r[s] == 1000, "shortened: 2..5 carry");
        for (int s = 6; s < 16; s++) HX_ASSERT(r[s] == orig[s], "shortened: 6.. play what they did before the hold");
        reextend(h, 2, 12);
        plays(h, r);
        for (int s = 2; s <= 12; s++) HX_ASSERT(r[s] == 1000, "grown again from the base: 2..12");
        HX_ASSERT(r[13] == orig[13], "grown again: 13 as before");
        reextend(h, 2, 2);
        plays(h, r);
        for (int s = 0; s < 16; s++) HX_ASSERT(r[s] == orig[s], "back to the held step: the lane as it was");
        OK("shorten: later presses rebuild from the hold's base, all the way back");
        hx_destroy(h);
    }

    /* 9. A base for ANOTHER lane is not used: the rebase press counts as a
     *    first extend of this one (its own lane is kept as the new base). */
    {
        hx_t *h = hx_create(NULL);
        pt(h, 0, 200); pt(h, 48, 1000); pt(h, 96, 5000);
        hx_set_param(h, "t0_pa_set", "0 1:synth:reso 0 700");
        hx_set_param(h, "t0_pa_extend", "0 1:synth:reso 0 3 24");   /* base = reso */
        int orig[16]; plays(h, orig);
        reextend(h, 2, 5);                                           /* cutoff, "rebase" */
        plays(h, r);
        for (int s = 2; s <= 5; s++) HX_ASSERT(r[s] == 1000, "cutoff extended");
        HX_ASSERT(r[6] == orig[6], "cutoff after the span as it was (no reso points pasted in)");
        reextend(h, 2, 3);
        plays(h, r);
        HX_ASSERT(r[4] == orig[4], "and its own base was kept: shortening restores cutoff's step 4");
        OK("a base naming another lane is not used");
        hx_destroy(h);
    }

    printf("test_param_auto_extend: %d ok\n", ok_count);
    return 0;
}
