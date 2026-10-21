/* tests/test_param_auto_export_lead.c — what an automation lane exports as:
 * the breakpoints Live draws, matching what dAVEBOx plays.
 *
 * A lane is an envelope of points that glide into each other, with jump pairs
 * (two points on one tick) for hard edges — which is almost exactly what a
 * Live clip envelope is. What Live does not do is WRAP: before its first
 * breakpoint it holds the first value, after its last the last. So the export
 * adds a LEAD point at the window start when the lane's first point is later
 * (its start point was deleted), and a TRAIL point at the window end carrying
 * what plays just before the loop comes round (Wrap: Carry glides into the
 * start; Reset holds the last value). A STEPPED target (a choice, a switch)
 * holds each value to the next point, written as a jump pair.
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

#define TG "1:fx1:mix"
#define CAP (2 * PA_ENTRY_POINTS + 2)

static void pa_set(hx_t *h, int tick, int val) {
    char v[128];
    snprintf(v, sizeof(v), "0 " TG " %d %d", tick, val);
    hx_set_param(h, "t0_pa_set", v);
}
static pa_entry_t *find_lane(seq8_instance_t *inst) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (e->used && e->track == 0 && e->clip == 0 && !strcmp(inst->pa_targets[e->target], TG)) return e;
    }
    return 0;
}
/* Drop the lane's start point (the user deleted step 1). */
static void drop_start(pa_entry_t *e) {
    HX_ASSERT(e->count && e->points[0].tick == 0, "setup: a start point to delete");
    memmove(&e->points[0], &e->points[1], (size_t)(e->count - 1) * sizeof(pa_point_t));
    e->count--;
}
static int pt_is(const pa_point_t *p, int tick, int val) { return p->tick == tick && p->val == val; }

