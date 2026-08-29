/* shadow_midi_filter.h - MIDI_IN geometry and gap compaction.
 *
 * Split out of shadow_midi.c so the compaction can be unit-tested without
 * linking the whole shim. */

#ifndef SHADOW_MIDI_FILTER_H
#define SHADOW_MIDI_FILTER_H

#include <stdint.h>

/*
 * May this raw MIDI_IN slot be forwarded to the shadow UI / an overtake tool?
 *
 * The hardware MIDI_IN buffer is never cleared wholesale, so consumed slots
 * keep their stale bytes and are re-scanned every SPI frame.
 *
 * The guard this replaced covered only voice CINs (>= 0x08, status must be
 * >= 0x80) and deliberately exempted SysEx CINs 0x04-0x07, whose data bytes
 * are legitimately < 0x80. But overtake mode widens the forward scan to accept
 * exactly that SysEx range, so a stale slot whose CIN nibble landed in
 * 0x04-0x07 with a zeroed payload sailed straight through and was dispatched
 * into JS as status=0 d1=0 d2=0 — upstream measured ~10/s, flooding overtake
 * tools and the debug log. A real SysEx packet always carries at least one
 * nonzero byte, so the all-zero case is rejected too.
 */
int shadow_midi_forwardable(uint8_t head, uint8_t status, uint8_t d1, uint8_t d2);

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
