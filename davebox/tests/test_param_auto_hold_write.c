/* tests/test_param_auto_hold_write.c — tN_pa_hold_write: every write a held
 * step makes, and Delete + step on what it leaves.
 *
 * Josh, 2026-10-21: "there are 2 different ways to edit the envelope - one that
 * places single points that automation rises/falls to (depending on smoothing)
 * and one that holds a value across an entire step (punch) or multiple steps
 * (stretch)" · "can't [we] ... have punch and stretch set their endpoint to the
 * point where any existing interpolation would land the value?" · "but [if]
 * deleting a step just deletes all points within it, then that should work
 * fine, right?"
 *
 * Asserted on the points AND on what the lane plays (tN_cC_pa_vals, the value
 * from each step's first tick on — playback's own evaluator), so a write that
 * left plausible points but played wrong, or the reverse, goes red. A 16-step
 * clip at 24 ticks a step: window 0..383. New lanes are Wrap: Reset. */
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
static void rest(hx_t *h, int val) {
    char v[128];
    snprintf(v, sizeof v, "0 " TG " %d", val);
    hx_set_param(h, "t0_pa_rest", v);
}
/* type 1 = PUNCH, 0 = POINT; rebase 1 = a later write of the same hold. */
static void hw(hx_t *h, int from, int to, int val, int type, int rebase) {
    char v[160];
    snprintf(v, sizeof v, "0 " TG " %d %d 24 %d %d %d", from, to, val, type, rebase);
    hx_set_param(h, "t0_pa_hold_write", v);
}
static void del_step(hx_t *h, int step) {
    char v[64];
    snprintf(v, sizeof v, "0 %d %d", step * 24, step * 24 + 23);
    hx_set_param(h, "t0_pa_clear_step", v);
}
/* The 14-bit value played from each of the 16 steps on; -1 = none. */
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
        if (e->used && !strcmp(in->pa_targets[e->target], TG)) return e;
    }
    return NULL;
}
/* The points at `tick`: n, and their values in order. */
static int at(hx_t *h, int tick, int *v0, int *v1) {
    pa_entry_t *e = entry(h);
    int n = 0;
    for (int i = 0; e && i < e->count; i++)
        if (e->points[i].tick == tick) { if (n == 0) *v0 = e->points[i].val; else *v1 = e->points[i].val; n++; }
    return n;
}
static uint16_t from_tick(hx_t *h, int t) {
    uint16_t v = 0xFFFF;
    pa_eval_from(entry(h), (uint32_t)t, 0, 384, 0, &v);
    return v;
}
/* A ramp lane: start point 0 at 0 (the resting value), 4800 at step 8. */
static hx_t *ramp(void) {
    hx_t *h = hx_create(NULL);
    rest(h, 0);
    pt(h, 192, 4800);
    return h;
}

