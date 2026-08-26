/*
 * shadow_midi_coalesce.h — merge relative-encoder CCs before publishing them.
 *
 * ⚠⚠ SCOPE, verified on the device 2026-08-26: this helper's ONE caller is
 * shadow_forward_midi(), which publishes to SHM_SHADOW_MIDI ("MIDI to shadow
 * DSP") — a segment NOTHING in the running system maps. `fuser` on a live
 * device shows no process attached to /dev/shm/dbxhost-midi at all, and the
 * only reader in the tree is examples/shadow_poc.c.
 *
 * The ring a tool actually reads is a DIFFERENT one: SHM_SHADOW_UI_MIDI, filled
 * post-ioctl by schwung_shim.c::shadow_ui_midi_publish() from the UNFILTERED
 * hardware buffer. Coalescing here therefore does not reduce that ring's
 * pressure, and it cannot change how any knob feels — under overtake mode the
 * buffer this path reads has already had every cable-0 surface event filtered
 * out of it, so a knob detent never reaches here in the first place.
 *
 * ⚠ That matters historically: the "knob crawl" attributed to 3a98ec6b
 * (2026-08-25) and "fixed" by 760d7fb5 cannot have been caused by either commit.
 * Both touched only this dead path. The crawl is dAVEBOx's own ccKnobDelta()
 * discarding the encoder magnitude, which predates both by a month.
 *
 * Left in place rather than deleted: the merge itself is correct and tested, and
 * whether SHM_SHADOW_MIDI has any future is a separate decision. But do not
 * reach for this helper expecting it to relieve ring pressure — the reserve in
 * shadow_ui_midi_policy.h is what does that.
 *
 * WHY: the tool process drains the forwarded-MIDI buffer only between JS
 * callbacks, through a 64-slot ring that DROPS SILENTLY when full. A knob turn
 * is the densest thing the control surface produces, and a dropped RELEASE
 * latches a modifier forever — that is the stuck-Shift bug (Josh, 2026-08-25:
 * the Shift+bottom-row LEDs kept animating after Shift+volume). Fewer knob
 * events in the ring means fewer chances to push a release off the end.
 *
 * ⭑ LOSSLESS **for CC 79**, because dAVEBOx sums that one's deltas itself:
 * `S.tvDeltaAcc += decodeDelta(d2)`. Move's knobs are relative encoders ("+2",
 * "-1", never "position 47"), so for a consumer that reads the magnitude,
 * merging N events into one carrying the sum lands on the identical value.
 * ⚠ That property belongs to the CONSUMER, not to the encoder — see the scope
 * note on shadow_cc_is_relative_encoder() for why 71-78 are excluded.
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

/* ⚠⚠ CC 79 ONLY — the master / volume knob. NOT the parameter knobs 71-78.
 *
 * Whether merging is lossless depends entirely on how the CONSUMER reads the
 * value, and the two differ:
 *
 *   CC 79   dAVEBOx does `S.tvDeltaAcc += decodeDelta(d2)` — magnitude-aware,
 *           a genuine sum. Merging N events into one carrying the summed delta
 *           is exactly equivalent.
 *
 *   71-78   `ccKnobDelta()` reads only the SIGN of d2 and then COUNTS EVENTS:
 *           `S.knobAccelRun[k]++`, with the acceleration gain stepping 1→2→4→6
 *           as that run grows. One event IS one click regardless of magnitude.
 *           Merging four detents into a single "+4" therefore throws away three
 *           clicks AND starves the acceleration ramp — the knob becomes very
 *           slow across its range.
 *
 * ⚠ That regression shipped for one commit (3a98ec6b, 2026-08-25) and Josh
 * caught it on hardware within the hour: "the knob seems really slow to go from
 * min-to-max". The mistake was verifying CC 79's handler, then generalising to
 * 71-78 from a DOC COMMENT ("d2 1-63 = CW (+1)") instead of reading
 * ccKnobDelta. Before adding any CC here, read the code that CONSUMES it. */
static inline int shadow_cc_is_relative_encoder(uint8_t cc) {
    return cc == 79;
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
