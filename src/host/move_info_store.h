/*
 * move_info_store.h -- the shim's copy of what schwung_move_info() answers.
 *
 * Upstream fills move_info_t from a live model of Move's own set. This fork
 * does not carry that model; here the answer comes from the OVERTAKE DSP that
 * owns the session (move_host_ext_v1_t.set_move_info), which publishes its
 * own key, scale, tempo and transport. Nothing published = "this Schwung does
 * not provide it" (schwung_move_info returns 0), exactly as before.
 *
 * One writer (the overtake DSP, on the SPI thread), any number of readers
 * (chain slots on the render-pool lanes, concurrently). The store is the same
 * seqlocked move_info_shm_t the public reader already knows how to copy
 * (move_info_copy), so a reader never sees a torn struct: it retries, and
 * after eight tries answers 0. No syscalls, no locks, no allocation.
 *
 * Withdrawn (put(NULL)) clears the magic, so move_info_copy answers 0.
 */
#ifndef MOVE_INFO_STORE_H
#define MOVE_INFO_STORE_H

#define MOVE_INFO_NO_READER
#include "move_info.h"

/* Publish `in` (its first `size` bytes; the rest of this host's struct is
 * zeroed), or withdraw with in == NULL. `changes` is bumped on every put. */
static inline void move_info_store_put(move_info_shm_t *s, const move_info_t *in, size_t size)
{
    const uint32_t q = __atomic_load_n(&s->seq, __ATOMIC_RELAXED);
    const uint32_t changes = s->info.changes;
    __atomic_store_n(&s->seq, q + 1, __ATOMIC_RELAXED);
    __atomic_thread_fence(__ATOMIC_RELEASE);
    if (!in || size < 8) {
        memset(s->magic, 0, sizeof s->magic);
    } else {
        const size_t n = size < sizeof s->info ? size : sizeof s->info;
        memcpy(&s->info, in, n);
        if (n < sizeof s->info) memset((char *)&s->info + n, 0, sizeof s->info - n);
        s->info.size    = (uint32_t)n;
        s->info.version = MOVE_INFO_VERSION;
        s->info.changes = changes + 1;
        memcpy(s->magic, MOVE_INFO_MAGIC, sizeof MOVE_INFO_MAGIC);
    }
    __atomic_store_n(&s->seq, q + 2, __ATOMIC_RELEASE);
}

/* What schwung_move_info() answers: 1 and a copy, or 0 = not provided. */
static inline int move_info_store_get(const move_info_shm_t *s, void *out, size_t cap)
{
    return move_info_copy((const volatile move_info_shm_t *)s, (move_info_t *)out, cap);
}

#endif /* MOVE_INFO_STORE_H */
