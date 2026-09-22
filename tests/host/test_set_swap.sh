#!/usr/bin/env bash
# The set-swap engine: presenting the standalone library at the session edges
# must never lose or hide one of the user's sets, from ANY state.
#
# Since 2026-08-12 the swap is a BIND MOUNT, not a pile of renames, so the
# property under test changed shape. It is no longer "no set is lost while being
# moved" — nothing moves. It is:
#
#   1. after `enter`, Sets/ shows the standalone library
#   2. after `exit` (or `recover`, from any state), Sets/ shows the USER's sets
#      again — with their content untouched throughout
#   3. currentSongIndex bookkeeping survives the round trip in both directions
#
# ⭑ THE STUB. mount(2) needs root, so the privileged helper is replaced via
# $HEAL_BIN with a script that swaps Sets/ for a SYMLINK to the library. That is
# a faithful stand-in for the one property the script actually tests —
# `sets_are_ours` compares (st_dev, st_ino) of Sets/ against the library, and
# stat() follows symlinks, so the real function runs unmodified and answers
# exactly as it would over a real bind mount. The stub is only ever a stand-in
# for the mount ITSELF; every other line of the state machine is the real thing.
#
# ⚠ What this therefore does NOT cover, and what must be checked on hardware:
# that mount(2)/umount2(2) succeed as the setuid helper, and that Move reads the
# library through a real mount. See the plan's Phase A hardware acceptance list.
set -u
cd "$(dirname "$0")/../.."
SWAP=standalone/scripts/set-swap.sh
[ -f "$SWAP" ] || { echo "FAIL: $SWAP missing" >&2; exit 1; }

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

U1=11111111-aaaa-4bbb-8ccc-000000000001   # the user's own set
U2=22222222-aaaa-4bbb-8ccc-000000000002   # the user's own set
P1=33333333-aaaa-4bbb-8ccc-000000000003   # standalone project
P2=44444444-aaaa-4bbb-8ccc-000000000004   # standalone project made mid-session

mk_env() {
    T="$(mktemp -d)"
    export SETS_DIR="$T/Sets" DBX_DIR="$T/dbx" SWAP_ROOT="$T/dbx/sets"
    export SETTINGS_JSON="$T/Settings.json" HEAL_BIN="$T/heal-stub"
    mkdir -p "$SETS_DIR" "$SWAP_ROOT/library"
    mkdir -p "$SETS_DIR/$U1" "$SETS_DIR/$U2"
    echo native1 > "$SETS_DIR/$U1/Song.abl"; echo native2 > "$SETS_DIR/$U2/Song.abl"
    mkdir -p "$SWAP_ROOT/library/$P1"; echo proj1 > "$SWAP_ROOT/library/$P1/Song.abl"
    printf '{"currentSongIndex": 1, "other": true}\n' > "$SETTINGS_JSON"

    # The stub: stand Sets/ aside and symlink it at the library, so Sets/ and
    # the library become the same inode exactly as a bind mount makes them.
    cat > "$T/heal-stub" <<STUB
#!/bin/sh
case "\$1" in
  --mount-sets)
      [ -L "$SETS_DIR" ] && exit 0
      mv "$SETS_DIR" "$T/Sets.native" && ln -s "$SWAP_ROOT/library" "$SETS_DIR" ;;
  --umount-sets)
      [ -L "$SETS_DIR" ] || exit 0
      rm "$SETS_DIR" && mv "$T/Sets.native" "$SETS_DIR" ;;
  *) echo "stub: unexpected arg \$1" >&2; exit 1 ;;
esac
STUB
    chmod +x "$T/heal-stub"
}
run() { sh "$SWAP" "$@" >/dev/null; }
phase() { sh "$SWAP" status; }
# Content, read through whatever Sets/ currently is.
sets_shows() { test -f "$SETS_DIR/$1/Song.abl"; }

echo "test_set_swap"

# ---- 1. Clean enter/exit round trip -----------------------------------------
mk_env
run enter
check "enter: Sets/ shows the project"      sets_shows "$P1"
check "enter: user's sets not visible"      test ! -e "$SETS_DIR/$U1"
check "enter: phase sa-live + bound"        test "$(phase)" = "sa-live (bound)"
check "enter: song index = SA (0)"          grep -q '"currentSongIndex": 0' "$SETTINGS_JSON"

