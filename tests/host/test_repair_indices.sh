#!/usr/bin/env bash
set -euo pipefail

# project-cmd.sh repair-indices (Fix C of the 2026-09-14 new-project plan):
# launch-time repair of a Move-born stray sharing an index with a dAVEBOx
# project, and quarantine of unusable orphan dirs. Off-device coverage keys
# off user.* xattrs, so it can only run where user xattrs actually work —
# same Linux-only skip pattern as the color/rename block in
# test_project_cmd.sh (macOS python has no os.setxattr; tmpfs before 6.6
# lacks user.*).
#
# This test FAILS on pre-slice code because `repair-indices` is not a
# recognised verb yet (project-cmd.sh dies with "usage: ...").

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

echo "test_repair_indices"

XATTR_OK=0
_xt="$(mktemp -d)"
python3 - "$_xt" <<'PY' >/dev/null 2>&1 && XATTR_OK=1
import os, sys
os.setxattr(sys.argv[1], "user.song-index", b"7")
assert os.getxattr(sys.argv[1], "user.song-index") == b"7"
PY
rm -rf "$_xt"

if [ "$XATTR_OK" != 1 ]; then
    echo "  skip repair-indices checks (no user-xattr support here; device is ext4+Linux)"
    echo "PASS: repair-indices (skipped)"
    exit 0
fi

setxattr() { python3 -c "import os,sys; os.setxattr(sys.argv[1], sys.argv[2], sys.argv[3].encode())" "$1" "$2" "$3"; }
getxattr() { python3 -c "import os,sys
try:
    print(os.getxattr(sys.argv[1], sys.argv[2]).decode())
except OSError:
    print('')" "$1" "$2"; }

# ---- collision + orphan fixture, per the plan ------------------------------
#   A(dbx, index 13)  B(Move-born, index 13)  C(dbx, index 31)
#   __pending-8-1 (orphan by name)   DO-NOT-EDIT.txt (skip, not a project)
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
DBX_DIR="$T/dbx"; PROJECTS_DIR="$T/projects"
export DBX_DIR PROJECTS_DIR
mkdir -p "$PROJECTS_DIR" "$DBX_DIR"

U_A=aaaaaaaa-0000-4000-8000-00000000000a
U_B=bbbbbbbb-0000-4000-8000-00000000000b
U_C=cccccccc-0000-4000-8000-00000000000c

mkdir -p "$PROJECTS_DIR/$U_A/Project A" "$PROJECTS_DIR/$U_A/dAVEBOx"
echo '{}' > "$PROJECTS_DIR/$U_A/Project A/Song.abl"
setxattr "$PROJECTS_DIR/$U_A" user.song-index 13
setxattr "$PROJECTS_DIR/$U_A" user.dbx-pad 13
setxattr "$PROJECTS_DIR/$U_A" user.dbx-color 2

mkdir -p "$PROJECTS_DIR/$U_B/Set 1"
echo '{}' > "$PROJECTS_DIR/$U_B/Set 1/Song.abl"
setxattr "$PROJECTS_DIR/$U_B" user.song-index 13
setxattr "$PROJECTS_DIR/$U_B" user.dbx-pad 13   # collides with A, no dAVEBOx marker

mkdir -p "$PROJECTS_DIR/$U_C/Project C"
echo '{}' > "$PROJECTS_DIR/$U_C/Project C/Song.abl"
setxattr "$PROJECTS_DIR/$U_C" user.song-index 31
setxattr "$PROJECTS_DIR/$U_C" user.dbx-pad 31
setxattr "$PROJECTS_DIR/$U_C" user.dbx-color 5

mkdir -p "$PROJECTS_DIR/__pending-8-1"
echo "junk" > "$PROJECTS_DIR/__pending-8-1/partial"

printf 'do not touch\n' > "$PROJECTS_DIR/DO-NOT-EDIT.txt"

out="$(sh "$CMD" repair-indices)"
echo "$out" | sed 's/^/    /'

check "exits 0" true   # repair-indices never refuses; reaching here is the check

idx_b="$(getxattr "$PROJECTS_DIR/$U_B" user.dbx-pad)"
idx_a="$(getxattr "$PROJECTS_DIR/$U_A" user.dbx-pad)"
idx_c="$(getxattr "$PROJECTS_DIR/$U_C" user.dbx-pad)"
check "B moved to the lowest free index (0)" bash -c "[ '$idx_b' = 0 ]"
check "A untouched (still 13)" bash -c "[ '$idx_a' = 13 ]"
check "C untouched (still 31)" bash -c "[ '$idx_c' = 31 ]"
check "B's move was logged old -> new" bash -c "printf '%s' \"$out\" | grep -q 'moved.*from index 13 to 0'"

check "pending dir quarantined, not left in Sets/" bash -c "[ ! -e '$PROJECTS_DIR/__pending-8-1' ]"
check "pending dir survives somewhere under sets/quarantine/" bash -c "find '$DBX_DIR/sets/quarantine' -maxdepth 2 -type d -name '__pending-8-1' | grep -q ."
check "quarantine was logged" bash -c "printf '%s' \"$out\" | grep -q 'quarantined __pending-8-1'"
check "quarantine dir is dated YYYYMMDD" bash -c "find '$DBX_DIR/sets/quarantine' -maxdepth 1 -mindepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' | grep -q ."

check "DO-NOT-EDIT.txt left alone" test -f "$PROJECTS_DIR/DO-NOT-EDIT.txt"
check "nothing was deleted -- A/B/C set dirs all still exist somewhere" bash -c \
    "[ -d '$PROJECTS_DIR/$U_A' ] && [ -d '$PROJECTS_DIR/$U_B' ] && [ -d '$PROJECTS_DIR/$U_C' ]"

# ---- idempotent: rerun over the repaired library is a no-op ---------------
out2="$(sh "$CMD" repair-indices)"
findings2="$(printf '%s' "$out2" | grep 'repair-indices:' || true)"
check "rerun logs nothing (idempotent)" bash -c "[ -z '$findings2' ]"
idx_b2="$(getxattr "$PROJECTS_DIR/$U_B" user.dbx-pad)"
check "rerun: B's index unchanged" bash -c "[ '$idx_b2' = 0 ]"

# ---- positive control: a healthy library produces ZERO findings -----------
# (a check that only ever fires is worthless -- prove it can stay silent too)
T2="$(mktemp -d)"
DBX_DIR2="$T2/dbx"; SETS_DIR2="$T2/Sets"
mkdir -p "$SETS_DIR2" "$DBX_DIR2"
U_H=dddddddd-0000-4000-8000-00000000000d
mkdir -p "$SETS_DIR2/$U_H/Healthy Project"
echo '{}' > "$SETS_DIR2/$U_H/Healthy Project/Song.abl"
setxattr "$SETS_DIR2/$U_H" user.song-index 0
setxattr "$SETS_DIR2/$U_H" user.dbx-pad 0
setxattr "$SETS_DIR2/$U_H" user.dbx-color 0
h_out="$(DBX_DIR="$DBX_DIR2" PROJECTS_DIR="$SETS_DIR2" sh "$CMD" repair-indices)"
h_findings="$(printf '%s' "$h_out" | grep 'repair-indices:' || true)"
check "healthy library: zero log lines" bash -c "[ -z '$h_findings' ]"
check "healthy library: no quarantine dir created" bash -c "[ ! -d '$DBX_DIR2/sets/quarantine' ]"
rm -rf "$T2"

[ "$fails" = 0 ] && echo "PASS: repair-indices" || { echo "FAIL: repair-indices" >&2; exit 1; }
