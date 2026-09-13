#!/usr/bin/env bash
# The exported MIDI FX transform: chain_midi_fx_apply.
#
# Lets a sequencer place a slot's MIDI FX at a chosen point in its OWN chain
# (ahead of what it records, or after what it plays) by calling the transform and
# receiving the result, rather than needing a route for MIDI to leave the chain.
#
# ⚠⚠ WHAT THIS TEST DOES NOT DO, stated so nobody reads it as more than it is:
# it does NOT prove the transform runs, because that needs a real MIDI FX module
# loaded into a real chain instance — a device test, and slice 2's job. What it
# pins is the part that silently rots: the symbol staying exported, the wrapper
# staying a DELEGATE rather than drifting into a second implementation, the shim
# resolving it, and the NULL-check staying documented.
#
# ⭑ And it enforces the reachability audit rather than just mentioning it — see
# the CALLER COUNT check at the end.
# → [[a-reachability-audit-is-not-optional-for-a-staged-port]]
set -euo pipefail
cd "$(dirname "$0")/../.."

midi="src/modules/chain/dsp/chain_midi.c"
mgmt_c="src/host/shadow_chain_mgmt.c"
mgmt_h="src/host/shadow_chain_mgmt.h"
fail=0
note() { echo "FAIL: $1" >&2; fail=1; }

# 1. Exported, not static — a static one cannot be dlsym'd, and the mistake
#    compiles cleanly and fails only at runtime with a NULL pointer.
grep -qE '^int chain_midi_fx_apply\(void \*instance' "$midi" \
  || note "chain_midi_fx_apply is not defined at file scope in $midi"
# ⚠ `grep … && note` would abort the script under `set -e` on the PASSING case
# (grep finds nothing, the compound returns 1). Negative checks take the if-form.
if grep -qE '^static[^\n]*chain_midi_fx_apply' "$midi"; then
  note "chain_midi_fx_apply is static — it cannot be dlsym'd"
fi

# 2. It DELEGATES. The value of the wrapper is that there is exactly one
#    transform; a copy would drift the moment the internal path changed.
awk '/^int chain_midi_fx_apply\(/,/^}/' "$midi" | grep -q 'return v2_process_midi_fx(' \
  || note "the wrapper no longer delegates to v2_process_midi_fx — two transforms will drift"

# 3. It guards its arguments. It is called from another module across a dlsym
#    boundary, so a bad pointer here is a crash in someone else's code.
awk '/^int chain_midi_fx_apply\(/,/^}/' "$midi" | grep -q '!inst' \
  || note "the wrapper does not NULL-check its instance"

# 4. The shim declares, resolves and logs it, beside the tick wake it copies.
grep -q 'shadow_chain_midi_fx_apply' "$mgmt_h" || note "$mgmt_h does not declare the pointer"
grep -q 'dlsym(shadow_dsp_handle, "chain_midi_fx_apply")' "$mgmt_c" \
  || note "$mgmt_c does not dlsym chain_midi_fx_apply"
grep -q 'midi_fx_apply=%p' "$mgmt_c" \
  || note "$mgmt_c does not log whether the symbol resolved — an absent one must be visible"

# 5. ⚠ The NULL-check requirement stays documented, and the REASON with it: the
#    dlsym can fail, and an install predating the symbol has a chain DSP without
#    it.
#    ⚠⚠ The NEIGHBOURING pointer's comment says install-sa does not deploy the
#    chain dsp.so. True in August, FALSE now — re-measured 2026-09-13:
#    DBX_OWNED_MODULE_DIRS includes `chain`, install-host rsyncs it, and a
#    deployed dsp.so md5-matched the local build with stock's copy untouched.
#    Pin the correction so it cannot rot back: the stale version's workaround was
#    to scp into the STOCK TREE, which is a red line.
grep -q 'NULL-CHECK IT' "$mgmt_h" || note "$mgmt_h lost the NULL-check warning"
grep -q 'DBX_OWNED_MODULE_DIRS' "$mgmt_h" \
  || note "$mgmt_h lost the correction that install-sa DOES deploy the chain DSP"

# 6. ⭑⭑ THE REACHABILITY GATE. This slice ships the enabler with NO caller, on
#    purpose. A staged port has shipped a whole compiling, linking, tested file
#    that nothing called for four commits here before — so the count is pinned,
#    and adding the first caller must come with a device test and an update to
#    this number. If this fires because you wired it up: good. Raise the number,
#    and say in the commit what device test covers the call.
# ⚠ `grep -v` EXITS 1 when it filters everything out — which is precisely the
# passing state here (every hit is plumbing) — and `pipefail` would then abort
# the script with no message. The `|| true` is load-bearing, not defensive noise.
callers=$( { grep -rn 'shadow_chain_midi_fx_apply' src/ --include=*.c --include=*.h --include=*.js \
             | grep -vE 'shadow_chain_mgmt\.(c|h):' || true; } | wc -l | tr -d ' ')
if [ "$callers" != "0" ]; then
  note "chain_midi_fx_apply now has $callers caller(s) outside the plumbing. That is the point of the
      enabler — but update this count AND name the device test that exercises the call, because a
      green suite has never meant the path is reachable. [[wired-is-not-reachable]]"
fi

[ "$fail" = 0 ] || exit 1
echo "PASS: chain_midi_fx_apply — exported, delegating, resolved by the shim, and still uncalled (enabler slice)"
