/*
 * ui_midi_dsp_ring.h — the shadow_ui -> shim MIDI-to-DSP segment as a
 * single-producer single-consumer ring.
 *
 * The same discipline as ui_midi_out_ring.h, on shadow_midi_dsp_t: both indices
 * are free-running byte counts; the PRODUCER (shadow_ui,
 * js_shadow_send_midi_to_dsp) owns write_idx and the bytes; the CONSUMER (the
 * shim, shadow_drain_ui_midi_dsp) owns read_idx and never writes the buffer.
 * Capacity is one frame short of the buffer, so full != empty.
 *
 * THE BUG THIS REPLACES. The drain snapshotted write_idx, copied, then set
 * `write_idx = 0` and memset the buffer — while shadow_ui, a SEPARATE PROCESS,
 * could be appending. A frame written in that window was erased and its index
 * discarded after the sender had been told it was delivered. This segment
 * carries a module's notes to its instruments, so the loss is a note that never
 * sounds, or a note-off that never arrives and leaves one hanging.
 *
 * A parallel copy rather than a generalisation of ui_midi_out_ring.h: that
 * header is upstream's, taken whole, and stays re-takeable. The two are held
 * equal by tests/host/test_ui_midi_dsp_ring.c, which drives both through the
 * same random sequence and requires the same answers.
 *
 * Frames are 4 bytes: status, d1, d2, slot tag (0 = dispatch by channel,
 * 1..N = slot tag-1).
 */
#ifndef UI_MIDI_DSP_RING_H
#define UI_MIDI_DSP_RING_H

#include <stdint.h>
#include <string.h>

#include "shadow_constants.h"

_Static_assert((SHADOW_MIDI_DSP_BUFFER_SIZE &
                (SHADOW_MIDI_DSP_BUFFER_SIZE - 1)) == 0,
               "SHADOW_MIDI_DSP_BUFFER_SIZE must be a power of two");
_Static_assert(SHADOW_MIDI_DSP_BUFFER_SIZE <= 65536 &&
                   (65536 % SHADOW_MIDI_DSP_BUFFER_SIZE) == 0,
               "uint16 indices must wrap on a whole multiple of the buffer");
_Static_assert((SHADOW_MIDI_DSP_BUFFER_SIZE % 4) == 0,
               "a 4-byte frame must never straddle the wrap");

#define UI_MIDI_DSP_MASK     (SHADOW_MIDI_DSP_BUFFER_SIZE - 1)
/* One frame reserved so full != empty. */
#define UI_MIDI_DSP_CAPACITY (SHADOW_MIDI_DSP_BUFFER_SIZE - 4)

/* Bytes queued and not yet consumed. Safe from either side. */
static inline uint16_t ui_midi_dsp_used(const shadow_midi_dsp_t *m)
{
    return (uint16_t)((uint16_t)m->write_idx - (uint16_t)m->read_idx);
}

/* Bytes the producer may still append. Producer side only. */
static inline uint16_t ui_midi_dsp_free(const shadow_midi_dsp_t *m)
{
    return (uint16_t)(UI_MIDI_DSP_CAPACITY - ui_midi_dsp_used(m));
}

/* PRODUCER: append `len` bytes, or none of them. Returns 1 on success. */
static inline int ui_midi_dsp_push(shadow_midi_dsp_t *m,
                                   const uint8_t *src, uint16_t len)
{
    if (len == 0) return 1;
    if (len > ui_midi_dsp_free(m)) return 0;

    uint16_t w = (uint16_t)m->write_idx;
    uint16_t pos = (uint16_t)(w & UI_MIDI_DSP_MASK);
    uint16_t first = (uint16_t)(SHADOW_MIDI_DSP_BUFFER_SIZE - pos);
    if (first > len) first = len;

    memcpy(&m->buffer[pos], src, first);
    if (len > first)
        memcpy(&m->buffer[0], src + first, (size_t)(len - first));

    /* Publish the bytes before the index that advertises them. */
    __sync_synchronize();
    m->write_idx = (uint16_t)(w + len);
    return 1;
}

/*
 * CONSUMER: take everything queued into `dst` (at least
 * SHADOW_MIDI_DSP_BUFFER_SIZE bytes), release it, return the byte count.
 * read_idx is the ONLY thing the consumer writes.
 *
 * A count no producer can leave — more than the capacity, or not whole frames
 * (a segment from another layout, or a corrupt one) — is released UNREAD:
 * returns 0 and bumps *discarded. Dispatching it would send garbage to the
 * instruments; leaving it would wedge the ring for good.
 */
static inline uint16_t ui_midi_dsp_take(shadow_midi_dsp_t *m, uint8_t *dst,
                                        uint32_t *discarded)
{
    uint16_t r = (uint16_t)m->read_idx;
    uint16_t len = (uint16_t)((uint16_t)m->write_idx - r);
    if (len == 0) return 0;
    /* The index was read first; the bytes it covers must not be read before
     * it (ARM64 may reorder the loads). */
    __sync_synchronize();

    if (len > UI_MIDI_DSP_CAPACITY || (len & 3)) {
        if (discarded) (*discarded)++;
        m->read_idx = (uint16_t)(r + len);
        return 0;
    }

    uint16_t pos = (uint16_t)(r & UI_MIDI_DSP_MASK);
    uint16_t first = (uint16_t)(SHADOW_MIDI_DSP_BUFFER_SIZE - pos);
    if (first > len) first = len;
    memcpy(dst, &m->buffer[pos], first);
    if (len > first)
        memcpy(dst + first, &m->buffer[0], (size_t)(len - first));

    /* The copy is complete before the producer can see the space as free. */
    __sync_synchronize();
    m->read_idx = (uint16_t)(r + len);
    return len;
}

#endif /* UI_MIDI_DSP_RING_H */
