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
    write_song_index "$1"
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

case "${1:-}" in
    list)   do_list ;;
    new)    shift; do_new "${1:-}" ;;
    switch) shift; do_switch "${1:-}" ;;
    *) die "usage: project-cmd.sh list|new <name>|switch <index>" ;;
esac
