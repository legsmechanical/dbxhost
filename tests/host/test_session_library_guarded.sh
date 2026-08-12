#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A live standalone session owns its project library: it creates, copies,
# renames and deletes projects through its own UI and has one of them open. A
# generic file surface that renames or deletes underneath it corrupts a project
# the session will keep writing to, and by policy that project then opens blank
# with nothing to recover it.
#
# ⚠ SCOPE, and the reason it is this narrow (Josh, 2026-08-12): the fix may not
# touch the stock tree. The file-browser MODULE ships into the stock modules
# directory and a stock user runs the stock copy of it, so edits there are both
# a boundary violation and ineffective. What works instead is the SHARED
# library: this build's module loader rewrites the canonical
# /data/UserData/schwung/shared/ import prefix to its own shared/ dir, so the
# STOCK, UNMODIFIED file browser running inside a session lists through OUR
# filepath_browser.mjs and inherits the filter for free.
#
# What is left uncovered by that — the module's own copy/move destination
# picker, schwung-manager on :7700, the third-party filebrowser binary — is
# answered by the notice file the swap writes into the library instead.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1" >&2; fail=1; }

shared=src/shared/filepath_browser.mjs

echo "listing filter (the one surface we can reach without touching stock):"
grep -q 'pathHiddenFromBrowsers(fullPath)' "$shared" \
    && ok "the shared browser hides a live session's library" \
    || bad "the shared browser lists a live session's projects"

# The rewrite is what makes the line above reach the stock module. If it ever
# stopped rewriting, the filter would still be here and would silently stop
# applying to every module — the failure would look like nothing at all.
grep -q '#define SHARED_IMPORT_CANONICAL "/data/UserData/schwung/shared/"' src/shadow/shadow_ui.c \
    && ok "the canonical shared prefix is still a literal" \
    || bad "SHARED_IMPORT_CANONICAL changed — modules may no longer resolve to this build's shared/"
grep -q 'SHARED_IMPORT_LOCAL     SCHWUNG_INSTALL_DIR "/shared/"' src/shadow/shadow_ui.c \
    && ok "the loader rewrites shared imports to this build" \
    || bad "the shared-import rewrite is gone — a stock module would load stock's shared/"

echo "the stock tree stays untouched:"
# Both of these ship into or run from /data/UserData/schwung. Editing them is
# the boundary violation this test exists to keep from creeping back.
if git -C . diff --quiet HEAD -- src/modules/tools/file-browser/ 2>/dev/null; then
    ok "no working-tree edits to the stock file-browser module"
fi
grep -rq 'sessionOwnsPath\|standaloneSessionActive' schwung-manager/*.go 2>/dev/null \
    && bad "schwung-manager carries a session check — it lives in the stock tree" \
    || ok "schwung-manager is untouched"
grep -q 'pathHiddenFromBrowsers\|session_state' src/modules/tools/file-browser/ui.js 2>/dev/null \
    && bad "the file-browser module was edited — stock users run the stock copy of it" \
    || ok "the file-browser module is untouched"

echo "one definition of 'a session is live':"
if grep -q '^function standaloneSessionActive' src/shadow/shadow_ui.js; then
    bad "shadow_ui.js still defines its own standaloneSessionActive"
else
    ok "shadow_ui.js imports the shared probe"
fi
probe=$(awk '/export function standaloneSessionActive/,/^}/' src/shared/session_state.mjs)
grep -q 'return true;' <<<"$probe" \
    && ok "an unreadable payload is assumed live" \
    || bad "the probe no longer fails safe on a garbled payload"

echo "the notice the user actually sees:"
# Written by the swap, not shipped as an asset: it belongs to the library the
# swap manages, and set-swap.sh has no quoting trap (launch.sh body is wrapped
# in a single-quoted bash -c, where a heredoc is a hazard).
swap=standalone/scripts/set-swap.sh
grep -q 'write_library_notice' "$swap" \
    && ok "the swap writes a notice into the library" \
    || bad "nothing writes the notice — the surfaces we cannot filter have no warning"
grep -q 'DO-NOT-EDIT.txt' "$swap" \
    && ok "the notice is named so the filename alone is the warning" \
    || bad "the notice file name changed"
enter=$(awk '/^do_enter\(\)/,/^}/' "$swap")
grep -q 'write_library_notice' <<<"$enter" \
    && ok "it is (re)written on every enter, so it repairs itself" \
    || bad "the notice is not written on enter"

echo "the notice must not be mistaken for a project:"
# ⚠ The first-run seed test was "is the library directory empty" — a notice file
# would answer yes-it-has-something and silently skip seeding, leaving a fresh
# install on an empty picker.
grep -q 'ls -d "\$DBX_DIR/sets/library"/\*/' standalone/scripts/launch.sh \
    && ok "first-run seeding counts DIRECTORIES, not entries" \
    || bad "the seed test counts any entry — the notice would suppress first-run seeding"
# Both library enumerators must ignore it too.
for f in standalone/scripts/project-cmd.sh standalone/scripts/select-list.sh; do
    if grep -q 'os.path.isdir(p)' "$f" && grep -q 'uuid_re.match' "$f"; then
        ok "$(basename "$f") lists uuid DIRECTORIES only"
    else
        bad "$(basename "$f") no longer filters to uuid dirs — a stray file could list as a project"
    fi
done

[ $fail -eq 0 ] && echo "PASS: the library is hidden where we can, and labelled where we cannot"
exit $fail
