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

# ---- color + rename (both key off the user.song-index xattr, so they can
# only be exercised where user xattrs work: Linux + a real setxattr on $T.
# macOS python has no os.setxattr; tmpfs before 6.6 lacks user.*). ----
XATTR_OK=0
python3 - "$SETS_DIR/$U1" <<'PY' >/dev/null 2>&1 && XATTR_OK=1
import os, sys
os.setxattr(sys.argv[1], "user.song-index", b"7")
assert os.getxattr(sys.argv[1], "user.song-index") == b"7"
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
    sh "$CMD" color 7 -1 >/dev/null
    python3 - "$DBX_DIR/projects.json" <<'PY' && echo "  ok   color: -1 clears (back to null)" || { echo "  FAIL color: -1 clears" >&2; fails=1; }
import json, sys
d = json.load(open(sys.argv[1]))
p = [x for x in d["projects"] if x["name"] == "First Project"][0]
assert p["color"] is None, p
PY

    # rename of a NON-open project: immediate mv + name-index rewrite
    export ACTIVE_SET_PATH="$T/active_set.txt" NAME_INDEX_PATH="$T/name_index.json"
    export SET_STATE_DIR="$T/set_state" HOST_STATE_DIR="$DBX_DIR/set_state"
    printf '%s\nsomething-else\n' "99999999-dead-dead-dead-000000000000" > "$ACTIVE_SET_PATH"
    mkdir -p "$SET_STATE_DIR/$U1"
    echo '{}' > "$SET_STATE_DIR/$U1/seq8sa-state.json"
    printf '{"First Project": "%s", "Stale": "%s"}\n' "$U1" "$U1" > "$NAME_INDEX_PATH"
    sh "$CMD" rename 7 "Renamed Project" >/dev/null
    check "rename: inner dir renamed" test -d "$SETS_DIR/$U1/Renamed Project"
    check "rename: old dir gone" bash -c "! test -d '$SETS_DIR/$U1/First Project'"
    check "rename: no relaunch queued" bash -c "! test -f '$DBX_DIR/relaunch_patch.sh'"
    python3 - "$NAME_INDEX_PATH" "$U1" <<'PY' && echo "  ok   rename: name index rewritten" || { echo "  FAIL rename: name index rewritten" >&2; fails=1; }
import json, sys
idx = json.load(open(sys.argv[1]))
assert idx == {"Renamed Project": sys.argv[2]}, idx   # stale entries dropped
PY

    # rename of the OPEN project: DEFERRED — dir untouched, mv queued for the
    # launcher, relaunch requested at the same index
    rm -f "$DBX_DIR/relaunch_requested"
    printf '%s\nRenamed Project\n' "$U1" > "$ACTIVE_SET_PATH"
    sh "$CMD" rename 7 "Open Renamed" >/dev/null
    check "rename(open): dir NOT renamed yet" test -d "$SETS_DIR/$U1/Renamed Project"
    check "rename(open): mv queued in relaunch_patch.sh" \
        bash -c "grep -q 'Open Renamed' '$DBX_DIR/relaunch_patch.sh'"
    check "rename(open): relaunch requested" test -f "$DBX_DIR/relaunch_requested"
    check "rename(open): same index queued" bash -c "[ \"\$(cat '$DBX_DIR/relaunch_song_index')\" = 7 ]"
    sh "$DBX_DIR/relaunch_patch.sh"
    check "rename(open): queued mv applies" test -d "$SETS_DIR/$U1/Open Renamed"
else
    echo "  skip color/rename checks (no user-xattr support here; device is ext4+Linux)"
fi

