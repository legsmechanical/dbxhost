/* The POWER button, pulled out of the shim and the D-Bus handler so both
 * decisions are testable without them (tests/host/test_shim_power_gate.c).
 *
 * The power button reaches the shim only as a SysEx (schwung_shim.c, the
 * lookahead before the MIDI_IN filter), and that SysEx is ALWAYS passed to
 * Move intact — claimed or not. It is not only the button: the same message
 * carries Move's battery and charger reports (measured on hardware: a level
 * report every 1.5-3 min on battery, a pair on every plug/unplug), and its
 * first byte is a set of flags, not a press code.
 *
 * Holding it back was tried (1.1.0) and was wrong twice over: a report was
 * taken for a press (the module's power-off question every few minutes,
 * untouched), and a real press held back from Move was NOT consumed — Move kept
 * it pending, sent no further presses for the rest of the session, and raised
 * its own "Press wheel to shut down" the moment the session ended.
 *
 * So Move decides what is a press, and says so: it announces its prompt over
 * D-Bus. A module that claimed the button (shadow_control->power_claim) while
 * it owns the screen gets the press from that announcement
 * (shim_power_prompt_claimed), and the host taps Back into Move to close
 * Move's prompt at once, so nothing is left pending; the module asks its own
 * question.
 */
#ifndef SHIM_POWER_GATE_H
#define SHIM_POWER_GATE_H

#include <stdint.h>
#include <strings.h>
#include "shadow_constants.h"

/* For one packet of the power SysEx, on the SPI thread: always 0 — let it
 * through, intact. While a module claims the button, the lead packet's two
 * bytes are recorded for shadow_ui's log (`lead` = the message's first packet,
 * so once per message). No side effects beyond those stores. */
static inline int shim_power_gate(int overtake_mode, shadow_control_t *ctrl,
                                  int lead, uint8_t press, uint8_t value) {
    if (lead && overtake_mode == 2 && ctrl && ctrl->power_claim) {
        ctrl->power_button = press;
        ctrl->power_value = value;
        ctrl->power_seen = 1;          /* last: the reader keys on it */
    }
    return 0;
}

/* Move's text announcing its power prompt. */
#define MOVE_POWER_PROMPT_TEXT "Press wheel to shut down"

/* For one D-Bus announcement: returns 1 when it is Move's power prompt and a
 * module owning the screen claimed the button — the press is then flagged for
 * shadow_ui (ctrl->power_prompt) and the caller must close Move's prompt and
 * leave the screen with the module. 0 = not ours; Move's prompt flow applies. */
static inline int shim_power_prompt_claimed(shadow_control_t *ctrl, const char *text) {
    if (!ctrl || !text || strcasecmp(text, MOVE_POWER_PROMPT_TEXT) != 0) return 0;
    if (ctrl->overtake_mode != 2 || !ctrl->power_claim) return 0;
    ctrl->power_prompt = 1;
    return 1;
}

#endif /* SHIM_POWER_GATE_H */
