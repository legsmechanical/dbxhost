#!/bin/bash
# tests/js/run.sh — bundle each test_*.mjs with esbuild (aliasing the
# on-device shared constants to a stub via tests/js/build.mjs — the esbuild
# CLI's --alias flag rejects absolute-path keys, so we use esbuild's JS API
# with a resolve plugin instead), run under node.
set -e
cd "$(dirname "$0")/../.."
# One bundle dir PER TREE (2026-09-05): a shared /tmp/davebox-js-tests let two
# worktrees' suites overwrite each other's bundles mid-run, so a test in one
# tree executed the other tree's code. The dir is derived from this tree's path.
export DAVEBOX_JS_TEST_DIR="${DAVEBOX_JS_TEST_DIR:-/tmp/davebox-js-tests-$(printf %s "$PWD" | cksum | cut -d" " -f1)}"
mkdir -p "$DAVEBOX_JS_TEST_DIR"
node tests/js/build.mjs
fail=0
for t in tests/js/test_*.mjs; do
  out="$DAVEBOX_JS_TEST_DIR/$(basename "$t" .mjs).js"
  if node "$out"; then echo "PASS: $(basename "$t")"; else echo "FAIL: $(basename "$t")"; fail=1; fi
done
# ⚠ This is a SUBSET. CI runs davebox/tests/run.sh, which is these plus the
# shell invariants, node --check on the web UI, and the manual/help generation —
# roughly 134 checks against these ~28. A green run here says nothing about the
# other hundred, which is how a stale source pin sat red in CI for a day
# (2026-08-24). Say so on the way out rather than letting the count imply
# coverage it does not have.
echo
echo "  (JS subset only — CI runs 'bash tests/run.sh' for the full ~134 checks)"
exit $fail
