#!/usr/bin/env bash
# tests/test_seq_lane_playback.sh — a SEQUENCER lane plays back, in the SHIPPED
# BUNDLE. See tests/js/bundle_seq_apply.mjs for why this one bundles ui/ui.js
# itself instead of living in the tests/js runner: the bug it catches (the
# applier registered from a module body and then wiped by another module's
# initialiser) exists only in the bundle's module ORDER, and every
# import-the-modules test passes straight through it.
set -u
cd "$(dirname "$0")/.." || exit 2

if ! command -v node >/dev/null 2>&1; then
    echo "SKIP: test_seq_lane_playback (no node)"
    exit 0
fi
if [ ! -x node_modules/.bin/esbuild ]; then
    echo "SKIP: test_seq_lane_playback (no esbuild — run npm ci)"
    exit 0
fi

export DAVEBOX_JS_TEST_DIR="${DAVEBOX_JS_TEST_DIR:-/tmp/davebox-js-tests-$(printf %s "$PWD" | cksum | cut -d" " -f1)}"
mkdir -p "$DAVEBOX_JS_TEST_DIR"
out="$(node tests/js/bundle_seq_apply.mjs 2>&1)"
rc=$?
if [ $rc -ne 0 ]; then
    echo "FAIL: test_seq_lane_playback"
    echo "$out" | tail -20
    exit 1
fi
echo "$out" | grep '  ok   —'
echo "PASS: test_seq_lane_playback"
