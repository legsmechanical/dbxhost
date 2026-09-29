/*
 * Host-side unit test for move_settings_text.h — which Move announcements are
 * rows of Move's own Settings menu. The positives are the exact strings the
 * device announced on 2026-09-28; the negatives are the screens Move announces
 * elsewhere (from the same debug.log), which must NOT read as Settings, or a
 * session would never notice Move leaving its settings.
 */
#include <stdio.h>
#include "move_settings_text.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)
#define ROW(s)    OK(move_settings_text_is_row(s) == 1, "row: " s)
#define NOTROW(s) OK(move_settings_text_is_row(s) == 0, "not a row: " s)

int main(void) {
    ROW("Battery 99 %. Submenu. 1 of 12");
    ROW("Wi-Fi (CarbonaNotGlue). Submenu. 2 of 12");
    ROW("Control Live. Menu item. 5 of 12");
    ROW("MIDI Sync Out. Submenu. 7 of 12");
    ROW("MIDI Sync: Off. Menu item. 1 of 3");
    ROW("A. B. Menu item. 10 of 100");               /* a label with its own ". " */
    NOTROW("Set 29");
    NOTROW("Set Overview");
    NOTROW("Note Mode");
    NOTROW("Session Mode");
    NOTROW("Presets, preset browser, 1 of 11");
    NOTROW("Main, 2 of 11, 8 controls");
    NOTROW("Page 2 of 4");
    NOTROW("Press wheel to shut down");
    NOTROW(". Submenu. 1 of 12");                     /* no label */
    NOTROW("Battery. Submenu. 1 of");                 /* truncated */
    NOTROW("Battery. Submenu. 1 of 12 extra");
    NOTROW("Battery. Submenu. x of 12");
    NOTROW("");
    OK(move_settings_text_is_row(NULL) == 0, "NULL is not a row");
    printf("PASS: test_move_settings_text (%d checks)\n", checks);
    return 0;
}
