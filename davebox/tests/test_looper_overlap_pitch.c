/* tests/test_looper_overlap_pitch.c — a repeat over notes that overlap their
 * own pitch keeps re-articulating them; nothing sticks.
 *
 * The looper's pitch table holds ONE output pitch per raw pitch. A MIDI DLY
 * echo landing on its own still-sounding note gave that raw pitch two notes:
 * the first note-off cleared the entry, the second was then untracked and the
 * replay dropped it, so the output pitch stayed counted — every later replay of
 * it was dropped as "already sounding" (stuck, then silent). With a pitch mod on
 * the same happened at the MOVED pitch. Found 2026-10-02. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

static int seen;
static int ons[128], offs[128];
static void count(void) {
    int n = hx_stub_event_count();
    for (; seen < n; seen++) {
        const hx_midi_event *e = hx_stub_event(seen);
        int st = e->bytes[1] & 0xF0, d1 = e->bytes[2], d2 = e->bytes[3];
        if (st == 0x90 && d2 > 0) ons[d1]++;
        else if (st == 0x80 || (st == 0x90 && d2 == 0)) offs[d1]++;
    }
}
static void run(hx_t *h, int blocks) { for (int i = 0; i < blocks; i++) { hx_render(h, 1); count(); } }

static int case_run(uint32_t mods, int moved) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char k[64];
    hx_set_param(h, "t0_pad_mode", "0");
    snprintf(k, sizeof k, "t0_c0_step_0_toggle"); hx_set_param(h, k, "60 100");
    hx_set_param(h, "t0_noteFX_gate", "400");
    hx_set_param(h, "t0_c0_pfx_set", "delay_level 100");
    hx_set_param(h, "t0_c0_pfx_set", "delay_repeats 3");
    hx_set_param(h, "t0_c0_pfx_set", "delay_time 3");
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_clear_capture(h); seen = 0;
    run(h, 50);
    snprintf(k, sizeof k, "%u", (unsigned)mods); hx_set_param(h, "perf_mods", k);
    hx_set_param(h, "looper_sync", "0");
    for (int i = 0; i < 400 && (in->arp_master_tick % 384) != 383; i++) run(h, 1);
    hx_set_param(h, "looper_arm", "192");
    for (int i = 0; i < 1000 && in->looper_state != LOOPER_STATE_LOOPING; i++) run(h, 1);
    HX_ASSERT(in->looper_state == LOOPER_STATE_LOOPING, "rig: the loop never started");
    run(h, 400);
    memset(ons, 0, sizeof ons); memset(offs, 0, sizeof offs);
    run(h, 1400);                                   /* several loops */
    int p = moved ? 72 : 60;
    char msg[160];
    snprintf(msg, sizeof msg, "%s: the repeat stopped re-articulating pitch %d (stuck): %d ons",
             mods ? "Oct Up" : "no mods", p, ons[p]);
    HX_ASSERT(ons[p] >= 4, msg);
    int m = 0; for (int q = 0; q < 128; q++) if (in->tracks[0].pfx.pitch_refcount[q] > m) m = in->tracks[0].pfx.pitch_refcount[q];
    HX_ASSERT(m <= 1, "a pitch's count accumulated while looping");
    hx_destroy(h);
    return 2;
}

int main(void) {
    int checks = 0;
    checks += case_run(0, 0);
    checks += case_run(PERF_MOD_OCT_UP, 1);
    printf("PASS: test_looper_overlap_pitch (%d checks)\n", checks);
    return 0;
}
