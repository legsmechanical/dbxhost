#!/bin/bash
# tests/test_undeclared_names.sh — no UI module may use a name it never declares.
#
# esbuild builds an undeclared name as a host global, so it compiles, bundles and
# passes `node --check`; it throws only when the line runs, and the tick / MIDI
# handler swallow the error into seq8-jserr.log. Three live bugs were that shape
# on 2026-09-11: every ALL LANES knob (`lane`), the drum count-in capture
# (`tps`), and the Module Menu of any module with repeated elements (`lvl`).
# tools/check_undeclared.mjs does the scope analysis; this runs it.
#
# ⚠ It FAILS rather than skips when its packages are missing: a skip reads as a
# pass, and this check exists because a silent pass is the failure it catches.
set -u
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then echo "FAIL: node not found"; exit 1; fi
if [ ! -d node_modules/eslint-scope ] || [ ! -d node_modules/acorn ]; then
    echo "FAIL: test_undeclared_names needs its dev packages — run 'npm ci' in davebox/"
    exit 1
fi
if node tools/check_undeclared.mjs; then echo "PASS: no undeclared names in ui/"; exit 0; fi
echo "FAIL: a UI module uses a name nothing declares (see the list above)"
exit 1
