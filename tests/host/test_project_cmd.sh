#!/usr/bin/env bash
set -euo pipefail

# project-cmd.sh: the in-session project verbs the hosted module drives.
# Off-device coverage for list (JSON contract) and new (template copy +
# indexing). switch's Move-restart half is device-only (supervisor loop);
# its index write shares code exercised here via `new`.

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1   # no __pycache__ in standalone/scripts
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" SETTINGS_JSON="$T/Settings.json"
mkdir -p "$PROJECTS_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

U1=11111111-aaaa-4bbb-8ccc-000000000001
# ⭐ THE ONE PROJECT SHAPE: Move's song folder has a FIXED name (Move-Set-<id8>)
# and the user's name is a tag, <state>/name.txt (project_name.py).
S1="Move-Set-11111111"
mkdir -p "$PROJECTS_DIR/$U1/$S1"
echo '{}' > "$PROJECTS_DIR/$U1/$S1/Song.abl"
# ⚠ The reserved state subdir sits beside the inner set dir in EVERY fixture —
# Phase B's gate: the one-child sites must be exercised against two children,
# or a dropped filter passes on listdir luck.
mkdir -p "$PROJECTS_DIR/$U1/dAVEBOx"
echo '{"v":36,"fixture":"first"}' > "$PROJECTS_DIR/$U1/dAVEBOx/seq8sa-state.json"
echo 'First Project' > "$PROJECTS_DIR/$U1/dAVEBOx/name.txt"

echo "test_project_cmd"

sh "$CMD" list >/dev/null
check "list writes projects.json" test -f "$DBX_DIR/projects.json"
python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   list JSON contract" || { echo "  FAIL list JSON contract" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
assert d["current"] == 0
assert len(d["projects"]) == 1
p = d["projects"][0]
assert p["uuid"].startswith("11111111") and p["name"] == "First Project", \
    "list named %r — not the name TAG (a folder name leaking through?)" % p["name"]
PY

# `new` creates from template and switches (the pkill half is inert here —
# no MoveOriginal exists; the marker and index write still happen).
sh "$CMD" new "Project 2" >/dev/null
check "new: relaunch marker written" test -f "$DBX_DIR/relaunch_requested"
python3 - "$PROJECTS_DIR" "$SETTINGS_JSON" <<'PY' && echo "  ok   new: project created from template" || { echo "  FAIL new: project created from template" >&2; fails=1; }
import json, os, re, sys
sets_dir, settings = sys.argv[1], sys.argv[2]
dirs = [u for u in os.listdir(sets_dir) if not u.startswith("11111111")]
assert len(dirs) == 1, dirs
inner = sorted(os.listdir(os.path.join(sets_dir, dirs[0])))
# The set dir holds the named project AND the dAVEBOx state dir — the latter
# since 2026-08-24, when creation started seeding a random key/scale note into
# it (project-cmd's seed_random_key). It used to appear only on the first save.
# Asserted as a SET rather than loosened to a substring check: a stray third
# entry here is still worth failing on.
# The state dir's NAME is chosen per project (dAVEBOx or dAVEBOx~<n>, set-folder
# order fix) — so the second entry is matched by the rule, not spelled.
sys.path.insert(0, "standalone/scripts")
import state_subdir as ss
folder = "Move-Set-" + dirs[0][:8]
assert len(inner) == 2 and folder in inner, inner
assert "Project 2" not in inner, "the user's name became a folder again: %r" % inner
st = [n for n in inner if ss.is_state_name(n)]
assert len(st) == 1, inner
seed = os.path.join(sets_dir, dirs[0], st[0], "new-project.json")
assert os.path.isfile(seed), "no key/scale seed written for the new project"
assert open(os.path.join(sets_dir, dirs[0], st[0], "name.txt")).read() == "Project 2\n"
song = json.load(open(os.path.join(sets_dir, dirs[0], folder, "Song.abl")))
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

# S5 (Fix E of the 2026-09-14 new-project plan): do_switch refuses --
# non-zero, logged -- rather than queue a second relaunch while one is
# already in flight.
touch "$DBX_DIR/relaunch_requested"
rm -f "$DBX_DIR/relaunch_song_index"
check "switch refuses while a relaunch is already queued" bash -c '! sh "$0" switch 3 2>/dev/null' "$CMD"
check "refusal is logged" bash -c 'sh "$0" switch 3 2>&1 >/dev/null | grep -qi "relaunch"' "$CMD"
check "refused switch does not queue relaunch_song_index" test ! -f "$DBX_DIR/relaunch_song_index"
rm -f "$DBX_DIR/relaunch_requested"

