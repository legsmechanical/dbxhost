/*
 * chain_clock_state.h — the chain host's view of Move's MIDI clock, as ATOMICS.
 *
 * ⚠ WHY (2026-09-05, parallel-render survey): this state used to be four plain
 * file-scope globals in chain_midi.c, written by EVERY slot's on_midi (once per
 * realtime byte the shim broadcasts to all slots) and read by any sub-plugin's
 * get_clock_status() from inside its render. That was only ever correct because
 * every slot rendered serially on the SPI thread; the moment slots render on
 * worker threads it is a data race. The state cannot move INTO the instance:
 * host_api_v1.get_clock_status(void) carries no instance handle, and the clock
 * it describes is host-wide anyway (Move has one transport). So it stays shared
 * and becomes atomic — every field a single word, no invariant spanning two.
 *
 * Header-only, pure on its inputs (the caller supplies now_ms), so tests/host
 * can drive it from several threads without the chain host around it.
 */
#ifndef CHAIN_CLOCK_STATE_H
#define CHAIN_CLOCK_STATE_H

#include <stdatomic.h>
#include <stdint.h>

#ifndef MOVE_CLOCK_STATUS_UNAVAILABLE
#define MOVE_CLOCK_STATUS_UNAVAILABLE 0
#define MOVE_CLOCK_STATUS_STOPPED 1
#define MOVE_CLOCK_STATUS_RUNNING 2
#endif

typedef struct chain_clock_state {
    _Atomic int      output_enabled;     /* midiClockMode == "output" (Settings.json) */
    _Atomic int      transport_running;  /* Start/Continue seen without Stop */
    _Atomic uint64_t last_tick_ms;       /* last 0xF8 timestamp; 0 = never */
    _Atomic uint64_t next_refresh_ms;    /* Settings.json refresh gate */
} chain_clock_state_t;

#define CHAIN_CLOCK_STATE_INIT { 1, 0, 0, 0 }

static inline void chain_clock_init(chain_clock_state_t *c) {
    atomic_store_explicit(&c->output_enabled, 1, memory_order_relaxed);
    atomic_store_explicit(&c->transport_running, 0, memory_order_relaxed);
    atomic_store_explicit(&c->last_tick_ms, 0, memory_order_relaxed);
    atomic_store_explicit(&c->next_refresh_ms, 0, memory_order_relaxed);
}

/* One realtime byte from any slot. Tick stamps; Start/Continue run (and stamp
 * if no tick was ever seen, so a transport with clock arriving late still
 * reads RUNNING); Stop halts. Anything else is ignored. */
static inline void chain_clock_on_realtime(chain_clock_state_t *c, uint8_t status, uint64_t now_ms) {
    if (status == 0xF8) {
        atomic_store_explicit(&c->last_tick_ms, now_ms, memory_order_release);
    } else if (status == 0xFA || status == 0xFB) {
        atomic_store_explicit(&c->transport_running, 1, memory_order_release);
        uint64_t zero = 0;
        atomic_compare_exchange_strong_explicit(&c->last_tick_ms, &zero, now_ms,
                                                memory_order_acq_rel, memory_order_relaxed);
    } else if (status == 0xFC) {
        atomic_store_explicit(&c->transport_running, 0, memory_order_release);
    }
}

/* The status a sub-plugin sees. RUNNING needs a live tick within stale_ms and
 * the transport running; STOPPED if a tick was ever seen or Clock Out is on;
 * UNAVAILABLE only when nothing ever arrived and Clock Out is off. */
static inline int chain_clock_status(const chain_clock_state_t *c, uint64_t now_ms, uint64_t stale_ms) {
    uint64_t last = atomic_load_explicit(&c->last_tick_ms, memory_order_acquire);
    int running   = atomic_load_explicit(&c->transport_running, memory_order_acquire);
    int enabled   = atomic_load_explicit(&c->output_enabled, memory_order_acquire);
    int have_clock = (last > 0) && ((now_ms - last) <= stale_ms);
    if (running && have_clock) return MOVE_CLOCK_STATUS_RUNNING;
    if (last > 0 || enabled)   return MOVE_CLOCK_STATUS_STOPPED;
    return MOVE_CLOCK_STATUS_UNAVAILABLE;
}

#endif /* CHAIN_CLOCK_STATE_H */
