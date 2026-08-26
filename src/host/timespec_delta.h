/*
 * timespec_delta.h — elapsed microseconds between two CLOCK_MONOTONIC samples.
 *
 * Exists because the obvious inline version has a failure mode that is invisible
 * until it is enormous. MIX_PHASE_END in schwung_shim.c computed:
 *
 *     uint64_t us = (uint64_t)(t1.tv_sec  - t0.tv_sec) * 1000000
 *                 + (uint64_t)(t1.tv_nsec - t0.tv_nsec) / 1000;
 *
 * When a phase spans a second boundary, tv_nsec goes BACKWARDS: tv_sec gains 1
 * and the nanosecond difference is negative. The cast to uint64_t then happens
 * BEFORE the division, so the negative value wraps to ~1.8e19 and is divided by
 * 1000 — leaving ~1.8e16 that the seconds term cannot cancel.
 *
 * ⭑ Reported from a live device 2026-08-26 by the zdl-emu session as
 * "la_rebuild=18446744073711347", which is exactly (2^64)/1000. Because the
 * mix-phase counters are MAX trackers, ONE such hit poisons the whole 5-second
 * reporting window, and the number is not obviously wrong at a glance unless you
 * recognise that constant.
 *
 * ⚠ The sibling counters in schwung_shim.c (synth_us, fx_us, slot_us,
 * _section_us, mix_us) spell it `(sec) * 1000000ULL + (nsec) / 1000`, dividing
 * the SIGNED nanosecond difference before it converts to unsigned. There the
 * modular arithmetic cancels exactly and the result is correct — they are fine,
 * and are deliberately left alone. The difference is only WHERE the cast sits,
 * which is precisely why this was worth extracting somewhere it can be tested
 * instead of being spelled a fourth way inline.
 */

#ifndef TIMESPEC_DELTA_H
#define TIMESPEC_DELTA_H

#include <stdint.h>
#include <time.h>

/* Elapsed microseconds from `t0` to `t1`. A non-advancing or backwards pair
 * reports 0 rather than a huge positive number: these feed MAX trackers, where
 * a bogus large value is far more damaging than a lost sample. */
static inline uint64_t timespec_delta_us(const struct timespec *t0,
                                         const struct timespec *t1) {
    int64_t ns = (int64_t)(t1->tv_sec - t0->tv_sec) * 1000000000LL
               + (int64_t)(t1->tv_nsec - t0->tv_nsec);
    if (ns <= 0) return 0;
    return (uint64_t)(ns / 1000);
}

#endif /* TIMESPEC_DELTA_H */
