#!/usr/bin/env bash
# The umbrella folder rename: an install under the pre-rename name is MOVED to
# the new one by the launcher, once, before anything can create a second tree.
#
# The decision block is lifted out of launch.sh (between MIGRATE-BEGIN /
# MIGRATE-END) and RUN here against a sandbox, the way test_quit_lands_in_stock
# runs the QTS block, so it cannot rot into a comment. The rest is source pins
# on where it sits in the launch.
#
# The block probes the session lock with flock(1). macOS has none, so there a
# stand-in built on python3's fcntl.flock — the same flock(2) call — is put on
# PATH; on Linux (CI, test-linux.sh) the real one runs.
set -u
cd "$(dirname "$0")/../.."
LAUNCH=standalone/scripts/launch.sh
[ -f "$LAUNCH" ] || { echo "FAIL: $LAUNCH missing" >&2; exit 1; }
T=$(mktemp -d "${TMPDIR:-/tmp}/rename.XXXXXX")
HOLDER=""
trap '[ -n "$HOLDER" ] && kill "$HOLDER" 2>/dev/null; rm -rf "$T"' EXIT

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }
check() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }

BLOCK=$(awk '/^  # MIGRATE-BEGIN/ { on = 1; next } /^  # MIGRATE-END/ { on = 0 } on' "$LAUNCH")
check "the migration block was found" test -n "$BLOCK"
BLOCK=$(printf '%s\n' "$BLOCK" | sed \
    -e "s#^  DBX_DIR_OLD=.*#  DBX_DIR_OLD=$T/dbx-host#" \
    -e "s#^  _mig_midi_old=.*#  _mig_midi_old=\"$T/dAVEBOx MIDI\"#" \
    -e "s#^  _mig_lock=.*#  _mig_lock=$T/session.lock#")
for v in DBX_DIR_OLD= _mig_midi_old= _mig_lock=; do
    check "the sandbox owns $v" sh -c "printf '%s\n' \"\$1\" | grep -q \"^  $v\\\"*$T/\"" _ "$BLOCK"
done

mkdir -p "$T/bin"
if ! command -v flock >/dev/null 2>&1; then
    cat > "$T/bin/flock" <<'PY'
#!/usr/bin/env python3
import fcntl, sys
a = [x for x in sys.argv[1:] if x != "-n"]
try:
    fcntl.flock(int(a[0]), fcntl.LOCK_EX | (fcntl.LOCK_NB if "-n" in sys.argv[1:] else 0))
except OSError:
    sys.exit(1)
PY
    chmod +x "$T/bin/flock"
    echo "  (no flock(1) here: using the python3 fcntl.flock stand-in)"
fi

NEW="$T/daveboxSA"; OLD="$T/dbx-host"; MIDI_OLD="$T/dAVEBOx MIDI"   # OLD: the pre-rename name
# Run the block; leaves its verdict in $T/verdict (MIG / DONE / HOLD lines).
run() {
    ( PATH="$T/bin:$PATH"; DBX_DIR="$NEW"; eval "$BLOCK"
      printf 'MIG=%s\nDONE=%s\nHOLD=%s\n' "$_mig" "$_mig_done" "$_mig_hold" ) > "$T/verdict" 2>&1
}
v() { sed -n "s/^$1=//p" "$T/verdict"; }
reset() { rm -rf "$NEW" "$OLD" "$MIDI_OLD" "$T/session.lock"; }
# An install as the old launcher left it: files, a nested dir, a slot symlink,
# a name with a space, and the manifest with full paths.
old_install() {
    mkdir -p "$OLD/projects/p1/Move-Set-p1" "$OLD/sets/library" "$OLD/modules/chain" "$OLD/scripts"
    echo song > "$OLD/projects/p1/Move-Set-p1/Song.abl"
    echo host > "$OLD/schwung"; echo dsp > "$OLD/modules/chain/dsp.so"; echo x > "$OLD/with space.txt"
    ln -s "$OLD/projects/p1" "$OLD/sets/library/slot-a"
    printf 'abc %s/modules/chain/dsp.so\ndef /data/UserData/schwung/modules/tools/davebox-sa/standalone\n' "$OLD" > "$OLD/.owned-manifest"
}
listing() { (cd "$1" && find . \( -type f -o -type l \) -print | LC_ALL=C sort | while IFS= read -r f; do
    if [ -L "$f" ]; then echo "L $f"; else echo "F $f $(cksum < "$f")"; fi; done); }
ino() { ls -di "$1" | awk '{print $1}'; }

