#!/usr/bin/env bash
# The SA module installer never opens with SIGKILL.
#
# A SIGKILL'd Move reads as a crash: Ableton files a report and the survivor
# shows "Move crashed". install_sound.sh's restart used `pkill -9` on every
# process, MoveOriginal included, as its FIRST signal. It must TERM, wait, and
# only then escalate.
set -u
cd "$(dirname "$0")/.." || exit 2
f=scripts/install_sound.sh
[ -f "$f" ] || { echo "FAIL: $f is missing" >&2; exit 1; }
fail=0
if grep -nE 'pkill +-9|kill +-9|pkill +-s +(9|KILL)' "$f" | grep -v '^[0-9]*: *#' >/dev/null; then
    echo "FAIL: $f sends SIGKILL with no TERM first:" >&2
    grep -nE 'pkill +-9|kill +-9' "$f" | grep -v '^[0-9]*: *#' >&2
    fail=1
fi
term="$(grep -n 'pkill -TERM' "$f" | head -1 | cut -d: -f1)"
kill="$(grep -n 'pkill -KILL' "$f" | head -1 | cut -d: -f1)"
if [ -z "$term" ]; then echo "FAIL: $f never sends TERM" >&2; fail=1
elif [ -n "$kill" ] && [ "$kill" -le "$term" ]; then echo "FAIL: $f escalates to KILL before TERM" >&2; fail=1; fi
# The escalation is conditional on the process still being alive.
if [ -n "$kill" ] && ! sed -n "$((kill-3)),${kill}p" "$f" | grep -q 'pidof'; then
    echo "FAIL: $f KILLs unconditionally (no liveness check before it)" >&2; fail=1
fi
[ $fail -eq 0 ] && echo "PASS: install_sound.sh TERMs before it KILLs"
exit $fail
