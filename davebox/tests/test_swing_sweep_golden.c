/* tests/test_swing_sweep_golden.c — WHEN every swung event is emitted, for
 * every swing_amt x swing_res at two tempos, frozen as one hash per setting.
 *
 * The byte-only goldens (test_engine_goldens.c) cannot see swing at all: it is
 * a sample-domain delay and does not reorder single notes. This capture
 * carries the render BLOCK each packet left in (hx_midi_event.block), and a
 * block is the engine's emission granularity, so a swing delay that moves by a
 * block or more changes the hash. It is the control for any change that claims
 * to leave swing timing alone.
 *
 * One line per setting: "amt res bpm events hash stopped-events stopped-hash". A hash, not the events: 404
 * settings x a few hundred events each would be megabytes of golden nobody
 * reads. To see WHAT moved, run with SWING_SWEEP_DUMP="amt res bpm" and diff
 * the two dumps.
 *
 * The pattern is built to put a swung event on every path that swings:
 *   track 1 (melodic)  a note on every 1/16 step, gates cycling 12 / 24 / 36
 *                      ticks, so note-offs land in the same step, the next
 *                      one and the one after; step 15's gate crosses the loop
 *                      wrap
 *   track 0 (drum)     lane 0 on every 1/16 step (the drum lanes' own queue)
 *   track 2 (melodic)  one off-beat note with three MIDI-delay echoes (swing
 *                      by fire time)
 *   track 3 (melodic)  a held chord through SEQ ARP (generated notes)
 * Three bars, so the wrap is crossed twice. Deterministic by construction: no
 * random, iter or ratchet steps, arp style Up.
 *
 * ...and a second capture per setting with the transport STOPPED: TRACK ARP
 * over held pads runs on the free clock, and swing there is computed by a
 * twin of the playing code (seq8_render.c, the stopped branch). A mutation of
 * that twin survived the playing capture alone.
 *
 * Regenerate deliberately with UPDATE_GOLDENS=1 — and say why in the commit. */
#include "harness.h"

#define SWEEP_GOLDEN "tests/goldens/swing_sweep.txt"

static int is_slot_transport(const hx_midi_event *e) {
    return e->kind == HX_MIDI_INTERNAL && e->bytes[0] == 0x0F && e->bytes[1] >= 0xF8;
}

/* Blocks in three bars at `bpm`, plus a little: 12 beats of 44100 Hz audio in
 * 128-frame blocks. */
static int three_bars(int bpm) {
    return (int)(12.0 * 60.0 / (double)bpm * (double)MOVE_SAMPLE_RATE / (double)MOVE_FRAMES_PER_BLOCK) + 40;
}

static void arm(hx_t *h, int t) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[t];
    /* What transport's play_focus does for its one track, for the others. */
    tr->active_clip = 0;
    tr->queued_clip = -1;
    tr->will_relaunch = 1;
    pfx_sync_from_clip(tr);
}

/* Run one setting; returns the event count and the hash through *hash. With
 * `dump` set, prints every event instead. */
static int run_setting(int amt, int res, int bpm, uint64_t *hash, FILE *dump) {
    static const int gates[3] = { 12, 24, 36 };
    char k[48], v[48];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");

    snprintf(v, sizeof(v), "%d", bpm);  hx_set_param(h, "bpm", v);
    hx_set_bpm(h, (float)bpm);
    snprintf(v, sizeof(v), "%d", amt);  hx_set_param(h, "swing_amt", v);
    snprintf(v, sizeof(v), "%d", res);  hx_set_param(h, "swing_res", v);

    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        snprintf(v, sizeof(v), "%d", gates[s % 3]);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t0_l0_step_%d_toggle", s);
        hx_set_param(h, k, "100");
    }
    hx_set_param(h, "t2_c0_step_3_toggle", "72 100");
    hx_set_param(h, "t2_c0_pfx_set", "delay_level 100");
    hx_set_param(h, "t2_c0_pfx_set", "delay_repeats 3");
    hx_set_param(h, "t2_c0_pfx_set", "delay_time 3");
    hx_set_param(h, "t3_c0_step_0_add",  "84 0 100 88 0 100 91 0 100");
    hx_set_param(h, "t3_c0_step_0_gate", "384");
    hx_set_param(h, "t3_c0_pfx_set",     "seq_arp_style 1");

    arm(h, 0); arm(h, 2); arm(h, 3);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, three_bars(bpm));

    /* FNV-1a over (block, kind, the four packet bytes) of every event that is
     * not slot transport. */
    uint64_t hsh = 1469598103934665603ULL;
    int n = 0;
    int total = hx_stub_event_count();
    HX_ASSERT(total < 8000, "the capture is full — events were dropped, the hash means nothing");
    for (int i = 0; i < total; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (is_slot_transport(e)) continue;
        uint8_t rec[9];
        rec[0] = (uint8_t)(e->block & 0xFF); rec[1] = (uint8_t)((e->block >> 8) & 0xFF);
        rec[2] = (uint8_t)((e->block >> 16) & 0xFF); rec[3] = (uint8_t)((e->block >> 24) & 0xFF);
        rec[4] = (uint8_t)e->kind;
        memcpy(rec + 5, e->bytes, 4);
        for (int b = 0; b < 9; b++) { hsh ^= rec[b]; hsh *= 1099511628211ULL; }
        if (dump) fprintf(dump, "%5d %d %02X %02X %02X %02X\n", e->block, (int)e->kind,
                          e->bytes[0], e->bytes[1], e->bytes[2], e->bytes[3]);
        n++;
    }
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    *hash = hsh;
    return n;
}

