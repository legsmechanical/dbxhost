/*
 * Host-side unit test for src/host/render_pool.h — the fork-join pool the
 * shim's per-slot chain render runs on.
 *
 * What is pinned, and why each matters on the device:
 *  - the PLAN: pinned tasks land on lane 0 in slot order (a module the user
 *    switched off renders on the audio thread, exactly where it always did);
 *    free tasks go longest-first to the least-loaded lane; a round with
 *    nothing for a helper reports 0 so the caller never pays a wake+join for
 *    no gain; one lane = everything inline.
 *  - the ROUND: every active task runs EXACTLY once, on the lane it was
 *    planned onto, and the caller returns only after every helper is done
 *    (the fork-join invariant everything else rests on).
 *  - the BAIL: a helper that outlasts the deadline poisons the pool; the
 *    caller returns anyway; later rounds are inline; the task the helper is
 *    still holding is SKIPPED (never rendered twice into one buffer, never
 *    freed under it); the tasks that helper had not started are given back
 *    and run inline; and reconfiguring clears the poison only once nothing
 *    is in flight.
 *  - the COUNTERS: a pooled round's serial-equivalent (Σ task cost) is at
 *    least its wall, which is the number the A/B on the device is judged by.
 *
 * Build: cc -std=c11 -pthread tests/host/test_render_pool.c -Isrc/host
 */
#define RENDER_POOL_BAIL_US 20000     /* short, so the bail case runs in ms */
#include "render_pool.h"

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

/* ---- the task body used by every threaded case ---- */
static _Atomic int runs[RENDER_POOL_MAX_TASKS];
static _Atomic int ran_on_lane[RENDER_POOL_MAX_TASKS];
static _Atomic int in_progress;                /* tasks running right now */
static _Atomic int max_in_progress;            /* proof that lanes overlapped */
static int sleep_us[RENDER_POOL_MAX_TASKS];
static _Atomic int hang_task;                  /* -1, or a task that blocks until released */
static _Atomic int hang_release;

static void task(void *ctx, int t, int lane) {
    (void)ctx;
    int n = atomic_fetch_add(&in_progress, 1) + 1;
    int m = atomic_load(&max_in_progress);
    while (n > m && !atomic_compare_exchange_weak(&max_in_progress, &m, n)) { }
    atomic_fetch_add(&runs[t], 1);
    atomic_store(&ran_on_lane[t], lane);
    if (atomic_load(&hang_task) == t) {
        while (!atomic_load(&hang_release)) usleep(200);
    } else if (sleep_us[t] > 0) {
        usleep(sleep_us[t]);
    }
    atomic_fetch_sub(&in_progress, 1);
}
static void reset_runs(void) {
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) { atomic_store(&runs[t], 0); atomic_store(&ran_on_lane[t], -1); }
    atomic_store(&max_in_progress, 0);
}
static int total_runs(void) { int s = 0; for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) s += atomic_load(&runs[t]); return s; }

static int test_plan(void) {
    printf("plan\n");
    int lt[RENDER_POOL_MAX_LANES][RENDER_POOL_MAX_TASKS]; int lc[RENDER_POOL_MAX_LANES];
    float cost[RENDER_POOL_MAX_TASKS] = { 100, 50, 300, 20, 0, 0, 0, 0 };

    /* one lane: everything on lane 0, slot order, nothing for helpers */
    int h = render_pool_plan(1, 0x0F, 0, cost, lt, lc);
    OK(h == 0 && lc[0] == 4 && lt[0][0] == 0 && lt[0][1] == 1 && lt[0][2] == 2 && lt[0][3] == 3,
       "1 lane: all four on lane 0 in slot order, 0 for helpers");

    /* three lanes, no pins: longest first (task 2 = 300) to the least loaded;
     * 300 -> lane 0, 100 -> lane 1, 50 -> lane 2, 20 -> lane 2 (70 < 100) */
    h = render_pool_plan(3, 0x0F, 0, cost, lt, lc);
    OK(h == 3, "3 lanes: three of four tasks go to helpers");
    OK(lc[0] == 1 && lt[0][0] == 2, "the longest task (300) takes lane 0 alone");
    OK(lc[1] == 1 && lt[1][0] == 0, "the next (100) takes lane 1");
    OK(lc[2] == 2 && lt[2][0] == 1 && lt[2][1] == 3, "50 and 20 share lane 2 (70 < 100: least loaded wins)");

    /* pins: task 2 (the longest) pinned -> lane 0 first, in slot order with
     * any other pins; the free tasks then balance against lane 0's load */
    h = render_pool_plan(3, 0x0F, (1u << 2) | (1u << 0), cost, lt, lc);
    OK(lc[0] == 2 && lt[0][0] == 0 && lt[0][1] == 2, "pinned 0 and 2 sit on lane 0, in slot order");
    OK(h == 2 && lc[1] == 1 && lc[2] == 1, "the two free tasks each get a helper lane");
    OK(lt[1][0] == 1 && lt[2][0] == 3, "free tasks longest-first: 50 then 20");

    /* everything pinned: nothing for helpers, even with lanes available */
    h = render_pool_plan(3, 0x0F, 0x0F, cost, lt, lc);
    OK(h == 0 && lc[0] == 4 && lc[1] == 0 && lc[2] == 0, "all pinned = inline, lane 0 has all four");

    /* a single free task: goes to lane 0 when lane 0 is empty (least loaded
     * ties break toward lane 0), so a one-slot set never pays the join */
    h = render_pool_plan(3, 0x04, 0, cost, lt, lc);
    OK(h == 0 && lc[0] == 1 && lt[0][0] == 2, "one active task runs inline on lane 0");

    /* an inactive task is never placed anywhere */
    h = render_pool_plan(3, 0x05, 0, cost, lt, lc);
    int placed = lc[0] + lc[1] + lc[2];
    OK(placed == 2, "inactive tasks are not placed");

    /* control: a plan that ignored pins would put task 2 (longest) on lane 0
     * ANYWAY here — so pin a SHORT task and check it still lands on lane 0 */
    h = render_pool_plan(3, 0x0F, (1u << 3), cost, lt, lc);
    OK(lt[0][0] == 3, "control: a pinned SHORT task is on lane 0 (a pin is not 'longest first')");
    return 0;
}