# a session creates a project and moves the active index
mkdir -p "$SETS_DIR/$P2"; echo proj2 > "$SETS_DIR/$P2/Song.abl"
sed -i.bak 's/"currentSongIndex": 0/"currentSongIndex": 1/' "$SETTINGS_JSON"

run exit
check "exit: user's sets back"              test -f "$SETS_DIR/$U1/Song.abl" -a -f "$SETS_DIR/$U2/Song.abl"
check "exit: user's content intact"         bash -c "[ \"\$(cat '$SETS_DIR/$U1/Song.abl')\" = native1 ]"
check "exit: projects live in the library"  test -f "$SWAP_ROOT/library/$P1/Song.abl" -a -f "$SWAP_ROOT/library/$P2/Song.abl"
check "exit: mid-session project kept"      bash -c "[ \"\$(cat '$SWAP_ROOT/library/$P2/Song.abl')\" = proj2 ]"
check "exit: projects not in Sets/"         test ! -e "$SETS_DIR/$P1"
check "exit: phase none + unbound"          test "$(phase)" = "none (not bound)"
check "exit: native index restored"         grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
check "exit: SA index remembered"           test "$(cat "$SWAP_ROOT/sa_song_index")" = "1"
rm -rf "$T"

# ---- 1b. THE DEVICE TRUTH: a session switches project, currentSongIndex does NOT
#
# ⚠⚠ Case 1 above moves currentSongIndex by hand to represent "the session went
# somewhere". THE REAL SYSTEM NEVER DOES THAT — Move writes that field only at a
# relaunch, and the module deliberately leaves it alone mid-session because Move
# is alive and would clobber it. So case 1 was passing against a fixture that
# behaves better than the device, and the bug lived in the gap: do_exit filed the
# STARTING index as the session position, and every launch reopened it. Josh:
# "the same set shows as the last one on load regardless of what I was in on
# exit."
#
# Here the session moves the way it really moves: the module writes the new
# project's autosave, and nothing touches Settings.json.
#
# ⚠ Needs user.* xattrs (the uuid -> song-index mapping lives there). Linux has
# them; a Mac working copy may not, and this SKIPS LOUDLY rather than passing
# for the wrong reason — CI is Linux, so the pin is real where it counts.
xattr_supported() {
    python3 - "$1" <<'XPY' 2>/dev/null
import os, sys
try:
    os.setxattr(sys.argv[1], "user.probe", b"1")
except Exception:
    sys.exit(1)
XPY
}
set_song_index() { # dir index
    python3 -c 'import os,sys; os.setxattr(sys.argv[1], "user.song-index", sys.argv[2].encode())' "$1" "$2"
}

mk_env
if ! xattr_supported "$SWAP_ROOT"; then
    echo "  SKIP xattrs unsupported here — the session-position pin runs in CI (Linux)"
else
    set_song_index "$SWAP_ROOT/library/$P1" 0
    run enter
    check "1b enter: opened the remembered project (0)" grep -q '"currentSongIndex": 0' "$SETTINGS_JSON"

    # The session switches to a second project. On device this means:
    # active_set.txt names it. It does NOT mean Settings.json changes.
    mkdir -p "$SETS_DIR/$P2/dAVEBOx"
    set_song_index "$SETS_DIR/$P2" 5
    printf '%s\nProject Two\n' "$P2" > "$DBX_DIR/active_set.txt"

    check "1b control: Settings.json still says the OLD project" \
        grep -q '"currentSongIndex": 0' "$SETTINGS_JSON"

    run exit
    check "1b exit: the session position is where the session ENDED (5)" \
        bash -c "[ \"\$(cat '$SWAP_ROOT/sa_song_index')\" = 5 ]"

    run enter
    check "1b relaunch: opens the project you were on, not the one you started on" \
        grep -q '"currentSongIndex": 5' "$SETTINGS_JSON"

    # ⭑⭑ THE TRAP THIS PINS: session_song_index() used to try the newest-mtime
    # per-project autosave FIRST, ahead of active_set.txt, on the theory that
    # "whichever project the module is writing IS the project that is loaded."
    # Deleted (project-identity-design §3A A10) because it is tried at the one
    # moment — exit — that decides where the NEXT session opens, so a live
    # second guess could OVERRIDE active_set.txt, which the host now writes
    # only once Move has CONFIRMED a project is open. Here P1's autosave is
    # made the newer file while active_set.txt still names P2: the OLD
    # heuristic would answer P1 (0), the current code must still answer P2 (5).
    mkdir -p "$SETS_DIR/$P1/dAVEBOx"
    echo '{}' > "$SETS_DIR/$P2/dAVEBOx/seq8sa-state.json"
    sleep 1
    echo '{}' > "$SETS_DIR/$P1/dAVEBOx/seq8sa-state.json"   # newer, but NOT live
    run exit
    check "1b heuristic gone: newest autosave (P1) disagrees, active_set.txt (P2) still wins" \
        bash -c "[ \"\$(cat '$SWAP_ROOT/sa_song_index')\" = 5 ]"

    # ...and with active_set.txt gone it degrades to the old behaviour rather
    # than to any autosave mtime.
    rm -f "$DBX_DIR/active_set.txt"
    run enter
    sed -i.bak 's/"currentSongIndex": 5/"currentSongIndex": 7/' "$SETTINGS_JSON"
    run exit
    check "1b fallback: currentSongIndex when active_set.txt cannot answer" \
        bash -c "[ \"\$(cat '$SWAP_ROOT/sa_song_index')\" = 7 ]"
