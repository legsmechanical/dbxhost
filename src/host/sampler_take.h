/* sampler_take.h — the length arithmetic of a fixed-length module take
 * (move_host_ext_v1_t.capture_start): how many frames of this block the take
 * still wants. A take ends inside a block, not on its edge, so the file is
 * exactly the length the module asked for — a loop that is a block long or
 * short does not loop.
 *
 * Pure and header-only so tests/host can run it (test_sampler_take.c). */
#ifndef SAMPLER_TAKE_H
#define SAMPLER_TAKE_H

#include <stdint.h>

/* Frames of a `block_frames` block to keep, taken off `*frames_left`.
 * Returns 0 once the take is complete. */
static inline uint32_t sampler_take_block_frames(uint32_t *frames_left, uint32_t block_frames) {
    uint32_t n = (*frames_left < block_frames) ? *frames_left : block_frames;
    *frames_left -= n;
    return n;
}

#endif /* SAMPLER_TAKE_H */
