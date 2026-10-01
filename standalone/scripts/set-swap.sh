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
# ⭑ SETTINGS TOO (2026-09-28, Josh: "need to have those settings be separate
# from the main move install"): Move's settings folder gets the same treatment —
# $SA_SETTINGS bound over $MOVE_SETTINGS_DIR — so whatever the session's Move
# changes (from dAVEBOx's Move Settings... row) lands in the session's copy and
# the user's own settings sit untouched underneath. The whole folder, never
# Settings.json alone: every writer of that file here (and in project-cmd.sh,
# launch.sh) replaces it by rename, which fails on a FILE mount point.
#
# Verbs:
#   enter    bind $LIBRARY over Sets/, $SA_SETTINGS over settings/ (session starts)
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
# from launch.sh before every session. (A boot-time oneshot also ran it until
# 0.0.4; a reboot clears the mounts by itself, so nothing needs it at boot.)
#
# Testability: every path and the mount helper itself can be overridden by
# environment, so the whole state machine runs against fixtures in a tmpdir with
# a stub helper (tests/host/test_set_swap.sh). Settings.json handling degrades
# to a no-op when the file is absent.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
# No __pycache__ beside the scripts (the install tree is a manifest-checked payload).
export PYTHONDONTWRITEBYTECODE=1
# Move's settings folder (the firmware's path) and this install's copy of it.
# SETTINGS_JSON is the path every reader uses: while a session is live it shows
# the session's copy, because the folder above it is bound.
MOVE_SETTINGS_DIR="${MOVE_SETTINGS_DIR:-/data/UserData/settings}"
SETTINGS_JSON="${SETTINGS_JSON:-$MOVE_SETTINGS_DIR/Settings.json}"
SA_SETTINGS="${SA_SETTINGS:-$DBX_DIR/settings}"

SWAP_ROOT="${SWAP_ROOT:-$DBX_DIR/sets}"
LIBRARY="$SWAP_ROOT/library"
# The python helpers beside this script (library_slots.py, for the slot count
# the boot-index clamp needs). ⚠ Set it EXPLICITLY: a `python3 -` heredoc has
# sys.argv[0] == "-", so deriving the directory from argv inside the block
# silently resolves to the caller cwd instead.
DBX_PY_DIR="${DBX_PY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
export DBX_PY_DIR
export PYTHONDONTWRITEBYTECODE=1
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

# Line 3: whether the session's Move settings were its OWN copy ("own") or
# Move's shared file ("shared"). Empty on a marker from an older build.
read_settings_mode() {
    [ -f "$STATE_FILE" ] || return 0
    sed -n '3p' "$STATE_FILE" 2>/dev/null
}

write_state() { # phase native_index [own|shared]
    mkdir -p "$SWAP_ROOT"
    printf '%s\n%s\n%s\n' "$1" "$2" "${3:-}" > "$STATE_FILE.tmp"
    mv -f "$STATE_FILE.tmp" "$STATE_FILE"
}

# ---- the mount ---------------------------------------------------------------

# TRUTH, as opposed to intent: is our library the thing Sets/ currently shows?
# A bind mount makes the two paths the same inode, which is exactly what this
# compares. ⚠ Deliberately NOT `mountpoint` or /proc/mounts parsing: this asks
# the question we actually care about ("is OUR library there"), and it answers
# correctly even for a stacked or lazily-detached mount.
same_dir() { # a b — true when both paths are the same directory (a bind mount)
    python3 - "$1" "$2" <<'PYEOF' 2>/dev/null || return 1
import os, sys
try:
    a, b = os.stat(sys.argv[1]), os.stat(sys.argv[2])
except OSError:
    sys.exit(1)
sys.exit(0 if (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino) else 1)
PYEOF
}
sets_are_ours()     { same_dir "$SETS_DIR" "$LIBRARY"; }
settings_are_ours() { same_dir "$MOVE_SETTINGS_DIR" "$SA_SETTINGS"; }

heal_mount()  { "$HEAL_BIN" --mount-sets; }
heal_umount() { "$HEAL_BIN" --umount-sets; }

