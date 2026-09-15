#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The relaunch's intended index (move_intended_index.txt) is a per-Move-start
# question. launch.sh leaves the file in place, so the host must stop
# consulting it after the first verdict of this process — otherwise every later
# in-process switch (the select actuator, no relaunch) is judged against a pad
# nobody asked for and raises PROJECT DID NOT OPEN for nothing.
#
# And when Move falls back onto an EMPTY pad (no set dir for its index) while
# a relaunch pinned a different one, that is an unopened project, not a new
# set materialising — device 2026-09-15: intended 2, Move on 19, a blank
# "__pending-19-1" was published and no dialog appeared.

f="src/host/shadow_set_pages.c"
fail=0
note() { echo "FAIL: $1" >&2; fail=1; }
live() { command grep -Eq "^[[:space:]]*${1}[[:space:]]*\$"; }

reader=$(awk '/^static int loaded_set_read_intended_index\(void\)/,/^}/' "$f")
live "if \(loaded_intended_consumed\) return -1;" <<<"$reader" || \
    note "the intended index is read for the whole process, not once per Move start"

verify=$(awk '/^static void loaded_set_verify_and_publish\(int song_index\)/,/^}/' "$f")
[ "$(command grep -Ec '^[[:space:]]*loaded_intended_consumed = 1;' <<<"$verify")" -ge 2 ] || \
    note "a RESOLVED or UNOPENED verdict does not consume the intended index"

pending=$(awk '/A relaunch asked for pad N but Move sits on an index with NO project/,/Present an immediate blank working state/' "$f")
[ -n "$pending" ] || note "no empty-pad UNOPENED branch ahead of the pending-namespace publish"
command grep -q "loaded_set_index_matches(intended_index, song_index)" <<<"$pending" || \
    note "the empty-pad branch does not compare against the intended index"
command grep -q "loaded_set_unopened_uuid(" <<<"$pending" || \
    note "the empty-pad branch does not publish the unopened placeholder"
live "if \(loaded_unopened_empty_index >= 0 && song_index == loaded_unopened_empty_index\) return;" <<<"$pending" || \
    note "the empty-pad verdict is not held across re-polls (the next poll would publish a blank New Set)"

[ "$fail" -eq 0 ] || exit 1
echo "PASS: intended index consulted once per Move start; empty-pad fallback raises UNOPENED and holds"
