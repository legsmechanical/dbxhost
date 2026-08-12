#!/bin/sh
# project-cmd.sh — project management for a live standalone session.
#
# While a session runs, Sets/ IS the project library (set-swap.sh put it
# there), so these verbs operate directly on Sets/ using Move's own notions:
# a project is a <uuid>/<Name>/Song.abl set dir, ordering is the
# user.song-index xattr, and the active project is currentSongIndex in
# Settings.json.
#
# Verbs (driven by the hosted module through host_system_cmd's `sh ` prefix,
# results returned through files it can host_read_file):
#   list            write $DBX_DIR/projects.json:
#                     {"current": N, "projects": [{"uuid","name","index","color"}...]}
#   new <name>      create a project from the template (fresh uuid, next
#                     index), then switch to it
#   switch <index>  save the current song, point currentSongIndex at <index>,
#                     and restart Move IN PLACE via the launcher's supervisor
#                     loop (relaunch_requested)
#   color <index> <n>    set (n < 0: clear) the pad-color palette index
#   rename <index> <name> rename the inner set dir + name index; the OPEN
#                     project defers the mv to relaunch_patch.sh and restarts
#                     Move in place (see do_rename)
#   prune           drop HOST state dirs whose set is gone, and name-index
#                     entries whose state file is gone (see do_prune)
#
# The switch path mirrors exit-to-stock.sh's shape: SIGTERM so the host runs
# its normal shutdown saves, detached because our caller dies with the process
# we signal. The launcher consumes relaunch_requested and runs Move again —
# same boot files, same session.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
# Per-project state. Since Phase B the MODULE half (clips, sequencer) lives
# INSIDE the project's set dir (Sets/<uuid>/$DBX_SUBDIR_NAME/), so it needs no
# constant here — delete/copy of the set dir take it along. Only the HOST half
# (chains, slots, FX — the routing and params) still lives in a root parallel
# to the projects, ours alone, until Phase C co-locates it too:
HOST_STATE_DIR="${HOST_STATE_DIR:-$DBX_DIR/set_state}"
# The host's own record of the set it loaded, rewritten on every set change.
# ⚠ THIS install's copy — the stock tree has a file of the same name holding
# native-session leftovers. Authoritative for "which project is open";
# Settings.json's currentSongIndex is only written at a relaunch and goes stale.
ACTIVE_SET_PATH="${ACTIVE_SET_PATH:-$DBX_DIR/active_set.txt}"
# WHERE A SET CAN BE, for the prune's liveness test. Sets/ alone is NOT the
# answer and assuming it is destroys work:
#   Sets/          the live library — but that is the SA library only while a
#                  session runs; outside one it holds the user's NATIVE sets.
#   sets/library/  the SA library while no session runs (set-swap.sh renames
#                  whole set dirs between the two — a set is in exactly one).
#   sets/native-stash/  the natives while a session runs. Ours never land here,
#                  but a uuid found there is manifestly a live set, so it counts.
# (A set-pages stash was a fourth root until 2026-08-12; the 8-page feature died
# in P3 and nothing writes a stash any more.)
# This is the same union dsp/setparam/sp_globals_state.c's seq8_set_uuid_alive()
# walks for the MODULE root; keep the two in step.
SWAP_ROOT="${SWAP_ROOT:-$DBX_DIR/sets}"
LIBRARY_DIR="${LIBRARY_DIR:-$SWAP_ROOT/library}"
NATIVE_STASH_DIR="${NATIVE_STASH_DIR:-$SWAP_ROOT/native-stash}"
SWAP_STATE_FILE="${SWAP_STATE_FILE:-$SWAP_ROOT/swap_state}"
# ⭑ The reserved state subdir INSIDE each project's set dir (Phase B of the
# state-co-location plan): Sets/<uuid>/$DBX_SUBDIR_NAME/ holds the module's
# per-project state, beside Move's inner <Name>/ dir. Every site that hunts the
# inner set dir by "the one directory inside" MUST skip this name — a project
# dir has TWO children now, and os.listdir order is arbitrary, so an unfiltered
# [0] is a coin toss between the set and the state. Grep for dbx_subdir to find
# the filter sites; check-config.sh pins the spelling here, in the module
# (ui_persistence.mjs, dsp/seq8.c) and in select-list.sh.
DBX_SUBDIR_NAME="${DBX_SUBDIR_NAME:-dAVEBOx}"
OUT_JSON="$DBX_DIR/projects.json"
TEMPLATE_DIR="$DBX_DIR/sets/template"

