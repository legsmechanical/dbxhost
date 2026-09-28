/*
 * The shadow_ui -> shim MIDI-out ring: capacity, headroom, all-or-nothing.
 *
 * History: write_idx was once a uint8_t, so only the first 63 packets of the
 * 512-byte buffer were reachable and a full buffer read as a successful write.
 * Since upstream 988ed244 the segment is a single-producer single-consumer ring
 * (ui_midi_out_ring.h): free-running indices, capacity one packet short of the
 * buffer so full != empty. This drives the SAME admission rule the writer uses
 * (shadow_midi_out_admits, measured in FREE bytes) and the ring's own push, so it
 * fails if the headroom, the capacity or the all-or-nothing rule regresses.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "shadow_constants.h"
#include "ui_midi_out_ring.h"

static int failures = 0;

static void check(int cond, const char *what) {
    if (cond) printf("  ok   %s\n", what);
    else    { printf("  FAIL %s\n", what); failures++; }
}

/* The writer's decision (shadow_ui.c js_shadow_midi_send): whole message, the
 * cable from the first packet's CIN byte, cable 0 kept off the headroom. */
static int send_msg(shadow_midi_out_t *m, const uint8_t *msg, int len) {
    int cable = (msg[0] >> 4) & 0x0F;
    if (!shadow_midi_out_admits(ui_midi_out_free(m), cable, len)) return 0;
    return ui_midi_out_push(m, msg, (uint16_t)len);
}
/* The shim's side: take everything queued. */
static int drain_all(shadow_midi_out_t *m, uint8_t *out) {
    uint16_t n = ui_midi_out_used(m);
    ui_midi_out_copy(m, out, n);
    ui_midi_out_commit(m, n);
    return n;
}

int main(void) {
    static shadow_midi_out_t m;
    const int CAP = UI_MIDI_OUT_CAPACITY / 4;          /* 127: one packet short */

    printf("the ring takes all it has room for, and refuses past it\n");
    memset(&m, 0, sizeof(m));
    int queued = 0;
    for (int i = 0; i < CAP + 1; i++) {
        uint8_t pkt[4] = { 0x29, 0x90, (uint8_t)i, 100 };      /* cable 2 */
        queued += send_msg(&m, pkt, 4);
    }
    check(queued == CAP, "127 packets queued (the capacity), the 128th refused");
    check(ui_midi_out_used(&m) == UI_MIDI_OUT_CAPACITY, "the ring reports itself full");

    printf("the shim reads back exactly what was written, in order\n");
    uint8_t out[SHADOW_MIDI_OUT_BUFFER_SIZE];
    int n = drain_all(&m, out);
    int intact = (n == UI_MIDI_OUT_CAPACITY);
    for (int i = 0; intact && i < CAP; i++) if (out[i * 4 + 2] != (uint8_t)i) intact = 0;
    check(intact, "every packet comes out, in the order it went in");
    check(ui_midi_out_used(&m) == 0, "and the ring is empty after the commit");

    printf("across the wrap, order holds\n");
    int wrapped_ok = 1;
    for (int round = 0; round < 40 && wrapped_ok; round++) {
        uint8_t msg[12];
        for (int k = 0; k < 3; k++) { msg[4*k] = 0x29; msg[4*k+1] = 0x90; msg[4*k+2] = (uint8_t)(round*3+k); msg[4*k+3] = 1; }
        if (!send_msg(&m, msg, 12)) { wrapped_ok = 0; break; }
        n = drain_all(&m, out);
        if (n != 12) wrapped_ok = 0;
        for (int k = 0; k < 3 && wrapped_ok; k++) if (out[4*k+2] != (uint8_t)(round*3+k)) wrapped_ok = 0;
    }
    check(wrapped_ok, "40 rounds of a 3-packet message through the wrap, in order");

    printf("a message is admitted WHOLE or not at all\n");
    memset(&m, 0, sizeof(m));
    for (int i = 0; i < CAP - 2; i++) { uint8_t p[4] = { 0x29, 0x90, 1, 1 }; send_msg(&m, p, 4); }
    uint8_t sysex[12] = { 0x24, 0xF0, 0x00, 0x21, 0x24, 0x1D, 0x01, 0x01, 0x27, 0x05, 0x06, 0xF7 };
    uint16_t before = m.write_idx;
    check(send_msg(&m, sysex, 12) == 0, "a 3-packet SysEx with 2 packets free is refused");
    check(m.write_idx == before, "and nothing of it landed (no truncated prefix)");

    printf("LED traffic leaves room for external MIDI\n");
    memset(&m, 0, sizeof(m));
    int leds = 0;
    for (int i = 0; i < CAP; i++) {
        uint8_t led[4] = { 0x09, 0x90, (uint8_t)i, 5 };        /* cable 0: a pad LED */
        leds += send_msg(&m, led, 4);
    }
    check(leds == CAP - SHADOW_MIDI_OUT_EXT_HEADROOM / 4,
          "cable 0 fills only up to the headroom (111 of 127)");
    int ext = 0;
    for (int i = 0; i < SHADOW_MIDI_OUT_EXT_HEADROOM / 4; i++) {
        uint8_t cc[4] = { 0x2B, 0xB0, 64, 0 };                 /* cable 2: sustain off */
        ext += send_msg(&m, cc, 4);
    }
    check(ext == SHADOW_MIDI_OUT_EXT_HEADROOM / 4, "after an LED flood, 16 external packets still fit");
    uint8_t one_more[4] = { 0x2B, 0xB0, 64, 0 };
    check(send_msg(&m, one_more, 4) == 0, "and the ring still refuses past its capacity");

    printf("the struct did not grow\n");
    check(sizeof(shadow_midi_out_t) == 4 + SHADOW_MIDI_OUT_BUFFER_SIZE,
          "sizeof is unchanged at two indices + buffer");

    if (failures) { printf("FAILURES: %d\n", failures); return 1; }
    printf("PASS: shadow MIDI out ring capacity, headroom and all-or-nothing\n");
    return 0;
}
