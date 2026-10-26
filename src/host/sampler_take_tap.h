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

/* Does slot `slot`'s contribution belong to the take? */
static inline int sampler_take_tap_wants(int take, int kind, int index, int slot) {
    return take && kind == SAMPLER_TAKE_SRC_SLOT && index == slot;
}

/* A contribution as the file keeps it: the mix's own rounding, clamped. */
static inline int16_t sampler_take_tap_sample(int32_t contrib) {
    if (contrib > 32767) return 32767;
    if (contrib < -32768) return -32768;
    return (int16_t)contrib;
}

#endif /* SAMPLER_TAKE_TAP_H */
