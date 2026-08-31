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
# ⚠⚠ SIGTERM, NEVER SIGKILL AS THE FIRST MOVE. A hard kill is indistinguishable
# from a crash: Ableton's crash handler files a report and the surviving Move
# comes up on "Move crashed / press wheel to continue". Observed on hardware
# 2026-08-30 -- the OLED then alternated rapidly between that dialog and the
# native set display, because the dialog and the live Move were both drawing.
# The duplicate is an ordinary process being asked to go away, so ask nicely and
# only escalate if it refuses.
#
# ⚠ AND ACT FAST. The same run killed a duplicate SIX SECONDS in, by which point
# it had registered its D-Bus services and started loading a set -- so even a
# clean shutdown is disruptive. Poll hard, and take it out while it is still
# starting up rather than after it has taken the surface.
#
# Preference order for the survivor:
#   1. the one under move-launcher.service (definitely the supervised one)
#   2. otherwise the OLDEST by start time (ours came up first; the duplicate is
#      started ~0.5 s after we return)

LOG="${1:-/data/UserData/dbx-host/launch.log}"
DEADLINE="${2:-150}"   # iterations, not seconds -- see INTERVAL
INTERVAL=0.2

log() { printf "%s reap: %s\n" "$(date +%H:%M:%S)" "$*" >> "$LOG" 2>/dev/null; }

starttime() { awk '{print $22}' "/proc/$1/stat" 2>/dev/null || echo 0; }

supervised() {
    grep -q "move-launcher.service" "/proc/$1/cgroup" 2>/dev/null
}

ppid_of() { awk '{print $4}' "/proc/$1/stat" 2>/dev/null || echo 0; }

# ⚠⚠ A MOVE'S OWN CHILD IS NOT A SECOND MOVE, and counting it as one is how this
# script came to kill the running instrument.
#
# Observed on device 2026-08-31: a healthy stack shows TWO MoveOriginal pids —
# the application (21 threads) and a forked helper of its own (2 threads, the
# parent's fds inherited, SPI among them). BOTH sit in move-launcher.service's
# cgroup, so supervised() cannot tell them apart: whichever `pidof` happened to
# list first was kept and the other was killed. When that was the application,
# the supervisor restarted it, this loop saw two again, and killed again —
# 6819 -> 6906 -> 6964 -> 7048 -> 7201 in thirteen seconds, escalating to
# SIGKILL. ⚠ And a force-killed Move READS AS A CRASH: Ableton files a report
# and the next boot tells the user Move crashed
# ([[sigkill-on-move-reads-as-a-crash]]). Reported as "move native crashes
# shortly after reloading from davebox exit".
#
# So an INSTANCE is a Move whose parent is not itself a Move. Descendants belong
# to the instance above them and are never candidates.
instances() {
    _all="$1"
    for _p in $_all; do
        _pp=$(ppid_of "$_p")
        _child=0
        for _q in $_all; do
            [ "$_q" = "$_p" ] && continue
            [ "$_pp" = "$_q" ] && { _child=1; break; }
        done
        [ "$_child" = "0" ] && printf '%s ' "$_p"
    done
}

elapsed=0
while [ "$elapsed" -lt "$DEADLINE" ]; do
    pids=$(instances "$(pidof Move MoveOriginal 2>/dev/null)")
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
            log "asking duplicate Move $p to exit (keeping $keep)"
            kill -TERM "$p" 2>/dev/null || true
            # Give it a moment to go on its own. Escalating immediately would be
            # the same hard kill under a different name.
            waited=0
            while [ "$waited" -lt 20 ] && [ -d "/proc/$p" ]; do
                sleep 0.1
                waited=$((waited + 1))
            done
            if [ -d "/proc/$p" ]; then
                log "duplicate Move $p ignored SIGTERM after 2s -- forcing"
                kill -9 "$p" 2>/dev/null || true
            fi
        done
    fi

    # Poll hard: the duplicate is started ~0.5 s after we return and the goal is
    # to catch it before it opens the display, not after.
    sleep "$INTERVAL"
    elapsed=$((elapsed + 1))
done
