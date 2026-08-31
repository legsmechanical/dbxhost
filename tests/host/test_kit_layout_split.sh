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

# ⚠⚠ COMMENTS MUST BE STRIPPED BEFORE ANY "does this code call X" GREP.
# Caught three times by mutation on 2026-08-31: commenting a call out leaves its
# text in the file, so `grep -q "kitUseLayout('bank')"` matches
# `/* kitUseLayout('bank'); */` and the check passes against a surface that no
# longer selects anything. A commented-out call is the EXACT shape of the
# regression these pins exist for, so a pin that cannot see it is decoration.
# Drops whole-line and trailing // comments and everything inside /* ... */,
# including multi-line blocks.
nocomments() {
  awk '
    { line = "" ; i = 1
      while (i <= length($0)) {
        c = substr($0, i, 2)
        if (inblk) { if (c == "*/") { inblk = 0; i += 2 } else i++ ; continue }
        if (c == "/*") { inblk = 1; i += 2; continue }
        if (c == "//") break
        line = line substr($0, i, 1); i++
      }
      print line }'
}

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

# --- the header style travels WITH the row map, or the pair can be split -----
#
# ⚠⚠ 2026-08-31: the two maps stopped differing only in rows. `filled` spends a
# dark row so a white bar segment is not swallowed by a white band; `split` does
# not, and that one row IS the difference between the two grids. If the style
# ever became a per-call argument again, a caller could pair a split header with
# the filled map — a bar drawn in a row the header already owns, reading as
# nothing, which is precisely the bug that cost three redesigns on 2026-08-30.
grep -q "hdr: 'filled'" "$movy" || fail "the 'bank' layout no longer declares hdr: 'filled'"
grep -q "hdr: 'split'"  "$movy" || fail "the 'sound' layout no longer declares hdr: 'split'"
grep -q "export function kitHeaderStyle()" "$movy" ||
  fail "kitHeaderStyle() is gone — the header no longer follows the layout"
grep -q "kitHeaderStyle()" <<<"$(awk '/^export function drawKitBankPage\(/,/^}/' "$movy")" ||
  fail "drawKitBankPage no longer picks its header from the layout. It must: the
header and the row map are ONE decision (see KIT_LAYOUTS), and a per-call header
lets a caller pair one with the other's grid"
grep -qE "headerStyle\s*[:=]|hdrStyle\s*[:=]" "$movy" &&
  fail "a per-call header-style option has appeared. The style belongs to the
LAYOUT — see the comment above KIT_LAYOUTS for why."

# --- the bindings are `let`, or the swap silently does nothing ---------------
# MV_KW joined them on 2026-08-31 (Josh: sound mode takes param-pages' 17, the
# bank cards keep davebox's 20), and it is the one most easily lost: it sat in a
# `const` line with MV_CELL_W/MV_KH/MV_LBL_H, which are still shared.
for c in MV_HDR_H MV_BAR_Y MV_ROW0_Y MV_LBL0_Y MV_ROW1_Y MV_LBL1_Y MV_KW; do
  command grep -qE "^export let .*\b$c\b" "$movy" ||
    fail "$c is not an exported \`let\` — kitUseLayout cannot swap it, and every
importer would keep the value it captured at load"
done

# Declared is not assigned: a key can sit in KIT_LAYOUTS while kitUseLayout
# never reads it, and the binding then keeps whatever it was initialised to on
# BOTH surfaces — a silent no-op that looks exactly like "the two maps agree".
# ⚠ COMMENTS STRIPPED FIRST. Caught by mutation 2026-08-31: commenting the
# assignment out left `/* MV_KW = L.kw; */` in the body and the grep still
# matched, so the check passed against a binding that was no longer swapped.
usefn=$(awk '/^export function kitUseLayout\(/,/^}/' "$movy" | nocomments)
for c in MV_HDR_H MV_BAR_Y MV_ROW0_Y MV_LBL0_Y MV_ROW1_Y MV_LBL1_Y MV_KW; do
  command grep -qE "\b$c\s*=" <<<"$usefn" ||
    fail "kitUseLayout() never assigns $c — it is exported \`let\` and declared in
the maps, so this reads as split while both surfaces keep one value"
done

# --- BOTH entry points select, before drawing -------------------------------
#
# Anchored inside each function, not file-wide: a call anywhere else would
# satisfy a count while the entry itself drew with a stale map.
bankfn=$(awk '/^function drawKitPage\(/,/^}/' "$render" | nocomments)
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
command grep -q "kitUseLayout('sound')" <<<"$(nocomments < "$sound")" ||
  fail "sound mode does not select the 'sound' layout before drawing its param pages"

# ⚠⚠ AND THE OTHER SURFACE IN THAT FILE. renderBlocks() is the SOUND + CONFIG
# root — a BANK-cycle screen wearing the filled header — and it CLEARS the
# page-bar row. Since 2026-08-31 the two maps put that row in different places
# (7 vs 8), so without selecting it wipes whichever row the param editor left
# behind. Caught by mutation: file-wide greps for kitUseLayout are satisfied by
# renderEdit's call and say nothing about this one.
blockfn=$(awk '/^function renderBlocks\(/,/^}/' "$sound" | nocomments)
[ -n "$blockfn" ] || fail "renderBlocks is gone — this test no longer measures that surface"
command grep -q "kitUseLayout('bank')" <<<"$blockfn" ||
  fail "renderBlocks (SOUND + CONFIG root) does not select the 'bank' layout, but
it reads MV_BAR_Y to clear the page-bar row — and the two maps disagree on which
row that is"

# The manual renderer reimplements the device's draw calls, so it has to select
# too — it is the surface that has silently diverged twice already.
rs=davebox/tools/render_screens.mjs
# ⚠⚠ ANCHORED IN emit(), WHICH IS THE ONE OWNER. This file renders its screens
# from several loops, and the selection used to sit inside each of them — so the
# property had two owners and deleting either left the other satisfying a
# file-wide grep. Found by mutation 2026-08-31; the fix was to collapse the
# decision into emit() rather than to write a cleverer test.
emitfn=$(awk '/^const emit = \(/,/^};/' "$rs" | nocomments)
[ -n "$emitfn" ] || fail "$rs: emit() is gone — this test no longer measures the renderer"
command grep -q "kitUseLayout(" <<<"$emitfn" ||
  fail "$rs: emit() does not select a layout. Every screen it renders draws with
whichever map the PREVIOUS screen left — the MANUAL would document bank cards
with sound mode's row map, which it has already done once (2026-08-30)."
# ...and NOWHERE ELSE. One owner cannot be half-removed; two can, which is how
# the 2026-08-31 mutation survived: the selection sat in each render loop, so
# deleting one left the other satisfying a file-wide grep.
uses=$(nocomments < "$rs" | command grep -c "kitUseLayout(" || true)
[ "$uses" = "1" ] ||
  fail "$rs selects a layout in $uses place(s). It must be exactly ONE — inside
emit() — with the layout passed as its argument."

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
