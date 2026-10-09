/* tests/test_capture_takes_note_repeat.c — Capture keeps the hits Note Repeat
 * played (Josh, 2026-10-09: "drum repeat ... it's also an INPUT modifier").
 *
 * Note Repeat, like LIVE ARP, sits between your hands and the sequencer, and
 * Record has always written each repeated hit into the lane. Capture took
 * none of them: a lane pad held for a repeat never reaches live_note_on, which
 * was the only thing feeding the ring.
 *
 *  1. Rpt1 on a lane: one captured note per hit, all of that lane's pitch.
 *  2. ...committed into the lane, each at the length Record gives a repeat —
 *     not held until the Capture press.
 *  2b. the same while the transport plays (a take then measures in ticks).
 *  3. Rpt2 on another lane: the same.
 *  4. CONTROL: with no repeat running, nothing is captured.
 *  5. CONTROL: an armed track's repeats are recorded, not captured.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }
static int lane_notes(seq8_track_t *tr, int lane) {
    return (int)tr->drum_clips[tr->active_clip]->lanes[lane].clip.note_count;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    seq8_track_t *tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "rig: track 0 is a drum track");
    HX_ASSERT(tr->drum_clips[tr->active_clip], "rig: the drum clip exists");
    inst->active_track = 0;
    hx_render(h, 4);

    /* ---- 4. CONTROL first: nothing running, nothing captured ---- */
    hx_render(h, 300);
    HX_ASSERT(capture_pending_for_track(inst, 0) == 0, "control: an idle track captures nothing");

    /* ---- 1 + 2. Rpt1 on lane 0 ---- */
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");
    HX_ASSERT(tr->drum_repeat_active, "rig: Rpt1 is running");
    hx_render(h, 1500);
    hx_set_param(h, "t0_drum_repeat_stop", "1");
    hx_render(h, 20);
    int pend = capture_pending_for_track(inst, 0);
    HX_ASSERT(pend >= 4, "Rpt1: the repeated hits are pending in Capture");
    {
        uint8_t want = tr->drum_clips[tr->active_clip]->lanes[0].midi_note;
        int i, on = 0, wrong = 0;
        for (i = 0; i < (int)inst->cap_count; i++) {
            const cap_ev_t *ev = &inst->cap_ring[(inst->cap_head + i) % CAP_MAX_EVENTS];
            if (ev->type != CAP_EV_NOTE_ON) continue;
            on++; if (ev->a != want) wrong++;
        }
        HX_ASSERT(on == pend && wrong == 0, "Rpt1: every captured hit is lane 0's own pitch");
    }
    hx_render(h, 200);                           /* the Capture press comes late */
    hx_set_param(h, "t0_capture_commit", "0");
    {
        clip_t *lc = &tr->drum_clips[tr->active_clip]->lanes[0].clip;
        int i, longest = 0, shortest = 1 << 30;
        HX_ASSERT(lc->note_count == pend, "Rpt1: Capture committed every hit into the lane");
        for (i = 0; i < lc->note_count; i++) {
            if ((int)lc->notes[i].gate > longest)  longest  = (int)lc->notes[i].gate;
            if ((int)lc->notes[i].gate < shortest) shortest = (int)lc->notes[i].gate;
        }
        HX_ASSERT(longest <= 2 * GATE_TICKS, "Rpt1: each hit keeps a repeat's length, not the wait until Capture");
        HX_ASSERT(shortest * 2 >= GATE_TICKS, "Rpt1: ...and is not collapsed to a single tick");
        for (i = 1; i < lc->note_count; i++)
            HX_ASSERT(lc->notes[i].tick != lc->notes[i - 1].tick, "Rpt1: the hits are spread in time");
    }
    hx_destroy(h);

    /* ---- 2b. the same while PLAYING (a take then measures in ticks) ---- */
    h = hx_create(NULL);
    inst = I(h);
    tr = &inst->tracks[0];
    inst->active_track = 0;
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 30);
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");
    hx_render(h, 420);                           /* inside one pass of the bar */
    hx_set_param(h, "t0_drum_repeat_stop", "1");
    hx_render(h, 100);
    pend = capture_pending_for_track(inst, 0);
    HX_ASSERT(pend >= 2, "playing: the repeated hits are pending in Capture");
    hx_set_param(h, "t0_capture_commit", "0");
    {
        clip_t *lc = &tr->drum_clips[tr->active_clip]->lanes[0].clip;
        int i;
        HX_ASSERT(lc->note_count >= 2, "playing: Capture committed the hits into the lane");
        for (i = 0; i < lc->note_count; i++)
            HX_ASSERT((int)lc->notes[i].gate * 2 >= GATE_TICKS && (int)lc->notes[i].gate <= 2 * GATE_TICKS,
                      "playing: each hit keeps a repeat's length");
    }
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    /* ---- 3. Rpt2 on lane 1 ---- */
    h = hx_create(NULL);
    inst = I(h);
    tr = &inst->tracks[0];
    inst->active_track = 0;
    hx_render(h, 4);
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat2_lane_on", "1 100");
    hx_render(h, 1500);
    hx_set_param(h, "t0_drum_repeat2_lane_off", "1");
    hx_render(h, 20);
    pend = capture_pending_for_track(inst, 0);
    HX_ASSERT(pend >= 4, "Rpt2: the repeated hits are pending in Capture");
    hx_set_param(h, "t0_capture_commit", "0");
    HX_ASSERT(lane_notes(tr, 1) == pend, "Rpt2: Capture committed every hit into its lane");
    HX_ASSERT(lane_notes(tr, 0) == 0, "Rpt2: and nothing into a lane that was not repeating");
    hx_destroy(h);

    /* ---- 5. CONTROL: armed — Record owns the hits ---- */
    h = hx_create(NULL);
    inst = I(h);
    tr = &inst->tracks[0];
    inst->active_track = 0;
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 50);
    tr->recording = 1;
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");
    hx_render(h, 1500);
    HX_ASSERT(capture_pending_for_track(inst, 0) == 0, "armed: nothing goes to Capture");
    HX_ASSERT(lane_notes(tr, 0) > 0, "armed: the hits were recorded (the rig does produce hits)");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    printf("PASS: Capture keeps what Note Repeat played\n");
    return 0;
}