static render_pool_t pool_round, pool_bail;   /* static: helpers outlive the test fn */

static int test_round(void) {
    printf("round\n");
    render_pool_t *pp = &pool_round; render_pool_init(pp, 3, NULL);
#define p (*pp)
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) sleep_us[t] = 300;
    atomic_store(&hang_task, -1);

    /* seed the cost model so the plan spreads: equal costs -> round robin */
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) p.cost_us[t] = 100;

    reset_runs();
    int pooled = render_pool_run(&p, 0xFF, 0, task, NULL);
    OK(pooled == 1, "eight free tasks on three lanes: the round used helpers");
    OK(total_runs() == 8, "every task ran exactly once in total");
    int each_once = 1;
    for (int t = 0; t < 8; t++) if (atomic_load(&runs[t]) != 1) each_once = 0;
    OK(each_once, "…and each task exactly once");
    int lanes_used = 0, on_h = 0;
    for (int t = 0; t < 8; t++) { int l = atomic_load(&ran_on_lane[t]); if (l > 0) on_h++; if (l == 2) lanes_used = 1; }
    OK(on_h > 0 && lanes_used, "tasks ran on both helper lanes, not just lane 0");
    OK(atomic_load(&max_in_progress) >= 2, "at least two tasks were in progress at once (real parallelism)");
    OK(atomic_load(&p.pending) == 0, "join complete: nothing pending after the round returns");
    OK(p.rounds_pooled == 1 && p.bails == 0, "counted as one pooled round, no bail");
    OK(p.serial_us_sum >= p.wall_us_sum, "serial-equivalent (Σ task cost) >= wall of the round");
    OK(p.serial_us_sum >= 8 * 300 && p.wall_us_sum < 8 * 300, "wall is shorter than eight serial 300 µs sleeps");

    /* pinned tasks run on lane 0 — the caller's thread */
    reset_runs();
    render_pool_run(&p, 0xFF, 0x03, task, NULL);
    OK(atomic_load(&ran_on_lane[0]) == 0 && atomic_load(&ran_on_lane[1]) == 0, "pinned tasks 0 and 1 ran on lane 0");
    OK(total_runs() == 8, "the round still ran every task once");

    /* a round with only pinned tasks runs inline: no helper, no pooled count */
    uint32_t before = p.rounds_pooled;
    reset_runs();
    pooled = render_pool_run(&p, 0x0F, 0x0F, task, NULL);
    OK(pooled == 0 && p.rounds_pooled == before && p.rounds_inline >= 1, "all-pinned round ran inline");
    OK(total_runs() == 4, "…and ran all four tasks once");

    /* one lane: inline, every task on lane 0 */
    render_pool_set_lanes(&p, 1);
    reset_runs();
    pooled = render_pool_run(&p, 0xFF, 0, task, NULL);
    int all0 = 1; for (int t = 0; t < 8; t++) if (atomic_load(&ran_on_lane[t]) != 0) all0 = 0;
    OK(pooled == 0 && all0 && total_runs() == 8, "1 lane: inline, all eight on lane 0");
    OK(p.inline_us_sum >= 8 * 300 && p.inline_us_max >= 8 * 300, "an inline round records its own wall (the serial control's number)");

    /* many rounds: the count stays exact (no lost or doubled task on any round) */
    render_pool_set_lanes(&p, 3);
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) sleep_us[t] = 20 + 10 * t;
    int exact = 1;
    for (int r = 0; r < 300 && exact; r++) {
        reset_runs();
        render_pool_run(&p, 0xFF, (r & 1) ? 0x10 : 0, task, NULL);
        for (int t = 0; t < 8; t++) if (atomic_load(&runs[t]) != 1) exact = 0;
        if (atomic_load(&p.pending) != 0) exact = 0;
    }
    OK(exact && p.bails == 0, "300 rounds: every task once per round, never a bail");
    OK(p.cost_us[7] > p.cost_us[0], "the cost model learned that task 7 is dearer than task 0");