# ---- color + rename (both find a project BY ITS PICKER PAD, so they can only
# be exercised where user xattrs work: Linux + a real setxattr on $T. macOS
# python has no os.setxattr; tmpfs before 6.6 lacks user.*).
# ⚠ The pad is user.dbx-pad since the split — seeding user.song-index here
# would make every verb below report "no project at index 7", because that is
# Move's ordering index now and no verb reads it. ----
XATTR_OK=0
python3 - "$PROJECTS_DIR/$U1" <<'PY' >/dev/null 2>&1 && XATTR_OK=1
import os, sys
os.setxattr(sys.argv[1], "user.dbx-pad", b"7")
assert os.getxattr(sys.argv[1], "user.dbx-pad") == b"7"
PY
if [ "$XATTR_OK" = 1 ]; then
    sh "$CMD" color 7 3 >/dev/null
    python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   color: set + emitted by list" || { echo "  FAIL color: set + emitted by list" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
p = [x for x in d["projects"] if x["name"] == "First Project"][0]
assert p["color"] == 3, p
PY
    # copy carries the color
    sh "$CMD" copy 7 5 >/dev/null
    python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   copy carries the color" || { echo "  FAIL copy carries the color" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
p = [x for x in d["projects"] if x["index"] == 5][0]
assert p["name"] == "First Project Copy" and p["color"] == 3, p
PY
    python3 - "$PROJECTS_DIR" "$DBX_DIR/projects.json" <<'PY' && echo "  ok   copy gets its OWN song folder, not the source's" || { echo "  FAIL copy song folder" >&2; fails=1; }
import json, os, sys
d = json.load(open(sys.argv[2]))
cu = [x for x in d["projects"] if x["index"] == 5][0]["uuid"]
kids = os.listdir(os.path.join(sys.argv[1], cu))
assert "Move-Set-" + cu[:8] in kids and "Move-Set-11111111" not in kids, kids
PY
    # S2: do_copy also stamps Move's OWN provenance xattrs (Fix D of the
    # 2026-09-14 new-project plan) -- song-color mirroring dbx-color, an
    # ISO-8601 UTC last-modified-time, local-cloud-state=notSynced.
    _copy_dst_uuid=$(python3 -c "import json;print([x for x in json.load(open('$DBX_DIR/projects.json'))['projects'] if x['index']==5][0]['uuid'])")
    python3 - "$PROJECTS_DIR/$_copy_dst_uuid" <<'PY' && echo "  ok   copy stamps Move's own provenance xattrs" || { echo "  FAIL copy stamps Move provenance xattrs" >&2; fails=1; }
