#!/bin/sh
# select-hook.sh — post-selection hook for the set-select actuator.
#
# The shadow UI runs `select-hook.sh <index>` once the actuator's selection has
# landed and before the tool resumes. Job: guarantee the chosen set carries the
# template wiring the standalone session depends on (tracks 1-4 listening on
# MIDI channels 1-4, MIDI out off — the same fields make-template.py bakes into
# template-born projects). A set can lack it when it predates the template, or
# when it was born some way other than the module's own pad picker.
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
# Move's set library: the two slot links. The pressed slot is looked up HERE,
# through its link — never by picker pad, and never by scanning the store.
LIBRARY_DIR="${LIBRARY_DIR:-$DBX_DIR/sets/library}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
OUT_JSON="$DBX_DIR/select_hook_result.json"
# The python helpers beside this script (library_slots.py). ⚠ Without it the
# lookup below dies on the import and the hook finds no song for any slot.
DBX_PY_DIR="${DBX_PY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
export DBX_PY_DIR
# No __pycache__ beside the scripts (the install tree is a manifest-checked payload).
export PYTHONDONTWRITEBYTECODE=1

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

# Flush Move's in-memory edits before the wiring check reads the file, so a
# relaunch loses nothing (best-effort).
dbus-send --system --print-reply --reply-timeout=4000 \
    --dest=com.ableton.move \
    /com/ableton/move/browser \
    com.ableton.move.Browser.saveSongIfDirty string: \
    >/dev/null 2>&1 || true

# ⚠⚠ $IDX IS A SLOT POSITION, NOT A PICKER PAD. The actuator presses Move's
# pad 68+slot and the shim hands back that same number; `current` reads
# currentSongIndex, which is a position in the library Move sees — two slots.
# So the project is whatever that SLOT'S LINK leads to. This looked the number
# up as a picker pad until 2026-09-22, so a switch to slot 1 checked (and could
# rewire) whichever project sat on pad 1 — and, with nothing on pad 1, BIRTHED a
# "Project 2" and restarted Move (device: a stray "Project 1" and "Project 2",
# each minted by an ordinary switch).
SONG="$(python3 - "$LIBRARY_DIR" "$IDX" <<'PYEOF'
import os, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import library_slots as sl
library, i = sys.argv[1], int(sys.argv[2])
if 0 <= i < len(sl.SLOT_IDS):
    d = os.path.join(library, sl.SLOT_IDS[i])
    for n in (sorted(os.listdir(d)) if os.path.isdir(d) else []):
        f = os.path.join(d, n, "Song.abl")
        if not n.startswith(".") and os.path.isfile(f):
            print(f)
            break
PYEOF
)"

if [ -z "$SONG" ]; then
    # A slot always leads to a real project with a song (library-sync makes
    # it so, and the actuator presses only slots that exist). Nothing here
    # means the library is broken, not that the user wants a project — so
    # say so and open, rather than mint one nobody asked for. (This used to
    # birth a project from the template: that was the second minting path,
    # and every birth it ever logged on a two-slot library was this bug.)
    echo "select-hook: slot $IDX leads to no song — opening unchecked" >&2
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
