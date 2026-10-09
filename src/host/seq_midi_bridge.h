/*
 * seq_midi_bridge.h — the pure half of seq-midi-bridge: USB-MIDI packets
 * (the 4-byte form the SPI mailbox and the inject ring carry) to and from
 * plain MIDI bytes, and the reader for the shim's MIDI_OUT stream.
 *
 * No ALSA, no syscalls: this is what the native test suite exercises. The
 * sequencer I/O lives in seq_midi_bridge.c (Linux only).
 *
 * Scope: channel voice messages both ways, plus the realtime transport
 * bytes outbound. SysEx is NOT bridged in either direction — MIDI_OUT also
 * carries device-internal SysEx that has no business leaving the unit.
 */

#ifndef SEQ_MIDI_BRIDGE_H
#define SEQ_MIDI_BRIDGE_H

#include <stdint.h>

#include "shadow_constants.h"

#define SEQ_BRIDGE_CABLE_EXTERNAL 0x02   /* USB-A external MIDI */

/* One USB-MIDI packet → MIDI bytes. Returns the byte count (1..3), or 0
 * when the packet is not on the external cable or is not bridged. */
static inline int
seq_bridge_packet_to_bytes(const uint8_t pkt[4], uint8_t out[3])
{
    if ((pkt[0] >> 4) != SEQ_BRIDGE_CABLE_EXTERNAL) return 0;
    uint8_t cin = pkt[0] & 0x0F;
    uint8_t status = pkt[1];

    if (cin >= 0x8 && cin <= 0xE) {
        if ((status >> 4) != cin) return 0;      /* CIN and status disagree */
        out[0] = status;
        out[1] = pkt[2] & 0x7F;
        if (cin == 0xC || cin == 0xD) return 2;  /* program change, channel pressure */
        out[2] = pkt[3] & 0x7F;
        return 3;
    }
    if (cin == 0xF) {
        /* Single byte: clock, start, continue, stop. */
        if (status == 0xF8 || status == 0xFA || status == 0xFB || status == 0xFC) {
            out[0] = status;
            return 1;
        }
    }
    return 0;
}

/* MIDI bytes → one USB-MIDI packet on the external cable. Channel voice
 * messages only. Returns 1 when pkt was written, 0 otherwise. */
static inline int
seq_bridge_bytes_to_packet(const uint8_t *msg, int len, uint8_t pkt[4])
{
    if (!msg || len < 2) return 0;
    uint8_t status = msg[0];
    uint8_t kind = status >> 4;
    if (kind < 0x8 || kind > 0xE) return 0;
    int need = (kind == 0xC || kind == 0xD) ? 2 : 3;
    if (len < need) return 0;

    pkt[0] = (uint8_t)((SEQ_BRIDGE_CABLE_EXTERNAL << 4) | kind);
    pkt[1] = status;
    pkt[2] = msg[1] & 0x7F;
    pkt[3] = (need == 3) ? (msg[2] & 0x7F) : 0;
    return 1;
}

/* Reader for a test_stream_shm_t ring. The shim is the only writer; every
 * reader keeps a private cursor and never writes the ring, so any number
 * of readers can follow the same stream.
 *
 * Copies up to `max` events published since *cursor into `out` and
 * advances *cursor. A reader that fell more than a lap behind skips to the
 * oldest event still in the ring; one that finds the writer's counter behind
 * its own (the writer restarted) resynchronises to the head. */
static inline int
seq_bridge_stream_read(const test_stream_shm_t *shm, uint32_t *cursor,
                       test_stream_event_t *out, int max)
{
    uint32_t head = __atomic_load_n(&shm->write_seq, __ATOMIC_ACQUIRE);
    uint32_t pending = head - *cursor;
    if ((int32_t)pending < 0) {
        /* The writer started over (its counter is behind ours). */
        *cursor = head;
        return 0;
    }
    if (pending > TEST_STREAM_CAPACITY) {
        *cursor = head - TEST_STREAM_CAPACITY;
        pending = TEST_STREAM_CAPACITY;
    }
    int n = 0;
    while (pending > 0 && n < max) {
        out[n++] = shm->buffer[*cursor % TEST_STREAM_CAPACITY];
        (*cursor)++;
        pending--;
    }
    return n;
}

#endif /* SEQ_MIDI_BRIDGE_H */
