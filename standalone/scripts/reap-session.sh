#!/bin/sh
# reap-session.sh — stop whatever a dead Move left behind in the dAVEBOx session.
#
# Usage: reap-session.sh <session-leader-pid>   (launch.sh passes its own $$)
#
# WHY. A module may FORK worker processes from inside Move. JE-8086 does: its
# emulator runs as a forked process plus two stage forks, holding an flock on
# a lock file for their lifetime, with no parent-death handling. When the
# session's Move exits they are orphaned (reparented to init) and keep the lock,
# so stock -- started next -- refuses to load the module: "JE-8086 is already
# running in another slot (one per device)". Measured 2026-09-28: three such
# processes alive 70 s after the session ended, the lock still in /proc/locks
# under the dead Move's pid, and gone the moment they were stopped.
#
# They carry Move's own name (a fork keeps it; their comm is "Audio Main/SPI"),
# so the launcher's by-NAME sweep cannot see them. What they DO keep is the
# SESSION: the launcher runs under setsid, Move inherits its session, and so
# does every fork. So: everything in the launcher's session that is NOT the
# launcher's own descendant is a leftover -- stock's processes live in another
# session and are never touched.
#
# TERM first, then KILL for whatever ignores it: forks of Move's audio thread
# inherit its signal mask, which BLOCKS SIGTERM (SigBlk 0x4202), so only KILL
# ends them. They are single-threaded orphans, not a running Move; killing them
# raised no crash dialog and no crash report on the device.
#
# Run it only when Move has EXITED: on the session's exit path and on the
# relaunch branch. While Move runs, its forks are its business.
set -u
LEADER="${1:?usage: reap-session.sh <session-leader-pid>}"
PROC="${PROC_DIR:-/proc}"      # tests point this at a fake /proc

# stat fields after the ")" that closes comm (comm may hold spaces):
# state ppid pgrp session ...
stat_of() { s=$(cat "$PROC/$1/stat" 2>/dev/null) || return 1; echo "${s##*) }"; }
ppid_of() { set -- $(stat_of "$1") || return 1; echo "$2"; }
sid_of()  { set -- $(stat_of "$1") || return 1; echo "$4"; }

# Is $1 the leader or one of its descendants (the launcher and its own children,
# including this script)? Walks the parent chain.
ours() {
    p="$1"; n=0
    while [ -n "$p" ] && [ "$p" != 0 ] && [ "$p" != 1 ] && [ $n -lt 64 ]; do
        [ "$p" = "$LEADER" ] && return 0
        p=$(ppid_of "$p") || return 1
        n=$((n + 1))
    done
    return 1
}

leftovers() {
    for d in "$PROC"/[0-9]*; do
        pid=${d##*/}
        [ "$pid" = "$LEADER" ] && continue
        [ "$(sid_of "$pid")" = "$LEADER" ] || continue
        ours "$pid" && continue
        echo "$pid"
    done
}

pids=$(leftovers)
[ -n "$pids" ] || exit 0
for p in $pids; do
    echo "reap-session: leftover pid $p ($(cat "$PROC/$p/comm" 2>/dev/null)) — TERM"
done
kill $pids 2>/dev/null || true
sleep 1
pids=$(leftovers)
[ -n "$pids" ] || exit 0
echo "reap-session: KILL $pids (TERM ignored)"
kill -9 $pids 2>/dev/null || true
exit 0
