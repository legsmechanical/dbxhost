/* test_capture_ext_on_move_track.c — Capture takes external MIDI played on a
 * Move-routed track (Josh, 2026-10-08: "capture doesn't work on external midi
 * in").
 *
 * Move sounds those notes itself, so the engine never played them — and so
 * never saw them: the Capture ring was fed only from live_note_on/off. The UI
 * now sends them as capture-only tokens ("con p v" / "coff p") in
 * tN_live_notes, which reach the ring and NOTHING else.
 *
 *  1. four capture-only notes on a Move track → Capture commits four notes.
 *  2. ...and the engine emitted no MIDI for them (Move plays them; a second
 *     copy would double the note and feed the cable-2 echo).
 *  3. CONTROL: the same phrase as ext-played tokens ("eon"/"eoff") on that
 *     track DOES emit — the harness can see emission when there is some.
 *  4. Drum track: a pitch a lane answers to is taken, any other pitch is not.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static void tap(hx_t *h, const char *key, const char *pre, int pitch, int hold, int gap) {
    char v[32];
    snprintf(v, sizeof v, "%son %d 100", pre, pitch);
    hx_set_param(h, key, v);
    hx_render(h, hold);
    snprintf(v, sizeof v, "%soff %d", pre, pitch);
    hx_set_param(h, key, v);
    hx_render(h, gap);
}
static int emitted(hx_t *h) {
    return hx_count_midi(h, HX_MIDI_INTERNAL) + hx_count_midi(h, HX_MIDI_EXTERNAL) +
           hx_count_midi(h, HX_MIDI_INJECT);
}

int main(void) {
    /* ---- 1 + 2. capture-only notes on a melodic Move track ---- */
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    hx_set_param(h, "t1_route", "move");
    HX_ASSERT(inst->tracks[1].pfx.route == ROUTE_MOVE, "setup: track 1 is a Move track");
    HX_ASSERT(inst->tracks[1].pad_mode != PAD_MODE_DRUM, "setup: track 1 is melodic");
    hx_set_param(h, "active_track", "1");
    hx_render(h, 4);
    hx_clear_capture(h);

    tap(h, "t1_live_notes", "c", 60, 40, 132);
    tap(h, "t1_live_notes", "c", 62, 40, 132);
    tap(h, "t1_live_notes", "c", 64, 40, 132);
    tap(h, "t1_live_notes", "c", 65, 40, 132);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 4, "four capture-only notes are pending");
    HX_ASSERT(emitted(h) == 0, "the engine emitted nothing for them (Move plays them)");

    hx_set_param(h, "t1_capture_commit", "0");
    HX_ASSERT(inst->tracks[1].clips[0].note_count == 4, "Capture committed the four notes");
    hx_destroy(h);

    /* ---- 3. CONTROL: ext-PLAYED tokens on the same track do emit ---- */
    h = hx_create(NULL);
    inst = I(h);
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "active_track", "1");
    hx_render(h, 4);
    hx_clear_capture(h);
    tap(h, "t1_live_notes", "e", 60, 40, 40);
    HX_ASSERT(emitted(h) > 0, "control: a played note is visible to the emission count");
    hx_destroy(h);

    /* ---- 4. drum track: only a lane's own pitch is taken ---- */
    h = hx_create(NULL);
    inst = I(h);
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "setup: track 0 is a drum track");
    hx_set_param(h, "t0_route", "move");
    hx_set_param(h, "active_track", "0");
    hx_render(h, 4);
    {
        drum_clip_t *dc = inst->tracks[0].drum_clips[inst->tracks[0].active_clip];
        HX_ASSERT(dc, "setup: the drum clip exists");
        int lane_note = dc->lanes[0].midi_note, stray = -1, p, l;
        for (p = 0; p < 128 && stray < 0; p++) {
            for (l = 0; l < DRUM_LANES; l++) if (dc->lanes[l].midi_note == p) break;
            if (l == DRUM_LANES) stray = p;
        }
        HX_ASSERT(stray >= 0, "setup: a pitch no lane answers to exists");
        hx_clear_capture(h);
        tap(h, "t0_live_notes", "c", stray, 20, 60);
        HX_ASSERT(capture_pending_for_track(inst, 0) == 0, "a pitch with no lane is not captured");
        tap(h, "t0_live_notes", "c", lane_note, 20, 60);
        HX_ASSERT(capture_pending_for_track(inst, 0) == 1, "a lane's own pitch is captured");
        HX_ASSERT(emitted(h) == 0, "and the engine emitted nothing for it");
    }
    hx_destroy(h);

    printf("PASS: Capture takes external MIDI on a Move track without the engine playing it\n");
    return 0;
}
