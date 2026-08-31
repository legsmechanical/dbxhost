#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."

# Every screen soundRender dispatches to must CLEAR the framebuffer, directly or
# through a helper that does.
#
# ⚠⚠ THE BUG THIS EXISTS FOR. A new full-screen path in renderInChain returned
# early without clearing. Every other render function owns its own clear, and the
# path it replaced got one for free from the backdrop it drew — so the module
# editor's pixels stayed underneath and the swap list printed straight over them.
# Reported from the device: "swap module menu is printing directly overtop of the
# editor page". Nothing errors; the screen is simply wrong, and only on the one
# view that took the new branch.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }
f=ui/ui_sound.mjs
[ -f "$f" ] || { echo "FAIL: $f missing"; exit 1; }

body() { awk "/^function $1\\(/,/^}/" "$f"; }

# Helpers that clear on behalf of their caller — each verified here, not assumed,
# so one of them quietly losing its clear fails too.
clearers="clear_screen"
for h in renderBlocks renderLfo renderInChain drawTextEntry; do
    if grep -qE "clear_screen\(\)" <<<"$(body "$h")"; then
        clearers="$clearers|$h"
    fi
done
ok "clearing helpers: $(tr '|' ' ' <<<"$clearers")"

# The dispatch targets, read out of soundRender itself.
targets=$(awk '/^export function soundRender/,/^}/' "$f" \
          | grep -oE "render[A-Za-z]+\(\)" | tr -d '()' | sort -u)
[ -n "$targets" ] || bad "read no dispatch targets out of soundRender"

missing=""
for t in $targets; do
    b=$(body "$t")
    [ -n "$b" ] || continue          # defined elsewhere; not this pin's business
    grep -qE "($clearers)\(" <<<"$b" || missing="$missing $t"
done
[ -z "$missing" ] && ok "every screen soundRender dispatches to clears the framebuffer" \
  || bad "dispatched but never clears:$missing
Whatever was on screen before stays underneath and the new screen prints over it.
Nothing errors — it just looks wrong, and only on that view."

# renderInChain has TWO paths now (floating over a backdrop, and full screen for
# a screen the module editor opened). Both must clear; the early one is the one
# that did not.
inchain=$(body renderInChain)
n=$(grep -cE "clear_screen\(\)|renderBlocks\(\)|renderLfo\(\)" <<<"$inchain")
[ "$n" -ge 2 ] && ok "both renderInChain paths clear ($n clear points)" \
  || bad "renderInChain has $n clear point(s) — one of its paths draws onto whatever was there"

[ "$fail" = 0 ] && echo "PASS: no screen prints over the last one" || echo "FAIL"
exit $fail
