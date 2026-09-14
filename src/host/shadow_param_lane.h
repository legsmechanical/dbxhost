/*
 * shadow_param_lane.h — the param LANE (shadow_ui -> shim): a single-
 * producer / single-consumer BYTE ring for fire-and-forget parameter SETs,
 * header-only.
 *
 * WHAT THIS REMOVES: shadow_param_queue.h made a burst of fire-and-forget
 * SETs lossless (nothing stomped), but every one of them still funnels
 * through the ONE-request mailbox, serviced once per SPI frame (~2.9 ms).
 * A screen that writes N params in a tick still costs N frames. This lane
 * is a second, parallel path: the UI pushes variable-length "slot/key/value"
 * records into a plain byte ring in its own SHM segment; the shim drains as
 * many as fit at the top of every frame, before it services the mailbox, so
 * many writes land in ONE frame instead of one per frame. A write pushed to
 * the lane before a read reaches the mailbox is applied before that read is
 * served — order across the two paths holds because the caller decides
 * (per shadow_param_queue.h's existing decision table) which path a given
 * request takes, not because this file arbitrates between them.
 *
 * Precedents this imitates:
 *   - shadow_midi_inject_writer.h: the "never memset a ring, only its
 *     creator initializes it once" rule (see shadow_constants.h's MIDI
 *     Inject Ring notes) — a re-attached consumer here must NOT reset
 *     head/tail_published, since a live producer could be mid-write.
 *   - shadow_param_queue.h: header-only, testable without SHM, and the
 *     "coalesce/queue/fallback" spirit — this lane is itself one of the
 *     paths a caller falls back FROM when it is full or the value is huge.
 *   - the retired param-write-ring branch (shadow_param_ring.h): the
 *     handshake byte so an old shim never gets silently skipped, and
 *     seeding a fresh consumer's first drain from the PUBLISHED cursor
 *     (tail_published), never from head — a first drain seeded from head
 *     silently discards whatever the producer pushed before the consumer
 *     existed (that branch's device bug: davebox's own init burst of
 *     routes/defaults/picker writes vanished). That branch used FIXED-SIZE
 *     entries in a small slot array; this lane instead packs variable-
 *     length records into a byte ring so one segment holds many small
 *     writes and the occasional larger one without wasting a max-size slot
 *     on every entry.
 *
 * Layout (SHM-resident, never memset after creation):
 *   struct shadow_param_lane_t {
 *       uint32_t head;             // producer's monotonic BYTE cursor
 *       uint32_t tail_published;   // consumer's published monotonic cursor
 *       uint8_t  version;          // consumer's handshake stamp
 *       uint8_t  reserved[3];      // pad head/tail_published block to 12B
 *       uint8_t  data[SHADOW_PARAM_LANE_BYTES];
 *   };
 * Both cursors are byte offsets that wrap mod 2^32 (NOT mod BYTES); the
 * buffer index is always `cursor & (SHADOW_PARAM_LANE_BYTES - 1)` (capacity
 * is a power of two). `head` is written only by the producer; only the
 * consumer writes `tail_published`. Neither side ever writes the other's
 * cursor, and no function here memsets the struct — the segment is zero on
 * creation, and `version` alone gates use (0 means "no consumer has
 * attached yet"; a producer that observes 0 leaves every write on the
 * mailbox instead).
 *
 * Wire record (little-endian native, unaligned reads/writes via memcpy —
 * NEVER cast a buffer offset to a struct pointer, since the offset can be
 * any byte position and the record can be revisited after a wraparound):
 *   uint8_t  slot;                 // 0xFF is reserved: see PAD below
 *   uint8_t  flags;
 *   uint8_t  key_len;              // <= SHADOW_PARAM_LANE_KEY_MAX (63)
 *   uint16_t value_len;            // <= SHADOW_PARAM_LANE_VALUE_MAX (4095)
 *   char     key[key_len];         // NOT NUL-terminated on the wire
 *   char     value[value_len];     // NOT NUL-terminated on the wire
 *   <pad to a 4-byte record boundary, contents undefined>
 * A record never straddles the end of `data`. When the space remaining
 * before the end is too small for the next record's padded length, the
 * producer writes a single PAD byte (`data[idx] = 0xFF`) at the current
 * position and advances `head` straight to the next buffer-start boundary
 * (`head += remaining`) before writing the real record at offset 0 in the
 * SAME push — one release-store of `head` publishes both. The consumer
 * needs no length for the marker: seeing slot==0xFF at its cursor, it
 * advances `*tail` by exactly the bytes remaining to that same boundary
 * (identical arithmetic, independently computed) and retries at offset 0.
 * A single byte works for any remaining-space size down to 1, so the
 * marker never itself needs room reserved for it.
 *
 * Memory ordering: producer writes the marker (if any), header, key and
 * value into `data`, THEN release-stores `head` — the consumer's acquire
 * load of `head` is what makes those writes visible before it reads them.
 * The consumer, after copying a record out of `data`, release-stores
 * `tail_published` — this is what the producer's free-space check
 * acquire-loads, so a producer never overwrites bytes the consumer has not
 * yet finished reading. `spl_pop` publishes `tail_published` on every
 * successful pop (not just at the end of a batch): the extra atomic store
 * is cheap next to a memcpy of a whole record, and it keeps the producer's
 * free-space view current without requiring the caller to remember a
 * separate "end of pass" step.
 *
 * RT-safe: no allocation, no libc beyond memcpy/strlen; single producer,
 * single consumer, wait-free (a full-lane push simply refuses; the caller
 * falls back to shadow_param_queue.h or the mailbox).
 */
