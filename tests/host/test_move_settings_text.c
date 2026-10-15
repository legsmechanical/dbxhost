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
    ROW("Back. Back. 1 of 3");                       /* a submenu's first row (Wi-Fi, 2026-10-15) */
    ROW("CarbonaNotGlue (connected). Submenu. 3 of 10");
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

    /* ---- the mode, announcement by announcement (2026-10-15: entering the
     * Wi-Fi menu kicked a session out of Move's settings) ---- */
    {
        move_settings_leave_t l = { 0 };
        int m = 0;
        uint64_t t = 1000;
        m = move_settings_next_mode(m, "Battery 99 %. Submenu. 1 of 12", &l, t);
        OK(m == 4, "a Settings row sets SETTINGS");
        m = move_settings_next_mode(m, "Wi-Fi (CarbonaNotGlue). Submenu. 2 of 12", &l, t += 300);
        /* click into Wi-Fi: its status line and network list are plain text */
        m = move_settings_next_mode(m, "Disconnected 99 %", &l, t += 300);
        OK(m == 4, "Wi-Fi's status line (not a row) KEEPS SETTINGS with no leaving input");
        m = move_settings_next_mode(m, "CarbonaNotGlue 80 %", &l, t += 300);
        OK(m == 4, "a network in the list keeps SETTINGS");
        m = move_settings_next_mode(m, "Wi-Fi Off. Menu item. 2 of 2", &l, t += 300);
        OK(m == 4, "and the Wi-Fi row after it is still SETTINGS");
        /* Back inside the submenu climbs to a ROW: still in, and the Back is spent */
        move_settings_leave_arm(&l, t += 300);
        m = move_settings_next_mode(m, "Wi-Fi (CarbonaNotGlue). Submenu. 2 of 12", &l, t += 40);
        OK(m == 4, "Back to the parent row stays in Settings");
        m = move_settings_next_mode(m, "Disconnected 99 %", &l, t += 200);
        OK(m == 4, "a Back already answered by a row does not count for the next text");
        /* Back at the TOP level: Move leaves and announces where it went */
        m = move_settings_next_mode(m, "Battery 99 %. Submenu. 1 of 12", &l, t += 300);
        move_settings_leave_arm(&l, t += 300);
        m = move_settings_next_mode(m, "Set 29", &l, t += 50);
        OK(m == 0, "Back at the top, then the main screen: SETTINGS ends");
        /* the session's own close: Shift+Step 2 injected, then Move's main screen */
        m = move_settings_next_mode(m, "Battery 99 %. Submenu. 1 of 12", &l, t += 1000);
        move_settings_leave_arm(&l, t += 300);
        m = move_settings_next_mode(m, "Note Mode", &l, t += 700);
        OK(m == 0, "Shift+Step 2's close, then a main screen: SETTINGS ends");
        /* a leaving input that went unanswered for too long does not count later */
        m = move_settings_next_mode(m, "Battery 99 %. Submenu. 1 of 12", &l, t += 1000);
        move_settings_leave_arm(&l, t += 100);
        m = move_settings_next_mode(m, "Disconnected 99 %", &l, t += MOVE_SETTINGS_LEAVE_MS + 10);
        OK(m == 4, "a stale leaving input does not end SETTINGS");
        OK(move_settings_next_mode(4, "Page 2 of 4", &l, t) == 4, "the host's own Page text never ends it");
        OK(move_settings_next_mode(1, "Disconnected 99 %", &l, t) == 1, "another mode passes through");
        OK(move_settings_next_mode(1, NULL, &l, t) == 1, "NULL text changes nothing");
    }
    printf("PASS: test_move_settings_text (%d checks)\n", checks);
    return 0;
}
