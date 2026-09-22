#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

# A PROJECT'S NAME IS A TAG, AND ONE MODULE SPELLS WHERE IT LIVES.
#
# The user's name used to BE the song folder, so every reader of "the name"
# read a directory listing and a rename moved a folder under a live Move. Now
# Move's song folder has a fixed name (Move-Set-<id8>) and the name is one line
# in <state>/name.txt — standalone/scripts/project_name.py owns both.
#
# This is DERIVED, not listed: an enumeration by hand is the failure this repo
# has paid for twice. It fails when
#   1. a new file spells either literal as a string (it should import the
#      module, or — JS, which cannot — be pinned beside it in check-config);
#   2. the old name-from-folder helper comes back;
#   3. the module is not staged into the payload (every verb would die on the
#      import on the device and nothing here would notice).

fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fail=1; }

echo "the project name has one home:"

# ---- 1. who spells the literals (as STRINGS — comments may name them) -------
# ⚠ --untracked, so a new file is seen before it is ever committed.
got="$(git grep --untracked -l -E "[\"']Move-Set-[\"']|[\"']name\.txt[\"']" \
        -- ':!work' ':!*.md' ':!tests' ':!davebox/tests' ':!tools' | sort)"
want="davebox/ui/ui_persistence.mjs
standalone/scripts/check-config.sh
standalone/scripts/project_name.py"
if [ -z "$got" ]; then
    bad "no file spells the literals at all — this check cannot see its subject"
elif [ "$got" = "$want" ]; then
    ok "the folder prefix and the name file are spelled only by their owner (+ the JS reader, pinned)"
else
    bad "the set of files spelling the name literals changed — import project_name.py instead"
    diff -u <(printf '%s\n' "$want") <(printf '%s\n' "$got") | sed 's/^/    /' >&2
fi

# ---- 2. the name-from-folder helper stays gone -------------------------------
calls="$(git grep --untracked -n -E 'inner_dirs\(' -- ':!work' ':!*.md' ':!tests' ':!davebox/tests' || true)"
if [ -z "$calls" ]; then
    ok "nothing calls inner_dirs() — no name is read off a folder"
else
    bad "inner_dirs() is back: a project name read from a FOLDER"
    printf '%s\n' "$calls" | sed 's/^/    /' >&2
fi

# ---- 3. the module ships -----------------------------------------------------
build="$(cat scripts/build.sh)"
case "$build" in
    *"cp ./standalone/scripts/project_name.py ./build/scripts/"*)
        ok "project_name.py is staged into the payload" ;;
    *)  bad "project_name.py is NOT staged — every project verb dies on the import on the device" ;;
esac

# ---- 4. the loading screen's names come from the TAG, performed -----------
# select-list.sh feeds the host's "Loading <name>" screen by SLOT. Run it over a
# real two-slot library whose song folders are the fixed Move-Set-<id> and whose
# names live only in name.txt: a reader of the folder would say "Move-Set-…".
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/dbx/projects" LIBRARY_DIR="$T/dbx/sets/library"
export SETTINGS_JSON="$T/Settings.json" DBX_PY_DIR="$PWD/standalone/scripts" PYTHONPYCACHEPREFIX="$T/pyc"
mkdir -p "$LIBRARY_DIR"; printf '{"currentSongIndex": 1}\n' > "$SETTINGS_JSON"
A=aaaaaaaa-0000-4000-8000-000000000001 B=bbbbbbbb-0000-4000-8000-000000000002
for pr in "$A:Alpha" "$B:Beta / Two"; do
    u="${pr%%:*}"; n="${pr#*:}"
    mkdir -p "$PROJECTS_DIR/$u/Move-Set-${u:0:8}" "$PROJECTS_DIR/$u/dAVEBOx"
    echo '{}' > "$PROJECTS_DIR/$u/Move-Set-${u:0:8}/Song.abl"
    printf '%s\n' "$n" > "$PROJECTS_DIR/$u/dAVEBOx/name.txt"
done
ln -s "$PROJECTS_DIR/$A" "$LIBRARY_DIR/5107a000-0000-4000-8000-000000000000"
ln -s "$PROJECTS_DIR/$B" "$LIBRARY_DIR/5107b000-0000-4000-8000-000000000001"
sh standalone/scripts/select-list.sh >/dev/null 2>&1
names="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["names"].get("0"), "|", d["names"].get("1"))' "$DBX_DIR/select_list.json" 2>&1)"
[ "$names" = "Alpha | Beta / Two" ] \
    && ok "select-list names each slot by its project's TAG (\"$names\")" \
    || bad "select-list names: '$names' — expected 'Alpha | Beta / Two'"

[ "$fail" = 0 ] && echo "PASS: the project name has one home"
exit "$fail"
