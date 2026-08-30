#!/bin/sh
# Reap the DUPLICATE Move that stock's launch-standalone.sh starts when we exit.
#
# WHY THIS EXISTS. A module declaring "standalone": true is run by the stock
# host through launch-standalone.sh, which restarts Move when the binary
# returns. Through 2026-08-16 that restart was guarded ("Move already running --
# skipping restart") and our exit path simply waited for the supervised Move to
# be up so the guard would see it. In stock v1.0.0 (built 2026-08-29) the guard
# is GONE: the tail is an unconditional `nohup /opt/move/Move &`.
#
# We resume move-launcher on the way out, so that second Move is a duplicate:
# unsupervised, and racing the real one for the com.ableton.move D-Bus name.
# Whoever claims it first wins, and when the loser is the supervised Move every
# later saveSongIfDirty comes back NoReply -- an edit made in stock right before
# launching dAVEBOx is then silently not saved.
#
# The stock tree is never modified, so this reaps the duplicate instead.
#
# ⚠ SAFETY RULE: THIS CAN NEVER LEAVE ZERO MOVES RUNNING. It acts only when it
# sees MORE THAN ONE, and it keeps one unconditionally. A cgroup test alone
# would not be safe enough -- the supervised Move sits under
# move-launcher.service on Armbian images, but other images start it from
# /etc/init.d/move, where nothing would match and a cgroup-only rule would kill
# the ONLY Move and strand the device with no UI.
#
# Preference order for the survivor:
#   1. the one under move-launcher.service (definitely the supervised one)
#   2. otherwise the OLDEST by start time (ours came up first; the duplicate is
#      started ~0.5 s after we return)

LOG="${1:-/data/UserData/dbx-host/launch.log}"
DEADLINE="${2:-30}"

log() { printf "%s reap: %s\n" "$(date +%H:%M:%S)" "$*" >> "$LOG" 2>/dev/null; }

starttime() { awk '{print $22}' "/proc/$1/stat" 2>/dev/null || echo 0; }

supervised() {
    grep -q "move-launcher.service" "/proc/$1/cgroup" 2>/dev/null
}

elapsed=0
while [ "$elapsed" -lt "$DEADLINE" ]; do
    pids=$(pidof Move MoveOriginal 2>/dev/null)
    count=0
    for p in $pids; do count=$((count + 1)); done

    if [ "$count" -gt 1 ]; then
        keep=""
        for p in $pids; do
            if supervised "$p"; then keep="$p"; break; fi
        done
        if [ -z "$keep" ]; then
            best=""
            for p in $pids; do
                st=$(starttime "$p")
                if [ -z "$best" ] || [ "$st" -lt "$best_st" ]; then best="$p"; best_st="$st"; fi
            done
            keep="$best"
            log "no supervised Move among $count -- keeping the oldest ($keep)"
        fi
        for p in $pids; do
            [ "$p" = "$keep" ] && continue
            log "killing duplicate Move $p (keeping $keep)"
            kill -9 "$p" 2>/dev/null || true
        done
    fi

    sleep 1
    elapsed=$((elapsed + 1))
done
