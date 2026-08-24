#!/bin/sh
# tests/host/test_delete_open_project.sh — deleting the project you are IN.
#
# Josh, 2026-08-24: "Make it possible to delete a loaded project (unload and
# delete)." It used to be refused by two independent guards, because you cannot
# rmtree a set the host has open and expect the session to survive.
#
# The answer reuses do_rename's open-project shape: queue the mutation into
# relaunch_patch.sh, restart Move in place, and let the LAUNCHER run it in the
# window after Move exits — nothing holding the directory, and no dying save
# able to write the set back. So what this file pins is the ORDERING (deferred,
# not immediate) and the landing spot, not just "it returned 0".
#
# ⚠⚠ These are xattr fixtures: user.song-index IS the pad position. macOS python
# has no os.setxattr, so this test only runs meaningfully on Linux — which is
# also where CI runs it. Skips cleanly elsewhere rather than passing vacuously.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

python3 -c 'import os,sys; sys.exit(0 if hasattr(os,"setxattr") else 1)' 2>/dev/null || {
    printf 'SKIP: test_delete_open_project.sh (no os.setxattr — not Linux)\n'; exit 0; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
# ⚠ pkill is REAL. project-cmd backgrounds `pkill -x MoveOriginal` to end the
# session, and this test has already killed a live Move once by not stubbing it.
mkdir -p "$T/stub"; printf '#!/bin/sh\nexit 0\n' > "$T/stub/pkill"; chmod +x "$T/stub/pkill"
PATH="$T/stub:$PATH"; export PATH

U1=aaaaaaaa-0000-0000-0000-000000000001
U2=bbbbbbbb-0000-0000-0000-000000000002

mklib() { # n-projects
    rm -rf "$T/lib"; mkdir -p "$T/lib/.dbx"
    python3 - "$T/lib" "$1" "$U1" "$U2" <<'PY'
import os, json, sys
lib, n, u1, u2 = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
for i, u in enumerate([u1, u2][:n]):
    d = os.path.join(lib, u, "Proj%d" % i); os.makedirs(d)
    json.dump({"tracks": []}, open(os.path.join(d, "Song.abl"), "w"))
    os.setxattr(os.path.join(lib, u), "user.song-index", str(i).encode())
open(os.path.join(lib, ".dbx", "active_set.txt"), "w").write(u1 + "\n")
PY
}
run() { SETS_DIR="$T/lib" DBX_DIR="$T/lib/.dbx" ACTIVE_SET_PATH="$T/lib/.dbx/active_set.txt" \
        sh standalone/scripts/project-cmd.sh "$@" 2>&1; }

# --- 1. the open project: DEFERRED, not done here and now ------------------
mklib 2
out=$(run delete 0)
printf '%s' "$out" | grep -q "queued" \
    && ok "deleting the OPEN project is accepted and queued" \
    || bad "open-project delete was refused or silent: $out"
[ -d "$T/lib/$U1" ] \
    && ok "...and it is still on disk right now — the launcher does it, not us" \
    || bad "the open project was removed IMMEDIATELY, under the running session"
grep -q "rm -rf" "$T/lib/.dbx/relaunch_patch.sh" 2>/dev/null \
    && ok "the rm is queued into relaunch_patch.sh" \
    || bad "no rm queued — the project would never actually be deleted"
grep -q "^sync$" "$T/lib/.dbx/relaunch_patch.sh" 2>/dev/null \
    && ok "...and syncs, so a power cut cannot replay it back" \
    || bad "the queued delete does not sync (journal replay can undo an rmtree)"
[ -f "$T/lib/.dbx/relaunch_requested" ] \
    && ok "the session is asked to restart" \
    || bad "no relaunch requested — the session would sit on a deleted project"
[ "$(cat "$T/lib/.dbx/relaunch_song_index" 2>/dev/null)" = "1" ] \
    && ok "it comes back on the lowest REMAINING project" \
    || bad "wrong landing index: $(cat "$T/lib/.dbx/relaunch_song_index" 2>/dev/null)"

# --- 2. the queued command is CORRECT, not merely present ------------------
sh "$T/lib/.dbx/relaunch_patch.sh"
[ -d "$T/lib/$U1" ] && bad "running the queued patch did not remove the project" \
                    || ok "running the queued patch removes exactly it"
[ -d "$T/lib/$U2" ] && ok "...and leaves the other project alone" \
                    || bad "the queued patch took the WRONG project too"

# --- 3. the last project: nowhere to land, so back to the picker -----------
mklib 1
run delete 0 >/dev/null
[ -f "$T/lib/.dbx/relaunch_reselect" ] \
    && ok "deleting the LAST project re-arms the picker" \
    || bad "no reselect marker — the session would relaunch into nothing"
[ -f "$T/lib/.dbx/relaunch_song_index" ] \
    && bad "a landing index was written when no project remains" \
    || ok "...and names no landing index, because there is none"

# --- 4. an ordinary delete is UNCHANGED (still immediate) ------------------
# ⭑ The positive control for the whole file: if the new branch swallowed every
# delete, everything above would still pass.
mklib 2
run delete 1 >/dev/null
[ -d "$T/lib/$U2" ] && bad "a non-open delete stopped happening immediately" \
                    || ok "a NON-open project is still deleted on the spot"
[ -f "$T/lib/.dbx/relaunch_requested" ] \
    && bad "a non-open delete restarted the session — it must not" \
    || ok "...with no restart, because nothing is holding it"

[ "$fail" = "0" ] && printf 'PASS: the open project can be deleted, via the launcher\n'
exit $fail
