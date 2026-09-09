#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The help viewer must read THIS install's help, not the stock tree's.
#
# Both trees ship shared/help_content.json and they are DIFFERENT files. On the
# device, 2026-09-09: ours 13,105 bytes (just deployed), stock's 30,084 bytes
# (a day older). Reading the stock literal meant every edit this fork makes to
# its own help file was invisible, and stock's copy was displayed in its place
# -- silently, because both files exist and both parse.
#
# Caught by adding a help entry, deploying it, and looking at the device. No
# test could have caught it, because the code was reading a real file that
# really parsed; only the PATH was wrong.
#
# ⚠ Do not "fix" the shared-module import prefix to match. That one is the
# module CONTRACT and shadow_ui.c's loader rewrites it (SHARED_IMPORT_CANONICAL
# -> SHARED_IMPORT_LOCAL). Nothing rewrites a data path, which is the whole
# distinction this test exists to hold.

fail() { echo "FAIL: $1" >&2; exit 1; }
ui="src/shadow/shadow_ui.js"

# --- the help CONTENT file ------------------------------------------------
command grep -q 'host_read_file(HOST_STATE_ROOT + "/shared/help_content.json")' "$ui" || \
  fail "help_content.json is not read from HOST_STATE_ROOT -- this install's own help edits are invisible"
if command grep -q 'host_read_file("/data/UserData/schwung/shared/help_content.json")' "$ui"; then
  fail "help_content.json is STILL read from the stock tree literal"
fi

# --- the per-module help SCAN ---------------------------------------------
blk=$(awk '/Build a map of help.json content keyed by module directory/,/Loaded module help/' "$ui")
[ -n "$blk" ] || fail "the module-help scan block is gone from $ui"
command grep -q 'const MODULES_DIR = HOST_STATE_ROOT + "/modules";' <<<"$blk" || \
  fail "the module-help scan does not use HOST_STATE_ROOT -- modules this fork owns (chain, the tools split) can never contribute help"
if command grep -q 'const MODULES_DIR = "/data/UserData/schwung/modules";' <<<"$blk"; then
  fail "the module-help scan STILL points at the stock modules tree"
fi

# --- the constant it depends on -------------------------------------------
# HOST_STATE_ROOT falls back to the stock literal when the host global is
# absent, which is correct for a stock build (the two are then the same
# string) and is what makes this change a no-op there rather than a break.
command grep -q 'const HOST_STATE_ROOT = (typeof HOST_INSTALL_DIR === "string" && HOST_INSTALL_DIR)' "$ui" || \
  fail "HOST_STATE_ROOT is no longer derived from the HOST_INSTALL_DIR global"

echo "  ok  help_content.json comes from THIS install"
echo "  ok  the per-module help scan walks THIS install's modules"
echo "PASS: help reads this install, not the stock tree"
