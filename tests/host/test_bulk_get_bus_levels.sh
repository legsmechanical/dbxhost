#!/usr/bin/env bash
# The `chain:` BULK GET must resolve the SAME keys a single GET resolves.
#
# It did not, and the gap was invisible. Bus-level Move FX params
# (move_fx:N:volume/pan/send_a/send_b) resolve in the single-request handler
# (shadow_inprocess_handle_param_request) and, until 2026-09-06, NOWHERE else —
# so every one of them failed on shadow_direct_get_param, which is the path the
# bulk handler uses.
#
# The failure did not look like a failure. shim_handle_param_bulk_chain_get
# leaves vlen at 0 for a key that does not resolve, so an unresolved key comes
# back as an EMPTY VALUE with the item COUNT still correct; davebox's
# engineGetMany accepts any answer whose count matches, so its per-key fallback
# never ran and parseFloat("") silently dropped the level.
#
# Symptom (Josh, on device): a Move-routed track's snapshot recorded only
# {"route":1,"bus":N} while a Schwung track recorded all four levels — so
# recalling a Move track restored no volume, pan or sends at all, in EVERY
# snapshot, session and track alike. It arrived when the mixer capture switched
# to one bulk read per track ("was four round trips"): the optimisation silently
# changed which keys could be read.
set -euo pipefail
cd "$(dirname "$0")/../.."

C=src/host/shadow_chain_mgmt.c
E=davebox/ui/ui_engine.mjs
fail=0; say(){ echo "  $1"; }; bad(){ echo "  FAIL — $1" >&2; fail=1; }

# ---- the host half: the bulk path resolves bus-level keys -------------------
get=$(awk '/^int shadow_direct_get_param\(/{f=1} f{print} f&&/^}/{exit}' "$C")
[ -n "$get" ] || bad "shadow_direct_get_param not found — the pin cannot see its subject"

echo "$get" | grep -q 'strncmp(key, "move_fx:", 8) == 0' \
    && say "ok   — shadow_direct_get_param resolves move_fx: keys (the BULK path's resolver)" \
    || bad "the bulk path cannot resolve a Move-bus key — levels come back empty and are dropped"

for k in volume pan send_a send_b; do
    echo "$get" | grep -q "strcmp(rest, \"$k\")" \
        && say "ok   — ...including $k" || bad "$k is not resolved on the bulk path"
done
echo "$get" | grep -q 'strcmp(rest, "muted")' && echo "$get" | grep -q 'strcmp(rest, "soloed")' \
    && say "ok   — ...and muted / soloed" || bad "muted / soloed are not resolved on the bulk path"

# It must read the SAME state the single path reads, or the two can disagree —
# which is the whole class of bug this file exists for.
echo "$get" | grep -q 'shadow_move_fx_strip\[sl\]' \
    && say "ok   — it reads shadow_move_fx_strip[], the same state the single path reads" \
    || bad "the bulk path reads its own copy of the state"

# 1-based on the wire, 0-based in the array. Getting this wrong reads the wrong bus.
echo "$get" | grep -q "rest\[0\] >= '1' && rest\[0\] <= '4'" \
    && say "ok   — the bus digit is bounded 1..4 (1-based on the wire)" || bad "the bus digit is unbounded"
echo "$get" | grep -q "sl = rest\[0\] - '1'" \
    && say "ok   — ...and converted to the array's 0-based index" || bad "no 1-based -> 0-based conversion"

# ---- the davebox half: an all-empty answer is not an answer -----------------
many=$(awk '/^export function engineGetMany\(/{f=1} f{print} f&&/^}/{exit}' "$E")
[ -n "$many" ] || bad "engineGetMany not found"

echo "$many" | grep -q 'allEmpty' \
    && say "ok   — a bulk answer whose keys are ALL empty falls back per key" \
    || bad "a count match is still accepted as an answer — the next unresolvable prefix fails silently"
echo "$many" | grep -q 'if (!allEmpty)' \
    && say "ok   — ...and a partially-empty answer is still accepted (an empty value is legitimate)" \
    || bad "the fallback fires on any empty value, costing round trips on normal reads"

# Control: the pin must be able to fail. A body with neither guard must not pass.
if echo 'function engineGetMany(){ if (vals && vals.length === chunk.length) return vals; }' \
     | grep -q 'allEmpty'; then bad "control: a guardless body matched the pin"
else say "ok   — control: a guardless engineGetMany fails the pin"; fi

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
