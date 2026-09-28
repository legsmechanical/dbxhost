#!/usr/bin/env bash
# The launcher must create its install directory BEFORE redirecting to
# launch.log. On a fresh install the directory does not exist until the
# bootstrap runs; the redirect failed, the launch logged nowhere, and
# move-loaded-set-reader -- which reads Move's lines out of launch.log to learn
# which set Move opened -- never saw one, so the first project load of every
# fresh install timed out back to the picker (2026-09-28, found on a clean
# device; the second launch worked).
set -euo pipefail
cd "$(dirname "$0")/../.."
L=standalone/scripts/launch.sh
mk=$(grep -n '^ *mkdir -p "\$DBX_DIR"$' "$L" | sed -n 1p | cut -d: -f1)
ex=$(grep -n '^ *exec >>"\$LOG" 2>&1$' "$L" | sed -n 1p | cut -d: -f1)
[ -n "$ex" ] || { echo "FAIL: the launch.log redirect is not where this test expects it"; exit 1; }
[ -n "$mk" ] && [ "$mk" -lt "$ex" ] \
    && echo "ok   the install directory is created (line $mk) before launch.log is opened (line $ex)" \
    || { echo "FAIL: launch.sh opens launch.log before creating \$DBX_DIR -- a fresh install logs nowhere"; exit 1; }
echo "PASS: a fresh install's first launch has a launch.log"
