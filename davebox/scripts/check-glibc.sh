#!/usr/bin/env bash
# Fail if a built .so needs a newer GLIBC than the Move has.
#
#   scripts/check-glibc.sh <file.so> [max, default 2.35]
#   GLIBC_VERSIONS_FROM_STDIN=1 scripts/check-glibc.sh - [max]   # tests: `nm -D` text on stdin
#
# The Move ships glibc 2.35. A symbol versioned above that links and builds
# green, then fails at dlopen on the device — the module loads nothing and
# logs nothing useful. build_sound.sh used to PRINT the versions and carry on
# (`... | sort -u || true`): a check that could not fail.
set -u
so="${1:?usage: check-glibc.sh <file.so> [max]}"
max="${2:-2.35}"
if [ "${GLIBC_VERSIONS_FROM_STDIN:-0}" = "1" ]; then
    raw="$(cat)"
else
    [ -f "$so" ] || { echo "check-glibc: no such file: $so" >&2; exit 2; }
    NM_BIN="${CROSS_PREFIX:-}nm"
    command -v "$NM_BIN" >/dev/null 2>&1 || NM_BIN="nm"
    raw="$("$NM_BIN" -D "$so" 2>/dev/null)"
fi
vers="$(printf '%s\n' "$raw" | grep -o 'GLIBC_[0-9.]*' | sort -u)"
if [ -z "$vers" ]; then
    # Not "nothing to check": a real dsp.so always imports libc. No versions
    # means the tool could not read the file, and a check that saw nothing is
    # not a pass.
    echo "check-glibc: FAIL - read no GLIBC symbol versions from $so (nm cannot read it?)" >&2
    exit 1
fi
printf '%s\n' "$vers"
bad="$(printf '%s\n' "$vers" | sed 's/^GLIBC_//' | awk -F. -v max="$max" '
    BEGIN { split(max, m, "."); }
    { a = $1 + 0; b = $2 + 0; if (a > m[1] + 0 || (a == m[1] + 0 && b > m[2] + 0)) print "GLIBC_" $0; }')"
if [ -n "$bad" ]; then
    echo "check-glibc: FAIL - $so needs a GLIBC newer than $max:" >&2
    printf '  %s\n' $bad >&2
    exit 1
fi
exit 0
