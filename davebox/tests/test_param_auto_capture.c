/* tests/test_param_auto_capture.c — AUTOMATION CAPTURE (plan 6e).
 *
 * Josh, 2026-09-11: "same as move native and davebox retrospective note
 * capture", for parameter moves. A knob turned while the loop runs and Record
 * is OFF used to be discarded on release; now it is kept, and a Capture tap
 * commits it into the real lane.
 *
 * Three rulings this pins, because each one is a thing the code could
 * plausibly have done instead:
 *   - PLAYING ONLY. A stopped knob move has no timeline and is not captured.
 *   - ONE LOOP PER PARAMETER. Points are keyed by clip tick, so a second lap
 *     overwrites the first rather than growing the buffer.
 *   - RECORD ON IS NOT CAPTURE. An armed sweep goes to the lane directly and
 *     leaves the capture buffer empty — otherwise a Capture tap after
 *     recording would write the same sweep a second time.
 *
 * ⚠ The control that matters most is the last one: every assertion here would
 * still pass if capture simply recorded everything all the time.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* The DSP's own pending readback — the number JS lights the Capture LED from.
 * Format: "<notes> <param sweeps> <pa commit seq>". */
static int cap_pending_pa(hx_t *h) {
    char buf[64] = {0};
    int notes = 0, pa = 0, seq = 0;
    hx_get_param(h, "capture_pending", buf, sizeof(buf));
    sscanf(buf, "%d %d %d", &notes, &pa, &seq);
    return pa;
}
static int cap_seq(hx_t *h) {
    char buf[64] = {0};
    int notes = 0, pa = 0, seq = 0;
    hx_get_param(h, "capture_pending", buf, sizeof(buf));
    sscanf(buf, "%d %d %d", &notes, &pa, &seq);
    return seq;
}

