#!/usr/bin/env bash
# Run a websmoke, retrying the harness flake but NOT a real failure.
#
#   ./run.sh smoke_sound_banks.mjs
#
# jsdom's loader intermittently drops a whole <script>, which cascades into
# "X is not defined" and makes every later assertion meaningless — the smoke
# then reports a failure that has nothing to do with the code. A smoke that
# guards for this exits 2; this retries only that, so a genuine red stays red.
#
# ⚠ Retry-until-green would hide real intermittency. Exit 1 is returned as-is.
set -u
cd "$(dirname "$0")"

SMOKE="${1:-smoke5.mjs}"
ATTEMPTS="${ATTEMPTS:-8}"

if ! curl -sf -o /dev/null http://localhost:8199/web_ui.html; then
    echo "preview server is not up on :8199 — start it with:" >&2
    echo "    python3 $(pwd)/preview_server.py &" >&2
    echo "⚠ and make sure it is THIS one: a stale server from an older session" >&2
    echo "  can hold the port and serve a different tree." >&2
    exit 3
fi

for i in $(seq 1 "$ATTEMPTS"); do
    out="$(node "$SMOKE" 2>/tmp/websmoke.err)"
    rc=$?
    if [ "$rc" = "2" ] || { [ "$rc" != "0" ] && [ -z "$out" ]; }; then
        echo "  attempt $i: harness flake — retrying" >&2
        continue
    fi
    echo "$out"
    exit "$rc"
done

echo "harness never produced a clean load in $ATTEMPTS attempts — see /tmp/websmoke.err" >&2
exit 3
