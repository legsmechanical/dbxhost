/*
 * shadow_param_ring.h — the param WRITE LANE (shadow_ui → shim), header-only.
 *
 * THE COST IT REMOVES (2026-09-05): every UI→DSP parameter request took the
 * ONE request slot in shadow_param_t, serviced once per SPI frame (~2.9 ms) —
 * a 30-byte knob detent cost the same frame as a 64 KB state blob, and a
 * READ waited behind every write ahead of it. The pending queue
 * (shadow_param_queue.h) made fire-and-forget SETs lossless but not cheaper.
 *
 * This lane is a second path for SMALL fire-and-forget SETs: a ring in its
 * own shared segment, pushed by the shadow_ui main thread, drained by the
 * shim's SPI thread at the top of every frame BEFORE it services the mailbox
 * — many entries per frame (a set_param is microseconds), and a write pushed
 * before a read is applied before that read is served, so ordering holds by
 * construction. Reads never wait behind writes again.
 *
 * Layout: web_param_set_ring_t, the shape the manager's ring already uses
 * (the shim drains both with one routine). SPSC protocol as documented at
 * shadow_drain_web_param_set: write_idx is the producer's MONOTONIC cursor
 * (slot = idx % ENTRIES, clean uint8 wrap); reserved[0] is the consumer's
 * published cursor; reserved[1] is the consumer's HANDSHAKE version — the
 * shim sets it when it maps the segment and a producer that does not see it
 * keeps every write on the old path. Neither side writes the other's cursor.
 *
 * Fill = write_idx - reserved[0] (mod 256), never more than ENTRIES. A full
 * ring refuses; the caller falls back to the pending queue — nothing is lost.
 * Values must fit WEB_PARAM_VALUE_LEN; larger ones take the mailbox.
 */
#ifndef SHADOW_PARAM_RING_H
#define SHADOW_PARAM_RING_H

#include <stdint.h>
#include <string.h>
#include "shadow_constants.h"

/* The consumer is alive and speaks this version. */
static inline int spw_ready(const web_param_set_ring_t *r) {
    return r && __atomic_load_n(&r->reserved[1], __ATOMIC_ACQUIRE) == SHADOW_PARAM_WRITE_VERSION;
}

/* Entries pushed and not yet consumed. */
static inline unsigned spw_count(const web_param_set_ring_t *r) {
    uint8_t w = __atomic_load_n(&r->write_idx, __ATOMIC_ACQUIRE);
    uint8_t c = __atomic_load_n(&r->reserved[0], __ATOMIC_ACQUIRE);
    return (uint8_t)(w - c);
}

/* Does this write fit the lane? (size only — readiness is the caller's check) */
static inline int spw_fits(const char *key, const char *value) {
    return key && value && strlen(key) < WEB_PARAM_KEY_LEN && strlen(value) < WEB_PARAM_VALUE_LEN;
}

/* Push one SET. Returns 1 when queued, 0 when the ring is full or the entry
 * does not fit. Single producer. */
static inline int spw_push(web_param_set_ring_t *r, uint8_t slot, const char *key, const char *value) {
    if (!r || !spw_fits(key, value)) return 0;
    if (spw_count(r) >= WEB_PARAM_SET_ENTRIES) return 0;
    uint8_t w = __atomic_load_n(&r->write_idx, __ATOMIC_RELAXED);
    web_param_set_entry_t *e = &r->entries[w % WEB_PARAM_SET_ENTRIES];
    e->slot = slot;
    strncpy(e->key, key, WEB_PARAM_KEY_LEN - 1);     e->key[WEB_PARAM_KEY_LEN - 1] = '\0';
    strncpy(e->value, value, WEB_PARAM_VALUE_LEN - 1); e->value[WEB_PARAM_VALUE_LEN - 1] = '\0';
    /* Release-store the cursor so the consumer's acquire-load sees the entry
     * whole before it counts it. */
    __atomic_store_n(&r->write_idx, (uint8_t)(w + 1), __ATOMIC_RELEASE);
    return 1;
}

/* Consumer: the shim's drain. `tail` is the consumer's private cursor,
 * mirrored into reserved[0] when a pass ends. Calls fn(ctx, entry) for each
 * entry in order (at most `max_per_pass`), then publishes. Returns how many
 * were applied. `init` handles a surviving segment: the first pass adopts the
 * producer's cursor rather than replaying pre-attach history. */
static inline unsigned spw_drain(web_param_set_ring_t *r, uint8_t *tail, int *init,
                                 unsigned max_per_pass,
                                 void (*fn)(void *ctx, const web_param_set_entry_t *e), void *ctx) {
    if (!r) return 0;
    uint8_t head = __atomic_load_n(&r->write_idx, __ATOMIC_ACQUIRE);
    if (!*init) {
        *tail = head; *init = 1;
        __atomic_store_n(&r->reserved[0], *tail, __ATOMIC_RELEASE);
        return 0;
    }
    unsigned count = (uint8_t)(head - *tail);
    if (!count) return 0;
    if (count > WEB_PARAM_SET_ENTRIES) {           /* producer overran: newest window */
        *tail = (uint8_t)(head - WEB_PARAM_SET_ENTRIES);
        count = WEB_PARAM_SET_ENTRIES;
    }
    if (count > max_per_pass) count = max_per_pass;
    for (unsigned i = 0; i < count; i++) {
        web_param_set_entry_t e;
        memcpy(&e, (const void *)&r->entries[(uint8_t)(*tail + i) % WEB_PARAM_SET_ENTRIES], sizeof e);
        if (e.key[0]) fn(ctx, &e);
    }
    *tail = (uint8_t)(*tail + count);
    __atomic_store_n(&r->reserved[0], *tail, __ATOMIC_RELEASE);
    return count;
}

#endif /* SHADOW_PARAM_RING_H */
