#!/usr/bin/env bash
set -euo pipefail

# project-cmd.sh: the in-session project verbs the hosted module drives.
# Off-device coverage for list (JSON contract) and new (template copy +
# indexing). switch's Move-restart half is device-only (supervisor loop);
# its index write shares code exercised here via `new`.

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" SETS_DIR="$T/Sets" SETTINGS_JSON="$T/Settings.json"
mkdir -p "$SETS_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

U1=11111111-aaaa-4bbb-8ccc-000000000001
mkdir -p "$SETS_DIR/$U1/First Project"
echo '{}' > "$SETS_DIR/$U1/First Project/Song.abl"

echo "test_project_cmd"

sh "$CMD" list >/dev/null
check "list writes projects.json" test -f "$DBX_DIR/projects.json"
python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   list JSON contract" || { echo "  FAIL list JSON contract" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
assert d["current"] == 0
assert len(d["projects"]) == 1
p = d["projects"][0]
assert p["uuid"].startswith("11111111") and p["name"] == "First Project"
PY

# `new` creates from template and switches (the pkill half is inert here —
# no MoveOriginal exists; the marker and index write still happen).
sh "$CMD" new "Project 2" >/dev/null
check "new: relaunch marker written" test -f "$DBX_DIR/relaunch_requested"
python3 - "$SETS_DIR" "$SETTINGS_JSON" <<'PY' && echo "  ok   new: project created from template" || { echo "  FAIL new: project created from template" >&2; fails=1; }
import json, os, re, sys
sets_dir, settings = sys.argv[1], sys.argv[2]
dirs = [u for u in os.listdir(sets_dir) if not u.startswith("11111111")]
assert len(dirs) == 1, dirs
inner = os.listdir(os.path.join(sets_dir, dirs[0]))
assert inner == ["Project 2"], inner
song = json.load(open(os.path.join(sets_dir, dirs[0], "Project 2", "Song.abl")))
assert song["tracks"][0]["midiInputMode"] == [0]   # template wiring intact
PY

sh "$CMD" list >/dev/null
python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   list sees both projects" || { echo "  FAIL list sees both projects" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
assert len(d["projects"]) == 2, d
names = {p["name"] for p in d["projects"]}
assert names == {"First Project", "Project 2"}, names
PY

check "switch rejects junk" bash -c '! sh "$0" switch bogus 2>/dev/null' "$CMD"

grep -q "project-cmd.sh" scripts/build.sh || { echo "  FAIL not staged into payload" >&2; fails=1; }

[ "$fails" = 0 ] && echo "PASS: project-cmd" || { echo "FAIL: project-cmd" >&2; exit 1; }
