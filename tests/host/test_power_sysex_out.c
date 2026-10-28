/*
 * Move's outgoing POWER messages survive a full overtake's LED strip
 * (src/host/shadow_led_queue.c, move_power_sysex_out_span in
 * src/host/shim_power_gate.h).
 *
 * After Move's power prompt is closed it sends F0 00 21 1D 01 01 39 02 F7,
 * which re-arms the button. The strip removed every cable-0 sysex from Move
 * while a module owned the surface, so the re-arm never reached the hardware:
 * one press per session, then a dead button (measured on hardware — Move
 * retried 48 times). Its LED sysex (3B) must still be stripped.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "shadow_led_queue.h"
#include "shim_power_gate.h"

static int fails = 0;
#define OK(c, what) do { if (c) printf("  ok   %s\n", what); else { printf("  FAIL %s\n", what); fails++; } } while (0)

static shadow_control_t control;
static shadow_control_t *control_ptr = &control;
static uint8_t midi_out[HW_MIDI_OUT_SIZE];
static uint8_t *ui_midi;

static void put(int i, uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    midi_out[i] = a; midi_out[i + 1] = b; midi_out[i + 2] = c; midi_out[i + 3] = d;
}

static int is(int i, uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    return midi_out[i] == a && midi_out[i + 1] == b && midi_out[i + 2] == c && midi_out[i + 3] == d;
}

static int zero(int i) { return is(i, 0, 0, 0, 0); }

int main(void) {
    memset(&control, 0, sizeof control);
    led_queue_host_t host = {
        .midi_out_buf = midi_out,
        .shadow_control = &control_ptr,
        .shadow_ui_midi_shm = &ui_midi,
        .passthrough_ccs = NULL,
    };
    led_queue_init(&host);
    shadow_clear_move_leds_if_overtake();          /* native frame */
    control.overtake_mode = 2;                     /* a module owns the surface */

    memset(midi_out, 0, sizeof midi_out);
    /* An RGB LED command (3B), as captured: 6 packets. */
    put(0, 0x04, 0xF0, 0x00, 0x21); put(4, 0x04, 0x1D, 0x01, 0x01);
    put(8, 0x04, 0x3B, 0x10, 0x28); put(12, 0x04, 0x02, 0x00, 0x01);
    put(16, 0x04, 0x00, 0x1D, 0x00); put(20, 0x05, 0xF7, 0x00, 0x00);
    /* The re-arm, as captured: 3 packets. */
    put(24, 0x04, 0xF0, 0x00, 0x21); put(28, 0x04, 0x1D, 0x01, 0x01); put(32, 0x07, 0x39, 0x02, 0xF7);
    /* Move's power query, F0 00 21 1D 01 01 3A F7: 3 packets. */
    put(36, 0x04, 0xF0, 0x00, 0x21); put(40, 0x04, 0x1D, 0x01, 0x01); put(44, 0x06, 0x3A, 0xF7, 0x00);
    /* A pad LED. */
    put(48, 0x09, 0x90, 68, 17);
    shadow_clear_move_leds_if_overtake();

    OK(is(24, 0x04, 0xF0, 0x00, 0x21) && is(28, 0x04, 0x1D, 0x01, 0x01) && is(32, 0x07, 0x39, 0x02, 0xF7),
       "the re-arm (39 02) reaches the hardware intact");
    OK(is(36, 0x04, 0xF0, 0x00, 0x21) && is(40, 0x04, 0x1D, 0x01, 0x01) && is(44, 0x06, 0x3A, 0xF7, 0x00),
       "the power query (3A) reaches the hardware intact");
    OK(zero(0) && zero(4) && zero(8) && zero(12) && zero(16) && zero(20),
       "Move's RGB LED sysex is still stripped");
    OK(zero(48), "Move's pad LED is still stripped");

    /* The helper alone. */
    memset(midi_out, 0, sizeof midi_out);
    put(0, 0x04, 0xF0, 0x00, 0x21); put(4, 0x04, 0x1D, 0x01, 0x01); put(8, 0x07, 0x39, 0x02, 0xF7);
    OK(move_power_sysex_out_span(midi_out, 0, HW_MIDI_OUT_SIZE) == 12, "the re-arm spans 3 packets");
    OK(move_power_sysex_out_span(midi_out, 4, HW_MIDI_OUT_SIZE) == 0, "only the message's first packet starts one");
    put(8, 0x07, 0x3B, 0x02, 0xF7);
    OK(move_power_sysex_out_span(midi_out, 0, HW_MIDI_OUT_SIZE) == 0, "an LED command (3B) is not a power message");
    put(0, 0x24, 0xF0, 0x00, 0x21); put(8, 0x07, 0x39, 0x02, 0xF7);
    OK(move_power_sysex_out_span(midi_out, 0, HW_MIDI_OUT_SIZE) == 0, "cable 2 is not Move's power message");
    put(0, 0x04, 0xF0, 0x00, 0x21); put(8, 0x04, 0x39, 0x02, 0x00);
    OK(move_power_sysex_out_span(midi_out, 0, 12) == 0, "a message cut off by the buffer end is not kept");
    /* A buffer that ENDS after two packets (heap, exactly sized: the target
     * is built with AddressSanitizer, so a read past it aborts the test). */
    uint8_t *tail = malloc(8);
    memcpy(tail, midi_out, 8);
    volatile int tail_size = 8;   /* opaque, or the dead read is optimised away */
    OK(tail && move_power_sysex_out_span(tail, 0, tail_size) == 0, "nothing is read past the buffer's end");
    free(tail);

    if (fails) { printf("FAIL: test_power_sysex_out\n"); return 1; }
    printf("PASS: test_power_sysex_out\n"); return 0;
}