die() { printf 'project-cmd: ERROR: %s\n' "$*" >&2; exit 1; }

save_song() {
    # Best-effort: an unsaved song must reach disk before Move goes away.
    dbus-send --system --print-reply --reply-timeout=4000 \
        --dest=com.ableton.move \
        /com/ableton/move/browser \
        com.ableton.move.Browser.saveSongIfDirty string: \
        >/dev/null 2>&1 || true
}

write_song_index() { # index
    [ -f "$SETTINGS_JSON" ] || return 0
    _tmp="$SETTINGS_JSON.projcmd.tmp"
    sed 's/\("currentSongIndex":[[:space:]]*\)-\{0,1\}[0-9][0-9]*/\1'"$1"'/' \
        "$SETTINGS_JSON" > "$_tmp" && mv -f "$_tmp" "$SETTINGS_JSON"
}

do_list() {
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$OUT_JSON" "$DBX_SUBDIR_NAME" <<'PYEOF'
import json, os, re, sys
sets_dir, settings, out, dbx_subdir = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass
projects = []
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
if os.path.isdir(sets_dir):
    for u in sorted(os.listdir(sets_dir)):
        p = os.path.join(sets_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        # ⚠ TWO children since Phase B: Move's inner <Name>/ AND the reserved
        # state subdir. listdir order is arbitrary — filter, or the project
        # can list under the state dir's name.
        names = [n for n in os.listdir(p)
                 if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")
                 and n != dbx_subdir]
        name = names[0] if names else u[:8]
        idx = None
        color = None
        if hasattr(os, "getxattr"):
            try:
                idx = int(os.getxattr(p, "user.song-index").decode())
            except (OSError, ValueError):
                pass
            # Palette index into the picker's PROJECT_COLORS table; absent =
            # null = the default color. Lives on the uuid dir beside
            # user.song-index so it travels with the project through the
            # set-swap and dies with delete for free.
            try:
                color = int(os.getxattr(p, "user.dbx-color").decode())
            except (OSError, ValueError):
                pass
        projects.append({"uuid": u, "name": name, "index": idx, "color": color})
# Unindexed projects sort last, stably.
projects.sort(key=lambda x: (x["index"] is None, x["index"] if x["index"] is not None else 0, x["name"]))
tmp = out + ".tmp"
with open(tmp, "w") as f:
    json.dump({"current": cur, "projects": projects}, f)
os.replace(tmp, out)
print("project-cmd: %d project(s) listed" % len(projects))
PYEOF
}

do_new() { # name
    [ -n "${1:-}" ] || die "new needs a name"
    [ -d "$TEMPLATE_DIR" ] || die "no template at $TEMPLATE_DIR"
    _uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"
    _dst="$SETS_DIR/$_uuid/$1"
    mkdir -p "$_dst"
    # The template contains one <Name>/Song.abl; take the Song.abl regardless
    # of the template's own inner name.
    _src="$(find "$TEMPLATE_DIR" -name Song.abl | head -n 1)"
    [ -n "$_src" ] || die "template has no Song.abl"
    cp "$_src" "$_dst/Song.abl"

    _idx="$(python3 - "$SETS_DIR" "$_uuid" <<'PYEOF'
import os, re, sys
sets_dir, new_uuid = sys.argv[1], sys.argv[2]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
top = -1
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u) or u == new_uuid:
        continue
    if hasattr(os, "getxattr"):
        try:
            top = max(top, int(os.getxattr(p, "user.song-index").decode()))
        except (OSError, ValueError):
            pass
nxt = top + 1
if hasattr(os, "setxattr"):
    try:
        os.setxattr(os.path.join(sets_dir, new_uuid), "user.song-index", str(nxt).encode())
    except OSError:
        pass
print(nxt)
PYEOF
)"
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$1" "$_uuid" "$_idx"
    do_switch "$_idx"
}

