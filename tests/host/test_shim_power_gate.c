/*
 * The POWER button's decision in the shim (src/host/shim_power_gate.h): Move
 * keeps its own power prompt unless the module on screen (overtake mode 2)
 * claimed the button; then the SysEx is held back and its press + value bytes
 * stored, once per message and unjudged, for shadow_ui to decide on. And the two bytes that
 * carry it were APPENDED to shadow_control_t (sizeof is a contract between two
 * binaries: appending is free, inserting is not).
 */
#include <stddef.h>
#include <stdio.h>
#include "shadow_constants.h"
#include "shim_power_gate.h"

static int fails = 0;
#define OK(c, what) do { if (c) printf("  ok   %s\n", what); else { printf("  FAIL %s\n", what); fails++; } } while (0)

int main(void) {
    static shadow_control_t c;

    /* Unclaimed: Move gets it, in every mode, and nothing is stored. */
    for (int mode = 0; mode <= 2; mode++) {
        c.power_claim = 0; c.power_seen = 0;
        OK(shim_power_gate(mode, &c, 1, 0x2A, 0x64) == 0 && c.power_seen == 0,
           mode == 2 ? "mode 2, not claimed: to Move, nothing stored" : "mode 0/1, not claimed: to Move");
    }
    /* Claimed, but no module owns the screen (menu / native): Move's prompt. */
    c.power_claim = 1;
    OK(shim_power_gate(0, &c, 1, 0x2A, 0x64) == 0 && c.power_seen == 0, "claimed but overtake 0: to Move");
    OK(shim_power_gate(1, &c, 1, 0x2A, 0x64) == 0 && c.power_seen == 0, "claimed but overtake 1 (menu): to Move");
    /* Claimed in mode 2: held back, every packet; stored from the LEAD only. */
    OK(shim_power_gate(2, &c, 1, 0x2A, 0x64) == 1 && c.power_seen == 1 &&
       c.power_button == 0x2A && c.power_value == 0x64, "claimed, mode 2: held back, press + value stored");
    c.power_seen = 0;
    OK(shim_power_gate(2, &c, 0, 0x99, 0x11) == 1 && c.power_seen == 0 && c.power_button == 0x2A,
       "a non-lead packet is held back and stores nothing");
    /* Not judged here: an unknown press byte is stored as-is for shadow_ui. */
    OK(shim_power_gate(2, &c, 1, 0x05, 0x00) == 1 && c.power_seen == 1 &&
       c.power_button == 0x05 && c.power_value == 0x00, "an unknown message is stored as-is, not judged");
    OK(shim_power_gate(2, NULL, 1, 0x2A, 0x64) == 0, "no control block: to Move");

    /* Layout: appended after pad_observe, inside the segment. */
    OK(offsetof(shadow_control_t, power_claim) > offsetof(shadow_control_t, pad_observe) &&
       offsetof(shadow_control_t, power_button) > offsetof(shadow_control_t, power_claim) &&
       offsetof(shadow_control_t, power_value) > offsetof(shadow_control_t, power_button) &&
       offsetof(shadow_control_t, power_seen) > offsetof(shadow_control_t, power_value),
       "the power bytes are appended after pad_observe");
    OK(sizeof(shadow_control_t) <= CONTROL_BUFFER_SIZE, "shadow_control_t still fits its segment");

    if (fails) { printf("FAIL: test_shim_power_gate\n"); return 1; }
    printf("PASS: test_shim_power_gate\n"); return 0;
}
