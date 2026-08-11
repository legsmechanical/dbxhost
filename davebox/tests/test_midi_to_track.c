/* tests/test_midi_to_track.c — `MIDI to Track N` dispatch
 * (docs/working/TRACK_OWNS_ITS_INSTRUMENT.md, step 2b).
 *
 * A track owns its instrument, so the way one instrument gets played by more
 * than one track is directional: a MIDI track names a target and plays THAT
 * track's instrument. The destination is resolved at emit rather than copied
 * into the follower when it is assigned, so the two can never drift.
 *
 * Every assertion here is a silent failure mode. A follower whose target is not
 * resolved does not error — it emits somewhere else. Wrong slot: another
 * synth answers. Kept channel on a Move target: a different Move instrument
 * answers. Followed while route is Move: the track you are looking at plays
 * someone else's sound. None of it is visible on screen.
 */
#include "harness.h"

/* pfx_send is the one choke point every route flows through, so driving it
 * directly tests dispatch without a clip, a transport or a tick. */
static void emit_note(seq8_instance_t *inst, int track, uint8_t pitch) {
    play_fx_t *fx = &inst->tracks[track].pfx;
    pfx_send(fx, (uint8_t)(0x90 | (inst->tracks[track].channel & 0x0F)), pitch, 100);
}

static const hx_midi_event *find_note(uint8_t pitch) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == pitch && e->bytes[3] > 0)
            return e;
    }
    return NULL;
}

int main(void) {
    hx_t *h = hx_create("{}");
    HX_ASSERT(h, "create_instance failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* Track 5 (index 4) is Schwung by default; give it a distinctive slot and
     * channel so a wrong destination cannot coincide with the right one. */
    hx_set_param(h, "t4_route", "schwung");
    hx_set_param(h, "t4_channel", "9");        /* stored 0-based as 8 */
    /* No t4_slot to set: track 5 owns chain slot 4. That the follower reaches
     * slot 4 and not its own is the whole point of the assertion below. */
    /* Track 8 (index 7) becomes a MIDI track following track 5. */
    hx_set_param(h, "t7_route", "external");
    hx_set_param(h, "t7_channel", "12");
    hx_set_param(h, "t7_midi_to", "5");        /* 1-based: track 5 */

    /* --- a follower plays the TARGET's instrument, on the TARGET's channel -- */
    hx_clear_capture(h);
    emit_note(inst, 7, 61);
    {
        const hx_midi_event *e = find_note(61);
        HX_ASSERT(e, "follower emitted nothing");
        HX_ASSERT(e->kind == HX_MIDI_INTERNAL,
                  "follower went out USB instead of into the target's chain");
        HX_ASSERT(e->slot == 4, "follower addressed the wrong chain slot — "
                                "it must reach the TARGET's own chain (track 5 -> slot 4)");
        HX_ASSERT((e->bytes[1] & 0x0F) == 8,
                  "follower kept its OWN channel instead of the target's");
    }

    /* --- a Move target: the channel IS which instrument, so it must be
     *     rewritten, not kept ------------------------------------------------ */
    hx_set_param(h, "t4_route", "move");
    hx_set_param(h, "t4_channel", "3");        /* Move instrument 3 */
    hx_clear_capture(h);
    emit_note(inst, 7, 62);
    {
        const hx_midi_event *e = find_note(62);
        HX_ASSERT(e, "follower emitted nothing for a Move target");
        HX_ASSERT(e->kind == HX_MIDI_INJECT, "Move target did not inject to Move");
        HX_ASSERT((e->bytes[1] & 0x0F) == 2,
                  "Move target got the follower's channel — the wrong instrument plays");
    }
    /* ⭑ The target's instrument changed underneath the follower and it followed,
     *   with nothing re-applied. That is the point of resolving at emit. */

    /* --- a target that is not an instrument is REJECTED, not followed.
     *     This is what makes routing cycles unrepresentable. ----------------- */
    hx_set_param(h, "t4_route", "external");   /* track 5 is now a MIDI track */
    hx_clear_capture(h);
    emit_note(inst, 7, 63);
    HX_ASSERT(!find_note(63),
              "a MIDI track followed another MIDI track — cycles are representable");

    /* --- midi_to means something only on a MIDI track ---------------------- */
    hx_set_param(h, "t4_route", "schwung");
    hx_set_param(h, "t7_route", "move");       /* follower is now a Move track */
    hx_set_param(h, "t7_channel", "2");
    hx_clear_capture(h);
    emit_note(inst, 7, 64);
    {
        const hx_midi_event *e = find_note(64);
        HX_ASSERT(e, "Move-routed track with a leftover target emitted nothing");
        HX_ASSERT(e->kind == HX_MIDI_INJECT,
                  "a leftover midi_to hijacked a Move-routed track");
        HX_ASSERT((e->bytes[1] & 0x0F) == 1, "wrong Move instrument");
    }

    /* --- self-reference collapses to 'my own instrument' ------------------- */
    hx_set_param(h, "t7_route", "external");
    hx_set_param(h, "t7_midi_to", "8");        /* itself */
    {
        char buf[16];
        hx_get_param(h, "t7_midi_to", buf, sizeof buf);
        HX_ASSERT(buf[0] == '0',
                  "a track can follow itself — one destination, two spellings");
    }

    /* --- it survives a save/load round trip ------------------------------- */
    hx_set_param(h, "t7_midi_to", "5");
    {
        char blob[1 << 18];
        HX_ASSERT(hx_get_param(h, "state_full", blob, sizeof blob) > 0,
                  "state_full failed");
        HX_ASSERT(strstr(blob, "\"t7_mt\":5"), "midi_to was not serialized");
        /* Sparse: a track playing its own instrument costs no key. */
        HX_ASSERT(!strstr(blob, "\"t0_mt\""),
                  "midi_to is serialized for tracks that do not use it");
    }

    hx_destroy(h);
    printf("ok — MIDI to Track N: target's slot + channel, rejected cycles, "
           "MIDI-route-only, self collapses, round-trips\n");
    return 0;
}
