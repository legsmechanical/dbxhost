/* Does a message sent to a slot DIRECT (move_host_ext_v1_t.midi_send_slot_direct,
 * past its MIDI FX) also go to every OTHER slot's audio FX and to the master FX —
 * the FX broadcast every ordinary slot dispatch makes (shadow_midi.c,
 * shadow_chain_dispatch_fanout)?
 *
 * NOTES ONLY. The broadcast exists so an effect can key off what is played (a
 * ducker). What else arrives DIRECT is usually a MIDI effect's own output handed
 * back — the CCs a player sends its instrument and amp — and on stock a MIDI
 * effect's output never leaves its chain. Broadcast, two tracks with the same
 * amp heard each other: picking a preset on one track retuned the other's amp,
 * whose CC numbers are the same. Pure, no side effects: unit-tested
 * (tests/host/test_direct_fanout.c). */
#ifndef SHADOW_DIRECT_FANOUT_H
#define SHADOW_DIRECT_FANOUT_H

#include <stdint.h>

static inline int shadow_direct_fans_out(uint8_t status) {
    const uint8_t t = status & 0xF0u;
    return t == 0x90u || t == 0x80u;
}

#endif /* SHADOW_DIRECT_FANOUT_H */
