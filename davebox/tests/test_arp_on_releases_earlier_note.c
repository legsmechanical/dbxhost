/* tests/test_arp_on_releases_earlier_note.c — a note that started before SEQ
 * ARP came on still ends.
 *
 * Found recording the tutorials (2026-10-16): turning SEQ ARP's style from Off
 * to Up while the lead was playing left a B-flat sounding for 14 s, until the
 * effects were reset. The note went out while the arp was off; its note-off
 * then reached pfx_send with the arp on, which captures every note-off for the
 * arp's held buffer — so the off never left, and the note hung.
 *
 * Hold a pad with the arp off, turn the arp on, let go: the output must end
 * the note. Controls: the same gesture with the arp left off ends it (the rig
 * sees note-offs at all), and a pad pressed after the arp came on is
 * arpeggiated and ends too. */
#include "harness.h"

/* Notes left sounding on the output after the gesture. `arp_on_mid` turns
 * the arp on while the pad is held; `arp_on_first` turns it on before. */
static int run(int arp_on_first, int arp_on_mid, int play, int *ons_out) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    if (arp_on_first) hx_set_param(h, "t1_seq_arp_style", "1");
    if (play) hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 200);
    hx_clear_capture(h);
    uint8_t on[3] = { 0x90, 72, 100 }, off[3] = { 0x80, 72, 0 };
    hx_send_midi(h, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    hx_render(h, 300);
    if (arp_on_mid) hx_set_param(h, "t1_seq_arp_style", "1");
    hx_render(h, 600);
    hx_send_midi(h, off, 3, MOVE_MIDI_SOURCE_INTERNAL);
    hx_render(h, 600);

    int sounding[128] = { 0 }, ons = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0, p = e->bytes[2] & 0x7F;
        if (st == 0x90 && e->bytes[3] > 0) { sounding[p]++; ons++; }
        else if ((st == 0x80 || st == 0x90) && sounding[p] > 0) sounding[p]--;
    }
    int left = 0;
    for (int p = 0; p < 128; p++) left += sounding[p];
    *ons_out = ons;
    hx_destroy(h);
    return left;
}

int main(void) {
    int checked = 0;
    for (int play = 0; play < 2; play++) {
        int ons = 0;
        /* control: no arp at all — the pad's note goes out and ends */
        int left = run(0, 0, play, &ons);
        HX_ASSERT(ons >= 1, "rig: the pad sent nothing to the output");
        HX_ASSERT(left == 0, "rig: with the arp off the note did not end");
        /* control: the arp on before the pad — arpeggiated, and it all ends */
        left = run(1, 0, play, &ons);
        if (left) {
            fprintf(stderr, "FAIL: arp on before the pad (%s): %d note(s) left sounding\n",
                    play ? "playing" : "stopped", left);
            return 1;
        }
        /* the bug: the arp comes on while the note sounds */
        left = run(0, 1, play, &ons);
        if (left) {
            fprintf(stderr, "FAIL: arp turned on while a note sounded (%s): %d note(s) left sounding\n",
                    play ? "playing" : "stopped", left);
            return 1;
        }
        checked += 3;
    }
    printf("PASS: test_arp_on_releases_earlier_note (%d cases, stopped and playing)\n", checked);
    return 0;
}