#undef p
    return 0;
}

static int test_bail(void) {
    printf("bail\n");
    render_pool_t *pp = &pool_bail; render_pool_init(pp, 3, NULL);
#define p (*pp)
    for (int t = 0; t < RENDER_POOL_MAX_TASKS; t++) { sleep_us[t] = 0; p.cost_us[t] = 100; }
    /* warm the helpers with an ordinary round first */
    atomic_store(&hang_task, -1);
    reset_runs();
    render_pool_run(&p, 0xFF, 0, task, NULL);

    /* task 5 hangs on whichever helper gets it. Make the plan deterministic:
     * give task 5 a huge cost so it is placed FIRST — onto lane 0? No: lane 0
     * takes the longest. Pin task 6 to weigh lane 0 down so task 5 goes to a
     * helper. */
    p.cost_us[5] = 1000; p.cost_us[6] = 5000;
    atomic_store(&hang_release, 0);
    atomic_store(&hang_task, 5);
    reset_runs();
    uint64_t t0 = render_pool_now_us();
    int pooled = render_pool_run(&p, 0xFF, (1u << 6), task, NULL);
    uint64_t dt = render_pool_now_us() - t0;
    OK(pooled == 1, "the round was pooled");
    OK(atomic_load(&ran_on_lane[5]) > 0, "the hanging task was on a helper lane");
    printf("  (join returned after %llu us; bail %d)\n", (unsigned long long)dt, RENDER_POOL_BAIL_US);
    OK(dt >= RENDER_POOL_BAIL_US && dt < RENDER_POOL_BAIL_US * 4, "the caller returned after the bail deadline, not never");
    OK(atomic_load(&p.poisoned) == 1 && p.bails == 1, "the pool is poisoned and the bail counted");
    OK(atomic_load(&p.in_flight[5]) == 1, "task 5 is still in flight on its helper");

    /* next round: inline, and task 5 is skipped while its helper holds it */
    reset_runs();
    pooled = render_pool_run(&p, 0xFF, 0, task, NULL);
    OK(pooled == 0, "poisoned: the next round ran inline");
    OK(atomic_load(&runs[5]) == 0, "the in-flight task was SKIPPED, not rendered a second time");
    OK(total_runs() == 7, "the other seven ran inline");
    int all0 = 1; for (int t = 0; t < 8; t++) if (t != 5 && atomic_load(&ran_on_lane[t]) != 0) all0 = 0;
    OK(all0, "…all on lane 0");

    /* reconfiguring while the helper still holds task 5 must NOT clear the poison */
    render_pool_set_lanes(&p, 3);
    OK(atomic_load(&p.poisoned) == 1, "set_lanes with a task in flight keeps the poison");

    /* release the helper; it finishes task 5 and gives back the rest of its lane */
    atomic_store(&hang_release, 1);
    for (int i = 0; i < 2000 && (atomic_load(&p.in_flight[5]) || atomic_load(&p.pending) != 0); i++) usleep(100);
    OK(atomic_load(&p.in_flight[5]) == 0, "the helper finished the held task");
    OK(atomic_load(&p.pending) == 0, "…and the tasks it had not started were given back (pending 0)");
    atomic_store(&hang_task, -1);

    /* now the reconfigure clears the poison and pooled rounds resume */
    render_pool_set_lanes(&p, 3);
    OK(atomic_load(&p.poisoned) == 0, "set_lanes with nothing in flight clears the poison");
    reset_runs();
    pooled = render_pool_run(&p, 0xFF, 0, task, NULL);
    int each = 1; for (int t = 0; t < 8; t++) if (atomic_load(&runs[t]) != 1) each = 0;
    OK(pooled == 1 && each && atomic_load(&p.pending) == 0, "pooled rounds resumed: every task once, join clean");
    /* and a further 50 rounds stay exact — the stale done-post from the
     * bailed round did not make a later join return early */
    int exact = 1;
    for (int r = 0; r < 50 && exact; r++) {
        reset_runs();
        render_pool_run(&p, 0xFF, 0, task, NULL);
        for (int t = 0; t < 8; t++) if (atomic_load(&runs[t]) != 1) exact = 0;
        if (atomic_load(&p.pending) != 0) exact = 0;
    }
    OK(exact, "50 rounds after recovery: exact, no early join");
#undef p
    return 0;
}

static int test_ftz(void) {
    printf("ftz\n");
    int f = render_pool_ftz_is_set();
    if (f < 0) { printf("  skip (not aarch64)\n"); return 0; }
    render_pool_set_ftz();
    OK(render_pool_ftz_is_set() == 1, "flush-to-zero set on this thread");
    return 0;
}

int main(void) {
    if (test_plan()) return 1;
    if (test_round()) return 1;
    if (test_bail()) return 1;
    if (test_ftz()) return 1;
    printf("PASS: test_render_pool (%d checks)\n", checks);
    return 0;
}
