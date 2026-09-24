/* tests/test_param_auto_export_lead.c — 6b2 follow-up: pa_export's FIRST
 * point before the window start.
 *
 * Filed at _worklogs/specs/2026-09-10-davebox-plan.md (grep 6b2): "pa_export
 * writes raw points, and a DAW envelope holds the FIRST point before it — an
 * exported clip still plays the old rule. Fix = prepend a point at the
 * window start carrying the lane's last value (and its smooth ramp value)
 * when the first point is later."
 *
 * dAVEBOx's OWN rule since 6b2 (pa_eval_window, seq8_param_auto.c): before a
 * lane's first point (inside its window) it plays its LAST point's value,
 * carried round from the previous pass — Wrap: Carry, the default. Live's
 * clip envelope instead holds the FIRST breakpoint's value for every time
 * before it, so an export whose first breakpoint is later than the window
 * start plays the WRONG value for everything up to that point.
 *
 * pa_export itself writes to a device-only path (EXPORT_PA_PATH is under
 * /data/UserData, unreachable off-device — see test_param_auto_scale_export.sh's
 * own note), so this drives the factored-out static helper `pa_export_points`
 * directly (white-box, same TU) and asserts the breakpoint sequence it
 * produces — exactly what pa_export writes to the file, minus the file I/O. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pa_set(hx_t *h, int t, int c, const char *tgt, int tick, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, tick, val);
    hx_set_param(h, k, v);
}

/* Find the (track, clip, target-string) lane written above — white-box scan,
 * same approach test_param_auto_wrap_playback.c uses for inst->tracks[]. */
static pa_entry_t *find_lane(seq8_instance_t *inst, int track, int clip, const char *tgt) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != track || e->clip != clip) continue;
        if (!strcmp(inst->pa_targets[e->target], tgt)) return e;
    }
    return 0;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;

    /* Default clip: 16 steps at 24 tps (TICKS_PER_STEP) → window [0, 384).
     * Two points, both AFTER the window start (tick 0): step 4 (tick 96) =
     * 100, step 10 (tick 240) = 200. Nothing at tick 0. */
    pa_set(h, 0, 0, "1:fx1:mix", 96, 100);
    pa_set(h, 0, 0, "1:fx1:mix", 240, 200);

    pa_entry_t *e = find_lane(in, 0, 0, "1:fx1:mix");
    HX_ASSERT(e && e->count == 2, "setup: two raw points, first later than the window start");
    HX_ASSERT(!(e->flags & PA_FLAG_WRAP_RESET), "setup: Wrap stays Carry (the default)");

    pa_point_t pts[PA_ENTRY_POINTS + 2];
    int n = pa_export_points(&in->tracks[0], e, pts, PA_ENTRY_POINTS + 2);

    HX_ASSERT(n == 4, "a lead point is prepended and a trail point appended: 4 breakpoints");
    HX_ASSERT(pts[0].tick == 0 && pts[0].val == 200,
              "lead point at the window start carries the LAST point's value (200) — "
              "Wrap: Carry, exactly what dAVEBOx plays there; the old export left Live "
              "holding the FIRST point's value (100) for ticks 0..96, which is wrong");
    HX_ASSERT(pts[1].tick == 96 && pts[1].val == 100, "then the recorded points, unchanged");
    HX_ASSERT(pts[2].tick == 240 && pts[2].val == 200, "then the recorded points, unchanged");
    HX_ASSERT(pts[3].tick == 384 && pts[3].val == 200,
              "Smooth off: the trail point at the window end holds the last value — what "
              "dAVEBOx plays there, and what Live would hold anyway");
    OK("⭐ 6b2 follow-up: the export's first breakpoint matches what the lane actually plays");

    /* ⭐ THE WRAP RAMP (Josh, 2026-09-24: "Wrap doesn't ramp from its last
     * automation point to the first one"). Smooth on: after the last point
     * (240 = 200) the lane ramps toward the NEXT pass's first point (96+384 =
     * 480, value 100) straight across the loop end. At the window end (384)
     * that is 200 + (100-200) * (384-240)/(480-240) = 140, and the lead point
     * at 0 carries the same 140 (continuing to 100 at 96). Without the trail
     * point Live held 200 flat from 240 to 384 and then JUMPED to 140. */
    hx_set_param(h, "t0_pa_smooth", "0 1:fx1:mix 1");
    HX_ASSERT(e->flags & PA_FLAG_SMOOTH, "setup: Smooth on");
    n = pa_export_points(&in->tracks[0], e, pts, PA_ENTRY_POINTS + 2);
    HX_ASSERT(n == 4, "Smooth + Carry: lead + 2 raw + trail");
    HX_ASSERT(pts[0].tick == 0 && pts[0].val == 140, "lead = the ramp's value at the loop start (140)");
    HX_ASSERT(pts[3].tick == 384 && pts[3].val == 140,
              "trail = the SAME value at the loop end, so Live draws one continuous ramp "
              "last point -> loop end = loop start -> first point");
    OK("⭐ Smooth + Carry: the export carries the wrap ramp across the loop end");

    /* Reset: after the last point the lane holds it (Live does the same), so
     * no trail point; the lead is the resting value (or the first point's). */
    hx_set_param(h, "t0_pa_wrap", "0 1:fx1:mix 1");
    HX_ASSERT(e->flags & PA_FLAG_WRAP_RESET, "setup: Wrap Reset");
    n = pa_export_points(&in->tracks[0], e, pts, PA_ENTRY_POINTS + 2);
    HX_ASSERT(pts[n - 1].tick == 240, "Reset: no trail point — the last breakpoint is the last recorded one");
    OK("Reset: no trail point (the lane holds its last value, as Live does)");

    hx_destroy(h);
    printf("test_param_auto_export_lead: %d ok\n", ok_count);
    return 0;
}
