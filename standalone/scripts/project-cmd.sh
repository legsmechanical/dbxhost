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
#                     {"current": N, "projects": [{"uuid","name","index"}...]}
#   new <name>      create a project from the template (fresh uuid, next
#                     index), then switch to it
#   switch <index>  save the current song, point currentSongIndex at <index>,
#                     and restart Move IN PLACE via the launcher's supervisor
#                     loop (relaunch_requested)
#
# The switch path mirrors exit-to-stock.sh's shape: SIGTERM so the host runs
# its normal shutdown saves, detached because our caller dies with the process
# we signal. The launcher consumes relaunch_requested and runs Move again —
# same boot files, same session.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
# Per-project state, keyed by the same set uuid, in TWO roots — deleting a
# project has to take BOTH, or it is not the clean slate the user expects:
#
#   MODULE  /data/UserData/schwung/set_state/<uuid>/  seq8-state.json, the UI
#           sidecar, snapshots. Lives under the STOCK install because modules
#           are shared between installs. The module cannot delete this itself
#           (host_remove_dir is disallowed under set_state).
#   HOST    $DBX_DIR/set_state/<uuid>/                shadow_chain_config.json,
#           slot_0..N.json, master_fx_*, move_fx_*, send_fx_* — i.e. the
#           ROUTING and PARAMS half. SET_STATE_DIR in shadow_set_pages.h.
#
# ⚠ Missing the host root was a real bug: a deleted project left its whole
# chain/slot/FX configuration on disk (found on hardware 2026-08-11).
SET_STATE_DIR="${SET_STATE_DIR:-/data/UserData/schwung/set_state}"
HOST_STATE_DIR="${HOST_STATE_DIR:-$DBX_DIR/set_state}"
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
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$OUT_JSON" <<'PYEOF'
import json, os, re, sys
sets_dir, settings, out = sys.argv[1], sys.argv[2], sys.argv[3]
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
        names = [n for n in os.listdir(p)
                 if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")]
        name = names[0] if names else u[:8]
        idx = None
        if hasattr(os, "getxattr"):
            try:
                idx = int(os.getxattr(p, "user.song-index").decode())
            except (OSError, ValueError):
                pass
        projects.append({"uuid": u, "name": name, "index": idx})
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
    python3 - "$SETS_DIR" "$1" "$2" <<'PYEOF'
import os, re, shutil, sys, uuid as uuidlib
sets_dir, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
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
inner = [n for n in os.listdir(sp)
         if os.path.isdir(os.path.join(sp, n)) and not n.startswith(".")]
if not inner:
    sys.exit("project-cmd: ERROR: source has no inner set dir")
nu = str(uuidlib.uuid4())
np = os.path.join(sets_dir, nu)
shutil.copytree(os.path.join(sp, inner[0]), os.path.join(np, inner[0] + " Copy"))
os.setxattr(np, "user.song-index", str(dst).encode())
print("project-cmd: copied index %d -> %d (%s)" % (src, dst, nu))
PYEOF
    do_list
}

do_delete() { # index
    case "${1:-}" in *[!0-9]*|"") die "delete needs a numeric index" ;; esac
    python3 - "$SETS_DIR" "$SETTINGS_JSON" "$1" "$SET_STATE_DIR" "$HOST_STATE_DIR" <<'PYEOF'
import os, re, shutil, sys
sets_dir, settings, idx = sys.argv[1], sys.argv[2], int(sys.argv[3])
state_dirs = [d for d in sys.argv[4:] if d]
cur = -1
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
            # BOTH per-project state roots — the module's (clips, sequencer)
            # and the host's (chains, slots, FX = the routing and params).
            # Best-effort and AFTER the set itself: a leftover set with no
            # state reads as an empty project, while leftover state with no
            # set is what the orphan pruner is for.
            for sd in state_dirs:
                try:
                    shutil.rmtree(os.path.join(sd, u))
                    print("project-cmd: deleted state %s/%s" % (sd, u))
                except OSError:
                    pass
            print("project-cmd: deleted index %d (%s)" % (idx, u))
            sys.exit(0)
    except (OSError, ValueError):
        pass
sys.exit("project-cmd: ERROR: no project at index %d" % idx)
PYEOF
    do_list
}

case "${1:-}" in
    list)   do_list ;;
    new)    shift; do_new "${1:-}" ;;
    new-at) shift; do_new_at "${1:-}" "${2:-}" ;;
    copy)   shift; do_copy "${1:-}" "${2:-}" ;;
    delete) shift; do_delete "${1:-}" ;;
    switch) shift; do_switch "${1:-}" ;;
    *) die "usage: project-cmd.sh list|new <name>|new-at <index> [name]|copy <src> <dst>|delete <index>|switch <index>" ;;
esac
