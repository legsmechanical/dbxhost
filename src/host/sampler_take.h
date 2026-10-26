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
#include <stdio.h>
#include <string.h>

/* Frames of a `block_frames` block to keep, taken off `*frames_left`.
 * Returns 0 once the take is complete. */
static inline uint32_t sampler_take_block_frames(uint32_t *frames_left, uint32_t block_frames) {
    uint32_t n = (*frames_left < block_frames) ? *frames_left : block_frames;
    *frames_left -= n;
    return n;
}

/* The shallowest directory of `dir` that does not exist yet (`dir` itself
 * when only it is missing) — where a `mkdir -p dir` starts creating, so the
 * one place a `chown -R` must start for every created directory to be
 * handed over. `exists` answers for a path. */
static inline void sampler_shallowest_missing(const char *dir, int (*exists)(const char *),
                                              char *out, size_t out_len) {
    snprintf(out, out_len, "%s", dir);
    for (;;) {
        char up[256];
        snprintf(up, sizeof(up), "%s", out);
        char *sl = strrchr(up, '/');
        if (!sl || sl == up) return;
        *sl = '\0';
        if (exists(up)) return;
        snprintf(out, out_len, "%s", up);
    }
}

#endif /* SAMPLER_TAKE_H */
