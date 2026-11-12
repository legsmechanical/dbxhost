/* take_feed.h — the audio a module hands over for a FEED take
 * (move_host_ext_v1_t.capture_feed, MOVE_CAPTURE_FEED).
 *
 * The module's render appends; the mix tail takes everything handed over since
 * its last visit and gives it to the sampler as is. Nothing handed over is
 * nothing kept: a FEED take is the module's own stream, so a render that feeds
 * nothing must not put silence in the file, and a partial feed is a partial
 * write (the module starts and ends its take on the frame it chooses).
 *
 * Pure and header-only so tests/host can run it (test_sampler_take.c). */
#ifndef TAKE_FEED_H
#define TAKE_FEED_H

#include <stdint.h>
#include <string.h>

#define TAKE_FEED_MAX_FRAMES 512   /* = MOVE_CAPTURE_FEED_MAX */

typedef struct {
    int16_t  buf[TAKE_FEED_MAX_FRAMES * 2];
    uint32_t frames;
} take_feed_t;

/* Append `frames` frames. All or nothing: 1 kept, 0 refused (it would not fit,
 * or no audio). */
static inline int take_feed_put(take_feed_t *f, const int16_t *lr, uint32_t frames) {
    if (!lr || frames == 0 || frames > TAKE_FEED_MAX_FRAMES - f->frames) return 0;
    memcpy(f->buf + f->frames * 2, lr, (size_t)frames * 2 * sizeof(int16_t));
    f->frames += frames;
    return 1;
}

/* Everything handed over since the last take, then empty. Returns the frame
 * count; *lr points at them until the next put. */
static inline uint32_t take_feed_take(take_feed_t *f, const int16_t **lr) {
    uint32_t n = f->frames;
    *lr = f->buf;
    f->frames = 0;
    return n;
}

#endif /* TAKE_FEED_H */
