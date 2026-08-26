/* test_ui_midi_policy — only a hardware knob may yield its place in the
 * shim -> shadow_ui MIDI ring.
 *
 * The reserve exists so that when the ring is full, the event that gets dropped
 * is a knob detent (recoverable: the turn ends a click short) rather than a
 * button release (latches a modifier forever — the stuck-Shift bug, Josh
 * 2026-08-25). The failure mode to guard against is therefore the predicate
 * getting WIDER, not narrower: every event wrongly called "yielding" is an event
 * that can be thrown away at the moment the ring is under the most pressure.
 * That is why the negative controls below outnumber the positive ones.
 */
#include <stdio.h>
#include "shadow_ui_midi_policy.h"

static int fails = 0;

static void check(const char *what, int cond) {
    if (cond) { printf("  ok   %s\n", what); }
    else      { printf("  FAIL %s\n", what); fails = 1; }
}

int main(void) {
    printf("yielding events (may be dropped for a press/release):\n");

    /* The nine relative encoders on the hardware surface, cable 0 / CIN 0x0B. */
    for (int cc = 71; cc <= 79; cc++) {
        char label[64];
        snprintf(label, sizeof label, "cable 0 CC %d yields", cc);
        check(label, shadow_ui_midi_event_yields(0x0B, 0xB0, (uint8_t)cc) == 1);
    }
    /* Channel is not part of the predicate — Move sends on ch 1, but a knob is
     * a knob whatever the low nibble says. */
    check("CC 79 on channel 16 yields", shadow_ui_midi_event_yields(0x0B, 0xBF, 79) == 1);

    printf("events that must NEVER yield:\n");

    /* Buttons. Each of these has a release whose loss latches something. */
    check("Shift (CC 49) holds",       shadow_ui_midi_event_yields(0x0B, 0xB0, 49) == 0);
    check("jog wheel (CC 14) holds",   shadow_ui_midi_event_yields(0x0B, 0xB0, 14) == 0);
    check("jog click (CC 3) holds",    shadow_ui_midi_event_yields(0x0B, 0xB0, 3)  == 0);
    check("back (CC 51) holds",        shadow_ui_midi_event_yields(0x0B, 0xB0, 51) == 0);
    check("track btn (CC 40) holds",   shadow_ui_midi_event_yields(0x0B, 0xB0, 40) == 0);
    check("mute (CC 88) holds",        shadow_ui_midi_event_yields(0x0B, 0xB0, 88) == 0);

    /* Off-by-one at both ends of the encoder range. */
    check("CC 70 holds",               shadow_ui_midi_event_yields(0x0B, 0xB0, 70) == 0);
    check("CC 80 holds",               shadow_ui_midi_event_yields(0x0B, 0xB0, 80) == 0);

    /* Notes: pads and the volume-knob capacitive touch (note 8). A dropped
     * note-off is a stuck pad or a stuck touch state. */
    check("note-on 60 holds",          shadow_ui_midi_event_yields(0x09, 0x90, 60) == 0);
    check("note-off 60 holds",         shadow_ui_midi_event_yields(0x08, 0x80, 60) == 0);
    check("volume touch (note 8) holds", shadow_ui_midi_event_yields(0x09, 0x90, 8) == 0);

    /* An external controller's CC 79 is somebody's mapped parameter, not our
     * master knob: cable 2, so it keeps its place. */
    check("cable 2 CC 79 holds",       shadow_ui_midi_event_yields(0x2B, 0xB0, 79) == 0);
    check("cable 1 CC 71 holds",       shadow_ui_midi_event_yields(0x1B, 0xB0, 71) == 0);

    /* CIN and status must AGREE that this is a CC. A torn or mislabelled packet
     * is not something to start discarding under pressure. */
    check("CIN says CC, status says note-on: holds",
          shadow_ui_midi_event_yields(0x0B, 0x90, 79) == 0);
    check("status says CC, CIN says note-on: holds",
          shadow_ui_midi_event_yields(0x09, 0xB0, 79) == 0);

    printf("the reserve itself:\n");

    /* 8 packets of the 64-packet ring, expressed in bytes. */
    check("64-packet ring reserves 8 packets",
          shadow_ui_midi_yield_limit(256) == 256 - 8 * 4);
    check("a knob may still use most of the ring",
          shadow_ui_midi_yield_limit(256) == 224);
    /* A ring smaller than the reserve must clamp to zero, not go negative and
     * turn the scan bound into a huge positive int. */
    check("undersized ring clamps to 0", shadow_ui_midi_yield_limit(16) == 0);
    check("zero-length ring clamps to 0", shadow_ui_midi_yield_limit(0) == 0);

    printf(fails ? "FAILED\n" : "PASSED\n");
    return fails;
}
