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
# The library the slots live in — the names are keyed by SLOT now.
LIBRARY_DIR="${LIBRARY_DIR:-$DBX_DIR/sets/library}"
SETTINGS_JSON="${SETTINGS_JSON:-/data/UserData/settings/Settings.json}"
OUT_JSON="$DBX_DIR/select_list.json"
# The state dir inside each project dir (Phase B) — skipped when hunting the
# inner set dir. Its name is dAVEBOx or dAVEBOx~<n> per project (set-folder order
# fix), so the rule is imported from state_subdir.py beside this script.
DBX_PY_DIR="${DBX_PY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
export DBX_PY_DIR
# No __pycache__ beside the scripts (the install tree is a manifest-checked payload).
export PYTHONDONTWRITEBYTECODE=1

python3 - "$LIBRARY_DIR" "$PROJECTS_DIR" "$SETTINGS_JSON" "$OUT_JSON" <<'PYEOF'
import json, os, re, sys
sys.path.insert(0, os.environ["DBX_PY_DIR"])
import state_subdir as ss
import library_slots as sl
library, projects_dir, settings, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cur = 0
try:
    m = re.search(r'"currentSongIndex":\s*(-?\d+)', open(settings).read())
    if m: cur = int(m.group(1))
except OSError:
    pass

# ⚠⚠ KEYED BY SLOT, NOT BY PICKER PAD.
#
# The actuator replays pad note 68+k for the index it was ARMED with, and since
# the two-slot change that index is a SLOT position, not the project's pad. The
# screen looks a name up by that same number, so keying this by pad names
# whichever project happens to sit on pad 0 or pad 1 — which is not the project
# being loaded, and is wrong in a way that looks like a cosmetic glitch rather
# than a mismatch: the right project still loads, under the wrong name.
# Reported by Josh, 2026-09-21: "25 says it's loading 7 and 26 says its loading
# 1" — pad 1 is Project 7 and pad 0 is Project 1, exactly.
names = {}
for i, sid in enumerate(sl.SLOT_IDS):
    pid = sl.slot_target(library, sid)
    if not pid:
        continue                       # that slot is not in use
    p = os.path.join(projects_dir, pid)
    if not os.path.isdir(p):
        continue                       # dangling: name nothing rather than guess
    inner = ss.inner_dirs(p)
    names[str(i)] = inner[0] if inner else pid[:8]
tmp = out + ".tmp"
with open(tmp, "w") as f:
    json.dump({"title": "dAVEBOx projects", "current": cur, "names": names}, f)
os.replace(tmp, out)
PYEOF
