/* The POWER button's one decision in the shim, pulled out so it is testable
 * without the shim (tests/host/test_shim_power_gate.c). No side effects beyond
 * the one byte store; this runs on the SPI thread.
 *
 * The power button reaches the shim only as a SysEx (schwung_shim.c, the
 * lookahead before the MIDI_IN filter). Normally it is passed to Move intact so
 * Move can raise "Press wheel to shut down". An overtake module that claimed
 * the button (shadow_control->power_claim) answers it itself: the SysEx is held
 * back from Move and the press — its id byte, 0x2A tap / 0x3A hold — is stored
 * for shadow_ui to hand to the module. Tap and hold are treated alike here.
 */
#ifndef SHIM_POWER_GATE_H
#define SHIM_POWER_GATE_H

#include <stdint.h>

/* For one packet of the power SysEx: returns 1 = hold it back from Move,
 * 0 = let it through. `lead` = this is the message's first packet, the one
 * that stores the press (once per message, not once per packet). */
static inline int shim_power_gate(int overtake_mode, volatile uint8_t *claim,
                                  volatile uint8_t *button, int lead, uint8_t id) {
    if (overtake_mode != 2 || !claim || !*claim) return 0;
    if (lead && button) *button = id;
    return 1;
}

#endif /* SHIM_POWER_GATE_H */