echo "1. fresh install (nothing there):"
reset; run
check "no-op: says nothing" test -z "$(v MIG)"
check "creates nothing" test ! -e "$NEW" -a ! -e "$OLD"
check "nothing held" test -z "$(v HOLD)"

echo "2. upgrade (only the old folder):"
reset; old_install
listing "$OLD" | grep -v owned-manifest > "$T/before"; i0=$(ino "$OLD")
run
check "migrated, logged" sh -c 'case "$1" in migrated*) exit 0;; esac; exit 1' _ "$(v MIG)"
check "the old name is gone" test ! -e "$OLD" -a ! -L "$OLD"
listing "$NEW" | grep -v owned-manifest > "$T/after"
check "every file byte-identical, every link kept" cmp -s "$T/before" "$T/after"
check "the SAME directory (inode unchanged: a rename, not a copy)" test "$(ino "$NEW")" = "$i0"
check "the manifest is re-pointed at the new folder" grep -qx "abc $NEW/modules/chain/dsp.so" "$NEW/.owned-manifest"
check "...its stock-tree line untouched" grep -qx "def /data/UserData/schwung/modules/tools/davebox-sa/standalone" "$NEW/.owned-manifest"
check "...and no manifest line names the old folder" sh -c '! grep -q "$1/" "$2"' _ "$OLD" "$NEW/.owned-manifest"
check "DONE is set (the launcher knows a move happened)" test "$(v DONE)" = 1
run
check "idempotent: a second run is a no-op" test -z "$(v MIG)"
listing "$NEW" | grep -v owned-manifest > "$T/again"
check "...and changes nothing" cmp -s "$T/after" "$T/again"

echo "3. both present:"
reset; old_install; mkdir -p "$NEW"; echo mine > "$NEW/keep.txt"
listing "$OLD" > "$T/old.before"; listing "$NEW" > "$T/new.before"
run
check "a warning, keeping the new folder" sh -c 'case "$1" in WARNING:*both*) exit 0;; esac; exit 1' _ "$(v MIG)"
listing "$OLD" > "$T/old.after"; listing "$NEW" > "$T/new.after"
check "the old tree untouched" cmp -s "$T/old.before" "$T/old.after"
check "the new tree untouched" cmp -s "$T/new.before" "$T/new.after"
check "not held: the launch goes on with the new folder" test -z "$(v HOLD)"
echo "3b. the new folder exists but is EMPTY:"
reset; old_install; mkdir -p "$NEW"; listing "$OLD" | grep -v owned-manifest > "$T/before"; i0=$(ino "$OLD")
run
check "moved over the empty one" sh -c 'test ! -e "$1" && test "$(ls -di "$2" | awk "{print \$1}")" = "$3"' _ "$OLD" "$NEW" "$i0"
listing "$NEW" | grep -v owned-manifest > "$T/after"
check "...every file intact" cmp -s "$T/before" "$T/after"

echo "4. a crash mid-move cannot leave a half-copied tree:"
n_mv=$(printf '%s\n' "$BLOCK" | grep -c 'mv "$DBX_DIR_OLD" "$DBX_DIR"')
check "exactly one rename of the tree (got $n_mv)" test "$n_mv" = 1
check "no cp, no rsync, no rm -rf in the block" sh -c '! printf "%s\n" "$1" | grep -v "^ *#" | grep -Eq "(^|[^a-z])(cp|rsync)( |$)|rm -rf"' _ "$BLOCK"
# rename(2) is atomic, so the only post-crash states are BEFORE (old only) and
# AFTER (new only), plus "the empty new folder was removed, the rename never ran".
reset; old_install; mv "$OLD" "$NEW"; run
check "crashed just after the rename: converges (nothing more to do)" test -z "$(v MIG)" -a -d "$NEW" -a ! -e "$OLD"
reset; old_install; run
check "crashed before the rename: the next launch completes it" test -d "$NEW" -a ! -e "$OLD"
reset; old_install; mkdir -p "$NEW"; rmdir "$NEW"; run
check "after removing the empty new folder: converges" sh -c 'test -d "$1" -a ! -e "$2"' _ "$NEW" "$OLD"

