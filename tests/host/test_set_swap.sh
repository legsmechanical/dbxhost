#!/usr/bin/env bash
set -euo pipefail

# The set-swap engine: the standalone session's library swap must never lose
# or duplicate a set, from ANY phase — including every crash point.
#
# Runs the real script against tmpdir fixtures (all paths env-injectable).
# xattrs and Settings.json degrade gracefully; the property under test is set
# CONTENT preservation and state-machine convergence.

cd "$(dirname "$0")/../.."
SWAP=standalone/scripts/set-swap.sh
[ -f "$SWAP" ] || { echo "FAIL: $SWAP missing" >&2; exit 1; }

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

U1=11111111-aaaa-4bbb-8ccc-000000000001   # native
U2=22222222-aaaa-4bbb-8ccc-000000000002   # native
P1=33333333-aaaa-4bbb-8ccc-000000000003   # SA project
P2=44444444-aaaa-4bbb-8ccc-000000000004   # SA project created mid-session

mk_env() {
    T="$(mktemp -d)"
    export SETS_DIR="$T/Sets" DBX_DIR="$T/dbx" SWAP_ROOT="$T/dbx/sets"
    export SETTINGS_JSON="$T/Settings.json"
    mkdir -p "$SETS_DIR" "$SWAP_ROOT/library"
    mkdir -p "$SETS_DIR/$U1" "$SETS_DIR/$U2"
    echo native1 > "$SETS_DIR/$U1/Song.abl"; echo native2 > "$SETS_DIR/$U2/Song.abl"
    mkdir -p "$SWAP_ROOT/library/$P1"; echo proj1 > "$SWAP_ROOT/library/$P1/Song.abl"
    printf '{"currentSongIndex": 1, "other": true}\n' > "$SETTINGS_JSON"
}
run() { sh "$SWAP" "$@" >/dev/null; }
phase() { sh "$SWAP" status; }

echo "test_set_swap"

# ---- 1. Clean enter/exit round trip ----------------------------------------
mk_env
run enter
check "enter: natives stashed"        test -f "$SWAP_ROOT/native-stash/$U1/Song.abl" -a -f "$SWAP_ROOT/native-stash/$U2/Song.abl"
check "enter: project live in Sets/"  test -f "$SETS_DIR/$P1/Song.abl"
check "enter: Sets/ holds no natives" test ! -e "$SETS_DIR/$U1"
check "enter: phase sa-live"          test "$(phase)" = "sa-live"
check "enter: song index = SA (0)"    grep -q '"currentSongIndex": 0' "$SETTINGS_JSON"
# session creates a new project + moves the active index
mkdir -p "$SETS_DIR/$P2"; echo proj2 > "$SETS_DIR/$P2/Song.abl"
sed -i.bak 's/"currentSongIndex": 0/"currentSongIndex": 1/' "$SETTINGS_JSON"
run exit
check "exit: natives back"            test -f "$SETS_DIR/$U1/Song.abl" -a -f "$SETS_DIR/$U2/Song.abl"
check "exit: both projects in library" test -f "$SWAP_ROOT/library/$P1/Song.abl" -a -f "$SWAP_ROOT/library/$P2/Song.abl"
check "exit: Sets/ holds no projects" test ! -e "$SETS_DIR/$P1"
check "exit: phase none"              test "$(phase)" = "none"
check "exit: native index restored"   grep -q '"currentSongIndex": 1' "$SETTINGS_JSON"
check "exit: SA index remembered"     test "$(cat "$SWAP_ROOT/sa_song_index")" = "1"
rm -rf "$T"

# ---- 2. Second session resumes the SA index --------------------------------
mk_env
run enter; run exit
echo 3 > "$SWAP_ROOT/sa_song_index"
run enter
check "re-enter: SA index applied"    grep -q '"currentSongIndex": 3' "$SETTINGS_JSON"
run exit
rm -rf "$T"

# ---- 3. Crash mid-ENTER (natives half-stashed), then recover ---------------
mk_env
run enter
# simulate the crash by rewinding state to 'entering' with one native back in Sets/
mv "$SWAP_ROOT/native-stash/$U1" "$SETS_DIR/$U1"
printf 'entering\n1\n' > "$SWAP_ROOT/swap_state"
run recover
check "recover(entering): both natives in Sets/" test -f "$SETS_DIR/$U1/Song.abl" -a -f "$SETS_DIR/$U2/Song.abl"
check "recover(entering): projects safe in library" test -f "$SWAP_ROOT/library/$P1/Song.abl"
check "recover(entering): phase none" test "$(phase)" = "none"
check "recover(entering): no duplicates" test "$(find "$T" -name Song.abl | wc -l | tr -d ' ')" = "3"
rm -rf "$T"

# ---- 4. Crash while SA-LIVE (hard reboot), then boot-time recover ----------
mk_env
run enter
mkdir -p "$SETS_DIR/$P2"; echo proj2 > "$SETS_DIR/$P2/Song.abl"   # made mid-session
run recover
check "recover(sa-live): natives restored"  test -f "$SETS_DIR/$U1/Song.abl" -a -f "$SETS_DIR/$U2/Song.abl"
check "recover(sa-live): projects (incl. new) in library" test -f "$SWAP_ROOT/library/$P1/Song.abl" -a -f "$SWAP_ROOT/library/$P2/Song.abl"
check "recover(sa-live): phase none"        test "$(phase)" = "none"
rm -rf "$T"

# ---- 5. Crash mid-EXIT, then recover ---------------------------------------
mk_env
run enter
sh "$SWAP" exit >/dev/null &
wait $! 2>/dev/null || true
# simulate a crash that left one native still stashed
if [ -d "$SETS_DIR/$U2" ]; then mv "$SETS_DIR/$U2" "$SWAP_ROOT/native-stash/$U2"; fi
printf 'exiting\n1\n' > "$SWAP_ROOT/swap_state"
run recover
check "recover(exiting): natives restored"  test -f "$SETS_DIR/$U1/Song.abl" -a -f "$SETS_DIR/$U2/Song.abl"
check "recover(exiting): phase none"        test "$(phase)" = "none"
check "recover(exiting): no duplicates"     test "$(find "$T" -name Song.abl | wc -l | tr -d ' ')" = "3"
rm -rf "$T"

# ---- 6. Verbs are idempotent ------------------------------------------------
mk_env
run enter; run enter
check "enter twice: still one copy of each" test "$(find "$T" -name Song.abl | wc -l | tr -d ' ')" = "3"
run exit; run exit
check "exit twice: still one copy of each"  test "$(find "$T" -name Song.abl | wc -l | tr -d ' ')" = "3"
check "recover on none: no-op"              test "$(phase)" = "none"
rm -rf "$T"

# ---- 7. Non-UUID entries in Sets/ are never touched ------------------------
mk_env
mkdir -p "$SETS_DIR/NotASet"; echo x > "$SETS_DIR/stray.txt"
run enter
check "non-UUID dir untouched"  test -d "$SETS_DIR/NotASet"
check "stray file untouched"    test -f "$SETS_DIR/stray.txt"
run exit
rm -rf "$T"

[ "$fails" = 0 ] && echo "PASS: set-swap engine" || { echo "FAIL: set-swap engine" >&2; exit 1; }
