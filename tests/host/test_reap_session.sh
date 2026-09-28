#!/usr/bin/env bash
# tests/host/test_reap_session.sh — reap-session.sh stops what a dead Move left
# in the dAVEBOx session, and nothing else (2026-09-28).
#
# The device case: JE-8086 forks its emulator from inside Move; when Move exits
# the forks are orphaned, IGNORE/BLOCK SIGTERM and hold the module lock, so stock
# then refuses to load it. Reproduced here with real processes in a real
# session (setsid): an orphan that ignores TERM plus its own child, the
# leader's own child, and a process in ANOTHER session (stock's stand-in).
# Linux only -- it needs /proc and setsid.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: /proc and setsid)"; exit 0; }
command -v setsid >/dev/null || { echo "FAIL: setsid required"; exit 1; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'kill -9 $(cat "$T"/*.pid 2>/dev/null) 2>/dev/null; rm -rf "$T"' EXIT
REAP="$PWD/standalone/scripts/reap-session.sh"
alive() { [ -d "/proc/$1" ] && ! grep -q "^State:.*Z" "/proc/$1/status" 2>/dev/null; }

# Stock's stand-in: its own session.
setsid sh -c 'echo $$ > "$1/outside.pid"; exec sleep 300' _ "$T" &
sleep 0.3

# The dAVEBOx session: the leader, its own child, and an orphaned pair that
# ignores TERM (the orphan forks a child, then its parent exits).
setsid bash -c '
  T="$1"; REAP="$2"
  echo $$ > "$T/leader.pid"
  sleep 300 & echo $! > "$T/own.pid"
  ( sh -c "trap \"\" TERM; sleep 300 & echo \$! > $T/stage.pid; trap \"\" TERM; exec sleep 300" & echo $! > "$T/orphan.pid" )
  sleep 0.5
  echo "$(awk "/^PPid/{print \$2}" /proc/$(cat $T/orphan.pid)/status)" > "$T/orphan.ppid"
  sh "$REAP" $$ > "$T/reap.log" 2>&1
  echo done > "$T/reaped"
  sleep 300
' _ "$T" "$REAP" &
for i in $(seq 1 50); do [ -f "$T/reaped" ] && break; sleep 0.1; done
[ -f "$T/reaped" ] || { bad "the reaper did not finish"; cat "$T/reap.log" 2>/dev/null; }

O=$(cat "$T/orphan.pid"); S=$(cat "$T/stage.pid"); W=$(cat "$T/own.pid"); X=$(cat "$T/outside.pid"); L=$(cat "$T/leader.pid")
[ "$(cat "$T/orphan.ppid")" != "$L" ] && ok "control: the orphan was reparented away from the leader (ppid $(cat "$T/orphan.ppid"))" || bad "control: the orphan still had the leader as parent"
grep -q "KILL" "$T/reap.log" && ok "control: TERM was ignored, so it took KILL (the device case)" || bad "no KILL pass: $(cat "$T/reap.log")"
alive "$O" && bad "the TERM-ignoring orphan survived" || ok "the orphaned fork is gone"
alive "$S" && bad "the orphan's own child survived" || ok "its child (a stage fork) is gone"
alive "$W" && ok "the leader's own child is untouched" || bad "the reaper killed the leader's own child"
alive "$L" && ok "the leader is untouched" || bad "the reaper killed the leader"
alive "$X" && ok "a process in ANOTHER session (stock) is untouched" || bad "the reaper killed a process outside the session"

# Nothing to do: exits 0 and says nothing.
out=$(sh "$REAP" "$X" 2>&1); rc=$?
[ $rc = 0 ] && [ -z "$out" ] && ok "a session with no leftovers: silent, exit 0" || bad "rc=$rc out=$out"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
