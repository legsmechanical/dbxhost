/*
 * Can shadow_midi_dsp_t.write_idx address its own buffer?
 *
 * This is the MIDI-to-DSP sibling of shadow_midi_out_t (see
 * test_shadow_midi_out_capacity.c, and shadow_constants.h's comment on that
 * struct for the original bug). shadow_midi_dsp_t carried the SAME defect,
 * unnoticed because the OUT ring's fix never got copied over: write_idx was
 * a uint8_t against a 512-byte buffer, so:
 *
 *   - only the first 63 of 128 packets in one flush were reachable;
 *   - `write_idx = write_offset + 4` wrapped 252 -> 0, silently rewinding the
 *     buffer mid-flush so a later packet overwrote packet 0 (or 1, depending
 *     on where the flush started) instead of being appended;
 *   - the `write_offset + 4 <= SHADOW_MIDI_DSP_BUFFER_SIZE` bounds check in
 *     js_shadow_send_midi_to_dsp could never fire, because a uint8_t cannot
 *     reach 512 — it read as a working overflow guard and was dead code.
 *
 * Symptom on hardware (2026-09-15): a load left a note held. The overwritten
 * packet was a note-off, dropped silently while js_shadow_send_midi_to_dsp
 * still returned JS_TRUE.
 *
 * The test drives the real write loop against the real struct (byte-for-byte
 * the fixed write step of js_shadow_send_midi_to_dsp), so it fails if the
 * field is ever narrowed back — which is the only way this returns.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "shadow_constants.h"

static int failures = 0;

static void check(int cond, const char *what) {
    if (cond) {
        printf("  ok   %s\n", what);
    } else {
        printf("  FAIL %s\n", what);
        failures++;
    }
}

/* Byte-for-byte the (fixed) write step of js_shadow_send_midi_to_dsp.
 * Returns 1 if queued, 0 if the ring was full (the caller's drop path). */
static int push_frame(shadow_midi_dsp_t *m, const uint8_t frame[4]) {
    int write_offset = m->write_idx;
    if (write_offset + 4 <= SHADOW_MIDI_DSP_BUFFER_SIZE) {
        m->buffer[write_offset] = frame[0];
        m->buffer[write_offset + 1] = frame[1];
        m->buffer[write_offset + 2] = frame[2];
        m->buffer[write_offset + 3] = frame[3];
        m->write_idx = (uint16_t)(write_offset + 4);
        return 1;
    }
    return 0;
}

int main(void) {
    static shadow_midi_dsp_t m;
    const int CAPACITY = SHADOW_MIDI_DSP_BUFFER_SIZE / 4;

    /* 0. THE FIELD ITSELF is wide enough to address the buffer. This is the
     * same invariant the header's own _Static_assert pins; checked again
     * here at runtime so this test does not depend on that assert surviving
     * a future edit. */
    printf("write_idx can express every offset in the buffer\n");
    check(sizeof(((shadow_midi_dsp_t *)0)->write_idx) >= 2,
          "write_idx is at least 2 bytes wide (a uint8_t saturates at 255)");

    /* 1. THE WHOLE BUFFER IS REACHABLE — 128 frames, not 63. */
    printf("every frame the buffer has room for is accepted\n");
    memset(&m, 0, sizeof(m));
    int queued = 0;
    for (int i = 0; i < CAPACITY; i++) {
        uint8_t frame[4] = { 0x90, (uint8_t)i, 100, 0 };
        queued += push_frame(&m, frame);
    }
    check(queued == CAPACITY, "all 128 frames queued, not 63");
    check(m.write_idx == SHADOW_MIDI_DSP_BUFFER_SIZE,
          "write_idx reaches the end of the buffer");

    /* 2. NOTHING REWOUND. A wrap at offset 252 would have overwritten frame 0
     * (the note-on at data1=0) with frame 63 (data1=63); the data1 byte in
     * every slot proves that did not happen. This is the held-note bug's
     * shape: a later packet silently clobbering an earlier one mid-flush. */
    printf("no frame was overwritten by a later one\n");
    int intact = 1;
    for (int i = 0; i < CAPACITY; i++)
        if (m.buffer[i * 4 + 1] != (uint8_t)i) { intact = 0; break; }
    check(intact, "every slot still holds the frame written to it");

    /* 3. THE GUARD ACTUALLY FIRES on a full ring — a positive control for the
     * drop path js_shadow_send_midi_to_dsp now takes (dropped=1, JS_FALSE). */
    printf("a full buffer refuses, and says so\n");
    uint8_t extra[4] = { 0x90, 127, 100, 0 };
    check(push_frame(&m, extra) == 0, "the frame past the end is refused");
    check(m.write_idx == SHADOW_MIDI_DSP_BUFFER_SIZE,
          "and a refused write does not advance the cursor");

    /* 4. THE SHIM READS WHAT WAS WRITTEN. shadow_drain_ui_midi_dsp does
     * `int snapshot_len = midi_dsp_shm->write_idx`, so a field that cannot
     * express the length silently truncates the drain as well as the fill —
     * exactly the "(4N mod 256) bytes" loss the defect describes. */
    printf("the length the shim reads covers everything written\n");
    int snapshot_len = m.write_idx;
    check(snapshot_len == SHADOW_MIDI_DSP_BUFFER_SIZE,
          "the drain sees all 512 bytes, not the low 8 bits of the count");

    /* 5. THE STRUCT DID NOT GROW. Both processes map by sizeof (shadow_ui.c,
     * schwung_shim.c) and are built together, but a size change is still an
     * ABI change and this one was meant to be free — it takes a reserved
     * byte, same as shadow_midi_out_t's fix. */
    printf("widening the field cost no memory\n");
    check(sizeof(shadow_midi_dsp_t) == 4 + SHADOW_MIDI_DSP_BUFFER_SIZE,
          "sizeof is unchanged at header + buffer");

    /* 6. SAME SHAPE AS THE OUT RING. Both structs now have an identical
     * 4-byte header (uint16_t write_idx, uint8_t ready, 1 reserved byte)
     * ahead of their buffer, so they stay a matched pair going forward. */
    printf("the DSP ring's header is the same shape as the OUT ring's\n");
    check(sizeof(shadow_midi_dsp_t) - SHADOW_MIDI_DSP_BUFFER_SIZE ==
              sizeof(shadow_midi_out_t) - SHADOW_MIDI_OUT_BUFFER_SIZE,
          "shadow_midi_dsp_t and shadow_midi_out_t have matching header sizes");

    if (failures) {
        printf("FAILURES: %d\n", failures);
        return 1;
    }
    printf("PASS: shadow MIDI-to-DSP buffer is fully addressable\n");
    return 0;
}
