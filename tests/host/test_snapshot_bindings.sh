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
echo "$rec" | grep -q 'planRestore(records, snapshotLiveIds(busPrefixes, onlySlot, effBus))' && say "ok   — the id-guard plan runs against the LIVE module ids" || bad "no id-guard"
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
echo "$rec" | grep -q 'hostSnapshotTake(undoDir, onlySlot, snapshotScopeForWrites(plan.writes), effBus)' \
    && say "ok   — the before-image is SCOPED to the positions the plan will write" \
    || bad "the before-take is not scoped to plan.writes"
# Ordering is the whole contract of a before-image: it must precede the writes.
before_line=$(echo "$rec" | grep -n 'hostSnapshotTake(undoDir' | head -1 | cut -d: -f1)
write_line=$(echo "$rec" | grep -n 'snapshotRecallJob = {' | head -1 | cut -d: -f1)
[ -n "$before_line" ] && [ -n "$write_line" ] && [ "$before_line" -lt "$write_line" ] \
    && say "ok   — the before-image is taken BEFORE any write is queued (line $before_line < $write_line)" \
    || bad "the before-take does not precede the writes"
echo "$rec" | grep -q 'undoOk' && say "ok   — the recall reports whether the before-image landed, so davebox can skip a bogus undo unit" || bad "recall does not report undoOk"
grep -q 'globalThis.host_snapshot_recall = function(dir, slot, undoDir, moveBus)' "$JS" \
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

# ---- the Undo dir is REUSED, so the take must CONSIDER every name ------------
# Found by review, not by these tests: undoDir() is one fixed path per project,
# nothing clears it, and no host binding removes a file. The unscoped take used
# to rewrite all 36 files each time, which is what kept it clean. Iterating a
# SCOPED name list would leave the previous recall's files in place, and Undo
# (which walks every name via snapshotRecords) would restore slots the recall
# never touched.
# ⚠ The dir is no longer fully REWRITTEN — that is the delta below. What must
# not change is that every name is CONSIDERED, so a name can only be left alone
# by a deliberate, recorded decision rather than by never being looked at.
echo "$take" | grep -qF 'const names = onlySlot >= 0' && echo "$take" | grep -qF '? ["/slot_" + onlySlot + ".json"].concat(moveBusFileNames(moveBus))' && echo "$take" | grep -qF ': snapshotFileNames();' \
    && say "ok   — the loop iterates the FULL name list, never scope.names (every name is considered)" \
    || bad "the copy loop iterates a scoped name list — stale files would survive in the undo dir"
echo "$take" | grep -q 'if (host_write_file(dir + name, content || "{}\\n")) copied++;' \
    && say "ok   — an out-of-scope name is blanked to {}, not left holding the last take" || bad "a name can be skipped by the writer"
# The write must sit OUTSIDE the in-scope branch, or out-of-scope names go unwritten.
echo "$take" | awk '/if \(!inScope \|\| inScope.has\(name\)\)/{d=1} d&&/^        \}/{d=0; next} d&&/host_write_file/{print "INSIDE"}' | grep -q INSIDE \
    && bad "host_write_file is inside the in-scope branch — out-of-scope names would not be cleared" \
    || say "ok   — the write is outside the in-scope guard, so out-of-scope names are cleared to {}"
# ---- the clear is a DELTA, and an UNKNOWN dir must still be cleared whole ----
# Blanking all 34 out-of-scope files cost 86-96 ms through host_write_file (a
# python proxy on the same fs had said 3-9 ms, and was out by ~10x). Only names
# THIS PROCESS knows it left blank may be skipped: a dir we have not written
# may hold a previous session's files, which is the staleness being prevented.
echo "$take" | grep -qF 'const prevHeld = snapshotDirWritten.get(dir + "|" + onlySlot + "|" + (moveBus | 0))' \
    && say "ok   — the clear is a delta against what this process last wrote" || bad "no delta record"
echo "$take" | grep -q 'else if (prevHeld && !prevHeld.has(name)) {' \
    && say "ok   — ...and a name is skipped ONLY when prevHeld is known AND says it is blank" \
    || bad "a name can be skipped without a known prevHeld — an unknown dir would keep stale files"
echo "$take" | grep -q 'snapshotDirWritten.set(' && say "ok   — the record is updated after every take" || bad "the delta record is never updated"
grep -q 'const snapshotDirWritten = new Map();' "$JS" && say "ok   — the record is per-DIR (session and each track keep their own undo dir)" || bad "no per-dir record"
# ⚠ There WAS a "control" here asserting the record is not persisted, as a
# same-line grep for snapshotDirWritten near host_write_file. It could not
# fire: any realistic persistence (host_write_file(dir + "/.held", ...)) names
# neither identifier on that line. A check that cannot fail is worse than none
# — it reads as coverage. The property it wanted is pinned positively instead:
# the record is a plain in-memory Map declared with no serialiser.
# ⚠ The key must name EVERY input the NAME LIST depends on — dir, onlySlot AND
# moveBus. The skip reads "absent from prevHeld" as "we blanked it", true only
# while the list is fixed for a key. Keyed without the bus, a track that changes
# route between recalls leaves its old bus files unblanked and then SKIPPED, and
# Undo restores that bus from two recalls ago. (Both halves of this were found
# by review; the onlySlot half first, then the bus half it reopened.)
echo "$take" | grep -qF 'snapshotDirWritten.set(dir + "|" + onlySlot + "|" + (moveBus | 0), held);' \
    && say "ok   — the record is keyed on dir, onlySlot AND moveBus (every input the name list depends on)" \
    || bad "the delta key omits an input the name list depends on — stale files would be skipped"
