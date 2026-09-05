#!/bin/bash
# test_launch_led_first_and_art_hold.sh — the session-boot splash blanks the
# LEDs FIRST and holds the artwork on the WALL CLOCK.
#
# ⚠ THE REGRESSION THIS PINS (Josh, 2026-09-05, device pass): "LEDs used to go
# unlit immediately when davebox was launched from stock; they linger for a
# while now. The dave splash also lingered longer and now it's short." Both are
# the pre-kill launch branch (stock v1.2.0 kills the stack before we run, so
# quiesce-stock.sh never blanks the pads nor paints the artwork for the whole
# teardown); what remained was the overtake init's LED pass, seconds later, and
# a tick-counted art stage of SPLASH_TOTAL_TICKS/3. shadow_ui.js is a 17k-line
# monolith bound to the device, so these are SOURCE pins: order, gating, units.
set -e
cd "$(dirname "$0")/../.."
JS=src/shadow/shadow_ui.js
fail=0
say() { echo "  $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

# The splash phase, from `if (splashActive) {` to the first `return;` after it.
block=$(awk '/^    if \(splashActive\) \{/{f=1} f{print} f&&/^            return;/{exit}' "$JS")
[ -n "$block" ] || { bad "splash phase block not found"; echo "FAIL"; exit 1; }

# 1. LEDs first: clearLedBatch is called in the splash phase, gated on customSplash
#    (= boot_tool.json, a SESSION boot), and BEFORE the artwork is drawn.
led_line=$(echo "$block" | grep -n 'clearLedBatch()' | head -1 | cut -d: -f1)
art_line=$(echo "$block" | grep -n 'drawCustomSplash(customSplashArt' | head -1 | cut -d: -f1)
[ -n "$led_line" ] && say "ok   — the splash phase clears LEDs itself" || bad "no clearLedBatch in the splash phase"
[ -n "$led_line" ] && [ -n "$art_line" ] && [ "$led_line" -lt "$art_line" ] \
    && say "ok   — ...BEFORE the artwork is drawn" || bad "LED clear is not before the artwork"
echo "$block" | grep -q 'if (customSplash && !bootLedsCleared)' \
    && say "ok   — ...gated on customSplash (a session boot; a stock boot never blanks Move's LEDs)" \
    || bad "LED clear is not gated on customSplash"
# A plain stock boot: the gate must be the SESSION marker, so ensureCustomSplash must run first.
ecs=$(echo "$block" | grep -n 'ensureCustomSplash()' | head -1 | cut -d: -f1)
[ -n "$ecs" ] && [ "$ecs" -lt "$led_line" ] && say "ok   — ensureCustomSplash decides the gate before the clear" || bad "gate decided after the clear"

# 2. Art hold in MILLISECONDS on the one clock, and the splash cannot end before it.
grep -q '^const SPLASH_ART_MS = [0-9]\+;' "$JS" && say "ok   — SPLASH_ART_MS is a millisecond constant" || bad "SPLASH_ART_MS missing"
! grep -q 'SPLASH_ART_TICKS' "$JS" && say "ok   — the tick-counted SPLASH_ART_TICKS is gone" || bad "SPLASH_ART_TICKS still referenced"
echo "$block" | grep -q 'customSplashArt && Date.now() < splashArtUntilMs' \
    && say "ok   — the artwork is shown until the wall-clock deadline" || bad "art stage not on the deadline"
echo "$block" | grep -q '(!customSplashArt || Date.now() >= splashArtUntilMs)' \
    && say "ok   — the splash cannot END before the art deadline" || bad "splash end ignores the art deadline"
ms=$(grep -o '^const SPLASH_ART_MS = [0-9]\+' "$JS" | grep -o '[0-9]\+$')
[ "$ms" -ge 1500 ] && [ "$ms" -le 6000 ] && say "ok   — the hold is a sane length ($ms ms)" || bad "SPLASH_ART_MS=$ms outside 1.5-6 s"

# 3. Mutation control: the pins above must be able to FAIL (a block with no clear).
echo "if (splashActive) {" | grep -q 'clearLedBatch()' && bad "control: a bare block matched the LED pin" || say "ok   — control: a block without the clear does not pass"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
