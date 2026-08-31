#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The knob-grid chassis carries TWO row maps, and every surface that draws with
# it must select one FIRST.
#
# WHY THIS IS PINNED. The maps are exported `let` bindings that kitUseLayout()
# swaps, chosen so ~100 internal uses did not have to thread a layout object.
# ESM live bindings make that work with no call-site changes — and make the
# failure silent: a surface that forgets to call kitUseLayout() draws with
# WHICHEVER map the last surface left behind, which is correct on the first
# frame after that surface and wrong after any other. Nothing errors, and on a
# 128x64 panel a one-row shift is not obvious.
#
# So: every entry point must select, and the two must not drift apart.

fail() { echo "FAIL: $*" >&2; exit 1; }
movy=davebox/ui/ui_movy.mjs
render=davebox/ui/ui_render.mjs

for f in "$movy" "$render"; do [ -f "$f" ] || fail "$f missing"; done

# --- the maps exist and are distinct -----------------------------------------
command grep -q "const KIT_LAYOUTS = {" "$movy" || fail "KIT_LAYOUTS is gone"
for name in bank sound; do
  command grep -qE "^\s+$name:\s+\{" "$movy" || fail "the '$name' layout is gone"
done
bank=$(command grep -oE "^\s+bank:\s+\{[^}]*\}" "$movy")
sound=$(command grep -oE "^\s+sound:\s+\{[^}]*\}" "$movy")
[ -n "$bank" ] && [ -n "$sound" ] || fail "could not read both layouts"
[ "${bank#*\{}" != "${sound#*\{}" ] ||
  fail "the bank and sound layouts are IDENTICAL — the split buys nothing, and a
surface that forgets to select would never be caught by looking at the screen"

# --- the bindings are `let`, or the swap silently does nothing ---------------
for c in MV_HDR_H MV_BAR_Y MV_ROW0_Y MV_LBL0_Y MV_ROW1_Y MV_LBL1_Y; do
  command grep -qE "^export let .*\b$c\b" "$movy" ||
    fail "$c is not an exported \`let\` — kitUseLayout cannot swap it, and every
importer would keep the value it captured at load"
done

# --- BOTH entry points select, before drawing -------------------------------
#
# Anchored inside each function, not file-wide: a call anywhere else would
# satisfy a count while the entry itself drew with a stale map.
bankfn=$(awk '/^function drawKitPage\(/,/^}/' "$render")
[ -n "$bankfn" ] || fail "drawKitPage is gone — this test no longer measures the bank surface"
command grep -q "kitUseLayout('bank')" <<<"$bankfn" ||
  fail "drawKitPage (the track-view bank card) does not select the 'bank' layout"

# ⚠ The SHARED chassis (drawKitBankPage) must NOT choose — sound mode and the
# manual renderer both draw through it, for different surfaces. It forced
# 'sound' briefly and the manual started rendering BANK cards with sound's map.
command grep -q "kitUseLayout(" <<<"$(awk '/^export function drawKitBankPage\(/,/^}/' "$movy")" &&
  fail "drawKitBankPage selects a layout — it is SHARED (sound mode AND the manual
renderer draw bank cards through it), so choosing here forces one surface's map
onto the other. The caller selects."

sound=davebox/ui/ui_sound.mjs
[ -f "$sound" ] || fail "$sound missing"
command grep -q "kitUseLayout('sound')" "$sound" ||
  fail "sound mode does not select the 'sound' layout before drawing its param pages"

# The manual renderer reimplements the device's draw calls, so it has to select
# too — it is the surface that has silently diverged twice already.
rs=davebox/tools/render_screens.mjs
command grep -q "kitUseLayout('bank')" "$rs" ||
  fail "$rs does not select the 'bank' layout for the bank screens — the MANUAL
would document those cards with sound mode's row map"

# It must be the FIRST thing each does: a draw call above it uses the old map.
for pair in "drawKitPage:$render:bank"; do
  fn=${pair%%:*}; rest=${pair#*:}; file=${rest%%:*}; want=${rest##*:}
  body=$(awk "/^(export )?function $fn\\(/,/^}/" "$file")
  first_draw=$(command grep -nE "^\s+(kit)?[dD]raw[A-Za-z]*\(|^\s+drawKit" <<<"$body" | head -n 1 | cut -d: -f1)
  sel=$(command grep -n "kitUseLayout(" <<<"$body" | head -n 1 | cut -d: -f1)
  [ -n "$sel" ] || fail "$fn does not select a layout at all"
  if [ -n "$first_draw" ] && [ "$sel" -gt "$first_draw" ]; then
    fail "$fn draws (line $first_draw of the function) BEFORE selecting its
layout (line $sel) — those first pixels use whichever map the previous surface left"
  fi
done

echo "PASS: both kit surfaces select their own row map before drawing"
