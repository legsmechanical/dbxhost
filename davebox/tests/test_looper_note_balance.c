/* tests/test_looper_note_balance.c — Performance Mode's looper never strands a
 * note: every replayed note-on gets its note-off, every cycle.
 *
 * Josh, 2026-10-01: *"the repeats don't seem to be working right on drum tracks
 * specifically"* · *"on melodic tracks the repeats often create stuck notes"* ·
 * *"often times there's no repeating at all from drum tracks, just silence"*.
 *
 * Two holes, one symptom. (1) A note whose note-on fell inside the capture but
 * whose note-off fell at/after its end was captured on-only: every replay raised
 * the track output's per-pitch count and none lowered it, so after the first
 * replay that pitch was dropped for good — in THIS loop and every later one.
 * (2) At the capture→loop switch the notes still sounding had their note-offs
 * QUEUED, and the queue fired them into the loop's suppression: stuck.
 * Driven through render_block with a clip playing hits on every 16th. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

#define U "aaaaaaaa-2222-3333-4444-555555555555"
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
static void reset_counts(void) { memset(ons, 0, sizeof ons); memset(offs, 0, sizeof offs); }
static void run(hx_t *h, int blocks) { for (int i = 0; i < blocks; i++) { hx_render(h, 1); count(); } }

static hx_t *setup(int drum) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "state_load", U);
    char k[64];
    if (drum) {
        for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_l%d_step_%d_toggle", s % 2, s); hx_set_param(h, k, "100"); }
    } else {
        hx_set_param(h, "t0_pad_mode", "0");
        for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_c0_step_%d_toggle", s); hx_set_param(h, k, s % 2 ? "64 100" : "60 100"); }
    }
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_clear_capture(h); seen = 0; reset_counts();
    run(h, 200);
    return h;
}
static int loop_until_looping(hx_t *h, const char *ticks) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    hx_set_param(h, "looper_arm", ticks);
    for (int i = 0; i < 400 && in->looper_state != LOOPER_STATE_LOOPING; i++) run(h, 1);
    return in->looper_state == LOOPER_STATE_LOOPING;
}
static int refcount_sum(hx_t *h) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    int s = 0;
    for (int p = 0; p < 128; p++) s += in->tracks[0].pfx.pitch_refcount[p];
    return s;
}

int main(void) {
    int checks = 0;

    /* ---- control: a 1/8 drum loop (every note-off inside the capture) */
    {
        hx_t *h = setup(1);
        HX_ASSERT(loop_until_looping(h, "48"), "rig: the 48-tick loop never started");
        reset_counts(); run(h, 600);
        HX_ASSERT(ons[36] >= 5 && ons[37] >= 5, "control: a 1/8 drum loop repeats both hits");
        checks++;
        hx_destroy(h);
    }

    /* ---- (1) a 1/32 drum loop: the hit's note-off falls after the capture */
    {
        hx_t *h = setup(1);
        HX_ASSERT(loop_until_looping(h, "12"), "rig: the 12-tick loop never started");
        reset_counts(); run(h, 600);
        int hit = ons[36] > ons[37] ? 36 : 37;
        HX_ASSERT(ons[hit] >= 10, "a 1/32 drum loop played its hit once and went silent");
        HX_ASSERT(offs[hit] >= ons[hit] - 1, "a 1/32 drum loop's replays are not released");
        checks += 2;
        /* (3) the poisoning: a LONGER loop afterwards still plays every hit */
        hx_set_param(h, "looper_stop", "1");
        run(h, 100);
        HX_ASSERT(refcount_sum(h) == 0, "the looper left notes counted as sounding after it stopped");
        HX_ASSERT(loop_until_looping(h, "48"), "rig: the second loop never started");
        reset_counts(); run(h, 600);
        HX_ASSERT(ons[36] >= 5 && ons[37] >= 5,
                  "after a 1/32 loop, a 1/8 loop lost a drum sound (poisoned)");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- (2) a 1/32 melodic loop: the live note at the switch is released, and replays repeat */
    {
        hx_t *h = setup(0);
        HX_ASSERT(loop_until_looping(h, "12"), "rig: the 12-tick loop never started");
        reset_counts(); run(h, 600);
        int p = ons[60] > ons[64] ? 60 : 64;
        HX_ASSERT(ons[p] >= 10, "a 1/32 melodic loop never replayed its note");
        hx_set_param(h, "looper_stop", "1");
        run(h, 2);                                    /* the drain; transport still running */
        HX_ASSERT(refcount_sum(h) == 0, "a melodic note was left sounding (stuck) after the looper stopped");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- a live PAD held across the switch (released mid-loop) */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "state_load", U);
        hx_set_param(h, "t1_padmap", "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
        hx_set_param(h, "transport", "play");
        run(h, 50);
        hx_clear_capture(h); seen = 0; reset_counts();
        hx_set_param(h, "looper_arm", "96");
        int pressed = 0, loopb = -1;
        for (int b = 0; b < 1200; b++) {
            if (in->looper_state == LOOPER_STATE_CAPTURING && in->looper_pos > 60 && !pressed) {
                uint8_t m[3] = { 0x90, 68, 100 }; hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL); pressed = 1;
            }
            int s0 = in->looper_state; run(h, 1);
            if (s0 != in->looper_state && in->looper_state == LOOPER_STATE_LOOPING) loopb = b;
            if (loopb >= 0 && b == loopb + 40) { uint8_t m[3] = { 0x80, 68, 0 }; hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL); }
        }
        HX_ASSERT(pressed && loopb >= 0, "rig: the pad was not pressed in the capture");
        int p = -1; for (int q = 0; q < 128; q++) if (ons[q]) p = q;
        HX_ASSERT(p >= 0 && ons[p] >= 3, "a pad held across the switch never replayed");
        hx_set_param(h, "looper_stop", "1"); run(h, 100);
        HX_ASSERT(in->tracks[1].pfx.pitch_refcount[p] == 0 && offs[p] >= ons[p], "the held pad's note stuck");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- a SEQ ARP track replays (its replay used to feed back into the arp) */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "state_load", U);
        hx_set_param(h, "t0_pad_mode", "0");
        char k[64];
        for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_c0_step_%d_toggle", s); hx_set_param(h, k, s % 2 ? "64 100" : "60 100"); }
        hx_set_param(h, "t0_seq_arp_style", "1");
        hx_set_param(h, "t0_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        hx_clear_capture(h); seen = 0; reset_counts();
        run(h, 200);
        HX_ASSERT(loop_until_looping(h, "96"), "rig: the arp loop never started");
        reset_counts(); run(h, 600);
        HX_ASSERT(ons[60] + ons[64] >= 4, "a SEQ ARP track replayed nothing while looping");
        hx_set_param(h, "looper_stop", "1"); run(h, 2);
        HX_ASSERT(refcount_sum(h) == 0, "a SEQ ARP note stuck after the loop");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- long gates (400%): every note-off falls far outside a 1/4 capture */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "state_load", U);
        hx_set_param(h, "t0_pad_mode", "0");
        char k[64];
        for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_c0_step_%d_toggle", s); hx_set_param(h, k, s % 2 ? "64 100" : "60 100"); }
        hx_set_param(h, "t0_noteFX_gate", "400");
        hx_set_param(h, "t0_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        hx_clear_capture(h); seen = 0; reset_counts();
        run(h, 200);
        HX_ASSERT(loop_until_looping(h, "96"), "rig: the long-gate loop never started");
        reset_counts(); run(h, 600);
        HX_ASSERT(ons[60] >= 3 && ons[64] >= 3, "long-gate notes did not re-articulate in the loop");
        hx_set_param(h, "looper_stop", "1"); run(h, 2);
        HX_ASSERT(refcount_sum(h) == 0, "a long-gate note stuck after the loop");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- Legato switched on mid-loop, then Phantom, then stop: nothing stuck */
    {
        hx_t *h = setup(0);
        HX_ASSERT(loop_until_looping(h, "48"), "rig: the loop never started");
        run(h, 37);                                   /* mid-note */
        char k[32];
        snprintf(k, sizeof k, "%u", (unsigned)PERF_MOD_LEGATO);  hx_set_param(h, "perf_mods", k);
        run(h, 300);
        snprintf(k, sizeof k, "%u", (unsigned)PERF_MOD_PHANTOM); hx_set_param(h, "perf_mods", k);
        run(h, 300);
        hx_set_param(h, "looper_stop", "1"); hx_set_param(h, "perf_mods", "0");
        run(h, 2);
        HX_ASSERT(refcount_sum(h) == 0, "a Legato/Phantom note stuck after the loop");
        for (int q = 0; q < 128; q++)
            HX_ASSERT(offs[q] >= ons[q], "a note-on with no note-off (Legato/Phantom)");
        checks += 2;
        hx_destroy(h);
    }

    /* ---- the same pitch overlapping itself (400% gate, one pitch every step) */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "state_load", U);
        hx_set_param(h, "t0_pad_mode", "0");
        char k[64];
        for (int s = 0; s < 16; s++) { snprintf(k, sizeof k, "t0_c0_step_%d_toggle", s); hx_set_param(h, k, "60 100"); }
        hx_set_param(h, "t0_noteFX_gate", "400");
        hx_set_param(h, "t0_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        hx_clear_capture(h); seen = 0; reset_counts();
        run(h, 200);
        HX_ASSERT(loop_until_looping(h, "96"), "rig: the overlap loop never started");
        run(h, 400);
        hx_set_param(h, "looper_stop", "1"); run(h, 2);
        HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[0].pfx.pitch_refcount[60] == 0,
                  "an overlapping same-pitch note stayed counted after the looper stopped");
        checks++;
        hx_destroy(h);
    }

    printf("PASS: test_looper_note_balance (%d checks)\n", checks);
    return 0;
}