# ---- the session's own Move settings ------------------------------------------
#
# Seeded from the user's folder the first time (so a first session feels the
# same: Link, clock, gains, volume), then the session's copy persists on its
# own. On EVERY enter:
#   - any file the user's folder has and ours lacks is copied (Move's demo-song
#     marker, or whatever a firmware update adds) — never overwriting ours;
#   - Move Manager's web login database is refreshed from the user's, so a
#     pairing made outside a session still works inside one;
#   - the fields the session depends on are forced: autoload ON (the whole
#     project machinery boots Move into currentSongIndex), onboarding done and
#     no update pop-up (neither may cover a session's screen), and Move's Link
#     setting on Tempo — Link on, start/stop sync off (Josh, 2026-10-01: "dave
#     box should always start with moves link setting set to tempo"). A change
#     made inside a session lasts until the next session starts.
# And once, when the copy is first made: Full Velocity OFF. A new project clears
# it (project-cmd.sh clear_full_velocity — Josh: "always off by default when new
# sets are created"), but the FIRST project is born before this copy exists, so
# that clear finds nothing to write; this is where the first project gets it.
# currentSongIndex itself is written afterwards by the caller, as before.
seed_settings() {
    mkdir -p "$SA_SETTINGS"
    _first=0; [ -e "$SA_SETTINGS/Settings.json" ] || _first=1
    if [ -d "$MOVE_SETTINGS_DIR" ] && ! settings_are_ours; then
        for _f in "$MOVE_SETTINGS_DIR"/* "$MOVE_SETTINGS_DIR"/.[!.]*; do
            [ -f "$_f" ] || continue
            _n="$(basename "$_f")"
            case "$_n" in *.setswap.tmp|*.dbxtmp) continue ;; esac
            if [ "$_n" = "web-webServiceAuthentication.db" ] || [ ! -e "$SA_SETTINGS/$_n" ]; then
                cp -p "$_f" "$SA_SETTINGS/$_n.seed.tmp" && mv -f "$SA_SETTINGS/$_n.seed.tmp" "$SA_SETTINGS/$_n"
            fi
        done
    fi
    python3 - "$SA_SETTINGS/Settings.json" "$_first" <<'SEED_PY'
import json, os, sys
path, first = sys.argv[1], sys.argv[2] == "1"
try:
    with open(path) as f:
        d = json.load(f)
    if not isinstance(d, dict):
        d = {}
except (OSError, ValueError):
    d = {}
d.setdefault("currentSongIndex", 0)
d["isAutoloadEnabled"] = True
d["isOnboardingDone"] = True
d["shouldShowUpdateNotification"] = False
d["isLinkEnabled"] = True
d["isLinkStartStopSyncEnabled"] = False
if first:
    d["isFullVelocityOn"] = False
tmp = path + ".seed.tmp"
with open(tmp, "w") as f:
    f.write(json.dumps(d, indent=2) + "\n")
    f.flush()
    os.fsync(f.fileno())
os.rename(tmp, path)
SEED_PY
}

# Bind the session's settings over Move's. ⚠ NOT fatal: the helper updates
# itself only AFTER this runs (launch.sh mirrors after the swap), so the first
# launch after an update still has the previous helper, which does not know
# the verb. Refusing would strand the device (no session, so no self-update
# either); instead that one session keeps sharing the user's settings, as every
# session did before, and says so.
enter_settings() {
    if settings_are_ours; then return 0; fi
    seed_settings || { log "WARNING: could not prepare the session's settings — sharing Move's this session"; return 0; }
    if "$HEAL_BIN" --mount-settings && settings_are_ours; then
        log "settings: the session's own copy is bound over Move's"
    else
        log "WARNING: settings not separated this session (helper could not bind them)"
    fi
}

exit_settings() {
    settings_are_ours || return 0
    "$HEAL_BIN" --umount-settings || die "settings unbind failed"
    if settings_are_ours; then
        die "settings unbind reported success but the session's copy is still bound"
    fi
    log "settings: Move's own settings are back"
}

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
# So ask active_set.txt, not currentSongIndex. It is written on every set
# change (checked for existence rather than trusted — it has been measured
# naming a uuid with NO set dir). One fallback behind it:
#   1. active_set.txt (a mirror, but written on every set change)
#   2. nothing: the caller keeps currentSongIndex, which is today's behaviour and
#      is right in the one case it can be, a session that never switched project.
#
# ⚠ There used to be a source ahead of active_set.txt: the newest-mtime
# per-project autosave file, on the theory that "whichever project the module
# is writing IS the project that is loaded." Deleted (project-identity-design
# §3A A10): it was tried FIRST, so it could OVERRIDE active_set.txt at the one
# moment (exit) that decides where the next session opens — and active_set.txt
# is now written by the host only when Move has CONFIRMED a project is open, so
# a live second guess is strictly less trustworthy than the thing it used to
# override.
#
# Prints the index, or nothing if no source could answer.
session_song_index() {
    python3 - "$SETS_DIR" "$ACTIVE_SET_PATH" <<'SESSIDX_PY' 2>/dev/null
import os, sys

sets_dir, active_set_path = sys.argv[1], sys.argv[2]


def index_of(uuid):
    if not uuid:
        return None
    try:
        return int(os.getxattr(os.path.join(sets_dir, uuid),
                               "user.song-index").decode())
    except (OSError, ValueError):
        return None


def active_set_uuid():
    try:
        with open(active_set_path) as f:
            return f.readline().strip()
    except OSError:
        return ""


for candidate in (active_set_uuid(),):
    i = index_of(candidate)
    if i is not None and i >= 0:
        print(i)
        break
SESSIDX_PY
}

# The slot index active_set.txt names, read from the LIBRARY itself (so it
# answers whether or not Sets/ is bound — after a reboot it is not). Nothing
# when the file names no slot, or a slot whose link does not lead to a project:
# a record that cannot be checked against the links is not trusted.
live_slot_index() {
    python3 - "$LIBRARY" "$ACTIVE_SET_PATH" <<'LIVESLOT_PY' 2>/dev/null
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl

library, active_set_path = sys.argv[1], sys.argv[2]
try:
    with open(active_set_path) as f:
        uuid = f.readline().strip()
except OSError:
    sys.exit(0)
if uuid in sl.SLOT_IDS and sl.slot_target(library, uuid) \
        and os.path.isdir(os.path.join(library, uuid)):
    print(sl.SLOT_IDS.index(uuid))
LIVESLOT_PY
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

    # Settings first: the index written below must land in the SESSION's copy.
    enter_settings

    heal_mount || die "bind mount failed"
    sets_are_ours || die "bind reported success but Sets/ is not our library"

    # Restore the session's own last position, CLAMPED to a position the
    # library actually has.
    #
    # 🔴 MEASURED 2026-09-21: the first launch after the library shrank restored
    # `session index 10` into a library holding two entries, Move resolved
    # nothing, and it opened its OWN DEFAULT SONG — not a project, with no
    # message. The stored value is only ever as valid as the library it was
    # stored against, and the library is now a fixed, small set of slots.
    #
    # ⚠ Ask the library how many slots it HAS rather than hard-coding two: the
    # count is one with a single project (there is nothing to switch to, so
    # there is no second slot), and a constant here would put Move on a
    # position that does not exist on exactly the install least able to cope —
    # a fresh one.
    #
    # ⭐ The LIVE SLOT comes first, from active_set.txt + the slot link. The
    # saved position is written only by a CLEAN exit, so after a power loss or
    # a killed launcher it still names wherever the last clean session ended —
    # and every switch made since would be undone at boot. active_set.txt is
    # written only once Move has CONFIRMED an open, and the slot it names is
    # never the one a switch re-points, so a crash anywhere in a switch still
    # boots the project Move last confirmed.
    _sa_idx="$(live_slot_index || true)"
    if [ -n "$_sa_idx" ]; then
        log "live slot from active_set.txt: $_sa_idx"
    else
        _sa_idx=0
        [ -f "$SA_INDEX_FILE" ] && _sa_idx="$(grep -E '^-?[0-9]+$' "$SA_INDEX_FILE" || echo 0)"
    fi
    _nslots="$(python3 - "$LIBRARY" <<'NSLOT_PY' 2>/dev/null || echo 0
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
print(sum(1 for s in sl.SLOT_IDS if os.path.islink(os.path.join(sys.argv[1], s))))
NSLOT_PY
)"
    case "$_nslots" in ''|*[!0-9]*) _nslots=0 ;; esac
    if [ "$_nslots" -gt 0 ] && { [ "$_sa_idx" -lt 0 ] || [ "$_sa_idx" -ge "$_nslots" ]; }; then
        log "session index $_sa_idx is outside the $_nslots slot(s) this library has — clamping to 0"
        _sa_idx=0
    fi
    write_song_index "$_sa_idx"

    # Record where that index went: into the session's own settings, or (helper
    # too old to bind them) into Move's — which only exit may then put back.
    if settings_are_ours; then _mode=own; else _mode=shared; fi
    write_state "sa-live" "$_idx" "$_mode"
    log "entered: library bound over Sets/ (native index $_idx, session index $_sa_idx)"
}

do_exit() {
    _phase="$(read_phase)"
    # ⚠ NOTHING TO UNDO IS A NO-OP -- the same test do_recover makes. refuse()
    # calls `exit` unconditionally, trusting it to be one before `enter`, but
    # with no marker (or a marker a finished session left at "none 0" with no
    # mode) the tail below wrote currentSongIndex = 0 into MOVE'S OWN
    # Settings.json: a refused launch sent stock Move back to whatever set sits
    # in slot 0 (hardware, 2026-09-30, a launch refused on stock AbletonOS).
    if [ "$_phase" = "none" ] && ! sets_are_ours && ! settings_are_ours && [ ! -d "$NATIVE_STASH" ]; then
        log "exit: nothing entered, nothing bound -- nothing to undo"
        return 0
    fi
    _idx="$(read_native_index)"
    _mode="$(read_settings_mode)"

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

    write_state "exiting" "$_idx" "$_mode"
    heal_umount || die "unbind failed"
    if sets_are_ours; then
        die "unbind reported success but Sets/ is still our library"
    fi
    exit_settings

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

    # ⚠ Put the user's index back ONLY if the session wrote it into Move's own
    # file. With the session's own settings, Move's file was never touched —
    # and after a power loss this runs at the NEXT launch, maybe days later, so
    # writing the remembered index would undo whatever set the user has opened
    # in Move since. (A marker from an older build has no mode: put it back, as
    # that build would have.)
    if [ "$_mode" = own ]; then
        log "Move's settings were never the session's — its index is left as it is"
    else
        write_song_index "$_idx"
    fi
    write_state "none" "0"
    log "exited: Sets/ is the user's library again (index $_idx, was phase '$_phase')"
}

do_recover() {
    _phase="$(read_phase)"
    if [ "$_phase" = "none" ] && ! sets_are_ours && ! settings_are_ours && [ ! -d "$NATIVE_STASH" ]; then
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
