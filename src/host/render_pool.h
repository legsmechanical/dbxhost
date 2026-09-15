/*
 * render_pool.h — a fork-join pool for the per-slot chain render.
 *
 * WHAT IT IS
 * ----------
 * The shim renders SHADOW_CHAIN_INSTANCES chain slots once per SPI frame, in
 * the post-transfer callback, serially on the SPI thread. Every slot is an
 * independent instance with its own output buffers, so the loop is a list of
 * independent tasks — and the device has four cores of which this process
 * uses one for that work. This pool runs those tasks on up to RENDER_POOL_MAX_
 * LANES lanes: lane 0 is the CALLING thread, the others are helper threads
 * that park between rounds.
 *
 * THE INVARIANT THAT MAKES IT SAFE
 * --------------------------------
 * A round is a strict fork-join INSIDE the callback: the caller dispatches,
 * renders its own lane, then WAITS for every helper before returning. Nothing
 * else in the process touches a chain instance while a round is open, because
 * everything that does — set_param, on_midi, load, unload, the param mailbox,
 * the write lane — runs on the very SPI thread that is blocked in the join.
 * So a slot's render never overlaps its own set_param, a module's construction
 * never overlaps another instance's render, and the survey's "unsafe at
 * construction" cases (dx7's static tables, obxd's RNG) cannot fire. What is
 * left is state shared BETWEEN two rendering slots — the chain host's MIDI
 * clock (atomic since chain_clock_state.h), the shim's fallback accumulator
 * (moved after the join by the caller), and per-frame counters (per lane
 * here). The task body owns per-slot state only; that is the caller's
 * contract with this pool.
 *
 * WHAT THE POOL DECIDES
 * ---------------------
 *  - Which lane runs which task. Longest-first: tasks are sorted by their
 *    measured cost (an EWMA of the last rounds, in µs) and each goes to the
 *    least-loaded lane, so the biggest slot never lands last on an already
 *    full lane. A PINNED task always runs on lane 0 — the caller's thread —
 *    which is what "not parallel" means for a module the user has switched
 *    off: it renders exactly where it always did, serially with every other
 *    pinned slot, and no worker ever touches it.
 *  - Whether to bother. A round with nothing for a helper (one task, or all
 *    tasks pinned) runs inline with no wake and no join.
 *  - When to give up. A join that outlasts RENDER_POOL_BAIL_US POISONS the
 *    pool: this round returns without the late lanes, every later round runs
 *    inline, and a task still in flight on a helper is SKIPPED by the inline
 *    path until that helper marks it done (it finishes into its own per-slot
 *    buffers; one torn frame, never a use-after-free and never a hang of the
 *    SPI thread). The poison clears only when the caller reconfigures the
 *    lane count — deliberately, so a device that hit it once does not hit it
 *    every frame.
 *
 * SCHEDULING
 * ----------
 * Helpers are created from the calling thread on the FIRST round, so they
 * inherit its scheduling policy and priority (pthread's default inheritsched)
 * and then drop ONE priority level: the SPI thread's peers at its own level
 * (Move's audio threads) may preempt a helper, a helper may never preempt
 * them. They are pinned to cores 0-2 — core 3 is the SPI IRQ's and is never
 * used (docs/REALTIME_SAFETY.md). Every helper sets flush-to-zero on its own
 * FPCR, which is per-thread on aarch64: without it a decaying IIR tail on a
 * helper grinds through denormals and the helper is SLOWER than serial, and
 * serial-vs-pooled output would differ bit for bit. Affinity and priority
 * failures degrade (the helper runs anyway) and are reported through the
 * `degraded` flag, never fatal.
 *
 * The join spins briefly (the common case: helpers finish within tens of µs
 * of the caller) and then BLOCKS on a semaphore rather than spinning on. A
 * spinning FIFO thread on a core a lower-priority helper needs would starve
 * that helper into the bail; blocking frees the core.
 *
 * WHY NOT movy's shape exactly
 * ----------------------------
 * movy's pool (render_pool.rs) is the model: spawn once, park between rounds,
 * atomic generation + pending, LPT lanes, FTZ per worker, a bail that poisons.
 * Two deliberate differences. Its bail is 250 ms; here it is 50 ms, because
 * the thread that waits is the one Move's SPI transfer depends on and a bail
 * costs whole frames. And it pins by a per-module "pin key" that keeps every
 * instance of a module on ONE lane while still off the audio thread; here a
 * pinned slot renders on the audio thread itself. That is a stronger promise
 * for the same switch (a module that is off is off — not "parallel with
 * everything except itself"), and it needs no key plumbing.
 *
 * Header-only and pure on its inputs so tests/host drives real threads
 * through it without the shim. ⚠ A pool must OUTLIVE its helpers — they hold
 * its address for the life of the process — so it lives in static storage,
 * never on a stack frame.
 */
