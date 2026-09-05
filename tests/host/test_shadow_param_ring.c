/*
 * Host-side unit test for shadow_param_ring.h — the param WRITE LANE
 * (shadow_ui → shim): a single-producer / single-consumer ring for small
 * fire-and-forget SETs, drained many-per-frame ahead of the mailbox.
 *
 * Standalone: a stack web_param_set_ring_t, no SHM, no shim. The concurrent
 * case matters — the producer (UI thread) and consumer (SPI thread) run at
 * once on the device — so one test runs both and checks order and loss.
 */
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "shadow_constants.h"
#include "shadow_param_ring.h"

static int checks = 0;
#define OK(c, m) do { if (c) { printf("  ok   %s\n", m); checks++; } else { printf("  FAIL %s\n", m); return 1; } } while (0)

static char seen[4096][WEB_PARAM_KEY_LEN]; static int nseen = 0;
static void collect(void *ctx, const web_param_set_entry_t *e) { (void)ctx; if (nseen < 4096) strcpy(seen[nseen++], e->key); }

static web_param_set_ring_t R;
static void *producer(void *arg) {
    int n = *(int *)arg; char k[32];
    for (int i = 0; i < n; i++) {
        snprintf(k, sizeof k, "k%d", i);
        while (!spw_push(&R, 0, k, "v")) sched_yield();   /* a full ring: the UI would fall back; here we wait */
    }
    return NULL;
}

int main(void) {
    memset(&R, 0, sizeof R);
    uint8_t tail = 0; int init = 0;

    /* handshake: an unready ring (no consumer version) is not used */
    OK(!spw_ready(&R), "no handshake byte → not ready (an old shim: the producer keeps the mailbox)");
    R.reserved[1] = SHADOW_PARAM_WRITE_VERSION;
    OK(spw_ready(&R), "the consumer's version byte makes the lane ready");

    /* first drain adopts the producer's cursor (a surviving segment) */
    R.write_idx = 7;
    OK(spw_drain(&R, &tail, &init, 64, collect, NULL) == 0 && tail == 7, "the first pass adopts the cursor, replays nothing");

    /* push / drain / order */
    OK(spw_push(&R, 3, "synth:cutoff", "0.5") == 1, "push");
    OK(spw_push(&R, 3, "synth:res", "0.25") == 1, "push a second");
    OK(spw_count(&R) == 2, "two pending");
    nseen = 0;
    OK(spw_drain(&R, &tail, &init, 64, collect, NULL) == 2 && nseen == 2 && !strcmp(seen[0], "synth:cutoff") && !strcmp(seen[1], "synth:res"), "drained in order");
    OK(spw_count(&R) == 0, "empty after the drain");

    /* full → refuses, never overwrites */
    char k[32];
    for (int i = 0; i < WEB_PARAM_SET_ENTRIES; i++) { snprintf(k, sizeof k, "f%d", i); assert(spw_push(&R, 0, k, "v")); }
    OK(spw_push(&R, 0, "one-more", "v") == 0, "a full ring refuses");
    OK(spw_count(&R) == WEB_PARAM_SET_ENTRIES, "...and holds exactly ENTRIES");
    nseen = 0;
    OK(spw_drain(&R, &tail, &init, 64, collect, NULL) == WEB_PARAM_SET_ENTRIES && !strcmp(seen[0], "f0") && !strcmp(seen[WEB_PARAM_SET_ENTRIES-1], "f31"), "a full ring drains in ONE pass, in order");

    /* per-pass cap */
    for (int i = 0; i < 10; i++) { snprintf(k, sizeof k, "c%d", i); assert(spw_push(&R, 0, k, "v")); }
    nseen = 0;
    OK(spw_drain(&R, &tail, &init, 4, collect, NULL) == 4 && spw_count(&R) == 6, "a pass cap leaves the rest for the next frame");
    OK(spw_drain(&R, &tail, &init, 64, collect, NULL) == 6 && nseen == 10 && !strcmp(seen[9], "c9"), "...and they follow in order");

    /* oversize value / key: refused by size, not truncated */
    char big[WEB_PARAM_VALUE_LEN + 8]; memset(big, 'x', sizeof big - 1); big[sizeof big - 1] = 0;
    OK(spw_push(&R, 0, "k", big) == 0 && spw_count(&R) == 0, "an oversize value is refused (it takes the mailbox)");

    /* wraparound of the uint8 cursor: 600 entries through a 32-slot ring */
    for (int round = 0; round < 600; round++) {
        snprintf(k, sizeof k, "w%d", round); assert(spw_push(&R, 0, k, "v"));
        nseen = 0; assert(spw_drain(&R, &tail, &init, 64, collect, NULL) == 1 && !strcmp(seen[0], k));
    }
    OK(1, "600 push/drain cycles across the uint8 wrap keep order");

    /* concurrent producer + consumer: nothing lost, order kept */
    int n = 2000; pthread_t th; nseen = 0;
    pthread_create(&th, NULL, producer, &n);
    int got = 0; long spins = 0;
    while (got < n && spins < 50000000L) { got += (int)spw_drain(&R, &tail, &init, 64, collect, NULL); spins++; }
    pthread_join(th, NULL);
    int ordered = (got == n);
    for (int i = 0; ordered && i < n; i++) { snprintf(k, sizeof k, "k%d", i); if (strcmp(seen[i], k)) ordered = 0; }
    OK(ordered, "2000 entries across a live producer/consumer pair: none lost, order kept");

    printf("PASS: test_shadow_param_ring (%d checks)\n", checks);
    return 0;
}
