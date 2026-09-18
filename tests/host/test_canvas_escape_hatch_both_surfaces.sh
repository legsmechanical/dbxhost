#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# SHIFT+JOG MUST LEAVE A CANVAS ON *BOTH* SURFACES.
#
# An enterable canvas owns the jog, the click and -- until it declines -- Back,
# so a module whose navigation is broken, or simply deeper than the user
# expected, can make leaving feel like work. Shift+jog closes it and does NOT
# consume the turn, so the gesture that gets you out also moves you on.
#
# ⚠⚠ THE HOST'S COPY DOES NOT COVER dAVEBOx, AND THAT IS WHY THIS FILE EXISTS.
# shadow_ui handles it in the canvas steal block, gated on `view ===
# VIEWS.CANVAS` -- the HIERARCHY EDITOR's canvas. dAVEBOx's canvas is its own
# VIEW_CANVAS in davebox/ui/ui_sound.mjs, so that branch never fires there and
# Shift+jog was forwarded to the module like any other CC. Reported from the
# device: "on dbxhost shift+wheel doesn't exit the browser."
#
# Every other half of this contract ported cleanly. This one did not, because it
# is the only piece keyed on a VIEW dAVEBOx does not use -- so a port that
# checks members finds nothing missing. Only using the screen finds it, which is
# exactly why the check is here now.

fail=0
host="src/shadow/shadow_ui.js"
dbx="davebox/ui/ui_sound.mjs"

# --- the host half: declines to steal, and does not consume the turn ---
if ! rg -qU 'if \(d1 === 14 && isShiftHeld\(\) && d2 !== 0\) \{' "$host"; then
  echo "FAIL: shadow_ui has no Shift+jog escape while a canvas is up" >&2; fail=1
fi
if ! rg -qU 'isShiftHeld\(\) && d2 !== 0\) \{\n[^}]*closeCanvasPreview\(true\)' "$host"; then
  echo "FAIL: the host escape does not close the canvas" >&2; fail=1
fi

# --- the davebox half: same gesture, its own view ---
if ! rg -qU 'S\.view === VIEW_CANVAS && canvasEditActive\(\) &&\n\s*d1 === 14 && GS\.shiftHeld && d2 !== 0' "$dbx"; then
  echo "FAIL: davebox has no Shift+jog escape on VIEW_CANVAS -- the host branch does not cover it" >&2; fail=1
fi
if ! rg -qU 'GS\.shiftHeld && d2 !== 0\) \{\n\s*closeCanvasScreen\(\);' "$dbx"; then
  echo "FAIL: the davebox escape does not close the canvas" >&2; fail=1
fi

# --- neither may CONSUME the turn: exiting must cost one gesture, not two ---
for f in "$host" "$dbx"; do
  branch=$(awk '/d1 === 14 && (isShiftHeld\(\)|GS\.shiftHeld)/,/} else/' "$f" | sed -e 's#/\*.*\*/##' -e '/^\s*\*/d')
  if echo "$branch" | rg -q '\breturn\b'; then
    echo "FAIL: $f swallows the turn -- leaving would cost a second gesture" >&2; fail=1
  fi
done

# --- and neither may gate it on `enterable`: one a module can decline is not one ---
if rg -qU 'isShiftHeld\(\)[^)]{0,40}canvasEnterable' "$host"; then
  echo "FAIL: the host escape is gated on enterable" >&2; fail=1
fi

[ "$fail" -eq 0 ] || exit 1
echo "PASS: Shift+jog leaves a canvas on both the host and dAVEBOx, without consuming the turn"
