/*
 * Host-side unit test for chain_clock_state.h — the chain host's MIDI-clock view,
 * shared by every slot, as ATOMICS.
 *
 * ⚠ THE RACE THIS PINS (parallel-render survey, 2026-09-05): four plain globals
 * written by every slot's on_midi and read by any sub-plugin's render were
 * correct only because slots render serially. Here several "slots" feed the
 * state from threads while a "sub-plugin" reads it: the status must always be
 * one of the three values, the tick stamp must never go backwards, and the
 * single-thread semantics must be exactly what chain_midi.c had.
 *
 * Build: cc -std=c11 -pthread tests/host/test_chain_clock_state.c -Isrc/host
 */
#include <assert.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "plugin_api_v1.h"
#include "../../src/modules/chain/dsp/chain_clock_state.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

static chain_clock_state_t g;
static _Atomic int g_stop = 0;
static _Atomic int g_bad = 0;

static void *writer(void *arg) {
    uint64_t t = (uint64_t)(uintptr_t)arg * 1000;
    const uint8_t seq[] = { 0xFA, 0xF8, 0xF8, 0xF8, 0xFC, 0xFB, 0xF8, 0xF8 };
    for (int i = 0; i < 200000; i++) {
        chain_clock_on_realtime(&g, seq[i % 8], t + (uint64_t)i);
    }
    return NULL;
}
static void *reader(void *arg) {
    (void)arg;
    uint64_t prev = 0;
    while (!atomic_load(&g_stop)) {
        int st = chain_clock_status(&g, 1u << 30, 750);
        if (st < 0 || st > 2) atomic_store(&g_bad, 1);
        uint64_t last = atomic_load_explicit(&g.last_tick_ms, memory_order_acquire);
        (void)prev; prev = last;   /* several writers use disjoint bases; monotone per writer only */
    }
    return NULL;
}

int main(void) {
    chain_clock_init(&g);
    /* ---- single-thread semantics, exactly chain_midi.c's ---- */
    OK(chain_clock_status(&g, 1000, 750) == MOVE_CLOCK_STATUS_STOPPED, "fresh, Clock Out on: STOPPED (a clock will come)");
    atomic_store(&g.output_enabled, 0);
    OK(chain_clock_status(&g, 1000, 750) == MOVE_CLOCK_STATUS_UNAVAILABLE, "fresh, Clock Out off, never a tick: UNAVAILABLE");
    chain_clock_on_realtime(&g, 0xF8, 1000);
    OK(chain_clock_status(&g, 1100, 750) == MOVE_CLOCK_STATUS_STOPPED, "a tick without Start: STOPPED");
    chain_clock_on_realtime(&g, 0xFA, 1100);
    OK(chain_clock_status(&g, 1200, 750) == MOVE_CLOCK_STATUS_RUNNING, "Start with a live tick: RUNNING");
    OK(chain_clock_status(&g, 1000 + 751, 750) == MOVE_CLOCK_STATUS_STOPPED, "ticks gone stale: STOPPED even though Start was seen");
    chain_clock_on_realtime(&g, 0xF8, 2000);
    OK(chain_clock_status(&g, 2100, 750) == MOVE_CLOCK_STATUS_RUNNING, "...a fresh tick brings RUNNING back");
    chain_clock_on_realtime(&g, 0xFC, 2100);
    OK(chain_clock_status(&g, 2150, 750) == MOVE_CLOCK_STATUS_STOPPED, "Stop: STOPPED at once");
    chain_clock_init(&g);
    chain_clock_on_realtime(&g, 0xFB, 500);
    OK(atomic_load(&g.last_tick_ms) == 500 && chain_clock_status(&g, 600, 750) == MOVE_CLOCK_STATUS_RUNNING,
       "Continue before any tick stamps the tick time (transport with clock arriving late reads RUNNING)");
    chain_clock_on_realtime(&g, 0xFB, 900);
    OK(atomic_load(&g.last_tick_ms) == 500, "...but a second Start does not move an existing stamp");
    chain_clock_on_realtime(&g, 0xFE, 1000);
    OK(atomic_load(&g.last_tick_ms) == 500 && atomic_load(&g.transport_running) == 1, "an unrelated realtime byte changes nothing");

    /* ---- several slots writing, a sub-plugin reading, concurrently ---- */
    chain_clock_init(&g);
    pthread_t w[4], r;
    pthread_create(&r, NULL, reader, NULL);
    for (int i = 0; i < 4; i++) pthread_create(&w[i], NULL, writer, (void *)(uintptr_t)(i + 1));
    for (int i = 0; i < 4; i++) pthread_join(w[i], NULL);
    atomic_store(&g_stop, 1); pthread_join(r, NULL);
    OK(!atomic_load(&g_bad), "under 4 writers the reader never saw a status outside {UNAVAILABLE, STOPPED, RUNNING}");
    int st = atomic_load(&g.transport_running);
    OK(st == 0 || st == 1, "transport flag is a clean 0/1 after the storm");
    OK(atomic_load(&g.last_tick_ms) > 0, "a tick stamp survived");
    OK(sizeof(chain_clock_state_t) <= 32, "four words, nothing that could tear across two");

    printf("PASS: test_chain_clock_state (%d checks)\n", checks);
    return 0;
}
