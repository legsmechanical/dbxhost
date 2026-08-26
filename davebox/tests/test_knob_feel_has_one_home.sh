#!/usr/bin/env bash
# Knob FEEL must be decided in one place, and this is the test that keeps it there.
#
# The history it exists for (2026-08-26): dAVEBOx's knob handling is a long
# if-chain of (padMode, bank, knobIdx) special cases, and 20 of those branches
# had hand-rolled their own accumulator —
#
#     S.knobAccum[knobIdx]++;                        # one per FRAME
#     if (S.knobAccum[knobIdx] >= NEED) { ... }
#
# — which counts frames and therefore throws away how fast the knob is turning,
# because a tool receives one BATCHED message per knob per frame. Fixing the
# shared helpers did nothing for those 20, so drum and conductor banks silently
# kept the old feel and Josh reported the same bug twice from different screens.
#
# ⭑ Josh's read was right and is the reason this is a STRUCTURAL test rather
# than another behavioural one: "there's nothing special about the patterns in
# those banks that should require special treatment." Nothing did. Every branch
# was simply free to reinvent the feel, and an if-chain cannot be enumerated by a
# test. So instead of testing each branch, forbid the reinvention.

set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
UI="$HERE/ui"
fails=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fails=1; }

echo "knob feel has ONE home:"

# The accumulator may be advanced in exactly one place: knobPick(), the shared
# helper. Anywhere else is a branch inventing its own rate.
# Any ADVANCE of the accumulator — ++ or += . Resets to 0 are not advances and
# are legitimate anywhere (a branch clearing state on a direction change).
# ⚠ The first cut searched only for '++' and found nothing, because knobPick
# advances with '+=' — every check below then reported clean against a blind
# search. That is why the control at the bottom exists.
ADV='S\.knobAccum\[[^]]*\][[:space:]]*\(++\|+=\)'

# --- 1. Inside the bank-knob if-chain, knobPick is the only home -------------
chain="$(grep -n "$ADV" "$UI/ui_input_cc.mjs" | grep -v '^[0-9]*: *\*' || true)"
chain_n="$(printf '%s' "$chain" | grep -c . || true)"
chain_legit="$(printf '%s\n' "$chain" | grep -c 'S\.knobAccum\[k\]' || true)"

if [ "$chain_n" -eq 0 ]; then
    bad "no accumulator advance in ui_input_cc.mjs at all — knobPick has been renamed or removed, and this test is blind"
elif [ "$chain_n" -eq "$chain_legit" ]; then
    ok "ui_input_cc: the accumulator is advanced only inside knobPick ($chain_legit site)"
else
    bad "$((chain_n - chain_legit)) branch(es) in ui_input_cc hand-roll their own accumulator instead of calling knobPick/knobStep:"
    printf '%s\n' "$chain" | grep -v 'S\.knobAccum\[k\]' | sed 's|^|         |'
fi

# --- 2. No NEW files may grow a knob accumulator -----------------------------
# ui_sound.mjs is a KNOWN second home and is deliberately allowed: sound mode
# runs a per-cell sensitivity class rather than the bank curve, and — the part
# that matters — it already reads the batch MAGNITUDE (`+= delta`), so it never
# had the bug this test exists for. It is tracked as its own decision, not
# hidden here.
# ⚠ Found BY this test while writing it. The point of the file list is that the
# next one gets found the same way instead of by Josh, on hardware, twice.
known_homes="ui_input_cc.mjs ui_sound.mjs"
for f in "$UI"/*.mjs; do
    base="$(basename "$f")"
    grep -q "$ADV" "$f" 2>/dev/null || continue
    case " $known_homes " in
        *" $base "*) ;;
        *) bad "$base has grown its own knob accumulator — add it to knobPick, or to known_homes with the reason" ;;
    esac
done
ok "no unknown file implements its own knob accumulation"

# Both shared entry points must still exist and must read the MAGNITUDE, not a
# sign. A branch routed through a helper that only reads the sign is no better
# off than the hand-rolled version it replaced.
for fn in knobPick knobStep ccKnobDelta; do
    if grep -q "^function $fn(" "$UI/ui_input_cc.mjs"; then ok "$fn() exists"
    else bad "$fn() is gone — every call site's feel just changed silently"; fi
done

if grep -A6 '^function knobStep(' "$UI/ui_input_cc.mjs" | grep -q 'decodeDelta'; then
    ok "knobStep reads the batch magnitude (decodeDelta)"
else
    bad "knobStep no longer calls decodeDelta — it is back to counting frames"
fi

# Control: the offender search must be capable of matching. A grep that silently
# matches nothing would report every check above as clean.
if grep -rq 'S\.knobAccum\[' "$UI"/*.mjs; then
    ok "⚠ control: the search really does find knobAccum references"
else
    bad "⚠ control: found no knobAccum at all — the checks above were vacuous"
fi

if [ "$fails" -ne 0 ]; then echo "test_knob_feel_has_one_home: FAIL"; exit 1; fi
echo "test_knob_feel_has_one_home: PASS"
