#!/usr/bin/env bash
# verify-projects.sh — does project CREATION, LOADING and SAVING look right on
# the device, judged from the filesystem rather than from logs?
#
# Why this exists: on 2026-09-16 an entire debugging session was spent reading
# log lines that were being silently dropped (unified_log uses a trylock). The
# files do not lie and cannot be dropped, so this asks them instead. It is also
# a hedge against ad-hoc greps: every check below was written after a one-off
# command got it wrong — project names contain SPACES, log levels are PADDED
# ("[INFO ]"), and `grep -r dir/` behaves differently from `grep -r dir`.
#
# Read-only. Runs over ssh. Usage:
#     tools/verify-projects.sh [user@host]
set -uo pipefail
HOST="${1:-ableton@move.local}"
DBX=/data/UserData/dbx-host
LIB="$DBX/sets/library"

ssh -o ConnectTimeout=8 "$HOST" "DBX=$DBX LIB=$LIB bash -s" <<'REMOTE'
set -uo pipefail
fail=0
ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }
note() { printf '       %s\n' "$1"; }

echo "== projects on the device =="
shopt -s nullglob
dirs=("$LIB"/*/)
echo "  ${#dirs[@]} project(s)"
echo

for d in "${dirs[@]}"; do
    uuid=$(basename "$d")
    # The song folder is the one holding Song.abl. Never assume it is first in
    # the listing — that assumption IS the set-folder-order bug.
    song=""; state=""
    while IFS= read -r -d '' e; do
        n=$(basename "$e")
        case "$n" in dAVEBOx|dAVEBOx~*) state="$n"; continue;; esac
        [ -f "$e/Song.abl" ] && song="$n"
    done < <(find "$d" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)

    echo "-- ${uuid:0:8}  song='${song:-NONE}'  state='${state:-NONE}'"

    [ -n "$song" ]  && ok "has a song folder Move can open" \
                    || bad "no Song.abl anywhere — Move will treat this pad as empty"
    [ -n "$state" ] && ok "has a dAVEBOx state folder" \
                    || note "no state folder yet (untouched project — not a fault)"

    # CREATION: the state folder must not sort before the song folder, or Move
    # opens the state folder as an empty set and lands on its default song.
    if [ -n "$song" ] && [ -n "$state" ]; then
        first=$(find "$d" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | head -1)
        if [ "$first" = "$state" ]; then
            bad "the STATE folder lists first — Move will not find the song here"
        else
            ok "the song folder lists before the state folder"
        fi
    fi

    # CREATION: nothing may point at the user's personal library.
    if [ -n "$song" ] && grep -aq "user-library" "$d$song/Song.abl" 2>/dev/null; then
        bad "references the USER LIBRARY — breaks on any other device"
        grep -ao 'ableton:/user-library/[^"]*' "$d$song/Song.abl" | sort -u | head -3 | while read -r u; do note "$u"; done
    elif [ -n "$song" ]; then
        ok "no user-library references"
    fi

    # CREATION: Move's own mixer stays neutral; a mute baked in here is
    # invisible on the surface the user actually mixes on.
    if [ -n "$song" ]; then
        python3 - "$d$song/Song.abl" <<'PY' || bad "mixer is not neutral"
import json,sys
d=json.load(open(sys.argv[1]))
bad=[]
for i,t in enumerate(d.get("tracks",[])[:4]):
    m=t.get("mixer",{}) or {}
    if m.get("speakerOn") is False: bad.append("t%d muted"%i)
    if t.get("solo-cue"): bad.append("t%d soloed"%i)
    v=m.get("volume")
    if v not in (None,0.0): bad.append("t%d volume=%s"%(i,v))
sys.exit(1 if bad else 0)
PY
        [ $? -eq 0 ] && ok "Move's mixer is neutral (no mute/solo/trim)"
    fi

    # SAVING: the work must be inside the project.
    if [ -n "$state" ] && [ -f "$d$state/seq8sa-state.json" ]; then
        sz=$(stat -c %s "$d$state/seq8sa-state.json" 2>/dev/null)
        ok "state saved INSIDE the project (${sz} bytes)"
    elif [ -n "$state" ]; then
        note "no state file yet (nothing recorded in this project)"
    fi
    echo
done

echo "== nothing may live outside a project =="
# ⚠ An unmatched glob makes `ls` list the CURRENT directory, which reads as a
# wall of false hits. Ask find, which says nothing when there is nothing.
stray=$(find /data/UserData/schwung -maxdepth 1 -name 'seq8sa*.json' 2>/dev/null)
[ -z "$stray" ] && ok "no dAVEBOx state in the stock install" \
                || { bad "state files in the STOCK tree:"; printf '%s\n' "$stray" | while read -r s; do note "$s"; done; }

q=$(ls -1A "$DBX/quarantine" 2>/dev/null | wc -l)
[ "$q" = "0" ] && ok "quarantine empty (no save ever had nowhere to go)" \
               || { bad "$q parked blob(s) — a save could not name its project"; }

echo
echo "== what the host decided (identity events) =="
if [ -f "$DBX/debug.log" ]; then
    n=$(grep -ac "identity:" "$DBX/debug.log" 2>/dev/null || echo 0)
    if [ "$n" = "0" ]; then
        note "no identity events recorded (may simply be a quiet session)"
    else
        grep -a "identity:" "$DBX/debug.log" | tail -12 | while IFS= read -r l; do note "$l"; done
    fi
    # A save that could not name a project says so, once per session.
    grep -aq "SAVE DEFERRED" "$DBX/debug.log" 2>/dev/null \
        && bad "a save was deferred for having no project identity" \
        || ok "no save was ever left without a project"
    grep -aq "state_load MISS" "$DBX/debug.log" 2>/dev/null \
        && bad "a load did not land (state_load MISS)" \
        || ok "every load landed"
else
    note "no debug.log (logging not armed this session)"
fi

echo
[ "$fail" = 0 ] && echo "RESULT: creation, loading and saving all look correct" \
                || echo "RESULT: problems found above"
exit "$fail"
REMOTE
