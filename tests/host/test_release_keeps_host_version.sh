#!/usr/bin/env bash
# The release tag is dAVEBOx's version; src/host/version.txt is the Schwung
# BASE version the host tracks, and a module's min_host_version is checked
# against it (src/shared/store_utils.mjs, schwung-manager). The release
# workflow once wrote the tag into it, which would have shipped a host that
# calls itself 0.0.1 and refuses every module asking for 1.5.0.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
if grep -nE '>+ *src/host/version\.txt' .github/workflows/release.yml; then
    echo "FAIL: the release workflow writes src/host/version.txt"; fail=1
fi
v=$(tr -d '[:space:]' < src/host/version.txt)
case "$v" in
    [1-9]*.*.*) echo "ok   src/host/version.txt is a Schwung base version ($v)";;
    *) echo "FAIL: src/host/version.txt ($v) does not look like a Schwung base version"; fail=1;;
esac
grep -q '\[ "\$RJ" = "\$VERSION" \]' .github/workflows/release.yml \
    && echo "ok   the workflow checks the tag against release.json" \
    || { echo "FAIL: the workflow no longer checks the tag against release.json"; fail=1; }
[ $fail = 0 ] && echo "PASS: the release keeps the host's base version"
exit $fail
