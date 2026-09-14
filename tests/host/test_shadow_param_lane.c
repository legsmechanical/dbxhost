/*
 * Host-side unit test for shadow_param_lane.h — the param LANE (shadow_ui
 * -> shim): a single-producer / single-consumer byte ring for fire-and-
 * forget parameter SETs, drained many-per-frame ahead of the mailbox.
 *
 * Standalone: a heap-allocated shadow_param_lane_t, no SHM, no shim. The
 * concurrent case matters (the producer/UI thread and the consumer/SPI
 * thread run at once on the device), so one test runs both with pthreads.
 */
/* sched_yield() is hidden under strict -std=c11 unless the platform's
 * feature-test macro is set; on macOS, _POSIX_C_SOURCE alone also drops the
 * ANSI level to C89 and hides snprintf, so pair it with _DARWIN_C_SOURCE. */
#if defined(__APPLE__)
#define _DARWIN_C_SOURCE
#else
#define _POSIX_C_SOURCE 199309L
#endif
#include <assert.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "shadow_param_lane.h"

static int checks = 0;
#define OK(c, m) do { if (c) { printf("  ok   %s\n", m); checks++; } else { printf("  FAIL %s\n", m); return 1; } } while (0)

/* The struct is 64 KB+; keep it off the stack. */
static shadow_param_lane_t *alloc_lane(void)
{
    shadow_param_lane_t *r = calloc(1, sizeof *r);  /* zero, as SHM is on creation */
    assert(r);
    return r;
}

static int test_round_trip_order_and_bytes(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);
    uint32_t tail = spl_first_tail(r);

    char big[SHADOW_PARAM_LANE_VALUE_MAX + 1];
    memset(big, 'x', SHADOW_PARAM_LANE_VALUE_MAX);
    big[SHADOW_PARAM_LANE_VALUE_MAX] = '\0';

    OK(spl_push(r, 1, 0, "synth:cutoff", "0.5") == 1, "push #1");
    OK(spl_push(r, 2, 7, "fx1:mix", "a=1,b=2") == 1, "push #2 (embedded '=' and ',')");
    OK(spl_push(r, 3, 0, "big", big) == 1, "push #3 (4095-byte value)");

    spl_record_t rec;
    OK(spl_pop(r, &tail, &rec) == 1 && rec.slot == 1 && rec.flags == 0 &&
       !strcmp(rec.key, "synth:cutoff") && !strcmp(rec.value, "0.5"), "pop #1 intact, in order");
    OK(spl_pop(r, &tail, &rec) == 1 && rec.slot == 2 && rec.flags == 7 &&
       !strcmp(rec.key, "fx1:mix") && !strcmp(rec.value, "a=1,b=2"), "pop #2 intact, embedded delimiters preserved");
    OK(spl_pop(r, &tail, &rec) == 1 && rec.slot == 3 &&
       !strcmp(rec.key, "big") && strlen(rec.value) == SHADOW_PARAM_LANE_VALUE_MAX &&
       !memcmp(rec.value, big, SHADOW_PARAM_LANE_VALUE_MAX), "pop #3 intact, full 4095-byte value");
    OK(spl_pop(r, &tail, &rec) == 0, "empty after draining all three");

    free(r);
    return 0;
}

static int test_not_ready_refuses(void)
{
    shadow_param_lane_t *r = alloc_lane();  /* version == 0: never stamped */
    OK(!spl_ready(r), "a freshly-zeroed lane is not ready");
    OK(spl_push(r, 0, 0, "k", "v") == 0, "an un-stamped (not ready) lane refuses push");
    free(r);
    return 0;
}