int main(void) {
    int r[16], a = 0, b = 0;

    /* 1. A punch on an EMPTY lane: the start point carries the resting value,
     *    the run jumps in from it and back out to it. */
    {
        hx_t *h = hx_create(NULL);
        rest(h, 2000);
        hw(h, 4, 4, 9000, 1, 0);
        pa_entry_t *e = entry(h);
        HX_ASSERT(e && e->count == 5, "start point + entry pair + exit pair");
        HX_ASSERT(at(h, 0, &a, &b) == 1 && a == 2000, "the start point: the resting value");
        HX_ASSERT(at(h, 96, &a, &b) == 2 && a == 2000 && b == 9000, "entry pair at the step's first tick");
        HX_ASSERT(at(h, 120, &a, &b) == 2 && a == 9000 && b == 2000, "exit pair on the tick after the step");
        plays(h, r);
        for (int s = 0; s < 16; s++) HX_ASSERT(r[s] == (s == 4 ? 9000 : 2000), "rest everywhere but the punched step");
        HX_ASSERT(from_tick(h, 119) == 9000 && from_tick(h, 95) == 2000, "hard edges: flat to the step's last tick");
        OK("⭐ a punch on an empty lane: rest, a flat step, rest");
        hx_destroy(h);
    }

    /* 2. A punch INTO a ramp: it jumps in from where the ramp was and back out
     *    to where the ramp would be — the endpoints the interpolation lands on. */
    {
        hx_t *h = ramp();
        hw(h, 4, 4, 9000, 1, 0);
        HX_ASSERT(at(h, 96, &a, &b) == 2 && a == 2400 && b == 9000, "in: from the ramp's value at the step (2400)");
        HX_ASSERT(at(h, 120, &a, &b) == 2 && a == 9000 && b == 3000, "out: to the ramp's value after it (3000)");
        plays(h, r);
        HX_ASSERT(r[3] == 1800 && r[4] == 9000 && r[5] == 3000 && r[6] == 3600, "the ramp around the run is unchanged");
        OK("⭐ punch over a glide: in and out exactly where the ramp is");

        /* 3. Tap Shift: the SAME hold rewritten as a POINT — from the base, so
         *    the punch's pairs are gone and one point stands in the ramp. */
        hw(h, 4, 4, 9000, 0, 1);
        pa_entry_t *e = entry(h);
        HX_ASSERT(e->count == 3 && at(h, 96, &a, &b) == 1 && a == 9000, "one point, the punch's pairs gone");
        plays(h, r);
        HX_ASSERT(r[4] == 9000 && r[3] == 6750 && r[5] == 7950, "the ramp now glides up into the point and down out of it");
        hw(h, 4, 4, 9000, 1, 1);
        HX_ASSERT(at(h, 96, &a, &b) == 2 && a == 2400 && at(h, 120, &a, &b) == 2 && b == 3000,
                  "…and back to a punch: the base's ramp still decides the edges");
        OK("⭐ a type flip rewrites the same hold from its base");
        hx_destroy(h);
    }

    /* 4. A punch STRETCH: press a later step; press nearer to shorten. */
    {
        hx_t *h = ramp();
        hw(h, 4, 6, 9000, 1, 0);
        plays(h, r);
        HX_ASSERT(r[4] == 9000 && r[5] == 9000 && r[6] == 9000 && r[7] == 4200, "steps 4-6 flat, step 7 back on the ramp");
        HX_ASSERT(at(h, 120, &a, &b) == 0 && at(h, 144, &a, &b) == 0, "nothing inside the run");
        hw(h, 4, 5, 9000, 1, 1);
        plays(h, r);
        HX_ASSERT(r[5] == 9000 && r[6] == 3600 && at(h, 168, &a, &b) == 0, "shortened: the longer exit is gone, the ramp is back at step 6");
        OK("a stretch holds across its steps, and a later press re-spans it from the base");
        hx_destroy(h);
    }

    /* 5. A POINT stretch: a plateau to the span's last tick, then the glide. */
    {
        hx_t *h = ramp();
        hw(h, 4, 6, 9000, 0, 0);
        HX_ASSERT(at(h, 96, &a, &b) == 1 && a == 9000 && at(h, 167, &a, &b) == 1 && a == 9000, "a point at each end");
        plays(h, r);
        HX_ASSERT(r[3] == 6750 && r[4] == 9000 && r[6] == 9000, "glides in, flat across");
        HX_ASSERT(r[7] == 9000 - 4200 * 1 / 25, "and glides out from the span's last tick");
        OK("a point stretch: glide in, plateau, glide out");
        hx_destroy(h);
    }

    /* 6. A stretch before any turn (value -1): the held step's value as it
     *    plays; and shortened back to the held step, the base itself. */
    {
        hx_t *h = ramp();
        pa_entry_t base = *entry(h);
        hw(h, 4, 6, -1, 1, 0);
        plays(h, r);
        HX_ASSERT(r[4] == 2400 && r[6] == 2400 && r[7] == 4200, "the step's own value (2400), carried");
        hw(h, 4, 4, -1, 1, 1);
        pa_entry_t *e = entry(h);
        HX_ASSERT(e->count == base.count && !memcmp(e->points, base.points, base.count * sizeof(pa_point_t)),
                  "back to the held step with no value: exactly the base");
        OK("a stretch with no turn carries the step's value; pressing back restores the lane");
        hx_destroy(h);
    }

    /* 7. Edges at the loop: the last step's exit jumps on the window start;
     *    a run on the first step jumps in from the loop's end value. */
    for (int carry = 0; carry < 2; carry++) {
        hx_t *h = hx_create(NULL);
        rest(h, 1000);
        hw(h, 15, 15, 7000, 1, 0);
        if (carry) hx_set_param(h, "t0_pa_wrap", "0 " TG " 0");
        HX_ASSERT(at(h, 360, &a, &b) == 2 && a == 1000 && b == 7000, "last step: in from rest");
        HX_ASSERT(at(h, 0, &a, &b) == 2 && a == 7000 && b == 1000, "out on the window start: the start point keeps its value");
        plays(h, r);
        HX_ASSERT(r[15] == 7000 && r[0] == 1000 && r[14] == 1000, "the last step only");
        HX_ASSERT(from_tick(h, 383) == 7000, carry ? "Carry: flat to the loop end" : "Reset: flat to the loop end");
        hx_destroy(h);
    }
    {
        hx_t *h = hx_create(NULL);
        rest(h, 1000);
        pt(h, 192, 5000);
        hw(h, 0, 0, 7000, 1, 0);
        HX_ASSERT(at(h, 0, &a, &b) == 2 && a == 5000 && b == 7000, "first step: in from what the loop end held (Reset: 5000)");
        HX_ASSERT(at(h, 24, &a, &b) == 2 && a == 7000 && b == 1500, "out onto the start point's glide");
        OK("runs on the first and last steps keep hard edges round the loop");
        hx_destroy(h);
    }

    /* 8. A wrapped stretch (press an EARLIER step): the run crosses the loop
     *    end; and a stretch over the whole window is one flat value. */
    {
        hx_t *h = hx_create(NULL);
        rest(h, 1000);
        hw(h, 14, 1, 7000, 1, 0);
        plays(h, r);
        HX_ASSERT(r[13] == 1000 && r[14] == 7000 && r[15] == 7000 && r[0] == 7000 && r[1] == 7000 && r[2] == 1000,
                  "steps 14, 15, 0, 1 flat; 13 and 2 at rest");
        HX_ASSERT(from_tick(h, 383) == 7000, "flat across the loop end");
        hw(h, 0, 15, 5000, 1, 1);
        HX_ASSERT(entry(h)->count == 1 && at(h, 0, &a, &b) == 1 && a == 5000, "the whole window: one point");
        OK("a stretch can wrap round the loop, or cover all of it");
        hx_destroy(h);
    }

    /* 9. Two punches side by side SHARE one pair: the first's way out is the
     *    second's way in. */
    {
        hx_t *h = ramp();
        hw(h, 4, 4, 9000, 1, 0);
        hw(h, 5, 5, 6000, 1, 0);                          /* a new hold */
        HX_ASSERT(at(h, 120, &a, &b) == 2 && a == 9000 && b == 6000, "one pair between them: 9000 then 6000");
        HX_ASSERT(at(h, 144, &a, &b) == 2 && a == 6000 && b == 3600, "the second exits onto the ramp");
        plays(h, r);
        HX_ASSERT(r[4] == 9000 && r[5] == 6000 && r[6] == 3600, "both runs play");
        OK("neighbouring punches meet in one jump");

        /* 10. A POINT on the step after a run keeps the run's hold-end. */
        hw(h, 6, 6, 1000, 0, 0);
        HX_ASSERT(at(h, 144, &a, &b) == 2 && a == 6000 && b == 1000, "the run still ends at 6000, then the point");
        OK("a point after a run: the run holds to its end, then jumps to the point");
        hx_destroy(h);
    }

    /* 11. DELETE + step, on the run and on each neighbour. */
    {
        hx_t *h = ramp();
        hw(h, 4, 4, 9000, 1, 0);
        pa_entry_t punched = *entry(h);
        del_step(h, 4);
        HX_ASSERT(entry(h)->count == 2, "the punch's own step: every trace gone");
        plays(h, r);
        HX_ASSERT(r[4] == 2400 && r[5] == 3000, "the ramp as it was before the punch");

        *entry(h) = punched;
        del_step(h, 5);
        HX_ASSERT(at(h, 96, &a, &b) == 2 && b == 9000, "the step after: the run itself untouched");
        HX_ASSERT(at(h, 120, &a, &b) == 1 && a == 9000, "…its way back out is gone: the run's held value stays, gliding on");
        plays(h, r);
        HX_ASSERT(r[4] == 9000 && r[5] == 9000 && r[6] < 9000, "flat through step 4, then gliding down");

        *entry(h) = punched;
        del_step(h, 3);
        HX_ASSERT(at(h, 96, &a, &b) == 1 && a == 9000, "the step before: the glide-in value is gone, the run stays");
        HX_ASSERT(at(h, 120, &a, &b) == 2, "…and its exit");
        OK("⭐ Delete takes only what the step owns — never a neighbour's half");
        hx_destroy(h);
    }

    /* 12. Refused whole when the lane is full: nothing changes. */
    {
        hx_t *h = hx_create(NULL);
        rest(h, 0);
        pt(h, 0, 0);
        pa_entry_t *e = entry(h);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        /* A jump pair on every tick 0..254, and one point at 255: 511 points,
         * none on step 15 — a punch there needs two more. */
        e->count = 0;
        for (int t = 0; t < 255; t++) { pa_set_pair(e, (uint16_t)t, 100, 200); }
        pa_set_point(e, 255, 300);
        HX_ASSERT(e->count == PA_ENTRY_POINTS - 1, "setup: the lane one point short of full");
        pa_entry_t before = *e;
        in->pa_store_full = 0;
        hw(h, 15, 15, 9000, 1, 0);
        HX_ASSERT(e->count == before.count && !memcmp(e->points, before.points, before.count * sizeof(pa_point_t)),
                  "a punch that does not fit leaves the lane exactly as it was");
        HX_ASSERT(in->pa_store_full == PA_FULL_POINTS, "…and says why");
        OK("a write that would not fit is refused whole");
        hx_destroy(h);
    }

    printf("test_param_auto_hold_write: %d ok\n", ok_count);
    return 0;
}
