/* jack_state.h — which saved headphone-jack state (the last CC 115 value XMOS
 * reported: 0 speaker, 127 jack) a host believes at boot.
 *
 * XMOS reports the jack only on a physical change, so a host that starts with
 * the cable already in hears nothing and must go by what was saved. A fork
 * launched from stock Schwung keeps its own file, and stock's host keeps one
 * too: whichever saw the hardware LAST is right. Measured on a Move,
 * 2026-11-12: the fork's file said 0 (written 10-31), stock's said 127
 * (written 11-07), headphones in all along -- and the fork told Move
 * "speaker" at every launch.
 *
 * Pure and header-only so tests/host can run it (test_jack_state.c). */
#ifndef JACK_STATE_H
#define JACK_STATE_H

/* A saved value as read: -1 when the file is missing or holds anything but
 * 0 / 127. `mtime` is its modification time (seconds). */
static inline int jack_state_valid(int v) { return v == 0 || v == 127 ? v : -1; }

/* The one to believe: the newer of two valid values; either alone; else -1.
 * A tie goes to `own` (the same moment: nothing to choose). */
static inline int jack_state_pick(int own, long own_mtime, int other, long other_mtime) {
    own = jack_state_valid(own); other = jack_state_valid(other);
    if (own < 0) return other;
    if (other < 0) return own;
    return other_mtime > own_mtime ? other : own;
}

#endif /* JACK_STATE_H */
