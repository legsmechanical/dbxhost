#!/usr/bin/env bash
# P4 wiring pins: the gestures live in sound mode on the editor hooks, the
# circle rides the tri-state mark, Delete+step clears locks on every bank, and
# the Mute-held ring paint is handed back to the engine on release.
set -euo pipefail
cd "$(dirname "$0")/.."
f() { echo "FAIL: $*"; exit 1; }
S=ui/ui_sound.mjs
grep -q "if (S.deleteHeld) {" $S && grep -q "automationClearKey(t, c, target)" $S || f "Delete+touch must clear the parameter's automation (onParamTouch hook)"
grep -q "else if (S.muteHeld) {" $S && grep -q "automationToggleActive(t, c, target)" $S || f "Mute+touch must toggle the parameter's automation (onParamTouch hook)"
grep -q "return st.active ? 'auto' : 'auto-off';" $S || f "the label mark must be the tri-state automation circle before the module's tilde"
# Smooth/Stepped moved to the AUTOMATION bank (spec §2, 2026-09-03): the editor's knob-touch + jog-click toggle is GONE.
grep -q "automationToggleSmooth(" $S && f "the editor must NOT toggle Smooth any more — that is the AUTOMATION bank's op"
grep -q "automationToggleSmooth(t, c, r.target)" ui/ui_automation_bank.mjs || f "the AUTOMATION bank must own the Smooth/Stepped op"
grep -q "setButtonLED(MoveKnob1 + k, st ? (st.active ? Red : White) : 0, true);" $S || f "Mute held paints the rings: unlit none / red active / white deactivated"
grep -c "paramPagesRepaintKnobs();" $S | grep -q "^3$" || f "the rings are handed back on Mute release, on Delete release, AND when the paint condition ends (three sites)"
grep -q "automationClearStep(_t, _ac, _abs);" ui/ui_input_pads.mjs || f "Delete+step must clear every parameter's lock at the step, on every bank"
echo "PASS: P4 gestures are wired where the spec puts them"
