#!/bin/sh
# select-hook.sh — post-selection hook for the boot set-select gate.
#
# The shadow UI runs `select-hook.sh <index|current>` after the user picks a
# set in the native picker and before the boot tool opens. Job: guarantee the
# chosen set carries the template wiring the standalone session depends on
# (tracks 1-4 listening on MIDI channels 1-4, MIDI out off — the same fields
# make-template.py bakes into template-born projects). A set can lack it two
# ways, both native-picker features we deliberately kept: an empty pad's
# "Empty Set", and a pad-copy of a pre-template set.
#
# Contract with the shadow UI (select_hook_result.json):
#   {"status": "open"}      wiring fine (or unfixable) — open the tool now
#   {"status": "relaunch"}  set rewritten; this script is restarting Move via
#                           the launcher's supervisor loop, and the next
#                           iteration direct-boots the tool with the fixed set
#
# ⚠ The rewrite itself is DEFERRED to the launcher (relaunch_patch.sh), never
# done while Move is alive: Move's SIGTERM teardown can save the song over an
# earlier disk write, exactly the clobber that ate currentSongIndex once
# (launch.sh applies that after exit for the same reason). This script only
# DECIDES; the launcher applies the patch after MoveOriginal is gone.
#
# Also callable as `select-hook.sh apply <song.abl>` — the deferred patch
# entry point the launcher invokes.

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
OUT_JSON="$DBX_DIR/select_hook_result.json"

result() { # status
    printf '{"status": "%s"}\n' "$1" > "$OUT_JSON.tmp" && mv -f "$OUT_JSON.tmp" "$OUT_JSON"
}

# --- deferred patch entry point (runs from the launcher, Move is DOWN) ------
if [ "${1:-}" = "apply" ]; then
    [ -n "${2:-}" ] && [ -f "$2" ] || { echo "select-hook apply: no such file: ${2:-}" >&2; exit 1; }
    python3 - "$2" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
with open(path) as f:
    song = json.load(f)
tracks = song.get("tracks")
if not isinstance(tracks, list) or len(tracks) < 4:
    sys.exit("select-hook apply: no 4-track array — refusing")
for i, t in enumerate(tracks[:4]):
    t["midiInputMode"] = [i]
    t["midiOutputEndpoint"] = None
tmp = path + ".selhook.tmp"
with open(tmp, "w") as f:
    json.dump(song, f, separators=(",", ": "), indent=4)
    f.write("\n")
os.replace(tmp, path)
print("select-hook apply: rewired %s" % path)
PYEOF
    exit 0
fi

# --- decide --------------------------------------------------------------
IDX="${1:-current}"
if [ "$IDX" = "current" ]; then
    IDX="$(sed -n 's/.*"currentSongIndex":[[:space:]]*\(-\{0,1\}[0-9][0-9]*\).*/\1/p' \
           "$SETTINGS_JSON" | head -n 1)"
    [ -n "$IDX" ] || { result open; exit 0; }
fi

# An empty pad's "Empty Set" materializes its dir lazily — ask Move to save
# first so there is a file to inspect (best-effort; also flushes user edits so
# a relaunch loses nothing).
dbus-send --system --print-reply --reply-timeout=4000 \
    --dest=com.ableton.move \
    /com/ableton/move/browser \
    com.ableton.move.Browser.saveSongIfDirty string: \
    >/dev/null 2>&1 || true

SONG="$(python3 - "$SETS_DIR" "$IDX" <<'PYEOF'
import os, re, sys
sets_dir, want = sys.argv[1], int(sys.argv[2])
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
for u in os.listdir(sets_dir) if os.path.isdir(sets_dir) else []:
    p = os.path.join(sets_dir, u)
    if not os.path.isdir(p) or not uuid_re.match(u):
        continue
    try:
        idx = int(os.getxattr(p, "user.song-index").decode())
    except (OSError, ValueError, AttributeError):
        continue
    if idx != want:
        continue
    for n in os.listdir(p):
        f = os.path.join(p, n, "Song.abl")
        if not n.startswith(".") and os.path.isfile(f):
            print(f)
            sys.exit(0)
sys.exit(0)
PYEOF
)"

if [ -z "$SONG" ]; then
    # Nothing on disk even after the save — nothing to wire. Fail open.
    echo "select-hook: no Song.abl for index $IDX — opening unwired" >&2
    result open
    exit 0
fi

if python3 - "$SONG" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    song = json.load(f)
tracks = song.get("tracks")
ok = isinstance(tracks, list) and len(tracks) >= 4 and all(
    t.get("midiInputMode") == [i] and t.get("midiOutputEndpoint") is None
    for i, t in enumerate(tracks[:4]))
sys.exit(0 if ok else 1)
PYEOF
then
    result open
    exit 0
fi

# Needs rewiring: stage the deferred patch, arm the relaunch (same index —
# Settings.json already points at the chosen set, but a stale in-memory value
# saved during teardown would unpoint it; the launcher re-applies after exit),
# answer the UI, then take Move down. Ordering matters: the result file must
# exist before the stack starts dying.
printf 'sh %s/scripts/select-hook.sh apply "%s"\n' "$DBX_DIR" "$SONG" \
    > "$DBX_DIR/relaunch_patch.sh"
printf '%s\n' "$IDX" > "$DBX_DIR/relaunch_song_index"
: > "$DBX_DIR/relaunch_requested"
result relaunch
setsid sh -c '
  sleep 1
  pkill -x MoveOriginal
' >/dev/null 2>&1 &
echo "select-hook: index $IDX needs wiring — relaunch armed"