echo "5. it runs before anything can create the new folder:"
line_of() { grep -nF -- "$1" "$LAUNCH" | sed -n 1p | cut -d: -f1; }
END=$(grep -n '^  # MIGRATE-END' "$LAUNCH" | cut -d: -f1)
MK=$(line_of '|| mkdir -p "$DBX_DIR"')
REC=$(line_of 'set-swap.sh" recover')
BOOT=$(line_of 'payload/scripts/bootstrap.sh" ||')
check "MIGRATE-END ($END) < mkdir -p \"\$DBX_DIR\" ($MK)" test -n "$END" -a -n "$MK" -a "${END:-0}" -lt "${MK:-0}"
check "mkdir ($MK) < bootstrap ($BOOT)" test -n "$BOOT" -a "${MK:-0}" -lt "${BOOT:-0}"
check "bootstrap ($BOOT) < set-swap.sh recover ($REC)" test -n "$REC" -a "${BOOT:-0}" -lt "${REC:-0}"
check "the mkdir is skipped while a move is held" grep -qF '[ -n "$_mig_hold" ] || mkdir -p "$DBX_DIR"' "$LAUNCH"
HOLDREF=$(line_of '[ -n "$_mig_hold" ] && refuse')
LOCK=$(line_of 'exec 9>>/dev/shm/.dbxhost-session.lock')
check "a held move refuses after the session lock ($LOCK < $HOLDREF) and before bootstrap ($BOOT)" \
    test -n "$HOLDREF" -a "${LOCK:-0}" -lt "${HOLDREF:-0}" -a "${HOLDREF:-0}" -lt "${BOOT:-0}"
check "no apostrophe inside the block (the body is one single-quoted string)" \
    sh -c '! awk "/^  # MIGRATE-BEGIN/{on=1} on; /^  # MIGRATE-END/{on=0}" "$1" | grep -q "'"'"'"' _ "$LAUNCH"
check "the whole launcher still parses" bash -n "$LAUNCH"

echo "6. a live session holds the lock:"
reset; old_install; listing "$OLD" > "$T/before"
python3 -c 'import fcntl, sys, time
f = open(sys.argv[1], "a"); fcntl.flock(f, fcntl.LOCK_EX)
open(sys.argv[2], "w").close(); time.sleep(60)' "$T/session.lock" "$T/held" &
HOLDER=$!
for _ in $(seq 1 100); do [ -e "$T/held" ] && break; sleep 0.05; done
check "(the holder has the lock)" test -e "$T/held"
run
check "deferred, and says so" sh -c 'case "$1" in *deferred*) exit 0;; esac; exit 1' _ "$(v MIG)"
check "HELD: the launch must not create the new folder" test "$(v HOLD)" = 1
listing "$OLD" > "$T/after"
check "the old tree untouched, byte for byte" cmp -s "$T/before" "$T/after"
check "no new folder" test ! -e "$NEW"
kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null; HOLDER=""
run
check "once the session is gone, the next launch moves it" test -d "$NEW" -a ! -e "$OLD"

echo "7. a symlink at the old name:"
reset; mkdir -p "$NEW"; echo x > "$NEW/a"; ln -s "$NEW" "$OLD"
run
check "a VALID link is left alone" test -L "$OLD" -a "$(v MIG)" = ""
reset; ln -s "$T/nowhere" "$OLD"
run
check "a DANGLING link is removed" test ! -L "$OLD"
check "...and logged" sh -c 'case "$1" in *dangling*) exit 0;; esac; exit 1' _ "$(v MIG)"
check "...and no new folder is made of it" test ! -e "$NEW"

echo "8. the MIDI export folder:"
reset; old_install; mkdir -p "$MIDI_OLD"; echo smf > "$MIDI_OLD/song 1A.mid"
run
check "folded into the moved install as MIDI/" test -f "$NEW/MIDI/song 1A.mid" -a ! -e "$MIDI_OLD"
check "...and logged" sh -c 'case "$1" in *MIDI*) exit 0;; esac; exit 1' _ "$(v MIG)"
reset; mkdir -p "$NEW/MIDI" "$MIDI_OLD"; echo new > "$NEW/MIDI/new.mid"; echo old > "$MIDI_OLD/old.mid"
run
check "no fold-in when MIDI/ already has files: both left as they are" \
    test -f "$NEW/MIDI/new.mid" -a ! -e "$NEW/MIDI/old.mid" -a -f "$MIDI_OLD/old.mid"
reset; mkdir -p "$NEW/MIDI" "$MIDI_OLD"; echo old > "$MIDI_OLD/old.mid"
run
check "an EMPTY MIDI/ (the manager made it) does not block the fold-in" test -f "$NEW/MIDI/old.mid" -a ! -e "$MIDI_OLD"
reset; mkdir -p "$MIDI_OLD"; echo old > "$MIDI_OLD/old.mid"
run
check "no install at all: the MIDI folder is left where it is" test -f "$MIDI_OLD/old.mid" -a ! -e "$NEW"

[ "$fails" = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")" >&2; exit 1; }
