#!/usr/bin/env bash
set -euo pipefail

# The state dir must list AFTER the song folder (set-folder order fix, S6).
#
# Move opens the FIRST subfolder of Sets/<uuid>/ it lists as the song. On the
# device's ext4 that order is a hash of the name, so a fixed `dAVEBOx/` lists
# before the song for about a fifth of all names — measured: "Project 32" loses,
# which is why a new project on pad 31 opened an empty Move set.
#
# Two layers:
#   1. INJECTED ORDER (runs everywhere). DBX_TEST_DIR_ORDER makes the listing
#      return the device's losing order on any filesystem: dAVEBOx, dAVEBOx~1
#      and dAVEBOx~2 before "Project 32", dAVEBOx~3 after it. A control first
#      proves the injection reproduces the bug (a plain dAVEBOx lists first);
#      then `project-cmd.sh new-at 31` must leave the song folder first.
#      Against the pre-fix project-cmd.sh this FAILS: seed_random_key made a
#      plain dAVEBOx/ and kept it.
#   2. REAL ORDER (ext4 only). new-at / copy / rename, then os.listdir()[0] must
#      be the song folder with no injection at all. Skipped on anything else:
#      tmpfs and APFS do not order by a name hash, and on a creation-ordered
#      filesystem the chooser cannot converge (it falls back to the plain name).
#
# PROJECT_CMD overrides the script under test (to run layer 1 against an old
# copy and watch it fail).

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1   # no __pycache__ in standalone/scripts
REPO="$(pwd)"
CMD="${PROJECT_CMD:-standalone/scripts/project-cmd.sh}"
PY="$REPO/standalone/scripts"

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" SETS_DIR="$T/Sets" SETTINGS_JSON="$T/Settings.json" CORE_LIBRARY_DIR="$T/no-core"
mkdir -p "$SETS_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

echo "test_state_subdir_order"

LOSING='dAVEBOx|dAVEBOx~1|dAVEBOx~2|Project 32|dAVEBOx~3'

# ---- 1a. the pure rule, injected order --------------------------------------
if DBX_TEST_DIR_ORDER="$LOSING" python3 - "$PY" "$T/unit" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
import state_subdir as ss
root = sys.argv[2]

def fresh(name):
    d = os.path.join(root, name)
    os.makedirs(os.path.join(d, "Project 32"))
    open(os.path.join(d, "Project 32", "Song.abl"), "w").write("{}")
    return d

# name matching: exactly dAVEBOx or dAVEBOx~<digits>
for n in ("dAVEBOx", "dAVEBOx~1", "dAVEBOx~255"):
    assert ss.is_state_name(n), n
for n in ("dAVEBOx~", "dAVEBOx~3a", "xdAVEBOx", "dAVEBOx Copy", "davebox", "dAVEBOx/"):
    assert not ss.is_state_name(n), n

# CONTROL: the injection really reproduces the losing order.
d = fresh("control")
os.mkdir(os.path.join(d, "dAVEBOx"))
assert not ss.lists_after(d, "dAVEBOx", "Project 32"), "injection did not put dAVEBOx first"
assert ss.listdir(d)[0] == "dAVEBOx", ss.listdir(d)

# creation path: the chooser, not a plain mkdir
d = fresh("create")
got = ss.ensure_state_subdir(d)
assert got == "dAVEBOx~3", got
assert sorted(os.listdir(d)) == ["Project 32", "dAVEBOx~3"], os.listdir(d)
assert ss.listdir(d)[0] == "Project 32"
assert ss.ensure_state_subdir(d) == "dAVEBOx~3"     # stable once chosen

# a project with no song folder still gets a state dir
d = os.path.join(root, "nosong"); os.makedirs(d)
assert ss.ensure_state_subdir(d) == "dAVEBOx"

# re-order: an existing losing dAVEBOx moves, contents and all
d = fresh("fix")
os.mkdir(os.path.join(d, "dAVEBOx"))
open(os.path.join(d, "dAVEBOx", "seq8sa-state.json"), "w").write("keep")
assert ss.fix_state_order(d) == ("dAVEBOx", "dAVEBOx~3")
assert open(os.path.join(d, "dAVEBOx~3", "seq8sa-state.json")).read() == "keep"
assert sorted(os.listdir(d)) == ["Project 32", "dAVEBOx~3"], os.listdir(d)
assert ss.fix_state_order(d) is None                 # idempotent

