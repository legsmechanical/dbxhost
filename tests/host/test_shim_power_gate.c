/*
 * The POWER button (src/host/shim_power_gate.h). The power SysEx ALWAYS goes
 * to Move — it carries battery and charger reports as well as the button, and
 * a press held back from Move stays pending there — and is only recorded for
 * the log while a module on screen (overtake mode 2) claims the button. The
 * press reaches the module from Move's own "Press wheel to shut down"
 * announcement instead. And the bytes that carry it were APPENDED to
 * shadow_control_t (sizeof is a contract between two binaries: appending is
 * free, inserting is not).
 */
#include <stddef.h>
#include <stdio.h>
#include "shadow_constants.h"
#include "shim_power_gate.h"

static int fails = 0;
#define OK(c, what) do { if (c) printf("  ok   %s\n", what); else { printf("  FAIL %s\n", what); fails++; } } while (0)

int main(void) {
    static shadow_control_t c;

    /* The SysEx: to Move in every mode, claimed or not, every packet. */
    for (int claim = 0; claim <= 1; claim++)
        for (int mode = 0; mode <= 2; mode++) {
            c.power_claim = (uint8_t)claim;
            OK(shim_power_gate(mode, &c, 1, 0x2A, 0x64) == 0 &&
               shim_power_gate(mode, &c, 0, 0x2A, 0x64) == 0,
               "a power SysEx packet always goes to Move");
        }
    OK(shim_power_gate(2, NULL, 1, 0x2A, 0x64) == 0, "no control block: to Move");

    /* Recorded for the log only while claimed in mode 2, from the LEAD only. */
    c.power_claim = 0; c.power_seen = 0;
    shim_power_gate(2, &c, 1, 0x2A, 0x64);
    OK(c.power_seen == 0, "not claimed: nothing recorded");
    c.power_claim = 1;
    shim_power_gate(1, &c, 1, 0x2A, 0x64);
    OK(c.power_seen == 0, "claimed but overtake 1 (menu): nothing recorded");
    shim_power_gate(2, &c, 1, 0x08, 0x5d);
    OK(c.power_seen == 1 && c.power_button == 0x08 && c.power_value == 0x5d,
       "claimed, mode 2: a battery report is recorded as-is");
    c.power_seen = 0;
    shim_power_gate(2, &c, 0, 0x99, 0x11);
    OK(c.power_seen == 0 && c.power_button == 0x08, "a non-lead packet records nothing");

    /* Move's prompt announcement: the press, only while claimed in mode 2. */
    uint64_t last = 0;
    c.power_prompt = 0; c.power_claim = 1; c.overtake_mode = 2;
    OK(shim_power_prompt_claimed(&c, "Press wheel to shut down", 1000, &last) == 1 && c.power_prompt == 1,
       "claimed, mode 2: Move's prompt is the module's press");
    c.power_prompt = 0;
    OK(shim_power_prompt_claimed(&c, "Press wheel to shut down", 1002, &last) == 2 && c.power_prompt == 0,
       "the same prompt announced again 2 ms later: ours, but not a second press");
    OK(shim_power_prompt_claimed(&c, "press wheel to SHUT DOWN", 1600, &last) == 1 && c.power_prompt == 1,
       "a prompt after the repeat window is a new press (case-insensitive, as the stock branch)");
    c.power_prompt = 0;
    OK(shim_power_prompt_claimed(&c, "Move terminated", 5000, &last) == 0 && c.power_prompt == 0,
       "any other announcement is not a press");
    c.power_claim = 0;
    OK(shim_power_prompt_claimed(&c, "Press wheel to shut down", 9000, &last) == 0 && c.power_prompt == 0,
       "not claimed: Move's own prompt flow");
    c.power_claim = 1; c.overtake_mode = 1;
    OK(shim_power_prompt_claimed(&c, "Press wheel to shut down", 9000, &last) == 0 && c.power_prompt == 0,
       "claimed but overtake 1 (menu): Move's own prompt flow");
    OK(shim_power_prompt_claimed(NULL, "Press wheel to shut down", 9000, &last) == 0, "no control block: not ours");

    /* Layout: appended after pad_observe, inside the segment. */
    OK(offsetof(shadow_control_t, power_claim) > offsetof(shadow_control_t, pad_observe) &&
       offsetof(shadow_control_t, power_button) > offsetof(shadow_control_t, power_claim) &&
       offsetof(shadow_control_t, power_value) > offsetof(shadow_control_t, power_button) &&
       offsetof(shadow_control_t, power_seen) > offsetof(shadow_control_t, power_value) &&
       offsetof(shadow_control_t, power_prompt) > offsetof(shadow_control_t, power_seen),
       "the power bytes are appended after pad_observe");
    OK(sizeof(shadow_control_t) <= CONTROL_BUFFER_SIZE, "shadow_control_t still fits its segment");

    if (fails) { printf("FAIL: test_shim_power_gate\n"); return 1; }
    printf("PASS: test_shim_power_gate\n"); return 0;
}
