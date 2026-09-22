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
mkdir -p "$PROJECTS_DIR/$U1/First Project"
echo '{}' > "$PROJECTS_DIR/$U1/First Project/Song.abl"
# ⚠ The reserved state subdir sits beside the inner set dir in EVERY fixture —
# Phase B's gate: the one-child sites must be exercised against two children,
# or a dropped filter passes on listdir luck.
mkdir -p "$PROJECTS_DIR/$U1/dAVEBOx"
echo '{"v":36,"fixture":"first"}' > "$PROJECTS_DIR/$U1/dAVEBOx/seq8sa-state.json"

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
    "list named %r — dAVEBOx leaking through the one-child filter?" % p["name"]
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
assert len(inner) == 2 and "Project 2" in inner, inner
st = [n for n in inner if ss.is_state_name(n)]
assert len(st) == 1, inner
seed = os.path.join(sets_dir, dirs[0], st[0], "new-project.json")
assert os.path.isfile(seed), "no key/scale seed written for the new project"
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

    # rename of a NON-open project: immediate mv.
    # (The name-index rewrite this block also pinned died with the inherit
    # machinery - Phase 0/B of the state-co-location plan.)
    export ACTIVE_SET_PATH="$T/active_set.txt" HOST_STATE_DIR="$DBX_DIR/set_state"
    printf '%s\nsomething-else\n' "99999999-dead-dead-dead-000000000000" > "$ACTIVE_SET_PATH"
    sh "$CMD" rename 7 "Renamed Project" >/dev/null
    check "rename: inner dir renamed" test -d "$PROJECTS_DIR/$U1/Renamed Project"
    check "rename: state file survives the rename" bash -c "ls '$PROJECTS_DIR/$U1'/dAVEBOx*/seq8sa-state.json >/dev/null 2>&1"
    check "rename: old dir gone" bash -c "! test -d '$PROJECTS_DIR/$U1/First Project'"
    check "rename: no relaunch queued" bash -c "! test -f '$DBX_DIR/relaunch_patch.sh'"

    # rename of the OPEN project: DEFERRED — dir untouched, mv queued for the
    # launcher, relaunch requested at the same index
    rm -f "$DBX_DIR/relaunch_requested"
    printf '%s\nRenamed Project\n' "$U1" > "$ACTIVE_SET_PATH"
    sh "$CMD" rename 7 "Open Renamed" >/dev/null
    check "rename(open): dir NOT renamed yet" test -d "$PROJECTS_DIR/$U1/Renamed Project"
    check "rename(open): mv queued in relaunch_patch.sh" \
        bash -c "grep -q 'Open Renamed' '$DBX_DIR/relaunch_patch.sh'"
    check "rename(open): relaunch requested" test -f "$DBX_DIR/relaunch_requested"
    # ⚠ The SLOT the project is on, not its picker pad (7). This used to assert
    # 7 — the bug itself: Move boots into a position of the two-slot library
    # it sees, and 7 is not one.
    _rsi="$(cat "$DBX_DIR/relaunch_song_index")"
    _lib="${LIBRARY_DIR:-$DBX_DIR/sets/library}"
    _sid="$(python3 -c "import sys; sys.path.insert(0,'standalone/scripts'); import library_slots as sl
i=int(sys.argv[1]); print(sl.SLOT_IDS[i] if 0<=i<2 else '')" "$_rsi" 2>/dev/null)"
    check "rename(open): the boot position is the SLOT the project is on (not pad 7)" \
        bash -c "[ -n '$_sid' ] && [ \"\$(basename \"\$(readlink '$_lib/$_sid')\")\" = '$U1' ]"
    sh "$DBX_DIR/relaunch_patch.sh"
    check "rename(open): queued mv applies" test -d "$PROJECTS_DIR/$U1/Open Renamed"
else
    echo "  skip color/rename checks (no user-xattr support here; device is ext4+Linux)"
fi

# (The prune section is GONE — Phase C. do_prune reclaimed orphans from the
# parallel host-state root, and that root no longer exists: both state halves
# live inside the set dir, so delete IS complete and orphans cannot form.)

grep -q "project-cmd.sh" scripts/build.sh || { echo "  FAIL not staged into payload" >&2; fails=1; }

[ "$fails" = 0 ] && echo "PASS: project-cmd" || { echo "FAIL: project-cmd" >&2; exit 1; }
