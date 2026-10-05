/* tests/test_count_in_releases_tarp.c — a note held through a count-in with the
 * TRACK ARP on is not left stuck when the count-in ends.
 *
 * THE BUG THIS PINS (2026-10-04 module review): the count-in exit reset the
 * TRACK ARP (sounding_active = 0) without a note-off. The arp's sounding note
 * stayed on at the instrument, its output refcount never fell back, so every
 * later arp hit on that pitch was dropped as "already sounding" and the final
 * note-off only brought the count down to 1: a stuck note until a panic.
 *
 * Observable: at the moment the count-in ends, the output's sounding count for
 * the held pitch equals what the arp is actually sounding (0 or 1). With the
 * bug it was one higher: the abandoned note was still counted. Checked at the
 * edge because the count-in starts RECORDING, and the recorded arp notes play
 * back later and would muddy any check made afterwards. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];

    inst->active_track = 1;
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    hx_set_param(h, "t1_tarp_style", "1");      /* Up; turns the arp on */
    HX_ASSERT(tr->tarp_on, "control: TRACK ARP on");
    /* Gate 200%: each arp note outlasts its step, so one is sounding as the
     * count-in ends (at 100% its gate runs out exactly on the edge, which hid
     * the bug in a first version of this test). */
    hx_set_param(h, "t1_tarp_gate", "200");
    HX_ASSERT(tr->tarp.gate_pct == 200, "control: arp gate 200%");

    { const uint8_t on[3] = { 0x90, 68, 100 }; hx_send_midi(h, on, 3, MOVE_MIDI_SOURCE_INTERNAL); }
    hx_set_param(h, "record_count_in", "1");
    HX_ASSERT(inst->count_in_ticks > 0, "control: count-in running");

    /* Through the count-in, one block at a time, until it ends. */
    int guard = 0, was_sounding = 0;
    while (inst->count_in_ticks > 0 && guard++ < 20000) {
        was_sounding = tr->tarp.sounding_active;
        hx_render(h, 1);
    }
    HX_ASSERT(inst->count_in_ticks == 0, "control: count-in ended");
    HX_ASSERT(was_sounding, "control: the arp was sounding as the count-in ended");
    (void)0;
    int rc = tr->pfx.pitch_refcount[60];
    int sounding = (tr->tarp.sounding_active && tr->tarp.sounding_pitch == 60) ? 1 : 0;
    if (rc != sounding) fprintf(stderr, "pitch 60: counted %d, arp sounding %d\n", rc, sounding);
    HX_ASSERT(rc == sounding, "the count-in end abandoned the arp's sounding note (still counted)");

    hx_destroy(h);
    printf("PASS: count_in_releases_tarp\n");
    return 0;
}