do_switch() { # index
    case "${1:-}" in *[!0-9]*|"") die "switch needs a numeric index" ;; esac
    save_song
    # ⚠ Do NOT write currentSongIndex here: Move is still alive, and its
    # SIGTERM teardown saves Settings.json — overwriting the value with its
    # own stale in-memory index (observed on hardware 2026-08-06: the fresh
    # session then booted into an unmatched set, `__pending-*`). The launcher
    # applies this file to Settings.json AFTER Move has exited, which is the
    # same ordering the host's own set-page change uses.
    printf '%s\n' "$1" > "$DBX_DIR/relaunch_song_index"
    : > "$DBX_DIR/relaunch_requested"
    # Detached, exactly like exit-to-stock.sh: our caller is a child of the
    # process we are about to signal. SIGTERM so shutdown saves run; the
    # launcher's supervisor loop sees relaunch_requested and runs Move again.
    setsid sh -c '
      sleep 1
      pkill -x MoveOriginal
    ' >/dev/null 2>&1 &
    printf 'project-cmd: switching to index %s (Move restarting in place)\n' "$1"
}

# Template birth at a SPECIFIC index (the pad the user tapped in the picker).
# Unlike do_new (next-free index + auto-switch), this only creates — the
# caller orchestrates the switch itself.
do_new_at() { # index [name]
    case "${1:-}" in *[!0-9]*|"") die "new-at needs a numeric index" ;; esac
    [ -d "$TEMPLATE_DIR" ] || die "no template at $TEMPLATE_DIR"
    _src="$(find "$TEMPLATE_DIR" -name Song.abl | head -n 1)"
    [ -n "$_src" ] || die "template has no Song.abl"
    _uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')"
    _name="${2:-Project $(($1 + 1))}"
    mkdir -p "$SETS_DIR/$_uuid/$_name"
    cp "$_src" "$SETS_DIR/$_uuid/$_name/Song.abl"
    python3 -c "import os,sys; os.setxattr(sys.argv[1], 'user.song-index', sys.argv[2].encode())" \
        "$SETS_DIR/$_uuid" "$1" 2>/dev/null || true
    do_list
    printf 'project-cmd: created "%s" (%s) at index %s\n' "$_name" "$_uuid" "$1"
}

# Duplicate a project onto another pad. Inner name gets Move's own " Copy"
# suffix so the hosted module's copy-inheritance machinery (family lookup on
# first open) treats it exactly like a native pad-copy.
do_copy() { # src-index dst-index
    case "${1:-}" in *[!0-9]*|"") die "copy needs a numeric source index" ;; esac
    case "${2:-}" in *[!0-9]*|"") die "copy needs a numeric destination index" ;; esac
    python3 - "$SETS_DIR" "$1" "$2" "$HOST_STATE_DIR" "$DBX_SUBDIR_NAME" <<'PYEOF'
import os, re, shutil, sys, uuid as uuidlib
sets_dir, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
host_state_dir, dbx_subdir = sys.argv[4], sys.argv[5]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
def find(idx):
    for u in os.listdir(sets_dir):
        p = os.path.join(sets_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        try:
            if int(os.getxattr(p, "user.song-index").decode()) == idx:
                return u, p
        except (OSError, ValueError):
            pass
    return None, None
su, sp = find(src)
if not su:
    sys.exit("project-cmd: ERROR: no project at index %d" % src)
du, _ = find(dst)
if du:
    sys.exit("project-cmd: ERROR: index %d already occupied" % dst)

# ⭑ COPY = one copytree of the WHOLE uuid dir. The module's state lives INSIDE
# it (<uuid>/<dbx_subdir>/, Phase B of the state-co-location plan), so the
# duplicate is a snapshot BY CONSTRUCTION — the hand-copied module-state seeding
# that used to live here, and the silently-tracks-its-source bug it fixed
# (Josh, hardware, 2026-08-11), are both structurally impossible now.
# The inner set dir is renamed to "<Name> Copy" AFTER the copy; the reserved
# state subdir is skipped when hunting it (it is a sibling, not a set).
nu = str(uuidlib.uuid4())
np = os.path.join(sets_dir, nu)
shutil.copytree(sp, np)
inner = [n for n in os.listdir(np)
         if os.path.isdir(os.path.join(np, n)) and not n.startswith(".")
         and n != dbx_subdir]
if not inner:
    shutil.rmtree(np)
    sys.exit("project-cmd: ERROR: source has no inner set dir")
os.rename(os.path.join(np, inner[0]), os.path.join(np, inner[0] + " Copy"))
# copytree carries the INNER tree but not the OUTER dir's xattrs — index and
# color are the outer dir's, so set by hand.
os.setxattr(np, "user.song-index", str(dst).encode())
try:
    os.setxattr(np, "user.dbx-color", os.getxattr(sp, "user.dbx-color"))
except OSError:
    pass

# The HOST half (chains/slots/FX) still lives in a parallel root until Phase C
# co-locates it too; hand-copy it so the duplicate's ROUTING is a snapshot.
hp_src = os.path.join(host_state_dir, su)
if os.path.isdir(hp_src):                        # this root is ours alone
    shutil.copytree(hp_src, os.path.join(host_state_dir, nu), dirs_exist_ok=True)
    print("project-cmd: copied host state to %s" % nu)

# ⚠ SYNC before returning (Josh, hardware, 2026-08-12): a hard power cut can
# lose unsynced directory operations to journal replay. A copy that vanishes is
# merely surprising; the same replay UN-DOING A DELETE resurrects projects the
# user watched disappear. All destructive/creative verbs flush.
os.sync()
print("project-cmd: copied index %d -> %d (%s)" % (src, dst, nu))
PYEOF
    do_list
}