#ifndef SHADOW_PARAM_LANE_H
#define SHADOW_PARAM_LANE_H

#include <stdint.h>
#include <string.h>

#define SHADOW_PARAM_LANE_BYTES      65536u   /* power of two: data capacity */
#define SHADOW_PARAM_LANE_MASK       (SHADOW_PARAM_LANE_BYTES - 1u)
#define SHADOW_PARAM_LANE_VERSION    1        /* consumer's handshake stamp */
#define SHADOW_PARAM_LANE_KEY_MAX    63        /* wire key_len; local buf is 64 (NUL) */
#define SHADOW_PARAM_LANE_VALUE_MAX  4095      /* wire value_len; local buf is 4096 (NUL) */
#define SHADOW_PARAM_LANE_PAD_SLOT   0xFFu     /* skip-to-start marker */
#define SHADOW_PARAM_LANE_HDR_BYTES  5u        /* slot + flags + key_len + value_len(2) */

_Static_assert((SHADOW_PARAM_LANE_BYTES & (SHADOW_PARAM_LANE_BYTES - 1u)) == 0,
               "SHADOW_PARAM_LANE_BYTES must be a power of two");

typedef struct shadow_param_lane_t {
    uint32_t head;              /* producer-owned monotonic byte cursor */
    uint32_t tail_published;    /* consumer-owned monotonic byte cursor */
    uint8_t  version;           /* SHADOW_PARAM_LANE_VERSION once ready */
    uint8_t  reserved[3];
    uint8_t  data[SHADOW_PARAM_LANE_BYTES];
} shadow_param_lane_t;

/* One decoded record, as handed back by spl_pop(). NUL-terminated, unlike
 * the wire format. */
typedef struct spl_record_t {
    uint8_t slot;
    uint8_t flags;
    char    key[SHADOW_PARAM_LANE_KEY_MAX + 1];
    char    value[SHADOW_PARAM_LANE_VALUE_MAX + 1];
} spl_record_t;

/* spl_stamp_ready — called ONCE by the consumer (the shim) when it maps a
 * freshly-created segment, establishing the handshake. Never call this on
 * a segment a producer might already be attached to and writing into: it
 * only stores `version`, which is safe at any time, but calling it is a
 * statement "I am the consumer, starting now" and should happen exactly
 * once, at segment creation. */
static inline void
spl_stamp_ready(shadow_param_lane_t *r)
{
    __atomic_store_n(&r->version, (uint8_t)SHADOW_PARAM_LANE_VERSION, __ATOMIC_RELEASE);
}

