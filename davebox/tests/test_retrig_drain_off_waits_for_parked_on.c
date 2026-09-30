/* tests/test_retrig_drain_off_waits_for_parked_on.c — a note-off the retrigger
 * drain sends never overtakes its own swing-parked note-on.
 *
 * Found by review of the swing drain fix (2026-09-30): the drain keeps
 * swing-parked events and sends a note-off for every other queued note event —
 * including a note's own queued GATE-off. If the drain runs when swing is not
 * deferring (an on-beat step, a live pad tap), that off goes out at once, the
 * parked note-on fires after it, and the note has no off left. White-box: the
 * window needs a gate-off queued while its note-on is still parked, which the
 * sequencer reaches only by timing, so the state is built directly.
 * The drum case is a plain no-stuck check: a lane replays one pitch and its
 * drain did not reach this order (the melodic fix, mirrored there, changed no
 * emitted byte), so the drum drain was left as it was. */
#include "harness.h"
#include <stdio.h>

static int last_is_on(int slot, int note) {
    int on = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL || e->slot != slot || e->bytes[2] != note) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if (st == 0x90 && e->bytes[3] > 0) on = 1;
        else if (st == 0x80 || st == 0x90) on = 0;
    }
    return on;
}

int main(void) {
    int checks = 0;
    for (int drum = 0; drum < 2; drum++) {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        int t = drum ? 0 : 3;
        seq8_track_t *tr = &in->tracks[t];
        char k[32]; snprintf(k, sizeof k, "t%d_route", t); hx_set_param(h, k, "schwung");
        hx_clear_capture(h);
        int slot = (int)tr->pfx.slot;
        if (!drum) {
            play_fx_t *fx = &tr->pfx;
            fx->sample_counter = 10000;
            in->swing_step_delay = 2000;                 /* an off-beat: the on parks */
            pfx_note_on(in, tr, 60, 100);
            HX_ASSERT(fx->event_count == 1 && (fx->events[0].flags & PFX_EV_BYPASS_SWING), "rig: the note-on did not park");
            fx->sample_counter += 10;
            pfx_note_off(in, tr, 60);                    /* gate not elapsed: the off QUEUES */
            HX_ASSERT(fx->event_count == 2, "rig: the gate-off did not queue");
            in->swing_step_delay = 0;                    /* on-beat: nothing defers now */
            pfx_note_on(in, tr, 64, 100);                /* the drain runs */
            fx->sample_counter += 1000000;
            pfx_q_fire(fx, fx->sample_counter);          /* everything queued fires */
        } else {
            drum_pfx_t *px = &tr->drum_lane_pfx[0];
            px->sample_counter = 10000;
            in->swing_step_delay = 2000;
            drum_pfx_note_on(in, tr, px, 60, 100);
            HX_ASSERT(px->event_count >= 1, "rig: the drum note-on did not park");
            px->sample_counter += 10;
            drum_pfx_note_off(in, tr, px, 60);
            in->swing_step_delay = 0;
            drum_pfx_note_on(in, tr, px, 60, 90);        /* the lane retriggers: the drain runs */
            px->sample_counter += 1000000;
            drum_pfx_q_fire(px, px->sample_counter);
            drum_pfx_note_off(in, tr, px, 60);
            drum_pfx_q_fire(px, px->sample_counter + 1000000);
        }
        if (last_is_on(slot, 60)) {
            hx_dump_midi(h);
            fprintf(stderr, "FAIL: %s: the drained note-off overtook its parked note-on — note 60 is left sounding\n",
                    drum ? "drum" : "melodic");
            return 1;
        }
        checks++;
        hx_destroy(h);
    }
    printf("PASS: test_retrig_drain_off_waits_for_parked_on (%d checks)\n", checks);
    return 0;
}