#ifndef RENDER_POOL_H
#define RENDER_POOL_H

#define _GNU_SOURCE
#include <errno.h>
#include <pthread.h>
#include <sched.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "shim_thread.h"

#ifndef RENDER_POOL_MAX_TASKS
#define RENDER_POOL_MAX_TASKS 8
#endif
/* Lanes = the caller + helpers. Helpers live on cores 0-2, so more than
 * three lanes only adds contention on the cores this process shares with
 * Move's own audio threads. */
#define RENDER_POOL_MAX_LANES 3
#define RENDER_POOL_MAX_HELPERS (RENDER_POOL_MAX_LANES - 1)
/* A join longer than this is a wedged helper, not a slow one: the whole frame
 * is ~2.9 ms and the compute budget 900 µs. Poison rather than hang. */
#ifndef RENDER_POOL_BAIL_US
#define RENDER_POOL_BAIL_US 50000
#endif
/* Spin this long before blocking in the join. */
#ifndef RENDER_POOL_SPIN_US
#define RENDER_POOL_SPIN_US 30
#endif

typedef void (*render_pool_task_fn)(void *ctx, int task, int lane);

typedef struct render_pool {
    /* configuration */
    int lanes;                          /* 1..MAX_LANES; 1 = serial */
    int helpers_started;                /* helper threads exist */
    void (*log)(const char *msg);       /* optional; called off the RT path only */

    /* round state */
    render_pool_task_fn fn;
    void *ctx;
    int lane_tasks[RENDER_POOL_MAX_LANES][RENDER_POOL_MAX_TASKS];
    int lane_count[RENDER_POOL_MAX_LANES];
    _Atomic int pending;                /* helper-lane tasks not yet finished */
    _Atomic int in_flight[RENDER_POOL_MAX_TASKS];
    _Atomic int poisoned;
    _Atomic uint32_t generation;
    /* One mutex, two condvars, both predicate-based (generation for the
     * helpers, pending for the caller): no stale wake-ups to drain, and no
     * unnamed POSIX semaphores, which the dev Mac does not have. */
    pthread_mutex_t mu;
    pthread_cond_t wake_cv;
    pthread_cond_t done_cv;
    pthread_t tid[RENDER_POOL_MAX_HELPERS];
    struct { struct render_pool *pool; int helper; } helper_arg[RENDER_POOL_MAX_HELPERS];
    _Atomic int degraded;               /* a helper could not get its affinity/priority */

    /* per-task cost model, µs (EWMA, alpha 1/8); written by whichever lane
     * ran the task, read by the planner AFTER the join */
    float cost_us[RENDER_POOL_MAX_TASKS];
    uint64_t task_us[RENDER_POOL_MAX_TASKS];   /* this round's measured cost */
    uint64_t lane_us[RENDER_POOL_MAX_LANES];   /* this round's per-lane wall */

    /* counters for the timing snapshot — written by the caller only */
    uint32_t rounds_pooled, rounds_inline, bails;
    uint64_t wall_us_sum, wall_us_max;          /* pooled rounds: dispatch→join */
    uint64_t serial_us_sum, serial_us_max;      /* pooled rounds: Σ task_us (the serial-equivalent) */
    uint64_t join_wait_us_max;                  /* caller's idle time in the join */
    uint64_t lane_us_max[RENDER_POOL_MAX_LANES];
} render_pool_t;

static inline uint64_t render_pool_now_us(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000000ULL + (uint64_t)t.tv_nsec / 1000ULL;
}

static inline void render_pool_init(render_pool_t *p, int lanes, void (*log)(const char *)) {
    memset(p, 0, sizeof(*p));
    if (lanes < 1) lanes = 1;
    if (lanes > RENDER_POOL_MAX_LANES) lanes = RENDER_POOL_MAX_LANES;
    p->lanes = lanes;
    p->log = log;
    pthread_mutex_init(&p->mu, NULL);
    pthread_cond_init(&p->wake_cv, NULL);
    pthread_cond_init(&p->done_cv, NULL);
}

/* Reconfigure the lane count. Also the only thing that clears a poison — and
 * only when nothing is in flight, so a bailed helper still writing a slot is
 * never handed a new round. Returns the lane count in effect. */
