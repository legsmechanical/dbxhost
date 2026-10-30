#!/bin/sh
# tests/test_au_mode_helpers.sh — an audio clip's Mode is tested only through
# auIsSlice / auIsLoop (ui/ui_pure.mjs).
#
# The raw values read as a yes/no: `mode === 1`, `mode !== AU_MODE_SLICE`,
# `i.mode ? 'Slice' : 'Loop'`. A third Mode would then be Slice to one test and
# Loop to the other, with nothing to say so. The helpers are the one place
# that decides; this pins that nothing else does.
set -u
cd "$(dirname "$0")/.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

# the Mode values by name: only where they are declared and re-exported
hits=$(grep -n -E '\bAU_MODE_(SLICE|LOOP)\b' ui/*.mjs ui/ui.js \
    | grep -v -E '^ui/ui_pure\.mjs:' \
    | grep -v -E "^ui/ui_audio\.mjs:[0-9]+:(export \{|import \{ bankListForMode)")
[ -z "$hits" ] && ok "AU_MODE_SLICE / AU_MODE_LOOP appear only in ui_pure and ui_audio's re-export" \
    || bad "a raw Mode test outside the helpers:
$hits"

# a numeric Mode test, or a Mode used as a truth value
hits=$(grep -n -E '\.mode[[:space:]]*[!=]==?[[:space:]]*[0-9]\b|\b[a-z0-9_]+\.mode[[:space:]]*\?' ui/*.mjs ui/ui.js \
    | grep -v -E '^ui/ui_pure\.mjs:.*function auIs')
[ -z "$hits" ] && ok "no numeric or truthy Mode test anywhere in ui/" \
    || bad "a numeric or truthy Mode test:
$hits"

# the helpers say what they say
grep -q "export function auIsSlice(i) { return !!(i && i.mode === AU_MODE_SLICE); }" ui/ui_pure.mjs \
    && grep -q "export function auIsLoop(i) { return !!i && !auIsSlice(i); }" ui/ui_pure.mjs \
    && ok "auIsSlice = Slice; auIsLoop = any other clip" || bad "the helpers changed"

[ "$fail" = 0 ] && echo "PASS: test_au_mode_helpers" || { echo "FAIL: test_au_mode_helpers"; exit 1; }
