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
 * "<n> of <m>". The host marks move_ui_mode SETTINGS on such a row and drops it
 * on any other announcement; a session that opened Move's settings reads that
 * to know when Back at the top level took Move out of them.
 *
 * Pure (no I/O), so it is unit-tested on the dev machine.
 */
#ifndef MOVE_SETTINGS_TEXT_H
#define MOVE_SETTINGS_TEXT_H

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

#endif
