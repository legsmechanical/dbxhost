#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A live standalone session owns its project library: it creates, copies,
# renames and deletes projects through its own UI and has one of them open. A
# generic file surface that renames or deletes underneath it corrupts a project
# the session will keep writing to, and by policy that project then opens blank
# with nothing to recover it.
#
# The listing filter is pinned behaviourally in davebox/tests/js (it lives in
# shared code both sides import). What is pinned HERE is that the filter is
# wired into every lister, and that the destructive operations refuse on their
# own rather than trusting the listings to be the only way in.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1" >&2; fail=1; }

fb=src/modules/tools/file-browser/ui.js
shared=src/shared/filepath_browser.mjs

echo "listing filter:"
grep -q 'pathHiddenFromBrowsers(fullPath)' "$shared" \
    && ok "the shared browser hides the library" \
    || bad "the shared browser lists a live session's projects"

# The file browser builds a SECOND listing for Copy to.../Move to... — without
# the same filter the library is gone from the browser but still offered as a
# destination.
dest=$(awk '/^function refreshDestBrowser/,/^}/' "$fb")
grep -q 'pathHiddenFromBrowsers(fullPath)' <<<"$dest" \
    && ok "the copy/move destination picker hides it too" \
    || bad "the destination picker still offers a live session's library"

echo "destructive operations refuse:"
# Every mutation, not just the obvious two. A guard on the listing is a guard on
# the paths you thought of; a guard on the operation covers the ones you did not.
for fn in doDelete doRename doNewFolder doDuplicate doCopy doMove; do
    body=$(awk "/^function ${fn}\(/,/^}/" "$fb")
    if [ -z "$body" ]; then bad "$fn missing from the file browser"; continue; fi
    if grep -q 'refuseIfSessionOwned(' <<<"$body"; then
        ok "$fn refuses a session-owned path"
    else
        bad "$fn can mutate a live session's project"
    fi
done
# Copy and Move take a destination as well as a source, and both ends matter.
for fn in doCopy doMove; do
    body=$(awk "/^function ${fn}\(/,/^}/" "$fb")
    if grep -q 'refuseIfSessionOwned(src) || refuseIfSessionOwned(destDir)' <<<"$body"; then
        ok "$fn checks BOTH ends"
    else
        bad "$fn checks only one end of the operation"
    fi
done

echo "one definition of 'a session is live':"
# Two copies of a liveness probe are two things to keep in step, and the file
# browsers and the session-exit gesture must never disagree about it.
if grep -q '^function standaloneSessionActive' src/shadow/shadow_ui.js; then
    bad "shadow_ui.js still defines its own standaloneSessionActive"
else
    ok "shadow_ui.js imports the shared probe"
fi
grep -q 'session_state.mjs' src/shadow/shadow_ui.js \
    && ok "the import is present" \
    || bad "shadow_ui.js does not import session_state.mjs"

# The probe must stay permissive: a false negative exposes a live library.
probe=$(awk '/export function standaloneSessionActive/,/^}/' src/shared/session_state.mjs)
grep -q 'return true;' <<<"$probe" \
    && ok "an unreadable payload is assumed live" \
    || bad "the probe no longer fails safe on a garbled payload"

[ $fail -eq 0 ] && echo "PASS: a live session's project library is hidden and guarded"
exit $fail
