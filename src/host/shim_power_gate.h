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

/* Move announces each prompt TWICE, ~2 ms apart (as it does other texts); a
 * repeat inside this window is the same prompt, not a second press. */
#define MOVE_POWER_PROMPT_REPEAT_MS 500

/* For one D-Bus announcement at `now_ms`: returns 1 when it is Move's power
 * prompt and a module owning the screen claimed the button — the press is
 * then flagged for shadow_ui (ctrl->power_prompt) and the caller must close
 * Move's prompt and leave the screen with the module. 2 = the same prompt
 * announced again: still ours (keep the screen), but nothing to do. 0 = not
 * ours; Move's prompt flow applies. `*last_ms` is the caller's memory of the
 * last press (0 = none). */
static inline int shim_power_prompt_claimed(shadow_control_t *ctrl, const char *text,
                                            uint64_t now_ms, uint64_t *last_ms) {
    if (!ctrl || !text || strcasecmp(text, MOVE_POWER_PROMPT_TEXT) != 0) return 0;
    if (ctrl->overtake_mode != 2 || !ctrl->power_claim) return 0;
    if (*last_ms && now_ms - *last_ms < MOVE_POWER_PROMPT_REPEAT_MS) return 2;
    *last_ms = now_ms;
    ctrl->power_prompt = 1;
    return 1;
}

/* Move's OUTGOING power messages must reach the hardware too. After its
 * prompt is closed Move sends F0 00 21 1D 01 01 39 02 F7, which re-arms the
 * button: only then does the hardware report the press cleared (its 0x08 flag
 * drops) and send the next press. Measured: in stock, one 39 02 and the clear
 * report follows; under a full overtake the LED strip removed it — Move
 * retried 48 times and the button stayed dead until the session ended. 0x3A
 * is the power subsystem's other command (Move's own query, F0 ... 3A F7).
 *
 * For the packet at `i` of a MIDI_OUT buffer: if it starts one of those
 * messages on cable 0 (F0 00 21 / 1D 01 01 / 39|3A ...), returns how many
 * bytes the whole message spans, through its end packet (CIN 5-7); else 0. */
static inline int move_power_sysex_out_span(const uint8_t *out, int i, int size) {
    if (i + 12 > size) return 0;
    if ((out[i] & 0xF0) != 0x00 || (out[i] & 0x0F) != 0x04) return 0;
    if (out[i + 1] != 0xF0 || out[i + 2] != 0x00 || out[i + 3] != 0x21) return 0;
    if (out[i + 4] != 0x04 || out[i + 5] != 0x1D || out[i + 6] != 0x01 || out[i + 7] != 0x01) return 0;
    if ((out[i + 8] & 0xF0) != 0x00 || (out[i + 9] != 0x39 && out[i + 9] != 0x3A)) return 0;
    for (int j = i + 8; j + 4 <= size; j += 4) {
        uint8_t cin = out[j] & 0x0F;
        if ((out[j] & 0xF0) != 0x00 || cin < 0x04 || cin > 0x07) return 0;
        if (cin != 0x04) return j + 4 - i;   /* the end packet */
    }
    return 0;
}

#endif /* SHIM_POWER_GATE_H */
