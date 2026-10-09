/*
 * ext_midi_in.h — external MIDI that did not arrive on USB-A.
 *
 * A sidecar (seq-midi-bridge) pushes cable-2 USB-MIDI packets into the
 * SHM_EXT_MIDI_IN ring; the shim replays each one onto the two routes a
 * hardware cable-2 event takes:
 *
 *   - to the module on screen, through the shadow UI publish, and
 *   - to Move, with the cable-2 channel remap applied.
 *
 * Hardware events reach Move in the mailbox itself, which the shim may not
 * write (writing hardware MIDI_IN crashes Move), so the Move leg goes through
 * the MIDI inject ring instead. This header holds the one decision that leg
 * needs — what, if anything, Move should be sent — as a pure function, so it
 * is testable without the shim.
 *
 * The ring is a shadow_midi_inject_t (shadow_midi_inject_writer.h): producers
 * push, the shim's SPI callback is the single consumer.
 */

#ifndef EXT_MIDI_IN_H
#define EXT_MIDI_IN_H

#include <stdint.h>

#include "shadow_constants.h"

/* Is this a packet the ring may carry? Cable 2, channel voice, and a CIN
 * that agrees with its status byte. Anything else is dropped at the drain. */
static inline int
ext_midi_in_valid(const uint8_t pkt[4])
{
    uint8_t cin = pkt[0] & 0x0F;
    if ((pkt[0] >> 4) != 0x02) return 0;
    if (cin < 0x8 || cin > 0xE) return 0;
    return (pkt[1] >> 4) == cin;
}

/* What Move should receive for `in`, mirroring what shim_remap_cable2_channels
 * and the block patch do to a hardware event. Returns 1 and fills `out` when
 * Move gets a packet, 0 when it gets nothing.
 *
 * `remap` may be NULL (no table mapped). `thru_active` is the MPE-passthrough
 * override: with it set the table is ignored, as it is for hardware. */
static inline int
ext_midi_in_for_move(const uint8_t in[4], const schwung_ext_midi_remap_t *remap,
                     int thru_active, uint8_t out[4])
{
    out[0] = in[0]; out[1] = in[1]; out[2] = in[2]; out[3] = in[3];
    if (!remap || !remap->enabled || thru_active) return 1;

    uint8_t status = in[1];
    uint8_t mapped = remap->remap[status & 0x0F];
    if (mapped == EXT_MIDI_REMAP_PASSTHROUGH) return 1;
    if (mapped == EXT_MIDI_REMAP_BLOCK) {
        /* Move must not sound the note; everything else passes, as it does
         * for a blocked hardware channel. */
        return !((status & 0xF0) == 0x90 && in[3] > 0);
    }
    if (mapped >= 16) return 1;              /* unknown value: passthrough */
    out[1] = (uint8_t)((status & 0xF0) | mapped);
    return 1;
}

#endif /* EXT_MIDI_IN_H */