int main(void) {
    static pa_point_t pts[CAP];

    /* Default clip: 16 steps at 24 tps → window [0, 384). Points at step 4
     * (tick 96) = 100 and step 10 (tick 240) = 200. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 " TG " 50");
        pa_set(h, 96, 100);
        pa_set(h, 240, 200);
        pa_entry_t *e = find_lane(in);
        HX_ASSERT(e && e->count == 3 && pt_is(&e->points[0], 0, 50), "setup: a start point (rest 50) and two points");

        /* Reset (the default for a new lane): the start point, the points,
         * and the last value held to the loop end. */
        int n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        HX_ASSERT(n == 4, "start + 2 points + trail");
        HX_ASSERT(pt_is(&pts[0], 0, 50) && pt_is(&pts[1], 96, 100) && pt_is(&pts[2], 240, 200),
                  "the points as they are — Live glides between breakpoints exactly as dAVEBOx does");
        HX_ASSERT(pt_is(&pts[3], 384, 200), "Reset: the trail holds the last value to the loop end");
        OK("⭐ a lane exports as its own envelope, the last value held to the loop end");

        /* Carry: the trail glides into the next pass's start (50). */
        hx_set_param(h, "t0_pa_wrap", "0 " TG " 0");
        n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        HX_ASSERT(n == 4 && pt_is(&pts[3], 384, 50),
                  "Carry: the trail arrives at the start point's value, so the tiled export is one continuous line");
        OK("⭐ Carry: the export carries the glide across the loop end");

        /* The start point deleted: a LEAD at the window start. */
        drop_start(e);
        n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        /* Carry glides 240 = 200 -> 96 + 384 = 100: at 384 (= 0) that is
         * 200 + (100 - 200) * 144 / 240 = 140, on both sides of the seam. */
        HX_ASSERT(n == 4 && pt_is(&pts[0], 0, 140) && pt_is(&pts[3], 384, 140),
                  "Carry, no start point: lead and trail both carry the wrap glide's value (140)");
        hx_set_param(h, "t0_pa_wrap", "0 " TG " 1");
        n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        HX_ASSERT(n == 4 && pt_is(&pts[0], 0, 100) && pt_is(&pts[3], 384, 200),
                  "Reset, no start point: the first point's value before it, the last held after it");
        OK("⭐ a lane whose start point was deleted gets a lead point that plays what dAVEBOx plays");

        /* Scale applies to every breakpoint. */
        hx_set_param(h, "t0_pa_scale", "0 " TG " 50");
        n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        HX_ASSERT(n == 4 && pt_is(&pts[0], 0, 50) && pt_is(&pts[1], 96, 50) && pt_is(&pts[3], 384, 100),
                  "Scale 50 %: every breakpoint halved, the lead and trail too");
        OK("the lane's Scale applies to what leaves");
        hx_destroy(h);
    }

    /* A PUNCH exports as its two jump pairs — real points, nothing synthesized. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 " TG " 1000");
        hx_set_param(h, "t0_pa_hold_write", "0 " TG " 4 4 24 9000 1 0");
        pa_entry_t *e = find_lane(in);
        int n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        HX_ASSERT(n == 6, "start, entry pair, exit pair, trail");
        HX_ASSERT(pt_is(&pts[1], 96, 1000) && pt_is(&pts[2], 96, 9000), "in: a jump pair on the step's first tick");
        HX_ASSERT(pt_is(&pts[3], 120, 9000) && pt_is(&pts[4], 120, 1000), "out: a jump pair on the tick after it");
        HX_ASSERT(pt_is(&pts[5], 384, 1000), "and the trail");
        OK("⭐ a punch exports as its jump pairs");
        hx_destroy(h);
    }

    /* A STEPPED target holds each value to the next point: a pair is written
     * at each point so Live does not slide between them. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 " TG " 50");
        pa_set(h, 96, 100);
        pa_set(h, 240, 200);
        pa_entry_t *e = find_lane(in);
        int n = pa_export_points(&in->tracks[0], e, 1, pts, CAP);
        HX_ASSERT(n == 6, "start, (hold, point) x2, trail");
        HX_ASSERT(pt_is(&pts[0], 0, 50) && pt_is(&pts[1], 96, 50) && pt_is(&pts[2], 96, 100),
                  "the start value HOLDS to the first point, then steps");
        HX_ASSERT(pt_is(&pts[3], 240, 100) && pt_is(&pts[4], 240, 200), "…and between the points");
        HX_ASSERT(pt_is(&pts[5], 384, 200), "and the trail");
        /* CONTROL: equal neighbours need no pair. */
        pa_set(h, 300, 200);
        n = pa_export_points(&in->tracks[0], e, 1, pts, CAP);
        int at300 = 0;
        for (int i = 0; i < n; i++) if (pts[i].tick == 300) at300++;
        HX_ASSERT(at300 == 1, "240 = 200 then 300 = 200: one breakpoint at 300, no pair");
        OK("⭐ a stepped target exports stepped");
        hx_destroy(h);
    }

    /* ⭐ POINTS OUTSIDE THE WINDOW (kept when a loop is narrowed) never play
     * while the window holds any: the export reads its lead and its trail off
     * the points INSIDE. Lane loop [96, 288): 900 at 48 (outside, before),
     * 3000 at 144, 6000 at 240, 7000 at 300 (outside, after). Reset. */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_loop", "0 " TG " 192 96 0");     /* no lane yet: ignored */
        pa_set(h, 48, 900);
        pa_set(h, 144, 3000);
        pa_set(h, 240, 6000);
        pa_set(h, 300, 7000);
        hx_set_param(h, "t0_pa_loop", "0 " TG " 192 96 0");
        pa_entry_t *e = find_lane(in);
        HX_ASSERT(e && e->loop_len == 192 && e->loop_off == 96, "setup: the lane's own loop 96..288");
        int n = pa_export_points(&in->tracks[0], e, 0, pts, CAP);
        for (int i = 0; i < n; i++)
            HX_ASSERT(pts[i].tick >= 96 && pts[i].tick <= 288, "no breakpoint outside the window");
        for (int i = 0; i < n; i++)
            HX_ASSERT(pts[i].val != 900 && pts[i].val != 7000, "no value that never plays");
        HX_ASSERT(pt_is(&pts[0], 96, 3000), "the lead: the first point inside, held before it (Reset)");
        HX_ASSERT(pt_is(&pts[n - 1], 288, 6000), "the trail holds the last point inside to the window end");
        OK("⭐ points outside the window: not exported, and not used for the lead or the trail");
        hx_destroy(h);
    }
    printf("test_param_auto_export_lead: %d ok\n", ok_count);
    return 0;
}
