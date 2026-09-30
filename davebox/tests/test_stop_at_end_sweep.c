/* tests/test_stop_at_end_sweep.c — pressing a playing clip (tN_stop_at_end)
 * must leave no note sounding on the track's chain slot, whatever the clip
 * and play-effects settings were. Sweeps gate, delay, ratchet, nudge, arp and
 * SWING — Josh's stuck note (mngk, 22% swing): an off-beat note-on waits in the
 * queue for the swing delay, and a stop at the bar sent its note-off FIRST. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

/* Replay the capture into a per-(slot,note) on/off balance. */
static int stuck_notes(int slot, char *out, int outlen) {
    int bal[128]; memset(bal, 0, sizeof bal);
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL || e->slot != slot) continue;
        uint8_t st = e->bytes[1] & 0xF0, n = e->bytes[2] & 0x7F;
        if (st == 0x90 && e->bytes[3] > 0) bal[n] = 1;
        else if (st == 0x80 || st == 0x90) bal[n] = 0;
        else if (st == 0xB0 && (e->bytes[2] == 123 || e->bytes[2] == 120)) memset(bal, 0, sizeof bal);
    }
    int c = 0; out[0] = 0;
    for (int n = 0; n < 128; n++) if (bal[n]) { c++; int l = (int)strlen(out); snprintf(out + l, outlen - l, " %d", n); }
    return c;
}

int main(void) {
    static const int gates[]   = { 50, 100, 200, 400 };
    static const int delays[]  = { 0, 1 };
    static const int ratch[]   = { 0, 3 };
    static const int nudges[]  = { 0, -5 };
    static const int arps[]    = { 0, 1 };
    static const int stopats[] = { 17, 77 };
    static const int swings[]  = { 0, 50 };
    int runs = 0, fails = 0;
    for (int gi = 0; gi < 4; gi++) for (int di = 0; di < 2; di++) for (int ri = 0; ri < 2; ri++)
    for (int ni = 0; ni < 2; ni++) for (int ai = 0; ai < 2; ai++) for (int si = 0; si < 2; si++) for (int wi = 0; wi < 2; wi++) {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char v[32];
        hx_set_param(h, "t3_route", "schwung");
        snprintf(v, sizeof v, "%d", swings[wi]); hx_set_param(h, "swing_amt", v);
        snprintf(v, sizeof v, "%d", gates[gi]); hx_set_param(h, "t3_noteFX_gate", v);
        if (delays[di]) { hx_set_param(h, "t3_delay_level", "100"); hx_set_param(h, "t3_delay_repeats", "6"); }
        if (arps[ai]) hx_set_param(h, "t3_seq_arp_style", "1");
        for (int s = 0; s < 16; s += 2) {
            char k[48];
            snprintf(k, sizeof k, "t3_c0_step_%d_toggle", s); hx_set_param(h, k, s % 4 ? "64 100" : "60 100");
            snprintf(k, sizeof k, "t3_c0_step_%d_gate", s); snprintf(v, sizeof v, "%d", s % 3 ? 24 * (1 + s % 5) : 2); hx_set_param(h, k, v);
            if (ratch[ri]) { snprintf(k, sizeof k, "t3_c0_step_%d_ratch", s); snprintf(v, sizeof v, "%d", ratch[ri]); hx_set_param(h, k, v); }
            if (nudges[ni]) { snprintf(k, sizeof k, "t3_c0_step_%d_nudge", s); snprintf(v, sizeof v, "%d", nudges[ni]); hx_set_param(h, k, v); }
        }
        hx_set_param(h, "transport", "play_focus:3:0");
        hx_render(h, stopats[si]);
        hx_set_param(h, "t3_stop_at_end", "1");
        hx_render(h, 6000);    /* a 400% gate with delay ends ~2,200 blocks after the stop */
        HX_ASSERT(in->tracks[3].clip_playing == 0, "the clip stopped");
        int slot = (int)in->tracks[3].pfx.slot;
        char list[512];
        int c = stuck_notes(slot, list, sizeof list);
        int rc = 0; for (int n = 0; n < 128; n++) rc += in->tracks[3].pfx.pitch_refcount[n];
        runs++;
        if (c || rc) {
            fails++;
            fprintf(stderr, "STUCK gate=%d delay=%d ratch=%d nudge=%d arp=%d stop@%d swing=%d: sounding [%s ] refcount=%d\n",
                    gates[gi], delays[di], ratch[ri], nudges[ni], arps[ai], stopats[si], swings[wi], list, rc);
        }
        hx_destroy(h);
    }
    if (fails) { fprintf(stderr, "FAIL: %d of %d stop-at-end runs left notes sounding\n", fails, runs); return 1; }
    printf("PASS: test_stop_at_end_sweep (%d runs)\n", runs);
    return 0;
}
