/* sampler_take_tap.h — the ONE-SLOT source of a module take
 * (move_host_ext_v1_t.capture_start_src, MOVE_CAPTURE_SLOT): which slot's mix
 * contribution to keep, and how a sample is kept. The shim fills one block from
 * the slot's own mix loop; a block it did not fill is silence.
 *
 * Pure and header-only so tests/host can run it (test_sampler_take.c). */
#ifndef SAMPLER_TAKE_TAP_H
#define SAMPLER_TAKE_TAP_H

#include <stdint.h>

#define SAMPLER_TAKE_SRC_MIX   0   /* = MOVE_CAPTURE_MIX  */
#define SAMPLER_TAKE_SRC_SLOT  1   /* = MOVE_CAPTURE_SLOT */
#define SAMPLER_TAKE_SRC_PRE   2   /* = MOVE_CAPTURE_SLOT_PRE: the instrument, before FX */
#define SAMPLER_TAKE_SRC_FX    3   /* = MOVE_CAPTURE_SLOT_FX: after FX, at unity */
#define SAMPLER_TAKE_SRC_MOVE     4   /* = MOVE_CAPTURE_MOVE: a Move bus after its inserts, at its fader */
#define SAMPLER_TAKE_SRC_MOVE_PRE 5   /* = MOVE_CAPTURE_MOVE_PRE: the Move track, before them */
#define SAMPLER_TAKE_SRC_MOVE_FX  6   /* = MOVE_CAPTURE_MOVE_FX: after them, at unity */

/* Does slot `slot`'s contribution belong to the take? (Its mix loop.) */
static inline int sampler_take_tap_wants(int take, int kind, int index, int slot) {
    return take && (kind == SAMPLER_TAKE_SRC_SLOT || kind == SAMPLER_TAKE_SRC_FX) && index == slot;
}

/* ...or Move bus `bus`'s? (Its block in the same loop.) */
static inline int sampler_take_tap_wants_move(int take, int kind, int index, int bus) {
    return take && (kind == SAMPLER_TAKE_SRC_MOVE || kind == SAMPLER_TAKE_SRC_MOVE_PRE
                    || kind == SAMPLER_TAKE_SRC_MOVE_FX) && index == bus;
}

/* Is the source at unity — no fader, pan, mute or solo? (A bounce that goes on
 * playing through the same fader must not carry it twice.) */
static inline int sampler_take_tap_unity(int kind) {
    return kind == SAMPLER_TAKE_SRC_FX || kind == SAMPLER_TAKE_SRC_MOVE_PRE || kind == SAMPLER_TAKE_SRC_MOVE_FX;
}

/* ...or its instrument's output, before the FX? (Its render task.) */
static inline int sampler_take_tap_wants_pre(int take, int kind, int index, int slot) {
    return take && kind == SAMPLER_TAKE_SRC_PRE && index == slot;
}

/* Does the take read the tap at all (rather than the mix)? */
static inline int sampler_take_from_tap(int take, int kind) {
    return take && kind >= SAMPLER_TAKE_SRC_SLOT && kind <= SAMPLER_TAKE_SRC_MOVE_FX;
}

/* Is the slot silenced in the mix — muted, or soloed out? A one-slot take is
 * that slot's stem, and a stem ignores mute and solo (an export takes every
 * track, muted or not): a silenced slot's take keeps the slot AS SET
 * (sampler_take_tap_as_set) instead of the mix's zero. */
static inline int sampler_take_tap_silenced(int muted, int solo_count, int soloed) {
    return muted || (solo_count > 0 && !soloed);
}

/* The slot as set, for sample i (even = left): its volume and pan. */
static inline float sampler_take_tap_as_set(float volume, float pan_l, float pan_r, int i) {
    return volume * ((i & 1) ? pan_r : pan_l);
}

/* A contribution as the file keeps it: the mix's own rounding, clamped. */
static inline int16_t sampler_take_tap_sample(int32_t contrib) {
    if (contrib > 32767) return 32767;
    if (contrib < -32768) return -32768;
    return (int16_t)contrib;
}

#endif /* SAMPLER_TAKE_TAP_H */
