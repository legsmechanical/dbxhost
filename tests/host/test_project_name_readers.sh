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

[ "$fail" = 0 ] && echo "PASS: the project name has one home"
exit "$fail"
