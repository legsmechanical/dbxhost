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

# ---- the UNDO before-image is taken INSIDE the recall, and SCOPED ----------
# It moved here (2026-09-06) because the scope is `plan.writes`, which only
# exists once the plan is built, and because building the plan does the
# expensive live-id read the before-take would otherwise repeat. Unscoped, the
# before-take cost 475-492 ms on every recall on the device.
echo "$rec" | grep -q 'hostSnapshotTake(undoDir, onlySlot, snapshotScopeForWrites(plan.writes))' \
    && say "ok   — the before-image is SCOPED to the positions the plan will write" \
    || bad "the before-take is not scoped to plan.writes"
# Ordering is the whole contract of a before-image: it must precede the writes.
before_line=$(echo "$rec" | grep -n 'hostSnapshotTake(undoDir' | head -1 | cut -d: -f1)
write_line=$(echo "$rec" | grep -n 'snapshotRecallJob = {' | head -1 | cut -d: -f1)
[ -n "$before_line" ] && [ -n "$write_line" ] && [ "$before_line" -lt "$write_line" ] \
    && say "ok   — the before-image is taken BEFORE any write is queued (line $before_line < $write_line)" \
    || bad "the before-take does not precede the writes"
echo "$rec" | grep -q 'undoOk' && say "ok   — the recall reports whether the before-image landed, so davebox can skip a bogus undo unit" || bad "recall does not report undoOk"
grep -q 'globalThis.host_snapshot_recall = function(dir, slot, undoDir)' "$JS" \
    && say "ok   — the binding takes the undo dir as its 3rd arg" || bad "binding does not accept undoDir"
# The scope DERIVATION is pure and unit-tested in test_snapshot_plan.sh; this
# file only pins that shadow_ui.js uses it rather than reimplementing it.
grep -q 'scopeForWrites' "$JS" && say "ok   — the scope derivation comes from shared/snapshot.mjs (one owner, tested standalone)" || bad "scopeForWrites not imported"
scope=$(awk '/^function snapshotScopeForWrites\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
echo "$scope" | grep -q 'scopeForWrites(writes, SHADOW_UI_SLOTS)' && say "ok   — ...and the wrapper only maps families to file names" || bad "the wrapper re-derives the scope"
# A scoped take must not flush what it was not asked for.
echo "$take" | grep -q 'if (scope) { for (const i of scope.slots) autosaveAllSlots(i, true); }' \
    && say "ok   — a scoped take flushes ONLY the slots in scope" || bad "a scoped take still flushes every slot"
for fam in master send move; do
    echo "$take" | grep -qE "if \(scope\.$fam\)" && say "ok   — the $fam saver runs only when the $fam family is in scope" || bad "the $fam saver is unconditional"
done

# control: a bare tick body must fail the bulk pin
echo "function snapshotRecallTick() {}" | grep -q 'shadow_set_params' && bad "control: an empty tick passed" || say "ok   — control: an empty tick fails the pin"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