do_delete() { # index
    case "${1:-}" in *[!0-9]*|"") die "delete needs a numeric index" ;; esac
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$1" "$HOST_STATE_DIR" "$ACTIVE_SET_PATH" <<'PYEOF'
import os, re, shutil, sys
sets_dir, settings, idx = sys.argv[1], sys.argv[2], int(sys.argv[3])
host_state_dir = sys.argv[4]
active_set_path = sys.argv[5] if len(sys.argv) > 5 else ""


def open_uuid():
    """UUID of the set the HOST has loaded, or '' if unknown.

    active_set.txt is written on every set change; currentSongIndex is only
    written at a relaunch and goes stale mid-session — measured naming project 5
    while 14 was loaded. Trusting the stale one here is the dangerous direction:
    it protects the wrong pad AND permits deleting the project that is live.
    """
    try:
        with open(active_set_path) as f:
            return f.readline().strip()
    except OSError:
        return ""


def index_of(uuid):
    if not uuid:
        return -1
    p = os.path.join(sets_dir, uuid)
    try:
        return int(os.getxattr(p, "user.song-index").decode())
    except (OSError, ValueError):
        return -1


cur = index_of(open_uuid())
if cur < 0:                                  # no usable record — fall back
    try:
        m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
        if m: cur = int(m.group(1))
    except OSError:
        pass
if idx == cur:
    sys.exit("project-cmd: ERROR: refusing to delete the OPEN project")
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) == idx:
            shutil.rmtree(p)
            # ⭑ The MODULE half (clips, sequencer) went WITH that rmtree — it
            # lives inside the set dir since Phase B, so "delete the project"
            # and "delete its patterns" are one operation, not two to keep in
            # step. Only the HOST half (chains, slots, FX) still lives in a
            # parallel root, until Phase C co-locates it too. Ours alone, so
            # the whole directory goes; best-effort and AFTER the set — a
            # leftover set with no state reads as an empty project, while
            # leftover host state is what do_prune sweeps.
            try:
                shutil.rmtree(os.path.join(host_state_dir, u))
                print("project-cmd: deleted host state %s/%s" % (host_state_dir, u))
            except OSError:
                pass
            # ⚠ SYNC before reporting success (Josh, hardware, 2026-08-12): a
            # hard power cut replays the journal, and an unsynced rmtree can be
            # UNDONE by it — the user watched this project disappear, and it
            # was back after a power pull. Deletion is only real once flushed.
            os.sync()
            # ⚠ The NAME INDEX is deliberately NOT touched here. The module holds
            # it in memory (S.nameIndexCache) and rewrites the whole file on the
            # next save, so a drop written behind its back is simply resurrected
            # — and the module is the one that knows the delete happened. It
            # drops the entry itself (dropNameIndexUuid, ui_dialogs' delete
            # branch); the rename path here only writes it because the module is
            # NOT involved in a rename. One writer per moment.
            print("project-cmd: deleted index %d (%s)" % (idx, u))
            sys.exit(0)
    except (OSError, ValueError):
        pass
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
    do_list
}

