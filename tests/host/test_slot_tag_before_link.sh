#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

# WHEN A SLOT LINK MOVES, ITS NEW TARGET MUST ALREADY CARRY ITS ORDERING TAG.
#
# Move re-reads the set library when a slot link changes, and ranks an entry
# with no `user.song-index` LAST. If the link moves first and the tag lands a
# moment later, Move re-ranks in that window — slot 0 behind slot 1 — and does
# not re-rank when the tag arrives. From then on pad 0 is the OTHER slot, so
# every switch to slot 0 presses the project Move is already on: Move says
# nothing, and the load times out as `unopened`.
#
# Device, 2026-09-21: two switches to slot 0 in a row, one to a brand-new
# project and one to an old one whose tag the launch sync had cleared. Slot 1
# never shows it (untagged sorts last, and slot 1 is last), which made it look
# slot-specific rather than ordering-specific.
#
# This models "Move looks at the instant the link changes": the rename that
# moves a slot link is intercepted, and at that instant the tag on the new
# target is read. Tags live in a fake store so the check runs on any platform
# — including macOS, where real user xattrs are unavailable and the existing
# song-index checks skip.

fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fail=1; }

echo "a re-pointed slot is tagged before Move can see it:"

# ⚠ A FRESH BYTECODE CACHE, every run. Python reuses a .pyc whenever the
# source's mtime (whole seconds) and SIZE match — and a mutation that swaps two
# lines keeps the size, so a mutate-then-restore within one second left this
# test running the MUTANT against the restored source and failing on correct
# code (2026-09-21). A throwaway cache prefix forces a recompile.
_pyc="$(mktemp -d)"
trap 'rm -rf "$_pyc"' EXIT
out="$(PYTHONPYCACHEPREFIX="$_pyc" DBX_PY_DIR="$PWD/standalone/scripts" python3 - <<'PY' 2>&1
import os, sys, tempfile
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl

T = tempfile.mkdtemp()
lib, store = os.path.join(T, "lib"), os.path.join(T, "store")
os.makedirs(lib); os.makedirs(store)
A, B, NEW = ("11111111-0000-4000-8000-000000000001",
             "22222222-0000-4000-8000-000000000002",
             "33333333-0000-4000-8000-000000000003")
for p in (A, B, NEW):
    os.makedirs(os.path.join(store, p))

# ⚠ Keyed by REALPATH everywhere. The first cut keyed the store by abspath and
# looked up by realpath; on macOS the temp dir is /var -> /private/var, so the
# lookup missed and the check reported the defect against correct code.
K = os.path.realpath
tags = {}                                  # project dir -> index, or absent
def fake_tag(project_dir, idx):
    if idx is None: tags.pop(K(project_dir), None)
    else:           tags[K(project_dir)] = int(idx)
sl._set_song_index = fake_tag

seen = []                                  # what Move would see, per link move
real_rename = os.rename
def watching_rename(src, dst):
    real_rename(src, dst)
    name = os.path.basename(dst)
    if name in sl.SLOT_IDS:
        target = os.path.realpath(dst)
        seen.append((sl.SLOT_IDS.index(name), os.path.basename(target),
                     tags.get(K(target))))
os.rename = watching_rename

# Start: slot 0 -> A (tagged 0), slot 1 -> B (tagged 1); Move is on slot 1.
sl._point(lib, sl.SLOT_IDS[0], sl.project_path(store, A)); fake_tag(sl.project_path(store, A), 0)
sl._point(lib, sl.SLOT_IDS[1], sl.project_path(store, B)); fake_tag(sl.project_path(store, B), 1)
seen.clear()

# ⭐ The failing case: re-point the idle slot 0 at an UNTAGGED project.
landed = sl.repoint(lib, store, 0, NEW)
print("LANDED", landed == NEW)
print("SEEN", seen)
for slot, pid, tag in seen:
    print("AT_MOVE", slot, tag)
print("FINAL_TAG", tags.get(K(sl.project_path(store, NEW))))

# ⭐ The SYNC, mid-session: the project in slot 0 is deleted, so the sync must
# re-point slot 0 at another project — one with no tag yet.
import shutil
LATE = "44444444-0000-4000-8000-000000000004"
os.makedirs(os.path.join(store, LATE))
shutil.rmtree(os.path.join(store, NEW))          # slot 0's project is gone
tags.pop(K(sl.project_path(store, NEW)), None)
# ⚠ Clear every tag NOT on show first. repoint() leaves the outgoing project's
# tag in place (A still carries 0 from its stint in slot 0 — exactly as Project
# 29 did on the device), and the first cut of this check passed on that STALE
# tag, not on the ordering it claims to test.
for q in (A, LATE):
    tags.pop(K(sl.project_path(store, q)), None)
seen.clear()
sl.sync(lib, store)
for slot, pid, tag in seen:
    print("SYNC_AT_MOVE", slot, pid[:8], tag)
print("SYNC_OUTGOING_CLEAR", all(tags.get(K(sl.project_path(store, q))) is None
                                 for q in (A, B, LATE)
                                 if q not in (sl.slot_target(lib, x) for x in sl.SLOT_IDS)))

# A re-point that does NOT land must not leave the project claiming an index.
# Use a project in NEITHER slot — the distinctness guard would (rightly)
# refuse one that is already on show in the other slot.
onshow = {sl.slot_target(lib, x) for x in sl.SLOT_IDS}
OFF = next(q for q in (A, B, LATE) if q not in onshow)
sl._point = lambda *a, **k: False           # the link never moves
landed2 = sl.repoint(lib, store, 1, OFF)
print("NOLAND_LANDED", landed2 == OFF)
print("NOLAND_TAG", tags.get(K(sl.project_path(store, OFF))))
PY
)"
echo "$out" | sed 's/^/    /'

case "$out" in
    *"LANDED True"*) ok "the re-point landed on the new project" ;;
    *)               bad "the re-point did not land — the checks below mean nothing" ;;
esac
case "$out" in
    *"AT_MOVE 0 0"*) ok "at the instant the link moved, the new target already carried index 0" ;;
    *"AT_MOVE 0 None"*)
        bad "the link moved BEFORE the tag — Move would rank slot 0 last and pad 0 would open the OTHER slot" ;;
    *)  bad "the slot-0 link never moved — the check cannot see its subject" ;;
esac
case "$out" in
    *"FINAL_TAG 0"*) ok "and it keeps the tag afterwards" ;;
    *)               bad "the new target does not end up tagged 0" ;;
esac
case "$out" in
    *"SYNC_AT_MOVE 0 "*" 0"*) ok "the SYNC also tags before it moves a link (it runs mid-session on delete)" ;;
    *"SYNC_AT_MOVE 0 "*" None"*)
        bad "the sync moved slot 0 BEFORE tagging its new project — delete would reorder Move's pads" ;;
    *)  bad "the sync never re-pointed slot 0 — the check cannot see its subject" ;;
esac
case "$out" in
    *"SYNC_OUTGOING_CLEAR True"*) ok "...and projects no longer on show lose their tag afterwards" ;;
    *) bad "a project left the slots but kept claiming an index" ;;
esac
# ⚠ Of these, this is the one that would be easiest to get wrong
# silently: tagging first means a re-point that fails has ALREADY tagged a
# project that is not on show.
case "$out" in
    *"NOLAND_TAG None"*) ok "a re-point that did not land takes its tag back off" ;;
    *)                   bad "a failed re-point left a project claiming an index it is not showing" ;;
esac

[ "$fail" = 0 ] && echo "PASS: Move never sees a slot whose target is untagged"
exit "$fail"
