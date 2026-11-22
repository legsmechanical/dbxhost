/* tests/test_stop_stops_looper.c — transport Stop stops the looper and
 * releases what it holds (ruled 2026-11-21). Before: only panic did; after
 * Stop the loop kept playing on the stopped-state clock. */
#include "harness.h"

static int seen, ons, offs;
static void count(void) {
    int n = hx_stub_event_count();
    for (; seen < n; seen++) {
        const hx_midi_event *e = hx_stub_event(seen);
        int st = e->bytes[1] & 0xF0;
        if (st == 0x90 && e->bytes[3] > 0) ons++;
        else if (st == 0x80 || (st == 0x90 && e->bytes[3] == 0)) offs++;
    }
}
static void run(hx_t *h, int blocks) { for (int i = 0; i < blocks; i++) { hx_render(h, 1); count(); } }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char k[64];
    for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_l%d_step_%d_toggle", s % 2, s); hx_set_param(h, k, "100"); }
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_8_toggle", "64 100");
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    run(h, 200);

    hx_set_param(h, "looper_sync", "0");
    for (int i = 0; i < 200 && (in->arp_master_tick % TICKS_PER_STEP) != TICKS_PER_STEP - 1; i++) run(h, 1);
    hx_set_param(h, "looper_arm", "48");
    for (int i = 0; i < 400 && in->looper_state != LOOPER_STATE_LOOPING; i++) run(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_LOOPING, "rig: the loop never started");
    ons = 0; run(h, 300);
    HX_ASSERT(ons >= 3, "control: the loop repeats while it runs");

    hx_set_param(h, "transport", "stop");
    HX_ASSERT(in->playing == 0, "control: stopped");
    HX_ASSERT(in->looper_state == LOOPER_STATE_IDLE, "Stop ended the looper");

    run(h, 20);                       /* the deferred release drains */
    hx_clear_capture(h); seen = 0; ons = 0; offs = 0;
    run(h, 600);
    HX_ASSERT(ons == 0, "nothing plays on after Stop");
    for (int t = 0; t < 2; t++)
        for (int p = 0; p < 128; p++)
            HX_ASSERT(in->tracks[t].pfx.pitch_refcount[p] == 0, "a note was left held after Stop");

    hx_destroy(h);
    printf("PASS: stop_stops_looper\n");
    return 0;
}