/* spl_ready — true once the consumer has stamped the handshake. A producer
 * that sees this false must not push: an old shim (or a segment mapped
 * before the consumer's stamp) never drains it, so everything must go on
 * the mailbox instead. */
static inline int
spl_ready(const shadow_param_lane_t *r)
{
    return r != NULL &&
           __atomic_load_n(&r->version, __ATOMIC_ACQUIRE) == (uint8_t)SHADOW_PARAM_LANE_VERSION;
}

/* spl_used — bytes pushed but not yet popped, as of `tail` (the caller's
 * own cursor: the producer passes its last-seen tail_published, the
 * consumer its private running tail). Unsigned subtraction of two
 * monotonic mod-2^32 cursors is correct across a wrap by construction. */
static inline uint32_t
spl_used(const shadow_param_lane_t *r, uint32_t tail)
{
    uint32_t head = __atomic_load_n(&r->head, __ATOMIC_ACQUIRE);
    return head - tail;
}

/* spl_free — bytes available to a producer, as of `tail`. */
static inline uint32_t
spl_free(const shadow_param_lane_t *r, uint32_t tail)
{
    return SHADOW_PARAM_LANE_BYTES - spl_used(r, tail);
}

/* spl_first_tail — the seed for a CONSUMER's private tail on its very
 * first pass. Must be tail_published (which is 0 on a freshly-created,
 * zeroed segment), never `head`: seeding from head silently discards
 * everything the producer pushed before this consumer existed — the
 * exact bug the retired param-write-ring branch shipped once (davebox's
 * own init burst of routes/defaults/picker writes vanished on device). */
static inline uint32_t
spl_first_tail(const shadow_param_lane_t *r)
{
    return __atomic_load_n(&r->tail_published, __ATOMIC_ACQUIRE);
}

/* spl_push — enqueue one SET. Single producer only (not safe to call from
 * more than one thread/process concurrently).
 *
 * Returns 1 if pushed, 0 if refused: the lane isn't ready (no consumer has
 * stamped it yet), `slot` is the reserved skip-marker value (0xFF — a
 * caller must never pass this; wire it away from any track/slot index
 * that could legitimately reach 255), key/value too long, or not enough
 * free space for the record (including a possible skip marker). Refusal
 * touches nothing — the caller falls back to shadow_param_queue.h or the
 * mailbox; nothing is lost or torn. */
static inline int
spl_push(shadow_param_lane_t *r, uint8_t slot, uint8_t flags,
         const char *key, const char *value)
{
    if (!r || !key || !value) return 0;
    if (!spl_ready(r)) return 0;  /* no consumer stamped yet: caller must use the mailbox */
    if (slot == SHADOW_PARAM_LANE_PAD_SLOT) return 0;  /* 0xFF is reserved for the skip marker */

    size_t key_len = strlen(key);
    size_t value_len = strlen(value);
    if (key_len > SHADOW_PARAM_LANE_KEY_MAX || value_len > SHADOW_PARAM_LANE_VALUE_MAX) {
        return 0;
    }

    uint32_t rec_len = (uint32_t)(SHADOW_PARAM_LANE_HDR_BYTES + key_len + value_len);
    uint32_t padded_len = (rec_len + 3u) & ~3u;

    uint32_t head = __atomic_load_n(&r->head, __ATOMIC_RELAXED);  /* producer's own cursor */
    uint32_t tail = __atomic_load_n(&r->tail_published, __ATOMIC_ACQUIRE);
    uint32_t free_bytes = SHADOW_PARAM_LANE_BYTES - (head - tail);

    uint32_t idx = head & SHADOW_PARAM_LANE_MASK;
    uint32_t remaining = SHADOW_PARAM_LANE_BYTES - idx;   /* in [1, BYTES] */
    int need_wrap = remaining < padded_len;
    uint32_t total_needed = need_wrap ? (remaining + padded_len) : padded_len;

    if (free_bytes < total_needed) return 0;

    uint32_t write_head = head;
    if (need_wrap) {
        r->data[idx] = SHADOW_PARAM_LANE_PAD_SLOT;
        write_head += remaining;
        idx = 0;
    }

    uint16_t vlen16 = (uint16_t)value_len;
    r->data[idx + 0] = slot;
    r->data[idx + 1] = flags;
    r->data[idx + 2] = (uint8_t)key_len;
    memcpy(&r->data[idx + 3], &vlen16, sizeof vlen16);
    if (key_len) memcpy(&r->data[idx + SHADOW_PARAM_LANE_HDR_BYTES], key, key_len);
    if (value_len) memcpy(&r->data[idx + SHADOW_PARAM_LANE_HDR_BYTES + key_len], value, value_len);

    /* Publish: RELEASE makes every byte written above (marker + header +
     * key + value) visible to the consumer's ACQUIRE load of head. */
    __atomic_store_n(&r->head, write_head + padded_len, __ATOMIC_RELEASE);
    return 1;
}

