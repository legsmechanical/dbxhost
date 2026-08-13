/* tests/test_track_transpose.c — the track's own semitone offset.
 *
 * Transpose is a TRACK setting: it shifts everything the track plays, live and
 * sequenced, applied once on the way out, so it lands the same however the
 * track is routed. It replaced the chain slot's `slot:transpose`, which only
 * ever reached Schwung-routed tracks.
 *
 * Every assertion here is a silent failure mode:
 *  - Applied at the wrong point and the note simply comes out at the wrong
 *    pitch, with nothing to say so.
 *  - Applied on the way OUT rather than at the head of the FX chain and a
 *    change while a note is held sends a note-off computed with the NEW offset,
 *    matching no note-on — a stuck note, audible only sometimes.
 *  - Missed on the drum path (separate code) and the one use that motivated
 *    drum support — matching an external device's note region — silently does
 *    nothing.
 *  - Baked in during a bake and it is applied twice: once printed into the
 *    clip, once again at play time.
 */
#include "harness.h"

static const hx_midi_event *find_note_on(void) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) return e;
    }
    return NULL;
}

static const hx_midi_event *find_note_off(void) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x80 ||
            ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] == 0)) return e;
    }
    return NULL;
}

int main(void) {
    hx_t *h = hx_create("{}");
    HX_ASSERT(h, "create_instance failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* ---- default is no offset ---- */
    HX_ASSERT(inst->tracks[4].transpose == 0, "transpose must default to 0");

    /* ---- a live note comes out shifted ---- */
    hx_set_param(h, "t4_route", "schwung");
    hx_set_param(h, "t4_transpose", "7");
    HX_ASSERT(inst->tracks[4].transpose == 7, "transpose did not take");

    hx_clear_capture(h);
    hx_set_param(h, "t4_live_notes", "on 60 100");
    const hx_midi_event *on = find_note_on();
    HX_ASSERT(on, "no note-on emitted");
    HX_ASSERT((on->bytes[2]) == (67), "live note not transposed (+7 from 60)");
    hx_set_param(h, "t4_live_notes", "off 60");

    /* ---- the range clamps at +/-24, not +/-12 ---- */
    hx_set_param(h, "t4_transpose", "24");
    HX_ASSERT(((int)inst->tracks[4].transpose) == (24), "+24 must be reachable");
    hx_set_param(h, "t4_transpose", "-24");
    HX_ASSERT(((int)inst->tracks[4].transpose) == (-24), "-24 must be reachable");
    hx_set_param(h, "t4_transpose", "99");
    HX_ASSERT(((int)inst->tracks[4].transpose) == (24), "clamp high");
    hx_set_param(h, "t4_transpose", "-99");
    HX_ASSERT(((int)inst->tracks[4].transpose) == (-24), "clamp low");

    /* ---- ⭑ THE STUCK-NOTE CASE ----
     * Change transpose while a note is HELD. The note-off must carry the pitch
     * the note-on used, not the pitch the new offset would produce. This is the
     * whole reason the offset is applied at the head of the FX chain: the held
     * tracker stores the transposed value, so the off replays it.
     *
     * ⚠ The note-on offset must be NON-ZERO. Written with transpose=0 at
     * note-on, this assertion passes no matter where the offset is applied —
     * transposed and untransposed are the same number — and it silently proves
     * nothing. (Confirmed by mutation: storing the raw note in the held tracker
     * left the zero-offset version green.) With 3 here, the three candidate
     * values are distinct: 63 correct, 65 recomputed-at-emit, 60 raw. */
    hx_set_param(h, "t4_transpose", "3");
    hx_clear_capture(h);
    hx_set_param(h, "t4_live_notes", "on 60 100");
    on = find_note_on();
    HX_ASSERT(on, "no note-on for the held-note case");
    int held_pitch = on->bytes[2];
    HX_ASSERT((held_pitch) == (63), "note-on should be 60+3");

    hx_set_param(h, "t4_transpose", "5");        /* changed WHILE held */
    hx_clear_capture(h);
    hx_set_param(h, "t4_live_notes", "off 60");
    const hx_midi_event *off = find_note_off();
    HX_ASSERT(off, "no note-off emitted");
    HX_ASSERT((off->bytes[2]) == (63),
              "note-off must replay the note-on's pitch (63) — 65 = recomputed "
              "at emit, 60 = raw; both strand the note");

    /* ---- the DRUM path is separate code and must do the same ---- */
    hx_set_param(h, "t5_route", "schwung");
    hx_set_param(h, "t5_pad_mode", "1");         /* PAD_MODE_DRUM */
    hx_set_param(h, "t5_transpose", "12");
    hx_clear_capture(h);
    hx_set_param(h, "t5_live_notes", "on 36 100");
    on = find_note_on();
    HX_ASSERT(on, "no drum note-on emitted");
    HX_ASSERT((on->bytes[2]) == (48), "drum note not transposed (+12 from 36)");
    hx_set_param(h, "t5_live_notes", "off 36");

    /* ---- transpose is per-TRACK, not global ---- */
    hx_set_param(h, "t6_route", "schwung");
    HX_ASSERT(((int)inst->tracks[6].transpose) == (0), "another track must be unaffected");
    hx_clear_capture(h);
    hx_set_param(h, "t6_live_notes", "on 60 100");
    on = find_note_on();
    HX_ASSERT(on, "no note-on on the untransposed track");
    HX_ASSERT((on->bytes[2]) == (60), "a sibling track picked up the offset");
    hx_set_param(h, "t6_live_notes", "off 60");

    /* ---- readback, for the UI mirror and the batched digest ---- */
    char buf[64];
    hx_get_param(h, "t4_transpose", buf, sizeof(buf));
    HX_ASSERT((atoi(buf)) == (5), "get_param disagrees with the stored value");

    hx_destroy(h);
    printf("test_track_transpose: PASS\n");
    return 0;
}
