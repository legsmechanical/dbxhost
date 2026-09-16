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
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
reap() { local p; for p in $(descendants "${1:-0}") "${1:-0}"; do kill "$p" 2>/dev/null || true; done; }
# Last resort in the trap: anything still carrying the temp dir on its command
# line. A reader's pipeline subshell keeps the script's argv, so an orphan shows
# up as `sh .../move-loaded-set-reader.sh $T/launch.log ...` with PPID 1 — the
# descendant walk cannot reach it once its parent is gone.
trap 'reap "${READER_PID:-0}"; reap "${READER2_PID:-0}"; kill "${OWNER_PID:-0}" "${OWNER2_PID:-0}" 2>/dev/null || true; pkill -f "$T" 2>/dev/null || true; rm -rf "$T"' EXIT

LOG="$T/launch.log"
OUT="$T/move_loaded_set.txt"
: > "$LOG"

# A fake supervisor: the reader is told to live exactly as long as this pid.
sleep 300 &
OWNER_PID=$!
sh "$READER" "$LOG" "$OUT" "$OWNER_PID" &
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
check "default song captured" wait_for "$OUT" "^1 default \$"

# ---- shape 4: pad 13 device sequence — Move flaps through 4 loads in ONE
# start before settling; move_loaded_set.txt must hold only the LAST, the
# history sibling must hold all 4 in order, and the flap must be logged ------
rm -f "$OUT" "$T/move_loaded_history.txt"
D6=d6b24c82-1111-4bbb-8ccc-000000000006
C6=c63c3e77-2222-4ccc-8ddd-000000000007
echo "About to load /data/UserData/UserLibrary/Sets/$D6/Pad 13 Project/Song.abl" >> "$LOG"
check "pad13: first load (requested set) captured" wait_for "$OUT" "^1 $D6 Pad 13 Project\$"
echo "About to load /data/UserData/UserLibrary/Sets/$C6/Project 1/Song.abl" >> "$LOG"
check "pad13: second load (Move's fallback) captured" wait_for "$OUT" "^2 $C6 Project 1\$"
echo "About to load default song" >> "$LOG"
check "pad13: third load (default) captured" wait_for "$OUT" "^3 default \$"
echo "About to load /data/UserData/UserLibrary/Sets/$C6/Project 1/Song.abl" >> "$LOG"
check "pad13: fourth load (Move settles on Project 1) captured" wait_for "$OUT" "^4 $C6 Project 1\$"

HIST="$T/move_loaded_history.txt"
check "history file exists" wait_for "$HIST" "$D6"
check "history: 4 lines, oldest first" bash -c "[ \"\$(wc -l < '$HIST' | tr -d ' ')\" = 4 ]"
check "history: line 1 is the requested set" bash -c "sed -n 1p '$HIST' | grep -q ' $D6 Pad 13 Project\$'"
check "history: line 4 is the final settled set" bash -c "sed -n 4p '$HIST' | grep -q ' $C6 Project 1\$'"
check "history: line 3 is default" bash -c "sed -n 3p '$HIST' | grep -q ' default \$'"
check "history: each line starts with an ISO-8601 UTC timestamp" \
    bash -c "grep -Ecv '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z ' '$HIST' | grep -q '^0\$'"

# ---- shape 5: the COUNTER and the NAME (the 2026-09-16 contract) ----------
# The counter is what lets a consumer tell "Move loaded something SINCE I
# asked" from "Move loaded something before I asked". It is derived from the
# outfile itself, so the caller's rm at each Move start resets it — and a
# consumer that judged a request against an older line would otherwise take a
# stale answer for a fresh confirmation.
rm -f "$OUT" "$T/move_loaded_history.txt"
N1=eeeeeeee-3333-4ddd-8eee-000000000011
echo "About to load /data/UserData/UserLibrary/Sets/$N1/Project 12/Song.abl" >> "$LOG"
check "counter starts at 1 after a clear" wait_for "$OUT" "^1 $N1 Project 12\$"
echo "About to load /data/UserData/UserLibrary/Sets/$N1/Project 12/Song.abl" >> "$LOG"
check "⭑ the SAME set loaded again still increments the counter" wait_for "$OUT" "^2 $N1 Project 12\$"
rm -f "$OUT"
echo "About to load /data/UserData/UserLibrary/Sets/$N1/Project 12/Song.abl" >> "$LOG"
check "⭑ a clear (each Move start) resets the counter to 1" wait_for "$OUT" "^1 $N1 Project 12\$"

