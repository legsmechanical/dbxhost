#!/bin/bash
# test_snapshot_bindings.sh — the snapshot host bindings (item 18a) exist,
# recall is STATE-ONLY over the bulk SET, take does not bail, the job is
# ticked, and the pure half is shared. shadow_ui.js is bound to the device, so
# these are source pins; the planner itself runs in test_snapshot_plan.sh.
set -e
cd "$(dirname "$0")/../.."
JS=src/shadow/shadow_ui.js
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }

for b in host_snapshot_take host_snapshot_recall host_snapshot_status; do
    grep -qE "globalThis.$b +=\s*function" "$JS" && say "ok   — $b is bound for the overtake module" || bad "$b not bound"
done
grep -q "from '/data/UserData/schwung/shared/snapshot.mjs'" "$JS" && say "ok   — the pure half is imported from shared/ (one planner, tested standalone)" || bad "planner not imported from shared/"
[ -f src/shared/snapshot.mjs ] && say "ok   — shared/snapshot.mjs exists" || bad "shared/snapshot.mjs missing"
grep -q 'for f in ./src/shared/\*.mjs' scripts/build.sh && say "ok   — build.sh ships every shared .mjs, the planner included" || bad "build.sh does not ship shared/*.mjs"

# recall: state only, bulk per slot, ALL batches in the call (instant)
rec=$(awk '/^function hostSnapshotRecall\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
tick=$(awk '/^function snapshotRecallTick\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
! echo "$rec$tick" | grep -q 'load_file' && say "ok   — recall never touches load_file (state only: no reinstantiation, no cut tails)" || bad "recall reaches for load_file"
echo "$tick" | grep -q 'shadow_set_params(b.slot, "chain:", bulkEncodeItems(b.items), false)' && say "ok   — a recall batch is ONE bulk SET per slot (non-transient, so autosave sees it)" || bad "recall does not use the bulk SET"
echo "$rec" | grep -q 'while (snapshotRecallJob) snapshotRecallTick();' && say "ok   — INSTANT: every batch is written back-to-back inside the call (Josh: a brief freeze over a spread-out recall)" || bad "recall is not drained in the call"
grep -q 'snapshotRecallTick();' "$JS" && [ "$(grep -c 'snapshotRecallTick();' "$JS")" -ge 2 ] && say "ok   — the job is driven from the host tick" || bad "tick hook missing"
echo "$rec" | grep -q 'planRestore(records, snapshotLiveIds(busPrefixes, onlySlot))' && say "ok   — the id-guard plan runs against the LIVE module ids" || bad "no id-guard"
echo "$tick" | grep -q 'invalidateKnobValueCache();' && say "ok   — knob caches are dropped after a recall (the first-turn snap-back lesson)" || bad "knob caches not invalidated"

# take: through the autosave writers, without the bail, then copy atomically
take=$(awk '/^function hostSnapshotTake\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
echo "$take" | grep -q 'autosaveAllSlots(onlySlot >= 0 ? onlySlot : undefined, true)' && say "ok   — take flushes slots through the autosave writer, WITHOUT the bail-and-preserve" || bad "take bails like an autosave"
grep -q 'buildSlotPatchJson(i, slots\[i\].name || "Untitled", !forSnapshot, moduleChanged)' "$JS" && say "ok   — ...the writer passes forAutosave = !forSnapshot" || bad "writer ignores forSnapshot"
for w in saveMasterFxChainConfig saveSendFxChainConfig saveMoveFxChainConfig; do
    echo "$take" | grep -q "$w(" && say "ok   — take flushes the buses too ($w)" || bad "take skips $w"
done
grep -q 'flushed and renamed over the destination' src/host/js_host_common.c && say "ok   — host_write_file is temp-then-rename, so a failed take leaves the previous file whole" || bad "host_write_file is not atomic"

# control: a bare tick body must fail the bulk pin
echo "function snapshotRecallTick() {}" | grep -q 'shadow_set_params' && bad "control: an empty tick passed" || say "ok   — control: an empty tick fails the pin"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
