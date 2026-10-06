/* tests/test_project_load_stops_looper.c — loading a project ends a running
 * Performance Mode loop.
 *
 * THE BUG THIS PINS (2026-10-04 module review): state_load reset the tracks,
 * the transport and the capture state but left the global MIDI looper in
 * LOOPING with its captured events — so the previous project's loop went on
 * playing over the one just opened, into routes that had just been reset. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

#define FRESH_UUID "11111111-2222-3333-4444-555555555555"

static int seen, ons;
static void count(void) {
    int n = hx_stub_event_count();
    for (; seen < n; seen++) {
        const hx_midi_event *e = hx_stub_event(seen);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) ons++;
    }
}
static void run(hx_t *h, int blocks) { for (int i = 0; i < blocks; i++) { hx_render(h, 1); count(); } }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char k[64];
    for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_l%d_step_%d_toggle", s % 2, s); hx_set_param(h, k, "100"); }
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    run(h, 200);

    /* Arm on a step boundary with sync off (see test_looper_note_balance). */
    hx_set_param(h, "looper_sync", "0");
    for (int i = 0; i < 200 && (in->arp_master_tick % TICKS_PER_STEP) != TICKS_PER_STEP - 1; i++) run(h, 1);
    hx_set_param(h, "looper_arm", "48");
    for (int i = 0; i < 400 && in->looper_state != LOOPER_STATE_LOOPING; i++) run(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_LOOPING, "rig: the loop never started");
    ons = 0; run(h, 600);
    HX_ASSERT(ons >= 5, "control: the loop repeats its hits while it runs");

    hx_set_param(h, "state_load", FRESH_UUID);
    HX_ASSERT(in->playing == 0, "control: the load stopped the transport");
    HX_ASSERT(in->looper_state == LOOPER_STATE_IDLE, "the looper was still running after the load");
    HX_ASSERT(in->looper_event_count == 0, "the previous project's captured loop survived the load");

    hx_clear_capture(h); seen = 0; ons = 0;
    run(h, 600);
    HX_ASSERT(ons == 0, "the previous project's loop played on in the new one");
    for (int p = 0; p < 128; p++)
        HX_ASSERT(in->tracks[0].pfx.pitch_refcount[p] == 0, "a note count was left behind after the load");

    hx_destroy(h);
    printf("PASS: project_load_stops_looper\n");
    return 0;
}
