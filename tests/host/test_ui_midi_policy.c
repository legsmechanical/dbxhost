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
#include <string.h>
#include "shadow_ui_midi_policy.h"
#include "ui_midi_ring.h"

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

    printf("the reserve itself (ring cursor):\n");

    /* The producer's exact rule (schwung_shim.c shadow_ui_midi_publish): a
     * yielding event is refused when the reserve would be eaten; otherwise it
     * goes to the ring at the cursor. */
    {
        static uint8_t ring[256];                    /* 64 packets, as the shim */
        int wr = 0, rd = 0;
        #define KNOB(v)  (!(shadow_ui_midi_reserve_blocks(ring, 256, wr)) && \
                          ui_midi_ring_put(ring, 256, &wr, 0x0B, 0xB0, 71, (v)))
        #define NOTEOFF(v) ui_midi_ring_put(ring, 256, &wr, 0x08, 0x80, 60, (v))
        memset(ring, 0, sizeof ring);
        int placed = 0;
        for (int k = 0; k < 55; k++) placed += NOTEOFF(k);  /* 55 used, 9 free */
        check("setup: 55 packets placed", placed == 55);
        check("9 free: a knob detent is placed", KNOB(1));       /* now 8 free */
        check("8 free: a knob detent YIELDS", !KNOB(2));
        check("8 free: a note-off at the same cursor is placed", NOTEOFF(99));
        int more = 0;
        for (int k = 0; k < 7; k++) more += NOTEOFF(k);
        check("a release fills the reserve to the last slot", more == 7);
        check("full: even a release is refused (dropped, never overwrites)", !NOTEOFF(0));

        /* Across the wrap: drain 40, then the same arithmetic from a cursor
         * that has gone round the end of the array. */
        for (int k = 0; k < 40; k++) {
            int at = ui_midi_ring_next(ring, 256, &rd);
            if (at < 0) break;
            ui_midi_ring_advance(&rd, 256);
            __atomic_store_n(&ring[at], 0, __ATOMIC_RELEASE);
        }
        placed = 0;
        for (int k = 0; k < 31; k++) placed += NOTEOFF(k);   /* 40 free -> 9 free, cursor wrapped */
        check("wrap setup: cursor went round the end", placed == 31 && wr < 64 * 4 / 2);
        check("wrapped, 9 free: a knob detent is placed", KNOB(3));
        check("wrapped, 8 free: a knob detent YIELDS", !KNOB(4));
        check("wrapped, 8 free: a note-off is placed", NOTEOFF(5));
        #undef KNOB
        #undef NOTEOFF
    }
    /* A ring no bigger than the reserve holds everything back from a knob. */
    {
        static uint8_t tiny[32];
        memset(tiny, 0, sizeof tiny);
        check("undersized ring: a knob always yields", shadow_ui_midi_reserve_blocks(tiny, 32, 0));
        check("zero-length ring: a knob always yields", shadow_ui_midi_reserve_blocks(tiny, 0, 0));
    }

    printf(fails ? "FAILED\n" : "PASSED\n");
    return fails;
}
