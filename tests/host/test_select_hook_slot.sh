#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."

# THE HOOK IS HANDED A SLOT, AND MUST CHECK THE PROJECT THAT SLOT LEADS TO.
#
# Every in-session switch ends in `select-hook.sh <n>`, where n is the slot the
# actuator pressed (0 or 1). The hook looked n up as a PICKER PAD. So a switch
# to slot 1 checked whichever project sat on pad 1 — and with nothing on pad 1
# it birthed a "Project 2" from the template and restarted Move. Device,
# 2026-09-21/22: launch.log carries exactly that, twice, and both strays turned
# up in the picker.
#
# This runs the real hook over a two-slot library whose projects sit on pads 5
# and 9 — so pads 0 and 1 are EMPTY, the shape that minted the strays — and
# asserts what it decided and what it left on disk.

fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fail=1; }

HOOK="${HOOK:-standalone/scripts/select-hook.sh}"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export PYTHONPYCACHEPREFIX="$T/pyc"
export DBX_DIR="$T/dbx" SETTINGS_JSON="$T/Settings.json"
export DBX_PY_DIR="$PWD/standalone/scripts"
STORE="$DBX_DIR/projects" LIB="$DBX_DIR/sets/library"
mkdir -p "$STORE" "$LIB"

SA=5107a000-0000-4000-8000-000000000000
SB=5107b000-0000-4000-8000-000000000001
WIRED=11111111-0000-4000-8000-000000000001
UNWIRED=22222222-0000-4000-8000-000000000002

song() { # dir wired?
    mkdir -p "$1"
    python3 - "$1/Song.abl" "$2" <<'PY'
import json, sys
wired = sys.argv[2] == "1"
tracks = [{"midiInputMode": [i] if wired else [9], "midiOutputEndpoint": None}
          for i in range(4)]
json.dump({"tracks": tracks}, open(sys.argv[1], "w"))
PY
}
song "$STORE/$WIRED/Wired One" 1
song "$STORE/$UNWIRED/Unwired Two" 0
python3 -c "import sys; sys.path.insert(0, sys.argv[1]); import project_pad as pp
pp.set_pad(sys.argv[2], 5); pp.set_pad(sys.argv[3], 9)" \
    "$DBX_PY_DIR" "$STORE/$WIRED" "$STORE/$UNWIRED" 2>/dev/null || true
ln -s "$STORE/$WIRED" "$LIB/$SA"
ln -s "$STORE/$UNWIRED" "$LIB/$SB"
printf '{"currentSongIndex": 1}\n' > "$SETTINGS_JSON"
# A template, as every device has — so a hook that WOULD mint, can.
song "$DBX_DIR/sets/template/Project 1" 1

projects_now() { ls "$STORE" | sort | tr '\n' ' '; }
before="$(projects_now)"
status() { sed -n 's/.*"status": "\([a-z]*\)".*/\1/p' "$DBX_DIR/select_hook_result.json" 2>/dev/null; }
# The hook takes Move down after a relaunch decision; neutralise that here.
PATH="$T/bin:$PATH"; mkdir -p "$T/bin"
printf '#!/bin/sh\nexit 0\n' > "$T/bin/pkill"; chmod +x "$T/bin/pkill"
printf '#!/bin/sh\nexit 0\n' > "$T/bin/dbus-send"; chmod +x "$T/bin/dbus-send"

echo "the hook checks the project the pressed SLOT leads to:"

# ---- slot 1 -> the UNWIRED project, which sits on pad 9 --------------------
rm -f "$DBX_DIR/relaunch_patch.sh" "$DBX_DIR/relaunch_song_index"
out="$(sh "$HOOK" 1 2>&1)"
[ "$(status)" = relaunch ] \
    && ok "slot 1: its project needs wiring, so the hook arms a relaunch" \
    || bad "slot 1: expected relaunch, got '$(status)' — $out"
patch="$(cat "$DBX_DIR/relaunch_patch.sh" 2>/dev/null)"
case "$patch" in
    *"Unwired Two/Song.abl"*) ok "...and the patch rewires the project slot 1 leads to" ;;
    *) bad "...the patch rewires something else: '$patch'" ;;
esac
[ "$(cat "$DBX_DIR/relaunch_song_index" 2>/dev/null)" = 1 ] \
    && ok "...and Move comes back on slot 1" \
    || bad "...relaunch position is '$(cat "$DBX_DIR/relaunch_song_index" 2>/dev/null)', not 1"

# ---- slot 0 -> the WIRED project, which sits on pad 5 ----------------------
rm -f "$DBX_DIR/relaunch_patch.sh"
out="$(sh "$HOOK" 0 2>&1)"
[ "$(status)" = open ] \
    && ok "slot 0: its project is wired, so it opens without a relaunch" \
    || bad "slot 0: expected open, got '$(status)' — $out"
[ -f "$DBX_DIR/relaunch_patch.sh" ] && bad "slot 0 staged a patch it had no reason to"

# ---- current -> currentSongIndex is a SLOT position too ---------------------
out="$(sh "$HOOK" current 2>&1)"
patch="$(cat "$DBX_DIR/relaunch_patch.sh" 2>/dev/null)"
case "$patch" in
    *"Unwired Two/Song.abl"*) ok "current: currentSongIndex 1 is read as slot 1" ;;
    *) bad "current: did not resolve slot 1 — '$patch' / $out" ;;
esac

# ---- ⭐ nothing was minted ---------------------------------------------------
[ "$(projects_now)" = "$before" ] \
    && ok "no project was born — pads 0 and 1 being empty means nothing" \
    || bad "the hook MINTED a project: before '$before' after '$(projects_now)'"

# ---- a slot that leads nowhere opens, and still mints nothing --------------
rm -f "$LIB/$SB"
out="$(sh "$HOOK" 1 2>&1)"
[ "$(status)" = open ] && [ "$(projects_now)" = "$before" ] \
    && ok "a slot with no song opens unchecked and mints nothing" \
    || bad "a missing slot: status '$(status)', projects '$(projects_now)' — $out"
case "$out" in
    *"leads to no song"*) ok "...and says so in the log" ;;
    *) bad "...silently: '$out'" ;;
esac

[ "$fail" = 0 ] && echo "PASS: the hook follows the slot it was handed"
exit "$fail"
