#!/usr/bin/env bash
set -uo pipefail

# The picker pad and Move's ordering index used to be the same xattr. Splitting
# them is only safe if the split STAYS split, and the way that rots is somebody
# spelling one of the two names in a new place instead of calling the accessor.
#
# ⚠ There is no equivalent of this check for `user.song-index` in the history of
# this repo, and the enumeration that found every reader of it was produced BY
# HAND. Deriving the set mechanically is the only thing that has ever caught the
# reader nobody listed — `test_set_path_sites.sh` found two path builders that
# neither a written list nor an adversarial review contained.
#
# So this fails when:
#   * `user.dbx-pad` is spelled anywhere but its one home, or
#   * `user.song-index` is spelled outside the files allowed to know Move's
#     ordering, or
#   * the accessor module stops existing.

cd "$(dirname "$0")/../.."

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_project_pad_readers"

HOME_FILE=standalone/scripts/project_pad.py
[ -f "$HOME_FILE" ] || { bad "$HOME_FILE is missing — the pad has no home"; exit 1; }

# ---- 1. the picker pad has exactly ONE speller in PRODUCT code --------------
# Scope is deliberate. ':!work' keeps the private notes out — they DESCRIBE the
# xattr and are not code. ':!tests' keeps FIXTURES out: a test that seeds the
# raw xattr is doing the one honest thing it can do, because seeding through
# the accessor would make the fixture agree with the accessor by construction
# and the test would pass even if both were wrong. So tests may spell it;
# nothing that SHIPS may, apart from its home and the pin that guards it.
pad_files=$(git grep -l 'user\.dbx-pad' -- ':!work' ':!*.md' ':!tests' ':!davebox/tests' | sort)
want_pad="standalone/scripts/check-config.sh
standalone/scripts/project_pad.py"
if [ "$pad_files" = "$(printf '%s' "$want_pad")" ]; then
    ok "user.dbx-pad is spelled only in its home, its pin and this check"
else
    bad "the set of files spelling user.dbx-pad changed"
    diff -u <(printf '%s\n' "$want_pad") <(printf '%s\n' "$pad_files") | sed 's/^/    /' >&2
fi

# ---- 2. zero collected is not green -----------------------------------------
n_pad=$(printf '%s\n' "$pad_files" | grep -c .)
if [ "$n_pad" -eq 0 ]; then
    bad "the extractor found ZERO files spelling user.dbx-pad — the grep is wrong"
else
    ok "extractor collected $n_pad file(s)"
fi

# ---- 3. Move's ordering index stays where Move's ordering lives --------------
# These are the files allowed to know `user.song-index`. It is MOVE'S number:
# the shim and set-pages resolve Move's currentSongIndex with it, set-swap
# restores a session position with it, project_pad.py reads it for the one-time
# pad migration — and `library_slots.py` is the ONE WRITER, because it is a
# SLOT property now, belonging to whichever project each slot points at.
# ⭐ project-cmd.sh, select-hook.sh and launch.sh dropped off this list when
# they stopped stamping it per project. That is the change, and this check is
# how it is kept: a verb that starts authoring it again fails here.
# (check-config.sh names it in order to PIN the owner — a checker appearing in
# its own subject list, same as it does for the pad.)
idx_files=$(git grep -l 'user\.song-index' -- ':!work' ':!*.md' ':!tests' ':!davebox/tests' ':!tools' | sort)
want_idx="src/host/shadow_constants.h
src/host/shadow_loaded_set_policy.h
src/host/shadow_set_pages.c
src/schwung_shim.c
standalone/scripts/check-config.sh
standalone/scripts/library_slots.py
standalone/scripts/project_pad.py
standalone/scripts/set-swap.sh"
if [ "$idx_files" = "$(printf '%s' "$want_idx")" ]; then
    ok "user.song-index is confined to the files that answer to Move"
else
    bad "the set of files spelling user.song-index changed — review, then update the list"
    diff -u <(printf '%s\n' "$want_idx") <(printf '%s\n' "$idx_files") | sed 's/^/    /' >&2
fi

# ---- 4. the accessor is what the shell verbs actually call -------------------
# A file could import the module and still hand-roll the xattr beside it; this
# only proves the import is there, which is the cheap half. Part 1 is what
# makes the expensive half unnecessary.
for f in standalone/scripts/project-cmd.sh \
         standalone/scripts/select-list.sh \
         standalone/scripts/select-hook.sh; do
    if grep -q 'import project_pad as pp' "$f"; then
        ok "$(basename "$f") reads the pad through the accessor"
    else
        bad "$(basename "$f") does not import project_pad — it is spelling something itself"
    fi
done

[ "$fails" = 0 ] && echo "PASS: the picker pad and Move's index stay separate"
exit "$fails"
