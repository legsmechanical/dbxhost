/* tests/test_stop_sweep_is_narrow.c — a transport STOP does not flood the
 * instrument with note-offs.
 *
 * MEASURED ON THE DEVICE (2026-10-06): every Stop took 1.3–1.45 ms inside one
 * set_param on the audio thread, against a 0.9 ms frame budget — the panic
 * routine sending 128 note-offs on all 16 MIDI channels into the chain slot
 * (2,048 synth calls), and again for every other slot with a note sounding.
 *
 * Now a stop sweeps only the channels the tracks playing into that slot send
 * on, and still sends All Notes Off on all 16. The PANIC gesture keeps the
 * full sweep (tests/test_panic_sweep_reaches_output.c). */
#include "harness.h"
#include <stdio.h>
#include <string.h>

static int offs_on(int ch) {          /* ch < 0: any channel */
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL) continue;
        int st = e->bytes[1] & 0xF0;
        if (!(st == 0x80 || (st == 0x90 && e->bytes[3] == 0))) continue;
        if (ch < 0 || (e->bytes[1] & 0x0F) == ch) n++;
    }
    return n;
}
static int cc123_channels(void) {
    unsigned m = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0xB0 && e->bytes[2] == 123)
            m |= 1u << (e->bytes[1] & 0x0F);
    }
    int n = 0; for (int i = 0; i < 16; i++) if (m & (1u << i)) n++;
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    for (int t = 0; t < 8; t++) { char k[24]; snprintf(k, sizeof(k), "t%d_route", t); hx_set_param(h, k, "move"); }
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    int ch = I->tracks[1].channel & 0x0F;

    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 200);
    hx_stub_reset_capture();
    hx_set_param(h, "transport", "stop");
    int all = offs_on(-1), mine = offs_on(ch);
    if (all > 2 * 128) {
        fprintf(stderr, "FAIL: a transport stop sent %d note-offs into the slot — the 16-channel sweep is back "
                        "(1.4 ms in one audio frame on the device)\n", all);
        return 1;
    }
    HX_ASSERT(mine >= 128, "the stop no longer sweeps the track's OWN channel — a stuck note would survive");
    HX_ASSERT(all == mine, "the stop swept a channel no track sends on");
    HX_ASSERT(cc123_channels() == 16, "All Notes Off no longer goes to all 16 channels on stop");
    printf("  ok   — Stop: %d note-offs, all on the track's channel; All Notes Off on 16 channels\n", all);

    /* control: the PANIC gesture still sweeps everything */
    hx_stub_reset_capture();
    hx_set_param(h, "transport", "panic");
    HX_ASSERT(offs_on(-1) >= 16 * 128, "control: the panic gesture lost its full sweep");
    printf("  ok   — control: the panic gesture still sends %d\n", offs_on(-1));
    hx_destroy(h);
    printf("PASS test_stop_sweep_is_narrow\n");
    return 0;
}
