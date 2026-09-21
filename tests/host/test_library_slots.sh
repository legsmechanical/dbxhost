#!/usr/bin/env bash
set -euo pipefail

# The set library is a VIEW of the project store, and since the two-slot change
# it is a view of exactly TWO entries however many projects there are. Move sees
# those two fixtures and never a project id; switching re-points the IDLE one.
#
# ⚠ The link must be ABSOLUTE. The library is READ at a different path than it
# LIVES at (bind-mounted over Sets/), so a relative link resolves against the
# mount point and lands in the user's own library. Nothing on a dev machine can
# reproduce the mount, so the absoluteness is asserted directly — it is the one
# property a passing device boot would not distinguish from a broken one until
# a session ran.

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

SLOT_A=5107a000-0000-4000-8000-000000000000
SLOT_B=5107b000-0000-4000-8000-000000000001
U1=aaaaaaaa-0000-4000-8000-00000000000a
U2=bbbbbbbb-0000-4000-8000-00000000000b
U3=cccccccc-0000-4000-8000-00000000000c

mkproj() { mkdir -p "$1/$2/$3"; echo '{}' > "$1/$2/$3/Song.abl"; }
target_of() { readlink "$LIBRARY_DIR/$1" 2>/dev/null | sed 's:.*/::'; }
nslots() { ls -1 "$LIBRARY_DIR" 2>/dev/null | grep -c '^5107' || true; }

# ---- one project: ONE slot, and NO invented second -------------------------
# ⭐ The policy decision (Josh, 2026-09-21): slots are capped at the project
# count. Nothing can be switched to when there is only one project, so a second
# slot would buy a placeholder that could leak into the picker, for no
# behaviour at all.
mkproj "$PROJECTS_DIR" "$U1" "First Project"
sh "$CMD" library-sync >/dev/null
check "one project gets one slot"        test -L "$LIBRARY_DIR/$SLOT_A"
check "and NO second slot is invented"   bash -c "! test -e '$LIBRARY_DIR/$SLOT_B'"
[ "$(nslots)" = 1 ] && ok "the library holds exactly 1 entry" || bad "library holds $(nslots)"

# ---- a second project brings the second slot -------------------------------
mkproj "$PROJECTS_DIR" "$U2" "Second Project"
sh "$CMD" library-sync >/dev/null
check "the second project brings the second slot" test -L "$LIBRARY_DIR/$SLOT_B"
[ "$(target_of "$SLOT_A")" = "$U1" ] && ok "the first slot did not move" \
    || bad "slot A now leads to $(target_of "$SLOT_A")"