static inline int render_pool_set_lanes(render_pool_t *p, int lanes) {
    if (lanes < 1) lanes = 1;
    if (lanes > RENDER_POOL_MAX_LANES) lanes = RENDER_POOL_MAX_LANES;
    p->lanes = lanes;
    if (atomic_load_explicit(&p->poisoned, memory_order_acquire)) {
        int busy = 0;
        for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++)
            if (atomic_load_explicit(&p->in_flight[t], memory_order_acquire)) busy = 1;
        if (!busy && atomic_load_explicit(&p->pending, memory_order_acquire) == 0)
            atomic_store_explicit(&p->poisoned, 0, memory_order_release);
    }
    return p->lanes;
}

/* Flush-to-zero for THIS thread. aarch64 FPCR bit 24 = FZ. Mirrors the SPI
 * thread's own first-callback setup in schwung_shim.c. */
static inline void render_pool_set_ftz(void) {
#if defined(__aarch64__)
    unsigned long fpcr;
    __asm__ __volatile__ ("mrs %0, fpcr" : "=r"(fpcr));
    fpcr |= (1UL << 24);
    __asm__ __volatile__ ("msr fpcr, %0" :: "r"(fpcr));
#endif
}

static inline int render_pool_ftz_is_set(void) {
#if defined(__aarch64__)
    unsigned long fpcr;
    __asm__ __volatile__ ("mrs %0, fpcr" : "=r"(fpcr));
    return (fpcr & (1UL << 24)) ? 1 : 0;
#else
    return -1;   /* not applicable on this arch */
#endif
}

static inline void render_pool_run_lane(render_pool_t *p, int lane) {
    uint64_t t0 = render_pool_now_us();
    for (int i = 0; i < p->lane_count[lane]; i++) {
        int task = p->lane_tasks[lane][i];
        if (lane != 0 && atomic_load_explicit(&p->poisoned, memory_order_acquire)) {
            /* The caller bailed on this round and is rendering inline from
             * here on: it will render the tasks this lane has not started,
             * so this lane must NOT start them (a second render of the same
             * slot into the same buffer). Give them back to the count. */
            int remaining = p->lane_count[lane] - i;
            if (atomic_fetch_sub_explicit(&p->pending, remaining, memory_order_acq_rel) == remaining) {
                pthread_mutex_lock(&p->mu);
                pthread_cond_signal(&p->done_cv);
                pthread_mutex_unlock(&p->mu);
            }
            break;
        }
        atomic_store_explicit(&p->in_flight[task], 1, memory_order_release);
        uint64_t a = render_pool_now_us();
        p->fn(p->ctx, task, lane);
        uint64_t b = render_pool_now_us();
        p->task_us[task] = b - a;
        p->cost_us[task] += ((float)(b - a) - p->cost_us[task]) * 0.125f;
        atomic_store_explicit(&p->in_flight[task], 0, memory_order_release);
        if (lane != 0) {
            /* The last helper task to finish wakes the caller. */
            if (atomic_fetch_sub_explicit(&p->pending, 1, memory_order_acq_rel) == 1) {
                pthread_mutex_lock(&p->mu);
                pthread_cond_signal(&p->done_cv);
                pthread_mutex_unlock(&p->mu);
            }
        }
    }
    p->lane_us[lane] = render_pool_now_us() - t0;
}

static inline void *render_pool_helper_main(void *arg) {
    render_pool_t *p = ((struct { struct render_pool *pool; int helper; } *)arg)->pool;
    int helper = ((struct { struct render_pool *pool; int helper; } *)arg)->helper;
    int lane = helper + 1;

    int deg = 0;
#if defined(__linux__)
    /* Cores 0-2, never 3 (the SPI IRQ's). */
    cpu_set_t mask; CPU_ZERO(&mask);
    CPU_SET(0, &mask); CPU_SET(1, &mask); CPU_SET(2, &mask);
    if (pthread_setaffinity_np(pthread_self(), sizeof(mask), &mask) != 0) deg = 1;
#endif
    /* One level below the thread that created us (inherited), if it is RT. */
    {
        int policy = 0; struct sched_param sp;
        if (pthread_getschedparam(pthread_self(), &policy, &sp) == 0 &&
            (policy == SCHED_FIFO || policy == SCHED_RR) && sp.sched_priority > 1) {
            sp.sched_priority -= 1;
            if (pthread_setschedparam(pthread_self(), policy, &sp) != 0) deg = 1;
        }
    }
    if (deg) atomic_store_explicit(&p->degraded, 1, memory_order_release);
    render_pool_set_ftz();
    if (p->log) {
        char msg[96];
        int policy = 0; struct sched_param sp; sp.sched_priority = 0;
        pthread_getschedparam(pthread_self(), &policy, &sp);
        snprintf(msg, sizeof(msg), "render pool: helper %d up (policy %d prio %d%s)",
                 helper, policy, sp.sched_priority, deg ? ", DEGRADED" : "");
        p->log(msg);
    }

    uint32_t seen = 0;
    for (;;) {
        pthread_mutex_lock(&p->mu);
        while (atomic_load_explicit(&p->generation, memory_order_acquire) == seen)
            pthread_cond_wait(&p->wake_cv, &p->mu);
        seen = atomic_load_explicit(&p->generation, memory_order_acquire);
        pthread_mutex_unlock(&p->mu);
        /* A helper wakes on every round; one with no tasks this round has
         * lane_count 0 and returns at once. */
        render_pool_run_lane(p, lane);
    }
    return NULL;
}

