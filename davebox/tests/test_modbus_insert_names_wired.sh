#!/usr/bin/env bash
# The insert-name read must be REACHED, and reached only from the open screen.
#
# ⚠ THIS IS A WIRING PIN, NOT A BEHAVIOUR PROOF. The model itself is tested for
# real in tests/js/test_modbus_insert_names.mjs (values, scoping, the latch,
# invalidation, mutation-checked). What that test CANNOT see is whether
# anything calls it, or whether the render draws the result — VIEW_MODBUS_CHAIN
# is several gestures deep, and this repo measures drawn text as pixel bands
# rather than strings. A grep cannot prove behaviour
# ([[not-naming-the-key-is-not-not-honouring-it]]); it can prove the call site
# has not been deleted or moved out from under the screen, which is the failure
# that shipped `default_fx` inert for months.
# → [[test-the-path-not-the-function]]
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

SND=ui/ui_sound.mjs

# 1. the render prefers the instance's own name, and still falls back
if grep -q "modBusInsertName(S.modBus, S.modBusGroup, c.index)" "$SND" \
   && grep -A2 "modBusInsertName(S.modBus, S.modBusGroup, c.index)" "$SND" \
      | grep -q "engineModuleAbbrev(c.module)"; then
    ok "the insert row draws display_name, falling back to the abbreviation"
else
    bad "renderModBusChain does not prefer modBusInsertName over the abbreviation"
fi

# 2. the tick refreshes it, scoped to the open bus
if grep -q "modBusRefreshInsertNames(S.modBus, S.slot, S.modBusGroup)" "$SND"; then
    ok "the tick refreshes the OPEN bus's names (S.modBusGroup, not a sweep)"
else
    bad "nothing calls modBusRefreshInsertNames — the feature would be inert"
fi

# 3. ...only while that screen is up, and behind the freshness latch
if grep -B3 "modBusRefreshInsertNames(S.modBus, S.slot, S.modBusGroup)" "$SND" \
   | grep -q "S.view === VIEW_MODBUS_CHAIN" \
   && grep -B2 "modBusRefreshInsertNames(S.modBus, S.slot, S.modBusGroup)" "$SND" \
      | grep -q "modBusNamesFresh"; then
    ok "gated on the chain view AND the latch — no per-tick re-read"
else
    bad "the refresh is not gated on both the view and the freshness latch"
fi

# 4. leaving the screen drops the latch, so re-entry after a swap re-reads
if grep -A6 "modBusRefreshInsertNames(S.modBus, S.slot, S.modBusGroup)" "$SND" \
   | grep -q "modBusInvalidateNames"; then
    ok "leaving the screen invalidates — a swapped insert cannot keep its label"
else
    bad "nothing invalidates on leaving; the label would survive an insert swap"
fi

# 5. the cost ceiling: no bus sweep anywhere
if grep -n "modBusRefreshInsertNames" "$SND" | grep -qE "for \(|\.map\(|while \("; then
    bad "a refresh call sits inside a loop — that is the 64-round-trip sweep"
else
    ok "no refresh call inside a loop (the sweep #466 exists to avoid)"
fi

[ "$fail" = 0 ] && echo "PASS: the insert-name read is wired to the open screen" \
                || echo "FAIL: insert-name wiring"
exit "$fail"
