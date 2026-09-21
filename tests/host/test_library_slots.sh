#!/usr/bin/env bash
set -euo pipefail

# The set library is a VIEW of the project store: one symlink per project
# (library_slots.py), bind-mounted over Move's Sets/ for a session. This covers
# the three rules that view has to keep, and the guard that replaced the
# "is the bind mount up" check when the verbs stopped touching Sets/ at all.
#
# ⚠ The link must be ABSOLUTE. The library is READ at a different path than it
# LIVES at, so a relative link resolves against the mount point and lands in
# the user's own library. Nothing on a dev machine can reproduce the mount, so
# the absoluteness is asserted directly — it is the one property a passing
# device boot would not distinguish from a broken one until a session ran.

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }
check() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

echo "test_library_slots"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" LIBRARY_DIR="$T/library"
export SETTINGS_JSON="$T/Settings.json" CORE_LIBRARY_DIR="$T/no-core"
export DBX_PY_DIR="$PWD/standalone/scripts"
mkdir -p "$DBX_DIR" "$PROJECTS_DIR" "$LIBRARY_DIR"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"

U1=aaaaaaaa-0000-4000-8000-00000000000a
U2=bbbbbbbb-0000-4000-8000-00000000000b
U3=cccccccc-0000-4000-8000-00000000000c

mkproj() { # root uuid name
    mkdir -p "$1/$2/$3"
    echo '{}' > "$1/$2/$3/Song.abl"
}

# ---- sync: one slot per project --------------------------------------------
mkproj "$PROJECTS_DIR" "$U1" "First Project"
mkproj "$PROJECTS_DIR" "$U2" "Second Project"
sh "$CMD" library-sync >/dev/null

check "a project gets a slot"            test -L "$LIBRARY_DIR/$U1"
check "every project gets one"           test -L "$LIBRARY_DIR/$U2"
check "the slot resolves to the project" test -f "$LIBRARY_DIR/$U1/First Project/Song.abl"