/* Start the helpers. Called from the thread whose scheduling they should
 * inherit — the SPI thread, on its first pooled round. One deliberate
 * allocation there (the chain bus worker sets the precedent). Returns 0 on
 * success; on failure the pool stays serial. */
static inline int render_pool_start_helpers(render_pool_t *p) {
    if (p->helpers_started) return 0;
    int started = 0;
    for (int h = 0; h < p->lanes - 1 && h < RENDER_POOL_MAX_HELPERS; h++) {
        p->helper_arg[h].pool = p; p->helper_arg[h].helper = h;
        if (shim_pthread_create(&p->tid[h], NULL, render_pool_helper_main, &p->helper_arg[h]) != 0) {
            if (p->log) p->log("render pool: helper create failed — staying serial");
            break;
        }
        pthread_detach(p->tid[h]);
        started++;
    }
    if (started == 0) { p->lanes = 1; return -1; }
    /* Fewer helpers than asked: shrink the lane count to what exists. */
    p->lanes = started + 1;
    p->helpers_started = 1;
    return 0;
}

/*
 * Plan a round: which lane gets which task. Pure — no threads, no clock.
 *   active_mask / pinned_mask: bit t = task t
 *   cost_us[t]:  the planner's cost model for task t
 *   lanes:       lanes available (1 = everything on lane 0)
 * Fills lane_tasks/lane_count; returns the number of tasks placed on HELPER
 * lanes (0 = run inline, there is nothing for a helper to do).
 */
static inline int render_pool_plan(int lanes, uint32_t active_mask, uint32_t pinned_mask,
                                   const float *cost_us,
                                   int lane_tasks[][RENDER_POOL_MAX_TASKS],
                                   int *lane_count) {
    if (lanes < 1) lanes = 1;
    if (lanes > RENDER_POOL_MAX_LANES) lanes = RENDER_POOL_MAX_LANES;
    for (int l = 0; l < RENDER_POOL_MAX_LANES; l++) lane_count[l] = 0;
    float load[RENDER_POOL_MAX_LANES] = {0};

    /* One lane: everything on lane 0 in slot order — exactly today's serial
     * loop, no reordering to explain. */
    if (lanes == 1) {
        for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++)
            if (active_mask & (1u << t)) lane_tasks[0][lane_count[0]++] = t;
        return 0;
    }
    /* Pinned first, on lane 0, in slot order (exactly today's serial order). */
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) {
        if (!(active_mask & (1u << t))) continue;
        if (!(pinned_mask & (1u << t))) continue;
        lane_tasks[0][lane_count[0]++] = t;
        load[0] += cost_us[t];
    }
    /* Free tasks, longest first (insertion sort — 8 items). */
    int order[RENDER_POOL_MAX_TASKS]; int n = 0;
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) {
        if (!(active_mask & (1u << t)) || (pinned_mask & (1u << t))) continue;
        int i = n++;
        while (i > 0 && cost_us[order[i - 1]] < cost_us[t]) { order[i] = order[i - 1]; i--; }
        order[i] = t;
    }
    int on_helpers = 0;
    for (int i = 0; i < n; i++) {
        int t = order[i];
        int best = 0;
        for (int l = 1; l < lanes; l++) if (load[l] < load[best]) best = l;
        lane_tasks[best][lane_count[best]++] = t;
        load[best] += cost_us[t];
        if (best != 0) on_helpers++;
    }
    return on_helpers;
}

/*
 * One round. Every active task runs exactly once (except a task still in
 * flight from a bailed round, which is skipped until its helper is done).
 * Returns 1 if the round used helpers, 0 if it ran inline.
 */
