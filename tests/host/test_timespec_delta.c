/* test_timespec_delta — the second-boundary case, which is the whole reason
 * this helper exists.
 *
 * Reported from a live device 2026-08-26 by the zdl-emu session:
 * "la_rebuild=18446744073711347" — exactly (2^64)/1000, produced by casting a
 * NEGATIVE nanosecond difference to uint64_t before dividing. The mix-phase
 * counters are MAX trackers, so one such sample poisons a whole 5-second
 * reporting window while looking merely odd rather than obviously wrong.
 */
#include <stdio.h>
#include "timespec_delta.h"

static int fails = 0;
static void check(const char *what, int cond) {
    if (cond) printf("  ok   %s\n", what);
    else    { printf("  FAIL %s\n", what); fails = 1; }
}
static struct timespec ts(long sec, long nsec) {
    struct timespec t; t.tv_sec = sec; t.tv_nsec = nsec; return t;
}

int main(void) {
    printf("timespec delta:\n");

    /* THE REGRESSION. 1.999s -> 2.000s: one second gained, nanoseconds go
     * backwards by 999,000,000. The old expression returned ~1.8e16 here. */
    {
        struct timespec a = ts(1, 999000000), b = ts(2, 0);
        uint64_t us = timespec_delta_us(&a, &b);
        check("a second-boundary crossing is 1000 us, not 1.8e16", us == 1000);
        check("...and is nowhere near the wrap constant", us < 1000000);
    }

    /* Ordinary cases, same second. */
    {
        struct timespec a = ts(5, 1000), b = ts(5, 501000);
        check("500 us inside one second", timespec_delta_us(&a, &b) == 500);
    }
    {
        struct timespec a = ts(5, 0), b = ts(7, 250000000);
        check("multi-second spans still add up", timespec_delta_us(&a, &b) == 2250000);
    }

    /* Sub-microsecond truncates DOWN, never up: these feed max trackers. */
    {
        struct timespec a = ts(0, 0), b = ts(0, 999);
        check("sub-microsecond reads 0", timespec_delta_us(&a, &b) == 0);
    }

    /* A backwards or equal pair must report 0 — a bogus large value is far more
     * damaging to a MAX tracker than a lost sample. */
    {
        struct timespec a = ts(9, 500000000), b = ts(9, 500000000);
        check("an identical pair is 0", timespec_delta_us(&a, &b) == 0);
    }
    {
        struct timespec a = ts(9, 500000000), b = ts(8, 0);
        check("a BACKWARDS pair is 0, not enormous", timespec_delta_us(&a, &b) == 0);
    }
    {
        struct timespec a = ts(3, 500000000), b = ts(3, 400000000);
        check("backwards within one second is 0 too", timespec_delta_us(&a, &b) == 0);
    }

    /* Control: the helper must be capable of returning something non-zero, or
     * every assertion above is satisfied by a function that always returns 0. */
    {
        struct timespec a = ts(0, 0), b = ts(0, 5000);
        check("⚠ control: a normal 5 us gap really does read 5", timespec_delta_us(&a, &b) == 5);
    }

    printf(fails ? "FAILED\n" : "PASSED\n");
    return fails;
}
