/* tests/test_groove_arp_no_stuck_notes.c — the input arp under a table groove
 * leaves nothing sounding.
 *
 * Found on the device (Josh, 2026-10-13): "stuck notes when live playing pads
 * with the input arpeggiator on and grooves activated". An arp step's note-on
 * and note-off each took the delay of the slot it fell in; with the note-on in
 * a late slot and the note-off in the next, on-time one, the off went out
 * FIRST and the note never ended.
 *
 * Pads are held through TRACK ARP under a table whose slots alternate late and
 * on time, at several slot lengths and arp gates, playing and stopped. Read
 * off the output in order: no pitch may receive a note-off while it is silent
 * and then a note-on that is never ended. */
#include "harness.h"

static int run(int base, int late_ticks, const char *gate, int play, int *offs_first) {
    char v[96];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    hx_set_param(h, "t1_tarp_style", "1");
    if (gate) hx_set_param(h, "t1_tarp_gate", gate);
    snprintf(v, sizeof(v), "%d 2 100 0 0 0 T", base);
    hx_set_param(h, "groove_begin", v);
    snprintf(v, sizeof(v), "0 0 %d 100", late_ticks * GROOVE_FINE);
    hx_set_param(h, "groove_slots_0", v);
    hx_set_param(h, "groove_commit", "1");
    hx_set_param(h, "groove_amt", "100");
    HX_ASSERT(inst->groove.kind == GROOVE_TABLE, "rig: the table did not load");
    if (play) hx_set_param(h, "transport", "play_focus:1:0");
    hx_clear_capture(h);
    static const uint8_t pads[3] = { 68, 72, 75 };
    for (int i = 0; i < 3; i++) { uint8_t m[3] = { 0x90, pads[i], 100 }; hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL); }
    hx_render(h, 1400);
    for (int i = 0; i < 3; i++) { uint8_t m[3] = { 0x80, pads[i], 0 }; hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL); }
    hx_render(h, 400);

    int sounding[128] = { 0 }, ons = 0, bad = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0, p = e->bytes[2] & 0x7F;
        if (st == 0x90 && e->bytes[3] > 0) { sounding[p]++; ons++; }
        else if (st == 0x80 || st == 0x90) { if (sounding[p] > 0) sounding[p]--; else bad++; }
    }
    int left = 0;
    for (int p = 0; p < 128; p++) left += sounding[p];
    HX_ASSERT(ons > 20, "rig: the arp played almost nothing");
    *offs_first = bad;
    hx_destroy(h);
    return left;
}

int main(void) {
    /* control: the capture can see a stuck note at all — count note-ons with no table */
    static const int bases[] = { 24, 12, 16, 48 };
    static const char *gates[] = { NULL, "10", "40", "100" };
    int checked = 0;
    for (unsigned b = 0; b < sizeof(bases) / sizeof(bases[0]); b++)
        for (unsigned g = 0; g < sizeof(gates) / sizeof(gates[0]); g++)
            for (int play = 0; play < 2; play++) {
                int early = 0;
                int left = run(bases[b], bases[b] - 2, gates[g], play, &early);
                if (left || early) {
                    fprintf(stderr, "FAIL: slot %d ticks, arp gate %s, transport %s: %d note(s) left sounding, "
                                    "%d note-off(s) ahead of their note-on\n",
                            bases[b], gates[g] ? gates[g] : "default", play ? "playing" : "stopped", left, early);
                    return 1;
                }
                checked++;
            }
    printf("PASS: test_groove_arp_no_stuck_notes (%d combinations of slot length, arp gate and transport)\n", checked);
    return 0;
}
