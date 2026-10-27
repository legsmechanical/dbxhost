/* The POWER button's one decision in the shim, pulled out so it is testable
 * without the shim (tests/host/test_shim_power_gate.c). No side effects beyond
 * the one byte store; this runs on the SPI thread.
 *
 * The power button reaches the shim only as a SysEx (schwung_shim.c, the
 * lookahead before the MIDI_IN filter). Normally it is passed to Move intact so
 * Move can raise "Press wheel to shut down". An overtake module that claimed
 * the button (shadow_control->power_claim) answers it itself: the SysEx is held
 * back from Move and the message's press and value bytes are stored for
 * shadow_ui, which decides whether it IS a press (a tester on 1.1.0 got the
 * module's power-off question every few minutes untouched, so the shim no
 * longer takes every power SysEx for a press) and logs each one.
 */
#ifndef SHIM_POWER_GATE_H
#define SHIM_POWER_GATE_H

#include <stdint.h>
#include "shadow_constants.h"

/* For one packet of the power SysEx: returns 1 = hold it back from Move,
 * 0 = let it through. `lead` = this is the message's first packet, the one
 * that stores the bytes (once per message, not once per packet). */
static inline int shim_power_gate(int overtake_mode, shadow_control_t *ctrl,
                                  int lead, uint8_t press, uint8_t value) {
    if (overtake_mode != 2 || !ctrl || !ctrl->power_claim) return 0;
    if (lead) {
        ctrl->power_button = press;
        ctrl->power_value = value;
        ctrl->power_seen = 1;          /* last: the reader keys on it */
    }
    return 1;
}

#endif /* SHIM_POWER_GATE_H */
