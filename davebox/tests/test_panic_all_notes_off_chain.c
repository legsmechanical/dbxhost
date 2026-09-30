/* tests/test_panic_all_notes_off_chain.c — a transport stop sends All Notes Off
 * (CC 123) on every channel to EVERY chain slot a track plays into.
 *
 * Josh, 2026-09-30: a dspreset voice on track 4 stuck after a clip stop and
 * "Kept sounding after transport stop" — the 2,048-note-off panic sweep reached
 * that slot and the module held the voice anyway. Per-note offs cannot free a
 * voice the module holds for its own reasons (a latched sustain, a voice no
 * longer keyed to its note); CC 123 releases every voice it has. The note-off
 * sweep still reaches only the route's representative slot and slots with a
 * note counted as sounding, because it is 2,048 messages; CC 123 is 16, so it
 * goes to every routed slot, and the Move route is still never sent it (it
 * corrupts Move's voice allocator — see send_panic). */
#include "harness.h"
#include <stdio.h>

static int cc123_to_slot(int slot) {
    int chans = 0;
    for (int ch = 0; ch < 16; ch++)
        for (int i = 0; i < hx_stub_event_count(); i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_INTERNAL && e->slot == slot &&
                e->bytes[1] == (uint8_t)(0xB0 | ch) && e->bytes[2] == 123) { chans++; break; }
        }
    return chans;
}
static int cc123_to_move(void) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0xB0 && e->bytes[2] == 123) n++;
    }
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    /* Tracks 1-4 on Move, 5-8 on their own chain slots (the defaults). Track 6
     * has a note, so its slot is counted as sounding; 7 and 8 have none. */
    hx_set_param(h, "t5_c0_step_0_toggle", "60 100");
    hx_set_param(h, "transport", "play_focus:5:0");
    hx_render(h, 20);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(in->playing == 0, "stopped");
    int checks = 1;
    for (int t = 4; t < 8; t++) {
        int slot = (int)in->tracks[t].pfx.slot;
        int n = cc123_to_slot(slot);
        if (n != 16) {
            hx_dump_midi(h);
            fprintf(stderr, "FAIL: track %d's chain slot %d got CC 123 on %d of 16 channels\n", t + 1, slot, n);
            return 1;
        }
        checks++;
    }
    HX_ASSERT(cc123_to_move() == 0, "CC 123 reached the Move route — it corrupts Move's voice allocator");
    checks++;
    hx_destroy(h);
    printf("PASS: test_panic_all_notes_off_chain (%d checks)\n", checks);
    return 0;
}
