#!/bin/sh
# tests/test_brand_screens.sh — the two screens that are the app's FACE.
#
# A session opens on a text splash and closes on a farewell. Josh specified both
# the same way (2026-08-24): the wordmark in the large header font, a blank
# line, then the small movy line under it. They are one design, so they are
# pinned together — drifting apart is the failure, and it is invisible in code
# review because each screen looks fine on its own.
#
# ⚠ The specific regression guarded here: host `print` is ONE fixed 6px face.
# Drawing either screen with it costs the wordmark its real lowercase d/x
# glyphs and makes the pair read as a system message rather than as ours. That
# is what the farewell used to do.
set -u
cd "$(dirname "$0")/.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

R=ui/ui_render.mjs

# --- the farewell -----------------------------------------------------------
far=$(sed -n '/if (S.exitFarewell !== 0)/,/^    }/p' "$R")
printf '%s' "$far" | grep -q "hdrPrint" \
    && ok "the farewell draws the wordmark in the header font" \
    || bad "the farewell no longer uses hdrPrint — the wordmark loses its d/x glyphs"
printf '%s' "$far" | grep -q "mvPrint" \
    && ok "...and its second line in the small movy font" \
    || bad "the farewell no longer uses mvPrint for the verb line"
printf '%s' "$far" | grep -qE '(^|[^a-zA-Z_])print\(' \
    && bad "the farewell still calls host print — one fixed face, not ours" \
    || ok "...and does not fall back to host print"
printf '%s' "$far" | grep -q "'dAVEBOx'" \
    && ok "the wordmark is spelled dAVEBOx, verbatim" \
    || bad "the farewell wordmark is missing or misspelled (hdrPrint does NOT uppercase)"
printf '%s' "$far" | grep -q "Exiting" \
    && ok "it says what is happening" || bad "the farewell lost its verb"

# --- the boot text screen ---------------------------------------------------
# Rendered at build time rather than drawn, but from the SAME two fonts — this
# is what keeps the pair one design.
G=../standalone/scripts/make-splashes.mjs
grep -q "hdrPrint" "$G" && grep -q "mvPrint" "$G" \
    && ok "the boot text screen uses the same two fonts" \
    || bad "the boot screen no longer renders with hdrPrint + mvPrint"
grep -q "'dAVEBOx'" "$G" \
    && ok "...and the same wordmark" || bad "the boot screen wordmark drifted"

# --- one design: same baselines --------------------------------------------
# ⭑ The pin that actually catches drift. Both screens put the wordmark and the
# small line on the same two baselines; if someone nudges one, they must nudge
# both or the session visibly changes face between opening and closing.
fy=$(printf '%s' "$far" | grep -o 'hdrPrint([^;]*' | grep -oE ', [0-9]+, ' | head -1 | tr -d ' ,')
gy=$(grep -o 'hdrPrint([^;]*' "$G" | grep -oE ', [0-9]+, ' | head -1 | tr -d ' ,')
[ -n "$fy" ] && [ "$fy" = "$gy" ] \
    && ok "both screens share the wordmark baseline (y=$fy)" \
    || bad "wordmark baselines differ: farewell y=$fy, boot y=$gy"

# --- the level card: ONE card, drawn as a true OVERLAY --------------------
# Josh, 2026-08-24: Shift+Volume shows "the same card we use for track volume
# adjustment in sound mode", everywhere.
grep -q 'export function drawLevelCard' ui/ui_movy.mjs \
    && ok "the level card has ONE drawer, in the shared kit" \
    || bad "drawLevelCard is gone — the two level read-outs can drift apart"
grep -q 'drawLevelCard(' ui/ui_sound.mjs \
    && ok "...sound mode draws through it" \
    || bad "sound mode has its own copy of the card again"
grep -q 'drawLevelCard(' ui/ui_render.mjs \
    && ok "...and so does the global overlay" \
    || bad "the overlay no longer draws the shared card"
# ⚠⚠ The structural part. drawUIBody returns early from a dozen places — every
# bank branch, sound mode, popups, the loading screen — so a card drawn at its
# END would simply never appear on most screens, which is the entire request.
# It has to sit OUTSIDE that function.
grep -q 'drawUIBody();' ui/ui_render.mjs \
    && ok "drawUI wraps the body, so the card survives its early returns" \
    || bad "the overlay is back inside drawUIBody — early returns would skip it"
awk '/^export function drawUI\(\) \{/,/^\}/' ui/ui_render.mjs | grep -q 'drawTrackVolCard();' \
    && ok "...and the card is drawn LAST, over whatever is on screen" \
    || bad "drawUI no longer draws the card after the body"

[ "$fail" = "0" ] && printf 'PASS: the opening and closing screens are one design\n'
exit $fail
