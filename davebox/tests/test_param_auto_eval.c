/* tests/test_param_auto_eval.c — the envelope model.
 *
 * A lane is ONE static envelope of points that glide (linearly) into each
 * other; a hard edge is a JUMP PAIR — two points on one tick, the first the
 * value just before it, the second the value from it on (Josh, 2026-10-21:
 * "all automation is a static envelope ... and that there are 2 different ways
 * to edit the envelope"). pa_eval_from(t) reads the value from t on;
 * pa_eval_before(t) the value just before t. A STEPPED target (a choice, a
 * switch) never glides. Around the loop end Wrap decides: Carry glides into the
 * start, Reset holds then jumps.
 *
 * The evaluators are internal to the single translation unit, so this test
 * includes the harness the same way the others do and calls them directly —
 * the store tests cover the set_param surface, this one covers the arithmetic. */
#include "harness.h"
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static pa_entry_t *lane(uint8_t flags) {
    static pa_entry_t pool[16];
    static int next = 0;
    pa_entry_t *e = &pool[next++ % 16];
    memset(e, 0, sizeof(*e));
    e->used = 1; e->flags = (uint8_t)(PA_FLAG_ACTIVE | flags);
    return e;
}
/* From / before at `t` in window [ws, ws+wl); 0xFFFF = defines nothing. */
static uint16_t from_(const pa_entry_t *e, uint32_t t, uint32_t ws, uint32_t wl, int st) {
    uint16_t v = 0xFFFF; return pa_eval_from(e, t, ws, wl, st, &v) ? v : 0xFFFF;
}
static uint16_t before_(const pa_entry_t *e, uint32_t t, uint32_t ws, uint32_t wl, int st) {
    uint16_t v = 0xFFFF; return pa_eval_before(e, t, ws, wl, st, &v) ? v : 0xFFFF;
}
#define F(e, t)  from_((e), (t), 0, 384, 0)
#define B(e, t)  before_((e), (t), 0, 384, 0)
#define FS(e, t) from_((e), (t), 0, 384, 1)
#define BS(e, t) before_((e), (t), 0, 384, 1)