echo "$take" | grep -qF 'snapshotDirWritten.get(dir + "|" + onlySlot + "|" + (moveBus | 0))' \
    && say "ok   — ...and the read uses the same composite key" || bad "the record is read under a different key than it is written"
echo "$take" | grep -q 'else held.add(name);' \
    && say "ok   — a FAILED blanking write keeps the name marked held (temp-then-rename left it whole)" \
    || bad "a failed blanking write is recorded as blank — the record is poisoned for the process"
echo "$take" | grep -q 'ok: copied === wrote' \
    && say "ok   — ok reflects the writes ATTEMPTED, so a skipped blank is not a missing file" || bad "ok still counts the full name list"

# ---- the id-guard needs a FRESH mirror -------------------------------------
# The before-take used to run first and resync all 8 signatures as a side
# effect; folding it into the recall inverted that order.
echo "$rec" | grep -q 'refreshSlotModuleSignature(i)' \
    && say "ok   — the slots the snapshot names are resynced BEFORE the id-guard reads the mirror" \
    || bad "the id-guard runs against a possibly-stale chainConfigs mirror"
refresh_line=$(echo "$rec" | grep -n 'refreshSlotModuleSignature(i)' | head -1 | cut -d: -f1)
plan_line=$(echo "$rec" | grep -n 'const plan = planRestore(' | head -1 | cut -d: -f1)
[ -n "$refresh_line" ] && [ -n "$plan_line" ] && [ "$refresh_line" -lt "$plan_line" ] \
    && say "ok   — ...and it precedes planRestore (line $refresh_line < $plan_line)" || bad "the refresh does not precede the plan"
echo "$rec" | grep -q 'p.indexOf("master_fx:") === 0 || p.indexOf("send_fx:") === 0 || p.indexOf("move_fx:") === 0) continue;' \
    && say "ok   — a BUS record (slot: 0) does not spuriously resync slot 0" || bad "bus records resync slot 0"

# ---- a TRACK snapshot carries its OWN bus, and ONLY its own -----------------
# A track is one mixer position: a Schwung track is chain slot t, a MOVE track
# is a Move FX bus. Capturing only the slot meant a Move-routed track's
# snapshot restored its FADER but not the effects on it (Josh, 2026-09-06:
# "track snapshots should include track bus").
echo "$take" | grep -q 'concat(moveBusFileNames(moveBus))' \
    && say "ok   — a track take copies its own bus's files alongside its slot" || bad "a track take copies the slot only"
rec2=$(awk '/^function snapshotRecords\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
echo "$rec2" | grep -q 'trackBusNames && trackBusNames.indexOf(name) < 0' \
    && say "ok   — a track RECALL plans that bus's positions (it used to skip the bus half entirely)" \
    || bad "a track recall still has no bus half"
echo "$rec" | grep -q 'snapshotLiveIds(busPrefixes, onlySlot, effBus)' \
    && say "ok   — ...and the id-guard reads that bus's live module ids" || bad "the track id-guard cannot see the bus"
# ⚠ THE RULING: the track's OWN bus only. Sends and master are SHARED between
# tracks, so recalling one track must never move another track's effects.
lids=$(awk '/^function snapshotLiveIds\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
echo "$lids" | awk '/if \(onlySlot >= 0\) \{/{f=1} f{print} f&&/^    \}/{exit}' | grep -qE 'send_fx|master_fx' \
    && bad "a track recall reads send/master ids — those are shared and must stay out" \
    || say "ok   — a track recall reads NO send or master ids (shared, deliberately excluded)"
mbf=$(awk '/^function moveBusFileNames\(/{f=1} f{print} f&&/^}/{exit}' "$JS")
echo "$mbf" | grep -qE 'send_fx|master_fx' \
    && bad "moveBusFileNames names a send or master file" \
    || say "ok   — ...and the track's file list names no send or master file"
echo "$mbf" | grep -q 'sl < 0 || sl >= MOVE_FX_SLOTS_JS' \
    && say "ok   — an out-of-range or absent bus (route 0 / route 2) yields no files, not a bogus one" \
    || bad "moveBusFileNames does not bound the bus"
# A track take must not walk all 16 Move positions to capture its one bus.
echo "$take" | grep -q 'saveMoveFxChainConfig((moveBus | 0) - 1)' \
    && say "ok   — a track take flushes ONE bus (the saver's 0-based filter), not all 16 positions" \
    || bad "a track take flushes every Move bus — the track recall would get slower for gaining its bus"

# ---- MIGRATION: a pre-bus track snapshot must not bypass the whole bus ------
# A track snapshot taken before track snapshots carried a bus has no move_fx
# files. Reading the live bus ids anyway makes planRestore call all four
# positions "added since the save" and BYPASS every FX block on that bus — on
# the user's existing snapshots, the moment they recall one.
echo "$rec" | grep -q 'let effBus = moveBus | 0;' \
    && say "ok   — the recall computes an EFFECTIVE bus, not the raw one" || bad "no effective-bus migration guard"
echo "$rec" | grep -q 'if (!hasBusHalf)' \
    && say "ok   — a snapshot with no bus half drops the bus from the recall (old behaviour preserved)" \
    || bad "a pre-bus snapshot would bypass every FX on the track's bus"
for f in snapshotRecords snapshotLiveIds hostSnapshotTake; do
    echo "$rec" | grep -q "$f(.*effBus" && say "ok   — ...and $f is given effBus, not moveBus" || bad "$f still gets the raw moveBus"
done

# control: a bare tick body must fail the bulk pin
echo "function snapshotRecallTick() {}" | grep -q 'shadow_set_params' && bad "control: an empty tick passed" || say "ok   — control: an empty tick fails the pin"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
