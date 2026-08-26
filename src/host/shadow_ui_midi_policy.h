/*
 * shadow_ui_midi_policy.h — who may occupy the LAST slots of the shim →
 * shadow_ui MIDI ring.
 *
 * The ring (`SHM_SHADOW_UI_MIDI`, 64 packets) is written by
 * `shadow_ui_midi_publish()` on the SPI callback and drained by shadow_ui
 * between JS callbacks. When every slot is full the publisher DROPS the event,
 * silently. Which event gets dropped is pure luck of arrival order, and the
 * consequences are wildly unequal:
 *
 *   A dropped KNOB DETENT costs one click of a relative encoder. The turn ends
 *   a hair short and the next turn corrects it. Nobody can name the frame it
 *   happened in.
 *
 *   A dropped BUTTON or NOTE RELEASE sticks FOREVER, because every held-modifier
 *   flag in a tool latches on an edge. That is exactly the bug Josh reported on
 *   2026-08-25: Shift+volume, and the track-select LEDs stayed lit as though
 *   Shift were still down, because as far as dAVEBOx knew it was.
 *
 * And the two are not equally likely to fill the ring: a knob is the only
 * control on the surface that emits a CONTINUOUS STREAM. Under overtake mode
 * every cable-0 event is forwarded (schwung_shim.c, "All other messages"), so a
 * fast spin is precisely what pushes a release off the end.
 *
 * ⭑ So the last few slots are RESERVED for events whose loss sticks. A knob CC
 * arriving when the ring is nearly full yields its place and is dropped instead.
 * This does not make the ring bigger or the consumer faster — it only decides
 * WHICH event is lost when something must be, and picks the recoverable one.
 *
 * ⚠ This is a bound, not a cure: a genuine flood of BUTTON events can still
 * fill the reserve. dAVEBOx also heals a stuck Shift by reconciling against the
 * shim's own hardware-tracked flag (`shadow_get_shift_held()`), and that remains
 * the belt to this policy's braces.
 *
 * ⚠⚠ NEVER add notes or buttons to the yielding set. Pads, track buttons,
 * transport, Shift, the jog click — every one of those has a release whose loss
 * latches. The whole point of the reserve is to hold slots FOR them.
 */

#ifndef SHADOW_UI_MIDI_POLICY_H
#define SHADOW_UI_MIDI_POLICY_H

#include <stdint.h>

/* Packets held back from yielding events. 8 of 64 — enough for a fistful of
 * simultaneous presses and releases (a 4-pad chord released together is 4) with
 * headroom, while leaving 87.5% of the ring to ordinary traffic. */
#define SHADOW_UI_MIDI_RESERVE_PACKETS 8

/* True for events that may be dropped in preference to a press/release.
 *
 * Move's relative encoders: the eight parameter knobs (CC 71-78) and the master
 * / volume knob (CC 79), on CABLE 0 — the hardware surface. A CC 79 from an
 * external controller on cable 2 is somebody's mapped parameter and is left
 * alone, so the cable test is part of the predicate, not decoration.
 *
 * `head` is the USB-MIDI byte: cable << 4 | CIN. CIN 0x0B is a channel CC.
 */
static inline int shadow_ui_midi_event_yields(uint8_t head, uint8_t status, uint8_t d1) {
    if ((head >> 4) != 0x00) return 0;          /* hardware surface only */
    if ((head & 0x0F) != 0x0B) return 0;        /* CIN: channel CC */
    if ((status & 0xF0) != 0xB0) return 0;      /* status: control change */
    return d1 >= 71 && d1 <= 79;                /* the nine relative encoders */
}

/* First byte offset a yielding event may NOT write to, given the ring size.
 * Callers scan slots [0, limit) for yielding events and [0, ring) otherwise. */
static inline int shadow_ui_midi_yield_limit(int ring_bytes) {
    int limit = ring_bytes - SHADOW_UI_MIDI_RESERVE_PACKETS * 4;
    return limit < 0 ? 0 : limit;
}

#endif /* SHADOW_UI_MIDI_POLICY_H */
