#!/usr/bin/env bash
# Source-invariant pins for the project-select UI (Josh's spec, 2026-08-11):
# tapping a pad NEVER loads a project — it opens a jog-wheel menu
# (Load / Rename / Color). The hazard this replaced was real: a stray tap
# loaded a project immediately, and a tap on the pad the picker believed was
# current silently did nothing.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "project-select UI (tap never loads):"

# 1. The ONLY writer of S.pendingProjectSwitch in the dialogs is _pppLoad —
#    the menu's Load action. A second writer means some other gesture loads.
n=$(grep -c "S.pendingProjectSwitch = k" ui/ui_dialogs.mjs)
if [ "$n" = 1 ] && awk '/^function _pppLoad/,/^}/' ui/ui_dialogs.mjs | grep -q "S.pendingProjectSwitch = k"; then
    ok "exactly one switch writer, inside _pppLoad (the menu's Load)"
else
    bad "S.pendingProjectSwitch writers moved — a gesture other than Load may load ($n writers)"
fi

# 2. Same for the awaiting-select load: loadSelectedCurrentProject is reachable
#    from _pppLoad and the fail-open path, never from the tap handler.
if awk '/^function _projectPadPickerTap_impl/,/^}$/' ui/ui_dialogs.mjs | grep -q "loadSelectedCurrentProject\|pendingProjectSwitch"; then
    bad "the pad-tap handler loads directly again"
else
    ok "the pad-tap handler cannot load"
fi

# 3. The jog wheel is swallowed by the picker: without this branch a turn fell
#    through to the bank-knob handling underneath the picker.
if grep -q "projectPadPickerRotate(decodeDelta(d2))" ui/ui_input_cc.mjs; then
    ok "jog turn routed to the picker (not the surface underneath)"
else
    bad "jog turn falls through under the picker"
fi

# 4. Rename shells out through the single-quote helper — an unquoted name
#    reaches system() as shell words.
if awk '/^function _pppDoRename_impl/,/^}$/' ui/ui_dialogs.mjs | grep -q "_shq(trimmed)" &&
   ! awk '/^function _pppDoRename_impl/,/^}$/' ui/ui_dialogs.mjs | grep -q "rename ' + k + ' ' + trimmed"; then
    ok "rename passes the name through _shq"
else
    bad "rename shells out an unquoted name"
fi

# 5. The rename keyboard is wired at the FRONT of the module's MIDI dispatch
#    (the shared text-entry contract: fully modal, reads raw messages).
if grep -q "projectPickerTextEntryMidi(data)) return" ui/ui.js; then
    ok "rename keyboard intercepts raw MIDI first"
else
    bad "rename keyboard is not in the raw dispatch"
fi

# 6. The picker LED painter defers to the keyboard while a rename is live —
#    both painting pads at once shows a corrupted keyboard.
if awk '/^function paintProjectPickerLEDs/,/^}$/' ui/ui_leds.mjs | grep -q "renameActive) return true"; then
    ok "LED painter yields the pads to the rename keyboard"
else
    bad "LED painter fights the rename keyboard for the pads"
fi

[ "$fail" = 0 ] && echo "PASS: project-select UI menu invariants" || { echo "FAIL: project-select UI menu invariants"; exit 1; }