fi
rm -rf "$T"

# ---- 2. A second session resumes the SA index -------------------------------
mk_env
echo 3 > "$SWAP_ROOT/sa_song_index"
run enter
check "re-enter: SA index applied"          grep -q '"currentSongIndex": 3' "$SETTINGS_JSON"
run exit
check "re-exit: native index restored"      grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
rm -rf "$T"

# ---- 3. Idempotence — the launcher calls these unconditionally ---------------
mk_env
run enter
run enter
check "enter twice: still bound once"       test "$(phase)" = "sa-live (bound)"
check "enter twice: project still visible"  sets_shows "$P1"
run exit
run exit
check "exit twice: still unbound"           test "$(phase)" = "none (not bound)"
check "exit twice: user's sets intact"      test -f "$SETS_DIR/$U1/Song.abl"
rm -rf "$T"

# ---- 4. Crash mid-session, then recover --------------------------------------
# The marker says sa-live and the mount is still up: what a kill -9 leaves.
mk_env
run enter
run recover
check "recover(bound): user's sets back"    test -f "$SETS_DIR/$U1/Song.abl"
check "recover(bound): phase none"          test "$(phase)" = "none (not bound)"
rm -rf "$T"

# ---- 5. Reboot mid-session: mount gone, marker stale -------------------------
# ⭑ The case the mount model makes trivial. A reboot clears mounts, so the user
# is ALREADY looking at their own sets; recover must notice and simply tidy the
# marker + index rather than "restoring" anything.
mk_env
run enter
sh "$HEAL_BIN" --umount-sets            # the reboot, as the kernel does it
run recover
check "recover(rebooted): user's sets"      test -f "$SETS_DIR/$U1/Song.abl"
check "recover(rebooted): phase none"       test "$(phase)" = "none (not bound)"
check "recover(rebooted): native index"     grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
rm -rf "$T"

# ---- 5b. The marker LIES: says none, but our library is still bound ----------
# ⭑ This is why recover asks the world instead of reading the marker. A marker
# written before a crash (or by an older build) can say "none" while the mount
# is up; trusting it strands the user looking at OUR library, with stock Move
# about to be revived on top of it.
mk_env
run enter
printf 'none\n1\n' > "$SWAP_ROOT/swap_state"     # the lie
run recover
check "recover(lying marker): user's sets" test -f "$SETS_DIR/$U1/Song.abl"
check "recover(lying marker): unbound"     test "$(phase)" = "none (not bound)"
rm -rf "$T"

# ---- 6. Nothing to do ---------------------------------------------------------
mk_env
run recover
check "recover(clean): still unbound"       test "$(phase)" = "none (not bound)"
check "recover(clean): sets untouched"      test -f "$SETS_DIR/$U1/Song.abl"
rm -rf "$T"

