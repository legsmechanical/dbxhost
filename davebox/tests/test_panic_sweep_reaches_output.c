/* tests/test_panic_sweep_reaches_output.c — the panic's note-off sweep reaches
 * the instrument, whatever the clip's play effects are doing.
 *
 * THE BUG THIS PINS (2026-10-04 review): send_panic swept 16x128 note-offs into
 * the Schwung slot through pfx_send. With SEQ ARP on, pfx_send diverts every
 * note-off into the arp's held list, so NOTHING was emitted; under swing, the
 * offs were parked in a 256-slot queue (2048 offs, most dropped) instead of
 * sent. The CC 123 beside it already went straight out (pfx_emit). */
#include "harness.h"

static int count_note_offs(void) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0;
        if (st == 0x80 || (st == 0x90 && e->bytes[3] == 0)) n++;
    }
    return n;
}

static int panic_offs(void (*setup)(hx_t *)) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    for (int t = 0; t < 8; t++) { char k[24]; snprintf(k, sizeof(k), "t%d_route", t); hx_set_param(h, k, "move"); }
    hx_set_param(h, "t1_route", "schwung");
    if (setup) setup(h);
    hx_stub_reset_capture();
    hx_set_param(h, "transport", "panic");   /* counted BEFORE any render: sent, not queued */
    int n = count_note_offs();
    hx_destroy(h);
    return n;
}
static void with_seq_arp(hx_t *h) { hx_set_param(h, "t1_seq_arp_style", "1"); }
static void with_swing(hx_t *h)   { hx_set_param(h, "swing_amt", "60"); }

int main(void) {
    int plain = panic_offs(NULL);
    HX_ASSERT(plain >= 16 * 128, "control: a plain panic sweeps the Schwung slot");
    int arp = panic_offs(with_seq_arp);
    HX_ASSERT(arp >= 16 * 128, "with SEQ ARP on, the panic sweep's note-offs were swallowed by the arp");
    int sw = panic_offs(with_swing);
    HX_ASSERT(sw >= 16 * 128, "under swing, the panic sweep's note-offs were queued instead of sent");
    printf("PASS: panic_sweep_reaches_output (%d / %d / %d)\n", plain, arp, sw);
    return 0;
}
