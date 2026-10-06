/* tests/test_tarp_sync_off_fires_at_once.c — LIVE ARP with Sync off starts on
 * the press, not on the next grid line.
 *
 * THE BUG THIS PINS (2026-10-04 module review): with Sync off the first note
 * waited for (master tick − anchor) to be a multiple of the rate, and the
 * anchor is 0 at a press — the same test Sync ON makes. So "free" was the
 * grid: up to one whole rate interval of latency after the pads went down.
 * The field's own comment says 0 = "fires immediately". */
#include "harness.h"

static int wait_for_first_note(int sync, uint16_t *rate_out) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    inst->active_track = 1;
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    hx_set_param(h, "t1_tarp_style", "1");      /* Up; turns the arp on */
    hx_set_param(h, "t1_tarp_sync", sync ? "1" : "0");
    HX_ASSERT(tr->tarp_on && tr->tarp_sync == (sync ? 1 : 0), "rig: arp on, sync as asked");
    uint16_t rate = ARP_RATE_TICKS[tr->tarp.rate_idx];
    HX_ASSERT(rate >= 12, "rig: the default rate is too fine to measure a wait");
    *rate_out = rate;

    /* Press just AFTER a grid line: the worst case for a grid-bound start. */
    { int g = 0; while ((inst->arp_master_tick % rate) != 1 && g++ < 20000) hx_render(h, 1); }
    HX_ASSERT((inst->arp_master_tick % rate) == 1, "rig: could not reach one tick past a grid line");
    uint32_t pressed = inst->arp_master_tick;
    { const uint8_t on[3] = { 0x90, 68, 100 }; hx_send_midi(h, on, 3, MOVE_MIDI_SOURCE_INTERNAL); }
    { int g = 0; while (!tr->tarp.sounding_active && g++ < 20000) hx_render(h, 1); }
    HX_ASSERT(tr->tarp.sounding_active, "the arp never played");
    int waited = (int)(inst->arp_master_tick - pressed);
    hx_destroy(h);
    return waited;
}

int main(void) {
    uint16_t rate = 0;
    int on = wait_for_first_note(1, &rate);
    HX_ASSERT(on >= (int)rate - 4, "control: Sync ON waits for the next grid line");
    int off = wait_for_first_note(0, &rate);
    if (off > 2) {
        fprintf(stderr, "FAIL: Sync OFF waited %d ticks for its first note (rate %d, Sync ON waits %d)\n",
                off, (int)rate, on);
        return 1;
    }
    printf("PASS: tarp_sync_off_fires_at_once (sync on waits %d ticks, off %d)\n", on, off);
    return 0;
}
