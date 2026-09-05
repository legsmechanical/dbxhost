#!/bin/sh
# set-swap.sh — present this install's project library at the standalone session
# boundary, and put the user's own library back afterwards.
#
# Move has exactly ONE set library (Sets/ below) and its path is not
# configurable, so "the standalone host has its own sets" means making Sets/
# show a different population for the duration of a session.
#
# ⭑⭑ HOW: a BIND MOUNT of $LIBRARY over $SETS_DIR. Nothing on disk moves. The
# user's native sets sit underneath the mount, untouched and not even visible,
# and reappear the instant it is undone.
#
# This replaced a rename-based swap on 2026-08-12 (Phase A of the
# state-co-location plan). The old scheme physically rename()d every set dir out
# of Sets/ into a stash and every project dir in — per session edge, for every
# set — which needed a manifest of which UUIDs were the user's, an xattr
# save/restore dance (renaming preserves xattrs, but the bookkeeping did not),
# and a five-phase crash-recovery state machine because a crash could leave the
# library HALF MOVED. A mount has no half state: it is either applied or it is
# not, applying it is one atomic call, and **a reboot clears every mount
# unconditionally** — so the crash outcome is "the user's real sets are back",
# which is the outcome you would have chosen anyway.
#
# Verbs:
#   enter    bind $LIBRARY over Sets/   (session starts)
#   exit     unbind                     (session ends)
#   recover  drive any state back to "not mounted"  (crash cleanup)
#   status   print the current phase
#
# ⚠ mount(2) is privileged and the launcher runs as `ableton`, so the mount and
# unmount are performed by davebox-heal (setuid-root), which hardcodes BOTH
# paths and accepts no argument that could steer them. See its header.
#
# What still needs bookkeeping: Move's `currentSongIndex`. It names a position
# in whichever library is mounted, so the native value must be remembered across
# the session and the session's own value remembered for next time. That is all
# $STATE_FILE and $SA_INDEX_FILE are for now.
#
# ⚠ xattrs (user.song-index, user.song-color, Move's own) need NO handling at
# all any more: they live on the set dirs, and no set dir is touched.
#
# Recovery must work with no session running and no Move running — it is called
# from launch.sh (backstop) and from the blessed davebox-restore oneshot at boot
# (Before=move-launcher.service).
#
# Testability: every path and the mount helper itself can be overridden by
# environment, so the whole state machine runs against fixtures in a tmpdir with
# a stub helper (tests/host/test_set_swap.sh). Settings.json handling degrades
# to a no-op when the file is absent.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"

SWAP_ROOT="${SWAP_ROOT:-$DBX_DIR/sets}"
LIBRARY="$SWAP_ROOT/library"
STATE_FILE="$SWAP_ROOT/swap_state"
SA_INDEX_FILE="$SWAP_ROOT/sa_song_index"
ACTIVE_SET_PATH="${ACTIVE_SET_PATH:-$DBX_DIR/active_set.txt}"

# The privileged helper. Overridable ONLY so the tests can inject a stub — on
# device this is the setuid binary and nothing else.
HEAL_BIN="${HEAL_BIN:-/data/UserData/schwung/modules/tools/davebox-sa/bin/heal}"   # the blessed helper lives in the launcher module (2026-09-05)

# Legacy drain (see do_exit): the pre-mount scheme's stash. Sets found here are
# the user's, left behind by a session that entered under the old code.
NATIVE_STASH="$SWAP_ROOT/native-stash"

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

# ---- the mount ---------------------------------------------------------------

# TRUTH, as opposed to intent: is our library the thing Sets/ currently shows?
# A bind mount makes the two paths the same inode, which is exactly what this
# compares. ⚠ Deliberately NOT `mountpoint` or /proc/mounts parsing: this asks
# the question we actually care about ("is OUR library there"), and it answers
# correctly even for a stacked or lazily-detached mount.
sets_are_ours() {
    python3 - "$SETS_DIR" "$LIBRARY" <<'PYEOF' 2>/dev/null || return 1
import os, sys
try:
    a, b = os.stat(sys.argv[1]), os.stat(sys.argv[2])
except OSError:
    sys.exit(1)
sys.exit(0 if (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino) else 1)
PYEOF
}

