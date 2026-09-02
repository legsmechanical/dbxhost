/* tests/test_param_auto_eval.c — the curve model (spec §4).
 *
 * Stepped-hold is the default: a point holds its value until the next one,
 * which is also what makes a p-lock last until the next automation point
 * without any to-next-note machinery. A per-entry Smooth flag switches that
 * clip's parameter to linear interpolation instead.
 *
 * pa_eval is internal to the single translation unit, so this test includes
 * the harness the same way the others do and calls it directly — the store
 * tests cover the set_param surface, this one covers the arithmetic. */
#include "harness.h"
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static uint16_t at(const pa_entry_t *e, uint32_t tick) {
    uint16_t v = 0xFFFF;
    int defined = pa_eval(e, tick, &v);
    return defined ? v : 0xFFFF;
}

int main(void) {
    pa_entry_t e;
    memset(&e, 0, sizeof(e));
    e.used = 1; e.flags = PA_FLAG_ACTIVE; e.rest = PA_VAL_UNSET;

    /* An entry with no points defines nothing — the parameter is simply not
     * automated at this moment, which is different from "automated to zero". */
    uint16_t sink;
    HX_ASSERT(pa_eval(&e, 0, &sink) == 0, "an empty entry must define nothing");
    OK("no points means no value — not a silent zero");

    pa_set_point(&e, 100, 1000);
    pa_set_point(&e, 200, 2000);

    /* Points are kept sorted however they arrive: recording writes them in
     * order, but a p-lock can be dropped anywhere at any time. */
    pa_set_point(&e, 150, 1500);
    HX_ASSERT(e.count == 3, "three distinct ticks");
    HX_ASSERT(e.points[0].tick == 100 && e.points[1].tick == 150 && e.points[2].tick == 200,
              "out-of-order insert must sort");
    OK("points stay sorted whatever order they are written in");

    /* Stepped hold. */
    HX_ASSERT(at(&e,  50) == 1000, "before the first point, the first value holds");
    HX_ASSERT(at(&e, 100) == 1000, "on a point");
    HX_ASSERT(at(&e, 149) == 1000, "holds until the NEXT point, not partway");
    HX_ASSERT(at(&e, 150) == 1500, "steps exactly at the next point");
    HX_ASSERT(at(&e, 999) == 2000, "after the last point, the last value holds");
    OK("stepped-hold is the default: a value holds until the next point");

    /* Smooth. */
    e.flags |= PA_FLAG_SMOOTH;
    HX_ASSERT(at(&e, 100) == 1000, "smooth still lands exactly on its points");
    HX_ASSERT(at(&e, 150) == 1500, "and on the middle one");
    HX_ASSERT(at(&e, 125) == 1250, "halfway between 100 and 150 is halfway in value");
    HX_ASSERT(at(&e, 175) == 1750, "and in the next span");
    HX_ASSERT(at(&e,  50) == 1000, "outside the span it still holds, never extrapolates");
    HX_ASSERT(at(&e, 999) == 2000, "same at the end");
    OK("Smooth interpolates linearly BETWEEN points and holds outside them");

    /* A descending span must interpolate downward — a sign error here would
     * only show as automation that ramps the wrong way. */
    { pa_entry_t d; memset(&d, 0, sizeof(d)); d.used = 1; d.flags = PA_FLAG_ACTIVE | PA_FLAG_SMOOTH;
      pa_set_point(&d, 0, 8000);
      pa_set_point(&d, 100, 4000);
      HX_ASSERT(at(&d, 50) == 6000, "descending ramp");
      OK("interpolation follows a falling span as well as a rising one"); }

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