static inline int render_pool_run(render_pool_t *p, uint32_t active_mask, uint32_t pinned_mask,
                                  render_pool_task_fn fn, void *ctx) {
    p->fn = fn; p->ctx = ctx;
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) p->task_us[t] = 0;
    for (int l = 0; l < RENDER_POOL_MAX_LANES; l++) p->lane_us[l] = 0;

    int poisoned = atomic_load_explicit(&p->poisoned, memory_order_acquire);
    int on_helpers = 0;
    if (!poisoned && p->lanes > 1) {
        if (!p->helpers_started) render_pool_start_helpers(p);
        if (p->lanes > 1)
            on_helpers = render_pool_plan(p->lanes, active_mask, pinned_mask, p->cost_us,
                                          p->lane_tasks, p->lane_count);
    }

    if (on_helpers == 0) {
        /* Inline: lane 0 takes everything, in slot order. A task a bailed
         * helper still owns is left alone. */
        p->lane_count[0] = 0;
        for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) {
            if (!(active_mask & (1u << t))) continue;
            if (atomic_load_explicit(&p->in_flight[t], memory_order_acquire)) continue;
            p->lane_tasks[0][p->lane_count[0]++] = t;
        }
        for (int l = 1; l < RENDER_POOL_MAX_LANES; l++) p->lane_count[l] = 0;
        render_pool_run_lane(p, 0);
        p->rounds_inline++;
        return 0;
    }

    /* Dispatch: publish the plan, then wake the helpers. */
    uint64_t t0 = render_pool_now_us();
    atomic_store_explicit(&p->pending, on_helpers, memory_order_release);
    pthread_mutex_lock(&p->mu);
    atomic_fetch_add_explicit(&p->generation, 1, memory_order_acq_rel);
    pthread_cond_broadcast(&p->wake_cv);
    pthread_mutex_unlock(&p->mu);

    render_pool_run_lane(p, 0);

    /* Join: spin briefly, then block with a deadline. */
    uint64_t join_start = render_pool_now_us();
    uint64_t deadline = t0 + RENDER_POOL_BAIL_US;
    int bailed = 0;
    while (atomic_load_explicit(&p->pending, memory_order_acquire) > 0) {
        uint64_t now = render_pool_now_us();
        if (now >= deadline) { bailed = 1; break; }
        if (now - join_start < RENDER_POOL_SPIN_US) { sched_yield(); continue; }
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        uint64_t left = deadline - now;
        ts.tv_sec += (time_t)(left / 1000000ULL);
        ts.tv_nsec += (long)((left % 1000000ULL) * 1000ULL);
        if (ts.tv_nsec >= 1000000000L) { ts.tv_sec++; ts.tv_nsec -= 1000000000L; }
        pthread_mutex_lock(&p->mu);
        while (atomic_load_explicit(&p->pending, memory_order_acquire) > 0) {
            if (pthread_cond_timedwait(&p->done_cv, &p->mu, &ts) == ETIMEDOUT) break;
        }
        pthread_mutex_unlock(&p->mu);
        /* loop: re-checks pending against the deadline */
    }
    uint64_t t1 = render_pool_now_us();

    if (bailed) {
        atomic_store_explicit(&p->poisoned, 1, memory_order_release);
        p->bails++;
        if (p->log) p->log("render pool: join exceeded the bail — poisoned, rendering serially");
    }

    /* Counters: wall vs the serial-equivalent (Σ task cost). */
    uint64_t wall = t1 - t0, serial = 0;
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) serial += p->task_us[t];
    uint64_t join_wait = t1 - join_start;
    p->rounds_pooled++;
    p->wall_us_sum += wall; if (wall > p->wall_us_max) p->wall_us_max = wall;
    p->serial_us_sum += serial; if (serial > p->serial_us_max) p->serial_us_max = serial;
    if (join_wait > p->join_wait_us_max) p->join_wait_us_max = join_wait;
    for (int l = 0; l < p->lanes; l++)
        if (p->lane_us[l] > p->lane_us_max[l]) p->lane_us_max[l] = p->lane_us[l];
    return 1;
}

/* Reset the snapshot counters (after the timing logger latched them). */
static inline void render_pool_reset_counters(render_pool_t *p) {
    p->rounds_pooled = p->rounds_inline = p->bails = 0;
    p->wall_us_sum = p->wall_us_max = 0;
    p->serial_us_sum = p->serial_us_max = 0;
    p->join_wait_us_max = 0;
    for (int l = 0; l < RENDER_POOL_MAX_LANES; l++) p->lane_us_max[l] = 0;
}

#endif /* RENDER_POOL_H */
