/*
 * Can shadow_midi_out_t.write_idx address its own buffer?
 *
 * It could not. The buffer is 512 bytes and write_idx was a uint8_t, so:
 *
 *   - only the first 63 packets were reachable; the back half of the buffer
 *     was never written and never read;
 *   - `write_idx = write_offset + 4` wrapped 252 -> 0, silently rewinding the
 *     buffer mid-flush so later packets overwrote earlier ones;
 *   - the `write_offset + 4 <= SHADOW_MIDI_OUT_BUFFER_SIZE` bounds check in
 *     js_shadow_midi_send could never fire, because a uint8_t cannot reach
 *     512. It read as a working overflow check and was dead code.
 *
 * Symptom on hardware: an overtake module playing heavily loses LED updates,
 * permanently, because input_filter's setLED caches the colour it believes it
 * sent and suppresses the next identical repaint.
 *
 * This is the "~64 packets, >60/frame overflows" limit CLAUDE.md recorded as a
 * property of the buffer. It was a property of the FIELD.
 *
 * The test drives the real write loop against the real struct, so it fails if
 * the field is ever narrowed back — which is the only way this returns.
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

/* The write step of js_shadow_midi_send, through the SAME admission rule it
 * calls (shadow_midi_out_admits) — the cable is the CIN byte's high nibble.
 * Returns 1 if queued. */
static int push_packet(shadow_midi_out_t *m, const uint8_t pkt[4]) {
    int write_offset = m->write_idx;
    if (shadow_midi_out_admits((uint16_t)write_offset, (pkt[0] >> 4) & 0x0F)) {
        memcpy(&m->buffer[write_offset], pkt, 4);
        m->write_idx = (uint16_t)(write_offset + 4);
        return 1;
    }
    return 0;
}

int main(void) {
    static shadow_midi_out_t m;
    const int CAPACITY = SHADOW_MIDI_OUT_BUFFER_SIZE / 4;

    /* 1. THE WHOLE BUFFER IS REACHABLE (by external MIDI, cable 2 — cable 0
     * stops short of the end on purpose, see section 6). */
    printf("every packet the buffer has room for is accepted\n");
    memset(&m, 0, sizeof(m));
    int queued = 0;
    for (int i = 0; i < CAPACITY; i++) {
        uint8_t pkt[4] = { 0x29, 0x90, (uint8_t)i, 100 };
        queued += push_packet(&m, pkt);
    }
    check(queued == CAPACITY, "all 128 packets queued, not 63");
    check(m.write_idx == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "write_idx reaches the end of the buffer");

    /* 2. NOTHING REWOUND. The wrap overwrote packet 0 with packet 64; the
     * note number in each slot is what proves it did not happen here. */
    printf("no packet was overwritten by a later one\n");
    int intact = 1;
    for (int i = 0; i < CAPACITY; i++)
        if (m.buffer[i * 4 + 2] != (uint8_t)i) { intact = 0; break; }
    check(intact, "every slot still holds the packet written to it");

    /* 3. THE GUARD ACTUALLY FIRES. It could not before: a uint8_t
     * write_offset cannot reach 512, so the bounds check was unreachable and
     * a full buffer was indistinguishable from a successful write. */
    printf("a full buffer refuses, and says so\n");
    uint8_t extra[4] = { 0x29, 0x90, 127, 100 };
    check(push_packet(&m, extra) == 0, "the packet past the end is refused");
    check(m.write_idx == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "and a refused write does not advance the cursor");

    /* 4. THE SHIM READS WHAT WAS WRITTEN. shadow_inject_ui_midi_out does
     * `int snapshot_len = midi_out_shm->write_idx`, so a field that cannot
     * express the length silently truncates the drain as well as the fill. */
    printf("the length the shim reads covers everything written\n");
    int snapshot_len = m.write_idx;
    check(snapshot_len == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "the drain sees all 512 bytes, not the low 8 bits of the count");

    /* 5. THE STRUCT DID NOT GROW. Both processes map by sizeof and are built
     * together, but a size change is still an ABI change and this one was
     * meant to be free — it takes a reserved byte. */
    printf("widening the field cost no memory\n");
    check(sizeof(shadow_midi_out_t) == 4 + SHADOW_MIDI_OUT_BUFFER_SIZE,
          "sizeof is unchanged at header + buffer");

    /* 6. AN LED FLOOD CANNOT CROWD OUT EXTERNAL MIDI. A full repaint plus
     * palette SysEx can exceed the buffer in one flush; the writer refused the
     * NEWEST packet, which could be an external sustain-pedal release or a
     * pitch bend returning to centre — lost for good, while a refused LED is
     * resent by the next repaint. */
    printf("LED traffic leaves room for external MIDI\n");
    memset(&m, 0, sizeof(m));
    int leds = 0;
    for (int i = 0; i < CAPACITY; i++) {
        uint8_t led[4] = { 0x09, 0x90, (uint8_t)i, 5 };     /* cable 0: a pad LED */
        leds += push_packet(&m, led);
    }
    check(leds == CAPACITY - SHADOW_MIDI_OUT_EXT_HEADROOM / 4,
          "cable 0 fills only up to the headroom (112 of 128)");
    int ext = 0;
    for (int i = 0; i < SHADOW_MIDI_OUT_EXT_HEADROOM / 4; i++) {
        uint8_t cc[4] = { 0x2B, 0xB0, 64, 0 };               /* cable 2: sustain off */
        ext += push_packet(&m, cc);
    }
    check(ext == SHADOW_MIDI_OUT_EXT_HEADROOM / 4,
          "after an LED flood, 16 external packets still fit");
    uint8_t one_more[4] = { 0x2B, 0xB0, 64, 0 };
    check(push_packet(&m, one_more) == 0, "and the buffer still refuses past its end");

    if (failures) {
        printf("FAILURES: %d\n", failures);
        return 1;
    }
    printf("PASS: shadow MIDI out buffer is fully addressable\n");
    return 0;
}
