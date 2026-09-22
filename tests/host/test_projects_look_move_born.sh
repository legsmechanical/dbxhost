#!/usr/bin/env bash
set -uo pipefail

# EVERY PROJECT MUST CARRY THE TAGS MOVE WRITES ON ITS OWN SETS.
#
# Device, 2026-09-21: every first load of a brand-new project into slot 0
# failed. Move filed a set lacking `user.was-externally-modified` LAST,
# ignoring its song-index, so pad 0 pressed the set Move was already on and
# the load timed out. The same project loaded fine later, once Move had
# processed it and tagged it `true` itself; stamping the tag by hand on a
# never-loaded project made it load first time.
#
# A fix on 2026-09-14 had set three of these tags, in ONE of five birth paths.
# So this performs the real verbs — create, create-at, copy — and a heal of a
# project born bare, and reads the tags off the result.

cd "$(dirname "$0")/../.."
CMD=standalone/scripts/project-cmd.sh
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
# ⚠ Fresh bytecode cache: a stale .pyc for library_slots survived a
# mutate-and-restore of the same size within one second earlier today.
export PYTHONPYCACHEPREFIX="$T/pyc"
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" SETTINGS_JSON="$T/Settings.json"
mkdir -p "$PROJECTS_DIR" "$DBX_DIR/sets/template/Project 1"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"
python3 standalone/scripts/make-template.py "$DBX_DIR/sets/template/Project 1/Song.abl" >/dev/null

echo "every project looks Move-born:"

# User xattrs exist on Linux, not on macOS python. A SKIP is reported as one,
# never as a pass — scripts/test-linux.sh runs this for real.
if ! python3 -c "import os,sys; os.setxattr(sys.argv[1],'user.t',b'1')" "$PROJECTS_DIR" 2>/dev/null; then
    echo "  skip — no user xattrs on this platform; the Linux suite runs this"
    exit 0
fi

# tags_of <project-dir> -> "local-cloud-state=... was-externally-modified=... ..."
tags_of() {
    python3 - "$1" <<'PY'
import os, sys
d = sys.argv[1]
out = []
for n in ("user.local-cloud-state", "user.was-externally-modified",
          "user.song-color", "user.last-modified-time"):
    try:
        out.append("%s=%s" % (n[5:], os.getxattr(d, n).decode()))
    except OSError:
        out.append("%s=ABSENT" % n[5:])
print(" ".join(out))
PY
}
# the project dir of whatever sits on picker pad <k>
dir_at_pad() {
    python3 - "$PROJECTS_DIR" "$1" <<'PY'
import os, sys
sys.path.insert(0, "standalone/scripts")
import project_pad as pp
root, k = sys.argv[1], int(sys.argv[2])
for u in sorted(os.listdir(root)):
    p = os.path.join(root, u)
    if os.path.isdir(p) and pp.pad_of(p) == k:
        print(p); break
PY
}
must_look_born() { # label dir
    local t; t="$(tags_of "$2")"
    case "$t" in
        *ABSENT*) bad "$1 is missing Move's own tags: $t" ;;
        *"was-externally-modified=false"*) ok "$1 carries Move's shape, incl. was-externally-modified=false" ;;
        *) bad "$1 has an unexpected was-externally-modified: $t" ;;
    esac
}

export DBX_PY_DIR="$PWD/standalone/scripts"

# ---- the birth paths, performed ---------------------------------------------
sh "$CMD" new-at 3 >/dev/null 2>&1
d="$(dir_at_pad 3)"
[ -n "$d" ] && must_look_born "new-at (create on a blank pad)" "$d" \
            || bad "new-at made no project on pad 3 — the check cannot see its subject"

sh "$CMD" new "Named One" >/dev/null 2>&1
d="$(ls -d "$PROJECTS_DIR"/*/"Named One" 2>/dev/null | sed -n 1p)"
[ -n "$d" ] && must_look_born "new (create by name)" "$(dirname "$d")" \
            || bad "new made no project — the check cannot see its subject"

sh "$CMD" copy 3 9 >/dev/null 2>&1
d="$(dir_at_pad 9)"
[ -n "$d" ] && must_look_born "copy" "$d" \
            || bad "copy made no project on pad 9 — the check cannot see its subject"

# ---- the heal: a project born BARE by a path that forgot ---------------------
BARE=22222222-bbbb-4ccc-8ddd-000000000002
SEEN=33333333-cccc-4ddd-8eee-000000000003
mkdir -p "$PROJECTS_DIR/$BARE/Bare" "$PROJECTS_DIR/$SEEN/Seen"
echo '{}' > "$PROJECTS_DIR/$BARE/Bare/Song.abl"
echo '{}' > "$PROJECTS_DIR/$SEEN/Seen/Song.abl"
# SEEN: Move already processed it and said so. That answer is Move's.
python3 -c "import os,sys; os.setxattr(sys.argv[1],'user.was-externally-modified',b'true')" "$PROJECTS_DIR/$SEEN"

sh "$CMD" library-sync >/dev/null 2>&1
must_look_born "a project born bare, after library-sync" "$PROJECTS_DIR/$BARE"
case "$(tags_of "$PROJECTS_DIR/$SEEN")" in
    *"was-externally-modified=true"*) ok "a tag Move already wrote (true) is left alone" ;;
    *) bad "the heal OVERWROTE Move's own answer: $(tags_of "$PROJECTS_DIR/$SEEN")" ;;
esac

[ "$fails" = 0 ] && echo "PASS: every way a project is born ends with Move's own shape"
exit "$fails"
