/*
 * The POWER button's decision in the shim (src/host/shim_power_gate.h): Move
 * keeps its own power prompt unless the module on screen (overtake mode 2)
 * claimed the button; then the SysEx is held back and the press stored, once
 * per message, for shadow_ui to hand to the module. And the two bytes that
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
    volatile uint8_t claim = 0, button = 0;

    /* Unclaimed: Move gets it, in every mode, and nothing is stored. */
    for (int mode = 0; mode <= 2; mode++) {
        button = 0;
        OK(shim_power_gate(mode, &claim, &button, 1, 0x2A) == 0 && button == 0,
           mode == 2 ? "mode 2, not claimed: to Move, nothing stored" : "mode 0/1, not claimed: to Move");
    }
    /* Claimed, but no module owns the screen (menu / native): Move's prompt. */
    claim = 1;
    OK(shim_power_gate(0, &claim, &button, 1, 0x2A) == 0 && button == 0, "claimed but overtake 0: to Move");
    OK(shim_power_gate(1, &claim, &button, 1, 0x2A) == 0 && button == 0, "claimed but overtake 1 (menu): to Move");
    /* Claimed in mode 2: held back, every packet; stored from the LEAD only. */
    OK(shim_power_gate(2, &claim, &button, 1, 0x2A) == 1 && button == 0x2A, "claimed, mode 2: held back, tap stored");
    button = 0;
    OK(shim_power_gate(2, &claim, &button, 0, 0x99) == 1 && button == 0, "a non-lead packet is held back and stores nothing");
    OK(shim_power_gate(2, &claim, &button, 1, 0x3A) == 1 && button == 0x3A, "a hold is stored as its own id");
    OK(shim_power_gate(2, NULL, &button, 1, 0x2A) == 0, "no control block: to Move");

    /* Layout: appended after pad_observe, inside the segment. */
    OK(offsetof(shadow_control_t, power_claim) > offsetof(shadow_control_t, pad_observe) &&
       offsetof(shadow_control_t, power_button) > offsetof(shadow_control_t, power_claim),
       "power_claim / power_button are appended after pad_observe");
    OK(sizeof(shadow_control_t) <= CONTROL_BUFFER_SIZE, "shadow_control_t still fits its segment");

    if (fails) { printf("FAIL: test_shim_power_gate\n"); return 1; }
    printf("PASS: test_shim_power_gate\n"); return 0;
}
