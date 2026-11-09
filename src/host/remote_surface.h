/*
 * remote_surface.h — the browser's hands on the surface.
 *
 * The Screen view (the remote editor's live picture of the module on screen)
 * lets a click do what a hand does: turn a knob, press a pad, hold the jog and
 * press a step. The page sends the HARDWARE gesture — the same packets the
 * Move's own controls produce — the manager pushes them on the SHM_REMOTE_SURFACE
 * ring, and the shim replays them onto the route a hardware press takes (the
 * shadow UI publish, and note events to the overtake DSP), exactly as it does
 * for the test bus's surface ring. So a click runs the module's real input
 * handlers, and does whatever the gesture does on the device: nothing is
 * re-implemented in the browser, and nothing can drift from the device.
 *
 * Unlike the test bus, the producer here is a network-facing process, so the
 * drain accepts only what the Move's own surface can send: cable 0, channel 1,
 * note on/off for the touch sensors, steps and pads, and CCs for the
 * encoders, the jog and the buttons. Never the master knob (CC 79, which Move
 * handles itself), never the plug-detect CCs, never anything Move would take
 * as a different device.
 *
 * The ring is a shadow_midi_inject_t (shadow_midi_inject_writer.h): producers
 * push, the shim's SPI callback is the single consumer.
 */

#ifndef REMOTE_SURFACE_H
#define REMOTE_SURFACE_H

#include <stdint.h>

/* Notes the surface sends: knob and jog touch (0-9), steps (16-31), pads (68-99). */
static inline int
remote_surface_note_ok(uint8_t n)
{
    return n <= 9 || (n >= 16 && n <= 31) || (n >= 68 && n <= 99);
}

/* CCs the surface sends, less the master knob (79) and plug detect (114/115). */
static inline int
remote_surface_cc_ok(uint8_t cc)
{
    switch (cc) {
    case 3:   /* jog click */
    case 14:  /* jog turn */
    case 40: case 41: case 42: case 43:          /* track buttons */
    case 49: case 50: case 51: case 52:          /* Shift Menu Back Capture */
    case 54: case 55: case 56: case 58:          /* Down Up Undo Loop */
    case 60: case 62: case 63:                   /* Copy Left Right */
    case 71: case 72: case 73: case 74:          /* encoders 1-8 */
    case 75: case 76: case 77: case 78:
    case 85: case 86: case 88:                   /* Play Rec Mute */
    case 118: case 119:                          /* Sample Delete */
        return 1;
    default:
        return 0;
    }
}

/* Is this a packet a remote page may send? Cable 0, a CIN that agrees with the
 * status, channel 1, 7-bit data, and a control the Move's surface has. */
static inline int
remote_surface_valid(const uint8_t pkt[4])
{
    const uint8_t cable = pkt[0] >> 4, cin = pkt[0] & 0x0F;
    const uint8_t status = pkt[1], type = status & 0xF0;
    if (cable != 0) return 0;
    if ((status & 0x0F) != 0) return 0;
    if ((type >> 4) != cin) return 0;
    if ((pkt[2] & 0x80) || (pkt[3] & 0x80)) return 0;
    if (type == 0x90 || type == 0x80) return remote_surface_note_ok(pkt[2]);
    if (type == 0xB0) return remote_surface_cc_ok(pkt[2]);
    return 0;
}

#endif /* REMOTE_SURFACE_H */
