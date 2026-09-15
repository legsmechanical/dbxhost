#!/usr/bin/env bash
# tests/test_custom_widgets_bundle.sh — module-supplied in-grid widgets, in the
# SHIPPED BUNDLE. Builds dist/davebox/ui.js with scripts/bundle_ui.sh, then
# drives it with tests/js/bundle_custom_widgets.mjs: the registry dAVEBOx fills
# must be the one the grid reads, which only the bundle's EXTERNAL imports and
# its module order can answer. See that file's header.
set -u
cd "$(dirname "$0")/.." || exit 2

if ! command -v node >/dev/null 2>&1; then
    echo "SKIP: test_custom_widgets_bundle (no node)"; exit 0
fi
if [ ! -x node_modules/.bin/esbuild ]; then
    echo "SKIP: test_custom_widgets_bundle (no esbuild — run npm ci)"; exit 0
fi

if ! bash scripts/bundle_ui.sh >/dev/null 2>&1; then
    echo "FAIL: test_custom_widgets_bundle (bundle_ui.sh failed)"; exit 1
fi
out="$(node --import ./tools/audit_loader.mjs tests/js/bundle_custom_widgets.mjs 2>&1)"
rc=$?
if [ $rc -ne 0 ]; then
    echo "FAIL: test_custom_widgets_bundle"
    echo "$out" | grep -E '  (ok|FAIL) +—|Error' | tail -20
    exit 1
fi
echo "$out" | grep '  ok   —'
echo "PASS: test_custom_widgets_bundle"