link="$(readlink "$LIBRARY_DIR/$U1")"
case "$link" in
    /*) ok "the link is ABSOLUTE (relative would resolve against the mount point)" ;;
    *)  bad "the link is relative: $link" ;;
esac
[ "$link" = "$PROJECTS_DIR/$U1" ] && ok "it points at the project, not through anything" \
    || bad "unexpected target: $link"

# Idempotent, and silent when there is nothing to say.
out="$(sh "$CMD" library-sync)"
[ -z "$out" ] && ok "a healthy library syncs silently" || bad "rerun said: $out"

# ---- sync: a project that goes away takes its slot ---------------------------
rm -rf "$PROJECTS_DIR/$U2"
sh "$CMD" library-sync >/dev/null
check "a slot with no project behind it is dropped" bash -c "! test -e '$LIBRARY_DIR/$U2'"
check "the surviving slot is untouched"             test -L "$LIBRARY_DIR/$U1"

# ---- sync: what is NOT ours is left alone -----------------------------------
# The DO-NOT-EDIT notice and a directory Move minted for itself both live in
# the library and are neither slots nor ours to remove.
printf 'do not touch\n' > "$LIBRARY_DIR/DO-NOT-EDIT.txt"
mkdir -p "$LIBRARY_DIR/__pending-8-1"
sh "$CMD" library-sync >/dev/null 2>&1 || true
check "the notice survives a sync"  test -f "$LIBRARY_DIR/DO-NOT-EDIT.txt"

# ---- migrate: the one-time move off the old layout --------------------------
# A real project directory sitting IN the library is the pre-Phase-2 shape.
# It moves to the store whole — song, state and all — and comes back as a slot.
mkproj "$LIBRARY_DIR" "$U3" "Old Layout Project"
mkdir -p "$LIBRARY_DIR/$U3/dAVEBOx"
echo 'state-u3' > "$LIBRARY_DIR/$U3/dAVEBOx/seq8sa-state.json"
sh "$CMD" library-sync >/dev/null

check "a library-resident project moves to the store" test -d "$PROJECTS_DIR/$U3"
check "and is shown as a slot afterwards"             test -L "$LIBRARY_DIR/$U3"
check "the move carried the state, not just the song" \
    bash -c "[ \"\$(cat '$PROJECTS_DIR/$U3/dAVEBOx/seq8sa-state.json')\" = state-u3 ]"
check "__pending-* migrates too, so repair-indices can still see it" \
    test -d "$PROJECTS_DIR/__pending-8-1"

# A second run has nothing to move and nothing to say.
out="$(sh "$CMD" library-sync)"
[ -z "$out" ] && ok "migration is idempotent" || bad "rerun said: $out"

# ---- migrate: an id in BOTH places is never merged --------------------------
# ⚠ Remove the slot FIRST: `mkdir -p` through a symlink follows it, so the
# "impostor" would be created inside the store project and the fixture would
# quietly describe a case that never happened.
rm -f "$LIBRARY_DIR/$U1"
mkproj "$LIBRARY_DIR" "$U1" "Impostor"
out="$(sh "$CMD" library-sync 2>&1)"
printf '%s' "$out" | grep -q "BOTH" \
    && ok "a store/library id clash is reported" || bad "the clash was silent: $out"
check "the store copy is not overwritten" test -f "$PROJECTS_DIR/$U1/First Project/Song.abl"
check "the library copy is not deleted"   test -f "$LIBRARY_DIR/$U1/Impostor/Song.abl"
rm -rf "$LIBRARY_DIR/$U1"

# ---- the verbs create and remove slots as a side effect ---------------------
# ⚠ new-at needs user xattrs (it writes the pad index), so this is the one
# block that cannot run everywhere. NAMED skip, not a silent one: without it
# the count below would be identical whether the case ran or not.
if python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$T" 2>/dev/null; then
    mkdir -p "$DBX_DIR/sets/template/Template Project"
    echo '{"tracks":[]}' > "$DBX_DIR/sets/template/Template Project/Song.abl"
    sh "$CMD" new-at 4 "Made By New At" >/dev/null
    made="$(ls "$PROJECTS_DIR" | grep -v "^$U1\$" | grep -v "^$U3\$" | grep -v '^__pending' | sed -n 1p)"
    if [ -n "$made" ]; then
        check "new-at's project gets its slot without a separate sync" \
            test -L "$LIBRARY_DIR/$made"
        sh "$CMD" delete 4 >/dev/null 2>&1 || true
        check "delete takes the slot with the project" \
            bash -c "! test -e '$LIBRARY_DIR/$made'"
    else
        bad "new-at created nothing"
    fi
else
    echo "  skip new-at/delete slot side effects (no user xattrs here; device is ext4+Linux)"
fi

# ---- the guard: neither root may be the user's own Move library -------------
# ⚠ This replaced the "is the bind mount up" check. That one had NO test, and
# its first cut grepped for "bound" in a status line reading "not bound" — so
# it reported every unbound library as bound and created a project in the
# user's native library while claiming to protect it. Provoke this one.
NATIVE=/data/UserData/UserLibrary
# ⚠ Assert the REASON, not just the refusal. `new-at` can fail for half a dozen
# unrelated reasons here (no template, no xattrs), and every one of them would
# read as a guard that works. The message is what distinguishes them.
refuses() { # description  env-assignment…
    local d="$1"; shift
    local out
    if out="$(env "$@" sh "$CMD" new-at 7 "Nope" 2>&1)"; then
        bad "$d — it was ALLOWED"
    elif printf '%s' "$out" | grep -q "inside the user's own Move library"; then
        ok "$d"
    else
        bad "$d — refused, but for another reason: $out"
    fi
}
for bad_root in "$NATIVE" "$NATIVE/Sets"; do
    refuses "refuses a project store at $bad_root" "PROJECTS_DIR=$bad_root"
    refuses "refuses a library at $bad_root/Sets"  "LIBRARY_DIR=$bad_root/Sets"
done
# …and a POSITIVE control, or "refuses everything" would read the same as
# "refuses the right thing". A path that merely LOOKS similar must be allowed.
if PROJECTS_DIR="$T/UserLibrary-elsewhere" sh "$CMD" list >/dev/null 2>&1; then
    ok "control: a store that is not inside the native library is allowed"
else
    bad "the guard refuses an innocent path — it is matching too loosely"
fi

[ "$fails" = 0 ] && echo "PASS: the library is a view of the store, and only ours to write"
exit "$fails"
