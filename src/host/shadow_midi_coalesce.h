/*
 * shadow_midi_coalesce.h — merge relative-encoder CCs before publishing them.
 *
 * WHY: the tool process drains the forwarded-MIDI buffer only between JS
 * callbacks, through a 64-slot ring that DROPS SILENTLY when full. A knob turn
 * is the densest thing the control surface produces, and a dropped RELEASE
 * latches a modifier forever — that is the stuck-Shift bug (Josh, 2026-08-25:
 * the Shift+bottom-row LEDs kept animating after Shift+volume). Fewer knob
 * events in the ring means fewer chances to push a release off the end.
 *
 * ⭑ LOSSLESS, not an approximation. Move's knobs are RELATIVE encoders: a
 * message says "+2" or "-1", never "position 47". Summing deltas lands on the
 * identical value, so N events collapse to one with nothing lost. dAVEBOx's own
 * handlers already perform this exact sum — CC 79 is
 * `S.tvDeltaAcc += decodeDelta(d2)`, and `_onCC_knobs` documents 71-78 as
 * relative — so doing it one layer earlier is provably equivalent, not a new
 * behaviour.
 *
 * ⚠⚠ NEVER extend this to NOTES or BUTTONS. Every press AND release must
 * survive: those are precisely the events whose loss sticks, and merging them
 * would manufacture the bug this exists to make rarer. Only continuous relative
 * controls may be merged.
 *
 * ⚠ SCOPE: one frame's buffer. The stronger version — merging into an
 * unconsumed slot already sitting in the ring, which would bound knob traffic to
 * one slot per knob however long the consumer is blocked — requires changing the
 * publish/consume protocol on BOTH sides to read the 4-byte packet atomically.
 * Deliberately not done here.
 */
#ifndef SHADOW_MIDI_COALESCE_H
#define SHADOW_MIDI_COALESCE_H

#include <stdint.h>

/* The relative-encoder CCs on Move: the eight parameter knobs and the master /
 * volume knob. Anything not named here is left strictly alone. */
static inline int shadow_cc_is_relative_encoder(uint8_t cc) {
    return (cc >= 71 && cc <= 78) || cc == 79;
}

/* Decode Move's relative-encoder byte: 1..63 = +n, 65..127 = n-128, 0/64 = 0. */
static inline int32_t shadow_rel_decode(uint8_t v) {
    if (v >= 1 && v <= 63) return (int32_t)v;
    if (v >= 65)           return (int32_t)v - 128;
    return 0;
}

/* Re-encode a summed delta. Clamped, NEVER wrapped: ±63 is the encoding's range
 * and a wrap would REVERSE the direction of a turn — a silent, maddening bug.
 * 63 detents inside one 2.9 ms frame is not physically reachable, so the clamp
 * cannot bite in practice; it exists so that if it ever does, the turn is merely
 * slower rather than backwards. */
static inline uint8_t shadow_rel_encode(int32_t sum) {
    if (sum > 63)  sum = 63;
    if (sum < -63) sum = -63;
    return (uint8_t)(sum > 0 ? sum : (sum + 128));
}

/* Merge every relative-encoder CC in `buf` (USB-MIDI, 4 bytes per packet) into
 * its FIRST occurrence, zeroing the rest. Same channel+CC only. A run that sums
 * to zero is removed entirely — the knob ended where it started, so there is
 * nothing to report.
 *
 * Operates on a caller-owned buffer BEFORE publication, so it can never race a
 * consumer. */
static inline void shadow_coalesce_relative_ccs(uint8_t *buf, int len) {
    if (!buf) return;
    for (int a = 0; a + 3 < len; a += 4) {
        uint8_t st = buf[a + 1], cc = buf[a + 2];
        if ((st & 0xF0) != 0xB0) continue;
        if (!shadow_cc_is_relative_encoder(cc)) continue;

        int32_t sum = shadow_rel_decode(buf[a + 3]);
        for (int b = a + 4; b + 3 < len; b += 4) {
            if (buf[b + 1] != st || buf[b + 2] != cc) continue;
            sum += shadow_rel_decode(buf[b + 3]);
            buf[b] = buf[b + 1] = buf[b + 2] = buf[b + 3] = 0;
        }
        if (sum == 0) {
            buf[a] = buf[a + 1] = buf[a + 2] = buf[a + 3] = 0;
        } else {
            buf[a + 3] = shadow_rel_encode(sum);
        }
    }
}

#endif /* SHADOW_MIDI_COALESCE_H */
