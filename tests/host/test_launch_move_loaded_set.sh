#!/usr/bin/env bash
set -euo pipefail

# move-loaded-set-reader.sh distills MoveOriginal's own "About to load ..."
# boot line (which already lands in launch.log via launch.sh's plain
# `exec >>"$LOG" 2>&1` redirection — nothing pipes through us) into
# move_loaded_set.txt. S4 (a separate, later slice) compares this file
# against the xattr-resolved project the host believes is open, so this test
# is the file's off-device contract check: feed a FAKE Move log and assert
# the file ends up holding exactly what a real boot would leave.
#
# This test FAILS on pre-slice code because move-loaded-set-reader.sh does
# not exist yet.

cd "$(dirname "$0")/../.."
READER=standalone/scripts/move-loaded-set-reader.sh
[ -f "$READER" ] || { echo "FAIL: $READER missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

T="$(mktemp -d)"
# ⚠ Killing $READER_PID alone is not enough: the reader script's own pid is
# the `sh` running `tail -F | while read ...`, and `tail`, its pipeline
# CHILD, does not die with its parent on SIGTERM. An orphaned `tail -F` then
# keeps the write end of this test's own captured stdout pipe open forever —
# which hangs any caller that captures this test's output via `$(...)`
# (exactly what the pre-commit hook and CI do), long after this test itself
# has printed PASS and returned. `pkill -P` reaps the reader's direct
# children (tail, and the while-loop subshell) before the parent.
trap 'pkill -P "${READER_PID:-0}" 2>/dev/null || true; kill "${READER_PID:-0}" 2>/dev/null || true; rm -rf "$T"' EXIT

LOG="$T/launch.log"
OUT="$T/move_loaded_set.txt"
: > "$LOG"

sh "$READER" "$LOG" "$OUT" &
READER_PID=$!

wait_for() { # predicate-file expected-content-substring timeout-tenths
    local n=0
    while [ "$n" -lt "${3:-50}" ]; do
        if [ -f "$1" ] && grep -q "$2" "$1" 2>/dev/null; then return 0; fi
        sleep 0.1
        n=$((n + 1))
    done
    return 1
}

echo "test_launch_move_loaded_set"

# ---- shape 1: unrelated boot noise must never create the file -------------
{
  echo "=== davebox host launch $(date) ==="
  echo "some unrelated line about loading things"
  echo "About to loadXfoo — near-miss, must not match"
} >> "$LOG"
sleep 0.3
check "noise alone writes nothing" bash -c "[ ! -f '$OUT' ]"

# ---- shape 2: About to load <path> -> the uuid -----------------------------
U1=aaaaaaaa-1111-4bbb-8ccc-000000000001
echo "About to load /data/UserData/UserLibrary/Sets/$U1/My Project/Song.abl" >> "$LOG"
check "uuid path captured" wait_for "$OUT" "$U1"
check "healthy log never yields default" bash -c "! grep -q default '$OUT'"

# ---- launch.sh clears the file before each Move start; simulate a relaunch
rm -f "$OUT"
echo "some more noise between launches" >> "$LOG"
sleep 0.3
check "cleared file stays absent until the next About-to-load line" bash -c "[ ! -f '$OUT' ]"

U2=bbbbbbbb-2222-4ccc-8ddd-000000000002
echo "About to load /data/UserData/UserLibrary/Sets/$U2/Second Project/Song.abl" >> "$LOG"
check "relaunch: second uuid captured" wait_for "$OUT" "$U2"
check "relaunch: first uuid is gone (atomic overwrite, not append)" bash -c "! grep -q '$U1' '$OUT'"

# ---- shape 3: About to load default song -> the literal `default` ---------
rm -f "$OUT"
echo "About to load default song" >> "$LOG"
check "default song captured" wait_for "$OUT" "^default\$"

pkill -P "$READER_PID" 2>/dev/null || true
kill "$READER_PID" 2>/dev/null || true
wait "$READER_PID" 2>/dev/null || true

[ "$fails" = 0 ] && echo "PASS: launch_move_loaded_set" || { echo "FAIL: launch_move_loaded_set" >&2; exit 1; }
