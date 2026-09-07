#!/usr/bin/env bash
# When the grid declines to draw, it must not keep the KNOBS.
#
# ⚠⚠ THE BUG. `drawParamPages()` returns false for a page kind it does not
# draw. davebox fell through to its own editor and left `ppOn` true — so the
# screen was davebox's and every knob, jog and touch still went to the grid.
# You look at one editor and silently turn the parameters of another. The host
# has no such state: the same decline makes it call
# `enterHierarchyEditorFromParamPages()` and hand the component over.
#
# ⚠ Narrow trigger today (the planner emits only drawable page kinds; the live
# path is a contract that failed to read and whose retry gave up) — and silent
# when it happens, which is why it is worth pinning rather than watching.
set -euo pipefail
cd "$(dirname "$0")/.."

f=ui/ui_sound.mjs
fail=0
need() {
  if ! grep -Fq -- "$1" "$f"; then echo "FAIL: $2"; echo "      missing: $1"; fail=1
  else echo "  ok   — $2"; fi
}

need "        if (ppOn) ppDeclinedDraw = true;" \
     "a decline is RECORDED at the draw"
need "    const want = ppApplies() && !ppDeclinedDraw" \
     "and the grid is not wanted while it stands — which is what releases the input"

# ⭑ The input gate and the draw must agree on ONE fact. If input keyed off
# something else, the flag could be perfect and the knobs still misrouted.
if ! grep -Fq "if (ppOn && d1 !== 49 && d1 !== 88) {" "$f"; then
  echo "FAIL: the MIDI gate no longer keys off ppOn — re-check that a declined"
  echo "      grid actually stops receiving knobs"
  fail=1
else
  echo "  ok   — the MIDI gate keys off ppOn, which ppSync clears once declined"
fi

# ⚠ STICKY, BUT NOT FOREVER. A flag that never clears would send you to
# davebox's editor for the rest of the session, on every module.
need "    ppDeclinedDraw = false;" "the flag is cleared somewhere"
opens=$(grep -c "ppDeclinedDraw = false;" "$f" || true)
if [ "$opens" -lt 2 ]; then
  echo "FAIL: only $opens clear site(s) — it must clear both on a fresh editor"
  echo "      entry and on leaving the editor, or the grid never comes back"
  fail=1
else
  echo "  ok   — cleared in $opens places (fresh entry, and leaving the editor)"
fi

# The clear must live in openBlock (a new component) — checked structurally so
# a clear that drifted into an unrelated function does not count.
body=$(awk '/^function openBlock\(comp\) \{/{f=1} f{print} f && /^\}$/{exit}' "$f")
if [ -z "$body" ]; then
  echo "FAIL: openBlock not found — this pin is reading the wrong shape"; fail=1
elif ! printf '%s\n' "$body" | grep -Fq "ppDeclinedDraw = false;"; then
  echo "FAIL: opening a component does not clear the decline — one module that"
  echo "      could not be drawn would send every later module to davebox's editor"
  fail=1
else
  echo "  ok   — opening a component clears it"
fi

[ "$fail" -eq 0 ] && echo "PASS: a grid that cannot draw does not keep the knobs" || exit 1