# Set (or clear, with n < 0) the pad color for a project. The value is an
# index into the picker's palette table, not an LED code — the module owns
# what the numbers look like.
do_color() { # index n
    case "${1:-}" in *[!0-9]*|"") die "color needs a numeric index" ;; esac
    case "${2:-}" in -*|[0-9]*) ;; *) die "color needs a numeric value" ;; esac
    python3 - "$SETS_DIR" "$1" "$2" <<'PYEOF'
import os, re, sys
sets_dir, idx, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) != idx:
            continue
    except (OSError, ValueError):
        continue
    if n < 0:
        try:
            os.removexattr(p, "user.dbx-color")
        except OSError:
            pass
        print("project-cmd: cleared color on index %d" % idx)
    else:
        os.setxattr(p, "user.dbx-color", str(n).encode())
        print("project-cmd: set color %d on index %d" % (n, idx))
    sys.exit(0)
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
    do_list
}

# Rename a project's INNER set dir — the name Move shows.
# (The name→uuid index this used to maintain died with the inherit machinery in
# Phase 0 of the state-co-location plan; a rename is just the mv now.)
#
# ⚠ The OPEN project cannot be renamed live: Move holds the song and its saves
# write by path, so a live mv risks the dying save re-creating the old dir.
# For the open project the rename is DEFERRED to the launcher's
# relaunch_patch.sh hook (applied AFTER Move exits, before the in-place
# restart) and rides the exact switch-in-place machinery do_switch proved:
# save, queue, SIGTERM, supervisor relaunch at the same index. Non-open
# projects rename immediately — the same liveness argument delete already
# proved on hardware.

