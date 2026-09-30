/* tests/test_swing_retrig_keeps_note_offs.c — with swing on, every note-on
 * still gets its note-off, on melodic AND drum tracks.
 *
 * Josh, 2026-09-30: a note on mngk's track 4 (22% swing) stuck after a clip
 * stop. Swing parks off-beat note-ons and note-offs in the track's event queue;
 * the MIDI delay's retrigger drain (delay_retrig, ON by default) ran on every
 * note-on with anything queued, sent a note-off per queued event through
 * pfx_send — where swing re-queued it — and then zeroed the queue, deleting
 * those note-offs and the parked note-ons of other notes. The drain now keeps
 * swing-parked events and compacts the ring before sending its offs.
 *
 * Replays the captured MIDI per (slot, note): after the transport stops the
 * clip at the bar and the tails run out, nothing may still be sounding. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

static int stuck_on_slot(int slot) {
    int bal[128]; memset(bal, 0, sizeof bal);
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL || e->slot != slot) continue;
        uint8_t st = e->bytes[1] & 0xF0, n = e->bytes[2] & 0x7F;
        if (st == 0x90 && e->bytes[3] > 0) bal[n] = 1;
        else if (st == 0x80 || st == 0x90) bal[n] = 0;
    }
    int c = 0; for (int n = 0; n < 128; n++) c += bal[n];
    return c;
}
static int offs_on_slot(int slot) {
    int c = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        uint8_t st = e->bytes[1] & 0xF0;
        if (e->kind == HX_MIDI_INTERNAL && e->slot == slot &&
            (st == 0x80 || (st == 0x90 && e->bytes[3] == 0))) c++;
    }
    return c;
}
static int ons_on_slot(int slot) {
    int c = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && e->slot == slot &&
            (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) c++;
    }
    return c;
}

int main(void) {
    int checks = 0;
    int ons_unswung = -1, drum_ons_unswung = -1;
    /* Melodic: notes on every step with a mix of gates, nudged early so the
     * retrigger drain meets swing-parked events — the shape that leaked. */
    for (int sw = 0; sw <= 50; sw += 25) {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char k[48], v[16];
        hx_set_param(h, "t3_route", "schwung");
        snprintf(v, sizeof v, "%d", sw); hx_set_param(h, "swing_amt", v);
        for (int s = 0; s < 16; s += 2) {
            snprintf(k, sizeof k, "t3_c0_step_%d_toggle", s); hx_set_param(h, k, s % 4 ? "64 100" : "60 100");
            snprintf(k, sizeof k, "t3_c0_step_%d_gate", s);   snprintf(v, sizeof v, "%d", s % 3 ? 24 * (1 + s % 5) : 2); hx_set_param(h, k, v);
            snprintf(k, sizeof k, "t3_c0_step_%d_nudge", s);  hx_set_param(h, k, "-5");
        }
        hx_set_param(h, "t3_c0_step_4_toggle", "67 100");   /* a chord: another note's parked on */
        hx_set_param(h, "transport", "play_focus:3:0");
        hx_render(h, 1500);
        hx_set_param(h, "t3_stop_at_end", "1");
        hx_render(h, 3000);
        int slot = (int)in->tracks[3].pfx.slot;
        HX_ASSERT(ons_on_slot(slot) > 4, "control: the melodic clip did not play");
        if (stuck_on_slot(slot)) {
            fprintf(stderr, "FAIL: melodic, swing %d: %d note(s) never got a note-off\n", sw, stuck_on_slot(slot));
            return 1;
        }
        /* ...and swing only MOVES notes, it never loses one: the drain used to
         * delete other notes' parked note-ons (measured: 8 of 24 played). */
        if (sw == 0) ons_unswung = ons_on_slot(slot);
        else if (ons_on_slot(slot) != ons_unswung) {
            fprintf(stderr, "FAIL: melodic, swing %d played %d notes, %d without swing\n", sw, ons_on_slot(slot), ons_unswung);
            return 1;
        }
        checks += 2;
        hx_destroy(h);
    }
    /* Drum: a lane hitting every step with mixed gates, so every hit meets the
     * previous hit's parked note-off in the lane's queue. A lane replays one
     * pitch, so the LAST state hides a lost off (the next hit and the stop
     * cover it) — count them instead: every note-on needs its own note-off,
     * or an instrument that stacks voices on a repeated note keeps the extra
     * ones (measured before the fix: 48 ons, 33 offs). */
    for (int sw = 0; sw <= 50; sw += 25) {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char k[48], v[16];
        hx_set_param(h, "t0_route", "schwung");
        snprintf(v, sizeof v, "%d", sw); hx_set_param(h, "swing_amt", v);
        for (int s = 0; s < 16; s++) {
            snprintf(k, sizeof k, "t0_l0_step_%d_toggle", s); hx_set_param(h, k, "100");
            snprintf(k, sizeof k, "t0_l0_step_%d_gate", s); snprintf(v, sizeof v, "%d", s % 3 ? 60 : 2); hx_set_param(h, k, v);
            /* Ratchets put hits closer than the swing delay, so a hit's parked
             * note-on is still queued when the next one retriggers. */
            snprintf(k, sizeof k, "t0_l0_step_%d_ratch", s); hx_set_param(h, k, "4");
        }
        hx_set_param(h, "transport", "play_focus:0:0");
        hx_render(h, 1500);
        hx_set_param(h, "t0_stop_at_end", "1");
        hx_render(h, 3000);
        int slot = (int)in->tracks[0].pfx.slot;
        HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "control: track 1 is not a drum track");
        HX_ASSERT(ons_on_slot(slot) > 10, "control: the drum clip did not play");
        if (sw == 0) drum_ons_unswung = ons_on_slot(slot);
        else if (ons_on_slot(slot) != drum_ons_unswung) {
            fprintf(stderr, "FAIL: drum, swing %d played %d hits, %d without swing\n", sw, ons_on_slot(slot), drum_ons_unswung);
            return 1;
        }
        if (offs_on_slot(slot) < ons_on_slot(slot)) {
            fprintf(stderr, "FAIL: drum, swing %d: %d note-ons but only %d note-offs\n",
                    sw, ons_on_slot(slot), offs_on_slot(slot));
            return 1;
        }
        checks += 3;
        hx_destroy(h);
    }
    /* The drain's own job, which the swing fix must not break: with the MIDI
     * delay on, a new note-on DROPS the previous note's queued echoes. */
    {
        int ons_retrig[2];
        for (int rt = 0; rt < 2; rt++) {
            hx_t *h = hx_create(NULL);
            seq8_instance_t *in = (seq8_instance_t *)h->inst;
            char k[48];
            hx_set_param(h, "t3_route", "schwung");
            hx_set_param(h, "t3_delay_level", "100");
            hx_set_param(h, "t3_delay_repeats", "8");
            hx_set_param(h, "t3_delay_retrig", rt ? "1" : "0");
            for (int s = 0; s < 16; s += 2) {
                snprintf(k, sizeof k, "t3_c0_step_%d_toggle", s); hx_set_param(h, k, "60 100");
            }
            hx_set_param(h, "transport", "play_focus:3:0");
            hx_render(h, 1500);
            ons_retrig[rt] = ons_on_slot((int)in->tracks[3].pfx.slot);
            hx_destroy(h);
        }
        if (!(ons_retrig[1] < ons_retrig[0])) {
            fprintf(stderr, "FAIL: delay retrig kept the echoes (%d note-ons with it, %d without)\n",
                    ons_retrig[1], ons_retrig[0]);
            return 1;
        }
        checks++;
    }
    printf("PASS: test_swing_retrig_keeps_note_offs (%d checks)\n", checks);
    return 0;
}
