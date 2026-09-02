#!/usr/bin/env bash
# A knob edit on a pressed step must close the tap window through the SAME
# path the hold timer uses, or a fast press-turn-release writes a lock and then
# tap-toggles the note it was written on.
set -euo pipefail
cd "$(dirname "$0")/.."
grep -q "S.stepHoldPromote = true" ui/ui_automation.mjs || { echo "FAIL: the lock write must set S.stepHoldPromote"; exit 1; }
grep -q "S.stepHoldPromote))" ui/ui_tick.mjs || { echo "FAIL: the tick's hold-threshold check must honour S.stepHoldPromote"; exit 1; }
grep -q "S.stepHoldPromote = false;" ui/ui_tick.mjs || { echo "FAIL: the tick must consume the flag"; exit 1; }
echo "PASS: a lock edit promotes the step press to a hold via the tick's threshold path"