do_rename() { # index newname [reselect]
    case "${1:-}" in *[!0-9]*|"") die "rename needs a numeric index" ;; esac
    [ -n "${2:-}" ] || die "rename needs a name"
    case "$2" in */*) die "name must not contain /" ;; esac

    _found="$(python3 - "$SETS_DIR" "$1" "$DBX_SUBDIR_NAME" <<'PYEOF'
import os, re, sys
sets_dir, idx, dbx_subdir = sys.argv[1], int(sys.argv[2]), sys.argv[3]
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir):
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        if int(os.getxattr(p, "user.song-index").decode()) != idx:
            continue
    except (OSError, ValueError):
        continue
    inner = [n for n in os.listdir(p)
             if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")
             and n != dbx_subdir]
    if not inner:
        sys.exit("project-cmd: ERROR: project has no inner set dir")
    print(u); print(inner[0])
    sys.exit(0)
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
)" || die "no project at index $1"
    _uuid="$(printf '%s\n' "$_found" | sed -n 1p)"
    _old="$(printf '%s\n' "$_found" | sed -n 2p)"
    [ "$_old" = "$2" ] && { do_list; return 0; }

    _open=""
    [ -f "$ACTIVE_SET_PATH" ] && _open="$(head -n 1 "$ACTIVE_SET_PATH" | tr -d '[:space:]')"
    if [ "$_uuid" = "$_open" ]; then
        # OPEN project: defer the mv to the launcher (post-exit), then restart
        # Move in place at the same index — do_switch's exact shape. Append to
        # relaunch_patch.sh rather than clobbering a pending patch.
        save_song
        {
            printf 'mv %s %s\n' \
                "'$SETS_DIR/$_uuid/$(printf '%s' "$_old" | sed "s/'/'\\\\''/g")'" \
                "'$SETS_DIR/$_uuid/$(printf '%s' "$2"   | sed "s/'/'\\\\''/g")'"
        } >> "$DBX_DIR/relaunch_patch.sh"
        printf '%s\n' "$1" > "$DBX_DIR/relaunch_song_index"
        # A rename issued while NOTHING is loaded (the boot picker) must bring
        # the fresh session back to the picker instead of auto-loading — the
        # caller says so with a literal third arg `reselect` and the launcher
        # honours the marker by re-arming fresh_session.
        [ "${3:-}" = "reselect" ] && : > "$DBX_DIR/relaunch_reselect"
        : > "$DBX_DIR/relaunch_requested"
        setsid sh -c '
          sleep 1
          pkill -x MoveOriginal
        ' >/dev/null 2>&1 &
        printf 'project-cmd: rename of OPEN project queued (Move restarting in place)\n'
        return 0
    fi

    mv "$SETS_DIR/$_uuid/$_old" "$SETS_DIR/$_uuid/$2"
    printf 'project-cmd: renamed index %s to "%s"\n' "$1" "$2"
    do_list
}

# Reclaim HOST state dirs ($DBX_DIR/set_state/<uuid>: shadow_chain_config,
# slot_N, master/move/send FX — the ROUTING half of a project) whose set no
# longer exists. Nothing else does: do_delete takes the one dir it deletes, but
# everything else leaks — projects deleted before do_delete learned about this
# root (100 had piled up by 2026-08-11), interrupted deletes, sets removed
# outside dAVEBOx.
#
# ⚠ SCOPE, deliberately narrow — this verb owns ONLY that root:
#   - the SHARED module root is the module's, via `prune_orphan_states`
#     (dsp/setparam/sp_globals_state.c), which deletes BY PREFIX because stock's
#     state sits in the same folders.
#   - the NAME INDEX is the module's too: it holds the map in memory
#     (S.nameIndexCache) and rewrites the whole file on the next save, so a
#     sweep here would be silently undone. Its stale-entry sweep runs in the
#     same tick branch that fires this verb (ui_tick.mjs).
#
# ⭑⭑ THE SAFETY ASYMMETRY, same as the module's: keeping a stale dir costs a few
# KB; deleting a live one destroys a project's routing with no error and nothing
# to restore from. So anything we cannot verify counts as ALIVE, and the whole
# sweep refuses rather than guesses:
#   - a mid-swap phase means sets are being renamed between roots right now, so
#     "absent from both" proves nothing → refuse.
#   - an unreadable Sets/ or an EMPTY alive set means we are looking at the wrong
#     world (this is exactly what running outside a session used to look like) →
#     refuse. A real device always has sets.
do_prune() {
    python3 - "$SETS_DIR" "$LIBRARY_DIR" "$NATIVE_STASH_DIR" \
              "$SWAP_STATE_FILE" "$HOST_STATE_DIR" <<'PYEOF'
import os, re, shutil, sys
(sets_dir, library_dir, native_stash, swap_state, host_state_dir) = sys.argv[1:6]

uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}'
                     r'-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')


def phase():
    """set-swap's intent marker. Absent = 'none' (its own default)."""
    try:
        with open(swap_state) as f:
            return (f.readline().strip() or "none")
    except OSError:
        return "none"


if phase() not in ("none", "sa-live"):
    sys.exit("project-cmd: prune SKIPPED: set swap is mid-flight (%s)" % phase())


def entries(path):
    try:
        return set(os.listdir(path))
    except OSError:
        return set()


# Every root a live set can be sitting in.
alive = entries(sets_dir) | entries(library_dir) | entries(native_stash)

if not entries(sets_dir):
    sys.exit("project-cmd: prune SKIPPED: %s is empty or unreadable" % sets_dir)
if not alive:
    sys.exit("project-cmd: prune SKIPPED: no live sets found anywhere")

# 1. HOST state roots with no set behind them.
removed = 0
for u in sorted(entries(host_state_dir)):
    if not uuid_re.match(u) or u in alive:
        continue
    p = os.path.join(host_state_dir, u)
    if not os.path.isdir(p):
        continue
    try:
        shutil.rmtree(p)
        removed += 1
        print("project-cmd: prune: removed host state %s" % u)
    except OSError as e:
        print("project-cmd: prune: could NOT remove %s: %s" % (u, e))

print("project-cmd: prune: alive=%d host_state_removed=%d" % (len(alive), removed))
PYEOF
}

case "${1:-}" in
    list)   do_list ;;
    new)    shift; do_new "${1:-}" ;;
    new-at) shift; do_new_at "${1:-}" "${2:-}" ;;
    copy)   shift; do_copy "${1:-}" "${2:-}" ;;
    delete) shift; do_delete "${1:-}" ;;
    switch) shift; do_switch "${1:-}" ;;
    color)  shift; do_color "${1:-}" "${2:-}" ;;
    rename) shift; do_rename "${1:-}" "${2:-}" "${3:-}" ;;
    prune)  do_prune ;;
    *) die "usage: project-cmd.sh list|new <name>|new-at <index> [name]|copy <src> <dst>|delete <index>|switch <index>|color <index> <n>|rename <index> <name>|prune" ;;
esac