static int test_oversize_refused(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);
    uint32_t tail = spl_first_tail(r);

    char key64[SHADOW_PARAM_LANE_KEY_MAX + 2];   /* 64 chars: one over the 63 max */
    memset(key64, 'k', SHADOW_PARAM_LANE_KEY_MAX + 1);
    key64[SHADOW_PARAM_LANE_KEY_MAX + 1] = '\0';
    OK(strlen(key64) == (size_t)SHADOW_PARAM_LANE_KEY_MAX + 1, "sanity: key is 64 chars");
    OK(spl_push(r, 0, 0, key64, "v") == 0, "a 64-char key is refused (max is 63)");

    char value4096[SHADOW_PARAM_LANE_VALUE_MAX + 2];
    memset(value4096, 'v', SHADOW_PARAM_LANE_VALUE_MAX + 1);
    value4096[SHADOW_PARAM_LANE_VALUE_MAX + 1] = '\0';
    OK(strlen(value4096) == (size_t)SHADOW_PARAM_LANE_VALUE_MAX + 1, "sanity: value is 4096 bytes");
    OK(spl_push(r, 0, 0, "k", value4096) == 0, "a 4096-byte value is refused (max is 4095)");

    OK(spl_push(r, SHADOW_PARAM_LANE_PAD_SLOT, 0, "k", "v") == 0,
       "slot 0xFF (the reserved skip-marker value) is refused");

    spl_record_t rec;
    OK(spl_pop(r, &tail, &rec) == 0, "nothing was actually pushed by any of the three refusals");

    free(r);
    return 0;
}

static int test_fill_then_drain_fully(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);
    uint32_t ptail = spl_first_tail(r);   /* producer's view, for spl_used/spl_free */

    long pushed = 0;
    int refused = 0;
    for (long i = 0; i < 200000 && !refused; i++) {
        char key[16], val[16];
        snprintf(key, sizeof key, "k%ld", i % 1000);
        snprintf(val, sizeof val, "%ld", i);
        /* slot avoids 0xFF, the reserved skip-marker value */
        if (spl_push(r, (uint8_t)(i % 250), 0, key, val)) {
            pushed++;
        } else {
            refused = 1;
        }
    }
    OK(refused, "the lane eventually refuses once it fills");
    OK(spl_used(r, ptail) > 0, "used bytes > 0 while full");

    uint32_t ctail = spl_first_tail(r);
    long drained = 0;
    spl_record_t rec;
    while (spl_pop(r, &ctail, &rec)) drained++;
    OK(drained == pushed, "drained exactly as many records as were pushed");
    OK(spl_used(r, ctail) == 0, "used == 0 after a full drain");

    /* the lane works again after being fully drained */
    OK(spl_push(r, 9, 0, "after", "drain") == 1, "push succeeds again post-drain");
    OK(spl_pop(r, &ctail, &rec) == 1 && !strcmp(rec.key, "after"), "and pops correctly");

    free(r);
    return 0;
}

static int test_skip_marker(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);

    /* Position head 3 bytes from the end of the buffer. The next record
     * ("a"/"b": header 5 + 1 + 1 = 7, padded to 8) cannot fit in the 3
     * bytes remaining, so spl_push must write a 1-byte PAD marker at the
     * old position and wrap the real record to offset 0. */
    uint32_t start = SHADOW_PARAM_LANE_BYTES - 3;
    r->head = start;
    r->tail_published = start;   /* used == 0, so the push has plenty of free space */

    OK(spl_push(r, 5, 1, "a", "b") == 1, "push that must wrap past the end of the buffer");
    OK(r->data[start] == SHADOW_PARAM_LANE_PAD_SLOT, "the marker byte (0xFF) landed at the old position");
    OK(r->head == SHADOW_PARAM_LANE_BYTES + 8, "head advanced past the marker's boundary AND the record (8 bytes)");

    uint32_t tail = start;
    spl_record_t rec;
    OK(spl_pop(r, &tail, &rec) == 1 && rec.slot == 5 && rec.flags == 1 &&
       !strcmp(rec.key, "a") && !strcmp(rec.value, "b"),
       "the record is returned intact, read starting from offset 0 after the marker");
    OK(tail == SHADOW_PARAM_LANE_BYTES + 8,
       "tail advanced past the marker (to the buffer-start boundary) plus the record");

    free(r);
    return 0;
}