int main(void) {
    pa_entry_t e;
    memset(&e, 0, sizeof(e));
    e.used = 1; e.flags = PA_FLAG_ACTIVE;

    /* An entry with no points defines nothing — the parameter is simply not
     * automated at this moment, which is different from "automated to zero". */
    uint16_t sink;
    HX_ASSERT(pa_eval_from(&e, 0, 0, 384, 0, &sink) == 0, "an empty entry must define nothing");
    HX_ASSERT(pa_eval_before(&e, 0, 0, 384, 0, &sink) == 0, "…from either side");
    OK("no points means no value — not a silent zero");

    pa_set_point(&e, 100, 1000);
    pa_set_point(&e, 200, 2000);
    /* Points are kept sorted however they arrive: recording writes them in
     * order, but a lock can be dropped anywhere at any time. */
    pa_set_point(&e, 150, 1500);
    HX_ASSERT(e.count == 3, "three distinct ticks");
    HX_ASSERT(e.points[0].tick == 100 && e.points[1].tick == 150 && e.points[2].tick == 200,
              "out-of-order insert must sort");
    OK("points stay sorted whatever order they are written in");

    /* ── THE STORE: at most two points on a tick, in order ─────────────── */
    {
        pa_entry_t *p = lane(0);
        pa_set_point(p, 96, 4000);
        HX_ASSERT(pa_set_pair(p, 96, 1000, 9000) && p->count == 2, "a pair over a point: two points");
        HX_ASSERT(p->points[0].val == 1000 && p->points[1].val == 9000, "…first = before, second = from");
        pa_set_pair(p, 96, 2000, 8000);
        HX_ASSERT(p->count == 2 && p->points[0].val == 2000 && p->points[1].val == 8000, "a pair over a pair: replaced, still two");
        pa_set_point(p, 96, 5000);
        HX_ASSERT(p->count == 1 && p->points[0].val == 5000, "a POINT collapses the tick to one");
        pa_set_pair(p, 96, 7000, 7000);
        HX_ASSERT(p->count == 1 && p->points[0].val == 7000, "a pair whose halves agree is one point (no jump)");
        pa_set_first(p, 96, 1111);
        HX_ASSERT(p->count == 2 && p->points[0].val == 1111 && p->points[1].val == 7000, "set_first: a lone point becomes the second");
        pa_set_second(p, 96, 2222);
        HX_ASSERT(p->count == 2 && p->points[0].val == 1111 && p->points[1].val == 2222, "set_second keeps the first");
        pa_set_first(p, 96, 3333);
        HX_ASSERT(p->count == 2 && p->points[0].val == 3333 && p->points[1].val == 2222, "set_first keeps the second");
        pa_set_point(p, 48, 100); pa_set_point(p, 200, 100);
        int i0;
        HX_ASSERT(pa_at(p, 96, &i0) == 2 && i0 == 1, "pa_at: two points at 96, from index 1");
        HX_ASSERT(pa_at(p, 97, &i0) == 0 && i0 == 3, "pa_at: none at 97");
        HX_ASSERT(pa_lower_bound(p, 96) == 1 && pa_upper_bound(p, 96) == 3, "lower / upper bound straddle the pair");
        OK("the store: a point, or a jump pair, per tick — never more");
    }

    /* ── THE GLIDE ─────────────────────────────────────────────────────── */
    {
        pa_entry_t *g = lane(PA_FLAG_WRAP_RESET);
        pa_set_point(g, 0, 0); pa_set_point(g, 96, 4000); pa_set_point(g, 192, 0);
        HX_ASSERT(F(g, 0) == 0 && F(g, 96) == 4000 && F(g, 192) == 0, "lands exactly on its points");
        HX_ASSERT(F(g, 48) == 2000, "halfway in time is halfway in value");
        HX_ASSERT(F(g, 144) == 2000, "and down the far side (a falling span)");
        HX_ASSERT(B(g, 96) == 4000 && B(g, 48) == 2000, "BEFORE equals FROM wherever there is no jump");
        HX_ASSERT(FS(g, 48) == 0 && FS(g, 95) == 0 && FS(g, 96) == 4000, "a STEPPED target holds until the next point");
        HX_ASSERT(BS(g, 96) == 0, "…so just before a stepped point is the value before it");
        OK("points glide into each other; a stepped target holds");
    }

    /* ── THE JUMP PAIR ─────────────────────────────────────────────────── */
    {
        /* A punch on step 4 (96..119) into a ramp 0 -> 4800 over [0, 192]:
         * entry pair at 96 (2400 -> 9000), exit pair at 120 (9000 -> 3000). */
        pa_entry_t *j = lane(PA_FLAG_WRAP_RESET);
        pa_set_point(j, 0, 0); pa_set_point(j, 192, 4800);
        pa_set_pair(j, 96, 2400, 9000);
        pa_set_pair(j, 120, 9000, 3000);
        HX_ASSERT(F(j, 95) == 2375 && F(j, 48) == 1200, "the ramp glides INTO the pair's first value");
        HX_ASSERT(B(j, 96) == 2400, "just before the run: the pair's FIRST");
        HX_ASSERT(F(j, 96) == 9000 && F(j, 110) == 9000 && F(j, 119) == 9000, "the run: flat across its step");
        HX_ASSERT(B(j, 120) == 9000, "just before the exit: still the run");
        HX_ASSERT(F(j, 120) == 3000, "from the exit on: what the envelope played there");
        HX_ASSERT(F(j, 156) == 3900, "…and gliding on from it");
        HX_ASSERT(FS(j, 119) == 9000 && FS(j, 120) == 3000 && BS(j, 96) == 0, "stepped: the same edges, and holds between");
        OK("a jump pair: the value arriving, then the value from there on");
    }

    /* ── AROUND THE LOOP: Wrap ─────────────────────────────────────────── */
    {
        /* Start point 1000 at 0, a point 5000 at 192; window [0, 384). */
        pa_entry_t *c = lane(0);
        pa_set_point(c, 0, 1000); pa_set_point(c, 192, 5000);
        HX_ASSERT(F(c, 288) == 3000, "CARRY: after the last point it glides toward the next pass's start");
        HX_ASSERT(B(c, 0) == 1000, "…arriving exactly on it at the loop end (before the window start)");
        HX_ASSERT(FS(c, 288) == 5000 && BS(c, 0) == 5000, "CARRY, stepped: the last value holds round to the start");
        pa_entry_t *r = lane(PA_FLAG_WRAP_RESET);
        pa_set_point(r, 0, 1000); pa_set_point(r, 192, 5000);
        HX_ASSERT(F(r, 288) == 5000 && F(r, 383) == 5000, "RESET: the last value holds to the loop end");
        HX_ASSERT(B(r, 0) == 5000 && F(r, 0) == 1000, "…then jumps back to the start");
        OK("Wrap: Carry glides into the start across the loop end; Reset holds, then jumps");

        /* The start point deleted: before the first point. */
        pa_entry_t *d = lane(0);
        pa_set_point(d, 96, 0); pa_set_point(d, 288, 9600);
        HX_ASSERT(F(d, 336) == 7200, "Carry: after the last, toward the next pass's first (48/192 of the way)");
        HX_ASSERT(F(d, 0) == 4800 && B(d, 0) == 4800, "at the wrap: halfway, from either side");
        HX_ASSERT(F(d, 48) == 2400, "before the first: the rest of the same glide");
        pa_entry_t *dr = lane(PA_FLAG_WRAP_RESET);
        pa_set_point(dr, 96, 3000); pa_set_point(dr, 288, 9600);
        HX_ASSERT(F(dr, 0) == 3000 && F(dr, 95) == 3000, "Reset, no start point: the first point's value before it");
        HX_ASSERT(B(dr, 0) == 9600, "…and just before the loop restarts, the last value held");
        OK("a deleted start point: Carry glides round, Reset plays the first point's value");

        /* A run on the window's LAST step: its exit pair sits on the window
         * start (the start point's tick). */
        pa_entry_t *x = lane(0);
        pa_set_point(x, 0, 1000);
        pa_set_pair(x, 360, 1000, 7000);
        pa_set_pair(x, 0, 7000, 1000);
        HX_ASSERT(F(x, 370) == 7000 && F(x, 383) == 7000, "Carry: the run holds flat to the loop end");
        HX_ASSERT(B(x, 0) == 7000 && F(x, 0) == 1000, "…and the exit pair jumps back to the start");
        HX_ASSERT(F(x, 180) == 1000, "the start point holds until the run (it glides into the run's first)");
        OK("a run on the last step jumps out on the window start");

        /* Only points inside the window play. */
        pa_entry_t *w = lane(0);
        pa_set_point(w, 24, 1111); pa_set_point(w, 120, 5000); pa_set_point(w, 300, 9999);
        HX_ASSERT(from_(w, 100, 96, 96, 0) == 5000, "before 120 in [96,192): the in-window point, not 1111 or 9999");
        pa_entry_t *n = lane(0);
        pa_set_point(n, 300, 7000);
        HX_ASSERT(from_(n, 10, 0, 96, 0) == 7000, "no point inside the window: the nearest value holds");
        OK("points outside the lane's window never play");

        /* Which window: the clip's loop for a plain lane, the lane's OWN window
         * when it has a Loop or a Rate — what pa_entry_tick wraps inside. */
        uint32_t ws = 9, wl = 9;
        pa_entry_t k; memset(&k, 0, sizeof(k)); k.used = 1;
        pa_entry_window(&k, 96, 384, &ws, &wl);
        HX_ASSERT(ws == 96 && wl == 384, "plain lane: the clip's loop window (start 96, 384 long)");
        k.loop_len = 48; k.loop_off = 0;
        pa_entry_window(&k, 96, 384, &ws, &wl);
        HX_ASSERT(ws == 0 && wl == 48, "own Loop: the lane's window, not the clip's");
        k.loop_len = 999;
        pa_entry_window(&k, 96, 384, &ws, &wl);
        HX_ASSERT(wl == 384, "an own Loop longer than the clip is clamped to it, as pa_entry_tick does");
        k.loop_len = 0; k.resolution = 6;
        pa_entry_window(&k, 96, 384, &ws, &wl);
        HX_ASSERT(ws == 0 && wl == 384, "a Rate with no Loop: the lane window is one clip long from 0");
        OK("the window is the lane's OWN when it has one");
    }

    /* ── STEP OWNERSHIP (Delete + step, a hold's rewrite) ──────────────── */
    {
        /* Steps of 24. A run on step 4 (96..119) jumps in at 96 and out at 120. */
        pa_entry_t *o = lane(PA_FLAG_WRAP_RESET);
        pa_set_point(o, 0, 0); pa_set_point(o, 192, 4800);
        pa_set_pair(o, 96, 2400, 9000); pa_set_pair(o, 120, 9000, 3000);
        pa_entry_t keep = *o;
        pa_clear_owned(o, 120, 143, 144);                   /* step 5: owns the exit's SECOND only */
        HX_ASSERT(o->count == 5 && F(o, 119) == 9000 && B(o, 120) == 9000, "step 5 cleared: step 4's run keeps its hold-end");
        *o = keep;
        pa_clear_owned(o, 72, 95, 96);                      /* step 3: owns the entry's FIRST only */
        HX_ASSERT(o->count == 5 && F(o, 96) == 9000, "step 3 cleared: step 4's run untouched");
        *o = keep;
        pa_clear_owned(o, 96, 119, 120);                    /* step 4 itself */
        HX_ASSERT(o->count == 4, "step 4 cleared: its second at 96 and the exit's first at 120");
        HX_ASSERT(o->points[1].tick == 96 && o->points[1].val == 2400 && o->points[2].tick == 120 && o->points[2].val == 3000,
                  "…the neighbours' halves stay: the glide-in value and the restore value");
        pa_sweep_redundant(o, 96, 0);
        pa_sweep_redundant(o, 120, 0);
        HX_ASSERT(o->count == 2 && F(o, 96) == 2400 && F(o, 120) == 3000,
                  "the sweep drops both: they lay on the ramp — the envelope as it was before the punch");
        pa_entry_t *q = lane(0);
        pa_set_point(q, 0, 0); pa_set_point(q, 96, 5000); pa_set_point(q, 192, 0);
        pa_sweep_redundant(q, 96, 0);
        HX_ASSERT(q->count == 3, "CONTROL: a real point off the line stays");
        OK("a step owns its own halves of the pairs on its edges; a deleted punch gives back the ramp");
    }

    /* Clearing a range removes exactly what it names, endpoints included. */
    pa_clear_range(&e, 150, 150);
    HX_ASSERT(e.count == 2 && e.points[1].tick == 200, "the named point, and only it");
    pa_clear_range(&e, 0, 1000);
    HX_ASSERT(e.count == 0, "a range covering everything empties the entry");
    OK("range clears are inclusive of both endpoints");

    /* The loop window: absent in v1 (every entry follows its clip), but the
     * evaluator already honours it, so restoring per-parameter polymetric
     * automation later is UI work rather than a storage or playback change. */
    { pa_entry_t w; memset(&w, 0, sizeof(w)); w.used = 1; w.flags = PA_FLAG_ACTIVE;
      HX_ASSERT(pa_entry_tick(&w, 500, 384, 0) == 500, "loop_len 0 means follow the clip");
      w.loop_len = 96;
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 4,   "a shorter window wraps inside itself");
      HX_ASSERT(pa_entry_tick(&w, 192, 384, 0) == 0,   "and wraps again");
      w.loop_off = 24;
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 28,  "the offset moves the window");
      OK("the per-parameter loop window is already honoured, and inert while unset"); }

    /* THE RATE (2026-09-03): resolution is a code, 5 = x1, each step a power of
     * two, /16 (1) to x16 (9). The lane clock is the clip clock scaled, the
     * window in lane ticks — so a slow lane spans several clip cycles (the
     * cycle count is what carries it past the wrapped clip tick). */
    { pa_entry_t w; memset(&w, 0, sizeof(w)); w.used = 1; w.flags = PA_FLAG_ACTIVE;
      w.resolution = 5;
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 100, "x1 with no window is the clip tick");
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 3) == 100, "…on every cycle");
      w.resolution = 6;                                   /* x2 */
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 200, "x2: the lane runs twice as fast");
      HX_ASSERT(pa_entry_tick(&w, 200, 384, 0) == 16,  "…and loops twice per clip (400 % 384)");
      w.resolution = 4;                                   /* /2 */
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 50,  "/2: half speed");
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 1) == 242, "/2: the SECOND clip cycle plays the lane's second half (484 % 384)");
      w.resolution = 1;                                   /* /16 */
      HX_ASSERT(pa_entry_tick(&w, 0, 384, 15) == (15u * 384u / 16u) % 384u, "/16 spans sixteen clip cycles");
      w.resolution = 9;                                   /* x16 */
      HX_ASSERT(pa_entry_tick(&w, 24, 384, 0) == 0,    "x16: 24 ticks in is one full lane (384) — wrapped to 0");
      w.resolution = 6; w.loop_len = 96; w.loop_off = 0;
      HX_ASSERT(pa_entry_tick(&w, 100, 384, 0) == 8,   "x2 with a 96-tick window: 200 % 96");
      OK("the rate scales the lane clock, /16..x16, and the window follows in lane ticks"); }

    printf("PASS: test_param_auto_eval (%d checks)\n", ok_count);
    return 0;
}
