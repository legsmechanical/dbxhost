#!/usr/bin/env bash
# A knob edit on a pressed step must close the tap window through the SAME
# path the hold timer uses, or a fast press-turn-release writes a lock and then
# tap-toggles the note it was written on.
set -euo pipefail
cd "$(dirname "$0")/.."
grep -q "S.stepHoldPromote = true" ui/ui_automation.mjs || { echo "FAIL: the lock write must set S.stepHoldPromote"; exit 1; }
grep -q "S.stepHoldPromote))" ui/ui_tick.mjs || { echo "FAIL: the tick's hold-threshold check must honour S.stepHoldPromote"; exit 1; }
grep -q "S.stepHoldPromote = false;" ui/ui_tick.mjs || { echo "FAIL: the tick must consume the flag"; exit 1; }

# ⭑ THE TAP WINDOW'S VALUE, and the tests that must outlive it.
#
# Josh, 2026-09-13: step entry "requires a really quick tap and release. need to
# make it about twice as long" — 120 -> 250 ms.
#
# ⚠⚠ WHY THIS PIN EXISTS. The JS tests cross the threshold by bumping S.tickCount,
# which the test clock converts at TICK_MS_FOR_TESTS (10.6 ms/tick) — so a magic
# "+= 25" is 265 ms and cleared the OLD 120 ms window by 145 ms but the new one by
# only 15. Raising the constant again without widening those bumps turns a real
# assertion into one that passes for the wrong reason, silently: the press simply
# stays a tap and "the hold registered" is the failure, not the pin. They advance
# 40 ticks (424 ms) now. Keep this inequality true, or fix the tests in the same
# commit.
ms=$(grep -oE 'STEP_HOLD_MS +=  *[0-9]+' ui/ui_tick.mjs | grep -oE '[0-9]+$')
[ -n "$ms" ] || { echo "FAIL: could not read STEP_HOLD_MS from ui/ui_tick.mjs"; exit 1; }
for f in tests/js/test_hold_never_creates.mjs tests/js/test_held_step_promote_and_gate_drag.mjs; do
  for bump in $(grep -oE 'tickCount \+= [0-9]+' "$f" | grep -oE '[0-9]+$'); do
    # Only the bumps INTENDED to cross matter; a tap-side bump stays small on purpose.
    [ "$bump" -lt 10 ] && continue
    crossed=$(awk -v b="$bump" 'BEGIN{printf "%d", b * 10.6}')
    if [ "$crossed" -le "$ms" ]; then
      echo "FAIL: $f advances $bump ticks (${crossed} ms), which no longer crosses STEP_HOLD_MS=${ms} ms" >&2
      echo "      The hold assertions in that file would pass for the wrong reason. Widen the bump." >&2
      exit 1
    fi
  done
done

echo "PASS: a lock edit promotes the step press to a hold via the tick's threshold path (window ${ms} ms, tests cross it)"
