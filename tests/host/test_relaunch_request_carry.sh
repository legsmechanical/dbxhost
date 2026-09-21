#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

# A REQUEST MUST SURVIVE THE MOVE RESTART THAT ITS ROUTE DEPENDS ON.
#
# Device, 2026-09-21: a project created this session bounced back to the
# picker on its FIRST load, every time. Move opened exactly the right project;
# nothing confirmed it. The request dAVEBOx wrote was consumed by the STILL
# LIVE shim ~1.4 s after the pick, about a second before the relaunch tore that
# shim down, so the next session armed nothing and could never answer "did Move
# open what we asked for".
#
# The carry is launch.sh's `install_relaunch_request`, and this test RUNS it
# rather than pinning that it exists — extracted, eval'd, and driven over real
# files in a temp dir. The two things that make it correct are behavioural and
# both checked here: the record arrives intact, and it arrives with the counter
# it is measured against (`0`).
#
# ⚠ Why `0` and not a sampled value: the same loop iteration deletes
# move_loaded_set.txt before starting Move, and the reader takes its counter
# FROM that file, so this run's first load is always 1. Sampling here would
# read the PREVIOUS run's number and judge the new line stale forever. The
# ordering pin at the bottom is what keeps that argument true.

fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fail=1; }

L=standalone/scripts/launch.sh
echo "the request is carried across the relaunch:"

# ── extract and run the real function ───────────────────────────────────────
# ⚠ Capture, then match. `producer | grep -q` under pipefail is a race: grep
# exits on the first match, the producer takes SIGPIPE, and the pipeline fails
# — so the check reports the very defect it was hunting, at random.
body="$(awk '/^  install_relaunch_request\(\) \{/,/^  \}/' "$L")"
case "$body" in
    "") bad "install_relaunch_request not found in launch.sh — nothing carries the request"
        echo "PARTIAL: the subject is missing, later checks cannot mean anything" >&2
        exit 1 ;;
    *)  ok "install_relaunch_request found and extracted" ;;
esac

# ⚠ The whole launcher body is ONE single-quoted `bash -c` argument, so an
# apostrophe anywhere in it — comments included — ends the quoting and breaks
# the launch. Cheap to check, expensive to discover on device.
case "$body" in
    *"'"*) bad "the function body contains an apostrophe — it would break the single-quoted launcher body" ;;
    *)     ok "no apostrophe in the body (the launcher is one single-quoted bash -c)" ;;
esac

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
DBX_DIR="$T"
eval "$body"

SLOT="5107b000-0000-4000-8000-000000000001"

# ── 1. the carry itself ─────────────────────────────────────────────────────
# dAVEBOx's exact bytes: uuid \n index \n name \n
printf '%s\n1\nProject 8\n' "$SLOT" > "$T/relaunch_request.txt"
# a stale request from the session that is dying — it must NOT win
printf 'STALE\n9\nSomething Else\n' > "$T/intended_set.txt"

out="$(install_relaunch_request 2>&1)"

expected="$(printf '%s\n1\nProject 8\n0' "$SLOT")"
actual="$(cat "$T/intended_set.txt" 2>/dev/null || true)"
if [ "$actual" = "$expected" ]; then
    ok "the next session's request is the carried record, plus an explicit n0 of 0"
else
    bad "the installed record is wrong"
    echo "    expected: $(printf '%s' "$expected" | tr '\n' '|')" >&2
    echo "    actual:   $(printf '%s' "$actual" | tr '\n' '|')" >&2
fi

[ -f "$T/relaunch_request.txt" ] \
    && bad "relaunch_request.txt was left behind — it would be carried again next relaunch" \
    || ok "the carried record is consumed, so it cannot be re-installed later"

case "$out" in
    *"installed relaunch request"*) ok "the carry announces itself in the launch log" ;;
    *) bad "the carry is silent — a failure here is invisible in launch.log" ;;
esac

# ── 2. no request: the stale one must still be cleared ──────────────────────
# A relaunch nobody asked for a project for (the select-hook rewiring a set)
# must leave NO request, so the machine treats whatever Move opens as what is
# open. A leftover would name a project nobody asked for this time.
printf 'STALE\n9\nSomething Else\n' > "$T/intended_set.txt"
rm -f "$T/relaunch_request.txt"
install_relaunch_request >/dev/null 2>&1
[ -f "$T/intended_set.txt" ] \
    && bad "a stale request survived a relaunch that asked for nothing" \
    || ok "with nothing to carry, the stale request is cleared rather than inherited"

# ── 3. ORDERING, which is what makes the explicit 0 true ────────────────────
echo "the ordering the explicit n0 depends on:"

line_of() { grep -n "$1" "$L" | sed -n "${2:-1}p" | cut -d: -f1; }

call=$(line_of '^      install_relaunch_request$')
# ⚠ THE SWEEP IN *THIS* BLOCK, not the last one in the file. launch.sh has two
# `kill -9` sweeps — the relaunch block's and the session-exit one — and taking
# the last match picked the exit sweep, which sits AFTER the call and made this
# check fail against correct code. A check that cries wolf gets switched off.
kill9=$(grep -n 'kill -9 \$pids' "$L" | cut -d: -f1 \
        | awk -v c="${call:-0}" '$1 < c { last = $1 } END { if (last) print last }')
announce=$(line_of 'relaunch requested — restarting Move within the session')
if [ -n "$call" ] && [ -n "$kill9" ] && [ -n "$announce" ] \
   && [ "$call" -gt "$kill9" ] && [ "$call" -lt "$announce" ]; then
    ok "the carry runs AFTER the kill sweeps (no shim alive to eat it) and before the restart"
else
    bad "the carry is misplaced (call=$call kill9=$kill9 announce=$announce) — a live shim could consume it again"
fi

loop=$(line_of 'while :; do')
clear=$(line_of 'rm -f "\$DBX_DIR/move_loaded_set.txt"')
start=$(line_of 'env LD_PRELOAD=davebox-shim.so')
if [ -n "$loop" ] && [ -n "$clear" ] && [ -n "$start" ] \
   && [ "$clear" -gt "$loop" ] && [ "$clear" -lt "$start" ]; then
    ok "the reader's counter is cleared inside the loop, before Move starts — so 0 is exact"
else
    bad "the counter clear moved (loop=$loop clear=$clear start=$start) — the explicit n0 of 0 is no longer justified"
fi

# ⚠ CONTROL: the line_of patterns must be capable of matching nothing, or the
# checks above would pass on an empty file. Prove one of them can fail.
if [ -z "$(line_of 'this_string_is_not_in_launch_sh_xyzzy')" ]; then
    ok "control: the line matcher returns empty for a line that is not there"
else
    bad "control: the line matcher matches anything — the ordering checks are vacuous"
fi

[ "$fail" = 0 ] && echo "PASS: the request survives the restart, with the counter that makes it confirmable"
exit "$fail"