# ---------------------------------------------------------------------------
# prune: reclaim HOST state dirs whose set is gone.
#
# No xattrs needed, so this runs everywhere. Its own fixture tree, because the
# whole point is which ROOT a set is sitting in — the checks below are mostly
# "does an ALIVE project survive", and the one that matters most is the SA
# library: outside a session Sets/ holds the user's NATIVE sets, so a prune that
# only knows about Sets/ judges every project dead and deletes the routing for
# the entire library.
# (A set-pages stash was a third such root until 2026-08-12; the 8-page feature
# died in P3, so its case went with it.)
# ---------------------------------------------------------------------------
P="$(mktemp -d)"
trap 'rm -rf "$T" "$P"' EXIT
prune_env() {
    env DBX_DIR="$P/dbx" SETS_DIR="$P/Sets" SETTINGS_JSON="$P/Settings.json" \
        SWAP_ROOT="$P/dbx/sets" LIBRARY_DIR="$P/dbx/sets/library" \
        NATIVE_STASH_DIR="$P/dbx/sets/native-stash" \
        SWAP_STATE_FILE="$P/dbx/sets/swap_state" \
        HOST_STATE_DIR="$P/dbx/set_state" SET_STATE_DIR="$P/set_state" \
        NAME_INDEX_PATH="$P/name_index.json" \
        sh "$CMD" prune
}
LIVE=aaaaaaaa-1111-4111-8111-000000000001      # in Sets/  (in-session library)
LIB=bbbbbbbb-2222-4222-8222-000000000002       # in sets/library/ (no session)
ORPH=dddddddd-4444-4444-8444-000000000004      # nothing behind it: the target
mkdir -p "$P/Sets/$LIVE" "$P/dbx/sets/library/$LIB"
for u in "$LIVE" "$LIB" "$ORPH"; do
    mkdir -p "$P/dbx/set_state/$u"
    echo '{}' > "$P/dbx/set_state/$u/shadow_chain_config.json"
done
mkdir -p "$P/dbx/set_state/not-a-uuid"          # never touched: not uuid-shaped
printf '{"Ghost": "%s"}\n' "$ORPH" > "$P/name_index.json"

prune_env >/dev/null
check "prune: orphan host state removed"      bash -c "! test -d '$P/dbx/set_state/$ORPH'"
check "prune: set in Sets/ survives"          test -d "$P/dbx/set_state/$LIVE"
check "prune: set in the SA LIBRARY survives" test -d "$P/dbx/set_state/$LIB"
check "prune: non-uuid dirs untouched"        test -d "$P/dbx/set_state/not-a-uuid"
# The name index belongs to the module (it holds it in memory and rewrites the
# whole file), so a sweep here would be silently undone — prune must not touch it.
check "prune: name index NOT touched" \
    bash -c "grep -q Ghost '$P/name_index.json'"

# Refusals. Each restores the orphan first, then asserts it SURVIVED — a refusal
# that still deleted would pass a mere exit-code check.
restore_orphan() { mkdir -p "$P/dbx/set_state/$ORPH"; echo '{}' > "$P/dbx/set_state/$ORPH/x.json"; }

restore_orphan
echo "entering" > "$P/dbx/sets/swap_state"
prune_env >/dev/null 2>&1 || true
check "prune: REFUSES mid-swap (sets are moving between roots)" test -d "$P/dbx/set_state/$ORPH"
echo "sa-live" > "$P/dbx/sets/swap_state"

restore_orphan
mv "$P/Sets/$LIVE" "$P/live-hidden"
prune_env >/dev/null 2>&1 || true
check "prune: REFUSES when Sets/ is empty (wrong world)" test -d "$P/dbx/set_state/$ORPH"
mv "$P/live-hidden" "$P/Sets/$LIVE"

# ...and with a settled phase and a populated Sets/, it works again — otherwise
# the two refusals above would pass for any reason at all, including a typo.
prune_env >/dev/null
check "prune: sweeps again once the world looks right" \
    bash -c "! test -d '$P/dbx/set_state/$ORPH'"

grep -q "project-cmd.sh" scripts/build.sh || { echo "  FAIL not staged into payload" >&2; fails=1; }

[ "$fails" = 0 ] && echo "PASS: project-cmd" || { echo "FAIL: project-cmd" >&2; exit 1; }