int main(void) {
    printf("automation capture (plan 6e):\n");

    /* ---- the whole gesture, end to end -------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        in->playing   = 1;
        tr->recording = 0;               /* Record OFF — this is the whole point */

        /* A knob swept across three cells of the clip's playhead. */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_record_tick(in, tr, 0, 0, 0,  24, 384);        /* cell 0 */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 4000");
        pa_record_tick(in, tr, 0, 0, 24, 24, 384);        /* cell 24 */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 5000");
        pa_record_tick(in, tr, 0, 0, 48, 24, 384);        /* cell 48 */

        HX_ASSERT(in->pa_entries[0].used == 0,
                  "⚠ Record is OFF, so NOTHING was written to a lane");
        HX_ASSERT(cap_pending_pa(h) == 1,
                  "...but the sweep was kept: one parameter pending capture");
        OK("a sweep heard with Record off writes no lane and is held for capture");

        /* Coming round the loop again overwrites the cells it already holds —
         * the "one loop per parameter" ruling, and what bounds the buffer. */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 9000");
        pa_record_tick(in, tr, 0, 0, 0, 24, 384);         /* cell 0, second lap */
        HX_ASSERT(in->pa_cap[0].count == 3,
                  "a second lap does not grow the buffer — one loop per parameter");
        HX_ASSERT(in->pa_cap[0].points[0].val == 9000,
                  "...it OVERWRITES the cell, exactly as recording would");
        OK("⭑ one loop per parameter: the second lap replaces the first");

        /* The Capture tap. */
        int seq_before = cap_seq(h);
        hx_set_param(h, "t0_pa_capture_commit", "0");

        pa_entry_t *e = &in->pa_entries[0];
        HX_ASSERT(e->used && e->track == 0 && e->clip == 0,
                  "the commit created the lane");
        HX_ASSERT(e->count == 3, "with a point per captured cell");
        HX_ASSERT(e->points[0].tick == 0  && e->points[0].val == 9000, "cell 0");
        HX_ASSERT(e->points[1].tick == 24 && e->points[1].val == 4000, "cell 24");
        HX_ASSERT(e->points[2].tick == 48 && e->points[2].val == 5000, "cell 48");
        HX_ASSERT(e->flags & PA_FLAG_SMOOTH,
                  "⚠ a captured sweep plays back SMOOTH — half-step holds are an audible staircase");
        HX_ASSERT(cap_pending_pa(h) == 0, "the buffer is consumed by the commit");
        HX_ASSERT(cap_seq(h) != seq_before, "and the commit sequence bumped, so JS can toast the edge");
        HX_ASSERT(in->pa_dirty == 1 && in->state_dirty == 1, "the project is dirty — a capture is a real edit");
        OK("⭐ the Capture tap turns the held sweep into a real lane");
        hx_destroy(h);
    }

    /* ---- THE CONTROL: Record ON must not ALSO capture ------------------ */
    {
        /* Without this, a Capture tap after a recording pass would write the
         * same sweep into the lane a second time. Every other assertion in
         * this file passes whether or not this holds. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        in->playing   = 1;
        tr->recording = 1;               /* ARMED */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_record_tick(in, tr, 0, 0, 0, 24, 384);

        HX_ASSERT(in->pa_entries[0].used && in->pa_entries[0].count == 1,
                  "an ARMED sweep is recorded into the lane, as before");
        HX_ASSERT(cap_pending_pa(h) == 0,
                  "⚠⚠ ...and captures NOTHING — or the tap would write it twice");
        OK("⚠⚠ CONTROL: recording is not capturing");
        hx_destroy(h);
    }

    /* ---- playing only, and the transport edge clears -------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        /* Stopped: pa_record_tick is not even called by the render path, but
         * the buffer must also be empty across a transport edge — a sweep
         * belongs to the pass it was heard in. */
        in->playing   = 1;
        tr->recording = 0;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_record_tick(in, tr, 0, 0, 0, 24, 384);
        HX_ASSERT(cap_pending_pa(h) == 1, "a sweep is held while the loop runs");

        hx_set_param(h, "transport", "stop");
        HX_ASSERT(in->playing == 0, "⚠ control: the transport really did stop — \"0\" is not the value this key takes");
        HX_ASSERT(cap_pending_pa(h) == 0,
                  "⚠ stopping the transport DROPS it — capture is about what you just heard");
        OK("⚠ a transport edge clears the captured sweeps, like the note ring");
        hx_destroy(h);
    }

    /* ---- Shift+Capture clears without committing ------------------------ */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        in->playing   = 1;
        tr->recording = 0;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_record_tick(in, tr, 0, 0, 0, 24, 384);
        HX_ASSERT(cap_pending_pa(h) == 1, "a sweep is held");

        hx_set_param(h, "t0_pa_capture_clear", "1");
        HX_ASSERT(cap_pending_pa(h) == 0, "Shift+Capture drops it");
        HX_ASSERT(in->pa_entries[0].used == 0, "...and wrote no lane");
        OK("Shift+Capture discards the sweeps rather than committing them");
        hx_destroy(h);
    }

    /* ---- a sweep belongs to the clip it was heard in --------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        in->playing   = 1;
        tr->recording = 0;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_record_tick(in, tr, 0, /*clip*/1, 0, 24, 384);   /* heard in clip 1 */

        hx_set_param(h, "t0_pa_capture_commit", "0");        /* tap while clip 0 focused */
        HX_ASSERT(in->pa_entries[0].used == 0,
                  "⚠ a sweep heard in another clip is NOT re-timed into this one");
        HX_ASSERT(cap_pending_pa(h) == 1, "...and it is still held, not silently eaten");
        hx_set_param(h, "t0_pa_capture_commit", "1");
        HX_ASSERT(in->pa_entries[0].used && in->pa_entries[0].clip == 1,
                  "committing its OWN clip lands it");
        OK("a captured sweep commits into the clip it was heard in");
        hx_destroy(h);
    }

    printf("test_param_auto_capture: PASS (%d checks)\n", ok_count);
    return 0;
}
