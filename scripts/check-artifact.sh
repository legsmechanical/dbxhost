#!/bin/sh
# Read a built artifact and fail on anything unexpected in it.
#
# ⭐ WHY THIS EXISTS, and why it is one check rather than four. In one night
# this pair of repos produced FOUR build-vs-artifact divergences, every one of
# which printed success:
#   · a tracked object file outlived its deleted source and was linked in
#   · `docker image inspect` false-negatived, selecting a different compiler
#   · a build enumerated sources by hand while its tests globbed them, so a
#     file was compiled and tested but never shipped
#   · a shipped .so called two functions that do not exist anywhere
# They are one failure: THE BUILD REPORTED SUCCESS WITHOUT LOOKING AT WHAT IT
# PRODUCED. Success was "the commands ran", not "the artifact is right".
#
# So: inspect the artifact. Undefined symbols catch the last two directly (a
# source that never got compiled shows up exactly as a missing symbol), and the
# compiler check catches the second.
#
# Usage: check-artifact.sh <artifact> [nm-binary]
set -e
ART="$1"
NM="${2:-nm}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ALLOW="$HERE/artifact-allowlist.txt"

[ -f "$ART" ]   || { echo "check-artifact: no such artifact: $ART" >&2; exit 1; }
[ -f "$ALLOW" ] || { echo "check-artifact: missing $ALLOW" >&2; exit 1; }
command -v "$NM" >/dev/null 2>&1 || { echo "check-artifact: no '$NM' — cannot read $ART" >&2; exit 1; }

# Unversioned undefined symbols only. A version tag (foo@GLIBC_2.17) names the
# library that owns the symbol, so the loader resolves it.
#
# ⚠ The allowlist is stripped of comments and blank lines first: `grep -f` with
# a blank line in the pattern file matches EVERYTHING, which would turn this
# check into an unconditional pass — the exact way a guard dies quietly.
allow_tmp="$(mktemp)"
grep -v '^#' "$ALLOW" | grep -v '^[[:space:]]*$' > "$allow_tmp"
unexpected=$("$NM" -D --undefined-only "$ART" 2>/dev/null \
    | awk '{print $NF}' | grep -v '@' | sort -u \
    | grep -v -x -F -f "$allow_tmp" || true)
rm -f "$allow_tmp"

if [ -n "$unexpected" ]; then
    echo "" >&2
    echo "check-artifact: $ART references symbols that DO NOT EXIST in it:" >&2
    echo "$unexpected" | sed 's/^/    /' >&2
    echo "" >&2
    echo "  A -shared link is allowed to carry these, so nothing failed at build" >&2
    echo "  time. They fail at dlopen, or when the line is first executed." >&2
    echo "" >&2
    echo "  Usually one of:" >&2
    echo "    · a .c file that is used but not on the build's source list" >&2
    echo "    · a macro that was deleted while a call to it survived" >&2
    echo "    · a typo for a function that does exist (check nearby names)" >&2
    echo "" >&2
    echo "  If something genuinely provides it at runtime, add it to" >&2
    echo "  scripts/artifact-allowlist.txt AND say who provides it." >&2
    exit 1
fi

echo "Artifact verified: no unexpected undefined symbols in $(basename "$ART")"
