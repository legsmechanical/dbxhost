/*
 * shadow_param_queue.h — the pending queue behind the single-slot param mailbox.
 *
 * ⚠ THE BUG THIS EXISTS FOR (diagnosed on device 2026-08-23, fixed 2026-09-05):
 * shadow_set_param is fire-and-forget while an overtake module owns the device,
 * and the mailbox (shadow_param_t) holds ONE request, serviced once per SPI
 * frame (~2.9 ms) by the shim. A second SET arriving while the first is still
 * unconsumed waited 8 ms and then STOMPED it — back-to-back writes to DIFFERENT
 * keys lost the first whenever the SPI thread was late. Every screen that
 * writes two params in one tick had that hole; a snapshot RECALL is that
 * pattern × N.
 *
 * The fix is not a longer wait (the UI thread must not block) and not a bigger
 * mailbox (a layout change across the shim seam): it is a bounded FIFO on the
 * shadow_ui side, drained whenever the mailbox is idle — from the main loop
 * every iteration, and by every blocking caller (a GET, a blocking SET, a bulk
 * request) BEFORE it takes the mailbox, so order is preserved and a read never
 * overtakes a queued write to the same key.
 *
 * Single-threaded by construction: only the shadow_ui main thread touches it.
 * Values are capped at SPQ_VALUE_MAX — fire-and-forget writes are knob values
 * and short strings; a bigger value takes the old path (spq_offer says so).
 *
 * Header-only so tests/host can exercise the decision table without SHM.
 */
#ifndef SHADOW_PARAM_QUEUE_H
#define SHADOW_PARAM_QUEUE_H

#include <stdint.h>
#include <string.h>

#ifndef SPQ_KEY_LEN
#define SPQ_KEY_LEN 64          /* = SHADOW_PARAM_KEY_LEN; pinned by test */
#endif
#define SPQ_VALUE_MAX 256
#define SPQ_CAP 64

typedef struct {
    uint8_t slot;
    char key[SPQ_KEY_LEN];
    char value[SPQ_VALUE_MAX];
} spq_entry_t;

typedef struct {
    spq_entry_t e[SPQ_CAP];
    uint32_t head;              /* next to pop */
    uint32_t count;
    uint32_t fallbacks;         /* offers that could not queue (full / too long) */
    uint32_t queued_total;      /* diagnostics: how often the queue saved a write */
    uint32_t coalesced;         /* diagnostics: writes folded into a queued entry for the same key */
} spq_t;

/* What the caller should do with a fire-and-forget SET. */
typedef enum {
    SPQ_COMMIT_NOW = 0,         /* mailbox idle, nothing ahead: write it directly */
    SPQ_QUEUED     = 1,         /* held in order; a later drain commits it */
    SPQ_FALLBACK   = 2,         /* could not queue: caller takes the old path */
} spq_action_t;

static inline uint32_t spq_count(const spq_t *q) { return q->count; }

static inline int spq_push(spq_t *q, uint8_t slot, const char *key, const char *value) {
    if (!key || !value) return 0;
    if (strlen(key) >= SPQ_KEY_LEN || strlen(value) >= SPQ_VALUE_MAX) return 0;
    /* LAST WRITER WINS PER KEY (device, 2026-09-05: "the dave window hangs for
     * a bit coming back from lots of twisting on session view knobs"). A fast
     * twist is a burst of writes to ONE key, and only the newest value means
     * anything — queueing every detent made a read after the burst wait
     * behind a pile of stale values. A write to a key already queued replaces
     * that entry's value in place, keeping its position, so the backlog can
     * never exceed the number of distinct keys touched. This is exactly the
     * coalescing the old stomp did by accident, minus the loss. */
    for (uint32_t i = 0; i < q->count; i++) {
        spq_entry_t *e = &q->e[(q->head + i) % SPQ_CAP];
        if (e->slot == slot && strcmp(e->key, key) == 0) {
            strncpy(e->value, value, SPQ_VALUE_MAX - 1); e->value[SPQ_VALUE_MAX - 1] = '\0';
            q->coalesced++;
            return 1;
        }
    }
    if (q->count >= SPQ_CAP) return 0;
    spq_entry_t *ent = &q->e[(q->head + q->count) % SPQ_CAP];
    ent->slot = slot;
    strncpy(ent->key, key, SPQ_KEY_LEN - 1);     ent->key[SPQ_KEY_LEN - 1] = '\0';
    strncpy(ent->value, value, SPQ_VALUE_MAX - 1); ent->value[SPQ_VALUE_MAX - 1] = '\0';
    q->count++;
    return 1;
}

static inline const spq_entry_t *spq_peek(const spq_t *q) {
    return q->count ? &q->e[q->head % SPQ_CAP] : (const spq_entry_t *)0;
}

static inline void spq_pop(spq_t *q) {
    if (!q->count) return;
    q->head = (q->head + 1) % SPQ_CAP;
    q->count--;
}

/*
 * The decision for one fire-and-forget SET, given whether the mailbox is idle
 * RIGHT NOW. Order is the whole point: if anything is already queued, this
 * write goes behind it even when the mailbox happens to be idle — the caller
 * then drains, which commits the HEAD, not this one.
 */
static inline spq_action_t spq_offer(spq_t *q, int mailbox_idle,
                                     uint8_t slot, const char *key, const char *value) {
    if (mailbox_idle && q->count == 0) return SPQ_COMMIT_NOW;
    if (spq_push(q, slot, key, value)) { q->queued_total++; return SPQ_QUEUED; }
    q->fallbacks++;
    return SPQ_FALLBACK;
}

#endif /* SHADOW_PARAM_QUEUE_H */