import os, sys
d = sys.argv[1]
assert os.getxattr(d, "user.song-color") == b"3", "song-color should mirror dbx-color"
lm = os.getxattr(d, "user.last-modified-time").decode()
assert lm.endswith("Z") and "T" in lm, "not ISO-8601 UTC: %r" % lm
assert os.getxattr(d, "user.local-cloud-state") == b"notSynced"
PY

    # S2: do_new_at stamps the same three xattrs on a freshly-born project.
    sh "$CMD" new-at 20 "New At Project" >/dev/null
    _newat_uuid=$(python3 -c "
import json
d = json.load(open('$DBX_DIR/projects.json'))
print([x for x in d['projects'] if x['index'] == 20][0]['uuid'])")
    check "new-at: the project shows the name it was created with" \
        grep -q '"name": "New At Project"' "$DBX_DIR/projects.json"
    python3 - "$PROJECTS_DIR/$_newat_uuid" <<'PY' && echo "  ok   new-at stamps Move's own provenance xattrs" || { echo "  FAIL new-at stamps Move provenance xattrs" >&2; fails=1; }
import os, sys
d = sys.argv[1]
color = os.getxattr(d, "user.dbx-color").decode()
assert os.getxattr(d, "user.song-color").decode() == color, "song-color should mirror dbx-color"
lm = os.getxattr(d, "user.last-modified-time").decode()
assert lm.endswith("Z") and "T" in lm, "not ISO-8601 UTC: %r" % lm
assert os.getxattr(d, "user.local-cloud-state") == b"notSynced"
PY

    # Phase B: the copy is a whole-uuid-dir copytree, so the state came WITH
    # it - assert the duplicate's dAVEBOx/ holds the source's bytes, and that
    # DELETING the duplicate takes the state along (one rmtree, no second root).
    python3 - "$PROJECTS_DIR" "$DBX_DIR/projects.json" <<'PY' && echo "  ok   copy carries the state INSIDE the set dir" || { echo "  FAIL copy carries the state" >&2; fails=1; }
import json, os, sys
d = json.load(open(sys.argv[2]))
cu = [x for x in d["projects"] if x["index"] == 5][0]["uuid"]
sys.path.insert(0, "standalone/scripts")
import state_subdir as ss
st = os.path.join(sys.argv[1], cu, ss.state_subdir(os.path.join(sys.argv[1], cu)) or "?", "seq8sa-state.json")
assert os.path.isfile(st), "copy has no co-located state file"
assert "fixture" in open(st).read(), "state bytes did not come from the source"
PY
    _copy5_uuid=$(python3 -c "import json;print([x for x in json.load(open('$DBX_DIR/projects.json'))['projects'] if x['index']==5][0]['uuid'])")
    sh "$CMD" delete 5 >/dev/null
    check "delete takes the co-located state with the set dir" \
        bash -c "! test -e '$PROJECTS_DIR/$_copy5_uuid'"
    sh "$CMD" copy 7 5 >/dev/null   # re-create: later checks expect index 5
    sh "$CMD" color 7 -1 >/dev/null
    python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   color: -1 clears (back to null)" || { echo "  FAIL color: -1 clears" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
p = [x for x in d["projects"] if x["name"] == "First Project"][0]
assert p["color"] is None, p
PY

    # rename writes the NAME TAG and moves nothing — open project or not.
    export ACTIVE_SET_PATH="$T/active_set.txt" HOST_STATE_DIR="$DBX_DIR/set_state"
    name1() { cat "$PROJECTS_DIR/$U1"/dAVEBOx*/name.txt; }
    printf '%s\nsomething-else\n' "99999999-dead-dead-dead-000000000000" > "$ACTIVE_SET_PATH"
    rm -f "$DBX_DIR/relaunch_requested" "$DBX_DIR/relaunch_patch.sh"
    sh "$CMD" rename 7 "Renamed Project" >/dev/null
    check "rename: the name tag changed" bash -c "[ \"\$(cat '$PROJECTS_DIR/$U1'/dAVEBOx*/name.txt)\" = 'Renamed Project' ]"
    check "rename: Move's song folder did NOT move" test -f "$PROJECTS_DIR/$U1/$S1/Song.abl"
    check "rename: state file untouched" bash -c "ls '$PROJECTS_DIR/$U1'/dAVEBOx*/seq8sa-state.json >/dev/null 2>&1"
    check "rename: list shows the new name" grep -q '"name": "Renamed Project"' "$DBX_DIR/projects.json"

    # ⭐ rename of the OPEN project is the SAME: immediate, no Move restart. It
    # used to queue an mv for the launcher and restart Move (and once booted a
    # raw pad) — none of that exists now, because nothing on disk moves.
    printf '%s\nMove-Set-11111111\n' "$U1" > "$ACTIVE_SET_PATH"
    sh "$CMD" rename 7 "Open / Renamed" >/dev/null
    check "rename(open): renamed immediately, '/' allowed" \
        bash -c "[ \"\$(cat '$PROJECTS_DIR/$U1'/dAVEBOx*/name.txt)\" = 'Open / Renamed' ]"
    check "rename(open): the song folder did not move" test -f "$PROJECTS_DIR/$U1/$S1/Song.abl"
    check "rename(open): NO relaunch requested" test ! -f "$DBX_DIR/relaunch_requested"
    check "rename(open): NO patch queued"        test ! -f "$DBX_DIR/relaunch_patch.sh"
    check "rename(open): NO boot position"       test ! -f "$DBX_DIR/relaunch_song_index"
    # a newline cannot get into the one-line tag; an empty name is refused
    sh "$CMD" rename 7 "$(printf 'Two\nLines')" >/dev/null
    check "rename: a newline becomes a space" \
        bash -c "[ \"\$(cat '$PROJECTS_DIR/$U1'/dAVEBOx*/name.txt)\" = 'Two Lines' ]"
    check "rename: an empty name is refused" bash -c '! sh "$0" rename 7 "   " >/dev/null 2>&1' "$CMD"
    sh "$CMD" rename 7 "First Project" >/dev/null
else
    echo "  skip color/rename checks (no user-xattr support here; device is ext4+Linux)"
fi

# (The prune section is GONE — Phase C. do_prune reclaimed orphans from the
# parallel host-state root, and that root no longer exists: both state halves
# live inside the set dir, so delete IS complete and orphans cannot form.)

grep -q "project-cmd.sh" scripts/build.sh || { echo "  FAIL not staged into payload" >&2; fails=1; }

[ "$fails" = 0 ] && echo "PASS: project-cmd" || { echo "FAIL: project-cmd" >&2; exit 1; }