# ---- 7. LEGACY DRAIN — a device last entered under the RENAME scheme ----------
# Its native sets sit in the old stash. Nothing else moves them back, so exit
# must, or they stay invisible forever.
mk_env
mkdir -p "$SWAP_ROOT/native-stash/$U1"
echo native1 > "$SWAP_ROOT/native-stash/$U1/Song.abl"
rm -rf "${SETS_DIR:?}/$U1"                 # as the old enter left it
run recover
check "legacy: stashed native restored"     test -f "$SETS_DIR/$U1/Song.abl"
check "legacy: content intact"              bash -c "[ \"\$(cat '$SETS_DIR/$U1/Song.abl')\" = native1 ]"
check "legacy: stash removed"               test ! -d "$SWAP_ROOT/native-stash"
rm -rf "$T"

# ---- 8. A POWER LOSS MID-SWITCH boots the slot Move last CONFIRMED -----------
# The session is live on slot b. A switch has re-pointed the IDLE slot a at a
# new project, and the power goes before the press. A reboot clears the mount,
# so no exit ever runs and sa_song_index still says where the last CLEAN
# session ended — slot a here. active_set.txt, written only on a confirmed
# open, still names slot b. Boot must open slot b, and slot a must still hold
# the project it was re-pointed at. Real slot links; no xattrs needed.
SA=5107a000-0000-4000-8000-000000000000
SB=5107b000-0000-4000-8000-000000000001
mk_slots() { # env with two slot links onto a store: a -> P1, b -> P2
    mk_env
    rm -rf "${SWAP_ROOT:?}/library/$P1"
    mkdir -p "$T/store/$P1" "$T/store/$P2" "$T/store/$P3"
    ln -s "$T/store/$P1" "$SWAP_ROOT/library/$SA"
    ln -s "$T/store/$P2" "$SWAP_ROOT/library/$SB"
}
P3=55555555-aaaa-4bbb-8ccc-000000000005   # the project a switch was heading to
reboot_mid_switch() {
    run enter                                   # the session
    printf '%s\nProject Two\n' "$SB" > "$DBX_DIR/active_set.txt"   # confirmed on b
    ln -s "$T/store/$P3" "$SWAP_ROOT/library/$SA.slottmp"          # the switch's
    # rename(2), as _point() does — `mv` onto a link to a DIRECTORY moves into it
    python3 -c 'import os,sys; os.rename(sys.argv[1], sys.argv[2])' \
        "$SWAP_ROOT/library/$SA.slottmp" "$SWAP_ROOT/library/$SA"
    "$HEAL_BIN" --umount-sets                   # the reboot clears the mount...
    # ...and nothing else: no exit ran, so the marker still says sa-live.
}

mk_slots
echo 0 > "$SWAP_ROOT/sa_song_index"             # the last CLEAN exit was on a
reboot_mid_switch
check "8 control: the reboot left a live-looking marker and nothing bound" \
    test "$(phase)" = "sa-live (not bound)"
run recover
check "8 control: recovery did not rewrite the stale position (no exit could)" \
    bash -c "[ \"\$(cat '$SWAP_ROOT/sa_song_index')\" = 0 ]"
run enter
check "8 boot opens slot b, the one Move last confirmed — not the stale 0" \
    grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
check "8 the re-pointed idle slot is intact, still on the switch's project" \
    test "$(readlink "$SWAP_ROOT/library/$SA")" = "$T/store/$P3"
check "8 the live slot is untouched" \
    test "$(readlink "$SWAP_ROOT/library/$SB")" = "$T/store/$P2"
rm -rf "$T"

# A record that cannot be checked against the links is not trusted: a slot
# whose link leads nowhere, or no slot at all, falls back to the saved position.
mk_slots
echo 0 > "$SWAP_ROOT/sa_song_index"
reboot_mid_switch
rm -rf "${T:?}/store/$P2"                       # slot b now dangles
run recover; run enter
check "8 a dangling live slot is not trusted — the saved position is used" \
    grep -q '"currentSongIndex": 0' "$SETTINGS_JSON"
rm -rf "$T"

mk_slots
echo 1 > "$SWAP_ROOT/sa_song_index"
run enter
printf '%s\nProject One\n' "$P1" > "$DBX_DIR/active_set.txt"   # a project id, not a slot
run exit; echo 1 > "$SWAP_ROOT/sa_song_index"
run enter
check "8 an active_set.txt naming no slot falls back to the saved position" \
    grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
rm -rf "$T"

[ "$fails" = 0 ] && echo "PASS: set-swap" || { echo "FAIL: set-swap" >&2; exit 1; }
