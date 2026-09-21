#!/bin/sh
# select-list.sh — name source for the set-select actuator.
#
# The shadow UI runs this when an actuator run starts, so its "Loading <name>"
# screen can name the TARGET project from the first frame. Writes
# $DBX_DIR/select_list.json:
#
#   {"title": "...", "current": N, "names": {"<song-index>": "<set name>", ...}}
#
# Index space is the project's PICKER PAD (project_pad.py) — ours, and since
# the split no longer Move's ordering index. The JSON is keyed exactly the way
# the screen looks names up.
# ⭐ Read from the PROJECT STORE, not from the set library: the library is a
# view of symlinks (library_slots.py) and a name read through a link is a name
# read twice. Same root project-cmd.sh list enumerates, so the two cannot
# disagree about what exists.
#
# (Historical: this also fed an interactive select SCREEN, listing sets for the
# user to tap. That surface was retired 2026-08-07 — selection is the module's
# own pad picker now, and the gate is a headless actuator. Naming the loading
# screen is the only remaining consumer.)

set -eu

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
PROJECTS_DIR="${PROJECTS_DIR:-$DBX_DIR/projects}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
OUT_JSON="$DBX_DIR/select_list.json"
# The state dir inside each project dir (Phase B) — skipped when hunting the
# inner set dir. Its name is dAVEBOx or dAVEBOx~<n> per project (set-folder order
# fix), so the rule is imported from state_subdir.py beside this script.
DBX_PY_DIR="${DBX_PY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
export DBX_PY_DIR
# No __pycache__ beside the scripts (the install tree is a manifest-checked payload).
export PYTHONDONTWRITEBYTECODE=1

python3 - "$PROJECTS_DIR" "$SETTINGS_JSON" "$OUT_JSON" <<'PYEOF'
import json, os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import state_subdir as ss
import project_pad as pp
projects_dir, settings, out = sys.argv[1], sys.argv[2], sys.argv[3]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass
names = {}
uuid_re = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$')
if os.path.isdir(projects_dir):
    for u in os.listdir(projects_dir):
        p = os.path.join(projects_dir, u)
        if not os.path.isdir(p) or not uuid_re.match(u):
            continue
        inner = ss.inner_dirs(p)
        name = inner[0] if inner else u[:8]
        idx = pp.pad_of(p)
        if idx is None:
            continue  # no picker pad; the picker cannot offer it
        names[str(idx)] = name
tmp = out + ".tmp"
with open(tmp, "w") as f:
    json.dump({"title": "dAVEBOx projects", "current": cur, "names": names}, f)
os.replace(tmp, out)
PYEOF
