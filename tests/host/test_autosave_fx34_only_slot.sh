#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A slot holding ONLY fx3/fx4 (this fork's extra insert blocks) must not be
# autosaved as empty: autosaveAllSlots' emptiness test checked synth/fx1/fx2/
# midiFx only, so such a slot was written `{}` and came back blank after a
# relaunch. The emptiness test must name every component the patch builder
# persists — derived here from buildSlotPatchJson's own component list.

f="src/shadow/shadow_ui.js"
fail=0
note() { echo "FAIL: $1" >&2; fail=1; }

body=$(awk '/^function autosaveAllSlots\(onlySlot, forSnapshot\) \{/,/^}/' "$f")
[ -n "$body" ] || { echo "FAIL: autosaveAllSlots not found" >&2; exit 1; }
cond=$(command grep -E "^[[:space:]]*if \(!hasSynth " <<<"$body" | head -1)
[ -n "$cond" ] || note "the empty-slot condition is gone (test is stale)"

for comp in Synth Fx1 Fx2 Fx3 Fx4 MidiFx; do
    command grep -q "!has${comp}\b" <<<"$cond" || note "the empty-slot test ignores ${comp} — a slot holding only that is written as {}"
done

# Every insert block the builder persists must be one the emptiness test knows.
builder=$(awk '/^function buildSlotPatchJson\(/,/^}/' "$f")
for n in 1 2 3 4; do
    if command grep -q "cfg.fx${n} && cfg.fx${n}.module" <<<"$builder"; then
        command grep -q "!hasFx${n}\b" <<<"$cond" || note "buildSlotPatchJson persists fx${n} but the empty-slot test does not check it"
    fi
done

[ "$fail" -eq 0 ] || exit 1
echo "PASS: a slot with only fx3/fx4 is not autosaved as empty"
