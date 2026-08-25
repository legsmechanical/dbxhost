#!/usr/bin/env bash
# A provisional set identity is never used as a storage path.
#
# When Move's currentSongIndex moves before the matching Sets/<UUID>/ folder
# exists, the host publishes a SYNTHETIC identity so there is something to show:
# `__pending-<songIndex>-<seq>` (shadow_set_pages.c). It is a placeholder, not a
# uuid — but per-project state lives at Sets/<uuid>/dAVEBOx/, so anything that
# treats it as a real uuid creates a directory literally named `__pending-2-1`
# in the set library and files that session's work where no real project will
# ever look for it.
#
# Five such directories were found on Josh's device (2026-08-25), each holding
# only a dAVEBOx/ state dir and no Song.abl, one of them created that same
# session. It is silent by construction: nothing errors, the session looks fine,
# and the state is simply gone next launch.
#
# TWO writers, in different codebases — dAVEBOx (ui_persistence.mjs) and the
# host UI (shadow_ui.js, which writes dAVEBOx/host under the same uuid) — so the
# predicate lives once in shared/session_state.mjs. A copy in each is how the
# two drift apart.
set -u
cd "$(dirname "$0")/../.."
SHARED=src/shared/session_state.mjs
DBX=davebox/ui/ui_persistence.mjs
HOST=src/shadow/shadow_ui.js
for f in "$SHARED" "$DBX" "$HOST"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
check() {
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

echo "provisional set identities are never storage paths:"

# 1. ONE definition, in the shared module.
has_predicate() { grep -q "export function setUuidIsProvisional" "$SHARED"; }
check "shared/session_state.mjs defines setUuidIsProvisional()" has_predicate

matches_c_side() {
    # The prefix is a contract with the C that mints it. Pin them against each
    # other so a rename on either side fails here, not on a user's device.
    grep -q '"__pending-' src/host/shadow_set_pages.c &&
        grep -q 'PROVISIONAL_SET_UUID_PREFIX = "__pending-"' "$SHARED"
}
check "the prefix matches shadow_set_pages.c's own literal" matches_c_side

# 2. No second definition of the prefix anywhere else.
#    ⚠ Match the STRING LITERAL, not the word: the guards' comments legitimately
#    name `__pending-N-M` in prose, and an earlier cut of this check counted
#    those and failed against correct code. A source pin must read code.
single_source() {
    local n
    n=$(grep -rlE "[\"']__pending-" src/shared src/shadow davebox/ui 2>/dev/null | wc -l | tr -d " ")
    [ "$n" = "1" ]
}
check "only ONE file in the JS/MJS surface holds the prefix LITERAL" single_source

# 3. dAVEBOx refuses it at the single choke point where the uuid enters, and
#    again at the function that actually makes the directory.
dbx_reads_guarded() {
    grep -A14 "^export function readActiveSet" "$DBX" | grep -q "setUuidIsProvisional"
}
check "dAVEBOx readActiveSet() reports a provisional uuid as NO project" dbx_reads_guarded

dbx_mkdir_guarded() {
    grep -A8 "^function ensureStateDir" "$DBX" | grep -q "setUuidIsProvisional"
}
check "dAVEBOx ensureStateDir() refuses to create the directory" dbx_mkdir_guarded

# 4. The host side guards its own writer.
host_guarded() {
    grep -A8 "^function perSetStateDir" "$HOST" | grep -q "setUuidIsProvisional"
}
check "host perSetStateDir() returns empty for a provisional uuid" host_guarded

# 5. ⭑ The control that matters: returning "" is only safe if callers check it.
#    Without this, the guard converts a bogus directory into a path at the
#    filesystem ROOT, which is worse than the bug it fixes.
callers_handle_empty() {
    # Both call sites, named explicitly. Counting them too: a THIRD caller added
    # later without a guard must fail here rather than slip through.
    local n
    n=$(grep -c "perSetStateDir(" "$HOST")
    [ "$n" = "3" ] || { echo "    (perSetStateDir call/def count is $n, expected 3 — new caller?)"; return 1; }
    grep -q "_perSet = perSetStateDir(uuid)" "$HOST" &&
        grep -q "newDir = _perSet ? _perSet : SLOT_STATE_DIR_DEFAULT" "$HOST" &&
        grep -q "if (setDir && (host_file_exists" "$HOST"
}
check "both perSetStateDir() callers handle the empty return" callers_handle_empty

if [ "$fails" = "0" ]; then
    echo "PASS: provisional identities cannot become directories"
else
    echo "FAIL: provisional-uuid guard broken" >&2
fi
exit "$fails"