/* TRACK ARP over three held pads, transport stopped. */
static int run_stopped(int amt, int res, int bpm, uint64_t *hash, FILE *dump) {
    char v[48];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    snprintf(v, sizeof(v), "%d", bpm);  hx_set_param(h, "bpm", v);
    hx_set_bpm(h, (float)bpm);
    snprintf(v, sizeof(v), "%d", amt);  hx_set_param(h, "swing_amt", v);
    snprintf(v, sizeof(v), "%d", res);  hx_set_param(h, "swing_res", v);
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    hx_set_param(h, "t1_tarp_style", "1");
    static const uint8_t pads[3] = { 68, 72, 75 };
    for (int i = 0; i < 3; i++) {
        uint8_t m[3] = { 0x90, pads[i], 100 };
        hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
    }
    hx_clear_capture(h);
    hx_render(h, 700);

    uint64_t hsh = 1469598103934665603ULL;
    int n = 0, total = hx_stub_event_count();
    HX_ASSERT(total < 8000, "the capture is full — events were dropped, the hash means nothing");
    for (int i = 0; i < total; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (is_slot_transport(e)) continue;
        uint8_t rec[9];
        rec[0] = (uint8_t)(e->block & 0xFF); rec[1] = (uint8_t)((e->block >> 8) & 0xFF);
        rec[2] = (uint8_t)((e->block >> 16) & 0xFF); rec[3] = (uint8_t)((e->block >> 24) & 0xFF);
        rec[4] = (uint8_t)e->kind;
        memcpy(rec + 5, e->bytes, 4);
        for (int b = 0; b < 9; b++) { hsh ^= rec[b]; hsh *= 1099511628211ULL; }
        if (dump) fprintf(dump, "%5d %d %02X %02X %02X %02X\n", e->block, (int)e->kind,
                          e->bytes[0], e->bytes[1], e->bytes[2], e->bytes[3]);
        n++;
    }
    hx_destroy(h);
    *hash = hsh;
    return n;
}

int main(void) {
    static const int bpms[2] = { 120, 97 };   /* 97: a non-integer samples-per-tick */
    const char *one = getenv("SWING_SWEEP_DUMP");
    if (one) {
        int amt = 0, res = 0, bpm = 120; uint64_t hsh;
        HX_ASSERT(sscanf(one, "%d %d %d", &amt, &res, &bpm) == 3, "SWING_SWEEP_DUMP wants \"amt res bpm\"");
        run_setting(amt, res, bpm, &hsh, stdout);
        printf("--- stopped ---\n");
        run_stopped(amt, res, bpm, &hsh, stdout);
        return 0;
    }

    int update = getenv("UPDATE_GOLDENS") != NULL;
    FILE *f = fopen(SWEEP_GOLDEN, update ? "w" : "r");
    if (!f) { fprintf(stderr, "FAIL: missing golden %s (run UPDATE_GOLDENS=1 once)\n", SWEEP_GOLDEN); return 1; }

    int settings = 0, distinct = 0, distinct_stopped = 0;
    uint64_t prev = 0, prev_stopped = 0;
    for (int b = 0; b < 2; b++)
    for (int res = 0; res < 2; res++)
    for (int amt = 0; amt <= 100; amt++) {
        uint64_t hsh, hst;
        int n = run_setting(amt, res, bpms[b], &hsh, NULL);
        HX_ASSERT(n > 200, "the pattern emitted almost nothing — the sweep is not exercising swing");
        int ns = run_stopped(amt, res, bpms[b], &hst, NULL);
        HX_ASSERT(ns > 20, "the stopped arp emitted almost nothing — that capture is not exercising swing");
        char got[128];
        snprintf(got, sizeof(got), "%d %d %d %d %016llx %d %016llx\n", amt, res, bpms[b],
                 n, (unsigned long long)hsh, ns, (unsigned long long)hst);
        if (update) fputs(got, f);
        else {
            char want[128];
            if (!fgets(want, sizeof(want), f)) { fprintf(stderr, "FAIL: golden ends before amt=%d res=%d bpm=%d\n", amt, res, bpms[b]); return 1; }
            if (strcmp(want, got)) {
                fprintf(stderr, "FAIL: swing timing changed at amt=%d res=%d bpm=%d\n  want %s  got  %s"
                                "  (SWING_SWEEP_DUMP=\"%d %d %d\" prints the events)\n",
                        amt, res, bpms[b], want, got, amt, res, bpms[b]);
                return 1;
            }
        }
        if (hsh != prev) distinct++;
        prev = hsh;
        if (hst != prev_stopped) distinct_stopped++;
        prev_stopped = hst;
        settings++;
    }
    fclose(f);
    /* The sweep has to be able to SEE swing: if every setting hashed alike the
     * block stamp is not reaching the capture and this pins nothing. */
    HX_ASSERT(distinct > 40, "swing settings barely change the capture — the sweep cannot see timing");
    HX_ASSERT(distinct_stopped > 40, "swing settings barely change the STOPPED capture — it cannot see timing");
    if (update) fprintf(stderr, "  [updated golden %s]\n", SWEEP_GOLDEN);
    printf("PASS: test_swing_sweep_golden (%d settings, %d distinct timings playing, %d stopped)\n",
           settings, distinct, distinct_stopped);
    return 0;
}
