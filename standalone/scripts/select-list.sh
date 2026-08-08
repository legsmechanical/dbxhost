#!/bin/sh
# select-list.sh — name source for the set-select actuator.
#
# The shadow UI runs this when an actuator run starts, so its "Loading <name>"
# screen can name the TARGET project from the first frame. Writes
# $DBX_DIR/select_list.json:
#
#   {"title": "...", "current": N, "names": {"<song-index>": "<set name>", ...}}
#
# Index space is user.song-index — the actuator replays pad note 68+k for
# index k, so the JSON is keyed exactly the way the screen looks names up.
# During a standalone session Sets/ IS the project library (set-swap.sh), so
# this reads the live Sets tree, same as project-cmd.sh list.
#
# (Historical: this also fed an interactive select SCREEN, listing sets for the
# user to tap. That surface was retired 2026-08-07 — selection is the module's
# own pad picker now, and the gate is a headless actuator. Naming the loading
# screen is the only remaining consumer.)

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
SETS_DIR="${SETS_DIR:-/data/UserData/UserLibrary/Sets}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
OUT_JSON="$DBX_DIR/select_list.json"

python3 - "$SETS_DIR" "$SETTINGS_JSON" "$OUT_JSON" <<'PYEOF'
import json, os, re, sys
sets_dir, settings, out = sys.argv[1], sys.argv[2], sys.argv[3]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass
names = {}
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
if os.path.isdir(sets_dir):
    for u in os.listdir(sets_dir):
        p = os.path.join(sets_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        inner = [n for n in os.listdir(p)
                 if os.path.isdir(os.path.join(p, n)) and not n.startswith(".")]
        name = inner[0] if inner else u[:8]
        try:
            idx = int(os.getxattr(p, "user.song-index").decode())
        except (OSError, ValueError, AttributeError):
            continue  # unindexed sets have no pad; the picker cannot offer them
        names[str(idx)] = name
tmp = out + ".tmp"
with open(tmp, "w") as f:
    json.dump({"title": "dAVEBOx projects", "current": cur, "names": names}, f)
os.replace(tmp, out)
PYEOF