link="$(readlink "$LIBRARY_DIR/$SLOT_A")"
case "$link" in
    /*) ok "the link is ABSOLUTE (relative would resolve against the mount point)" ;;
    *)  bad "the link is relative: $link" ;;
esac

# ---- a THIRD project does not get a third slot -----------------------------
mkproj "$PROJECTS_DIR" "$U3" "Third Project"
sh "$CMD" library-sync >/dev/null
[ "$(nslots)" = 2 ] && ok "a third project does NOT get a third slot" \
    || bad "library grew to $(nslots) slots"
check "the third project is in the store all the same" test -d "$PROJECTS_DIR/$U3"

# ---- Move's ordering index is a SLOT property ------------------------------
# It belongs to whichever project each slot points at, and to NO other — so a
# project cannot keep a stale index for a library position it no longer has.
if python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.t", b"1")' "$T" 2>/dev/null; then
    gx() { python3 -c "import os,sys
try: print(os.getxattr(sys.argv[1], 'user.song-index').decode())
except OSError: print('none')" "$1"; }
    [ "$(gx "$PROJECTS_DIR/$(target_of "$SLOT_A")")" = 0 ] \
        && ok "slot 0's target carries index 0" || bad "slot 0 target index wrong"
    [ "$(gx "$PROJECTS_DIR/$(target_of "$SLOT_B")")" = 1 ] \
        && ok "slot 1's target carries index 1" || bad "slot 1 target index wrong"
    [ "$(gx "$PROJECTS_DIR/$U3")" = none ] \
        && ok "a project on NO slot carries no index at all" \
        || bad "the off-slot project kept index $(gx "$PROJECTS_DIR/$U3")"
else
    echo "  skip the song-index ownership checks (no user xattrs here; device is ext4+Linux)"
fi

# ---- the switch primitive --------------------------------------------------
got="$(sh "$CMD" point 1 "$U3")"
[ "$got" = "$U3" ] && ok "point echoes the project the slot RESOLVES to" \
    || bad "point echoed '$got', expected $U3"
[ "$(target_of "$SLOT_B")" = "$U3" ] && ok "…and the slot really leads there" \
    || bad "slot B leads to $(target_of "$SLOT_B")"
[ "$(target_of "$SLOT_A")" = "$U1" ] && ok "the other slot was not touched" \
    || bad "slot A moved to $(target_of "$SLOT_A")"

# ⭐ The rule neither approved doc stated: two slots may never share a project.
# They would share one directory, so one `user.song-index`, and Move would see
# two entries claiming one position.
if sh "$CMD" point 1 "$U1" >/dev/null 2>&1; then
    bad "the two slots were allowed to point at the SAME project"
else
    ok "pointing both slots at one project is REFUSED"
fi

# ---- switch-slot: the whole invariant, in one verb --------------------------
sw() { sh "$CMD" switch-slot "$@" >/dev/null 2>&1; python3 -c "
import json,sys
d=json.load(open('$DBX_DIR/slot_switch.json'))
print('%s %s %s' % (d['ok'], d['slot'], d['project'][:8]))"; }

# Live on whatever slot 0 holds; ask for the project on the OTHER slot. It is
# already on show, so nothing is re-pointed and slot 1 is the answer.
live="$(target_of "$SLOT_A")"; other="$(target_of "$SLOT_B")"
[ "$(sw "$other" "$live")" = "True 1 ${other:0:8}" ] \
    && ok "a project already on a slot is pressed where it is, with no re-point" \
    || bad "switch-slot to the idle slot gave: $(sw "$other" "$live")"

# ⚠ THE CASE THAT BROKE. Asking for the project that is ALREADY LIVE. The early
# success path used to print and fall through, re-point anyway, hit the
# two-slots-one-project guard and write ok:false over its own ok:true —
# reporting failure for the simplest case there is.
[ "$(sw "$live" "$live")" = "True 0 ${live:0:8}" ] \
    && ok "asking for the LIVE project answers its own slot, once, and succeeds" \
    || bad "switch-slot to the live project gave: $(sw "$live" "$live")"

# An off-slot project takes the IDLE slot — never the live one.
# ⚠ SET THE FIXTURE, do not test whether it happens to hold. The first cut
# guarded this block with "unless U3 is already on a slot", U3 WAS on one from
# the case above, and the whole block silently did not run — printing nothing,
# which reads exactly like a pass.
sh "$CMD" point 1 "$U2" >/dev/null 2>&1        # park slot 1 on U2, so U3 is off-slot
live="$(target_of "$SLOT_A")"
off="$U3"
[ "$(target_of "$SLOT_B")" = "$off" ] && bad "fixture failed: $off is still on a slot"
res="$(sw "$off" "$live")"
case "$res" in
    "True 1 ${off:0:8}") ok "an off-slot project takes the IDLE slot, not the live one" ;;
    "True 0 "*) bad "it took the LIVE slot — the invariant is broken" ;;
    *) bad "switch-slot for an off-slot project gave: $res" ;;
esac
[ "$(target_of "$SLOT_A")" = "$live" ] \
    && ok "…and the live slot still leads where it did" \
    || bad "the live slot moved to $(target_of "$SLOT_A")"

[ "$(sw deadbeef-0000-4000-8000-00000000dead "$live")" = "False -1 " ] \
    && ok "a project that does not exist answers ok:false with a reason" \
    || bad "switch-slot for a missing project gave: $(sw deadbeef-0000-4000-8000-00000000dead "$live")"

# ---- the N-slot layout migrates away ---------------------------------------
# The previous phase named one slot per project. Those are not slots any more
# and must go, or Move sees the old library alongside the new one.
ln -s "$PROJECTS_DIR/$U1" "$LIBRARY_DIR/$U1"
sh "$CMD" library-sync >/dev/null
check "a per-project link from the old layout is removed" \
    bash -c "! test -e '$LIBRARY_DIR/$U1'"
[ "$(nslots)" = 2 ] && ok "…and the two slots survive it" || bad "slots now $(nslots)"

# ---- what is NOT ours is left alone ----------------------------------------
printf 'do not touch\n' > "$LIBRARY_DIR/DO-NOT-EDIT.txt"
sh "$CMD" library-sync >/dev/null 2>&1 || true
check "the notice survives a sync" test -f "$LIBRARY_DIR/DO-NOT-EDIT.txt"

# ---- migrate: the one-time move off the pre-store layout -------------------
U4=dddddddd-0000-4000-8000-00000000000d
mkproj "$LIBRARY_DIR" "$U4" "Old Layout Project"
mkdir -p "$LIBRARY_DIR/$U4/dAVEBOx"
echo 'state-u4' > "$LIBRARY_DIR/$U4/dAVEBOx/seq8sa-state.json"
sh "$CMD" library-sync >/dev/null
check "a library-resident project moves to the store" test -d "$PROJECTS_DIR/$U4"
check "the move carried the state, not just the song" \
    bash -c "[ \"\$(cat '$PROJECTS_DIR/$U4/dAVEBOx/seq8sa-state.json')\" = state-u4 ]"

out="$(sh "$CMD" library-sync)"
[ -z "$out" ] && ok "a healthy library syncs silently" || bad "rerun said: $out"

# ---- every boot position is a SLOT, never a picker pad ---------------------
# ⚠⚠ THE BUG THIS PINS, found on the device: deleting the OPEN project wrote
# the lowest remaining PICKER PAD into relaunch_song_index. Move boots into a
# position in the library IT sees — two slots — so a pad names nothing, and the
# device sat on the deleting screen with nothing to come back to.
# Three places write that file. They must all translate.
# ⚠ awk -v, not an interpolated pattern. The first cut wrote the function name
# into a double-quoted awk program where the shell did NOT expand it, so awk
# matched nothing, and the check reported "does not write a boot position" —
# green, for both functions that certainly do. A body this check cannot find is
# a FAILURE, never a pass.
for _fn in do_switch do_delete; do
    _body="$(awk -v f="^$_fn\\(\\)" '$0 ~ f, /^}/' "$CMD")"
    if [ -z "$_body" ]; then
        bad "$_fn not found in $CMD — the check cannot see what it is pinning"
    elif ! printf '%s' "$_body" | grep -q 'relaunch_song_index'; then
        bad "$_fn no longer writes a boot position — this pin has lost its subject"
    elif printf '%s' "$_body" | grep -q 'boot_slot_for_pad'; then
        ok "$_fn translates its boot position to a slot"
    else
        bad "$_fn writes relaunch_song_index WITHOUT translating — Move would boot nowhere"
    fi
done
grep -q 'slot-of' standalone/scripts/select-hook.sh \
    && ok "select-hook translates its boot position too (the third writer)" \
    || bad "select-hook writes a boot position without asking for a slot"

# The deferred delete must also leave the library consistent: the deleted
# project's slot leads nowhere, and a relaunch does not run the launch-time
# sync.
# ⚠ Capture, then match. `awk … | grep -q` under pipefail is a RACE: grep -q
# exits on its first match, awk takes SIGPIPE, and pipefail turns that into a
# failed pipeline — so this reported the defect it was hunting, at random. It
# passed alone and failed inside the full suite, which is the worst version.
_del_body="$(awk -v f='^do_delete\\(\\)' '$0 ~ f, /^}/' "$CMD")"
case "$_del_body" in
    *library-sync*) ok "the deferred delete re-syncs the library before Move restarts" ;;
    "")             bad "do_delete not found — this pin cannot see its subject" ;;
    *)              bad "a deleted open project leaves its slot dangling for Move to enumerate" ;;
esac

# ---- the guard: neither root may be the user's own Move library ------------
# ⚠ Assert the REASON. library-sync can fail for unrelated causes, and every
# one of them would read as a guard that works.
refuses() {
    local d="$1"; shift
    local out
    if out="$(env "$@" sh "$CMD" library-sync 2>&1)"; then
        bad "$d — it was ALLOWED"
    elif printf '%s' "$out" | grep -q "inside the user's own Move library"; then
        ok "$d"
    else
        bad "$d — refused, but for another reason: $out"
    fi
}
refuses "refuses a store inside the native library"   "PROJECTS_DIR=/data/UserData/UserLibrary/x"
refuses "refuses a library inside the native library" "LIBRARY_DIR=/data/UserData/UserLibrary/Sets"

[ "$fails" = 0 ] && echo "PASS: the library shows two slots, and only ours to write"
exit "$fails"
