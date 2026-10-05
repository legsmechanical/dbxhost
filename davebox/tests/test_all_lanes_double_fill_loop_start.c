/* tests/test_all_lanes_double_fill_loop_start.c — ALL LANES double-fill copies
 * each lane's LOOP WINDOW forward and never runs the window past step 256.
 *
 * THE BUG THIS PINS (2026-10-04 module review): `tN_all_lanes_double_fill`
 * copied steps [0, len) to [len, 2 len) and checked only `len * 2 > 256`,
 * ignoring loop_start. Its single-lane and melodic twins were both fixed for
 * exactly this. With loop_start > 0 the doubled window held the wrong content
 * (steps from before the loop) and could end past step 256, where the recorder
 * and playhead index steps[] out of bounds. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "control: t0 is a drum track");

    hx_set_param(h, "t0_l0_step_0_toggle", "110");   /* before the loop: must NOT be copied */
    hx_set_param(h, "t0_l0_step_5_toggle", "100");   /* inside the loop */
    drum_clip_t *dc = tr->drum_clips[tr->active_clip];
    HX_ASSERT(dc, "drum clip allocated");
    clip_t *L0 = &dc->lanes[0].clip;

    /* Every lane: loop start 4, length 8 (packed (4<<16)|8). */
    hx_set_param(h, "t0_all_lanes_loop_set", "262152");
    HX_ASSERT(L0->loop_start == 4 && L0->length == 8, "control: ls=4 len=8");

    hx_set_param(h, "t0_all_lanes_double_fill", "1");
    HX_ASSERT(L0->length == 16, "double_fill: length 8 -> 16");
    HX_ASSERT(L0->steps[5 + 8], "the hit at step 5 was copied to step 13 (loop window forward)");
    HX_ASSERT(!L0->steps[0 + 8], "step 0 (before the loop) was copied to step 8 — copied from 0, not loop_start");

    /* A window that cannot double from its loop start is refused, not run past 256. */
    clip_t *L1 = &dc->lanes[1].clip;
    hx_set_param(h, "t0_all_lanes_loop_set", "13107240");   /* (200<<16)|40 */
    HX_ASSERT(L1->loop_start == 200 && L1->length == 40, "control: ls=200 len=40");
    hx_set_param(h, "t0_all_lanes_double_fill", "1");
    HX_ASSERT((int)L1->loop_start + (int)L1->length <= SEQ_STEPS,
              "double_fill ran the window past the last step");
    HX_ASSERT(L1->length == 40, "a window that cannot double from its loop start must be left alone");

    hx_destroy(h);
    printf("PASS: all_lanes_double_fill_loop_start\n");
    return 0;
}
