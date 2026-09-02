/* tests/test_stop_mid_gate.c — stopping the transport while a note's gate is
 * still running must still end the note, on every route.
 *
 * pfx_note_off does not SEND a note-off whose gate has not elapsed: it queues
 * it for the gate's end. Transport stop silences the track and then clears
 * the queue — and on the chain / external routes that used to throw the
 * queued off away. Heard on device as a synth holding its last note after
 * Stop, reliably reproduced by stopping mid-gate with a long gate. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int seen_internal_off(int note, int slot) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL || e->slot != slot) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if (e->bytes[2] != (uint8_t)note) continue;
        if (st == 0x80 || (st == 0x90 && e->bytes[3] == 0)) return 1;
    }
    return 0;
}
static int seen_internal_on(int note) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL) continue;
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == (uint8_t)note && e->bytes[3] > 0) return 1;
    }
    return 0;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    /* Two chain tracks. The panic sweep at stop reaches ONE slot per route —
     * the first track's — so the note lives on the second, the one the sweep
     * never covers. That is the shape on device: a chain synth on a higher
     * track holding its last note after Stop. */
    hx_set_param(h, "t0_route", "schwung");
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_pfx_gate", "200");                 /* gate outlasts the step */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "transport", "play_focus:1:0");        /* the real launch path */
    HX_ASSERT(in->playing == 1, "transport running");
    hx_render(h, 12);                                       /* the note-on fires; the gate is running */
    HX_ASSERT(seen_internal_on(60), "the note sounds on the chain slot");
    HX_ASSERT(in->tracks[1].pfx.pitch_refcount[60] == 1, "and is counted as sounding");
    int slot = (int)in->tracks[1].pfx.slot;

    hx_clear_capture(h);
    hx_set_param(h, "transport", "stop");                   /* mid-gate */
    HX_ASSERT(in->playing == 0, "stopped");
    if (!seen_internal_off(60, slot)) {
        hx_dump_midi(h);
        fprintf(stderr, "FAIL: stop mid-gate on a chain route sent NO note-off to slot %d — the synth holds the note\n", slot);
        return 1;
    }
    HX_ASSERT(in->tracks[1].pfx.event_count == 0, "the rest of the queue is dropped");
    printf("  ok   — ⚠ stop mid-gate on a chain route sends the queued note-off NOW, not never\n");
    hx_destroy(h);
    printf("PASS: test_stop_mid_gate (1 check)\n");
    return 0;
}
