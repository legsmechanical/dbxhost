#!/bin/sh
# move-loaded-set-reader.sh — background tail of launch.log, distilling
# MoveOriginal's own "About to load ..." boot line into a small state file
# that says what Move actually opened.
#
# Started by launch.sh (once per session, immediately before the Move
# supervisor loop — after the session lock and every refusal path) as:
#   sh "$DBX_DIR/scripts/move-loaded-set-reader.sh" "$LOG" "$DBX_DIR/move_loaded_set.txt" "$$" 9>&- &
#
# ⚠ It never touches MoveOriginal's own stdio. launch.sh's
# `exec >>"$LOG" 2>&1` already sends Move's stdout/stderr straight into
# <logfile>, unpiped — MoveOriginal is run in the foreground exactly as
# before. This script is a SEPARATE process that tails that same growing
# file after the fact, so if it lags, stalls, or is killed outright,
# MoveOriginal's own exit status and pid are completely unaffected; only
# new writes to <outfile> stop happening.
#
# ---- LIFECYCLE — it must never outlive the session ------------------------
# The session ends by EXEC-ing onward to stock Schwung (boot door) or by
# exiting (tools door). Neither kills background children, and a `tail -F`
# pipeline does NOT die with the shell that started it: killing only this
# script's pid orphans `tail` and the while-loop, which then write into
# dbx-host/ forever and add one more copy per session. So:
#   * <owner-pid> is the supervisor. The main shell polls it; when it is gone
#     the reader tears its whole process tree down and exits (≤ 1 s).
#   * SIGTERM/INT/HUP do the same teardown, so launch.sh's explicit kill on
#     the exit path is also a full stop, not a half one.
#   * the tree is walked with pgrep -P (not a process-group kill): this
#     script shares launch.sh's process group, and a group kill would take
#     Move with it.
#
# ---- <outfile> contract — read this before writing a consumer (S4) -------
#   - one line: either the uuid parsed out of a Sets/<uuid>/... path, or the
#     literal string `default`.
#   - written ATOMICALLY: a temp file beside <outfile>, then `mv -f` — a
#     reader of <outfile> never observes a half-written value.
#   - <outfile> MAY NOT EXIST. Absence means "nothing logged an `About to
#     load` line since this reader last started" and MUST NOT be read as
#     `default` — that is a real, positive statement that Move made its own
#     set rather than opening the one we asked for.
#   - the caller (launch.sh) removes <outfile> immediately before each Move
#     start (first boot AND every relaunch), so a value left over from a
#     previous launch is never mistaken for the current one.
#
# ---- <outfile>'s sibling, move_loaded_history.txt — every load, not just
# the last one (S9) ----------------------------------------------------------
#   - lives beside <outfile> (same dir), named `move_loaded_history.txt`.
#   - one line per "About to load" seen since the last clear:
#     `<ISO-8601 UTC time> <uuid|default>`, oldest first, capped at 50 lines.
#   - cleared by the caller alongside <outfile>, at each Move start — same
#     lifecycle, so it never mixes loads from two different Move processes.
#   - purely diagnostic (S4's policy only ever reads <outfile>): it exists so
#     a flapping boot (Move rejects the requested set, tries again, lands on
#     a fallback) is visible after the fact instead of only in the single
#     last-load line <outfile> keeps by contract.
#   - when a Move start logs MORE THAN ONE load, each load past the first
#     also gets a line in $LOGFILE itself:
#       `move-loaded-set: Move fell back: <first> -> <this one>`
#     so the flap shows up in the same log a human already tails.
#
# Usage: move-loaded-set-reader.sh <logfile> <outfile> <owner-pid>
set -eu

LOGFILE="$1"
OUTFILE="$2"
OWNER="$3"
HISTFILE="$(dirname "$OUTFILE")/move_loaded_history.txt"

# Write <val> ("default" or a uuid) as the new answer, append it to the
# history, and — when it is not the first load recorded since the last
# clear — log the fallback to $LOGFILE.
write_loaded() {
    _val="$1"
    _tmp="$OUTFILE.tmp.$$"
    printf '%s\n' "$_val" > "$_tmp" && mv -f "$_tmp" "$OUTFILE"

    _first=""
    if [ -s "$HISTFILE" ]; then
        _first=$(head -n 1 "$HISTFILE" | awk '{print $2}')
    fi

    _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _htmp="$HISTFILE.tmp.$$"
    { [ -s "$HISTFILE" ] && cat "$HISTFILE"; printf '%s %s\n' "$_ts" "$_val"; } \
        | tail -n 50 > "$_htmp" && mv -f "$_htmp" "$HISTFILE"

    if [ -n "$_first" ]; then
        printf 'move-loaded-set: Move fell back: %s -> %s\n' "$_first" "$_val" >> "$LOGFILE"
    fi
}

killtree() { # kill every descendant of $1, deepest first
    for _c in $(pgrep -P "$1" 2>/dev/null || true); do
        killtree "$_c"
        kill "$_c" 2>/dev/null || true
    done
}
stop() { trap - TERM INT HUP; killtree $$; exit 0; }
trap stop TERM INT HUP

# -n 0: start at the CURRENT end of the file, never replay old content.
# launch.log is appended across the whole device lifetime (`>>`), so without
# this a restart of this reader would re-parse "About to load" lines from
# every earlier session and could resurrect a stale uuid or a stale `default`.
tail -n 0 -F "$LOGFILE" 2>/dev/null | while IFS= read -r line; do
    case "$line" in
        *"About to load default song"*)
            write_loaded "default"
            ;;
        *"About to load "*)
            uuid=$(printf '%s\n' "$line" \
                | grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' \
                | head -n 1)
            [ -n "$uuid" ] || continue
            write_loaded "$uuid"
            ;;
        *) ;;
    esac
done &

# The main shell only supervises. `sleep` is a foreground child, so a trapped
# signal is handled within a second.
while kill -0 "$OWNER" 2>/dev/null; do
    sleep 1
done
stop