# two matches (a missed writer re-created dAVEBOx): the one listing last wins
d = fresh("dup")
os.mkdir(os.path.join(d, "dAVEBOx")); os.mkdir(os.path.join(d, "dAVEBOx~3"))
assert ss.state_subdir(d) == "dAVEBOx~3"
assert ss.song_folder(d) == "Project 32"
assert ss.inner_dirs(d) == ["Project 32"]
PY
then ok "pure rule under the device's losing order (control reproduces it)"; else bad "pure rule under the losing order"; fi

# ---- 1b. the real verb, injected order: new-at 31 = "Project 32" ------------
# `|| true`: on macOS python has no getxattr, so new-at's trailing normalize
# dies — AFTER the song and the state dir exist, which is all this asserts.
DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" new-at 31 >/dev/null 2>&1 || true
if DBX_TEST_DIR_ORDER="$LOSING" python3 - "$PY" "$SETS_DIR" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
import state_subdir as ss
sets = sys.argv[2]
u = [x for x in os.listdir(sets) if os.path.isdir(os.path.join(sets, x, "Project 32"))]
assert len(u) == 1, os.listdir(sets)
d = os.path.join(sets, u[0])
first = ss.listdir(d)[0]
assert first == "Project 32", "Move would open %r as the song: %r" % (first, ss.listdir(d))
st = ss.state_subdir(d)
assert st and os.path.isfile(os.path.join(d, st, "new-project.json")), (st, os.listdir(d))
PY
then ok "new-at 31: the song folder lists first under the losing order"; else bad "new-at 31: the song folder lists first under the losing order"; fi

# ---- 2. real order, ext4 only ----------------------------------------------
fstype=""; [ "$(uname)" = Linux ] && fstype="$(stat -f -c %T "$T" 2>/dev/null || true)"
xattr_ok=0
python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$SETS_DIR" 2>/dev/null && xattr_ok=1
if [ "$fstype" = "ext2/ext3" ] && [ "$xattr_ok" = 1 ]; then
    real_first() { # index -> exit 0 when listdir()[0] of that project is its song folder
        python3 - "$PY" "$SETS_DIR" "$1" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
import state_subdir as ss
sets, idx = sys.argv[2], sys.argv[3]
for u in os.listdir(sets):
    p = os.path.join(sets, u)
    try:
        if os.getxattr(p, "user.song-index").decode() != idx:
            continue
    except OSError:
        continue
    kids = os.listdir(p)
    assert ss.state_subdir(p), kids
    assert kids[0] == ss.song_folder(p), kids
    sys.exit(0)
sys.exit("no project at %s" % idx)
PY
    }
    all_ok=1
    for i in 0 1 7 8 12 13 20 21 24 25 28 29 30 31; do
        sh "$CMD" new-at "$i" >/dev/null
        real_first "$i" || { echo "    new-at $i: state dir lists first" >&2; all_ok=0; }
    done
    [ "$all_ok" = 1 ] && ok "ext4: new-at puts the song folder first on 14 pads (incl. 13 14 21 31)" \
                      || bad "ext4: new-at puts the song folder first"
    sh "$CMD" copy 12 2 >/dev/null
    real_first 2 && ok "ext4: copy (\" Copy\" renames the song) keeps the song first" || bad "ext4: copy keeps the song first"
    export ACTIVE_SET_PATH="$T/active_set.txt"; : > "$ACTIVE_SET_PATH"
    rn_ok=1
    for nm in "Project 14" "Project 22" "Project 32" "Zed"; do
        sh "$CMD" rename 0 "$nm" >/dev/null
        real_first 0 || { echo "    rename to \"$nm\": state dir lists first" >&2; rn_ok=0; }
    done
    [ "$rn_ok" = 1 ] && ok "ext4: rename re-orders (4 names)" || bad "ext4: rename re-orders"
else
    echo "  skip real-order checks (fs '$fstype', xattr $xattr_ok — needs ext4 + user xattrs, i.e. the device's filesystem)"
fi

grep -qF "cp ./standalone/scripts/state_subdir.py ./build/scripts/" scripts/build.sh \
    && ok "state_subdir.py is staged into the payload" || bad "state_subdir.py is not staged by scripts/build.sh"

[ "$fails" = 0 ] && echo "PASS: state_subdir_order" || { echo "FAIL: state_subdir_order" >&2; exit 1; }
