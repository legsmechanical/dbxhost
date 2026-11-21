/* tests/test_length_knob_stays_in_phase.c — every length change of a playing
 * clip keeps it in phase with the song position (ruled 2026-11-21: "stay in
 * phase"). The length knob's key (tN_clip_length, active clip) only snapped
 * the playhead to the loop start when it fell outside, so a clip shortened
 * while playing drifted against the bar; the clip-addressed key, drum lanes
 * and Stretch already re-anchored. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];
    clip_t *c = &tr->clips[tr->active_clip];
    HX_ASSERT(c->length == 16 && c->ticks_per_step == 24, "control: 16 steps at 1/16");

    I->playing = 1;
    I->global_tick = 21;          /* 21 steps and 5 ticks into the song */
    I->master_tick_in_step = 5;
    tr->current_step = 3;         /* somewhere inside the new window */
    hx_set_param(h, "t1_clip_length", "8");
    HX_ASSERT(c->length == 8, "control: length 8");
    HX_ASSERT(tr->current_step == 21 % 8, "the length knob re-anchors to the song position (step 5)");
    HX_ASSERT(tr->tick_in_step == 5, "...and the tick within the step");

    /* Control: the clip-addressed key lands on the same place. */
    tr->current_step = 2;
    hx_set_param(h, "t1_c0_length", "8");
    HX_ASSERT(tr->current_step == 5, "control: the clip-addressed key agrees");

    /* Stopped: no re-anchor, the old snap rule only. */
    I->playing = 0;
    tr->current_step = 3;
    hx_set_param(h, "t1_clip_length", "12");
    HX_ASSERT(tr->current_step == 3, "stopped: the playhead is left alone");

    hx_destroy(h);
    printf("PASS: length_knob_stays_in_phase\n");
    return 0;
}
