#!/usr/bin/env bash
set -euo pipefail

# Migration for the set-folder order fix (S7): a project whose state dir lists
# BEFORE its song folder is renamed to one that lists after, at launch (inside
# repair-indices) and after every relaunch patch (the `fix-order` verb, which
# runs after every relaunch patch the launcher applies).
#
# The device's losing order is INJECTED (DBX_TEST_DIR_ORDER, see
# standalone/scripts/state_subdir.py) so this runs on any filesystem: under it
# `dAVEBOx` lists before "Project 32" and `dAVEBOx~3` is the first name after.
# A healthy project under an order where it already wins is the silence
# control. repair-indices keys off the pad xattr, so that layer needs user xattrs (Linux) and skip elsewhere.

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1   # no __pycache__ in standalone/scripts
CMD=standalone/scripts/project-cmd.sh
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects"
mkdir -p "$DBX_DIR" "$PROJECTS_DIR"
LOSING='dAVEBOx|dAVEBOx~1|dAVEBOx~2|Project 32|dAVEBOx~3'

U_BAD=aaaaaaaa-0000-4000-8000-00000000000a
U_BAD2=bbbbbbbb-0000-4000-8000-00000000000b
U_OK=cccccccc-0000-4000-8000-00000000000c
mkproj() { # uuid song
    mkdir -p "$PROJECTS_DIR/$1/$2" "$PROJECTS_DIR/$1/dAVEBOx/host"
    echo '{}' > "$PROJECTS_DIR/$1/$2/Song.abl"
    echo "state-$1" > "$PROJECTS_DIR/$1/dAVEBOx/seq8sa-state.json"
    echo '{}' > "$PROJECTS_DIR/$1/dAVEBOx/host/slot_0.json"
}
mkproj "$U_BAD" "Project 32"
mkproj "$U_BAD2" "Project 32"
mkproj "$U_OK" "Project 1"      # the silence control

echo "test_state_order_repair"

# ---- control: the healthy project stays silent ------------------------------
# "Project 1" lists FIRST under this order (named, ahead of the dAVEBOx names).
CTRL='Project 1|dAVEBOx'
out="$(DBX_TEST_DIR_ORDER="$CTRL" sh "$CMD" fix-order "$U_OK")"
[ -z "$out" ] && [ -d "$PROJECTS_DIR/$U_OK/dAVEBOx" ] \
    && ok "control: a project whose song already lists first is left alone, silently" \
    || bad "control: healthy project touched ($out)"

# ---- one uuid: only that project moves -------------------------------------
out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order "$U_BAD")"
if [ -d "$PROJECTS_DIR/$U_BAD/dAVEBOx~3" ] && [ ! -e "$PROJECTS_DIR/$U_BAD/dAVEBOx" ] \
   && [ "$(cat "$PROJECTS_DIR/$U_BAD/dAVEBOx~3/seq8sa-state.json")" = "state-$U_BAD" ] \
   && [ -f "$PROJECTS_DIR/$U_BAD/dAVEBOx~3/host/slot_0.json" ] \
   && [ ! -e "$PROJECTS_DIR/$U_BAD/dAVEBOx~1" ] && [ ! -e "$PROJECTS_DIR/$U_BAD/dAVEBOx~2" ]; then
    ok "fix-order <uuid>: dAVEBOx -> dAVEBOx~3, both halves inside, no probe dirs left"
else
    bad "fix-order <uuid>: $(ls "$PROJECTS_DIR/$U_BAD") / $out"
fi
printf '%s' "$out" | grep -q "dAVEBOx -> dAVEBOx~3" && ok "the move is logged" || bad "the move is not logged"
[ -d "$PROJECTS_DIR/$U_BAD2/dAVEBOx" ] && ok "fix-order <uuid> leaves other projects alone" || bad "fix-order <uuid> touched another project"

# ---- whole library + idempotence -------------------------------------------
DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order >/dev/null
[ -d "$PROJECTS_DIR/$U_BAD2/dAVEBOx~3" ] && ok "fix-order (no uuid) sweeps the library" || bad "fix-order did not sweep"
out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order)"
[ -z "$out" ] && ok "rerun is silent (idempotent)" || bad "rerun not idempotent: $out"

# ---- launcher: fix-order runs after the relaunch patch, Move still down ----
if awk '/sh "\$DBX_DIR\/relaunch_patch.sh"/{p=NR} /project-cmd.sh" fix-order/{if(p&&NR>p)f=1} END{exit !f}' standalone/scripts/launch.sh; then
    ok "launch.sh runs fix-order after applying relaunch_patch.sh"
else
    bad "launch.sh does not run fix-order after the relaunch patch"
fi
# ⚠ CAPTURE, THEN MATCH — do NOT pipe awk into `grep -q` here. Under
# `pipefail`, grep -q exits on the match, awk's final stdio flush hits a
# closed pipe and dies of SIGPIPE (141), and the pipeline reports failure —
# so the check announces the very defect it is hunting. It is a RACE decided
# by size: this range block is 4159 bytes and the match ends at 3631, either
# side of the 4096-byte flush, which is why it fires under full-suite load
# and never in isolation. Seen 2026-09-21. The empty case is separate and
# just as necessary: an awk range that matches NOTHING otherwise reads as
# "the call is absent", which is the same wrong answer by another route.
body="$(awk '/^do_repair_indices\(\)/,/^}/' "$CMD")"
case "$body" in
    *"ss.fix_library_order(projects_dir)"*) ok  "repair-indices runs the re-order pass" ;;
    "")  bad "do_repair_indices not found in $CMD — the check cannot see its subject" ;;
    *)   bad "repair-indices lost the re-order pass" ;;
esac

# ---- xattr layer: repair-indices end to end ---------------------------------
if python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$PROJECTS_DIR" 2>/dev/null; then
    setx() { python3 -c "import os,sys; os.setxattr(sys.argv[1], sys.argv[2], sys.argv[3].encode())" "$@"; }
    U_R=dddddddd-0000-4000-8000-00000000000d
    mkproj "$U_R" "Project 32"; setx "$PROJECTS_DIR/$U_R" user.song-index 31; setx "$PROJECTS_DIR/$U_R" user.dbx-pad 31; setx "$PROJECTS_DIR/$U_R" user.dbx-color 4
    out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" repair-indices)"
    [ -d "$PROJECTS_DIR/$U_R/dAVEBOx~3" ] && printf '%s' "$out" | grep -q "$U_R state dir dAVEBOx -> dAVEBOx~3" \
        && ok "repair-indices re-orders a losing project and logs it" || bad "repair-indices: $out"

    # (The OPEN-rename layer is gone: a rename writes a name TAG and never
    # touches the song folder, so it cannot change the listing order at all —
    # test_project_cmd.sh asserts the folder does not move.)
else
    echo "  skip the repair-indices layer (no user xattrs here; device is ext4+Linux)"
fi

[ "$fails" = 0 ] && echo "PASS: state_order_repair" || { echo "FAIL: state_order_repair" >&2; exit 1; }
