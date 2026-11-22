/* tests/test_looper_out_of_order.c — the looper replays every captured event
 * once per cycle, even when events arrive out of order. Replay walks the
 * buffer in order and fires only events whose tick equals the position; a live
 * note is stepped back by the output lead, so one played just after a captured
 * sequenced note was stored EARLIER than it, the walk passed its tick, and the
 * rest of every cycle went silent. A live note in the first lead's worth of a
 * capture wrapped to the loop's end (its note-off then near the start). */
#include "harness.h"

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
    for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t1_c0_step_%d_toggle", s); hx_set_param(h, k, "60 100"); }
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    run(h, 100);
    HX_ASSERT(lead_ticks(in) > 0, "control: there is an output lead to step back by");

    hx_set_param(h, "looper_sync", "0");
    hx_set_param(h, "looper_arm", "96");
    /* (b) a live note at the very start of the capture: stored at 0, not at the end. */
    for (int i = 0; i < 400 && !(in->looper_state == LOOPER_STATE_CAPTURING); i++) run(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_CAPTURING, "rig: never capturing");
    HX_ASSERT(in->looper_pos < (uint32_t)lead_ticks(in), "rig: missed the capture's first lead window");
    live_note_on(in, &in->tracks[1], 72, 90);
    {   int found = -1;
        for (int e = 0; e < (int)in->looper_event_count; e++)
            if (in->looper_events[e].d1 == 72 && (in->looper_events[e].status & 0xF0) == 0x90) found = e;
        HX_ASSERT(found >= 0, "rig: the live note was not captured");
        HX_ASSERT(in->looper_events[found].tick <= in->looper_pos,
                  "a live note at the capture's start is clamped to its start, not wrapped to the end");
    }
    run(h, 3);
    live_note_off(in, &in->tracks[1], 72);

    /* (a) a live note right after a captured sequenced note-on. */
    for (int i = 0; i < 400; i++) {
        run(h, 1);
        int n = (int)in->looper_event_count;
        if (in->looper_state == LOOPER_STATE_CAPTURING && n > 0 && in->looper_events[n - 1].tick == (uint16_t)in->looper_pos
                && in->looper_pos > 20) break;
    }
    live_note_on(in, &in->tracks[1], 74, 90);
    run(h, 3);
    live_note_off(in, &in->tracks[1], 74);
    for (int e = 1; e < (int)in->looper_event_count; e++)
        HX_ASSERT(in->looper_events[e].tick >= in->looper_events[e - 1].tick, "the captured buffer is sorted by tick");

    for (int i = 0; i < 800 && in->looper_state != LOOPER_STATE_LOOPING; i++) run(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_LOOPING, "rig: the loop never started");
    int cap_ons = 0;
    for (int e = 0; e < (int)in->looper_event_count; e++)
        if ((in->looper_events[e].status & 0xF0) == 0x90 && in->looper_events[e].d2 > 0) cap_ons++;
    HX_ASSERT(cap_ons >= 4, "rig: too few captured notes");
    /* Three loop lengths (96 ticks each) of blocks: every cycle replays its notes. */
    uint32_t start_tick = in->arp_master_tick;
    ons = 0;
    while (in->arp_master_tick - start_tick < 3u * 96u * 5u) run(h, 1);
    HX_ASSERT(ons >= 2 * cap_ons, "every cycle replays all its notes (no stall)");

    hx_destroy(h);
    printf("PASS: looper_out_of_order\n");
    return 0;
}
