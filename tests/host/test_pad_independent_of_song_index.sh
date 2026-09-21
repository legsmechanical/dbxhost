#!/usr/bin/env bash
set -uo pipefail

# ⭐ THE CHECK THAT MAKES THIS SLICE MEAN ANYTHING.
#
# Splitting the picker pad out of `user.song-index` is behaviour-neutral by
# design: every project is migrated with pad == index, so on a healthy library
# the two numbers are equal and EVERY OTHER TEST PASSES WHETHER THE SPLIT
# HAPPENED OR NOT. A suite that green-lights the no-op is the failure mode this
# whole project keeps paying for.
#
# So this test does the one thing that distinguishes them: it drives the two
# xattrs APART and asserts the picker follows the pad. It fails on pre-split
# code, and it fails again the moment anything starts reading Move's index as
# the pad.

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_pad_independent_of_song_index"

# ⚠ NAMED skip, not a silent one: this needs real user.* xattrs, and a skip
# prints like a pass with an identical total.
_probe="$(mktemp -d)"
if ! python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$_probe" 2>/dev/null; then
    rm -rf "$_probe"
    echo "  skip the whole file (no user-xattr support here; device and CI are ext4+Linux)"
    echo "PASS: pad_independent_of_song_index (SKIPPED — proves nothing on this platform)"
    exit 0
fi
rm -rf "$_probe"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" LIBRARY_DIR="$T/library"
export SETTINGS_JSON="$T/Settings.json"
mkdir -p "$DBX_DIR" "$PROJECTS_DIR" "$LIBRARY_DIR"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"

setx() { python3 -c 'import os,sys; os.setxattr(sys.argv[1], sys.argv[2], sys.argv[3].encode())' "$1" "$2" "$3"; }
pad_in_json() { # uuid -> the index the PICKER would draw it on
    python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
for p in d["projects"]:
    if p["uuid"]==sys.argv[2]:
        print("null" if p["index"] is None else p["index"]); sys.exit(0)
print("absent")' "$DBX_DIR/projects.json" "$1"
}

U_SPLIT=aaaaaaaa-0000-4000-8000-00000000000a
U_IDXONLY=bbbbbbbb-0000-4000-8000-00000000000b

# ---- 1. the two numbers DRIVEN APART ---------------------------------------
# Move would order this directory at 3. The user put it on pad 9.
mkdir -p "$PROJECTS_DIR/$U_SPLIT/Split Project"
echo '{}' > "$PROJECTS_DIR/$U_SPLIT/Split Project/Song.abl"
setx "$PROJECTS_DIR/$U_SPLIT" user.song-index 3
setx "$PROJECTS_DIR/$U_SPLIT" user.dbx-pad    9

sh "$CMD" list >/dev/null 2>&1
got="$(pad_in_json "$U_SPLIT")"
if [ "$got" = 9 ]; then
    ok "the picker follows the PAD (9), not Move's index (3)"
elif [ "$got" = 3 ]; then
    bad "the picker followed Move's index (3) — the split did not happen"
else
    bad "the picker showed '$got', expected 9"
fi

# ---- 2. Move's index is NOT a pad ------------------------------------------
# A project carrying only Move's index has no picker pad at all. This is what
# proves the picker stopped reading that xattr, rather than merely preferring
# the new one when both are present.
mkdir -p "$PROJECTS_DIR/$U_IDXONLY/Index Only"
echo '{}' > "$PROJECTS_DIR/$U_IDXONLY/Index Only/Song.abl"
setx "$PROJECTS_DIR/$U_IDXONLY" user.song-index 5

sh "$CMD" list >/dev/null 2>&1
got2="$(pad_in_json "$U_IDXONLY")"
if [ "$got2" = null ]; then
    ok "a project with only Move's index has NO pad — the picker ignores it"
else
    bad "Move's index leaked in as pad $got2 — the picker still reads it"
fi

# ---- 3. …and the migration is what gives it one -----------------------------
# The same project, after library-sync: the pad it had all along, carried
# across once. This is the step that makes the split invisible to the user.
sh "$CMD" library-sync >/dev/null 2>&1
sh "$CMD" list >/dev/null 2>&1
got3="$(pad_in_json "$U_IDXONLY")"
if [ "$got3" = 5 ]; then
    ok "library-sync carried the pad across (5) — the picker does not move"
else
    bad "after migration the pad is '$got3', expected 5"
fi

# ---- 4. …and it does NOT overwrite a pad that disagrees ---------------------
# The split project still has pad 9 and index 3. A migration that "repaired"
# it back to 3 would silently undo a user's pad choice on every launch.
got4="$(pad_in_json "$U_SPLIT")"
if [ "$got4" = 9 ]; then
    ok "migration left the existing pad alone (still 9, not reset to 3)"
else
    bad "migration overwrote the pad: '$got4', expected 9"
fi

[ "$fails" = 0 ] && echo "PASS: the picker pad is independent of Move's ordering index"
exit "$fails"
