/*
 * shadow_midi_spill — the overflow queue behind shadow_ui's MIDI-out window.
 *
 * A LEAF over shadow_constants.h. It is its own translation unit for one
 * reason: shadow_ui.c cannot be linked into a host test (QuickJS, SPI, the
 * whole world), and a test that RE-IMPLEMENTS the ordering rule tests its own
 * replica. tests/host/test_shadow_midi_out_capacity.c drives the functions
 * below directly, so the thing pinned is the thing that ships.
 */
#ifndef SHADOW_MIDI_SPILL_H
#define SHADOW_MIDI_SPILL_H

#include <stdint.h>
#include "shadow_constants.h"

/* 8192 bytes = 2048 packets: 16x the 512-byte SHM window, and ~4.3x the
 * measured worst-case davebox launch burst (470 packets / 1880 bytes — see
 * shadow_midi_spill.c for the breakdown). Sized from that measurement plus
 * margin; a burst larger than this is a bug upstream of here and is counted
 * and logged rather than absorbed. */
#define SHADOW_MIDI_SPILL_SIZE 8192

/* Drop everything queued. For process init and for tests. */
void shadow_midi_spill_reset(void);

/* Bytes currently waiting in the ring. */
int shadow_midi_spill_pending(void);

/* High-water mark in bytes, for answering "how close did we come?". */
int shadow_midi_spill_peak(void);

/* Packets refused because the RING itself was full. Pathological. */
long shadow_midi_spill_drops(void);

/*
 * Queue one 4-byte packet for `out`.
 *
 * WINDOW FIRST, THEN SPILL, FIFO. Once anything is in the ring, every later
 * packet goes to the ring too — even if the window has room again — or it
 * would overtake the queued one. For LEDs that is a stale colour winning,
 * which is the entire class of bug this path exists to end.
 *
 * @returns 1 if the packet was accepted (window or ring), 0 only if the ring
 *          is also full — the one case a caller should treat as a refusal.
 */
int shadow_midi_send_packet(shadow_midi_out_t *out, const uint8_t pkt[4]);

/*
 * Move as much of the ring into the SHM window as fits.
 * @returns the number of packets moved. Does NOT touch `ready` — the caller
 *          owns that signal, because it also owns whatever else it wrote.
 */
int shadow_midi_spill_drain(shadow_midi_out_t *out);

#endif /* SHADOW_MIDI_SPILL_H */
