#!/usr/bin/env bash
set -euo pipefail

# Migration for the set-folder order fix (S7): a project whose state dir lists
# BEFORE its song folder is renamed to one that lists after, at launch (inside
# repair-indices) and after every relaunch patch (the `fix-order` verb, which
# is how a rename of the OPEN project gets re-ordered).
#
# The device's losing order is INJECTED (DBX_TEST_DIR_ORDER, see
# standalone/scripts/state_subdir.py) so this runs on any filesystem: under it
# `dAVEBOx` lists before "Project 32" and `dAVEBOx~3` is the first name after.
# A healthy project under an order where it already wins is the silence
# control. repair-indices and the open-rename path key off user.song-index,
# so those two layers need user xattrs (Linux) and skip elsewhere.

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" SETS_DIR="$T/Sets"
mkdir -p "$DBX_DIR" "$SETS_DIR"
LOSING='dAVEBOx|dAVEBOx~1|dAVEBOx~2|Project 32|dAVEBOx~3'

U_BAD=aaaaaaaa-0000-4000-8000-00000000000a
U_BAD2=bbbbbbbb-0000-4000-8000-00000000000b
U_OK=cccccccc-0000-4000-8000-00000000000c
mkproj() { # uuid song
    mkdir -p "$SETS_DIR/$1/$2" "$SETS_DIR/$1/dAVEBOx/host"
    echo '{}' > "$SETS_DIR/$1/$2/Song.abl"
    echo "state-$1" > "$SETS_DIR/$1/dAVEBOx/seq8sa-state.json"
    echo '{}' > "$SETS_DIR/$1/dAVEBOx/host/slot_0.json"
}
mkproj "$U_BAD" "Project 32"
mkproj "$U_BAD2" "Project 32"
mkproj "$U_OK" "Project 1"      # the silence control

echo "test_state_order_repair"

# ---- control: the healthy project stays silent ------------------------------
# "Project 1" lists FIRST under this order (named, ahead of the dAVEBOx names).
CTRL='Project 1|dAVEBOx'
out="$(DBX_TEST_DIR_ORDER="$CTRL" sh "$CMD" fix-order "$U_OK")"
[ -z "$out" ] && [ -d "$SETS_DIR/$U_OK/dAVEBOx" ] \
    && ok "control: a project whose song already lists first is left alone, silently" \
    || bad "control: healthy project touched ($out)"

# ---- one uuid: only that project moves -------------------------------------
out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order "$U_BAD")"
if [ -d "$SETS_DIR/$U_BAD/dAVEBOx~3" ] && [ ! -e "$SETS_DIR/$U_BAD/dAVEBOx" ] \
   && [ "$(cat "$SETS_DIR/$U_BAD/dAVEBOx~3/seq8sa-state.json")" = "state-$U_BAD" ] \
   && [ -f "$SETS_DIR/$U_BAD/dAVEBOx~3/host/slot_0.json" ] \
   && [ ! -e "$SETS_DIR/$U_BAD/dAVEBOx~1" ] && [ ! -e "$SETS_DIR/$U_BAD/dAVEBOx~2" ]; then
    ok "fix-order <uuid>: dAVEBOx -> dAVEBOx~3, both halves inside, no probe dirs left"
else
    bad "fix-order <uuid>: $(ls "$SETS_DIR/$U_BAD") / $out"
fi
printf '%s' "$out" | grep -q "dAVEBOx -> dAVEBOx~3" && ok "the move is logged" || bad "the move is not logged"
[ -d "$SETS_DIR/$U_BAD2/dAVEBOx" ] && ok "fix-order <uuid> leaves other projects alone" || bad "fix-order <uuid> touched another project"

# ---- whole library + idempotence -------------------------------------------
DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order >/dev/null
[ -d "$SETS_DIR/$U_BAD2/dAVEBOx~3" ] && ok "fix-order (no uuid) sweeps the library" || bad "fix-order did not sweep"
out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" fix-order)"
[ -z "$out" ] && ok "rerun is silent (idempotent)" || bad "rerun not idempotent: $out"

# ---- launcher: fix-order runs after the relaunch patch, Move still down ----
if awk '/sh "\$DBX_DIR\/relaunch_patch.sh"/{p=NR} /project-cmd.sh" fix-order/{if(p&&NR>p)f=1} END{exit !f}' standalone/scripts/launch.sh; then
    ok "launch.sh runs fix-order after applying relaunch_patch.sh"
else
    bad "launch.sh does not run fix-order after the relaunch patch"
fi
awk '/^do_repair_indices\(\)/,/^}/' "$CMD" | grep -q "ss.fix_library_order(sets_dir)" \
    && ok "repair-indices runs the re-order pass" || bad "repair-indices lost the re-order pass"

# ---- xattr layers: repair-indices end to end, and the OPEN rename ----------
if python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$SETS_DIR" 2>/dev/null; then
    setx() { python3 -c "import os,sys; os.setxattr(sys.argv[1], sys.argv[2], sys.argv[3].encode())" "$@"; }
    U_R=dddddddd-0000-4000-8000-00000000000d
    mkproj "$U_R" "Project 32"; setx "$SETS_DIR/$U_R" user.song-index 31; setx "$SETS_DIR/$U_R" user.dbx-color 4
    out="$(DBX_TEST_DIR_ORDER="$LOSING" sh "$CMD" repair-indices)"
    [ -d "$SETS_DIR/$U_R/dAVEBOx~3" ] && printf '%s' "$out" | grep -q "$U_R state dir dAVEBOx -> dAVEBOx~3" \
        && ok "repair-indices re-orders a losing project and logs it" || bad "repair-indices: $out"

    # OPEN project renamed to a losing name: the patch applies mv, then fix-order.
    U_O=eeeeeeee-0000-4000-8000-00000000000e
    mkproj "$U_O" "Old Name"; setx "$SETS_DIR/$U_O" user.song-index 5
    export ACTIVE_SET_PATH="$T/active_set.txt"; printf '%s\nOld Name\n' "$U_O" > "$ACTIVE_SET_PATH"
    sh "$CMD" rename 5 "Project 32" >/dev/null
    grep -q "fix-order '$U_O'" "$DBX_DIR/relaunch_patch.sh" && ok "rename(open) queues fix-order for that project" \
        || bad "rename(open) did not queue fix-order"
    DBX_TEST_DIR_ORDER="$LOSING" sh "$DBX_DIR/relaunch_patch.sh" >/dev/null
    [ -d "$SETS_DIR/$U_O/Project 32" ] && [ -d "$SETS_DIR/$U_O/dAVEBOx~3" ] \
        && ok "applying the patch renames AND re-orders" || bad "patch: $(ls "$SETS_DIR/$U_O")"
else
    echo "  skip repair-indices/open-rename layers (no user xattrs here; device is ext4+Linux)"
fi

[ "$fails" = 0 ] && echo "PASS: state_order_repair" || { echo "FAIL: state_order_repair" >&2; exit 1; }