/* spl_pop — dequeue one record. Single consumer only. `*tail` is the
 * consumer's own private cursor, carried across calls by the caller
 * (seed it with spl_first_tail() on a fresh consumer, 0 is wrong for a
 * surviving segment). Skip markers are consumed transparently — a caller
 * never sees slot 0xFF.
 *
 * Returns 1 if a record was copied into `*out` (NUL-terminated key/value)
 * and `*tail` advanced past it, 0 if the lane is empty (used == 0). */
static inline int
spl_pop(shadow_param_lane_t *r, uint32_t *tail, spl_record_t *out)
{
    if (!r || !tail || !out) return 0;

    uint32_t head = __atomic_load_n(&r->head, __ATOMIC_ACQUIRE);
    uint32_t t = *tail;

    for (;;) {
        if (head - t == 0) return 0;  /* empty */

        uint32_t idx = t & SHADOW_PARAM_LANE_MASK;
        uint8_t slot = r->data[idx];
        if (slot == SHADOW_PARAM_LANE_PAD_SLOT) {
            uint32_t remaining = SHADOW_PARAM_LANE_BYTES - idx;
            t += remaining;
            *tail = t;
            __atomic_store_n(&r->tail_published, t, __ATOMIC_RELEASE);
            continue;  /* retry at the new offset-0 position */
        }

        uint8_t flags = r->data[idx + 1];
        uint8_t key_len = r->data[idx + 2];
        uint16_t value_len16;
        memcpy(&value_len16, &r->data[idx + 3], sizeof value_len16);
        uint32_t value_len = value_len16;

        /* A header the producer could not have written (lengths past the
         * wire maxima) means the ring is torn or foreign. Never copy from it:
         * `out` is exactly KEY_MAX+1 / VALUE_MAX+1 and this runs on the SPI
         * thread. Resync by discarding everything up to head — a dropped
         * burst is recoverable (the UI's verify-and-rewrite re-reads), a
         * smashed stack is not. The caller counts these via the return
         * value of 0 with `*tail == head` after a non-empty check. */
        if (key_len > SHADOW_PARAM_LANE_KEY_MAX || value_len > SHADOW_PARAM_LANE_VALUE_MAX) {
            *tail = head;
            __atomic_store_n(&r->tail_published, head, __ATOMIC_RELEASE);
            return 0;
        }

        memcpy(out->key, &r->data[idx + SHADOW_PARAM_LANE_HDR_BYTES], key_len);
        out->key[key_len] = '\0';
        memcpy(out->value, &r->data[idx + SHADOW_PARAM_LANE_HDR_BYTES + key_len], value_len);
        out->value[value_len] = '\0';
        out->slot = slot;
        out->flags = flags;

        uint32_t rec_len = SHADOW_PARAM_LANE_HDR_BYTES + key_len + value_len;
        uint32_t padded_len = (rec_len + 3u) & ~3u;
        t += padded_len;
        *tail = t;
        __atomic_store_n(&r->tail_published, t, __ATOMIC_RELEASE);
        return 1;
    }
}

#endif /* SHADOW_PARAM_LANE_H */
