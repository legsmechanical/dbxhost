#!/bin/sh
# set-swap.sh — trade the live-set library at the standalone session boundary.
#
# Move has exactly ONE set library (Sets/ below), and its path is not
# configurable — so "the standalone host has its own sets" is implemented by
# swapping the library's CONTENTS at the session edges, with the other side
# stashed in this install's private tree. Native sets are never modified,
# only moved (whole-directory rename on one filesystem: atomic per set).
#
# Verbs:
#   enter    native sets -> native-stash ; library -> Sets/   (session starts)
#   exit     Sets/ -> library ; native-stash -> Sets/         (session ends)
#   recover  drive any interrupted state back to "none"       (crash cleanup)
#   status   print the current swap_state phase
#
# Crash model — intent lives in $STATE_FILE (under /data), progressing
#   none -> entering -> sa-live -> exiting -> none
# and every step is a rename over an inventory, so re-running a verb (or
# `recover`) from ANY phase converges: a set dir is only ever in one of two
# places, and manifest-native.txt records which UUIDs are the user's. Anything
# in Sets/ NOT on that manifest is ours (including projects created
# mid-session, whose UUIDs no manifest could know in advance).
#
# Recovery must work with no session running and no Move running — it is
# called from launch.sh (backstop) and from the blessed davebox-restore
# oneshot at boot (Before=move-launcher.service).
#
# Testability: every path can be overridden by environment so the whole state
# machine runs against fixtures in a tmpdir (tests/host/test_set_swap.sh).
# xattr and Settings.json handling degrade to no-ops when the tools/files are
# absent, so the CORE property (no set is ever lost or duplicated) is testable
# anywhere.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"

SWAP_ROOT="${SWAP_ROOT:-$DBX_DIR/sets}"
LIBRARY="$SWAP_ROOT/library"
NATIVE_STASH="$SWAP_ROOT/native-stash"
STATE_FILE="$SWAP_ROOT/swap_state"
MANIFEST_NATIVE="$SWAP_ROOT/manifest-native.txt"
XATTRS_NATIVE="$SWAP_ROOT/xattrs-native.txt"
XATTRS_LIBRARY="$SWAP_ROOT/xattrs-library.txt"
SA_INDEX_FILE="$SWAP_ROOT/sa_song_index"

log() { printf 'set-swap: %s\n' "$*"; }
die() { printf 'set-swap: ERROR: %s\n' "$*" >&2; exit 1; }

# ---- state ------------------------------------------------------------------

read_phase() {
    [ -f "$STATE_FILE" ] || { echo "none"; return; }
    head -n 1 "$STATE_FILE" 2>/dev/null || echo "none"
}

read_native_index() {
    [ -f "$STATE_FILE" ] || { echo "0"; return; }
    sed -n '2p' "$STATE_FILE" 2>/dev/null | grep -E '^-?[0-9]+$' || echo "0"
}

write_state() { # phase native_index
    mkdir -p "$SWAP_ROOT"
    printf '%s\n%s\n' "$1" "$2" > "$STATE_FILE.tmp"
    mv -f "$STATE_FILE.tmp" "$STATE_FILE"
}

# ---- helpers ----------------------------------------------------------------

# UUID-shaped directory names only — Sets/ can contain other files.
is_uuid() {
    case "$1" in
        [0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]-*-*-*-*) return 0 ;;
        *) return 1 ;;
    esac
}

list_uuid_dirs() { # dir
    [ -d "$1" ] || return 0
    for d in "$1"/*; do
        [ -d "$d" ] || continue
        n="$(basename "$d")"
        is_uuid "$n" && printf '%s\n' "$n"
    done
}

move_uuid_dirs() { # src dst -> prints moved count; skips collisions loudly
    _moved=0
    mkdir -p "$2"
    for _n in $(list_uuid_dirs "$1"); do
        if [ -e "$2/$_n" ]; then
            log "WARNING: $_n exists in both $1 and $2 — leaving in place"
            continue
        fi
        mv "$1/$_n" "$2/$_n"
        _moved=$((_moved + 1))
    done
    printf '%s\n' "$_moved"
}

# Move only dirs (not) listed in a manifest.
move_by_manifest() { # src dst manifest in|out
    _moved=0
    mkdir -p "$2"
    for _n in $(list_uuid_dirs "$1"); do
        _listed=1
        grep -qxF "$_n" "$3" 2>/dev/null || _listed=0
        case "$4" in
            in)  [ "$_listed" = 1 ] || continue ;;
            out) [ "$_listed" = 0 ] || continue ;;
        esac
        if [ -e "$2/$_n" ]; then
            log "WARNING: $_n exists in both $1 and $2 — leaving in place"
            continue
        fi
        mv "$1/$_n" "$2/$_n"
        _moved=$((_moved + 1))
    done
    printf '%s\n' "$_moved"
}

# xattr save/restore: user.song-index drives Move's on-screen ordering.
# ⚠ The device ships NO getfattr/setfattr binaries — the attr must be handled
# through python3 (os.getxattr/os.setxattr, verified on hardware 2026-08-06).
# Degrades to no-op where python3 is missing too; ordering is cosmetic, set
# CONTENT is what must never be lost.
save_xattrs() { # dir outfile
    : > "$2"
    command -v python3 >/dev/null 2>&1 || return 0
    python3 - "$1" "$2" <<'PYEOF' || true
import os, sys
d, out = sys.argv[1], sys.argv[2]
lines = []
if hasattr(os, "getxattr") and os.path.isdir(d):
    for n in sorted(os.listdir(d)):
        p = os.path.join(d, n)
        if not os.path.isdir(p):
            continue
        try:
            v = os.getxattr(p, "user.song-index").decode()
            lines.append("%s\t%s\n" % (n, v))
        except OSError:
            pass
open(out, "w").write("".join(lines))
PYEOF
}

restore_xattrs() { # dir infile
    [ -f "$2" ] || return 0
    command -v python3 >/dev/null 2>&1 || return 0
    python3 - "$1" "$2" <<'PYEOF' || true
import os, sys
d, inf = sys.argv[1], sys.argv[2]
if not hasattr(os, "setxattr"):
    sys.exit(0)
for line in open(inf):
    if "\t" not in line:
        continue
    n, v = line.rstrip("\n").split("\t", 1)
    p = os.path.join(d, n)
    if os.path.isdir(p):
        try:
            os.setxattr(p, "user.song-index", v.encode())
        except OSError:
            pass
PYEOF
}

# currentSongIndex read/write in Settings.json (same in-place edit the host's
# C side performs; degrade to no-op when the file is absent, e.g. in tests).
read_song_index() {
    [ -f "$SETTINGS_JSON" ] || { echo "0"; return; }
    sed -n 's/.*"currentSongIndex":[[:space:]]*\(-\{0,1\}[0-9][0-9]*\).*/\1/p' "$SETTINGS_JSON" | head -n 1
}

