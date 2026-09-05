#!/bin/bash
# test_js_runner_private_dir.sh — the JS test runner bundles into a PER-TREE
# directory, never one shared /tmp path.
#
# ⚠ THE TRAP THIS PINS (2026-09-05): tests/js/run.sh, run-one.sh and build.mjs
# all hardcoded /tmp/davebox-js-tests. Two worktrees ran the suite at once
# (parallel branches), each overwrote the other's bundles mid-run, and
# test_automation_bank in one tree executed the OTHER tree's automation code —
# a failure no source in the failing tree contained. Both shell entry points
# must derive the dir from the tree and hand it to build.mjs.
set -e
cd "$(dirname "$0")/.."
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }
for f in tests/js/run.sh tests/js/run-one.sh; do
    grep -q 'DAVEBOX_JS_TEST_DIR=.*cksum' "$f" && say "ok   — $f derives the bundle dir from the tree" || bad "$f does not derive a per-tree dir"
    ! grep -q '"/tmp/davebox-js-tests/' "$f" && say "ok   — $f runs nothing out of the shared path" || bad "$f still runs from /tmp/davebox-js-tests/"
done
grep -q "process.env.DAVEBOX_JS_TEST_DIR" tests/js/build.mjs && say "ok   — build.mjs honours DAVEBOX_JS_TEST_DIR" || bad "build.mjs ignores the env"
# two trees must get two dirs
a=$(cd / && printf %s "/x/tree-a" | cksum | cut -d" " -f1); b=$(printf %s "/x/tree-b" | cksum | cut -d" " -f1)
[ "$a" != "$b" ] && say "ok   — two tree paths hash to two dirs" || bad "cksum collision on the control"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
