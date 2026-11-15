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
# Run N at a time (tests/harness/pool.sh), each to its own log under the
# per-tree dir; results print in glob order, as the serial loop did.
# (tests/run.sh does not call this: it puts these units in its own pool.)
set +e
. tests/harness/pool.sh
pool_start "$DAVEBOX_JS_TEST_DIR/results"
names=(); units=(); failed=()
for t in tests/js/test_*.mjs; do
  [ -f "$t" ] || continue
  names+=("$(basename "$t" .mjs)"); units+=("js:$(basename "$t" .mjs)")
done
pool_run "$DAVEBOX_JS_TEST_DIR/timings" ${units[@]+"${units[@]}"}
pool_report_js ${names[@]+"${names[@]}"}
fail=0; [ "$js_nfail" -eq 0 ] || fail=1
echo "JS: $js_npass passed, $js_nfail failed, $(wc -l < "$POOL_SKIPS" | tr -d ' ') skipped"
cat "$POOL_SKIPS"
# Zero collected is not green.
if [ "${#names[@]}" -eq 0 ]; then
  echo "FAIL: collected NO tests/js/test_*.mjs - the JS units did not run" >&2
  fail=1
fi
# ⚠ This is a SUBSET. CI runs davebox/tests/run.sh, which is these plus the
# shell invariants, node --check on the web UI, and the manual/help generation —
# roughly 134 checks against these ~28. A green run here says nothing about the
# other hundred, which is how a stale source pin sat red in CI for a day
# (2026-08-24). Say so on the way out rather than letting the count imply
# coverage it does not have.
echo
echo "  (JS subset only — CI runs 'bash tests/run.sh' for the full ~134 checks)"
exit $fail
