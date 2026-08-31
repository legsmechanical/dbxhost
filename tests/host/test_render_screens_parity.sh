#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# davebox/tools/render_screens.mjs REIMPLEMENTS THE DEVICE'S DRAW CALLS BY HAND,
# and every option it passes is a CLAIM about what the device passes.
#
# ⚠⚠ THAT FILE HAS NOW DIVERGED FOUR TIMES, three of them on one day:
#   1. SHFT/TRK — removed from the device, still promised by the manual.
#   2. The bank indicator — the renderer passed pageIdx/pageCount on its own
#      initiative, so the manual drew a bar the track view never draws. THREE
#      redesigns of that bar were judged against renders that were lying, and
#      Josh had to say "still not seeing anything on the device" twice.
#   3. The layout split — the shared chassis started choosing a map, and the
#      manual rendered bank cards with sound mode's.
#   4. (2026-08-31) Divergence 2 again, in the NEXT LOOP OF THE SAME FILE: the
#      fix went on BANK_SCREENS, while CUSTOM_KIT kept passing pageCount to
#      three more bank cards. The first fix was applied to the screens being
#      looked at, not to the class.
#
# 📌 A RENDER IS EVIDENCE ABOUT THE RENDERER, not about the device, until you
# have checked the device calls the same thing. This is that check, and it is
# written to DERIVE the device's behaviour rather than restate it: nothing here
# hard-codes "bank cards have no page bar", it reads ui_render.mjs and asks.
#
# Companion to davebox/tests/js/test_cellkind_parity.mjs, which pins the widget
# CLASSIFIER the same file also copies.

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok   — $*"; }

render=davebox/ui/ui_render.mjs
sound=davebox/ui/ui_sound.mjs
movy=davebox/ui/ui_movy.mjs
rs=davebox/tools/render_screens.mjs
for f in "$render" "$sound" "$movy" "$rs"; do [ -f "$f" ] || fail "$f missing"; done

# Brace-matched function bodies: these contain nested blocks, so a lazy match to
# the next line-initial `}` would compare a fraction of the function and pass.
body() { # body <file> <function-name>
  awk -v name="$2" '
    index($0, "function " name "(") { on = 1 }
    on {
      print
      n = gsub(/{/, "{"); m = gsub(/}/, "}")
      depth += n - m
      if (seen && depth <= 0) exit
      if (n > 0) seen = 1
    }' "$1"
}

# --- 1. THE PAGE BAR: does the device's BANK surface draw one? ---------------
#
# Derived, not asserted. drawKitPage in ui_render.mjs IS the track-view bank
# card on the device. If it does not reach drawKitPageBar, then no bank-layout
# render may ask for one — and the way you ask is pageIdx / pageCount /
# pageGroups, which drawKitBankPage reads and nothing else does.
bankfn=$(body "$render" drawKitPage)
[ -n "$bankfn" ] || fail "drawKitPage is gone — this test no longer measures the bank surface"

if grep -q "drawKitPageBar" <<<"$bankfn"; then
  ok "the device's bank card DOES draw a page bar — the renderer may pass one"
else
  ok "derived: the device's bank card (drawKitPage) draws NO page bar"
  # Every drawKitBankPage call in the renderer that is under the 'bank' layout
  # must therefore pass no page-bar opt. The renderer draws bank cards ONLY —
  # it has no sound-mode screen — so any occurrence at all is a divergence.
  if grep -qE "kitUseLayout\('sound'\)" "$rs"; then
    fail "$rs now renders a SOUND surface too; this check assumed it renders only
bank cards and must be narrowed to the bank call sites before it means anything"
  fi
  for opt in pageIdx pageCount pageGroups; do
    if grep -nE "^[^*/]*\b$opt\s*:" "$rs" >/dev/null; then
      grep -nE "^[^*/]*\b$opt\s*:" "$rs" >&2
      fail "$rs passes \`$opt\` to the shared chassis, but the device's bank card
draws no page bar at all — the MANUAL would show a position strip the instrument
does not draw. This is divergence #2/#4; see the header of this file."
    fi
  done
  ok "the renderer passes no pageIdx/pageCount/pageGroups to a bank card"
fi

# --- 2. THE HEADER: the renderer must not be able to choose one --------------
#
# The header style is a property of the LAYOUT (KIT_LAYOUTS in ui_movy.mjs), not
# an argument, precisely so this file cannot pair a header with the wrong row
# map. If it ever becomes an opt again, this pin has to grow a comparison.
grep -q "hdr: 'filled'" "$movy" || fail "$movy: the 'bank' layout no longer declares hdr: 'filled'"
grep -q "hdr: 'split'"  "$movy" || fail "$movy: the 'sound' layout no longer declares hdr: 'split'"
grep -q "kitHeaderStyle()" "$movy" ||
  fail "$movy: drawKitBankPage no longer picks its header from the layout — if the
header became a per-call option, the renderer can now pass one that disagrees
with the device, which is the whole class this file exists for"
grep -qE "headerStyle\s*:|hdrStyle\s*:" "$rs" &&
  fail "$rs chooses a header style. It must not: the style follows kitUseLayout()."
ok "the header style follows the layout — the renderer cannot pick a different one"

# --- 3. THE FOOTER: hints the device never offers ----------------------------
#
# Divergence #1. The renderer writes its hint pairs as literals, so a pair the
# device stopped offering lives on in the manual. Compare the ACTION words: every
# action the renderer prints must appear in a hint builder on the device side.
acts_rs=$(grep -oE "\['[A-Z]+', *'[A-Z]+'\]" "$rs" | grep -oE "'[A-Z]+'\]" | tr -d "']" | sort -u)
acts_dev=$(cat "$render" "$sound" | grep -oE "\['[A-Z]+', *'[A-Z]+'\]" | grep -oE "'[A-Z]+'\]" | tr -d "']" | sort -u)
[ -n "$acts_rs" ] || fail "$rs: read no footer actions at all — the shape changed and this check is now blind"
missing=""
for a in $acts_rs; do grep -qx "$a" <<<"$acts_dev" || missing="$missing $a"; done
[ -z "$missing" ] || fail "$rs prints footer action(s) the device never offers:$missing
That is divergence #1 (SHFT/TRK): the manual promising a gesture the instrument
does not have. If the word is genuinely built elsewhere, widen the device side of
this comparison rather than deleting the check."
ok "every footer action the manual prints exists in a device hint builder"

echo "PASS: the manual renderer's claims about the device hold"
