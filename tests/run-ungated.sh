#!/usr/bin/env bash
# Run tests/{shadow,store,build} against tests/known-failing.txt.
#
# These 69 tests were executed by NOTHING until 2026-09-16 — not the commit
# hook, not CI — so 26 of them had been failing for an unknown length of time
# and nobody could say which. A folder that looks like 69 tests of coverage and
# is really 43 plus 26 unactionable alarms is worse than no folder at all.
#
# So the passing ones now protect against regressions, and the failing ones are
# named. The list is a RATCHET in both directions:
#
#   a test NOT listed that fails   -> regression                -> FAIL
#   a test listed that now PASSES  -> fixed, remove its line    -> FAIL
#
# Exit 0 = the suite matches the list exactly.
set -uo pipefail
cd "$(dirname "$0")/.."

LIST="tests/known-failing.txt"
[ -f "$LIST" ] || { echo "run-ungated: $LIST is missing" >&2; exit 2; }
known=$(grep -v '^#' "$LIST" | grep -v '^[[:space:]]*$' | sort)

pass=0; fail=0; regress=""; fixed=""
for t in tests/shadow/*.sh tests/store/*.sh tests/build/*.sh; do
    [ -f "$t" ] || continue
    rel="${t#tests/}"
    if timeout 300 bash "$t" >/dev/null 2>&1; then
        pass=$((pass+1))
        grep -qxF "$rel" <<<"$known" && fixed="$fixed $rel"
    else
        fail=$((fail+1))
        grep -qxF "$rel" <<<"$known" || regress="$regress $rel"
    fi
done

total=$((pass+fail))
if [ "$total" -eq 0 ]; then
    echo "run-ungated: FAIL — collected NO tests" >&2; exit 1
fi
echo "run-ungated: $pass passed, $fail failed of $total ($(grep -vc '^#' "$LIST" 2>/dev/null || echo 0) known-failing)"

rc=0
if [ -n "$regress" ]; then
    echo "REGRESSION — these are not on the known-failing list:" >&2
    for r in $regress; do echo "    $r" >&2; done
    rc=1
fi
if [ -n "$fixed" ]; then
    echo "FIXED — remove these from $LIST (the list may only shrink):" >&2
    for f in $fixed; do echo "    $f" >&2; done
    rc=1
fi
[ "$rc" -eq 0 ] && echo "run-ungated: OK"
exit $rc