write_song_index() { # index
    [ -f "$SETTINGS_JSON" ] || return 0
    _tmp="$SETTINGS_JSON.setswap.tmp"
    sed 's/\("currentSongIndex":[[:space:]]*\)-\{0,1\}[0-9][0-9]*/\1'"$1"'/' \
        "$SETTINGS_JSON" > "$_tmp" && mv -f "$_tmp" "$SETTINGS_JSON"
}

# ---- verbs ------------------------------------------------------------------

do_enter() {
    _phase="$(read_phase)"
    case "$_phase" in
        sa-live)  log "already entered — nothing to do"; return 0 ;;
        none)     : ;;
        *)        die "cannot enter from phase '$_phase' — run recover first" ;;
    esac

    mkdir -p "$LIBRARY" "$NATIVE_STASH"

    _idx="$(read_song_index)"
    [ -n "$_idx" ] || _idx=0
    # Manifest BEFORE the first rename: it is what recovery keys on.
    list_uuid_dirs "$SETS_DIR" > "$MANIFEST_NATIVE"
    write_state "entering" "$_idx"

    save_xattrs "$SETS_DIR" "$XATTRS_NATIVE"
    _stashed="$(move_uuid_dirs "$SETS_DIR" "$NATIVE_STASH")"

    _left="$(list_uuid_dirs "$SETS_DIR" | wc -l | tr -d ' ')"
    [ "$_left" = "0" ] || die "$_left set dirs still in $SETS_DIR after stash"

    _in="$(move_uuid_dirs "$LIBRARY" "$SETS_DIR")"
    restore_xattrs "$SETS_DIR" "$XATTRS_LIBRARY"

    _sa_idx=0
    [ -f "$SA_INDEX_FILE" ] && _sa_idx="$(grep -E '^-?[0-9]+$' "$SA_INDEX_FILE" || echo 0)"
    write_song_index "$_sa_idx"

    write_state "sa-live" "$_idx"
    log "entered: stashed $_stashed native, restored $_in project(s)"
}

do_exit() {
    _phase="$(read_phase)"
    case "$_phase" in
        none)    log "already exited — nothing to do"; return 0 ;;
        sa-live|entering|exiting) : ;;  # all converge via the exit direction
        *)       die "unknown phase '$_phase'" ;;
    esac

    mkdir -p "$LIBRARY" "$NATIVE_STASH"
    _idx="$(read_native_index)"
    write_state "exiting" "$_idx"

    # Preserve the session's project ordering + active project for next time.
    save_xattrs "$SETS_DIR" "$XATTRS_LIBRARY.tmp"
    read_song_index > "$SA_INDEX_FILE.tmp"

    # Everything in Sets/ NOT on the native manifest is ours — including
    # projects created during the session, which no manifest could predict.
    _out="$(move_by_manifest "$SETS_DIR" "$LIBRARY" "$MANIFEST_NATIVE" out)"
    # Only finalize the library snapshot if we actually took the sets out —
    # an exit after a crash in 'entering' has OUR sets in library/ already,
    # and Sets/ holds a partial NATIVE population whose index/xattrs must
    # not overwrite the saved project state.
    if [ "$_out" != "0" ] || [ "$_phase" = "sa-live" ]; then
        mv -f "$XATTRS_LIBRARY.tmp" "$XATTRS_LIBRARY"
        mv -f "$SA_INDEX_FILE.tmp" "$SA_INDEX_FILE"
    else
        rm -f "$XATTRS_LIBRARY.tmp" "$SA_INDEX_FILE.tmp"
    fi

    _back="$(move_uuid_dirs "$NATIVE_STASH" "$SETS_DIR")"
    restore_xattrs "$SETS_DIR" "$XATTRS_NATIVE"
    write_song_index "$_idx"

    write_state "none" "0"
    log "exited: $_out project(s) to library, $_back native set(s) restored"
}

do_recover() {
    _phase="$(read_phase)"
    if [ "$_phase" = "none" ]; then
        log "phase none — nothing to recover"
        return 0
    fi
    log "recovering from phase '$_phase'"
    do_exit
}

# ---- main -------------------------------------------------------------------

case "${1:-}" in
    enter)   do_enter ;;
    exit)    do_exit ;;
    recover) do_recover ;;
    status)  read_phase ;;
    *) die "usage: set-swap.sh enter|exit|recover|status" ;;
esac
