/*
 * corun_back_top.h — Back at the TOP of Move's own editor ends a Move-native
 * co-run.
 *
 * Josh, 2026-09-28: "can we not determine when a move instrument editor is at
 * its top level and use back to exit from there in move instrument co-run?"
 *
 * Move's announcements cannot say "this is the top": the top level announces
 * the instrument's own name, deeper levels announce a pad's sound or a list
 * row, and a knob announces its parameter at any level (device capture,
 * 2026-09-28). But Back itself answers the question: every Back that climbs a
 * level makes Move announce where it landed, and Back at the top does nothing
 * at all ("back is truly nothing at the top level", Josh). So a Back that Move
 * answers with SILENCE was pressed at the top — and that is when the co-run
 * ends, exactly as the framework's own Back exit does.
 *
 * Pure: the caller supplies the clock and the announcement counter, so the
 * rule is unit-tested off the device (tests/host/test_corun_back_top.c).
 */
#ifndef CORUN_BACK_TOP_H
#define CORUN_BACK_TOP_H

#include <stdint.h>

/* How long Move gets to answer a Back. Announcements land within tens of
 * milliseconds of a press on the device; this is several times that, and
 * short enough that leaving still feels like the press did it. */
#define CORUN_BACK_TOP_MS 400u

typedef struct {
    uint64_t armed_ms;   /* 0 = no Back waiting for Move's answer */
    uint32_t seq;        /* the announcement count when it was pressed */
} corun_back_top_t;

/* A Back went to Move. */
static inline void corun_back_top_press(corun_back_top_t *p, uint64_t now_ms, uint32_t seq) {
    p->armed_ms = now_ms ? now_ms : 1;
    p->seq = seq;
}

/* Once per frame. Returns 1 exactly once, when the co-run should end: Move
 * has said nothing since the Back for CORUN_BACK_TOP_MS. Any announcement in
 * that window means Back climbed a level, and disarms. `active` is 0 when the
 * co-run already ended some other way, which also disarms. */
static inline int corun_back_top_poll(corun_back_top_t *p, uint64_t now_ms, uint32_t seq, int active) {
    if (!p->armed_ms) return 0;
    if (!active || seq != p->seq) { p->armed_ms = 0; return 0; }
    if (now_ms - p->armed_ms < CORUN_BACK_TOP_MS) return 0;
    p->armed_ms = 0;
    return 1;
}

#endif
