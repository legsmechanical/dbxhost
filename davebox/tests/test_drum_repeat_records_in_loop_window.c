/* tests/test_drum_repeat_records_in_loop_window.c — Drum Repeat records into a
 * lane whose loop does not start at step 1.
 *
 * THE BUG THIS PINS (2026-10-04 module review): both repeat engines tested the
 * lane's playhead against the loop LENGTH and wrapped modulo the length, but
 * the playhead runs inside [loop_start, loop_start + length). With a loop of
 * steps 9–16 the playhead is never below 8, so nothing was recorded at all —
 * and with a window that overlapped, the wrap sent the last hit to step 1,
 * outside the loop. The pad recorder was already window-aware. */
#include "harness.h"

static int hits_in(const clip_t *c, int from, int to) {
    int n = 0;
    for (int s = from; s < to; s++) n += c->step_note_count[s];
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "control: t0 is a drum track");
    int ac = (int)tr->active_clip;
    HX_ASSERT(tr->drum_clips[ac], "control: the drum clip exists");

    /* Every lane loops steps 9–16. */
    hx_set_param(h, "t0_all_lanes_loop_set", "524296");          /* (8 << 16) | 8 */
    clip_t *l0 = &tr->drum_clips[ac]->lanes[0].clip, *l1 = &tr->drum_clips[ac]->lanes[1].clip;
    HX_ASSERT(l0->loop_start == 8 && l0->length == 8, "rig: the loop window was not set");

    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 50);
    tr->recording = 1;
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");      /* Rpt1 on lane 0 */
    hx_set_param(h, "t0_drum_repeat2_lane_on", "1 100");     /* Rpt2 on lane 1 */
    HX_ASSERT(tr->drum_repeat_active, "control: Rpt1 active");
    hx_render(h, 3000);                                       /* several passes of the loop */

    HX_ASSERT(hits_in(l0, 8, 16) > 0, "Rpt1 recorded nothing into a loop that starts at step 9");
    HX_ASSERT(hits_in(l1, 8, 16) > 0, "Rpt2 recorded nothing into a loop that starts at step 9");
    HX_ASSERT(hits_in(l0, 0, 8) == 0 && hits_in(l0, 16, SEQ_STEPS) == 0, "Rpt1 recorded outside the loop");
    HX_ASSERT(hits_in(l1, 0, 8) == 0 && hits_in(l1, 16, SEQ_STEPS) == 0, "Rpt2 recorded outside the loop");

    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    printf("PASS: drum_repeat_records_in_loop_window\n");
    return 0;
}