# The name is the LAST field and may contain spaces; a consumer must split on
# the first two separators only.
rm -f "$OUT"
S1=ffffffff-4444-4eee-8fff-000000000012
echo "About to load /data/UserData/UserLibrary/Sets/$S1/A Name With Spaces/Song.abl" >> "$LOG"
check "the name field carries spaces intact" wait_for "$OUT" "^1 $S1 A Name With Spaces\$"
check "⚠ CONTROL: the uuid is still the second field, not the rest of the line" \
    bash -c "[ \"\$(awk '{print \$2}' '$OUT')\" = '$S1' ]"


check "launch.log records the fall-back from the requested set" \
    bash -c "grep -q \"move-loaded-set: Move fell back: $D6 -> $C6\" '$LOG'"
check "launch.log records the fall-back to default too" \
    bash -c "grep -q \"move-loaded-set: Move fell back: $D6 -> default\" '$LOG'"

# ---- lifecycle: the reader must never outlive the session ----------------
# The session ends by exec-ing onward to stock (boot) or exiting (tools);
# neither kills background children. A reader that leaves its tail pipeline
# behind writes into dbx-host/ forever and gains a copy per session.
all_gone() { local p; for p in "$@"; do kill -0 "$p" 2>/dev/null && return 1; done; return 0; }
gone_within() { local n=0; while [ $n -lt 40 ]; do all_gone "$@" && return 0; sleep 0.1; n=$((n+1)); done; return 1; }

TREE1="$(descendants "$READER_PID")"
check "reader runs a tail pipeline (positive control for the tree checks)" test -n "$TREE1"
kill "$READER_PID" 2>/dev/null || true
check "SIGTERM stops the reader AND its whole tail pipeline" gone_within "$READER_PID" $TREE1

sleep 300 &
OWNER2_PID=$!
sh "$READER" "$LOG" "$OUT" "$OWNER2_PID" &
READER2_PID=$!
sleep 0.5
TREE2="$(descendants "$READER2_PID")"
check "second reader has a pipeline too" test -n "$TREE2"
kill "$OWNER2_PID"
check "owner gone (session exec-ed on / died) -> reader and pipeline stop themselves" gone_within "$READER2_PID" $TREE2

# ---- nothing survives: no reader, no tail, no pipeline subshell ------------
# Checked by COMMAND LINE, not by the trees captured above: an orphan is
# reparented to init and no longer anyone's descendant, which is exactly how
# the pre-fix reader leaked past a check that only walked the tree.
survivors() { pgrep -f "$T" 2>/dev/null || true; }
no_survivors_within() { local n=0; while [ $n -lt 40 ]; do [ -z "$(survivors)" ] && return 0; sleep 0.1; n=$((n+1)); done; return 1; }
check "no process mentioning this test's log survives either stop" no_survivors_within

# ---- launch.sh wiring: one reader, started where no exit path can skip it --
L=standalone/scripts/launch.sh
line_of() { grep -n -- "$1" "$L" | tail -n 1 | cut -d: -f1; }
START=$(grep -n 'move-loaded-set-reader.sh" "\$LOG"' "$L" | cut -d: -f1)
check "launch.sh starts the reader exactly once" test "$(printf '%s\n' "$START" | grep -c .)" = 1
check "reader starts after the session lock" test "$START" -gt "$(line_of 'flock -n 9')"
check "reader starts after the last refuse call" test "$START" -gt "$(line_of '|| refuse \|  refuse \"')"
check "reader starts before the Move loop" test "$START" -lt "$(line_of 'while :; do')"
check "reader is handed its owner pid and not the lock fd" bash -c "sed -n '${START}p' '$L' | grep -q '\"\\\$\\\$\" 9>&- &'"

[ "$fails" = 0 ] && echo "PASS: launch_move_loaded_set" || { echo "FAIL: launch_move_loaded_set" >&2; exit 1; }