heal_mount()  { "$HEAL_BIN" --mount-sets; }
heal_umount() { "$HEAL_BIN" --umount-sets; }

# ---- currentSongIndex --------------------------------------------------------
# (same in-place edit the host's C side performs; no-op when the file is absent)

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

# ---- which project the SESSION is actually on --------------------------------
#
# ⚠⚠ NOT currentSongIndex. Move writes that field only at a RELAUNCH, and the
# module deliberately does not write it mid-session (Move is alive and its
# in-memory copy would clobber ours — project-cmd.sh says so at its own write
# site). So inside a session it names the project you STARTED on, and reading it
# at exit is what made "the same set loads regardless of what I was in on exit":
# do_exit filed the STARTING index as the session's position and do_enter
# faithfully restored it next launch. Every project switch made in between was
# thrown away right here.
#
# So ask the WRITER, not a mirror. The module autosaves the LIVE project
# continuously, so the newest per-project state file names it — seconds old
# against many minutes for every other project. Two fallbacks behind it, each
# checked for existence rather than trusted:
#   1. the autosave mtime (the writer)
#   2. active_set.txt (a mirror, but written on every set change — it has been
#      measured naming a uuid with NO set dir, hence the existence check)
#   3. nothing: the caller keeps currentSongIndex, which is today's behaviour and
#      is right in the one case it can be, a session that never switched project.
#
# Prints the index, or nothing if no source could answer.
session_song_index() {
    python3 - "$SETS_DIR" "$ACTIVE_SET_PATH" <<'SESSIDX_PY' 2>/dev/null
import os, sys, glob

sets_dir, active_set_path = sys.argv[1], sys.argv[2]


def index_of(uuid):
    if not uuid:
        return None
    try:
        return int(os.getxattr(os.path.join(sets_dir, uuid),
                               "user.song-index").decode())
    except (OSError, ValueError):
        return None


def newest_autosave_uuid():
    """The project the module is writing IS the project that is loaded."""
    best, best_t = None, None
    for path in glob.glob(os.path.join(sets_dir, "*", "dAVEBOx", "seq8sa-state.json")):
        try:
            t = os.stat(path).st_mtime
        except OSError:
            continue
        if best_t is None or t > best_t:
            best, best_t = path, t
    if best is None:
        return ""
    return os.path.basename(os.path.dirname(os.path.dirname(best)))


def active_set_uuid():
    try:
        with open(active_set_path) as f:
            return f.readline().strip()
    except OSError:
        return ""


for candidate in (newest_autosave_uuid(), active_set_uuid()):
    i = index_of(candidate)
    if i is not None and i >= 0:
        print(i)
        break
SESSIDX_PY
}

# ---- verbs ------------------------------------------------------------------

# The library carries a notice for every file surface we cannot filter.
#
# Inside a session the on-device browsers hide these folders (the shared
# filepath browser does it for every module, including the stock file browser,
# via the loader import rewrite). What that cannot reach: the file browser own
# copy/move destination picker, schwung-manager on port 7700, the optional
# third-party filebrowser, and anything mounting the device over the network.
# Those are either not our code or not our tree, so the answer there is to SAY
# so, in the folder, where somebody about to drag a project into the bin will
# see it.
#
# Written on every enter so it repairs itself, and written into OUR library
# only — the user native sets never carry it.
write_library_notice() {
    cat > "$LIBRARY/DO-NOT-EDIT.txt" <<'NOTICE'
DO NOT EDIT THIS FOLDER
=======================

These folders are dAVEBOx projects. While dAVEBOx is running they are also the
set library it is playing from, and one of them is open right now.

Nothing in here needs managing by hand. Create, rename, copy and delete
projects from dAVEBOx itself — hold a pad in the project picker.

If you rename, move or delete a folder here from a file browser, a network
share, or the web file manager on port 7700, dAVEBOx does not find out. It
keeps writing to the project it had open, and the next time you load that
project it opens BLANK. There is no undo and no recovery: dAVEBOx does not try
to guess where a folder came from, which is what stops it from ever attaching
your work to the wrong project.

This folder is only visible while a dAVEBOx session is running. Your own Move
sets are somewhere else entirely, untouched, and come back the moment you exit
to Move.
NOTICE
}

