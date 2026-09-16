/* tests/test_state_load_releases_notes.c — loading a project must not leave a
 * note sounding, and must not poison the pitch for the project that follows.
 *
 * Captured on device 2026-09-15: a chain-synth note held flat for six seconds
 * after a project load and was released only by the next panic. `state_load`
 * resets `playing`, `note_active`, `pfx.event_count` and `pfx.active_notes`
 * without ever telling the synth, so the note-on it sent has no matching
 * note-off anywhere.
 *
 * The second half is the one a "did it go quiet" ear test misses. `pfx_emit`
 * gates the wire by `pfx.pitch_refcount`, which the reset did NOT clear. With
 * the count stuck at 1 the next note-on for that pitch is swallowed as a
 * duplicate and its note-off is swallowed too (the count merely drops back to
 * 1 -> 0 on the off). The pitch is then dead for the whole session, until a
 * `send_panic` happens to zero it — which is exactly the "released only by the
 * next panic" the capture shows.
 *
 * Track 4 is used deliberately: tracks 4-7 default to ROUTE_SCHWUNG, so the
 * note leaves through `midi_send_internal_slot` and the stub captures the
 * addressed chain slot. A Move-routed track would prove nothing about the
 * slot dispatch this bug was reported on.
 *
 * ⚠ The fix must NOT be a panic. The module rule is that a MIDI panic before
 * `state_load` floods the MIDI buffer and drops the load param, so this test
 * also pins the bound: the release is a handful of targeted note-offs, never
 * the 16x128 sweep. A panic-based "fix" fails the message-count assertion. */
#include "harness.h"

#define T      4                   /* ROUTE_SCHWUNG by default (t >= 4) */
#define PITCH  60
#define VEL    100
/* Any well-formed uuid; the set dir it names does not exist off-device. */
#define LOAD_UUID "11111111-2222-3333-4444-555555555555"

/* Count note-offs for PITCH sent to the chain slot, at any channel. */
static int slot_note_offs(int slot, int pitch)
{
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL) continue;
        if (e->slot != slot) continue;
        if ((e->bytes[1] & 0xF0) != 0x80) continue;
        if (e->bytes[2] != (uint8_t)pitch) continue;
        n++;
    }
    return n;
}

static int slot_note_ons(int slot, int pitch)
{
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INTERNAL) continue;
        if (e->slot != slot) continue;
        if ((e->bytes[1] & 0xF0) != 0x90 || e->bytes[3] == 0) continue;
        if (e->bytes[2] != (uint8_t)pitch) continue;
        n++;
    }
    return n;
}

int main(void)
{
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t    *tr   = &inst->tracks[T];
    int slot;

    HX_ASSERT(tr->pfx.route == ROUTE_SCHWUNG, "t4 did not default to the chain route");
    slot = (int)tr->pfx.slot;

    /* --- a note is genuinely down on a chain-routed track --- */
    hx_clear_capture(h);
    pfx_note_on(inst, tr, PITCH, VEL);
    HX_ASSERT(slot_note_ons(slot, PITCH) == 1, "the note-on did not reach the chain slot");
    HX_ASSERT(tr->pfx.pitch_refcount[PITCH] == 1, "the pitch is not counted as sounding");

    /* --- the project load that used to abandon it --- */
    hx_clear_capture(h);
    /* A real uuid: an EMPTY one is refused outright now and would never reach
     * the release at all, so it cannot stand in for a project switch here. The
     * set dir does not exist off-device, so the load itself no-ops — which is
     * fine, because what is under test is the release that precedes it. */
    hx_set_param(h, "state_load", LOAD_UUID);

    HX_ASSERT(slot_note_offs(slot, PITCH) >= 1,
              "state_load abandoned a sounding note — no note-off reached the chain slot");
    HX_ASSERT(tr->pfx.pitch_refcount[PITCH] == 0,
              "state_load left the output-pitch refcount set — the pitch is poisoned");

    /* The bound: a targeted release, not the forbidden panic. One off per
     * sounding pitch across eight tracks is single digits; a 16x128-per-route
     * sweep is thousands, and that flood is what drops the load param. */
    HX_ASSERT(hx_stub_event_count() < 64,
              "state_load sent a flood — this must be a targeted release, not a panic");

    /* --- and the pitch still works afterwards --- */
    hx_clear_capture(h);
    pfx_note_on(inst, tr, PITCH, VEL);
    HX_ASSERT(slot_note_ons(slot, PITCH) == 1,
              "the next note-on for that pitch was swallowed by a stale refcount");
    hx_clear_capture(h);
    pfx_note_off_imm(inst, tr, PITCH);
    HX_ASSERT(slot_note_offs(slot, PITCH) == 1,
              "the matching note-off was swallowed — the pitch is stuck for good");

    /* --- a panic arriving after the release must not double-send --- */
    pfx_note_on(inst, tr, PITCH, VEL);
    hx_clear_capture(h);
    hx_set_param(h, "state_load", LOAD_UUID);
    HX_ASSERT(slot_note_offs(slot, PITCH) == 1, "the release double-sent its note-off");

    hx_destroy(h);
    printf("OK: state_load releases sounding notes and clears the refcount\n");
    return 0;
}
