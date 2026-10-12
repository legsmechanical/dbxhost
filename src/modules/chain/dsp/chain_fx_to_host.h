/* Pure decision helper for handing a MIDI FX's GENERATED output to the host.
 *
 * `midi_fx_to_host` (chain_internal.h) passes the notes a MIDI FX emits on its
 * own — from the clock, or from its per-block tick — to the sink the host
 * registered with chain_set_midi_fx_sink(), so a host-side sequencer can
 * record them. Extracted from chain_midi.c so the rule is unit-testable
 * without the chain host. No side effects.
 *
 * What crosses: channel-voice messages only (0x80..0xE0), two or three bytes.
 * System realtime never does — it is the clock that DROVE the generator, and
 * with no MIDI FX loaded the transform copies its input straight through, so
 * a bare 0xF8 would otherwise be "output".
 */
#ifndef CHAIN_FX_TO_HOST_H
#define CHAIN_FX_TO_HOST_H

#include <stdint.h>

/* Is `msg` (the INPUT of a v2_on_midi call) system realtime that a generator
 * runs from — Clock / Start / Continue / Stop? Only output produced in answer
 * to one of these is "generated"; output produced from a note the slot was
 * SENT is a transform of somebody else's playing (and, for a sequencer that
 * sends its own clip into the slot, an echo of what it already has). */
static inline int chain_fx_input_is_clock(const uint8_t *msg, int len) {
    return msg && len == 1 &&
           (msg[0] == 0xF8u || msg[0] == 0xFAu || msg[0] == 0xFBu || msg[0] == 0xFCu);
}

/* Returns 1 if a MIDI FX output message should be handed to the host. */
static inline int chain_fx_to_host_should_emit(int to_host, const uint8_t *msg, int len) {
    if (!to_host || !msg || len < 2 || len > 3) return 0;
    uint8_t type = msg[0] & 0xF0u;
    return type >= 0x80u && type <= 0xE0u;
}

#endif /* CHAIN_FX_TO_HOST_H */
