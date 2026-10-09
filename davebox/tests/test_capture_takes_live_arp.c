/* tests/test_capture_takes_live_arp.c — with LIVE ARP on, Capture keeps the
 * notes the arp PLAYED, not the pads that fed it (Josh, 2026-10-09: "capture
 * doesn't actually capture the arpeggiated notes, just what the pads play").
 *
 * Record has always written the arp's own notes into the clip; Capture is
 * Record after the fact and has to agree. The ring was fed from live_note_on,
 * which is upstream of the arp.
 *
 *  1. hold a three-note chord with the arp on, let it run, release: the take
 *     holds one note per arp step that fired — many more than three — and
 *     they cycle through the chord rather than stack on the first tick.
 *  2. the gates are the arp's (each note ends before the next begins), not
 *     the length of the pad hold.
 *  3. CONTROL: arp OFF — the same gesture captures the three pad notes.
 *  4. CONTROL: a drum track is not arpeggiated and captures its hit as before.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static hx_t *rig(int arp_on) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    inst->active_track = 1;
    HX_ASSERT(inst->tracks[1].pad_mode != PAD_MODE_DRUM, "rig: track 1 is melodic");
    if (arp_on) {
        hx_set_param(h, "t1_tarp_style", "1");      /* Up; turns the arp on */
        hx_set_param(h, "t1_tarp_sync", "0");       /* free: starts on the press */
        HX_ASSERT(inst->tracks[1].tarp_on, "rig: the arp is on");
    } else {
        HX_ASSERT(!inst->tracks[1].tarp_on, "rig: the arp is off");
    }
    hx_render(h, 4);
    return h;
}
static void chord(hx_t *h, int hold_blocks) {
    seq8_instance_t *inst = I(h);
    seq8_track_t *tr = &inst->tracks[1];
    live_note_on(inst, tr, 60, 100); live_note_on(inst, tr, 64, 100); live_note_on(inst, tr, 67, 100);
    hx_render(h, hold_blocks);
    live_note_off(inst, tr, 60); live_note_off(inst, tr, 64); live_note_off(inst, tr, 67);
    hx_render(h, 20);
}

int main(void) {
    /* ---- 1 + 2. arp on ---- */
    hx_t *h = rig(1);
    seq8_instance_t *inst = I(h);
    seq8_track_t *tr = &inst->tracks[1];
    uint32_t fires0 = tr->tarp.fire_count;
    chord(h, 700);                                  /* ~2 s: several arp cycles */
    int fired = (int)(tr->tarp.fire_count - fires0);
    HX_ASSERT(fired >= 8, "rig: the arp fired too few steps to tell arp notes from pad notes");
    int pending = capture_pending_for_track(inst, 1);
    HX_ASSERT(pending == fired, "one captured note per arp step that fired");
    HX_ASSERT(pending > 3, "more than the three pads that were held");

    hx_set_param(h, "t1_capture_commit", "0");
    clip_t *cl = &tr->clips[0];
    HX_ASSERT(cl->note_count == fired, "Capture committed every arp note");
    {
        int i, seen60 = 0, seen64 = 0, seen67 = 0, other = 0, distinct_ticks = 1, overlap = 0;
        uint32_t max_gate = 0;
        for (i = 0; i < cl->note_count; i++) {
            uint8_t p = cl->notes[i].pitch;
            if (p == 60) seen60++; else if (p == 64) seen64++; else if (p == 67) seen67++; else other++;
            if (cl->notes[i].gate > max_gate) max_gate = cl->notes[i].gate;
            if (i > 0) {
                if (cl->notes[i].tick != cl->notes[i - 1].tick) distinct_ticks++;
                if (cl->notes[i - 1].tick + cl->notes[i - 1].gate > cl->notes[i].tick) overlap++;
            }
        }
        HX_ASSERT(other == 0, "only the chord's pitches (Up, one octave)");
        HX_ASSERT(seen60 >= 2 && seen64 >= 2 && seen67 >= 2, "the take cycles through the chord");
        HX_ASSERT(distinct_ticks == cl->note_count, "one note per step in time, not a stack on the press");
        uint16_t rate = ARP_RATE_TICKS[tr->tarp.rate_idx];
        HX_ASSERT(max_gate <= (uint32_t)rate, "every gate is the arp's, not the length of the pad hold");
        HX_ASSERT(overlap == 0, "each note ends before the next begins");
    }
    hx_destroy(h);

    /* ---- 3. CONTROL: arp off — the pads are what was played ---- */
    h = rig(0);
    inst = I(h);
    chord(h, 700);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 3, "arp off: the three pad notes are pending");
    hx_set_param(h, "t1_capture_commit", "0");
    HX_ASSERT(inst->tracks[1].clips[0].note_count == 3, "arp off: Capture committed the three pad notes");
    hx_destroy(h);

    /* ---- 4. CONTROL: a drum track's hit is captured as before ---- */
    h = hx_create(NULL);
    inst = I(h);
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "rig: track 0 is a drum track");
    inst->active_track = 0;
    hx_render(h, 4);
    {
        drum_clip_t *dc = inst->tracks[0].drum_clips[inst->tracks[0].active_clip];
        HX_ASSERT(dc, "rig: the drum clip exists");
        uint8_t n = dc->lanes[0].midi_note;
        live_note_on(inst, &inst->tracks[0], n, 100);
        hx_render(h, 10);
        live_note_off(inst, &inst->tracks[0], n);
        hx_render(h, 10);
        HX_ASSERT(capture_pending_for_track(inst, 0) == 1, "drum hit pending");
    }
    hx_destroy(h);

    printf("PASS: Capture keeps what LIVE ARP played\n");
    return 0;
}