static int test_cursor_wrap(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);

    uint32_t start = 0xFFFFFF00u;   /* 256 bytes from the uint32 wrap */
    r->head = start;
    r->tail_published = start;
    uint32_t tail = start;

    int ok = 1;
    for (int i = 0; i < 1000 && ok; i++) {
        char key[16], val[16];
        snprintf(key, sizeof key, "w%d", i);
        snprintf(val, sizeof val, "%d", i);
        if (!spl_push(r, (uint8_t)(i % 250), 0, key, val)) { ok = 0; break; }  /* avoid the reserved 0xFF slot */
        spl_record_t rec;
        if (!spl_pop(r, &tail, &rec) || strcmp(rec.key, key) || strcmp(rec.value, val)) { ok = 0; break; }
    }
    OK(ok, "1000 push/pop cycles carry the uint32 cursor across its wrap (0xFFFFFFFF -> 0) intact");

    free(r);
    return 0;
}

static int test_first_drain_seed(void)
{
    shadow_param_lane_t *r = alloc_lane();  /* zero, as a freshly-created segment is */
    spl_stamp_ready(r);   /* the consumer's handshake, but no drain yet */

    /* Three writes land before any consumer has ever called spl_pop —
     * exactly the shape of an init burst racing the first SPI frame. */
    OK(spl_push(r, 0, 0, "route:1", "move1") == 1, "pre-drain push #1");
    OK(spl_push(r, 0, 0, "route:2", "move2") == 1, "pre-drain push #2");
    OK(spl_push(r, 0, 0, "route:3", "move3") == 1, "pre-drain push #3");

    /* A fresh consumer must seed from tail_published (0 here, untouched by
     * push), NOT from head (which has already advanced past all three) —
     * seeding from head is the retired branch's bug: it silently discards
     * everything pushed before the first drain. */
    uint32_t tail = spl_first_tail(r);
    OK(tail == 0 && tail != r->head, "first-drain seed is tail_published, not head");

    spl_record_t rec;
    OK(spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "route:1"), "first drain recovers push #1");
    OK(spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "route:2"), "...#2");
    OK(spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "route:3"), "...#3, nothing lost");
    OK(spl_pop(r, &tail, &rec) == 0, "and only those three");

    free(r);
    return 0;
}

/* --- concurrent producer/consumer: 100k records, sequence embedded in value --- */

#define CONCURRENT_N 100000

static shadow_param_lane_t *g_lane;

static void *producer_thread(void *arg)
{
    (void)arg;
    for (int i = 0; i < CONCURRENT_N; i++) {
        char val[16];
        snprintf(val, sizeof val, "%d", i);
        /* slot avoids 0xFF, the reserved skip-marker value */
        while (!spl_push(g_lane, (uint8_t)(i % 250), 0, "seq", val)) {
            sched_yield();
        }
    }
    return NULL;
}

static int test_concurrent_producer_consumer(void)
{
    g_lane = alloc_lane();
    spl_stamp_ready(g_lane);
    uint32_t tail = spl_first_tail(g_lane);

    pthread_t th;
    OK(pthread_create(&th, NULL, producer_thread, NULL) == 0, "producer thread started");

    int got = 0;
    int last = -1;
    int ordered_no_gaps = 1;
    spl_record_t rec;
    long spins = 0;
    while (got < CONCURRENT_N && spins < 200000000L) {
        if (spl_pop(g_lane, &tail, &rec)) {
            int seq = atoi(rec.value);
            if (strcmp(rec.key, "seq") != 0 || seq != last + 1) {
                ordered_no_gaps = 0;
                break;
            }
            last = seq;
            got++;
        }
        spins++;
    }
    pthread_join(th, NULL);

    OK(got == CONCURRENT_N, "consumer received all 100000 records");
    OK(ordered_no_gaps, "sequence numbers were monotonic with no gaps and no reordering");

    free(g_lane);
    g_lane = NULL;
    return 0;
}

