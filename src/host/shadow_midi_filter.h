/* shadow_midi_filter.h - MIDI_IN geometry and gap compaction.
 *
 * Split out of shadow_midi.c so the compaction can be unit-tested without
 * linking the whole shim. */

#ifndef SHADOW_MIDI_FILTER_H
#define SHADOW_MIDI_FILTER_H

#include <stdint.h>

/* MIDI_IN geometry.  31 events of 8 bytes (4-byte USB-MIDI + 4-byte XMOS
 * timestamp) = 248 bytes, and then the display-status word at +248.  NOT
 * MIDI_BUFFER_SIZE, which is 256 and runs one slot into that word. */
#define SHADOW_MIDI_IN_STRIDE 8
#define SHADOW_MIDI_IN_SLOTS  31
#define SHADOW_MIDI_IN_BYTES  (SHADOW_MIDI_IN_STRIDE * SHADOW_MIDI_IN_SLOTS)

/* Is this slot the terminator?  The Ableton SPI convention (see
 * schwung_usb_midi_msg_is_empty) is cable, CIN and all three payload bytes
 * zero - the timestamp is not part of the test. */
int shadow_midi_in_slot_empty(const uint8_t *slot);

/* Close every gap in MIDI_IN: shift surviving events down, order preserved,
 * and zero the tail.  Returns the number of survivors.
 *
 * Move's firmware MIDI_IN reader STOPS at the first empty slot, so a gap
 * hides every event behind it.  The shim suppresses an event by zeroing its
 * slot in place, which manufactures exactly that gap - see the call site in
 * schwung_shim.c for how it loses pad note-offs.  Run this after every
 * MIDI_IN mutation to restore the dense-prefix/zero-tail shape the hardware
 * itself delivers and Move's reader assumes.
 *
 * Moving an event between slots is invisible to the other readers: the
 * dedup rings key on content plus timestamp, and the timestamp travels with
 * its event here.
 *
 * SPI-callback safe: bounded loop, no allocation, I/O or locks. */
int shadow_midi_in_compact(uint8_t *midi_in);

#endif /* SHADOW_MIDI_FILTER_H */
