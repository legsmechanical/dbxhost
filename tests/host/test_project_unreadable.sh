#!/usr/bin/env bash
set -euo pipefail

# A project whose Song.abl Move cannot read is REFUSED, never handed to Move.
# Move reports such a load as OPENED — the host publishes `open`, the session
# comes back empty and lands on the picker, with nothing anywhere saying why —
# so the file itself is the only place the fault can be seen.
#
# Three layers, each asserted on a garbage Song.abl AND on a healthy one (a
# check that fires on everything would lock the user out of good projects,
# which is the worse failure):
#   list         — projects.json says WHY per project (`broken`), null when fine
#   switch-slot  — the pick-time gate, on the live file: ok:false, no re-point
#   switch       — the relaunch route refuses too, before queueing anything

cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1
CMD=standalone/scripts/project-cmd.sh
[ -f "$CMD" ] || { echo "FAIL: $CMD missing" >&2; exit 1; }

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_project_unreadable"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export DBX_DIR="$T/dbx" PROJECTS_DIR="$T/projects" LIBRARY_DIR="$T/library"
export SETTINGS_JSON="$T/Settings.json" CORE_LIBRARY_DIR="$T/no-core"
export DBX_PY_DIR="$PWD/standalone/scripts"
mkdir -p "$DBX_DIR" "$PROJECTS_DIR" "$LIBRARY_DIR"
printf '{"currentSongIndex": 0}\n' > "$SETTINGS_JSON"

UG=aaaaaaaa-0000-4000-8000-00000000000a   # good: the real template
UB=bbbbbbbb-0000-4000-8000-00000000000b   # garbage
UE=cccccccc-0000-4000-8000-00000000000c   # zero bytes
UM=dddddddd-0000-4000-8000-00000000000d   # no Song.abl at all
UL=eeeeeeee-0000-4000-8000-00000000000e   # valid JSON, but not an object
for u in $UG $UB $UE $UL; do mkdir -p "$PROJECTS_DIR/$u/Move-Set-${u:0:8}" "$PROJECTS_DIR/$u/dAVEBOx"; done
mkdir -p "$PROJECTS_DIR/$UM/dAVEBOx"
python3 standalone/scripts/make-template.py "$PROJECTS_DIR/$UG/Move-Set-${UG:0:8}/Song.abl" >/dev/null
printf 'garbage' > "$PROJECTS_DIR/$UB/Move-Set-${UB:0:8}/Song.abl"
: > "$PROJECTS_DIR/$UE/Move-Set-${UE:0:8}/Song.abl"
echo '[1, 2]' > "$PROJECTS_DIR/$UL/Move-Set-${UL:0:8}/Song.abl"
# Pads, so `switch <pad>` can name them (project_pad.py's xattr).
i=0; for u in $UG $UB $UE $UM; do
    python3 -c 'import os,sys; sys.path.insert(0, os.environ["DBX_PY_DIR"]); import project_pad as pp
pp.set_pad(sys.argv[1], int(sys.argv[2]))' "$PROJECTS_DIR/$u" $i 2>/dev/null || true
    i=$((i+1))
done

# ---- list: projects.json carries WHY, per project --------------------------
sh "$CMD" list >/dev/null
got="$(python3 - "$DBX_DIR/projects.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(" ".join("%s=%s" % (p["uuid"][:8], p.get("broken", "ABSENT")) for p in sorted(d["projects"], key=lambda p: p["uuid"])))
PY
)"
want="aaaaaaaa=None bbbbbbbb=invalid cccccccc=empty dddddddd=missing eeeeeeee=invalid"
[ "$got" = "$want" ] && ok "list: healthy=null, garbage=invalid, empty=empty, no song=missing, JSON non-object=invalid" \
    || bad "list gave: $got (want $want)"

# ---- switch-slot: the pick-time gate, on the live file ---------------------
sw() { sh "$CMD" switch-slot "$@" >/dev/null 2>&1 || true; python3 -c "
import json
d=json.load(open('$DBX_DIR/slot_switch.json'))
print('%s|%s' % (d['ok'], d['why']))"; }
sh "$CMD" library-sync >/dev/null 2>&1
res="$(sw "$UB" "$UG")"
[ "$res" = "False|unreadable:invalid" ] && ok "switch-slot REFUSES a garbage song, saying why" \
    || bad "switch-slot on garbage gave: $res"
res="$(sw "$UE" "$UG")"
[ "$res" = "False|unreadable:empty" ] && ok "switch-slot refuses an empty song" \
    || bad "switch-slot on empty gave: $res"
# ⚠ control: the SAME gate passes a healthy project. The template is the song a
# new project is born with, so this is the project every user has.
res="$(sw "$UG" "$UB")"
[ "${res%%|*}" = "True" ] && ok "⚠ control: switch-slot passes a healthy project" \
    || bad "switch-slot REFUSED the healthy template project: $res"
# The file breaks AFTER listing: the gate reads the live file, not the list.
printf 'now broken' > "$PROJECTS_DIR/$UG/Move-Set-${UG:0:8}/Song.abl"
res="$(sw "$UG" "$UB")"
[ "$res" = "False|unreadable:invalid" ] && ok "a song that broke after listing is refused at the pick" \
    || bad "switch-slot on a since-broken song gave: $res"
python3 standalone/scripts/make-template.py "$PROJECTS_DIR/$UG/Move-Set-${UG:0:8}/Song.abl" >/dev/null

# ---- switch (the relaunch route): refuses before queueing anything ---------
# `switch` names a PAD, and pads are xattrs (project_pad.py), which macOS's
# Python cannot set — so off Linux no pad resolves and there is nothing to
# refuse. Named, not silent: this runs for real under scripts/test-linux.sh.
if python3 -c 'import os,sys; sys.exit(0 if hasattr(os, "setxattr") else 1)'; then
    rm -f "$DBX_DIR/relaunch_requested"
    out="$(sh "$CMD" switch 1 2>&1 || true)"
    case "$out" in
        *"unreadable (invalid)"*) ok "switch refuses to relaunch into a garbage song, saying why" ;;
        *) bad "switch on garbage said: $out" ;;
    esac
    [ ! -e "$DBX_DIR/relaunch_requested" ] && ok "…and queued no relaunch" \
        || bad "a relaunch was queued for an unreadable song"
    # ⚠ control: the same route on the healthy pad DOES queue the relaunch.
    rm -f "$DBX_DIR/relaunch_requested"
    sh "$CMD" switch 0 >/dev/null 2>&1 || true
    [ -e "$DBX_DIR/relaunch_requested" ] && ok "⚠ control: switch to the healthy pad queues the relaunch" \
        || bad "switch to the HEALTHY pad queued nothing — the refusal above proves nothing"
else
    echo "  SKIP switch relaunch refusal: no xattr pads on this platform (runs under scripts/test-linux.sh)"
fi

[ "$fails" = 0 ] && echo "PASS: test_project_unreadable" || { echo "FAIL: test_project_unreadable"; exit 1; }
