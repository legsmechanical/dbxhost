#!/usr/bin/env bash
# Move's own Settings menu in a session co-run: SETTINGS ends on a non-row
# announcement only after an input that LEAVES the menu reached Move
# (move_settings_text.h, unit-tested by test_move_settings_text.c). Before,
# any non-row text ended it, and the Wi-Fi menu's plain-text lines kicked the
# session out (2026-10-15). This pins that both leaving inputs are reported:
#   - a Back ceded to Move in a Move-native co-run (NOT only when the track
#     co-run's Back-at-top exit is on — the settings co-run does not set it);
#   - a Step 2 press injected to Move (the session's Shift+Step 2 close);
# and that the D-Bus handler decides through move_settings_next_mode.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
grep -q 'ctrl->move_ui_mode = (uint8_t)move_settings_next_mode(ctrl->move_ui_mode, text,' src/host/shadow_dbus.c \
    || fail "the D-Bus handler does not decide SETTINGS through move_settings_next_mode"
grep -q 'move_settings_text_is_row(text)) ctrl->move_ui_mode = 4' src/host/shadow_dbus.c \
    && fail "the old any-non-row-ends-SETTINGS rule is back"
grep -B3 '^ *shadow_dbus_settings_leave_arm();' src/schwung_shim.c | grep -q 'owner == CORUN_OWNER_PEER && type == 0xB0 && d1 == CC_BACK' \
    || fail "a Back ceded to Move does not arm the Settings leave"
grep -B3 '^ *shadow_dbus_settings_leave_arm();' src/schwung_shim.c | grep -q 'CORUN_KEEP_BACK_TOP_EXIT' \
    && fail "the Back arm is gated on the track co-run's Back-top flag (the settings co-run never sets it)"
grep -q '\.settings_leave_arm = shadow_dbus_settings_leave_arm' src/schwung_shim.c \
    || fail "the shim does not hand shadow_midi the Settings-leave hook"
awk '/memcpy\(&midi_in\[hw_offset\], pkt, 4\);/,/injected\+\+;/' src/host/shadow_midi.c | grep -q "(pkt\[1\] & 0xF0) == 0x90 && pkt\[2\] == 17" \
    || fail "an injected Step 2 press does not arm the Settings leave"
echo "PASS: Move Settings leave inputs are wired (Back to Move, injected Step 2)"
