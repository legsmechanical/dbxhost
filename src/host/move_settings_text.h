/*
 * move_settings_text.h — is a Move screen-reader announcement a row of Move's
 * own Settings menu (the one Shift+Step 2 opens)?
 *
 * Move announces every row it lands on over D-Bus. Measured on the device
 * (2026-09-28): the Settings menu's rows read
 *     "Battery 99 %. Submenu. 1 of 12"
 *     "Control Live. Menu item. 5 of 12"
 *     "MIDI Sync: Off. Menu item. 1 of 3"      (inside a submenu)
 * and leaving it announces the screen Move went back to ("Set 29", ...). So a
 * row is: some label, then ". Submenu. " or ". Menu item. ", then exactly
 * "<n> of <m>". The host marks move_ui_mode SETTINGS on such a row; a session
 * that opened Move's settings reads it to know when Move left them.
 *
 * ⚠ NOT EVERY SETTINGS SCREEN IS A ROW (Josh, 2026-10-15: "trying to enter
 * the wifi menu from move settings co-run in dbxhost kicks me back out"). The
 * Wi-Fi menu's status line and its network list announce as plain text
 * ("Disconnected 99 %" — device log, 2026-10-15), and dropping SETTINGS on
 * those read as "Move left". So a non-row announcement ends SETTINGS only
 * when something that LEAVES Move's settings went to Move just before it: a
 * Back (at the top level it leaves), or the Shift+Step 2 that toggles the
 * menu closed (move_settings_next_mode).
 *
 * Pure (no I/O), so it is unit-tested on the dev machine.
 */
#ifndef MOVE_SETTINGS_TEXT_H
#define MOVE_SETTINGS_TEXT_H

#include <stdint.h>
#include <string.h>

/* "<digits> of <digits>" and nothing else. */
static inline int move_settings_text_is_position(const char *s) {
    const char *p = s;
    if (*p < '0' || *p > '9') return 0;
    while (*p >= '0' && *p <= '9') p++;
    if (strncmp(p, " of ", 4) != 0) return 0;
    p += 4;
    if (*p < '0' || *p > '9') return 0;
    while (*p >= '0' && *p <= '9') p++;
    return *p == '\0';
}

static inline int move_settings_text_is_row(const char *text) {
    static const char *const kinds[] = { ". Submenu. ", ". Menu item. " };
    if (!text || !text[0]) return 0;
    for (unsigned k = 0; k < sizeof(kinds) / sizeof(kinds[0]); k++) {
        const size_t n = strlen(kinds[k]);
        /* The LAST occurrence: a label may itself contain ". ". */
        const char *hit = NULL;
        for (const char *p = strstr(text, kinds[k]); p; p = strstr(p + 1, kinds[k])) hit = p;
        if (hit && hit > text && move_settings_text_is_position(hit + n)) return 1;
    }
    return 0;
}

/* How long after a leaving input (a Back to Move, a Step 2 press injected to
 * Move) a non-row announcement still counts as Move having left. Move answers
 * in tens of milliseconds; the injected Shift+Step 2 sequence is ~500 ms long
 * with the Step 2 press in its middle. */
#define MOVE_SETTINGS_LEAVE_MS 1500u

typedef struct {
    uint64_t armed_ms;   /* when a leaving input last went to Move; 0 = none */
} move_settings_leave_t;

static inline void move_settings_leave_arm(move_settings_leave_t *l, uint64_t now_ms) {
    __atomic_store_n(&l->armed_ms, now_ms ? now_ms : 1, __ATOMIC_RELEASE);
}

/* move_ui_mode after an announcement, as far as SETTINGS (4) goes: a row
 * sets it (and spends any leaving input — Back climbed to a row, so it did not
 * leave); a non-row text drops it to 0 only if a leaving input reached Move
 * within MOVE_SETTINGS_LEAVE_MS, else it is settings content that is not a
 * row, and SETTINGS stays. "Page ..." is the host's own announcement. Any
 * other mode passes through. */
static inline int move_settings_next_mode(int cur, const char *text, move_settings_leave_t *l,
                                          uint64_t now_ms) {
    if (!text) return cur;
    if (move_settings_text_is_row(text)) { __atomic_store_n(&l->armed_ms, 0, __ATOMIC_RELAXED); return 4; }
    if (cur != 4 || strncmp(text, "Page ", 5) == 0) return cur;
    const uint64_t a = __atomic_load_n(&l->armed_ms, __ATOMIC_ACQUIRE);
    if (a && now_ms >= a && now_ms - a < MOVE_SETTINGS_LEAVE_MS) {
        __atomic_store_n(&l->armed_ms, 0, __ATOMIC_RELAXED);
        return 0;
    }
    return 4;
}

#endif
