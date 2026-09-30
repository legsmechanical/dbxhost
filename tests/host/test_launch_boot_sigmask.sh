#!/usr/bin/env bash
# tests/host/test_launch_boot_sigmask.sh — a boot-door session could not quit.
#
# MoveLauncher runs with TERM blocked, and a blocked mask survives fork and
# exec, so at the boot door every process the launcher started inherited it.
# Quitting sent the move_loaded_set reader a TERM it could never act on, then
# waited for it without a limit: on a stock Move (AbletonOS v4.1, 2026-09-30)
# the quit hung on "dAVEBOx exiting" until the reader was killed by hand.
#
# Both halves run for real, extracted from launch.sh:
#   1. the preamble clears an inherited TERM block, keeps the pid (MoveLauncher
#      supervises it), restores SIGPIPE (python ignores it, and that survives
#      exec) and leaks no marker variable into what it runs;
#   2. the reader stop is bounded: a reader that never acts on TERM is killed,
#      with its pipeline, and the quit carries on.
# Linux only: the mask is read from /proc.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: signal masks are read from /proc)"; exit 0; }
command -v python3 >/dev/null || { echo "FAIL: python3 missing (the preamble under test needs it)"; exit 1; }
LAUNCH=standalone/scripts/launch.sh
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

# Run argv with TERM blocked, as MoveLauncher starts its children.
cat > "$T/blocked" <<'PY'
import os, signal, sys
signal.pthread_sigmask(signal.SIG_BLOCK, [signal.SIGTERM])
os.execvp(sys.argv[1], sys.argv[1:])
PY
mask_of() { sed -n "s/^$2:[[:space:]]*//p" "/proc/$1/status"; }
bit_set() { [ $(( 0x$1 & (1 << $2) )) -ne 0 ]; }   # mask, bit (signal - 1)

echo "the preamble:"
awk '/^# ⚠ AN INHERITED SIGNAL MASK/,/^unset DBX_SIGMASK_CLEARED$/' "$LAUNCH" > "$T/preamble"
grep -q '^unset DBX_SIGMASK_CLEARED$' "$T/preamble" && [ "$(wc -l < "$T/preamble")" -gt 10 ] \
    || { echo "FAIL: preamble not found in $LAUNCH"; exit 1; }
{
    echo '#!/bin/bash'
    echo 'echo "before $$" >> "$OUT"'
    cat "$T/preamble"
    echo 'echo "after $$ $(sed -n "s/^SigBlk:[[:space:]]*//p" /proc/$$/status) $(sed -n "s/^SigIgn:[[:space:]]*//p" /proc/$$/status) marker=${DBX_SIGMASK_CLEARED:-none}" >> "$OUT"'
    echo 'env | grep -q "^DBX_SIGMASK_CLEARED=" && echo "env-leak" >> "$OUT"; exit 0'
} > "$T/entry"; chmod +x "$T/entry"

# Control: the harness really does start it with TERM blocked.
python3 "$T/blocked" bash -c 'sed -n "s/^SigBlk:[[:space:]]*//p" /proc/$$/status' > "$T/ctl"
bit_set "$(cat "$T/ctl")" 14 && ok "control: the harness blocks TERM (SigBlk $(cat "$T/ctl"))" || bad "control: TERM not blocked ($(cat "$T/ctl"))"

OUT="$T/out" python3 "$T/blocked" "$T/entry" --boot
# "before" prints twice when the preamble re-executes the script: once per pass.
before="$(awk '/^before/{print $2; exit}' "$T/out")"
[ "$(grep -c '^before' "$T/out")" = 2 ] && ok "a blocked start re-executes once" || bad "passes: $(grep -c '^before' "$T/out")"; read -r _ after blk ign marker < <(grep '^after' "$T/out")
[ -n "$before" ] && [ "$before" = "$after" ] && ok "same pid across the clearing ($before)" || bad "pid changed: $before -> $after"
[ -n "${blk:-}" ] && ! bit_set "$blk" 14 && ok "TERM is no longer blocked (SigBlk $blk)" || bad "TERM still blocked (SigBlk ${blk:-?})"
[ -n "${ign:-}" ] && ! bit_set "$ign" 12 && ok "SIGPIPE is not left ignored (SigIgn $ign)" || bad "SIGPIPE ignored (SigIgn ${ign:-?})"
[ "${marker:-}" = marker=none ] && ! grep -q env-leak "$T/out" && ok "no marker variable is left for what it runs" || bad "marker leaked: ${marker:-?} $(grep env-leak "$T/out")"

: > "$T/out"
OUT="$T/out" "$T/entry" --boot
[ "$(grep -c '^before' "$T/out")" = 1 ] && grep -q '^after' "$T/out" && ok "an unblocked start runs straight through" || bad "unblocked start: $(cat "$T/out")"

echo "the reader stop:"
awk '/# ⚠ BOUNDED\. A reader that never acts on TERM/{f=1} f{print} f&&/^  fi$/{exit}' "$LAUNCH" > "$T/stop"
grep -q 'kill -9 "\$_mlsr_pid"' "$T/stop" || { echo "FAIL: reader stop block not found in $LAUNCH"; exit 1; }

# A reader shaped like the real one (a pipeline in the background, a sleep
# loop in front), started with TERM blocked.
python3 "$T/blocked" bash -c 'tail -n 0 -F /dev/null | while read -r l; do :; done & while :; do sleep 1; done' &
_mlsr_pid=$!
sleep 0.5
kids="$(pgrep -P "$_mlsr_pid" | tr '\n' ' ')"
[ -n "$kids" ] && ok "control: the reader has its pipeline ($kids)" || bad "control: no pipeline under the reader"
t0=$(date +%s)
source "$T/stop" > "$T/stop.out" 2>&1
dt=$(( $(date +%s) - t0 ))
[ "$dt" -le 5 ] && ok "the stop returns (${dt}s)" || bad "the stop took ${dt}s"
! kill -0 "$_mlsr_pid" 2>/dev/null && ok "the reader is gone" || bad "the reader survived"
left=""; for k in $kids; do kill -0 "$k" 2>/dev/null && left="$left $k"; done
sleep 0.2; pgrep -f 'tail -n 0 -F /dev/null' >/dev/null && left="$left tail"
[ -z "$left" ] && ok "its pipeline is gone too" || { bad "left behind:$left"; pkill -9 -f 'tail -n 0 -F /dev/null'; }
grep -q 'ignored TERM' "$T/stop.out" && ok "and it says so" || bad "no log line: $(cat "$T/stop.out")"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
