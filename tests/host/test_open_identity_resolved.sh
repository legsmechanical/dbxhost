#!/usr/bin/env bash
set -uo pipefail

# THE ENTRY IS NOT THE PROJECT — derived, so it cannot be forgotten again.
#
# ⚠⚠ THIS EXISTS BECAUSE THE SAME MISTAKE WAS MADE FOUR TIMES IN ONE DAY, each
# time in a place already fixed somewhere else:
#   1. the picker's current-project match          (JS, caught by design)
#   2. the request the switch authors               (JS, caught by design)
#   3. `delete` deciding what is open               (shell — HUNG THE DEVICE)
#   4. `_pppIsOpenProject`'s warning guard          (JS — found by this grep)
#
# What is "open" is the library ENTRY Move confirmed — a SLOT id since the
# library stopped being one entry per project. `projects.json`, and every verb
# that manages a project, speak PROJECT ids. Comparing one to the other used to
# work because a slot was named after the project it held; it silently stopped
# working, and a comparison that can never be true fails OPEN — it does not
# error, it just answers "no", which is how a delete removed a live project
# while its guard said nothing.
#
# So: every site that compares the open identity against a project must resolve
# it first. This derives them and fails on a new one.

cd "$(dirname "$0")/../.."

fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1" >&2; fails=1; }

echo "test_open_identity_resolved"

# ---- 1. JS: every comparison involving currentSetUuid ----------------------
# The identity lives in S.currentSetUuid. Any === / !== against it either
# resolves through projectIdOfEntry, or compares against another ENTRY (the
# DSP's own uuid, which is the same thing the host published).
# ⚠ currentSetUuid must be an OPERAND of the comparison, not merely on the same
# line. The first cut matched any line containing both, which flagged
# `S.currentSetUuid = _id.state === 'open' ? ...` — an ASSIGNMENT of the entry,
# which is correct (currentSetUuid IS the entry). A check that cries wolf on
# correct code gets switched off, and then catches nothing.
got=$(git grep -n -E 'S\.currentSetUuid *(===|!==)|(===|!==) *S\.currentSetUuid' \
      -- 'davebox/ui/*.mjs' 'davebox/ui/*.js' | sed 's/^/    /' | sort)
n=$(printf '%s\n' "$got" | grep -c . )
if [ "$n" -eq 0 ]; then
    bad "found ZERO comparisons of S.currentSetUuid — the pattern is wrong, not the code"
else
    ok "$n comparison(s) of the open identity found"
fi

# Each one must name projectIdOfEntry on the same line, OR compare to a dspUuid
# (entry vs entry, which is the one honest direct comparison).
bad_lines=$(printf '%s\n' "$got" | grep -vE 'projectIdOfEntry|dspUuid|_dspUuid' || true)
if [ -z "$bad_lines" ]; then
    ok "every comparison either RESOLVES the entry or compares entry-to-entry"
else
    bad "a comparison treats the open ENTRY as a project id:"
    printf '%s\n' "$bad_lines" >&2
fi

# ---- 2. shell: every reader of the open identity ---------------------------
# project-cmd is the only script that reasons in projects. It must resolve.
# ⚠ Match the CALL, not the name. The first cut grepped for the bare
# `resolve_open_project`, which also matches the COMMENT explaining it — so
# removing the actual call left the check green. A grep that matches prose
# about the thing is not a check on the thing.
if awk '/^do_delete\(\)/,/^}/' standalone/scripts/project-cmd.sh | grep -q '\$(resolve_open_project'; then
    ok "delete resolves what is open before deciding"
else
    bad "delete compares the raw entry — this is the one that hung the device"
fi
if awk '/^do_rename\(\)/,/^}/' standalone/scripts/project-cmd.sh | grep -q '\$(resolve_open_project'; then
    ok "rename resolves what is open before deciding"
else
    bad "rename compares the raw entry"
fi

# ⭑ set-swap is the DELIBERATE exception, and it is correct BY CONSTRUCTION:
# it joins the identity against the LIBRARY (where slots live) and reads the
# index through the link, which is the slot position it wants. Pinned so the
# exemption is a decision on the record rather than an omission.
if awk '/^session_song_index\(\)/,/^}/' standalone/scripts/set-swap.sh | grep -q 'sets_dir'; then
    ok "set-swap reads the index through the LIBRARY (slot position — correct as-is)"
else
    bad "set-swap stopped joining against the library — re-check what it resolves"
fi

# ---- 3. the resolver exists on both sides of the seam ----------------------
grep -q 'export function projectIdOfEntry' davebox/ui/ui_persistence.mjs \
    && ok "the JS resolver exists" \
    || bad "projectIdOfEntry is gone — every JS comparison above is unguarded"
grep -q '^resolve_open_project()' standalone/scripts/project-cmd.sh \
    && ok "the shell resolver exists" \
    || bad "resolve_open_project is gone — the shell is comparing raw entries"

[ "$fails" = 0 ] && echo "PASS: the open entry is resolved before it is compared to a project"
exit "$fails"