/* A header the producer could never have written (key_len past the wire
 * max) must not be copied out — `out` is sized exactly to the maxima and
 * this runs on the SPI thread. The consumer resyncs to head instead. The
 * CONTROL is the good record before it, which must still come out intact. */
static int test_corrupt_header_resyncs(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);
    uint32_t tail = spl_first_tail(r);
    spl_record_t rec;

    OK(spl_push(r, 1, 0, "good", "1") == 1, "push a good record (control)");
    OK(spl_push(r, 2, 0, "bad", "2") == 1, "push the record to corrupt");
    OK(spl_push(r, 3, 0, "after", "3") == 1, "push one after it");
    OK(spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "good"), "control: the good record pops intact");

    /* Smash the second record's key_len in place (offset 2 of its header). */
    r->data[(tail & SHADOW_PARAM_LANE_MASK) + 2] = (uint8_t)(SHADOW_PARAM_LANE_KEY_MAX + 1);
    OK(spl_pop(r, &tail, &rec) == 0, "corrupt header: pop returns 0 without copying");
    OK(spl_used(r, tail) == 0, "corrupt header: consumer resynced to head (the burst is dropped, not read)");
    OK(spl_pop(r, &tail, &rec) == 0, "and the lane reads empty afterwards");
    OK(spl_push(r, 4, 0, "later", "4") == 1 && spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "later"),
       "the lane is usable again after the resync");

    free(r);
    return 0;
}

/* The shim re-zeroes the segment on restart; a producer mid-push can land
 * its head store after that memset, so [tail, head) is all zeros - which
 * parse as VALID 5-byte records with an empty key. They must be dropped
 * (resync), never applied as set_param("", "") on the SPI thread. And the
 * producer must never be able to write one, so the two rules stay symmetric. */
static int test_zeroed_ring_is_dropped_not_applied(void)
{
    shadow_param_lane_t *r = alloc_lane();
    spl_stamp_ready(r);
    uint32_t tail = spl_first_tail(r);
    spl_record_t rec;

    OK(spl_push(r, 1, 0, "", "1") == 0, "the producer refuses an EMPTY key");

    /* Simulate the restart race: three records pushed, then the data zeroed
     * underneath them with head left standing (memset vs the head store). */
    OK(spl_push(r, 1, 0, "a", "1") == 1 && spl_push(r, 2, 0, "b", "2") == 1 &&
       spl_push(r, 3, 0, "c", "3") == 1, "three records pushed");
    memset(r->data, 0, SHADOW_PARAM_LANE_BYTES);
    OK(spl_used(r, tail) > 0, "head still stands past the zeroed bytes (the race)");
    rec.key[0] = 'X';
    OK(spl_pop(r, &tail, &rec) == 0, "a zero header pops as 0 - NOT as a record with an empty key");
    OK(rec.key[0] == 'X', "and nothing was copied into the record");
    OK(spl_used(r, tail) == 0, "the consumer resynced to head (the torn burst is dropped)");
    OK(spl_push(r, 4, 0, "later", "4") == 1 && spl_pop(r, &tail, &rec) == 1 && !strcmp(rec.key, "later"),
       "the lane is usable again after the resync");

    free(r);
    return 0;
}

int main(void)
{
    if (test_round_trip_order_and_bytes()) return 1;
    if (test_corrupt_header_resyncs()) return 1;
    if (test_zeroed_ring_is_dropped_not_applied()) return 1;
    if (test_not_ready_refuses()) return 1;
    if (test_oversize_refused()) return 1;
    if (test_fill_then_drain_fully()) return 1;
    if (test_skip_marker()) return 1;
    if (test_cursor_wrap()) return 1;
    if (test_first_drain_seed()) return 1;
    if (test_concurrent_producer_consumer()) return 1;

    printf("PASS: test_shadow_param_lane (%d checks)\n", checks);
    return 0;
}