do_enter() {
    if sets_are_ours; then
        log "already entered — nothing to do"
        return 0
    fi

    mkdir -p "$LIBRARY"
    write_library_notice

    # Remember where the USER was in their own library, before we cover it.
    _idx="$(read_song_index)"
    [ -n "$_idx" ] || _idx=0
    write_state "entering" "$_idx"

    heal_mount || die "bind mount failed"
    sets_are_ours || die "bind reported success but Sets/ is not our library"

    # Restore the session's own last position.
    _sa_idx=0
    [ -f "$SA_INDEX_FILE" ] && _sa_idx="$(grep -E '^-?[0-9]+$' "$SA_INDEX_FILE" || echo 0)"
    write_song_index "$_sa_idx"

    write_state "sa-live" "$_idx"
    log "entered: library bound over Sets/ (native index $_idx, session index $_sa_idx)"
}

do_exit() {
    _phase="$(read_phase)"
    _idx="$(read_native_index)"

    # Save the session's position for next time — but only while OUR library is
    # the one on screen, or we would record a position in the user's library.
    # ⭑ From the WRITER (session_song_index), never from currentSongIndex, which
    # is stale inside a session; that field is only the last fallback now.
    if sets_are_ours; then
        _sess="$(session_song_index || true)"
        [ -n "$_sess" ] || _sess="$(read_song_index)"
        [ -n "$_sess" ] || _sess=0
        printf '%s\n' "$_sess" > "$SA_INDEX_FILE.tmp" &&
            mv -f "$SA_INDEX_FILE.tmp" "$SA_INDEX_FILE"
        log "session position recorded: index $_sess"
    fi

    write_state "exiting" "$_idx"
    heal_umount || die "unbind failed"
    if sets_are_ours; then
        die "unbind reported success but Sets/ is still our library"
    fi

    # ⚠ LEGACY DRAIN — one-time, for a device whose last session entered under
    # the RENAME scheme. Its native sets are sitting in the old stash and would
    # otherwise stay invisible forever, because nothing else moves them back.
    # Harmless once the stash is gone (which it will be, permanently, after the
    # first exit on this build).
    if [ -d "$NATIVE_STASH" ]; then
        _back=0
        for _d in "$NATIVE_STASH"/*; do
            [ -d "$_d" ] || continue
            _n="$(basename "$_d")"
            if [ -e "$SETS_DIR/$_n" ]; then
                log "WARNING: $_n exists in both the stash and Sets/ — leaving it stashed"
                continue
            fi
            mv "$_d" "$SETS_DIR/$_n" && _back=$((_back + 1))
        done
        rmdir "$NATIVE_STASH" 2>/dev/null || true
        [ "$_back" = 0 ] || log "legacy drain: restored $_back native set(s) from the old stash"
    fi

    write_song_index "$_idx"
    write_state "none" "0"
    log "exited: Sets/ is the user's library again (index $_idx, was phase '$_phase')"
}

do_recover() {
    _phase="$(read_phase)"
    if [ "$_phase" = "none" ] && ! sets_are_ours && [ ! -d "$NATIVE_STASH" ]; then
        log "phase none, nothing bound — nothing to recover"
        return 0
    fi
    # ⚠ Note the condition above asks the WORLD, not just the marker. A reboot
    # clears the mount but not the marker, and a marker that says none while a
    # mount is live (or a legacy stash exists) is exactly the state that must
    # not be trusted. Either way the exit direction converges.
    log "recovering (phase '$_phase')"
    do_exit
}

do_status() {
    _phase="$(read_phase)"
    if sets_are_ours; then
        echo "$_phase (bound)"
    else
        echo "$_phase (not bound)"
    fi
}

# ---- main -------------------------------------------------------------------

case "${1:-}" in
    enter)   do_enter ;;
    exit)    do_exit ;;
    recover) do_recover ;;
    status)  do_status ;;
    *) die "usage: set-swap.sh enter|exit|recover|status" ;;
esac
