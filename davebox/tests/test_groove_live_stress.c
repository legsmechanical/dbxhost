/* tests/test_groove_live_stress.c — live pads through the input arp under a
 * real-shaped groove leave nothing sounding.
 *
 * The device report (Josh, 2026-10-13): stuck notes when playing pads live
 * with the input arpeggiator on and a groove loaded. This plays pads the way a
 * hand does — pressing and letting go at uneven moments, several at once —
 * through TRACK ARP, under tables whose slots are late, early and on time in
 * no pattern and under the two swings (the fault predates the groove: main's
 * engine fails this with plain swing), with the transport playing and stopped, and reads the output in
 * order: when the hands are off and the tails have rung out, no pitch may
 * still be sounding. Deterministic: the "hand" is a fixed pseudo-random
 * sequence per seed. */
#include "harness.h"

static uint32_t rng_s;
static uint32_t rnd(void) { rng_s = rng_s * 1664525u + 1013904223u; return rng_s >> 8; }

static int run(uint32_t seed, int play, int style, int kind, int *ons_out) {
    char v[160], k[32];
    rng_s = seed;
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    hx_set_param(h, "t1_padmap",
        "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
        "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91");
    snprintf(v, sizeof(v), "%d", style);
    hx_set_param(h, "t1_tarp_style", v);
    snprintf(v, sizeof(v), "%d", (int)(rnd() % 100) + 1);
    hx_set_param(h, "t1_tarp_gate", v);
    /* a 16-slot table: offsets anywhere from half a slot early to nearly a slot late */
    hx_set_param(h, "groove_begin", "24 16 100 0 0 60 Stress");
    for (int i = 0; i < 16; i += 8) {
        int pos = 0;
        for (int j = 0; j < 8; j++)
            pos += snprintf(v + pos, sizeof(v) - (size_t)pos, "%s%d %d", j ? " " : "",
                            (int)(rnd() % 545) - 192, (int)(rnd() % 127) + 1);
        snprintf(k, sizeof(k), "groove_slots_%d", i);
        hx_set_param(h, k, v);
    }
    hx_set_param(h, "groove_commit", "1");
    hx_set_param(h, "groove_amt", "100");
    HX_ASSERT(inst->groove.kind == GROOVE_TABLE, "rig: the table did not load");
    /* the two swings too: the fault this was written for predates the groove */
    if (kind != GROOVE_TABLE) { snprintf(v, sizeof(v), "%d", kind); hx_set_param(h, "groove_kind", v); }
    if (play) hx_set_param(h, "transport", "play_focus:1:0");
    hx_clear_capture(h);

    int down[8] = { 0 };
    static const uint8_t pads[8] = { 68, 69, 70, 72, 75, 76, 79, 80 };
    for (int blk = 0; blk < 5200; ) {
        int step = (int)(rnd() % 45) + 1;
        hx_render(h, step); blk += step;
        int p = (int)(rnd() % 8);
        uint8_t m[3] = { (uint8_t)(down[p] ? 0x80 : 0x90), pads[p], (uint8_t)(down[p] ? 0 : 100) };
        hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
        down[p] = !down[p];
    }
    for (int p = 0; p < 8; p++) if (down[p]) { uint8_t m[3] = { 0x80, pads[p], 0 }; hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL); }
    hx_render(h, 900);

    int sounding[128] = { 0 }, ons = 0;
    int total = hx_stub_event_count();
    HX_ASSERT(total < 8000, "the capture is full — events were dropped, the count means nothing");
    for (int i = 0; i < total; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0, p = e->bytes[2] & 0x7F;
        if (st == 0x90 && e->bytes[3] > 0) { sounding[p]++; ons++; }
        else if (st == 0x80 || st == 0x90) { if (sounding[p] > 0) sounding[p]--; }
    }
    int left = 0;
    for (int p = 0; p < 128; p++) left += sounding[p];
    *ons_out = ons;
    hx_destroy(h);
    return left;
}

int main(void) {
    static const int kinds[3] = { GROOVE_TABLE, GROOVE_SWING_16, GROOVE_SWING_8 };
    static const char *kname[3] = { "a table", "Swing 1/16", "Swing 1/8" };
    int runs = 0, total_ons = 0;
    for (int ki = 0; ki < 3; ki++)
        for (uint32_t seed = 1; seed <= 16; seed++)
            for (int play = 0; play < 2; play++)
                for (int style = 0; style <= 2; style++) {
                    int ons = 0;
                    int left = run(seed * 7919u, play, style, kinds[ki], &ons);
                    if (left) {
                        fprintf(stderr, "FAIL: %s, seed %u, transport %s, arp style %d: %d note(s) left sounding (%d note-ons)\n",
                                kname[ki], (unsigned)seed, play ? "playing" : "stopped", style, left, ons);
                        return 1;
                    }
                    runs++; total_ons += ons;
                }
    HX_ASSERT(total_ons > runs * 30, "rig: the runs played almost nothing");
    printf("PASS: test_groove_live_stress (%d runs, %d note-ons, none left sounding)\n", runs, total_ons);
    return 0;
}
