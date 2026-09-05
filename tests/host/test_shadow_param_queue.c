/*
 * Host-side unit test for shadow_param_queue.h — the pending FIFO behind the
 * single-slot param mailbox, and the decision table shadow_set_param follows.
 *
 * ⚠ THE BUG THIS PINS: two fire-and-forget SETs in one tick, the second
 * arriving while the mailbox still holds the first; the old code waited 8 ms
 * and STOMPED. The table below says: idle+empty → commit now; anything else
 * → queue, in order; only a full queue or an oversize value falls back.
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "shadow_constants.h"
#include "shadow_param_queue.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

int main(void) {
    spq_t q; memset(&q, 0, sizeof q);

    OK(SPQ_KEY_LEN == SHADOW_PARAM_KEY_LEN, "the queue's key length is the mailbox's");

    /* idle + empty: write straight through, nothing queued */
    OK(spq_offer(&q, 1, 0, "synth:cutoff", "0.5") == SPQ_COMMIT_NOW, "idle mailbox, empty queue: commit now");
    OK(spq_count(&q) == 0, "...and nothing was queued");

    /* busy + empty: the write that used to be stomped is HELD */
    OK(spq_offer(&q, 0, 0, "synth:cutoff", "0.5") == SPQ_QUEUED, "busy mailbox: the write is queued, not stomped");
    OK(spq_count(&q) == 1, "...one pending");

    /* idle + non-empty: ORDER wins — the new write queues behind the old one */
    OK(spq_offer(&q, 1, 2, "fx1:mix", "0.25") == SPQ_QUEUED, "idle mailbox but a write is pending: queue behind it");
    const spq_entry_t *h = spq_peek(&q);
    OK(h && strcmp(h->key, "synth:cutoff") == 0 && h->slot == 0, "the head is the FIRST write");
    spq_pop(&q);
    h = spq_peek(&q);
    OK(h && strcmp(h->key, "fx1:mix") == 0 && h->slot == 2 && strcmp(h->value, "0.25") == 0, "then the second, intact");
    spq_pop(&q);
    OK(spq_count(&q) == 0 && spq_peek(&q) == NULL, "drained: empty, peek is NULL");

    /* bounded: a full queue refuses and reports a fallback, never overwrites */
    for (int i = 0; i < SPQ_CAP; i++) {
        char k[32]; snprintf(k, sizeof k, "k%d", i);
        assert(spq_push(&q, 0, k, "v"));
    }
    OK(spq_count(&q) == SPQ_CAP, "the queue fills to SPQ_CAP");
    OK(spq_offer(&q, 0, 0, "one-more", "v") == SPQ_FALLBACK, "a full queue answers FALLBACK");
    OK(q.fallbacks == 1, "...and counts it");
    h = spq_peek(&q);
    OK(h && strcmp(h->key, "k0") == 0, "...without touching the head");
    for (int i = 0; i < SPQ_CAP; i++) spq_pop(&q);

    /* oversize value: the old path, never a truncated write */
    char big[SPQ_VALUE_MAX + 8]; memset(big, 'x', sizeof big - 1); big[sizeof big - 1] = '\0';
    OK(spq_offer(&q, 0, 0, "synth:state", big) == SPQ_FALLBACK, "a value at or over SPQ_VALUE_MAX falls back");
    OK(spq_count(&q) == 0, "...and is not queued truncated");

    /* LAST WRITER WINS PER KEY: a burst to one key is ONE queued entry with the
     * newest value, in its original position; other keys keep their order. */
    OK(spq_offer(&q, 0, 0, "synth:cutoff", "0.10") == SPQ_QUEUED, "burst: first write queues");
    OK(spq_offer(&q, 0, 1, "slot:volume", "0.9") == SPQ_QUEUED, "...a second key queues behind it");
    for (int i = 11; i <= 60; i++) { char v[16]; snprintf(v, sizeof v, "0.%02d", i); assert(spq_offer(&q, 0, 0, "synth:cutoff", v) == SPQ_QUEUED); }
    OK(spq_count(&q) == 2, "fifty more writes to the same key add NOTHING to the backlog");
    OK(q.coalesced == 50, "...and are counted as coalesced");
    h = spq_peek(&q);
    OK(h && strcmp(h->key, "synth:cutoff") == 0 && strcmp(h->value, "0.60") == 0, "the head is the burst key with the NEWEST value, still first");
    spq_pop(&q); h = spq_peek(&q);
    OK(h && strcmp(h->key, "slot:volume") == 0, "the other key kept its place behind it");
    spq_pop(&q);
    OK(spq_offer(&q, 0, 1, "synth:cutoff", "0.5") == SPQ_QUEUED && spq_offer(&q, 0, 2, "synth:cutoff", "0.6") == SPQ_QUEUED && spq_count(&q) == 2, "the same key on two SLOTS is two entries");
    spq_pop(&q); spq_pop(&q);

    /* wraparound keeps order */
    for (int round = 0; round < 3; round++) {
        for (int i = 0; i < 50; i++) { char k[32]; snprintf(k, sizeof k, "r%d-%d", round, i); assert(spq_push(&q, 0, k, "v")); }
        for (int i = 0; i < 50; i++) { char k[32]; snprintf(k, sizeof k, "r%d-%d", round, i); h = spq_peek(&q); assert(h && strcmp(h->key, k) == 0); spq_pop(&q); }
    }
    OK(spq_count(&q) == 0, "150 pushes/pops across the ring boundary keep FIFO order");

    printf("PASS: test_shadow_param_queue (%d checks)\n", checks);
    return 0;
}
