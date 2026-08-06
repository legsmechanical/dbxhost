#!/usr/bin/env bash
set -euo pipefail

# Shared user-state links: the contract that keeps both halves of the
# standalone host reading the SAME state files.
#
# The shadow UI's JS addresses user state by hardcoded literal under
# /data/UserData/schwung, while the C side composes SCHWUNG_INSTALL_DIR "/..."
# (the standalone install dir). Inside the standalone install dir, each shared
# name must therefore be a SYMLINK to the stock tree — created by
# install-host.sh from the DBX_SHARED_STATE_* lists in standalone/config.sh.
#
# This pins three things:
#   1. config.sh declares both lists, including every name that has BOTH a JS
#      literal and a C install-dir composition (that pair is what splits).
#   2. install-host.sh actually consumes both lists in its ensure-link step.
#   3. A real dir/file in the way is moved aside, never deleted or merged.
#
# Diagnosed 2026-08-06: set_state was a real directory on device, so per-set
# slot settings saved by the JS (stock tree) were invisible to the C boot
# loader (install dir), which fell back to a stale per-install global file.
# Nothing errored; the setting simply "didn't stick".
#
# If you add a new shared path: add it to config.sh AND to the expected list
# here. If you add a new C-side SCHWUNG_INSTALL_DIR state path that the JS
# touches by /data/UserData/schwung literal, it MUST go on these lists.

cd "$(dirname "$0")/../.."

cfg=standalone/config.sh
inst=standalone/scripts/install-host.sh

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -f "$cfg" ] || fail "$cfg missing"
[ -f "$inst" ] || fail "$inst missing"

# shellcheck disable=SC1090
. "$cfg"

expected_dirs="modules presets patches slot_state set_state set_pages"
expected_files="active_set.txt shadow_chain_config.json shadow_config.json"

[ "${DBX_SHARED_STATE_DIRS:-}" = "$expected_dirs" ] ||
  fail "DBX_SHARED_STATE_DIRS drifted: '$(printf '%s' "${DBX_SHARED_STATE_DIRS:-}")' != '$expected_dirs'"
[ "${DBX_SHARED_STATE_FILES:-}" = "$expected_files" ] ||
  fail "DBX_SHARED_STATE_FILES drifted: '$(printf '%s' "${DBX_SHARED_STATE_FILES:-}")' != '$expected_files'"

# The installer must iterate BOTH lists through its ensure-link step.
grep -q 'DBX_SHARED_STATE_DIRS' "$inst" ||
  fail "install-host.sh does not consume DBX_SHARED_STATE_DIRS"
grep -q 'DBX_SHARED_STATE_FILES' "$inst" ||
  fail "install-host.sh does not consume DBX_SHARED_STATE_FILES"
grep -q 'ensure_link' "$inst" ||
  fail "install-host.sh lost its ensure_link step"

# Migration semantics: move aside, never delete. The only rm allowed in the
# ensure-link step is removing a WRONG SYMLINK before re-linking.
grep -q 'pre-share-' "$inst" ||
  fail "install-host.sh no longer moves real files aside as .pre-share-<date>"

# Every name with both a JS literal and a C install-dir composition must be
# covered. These greps are the tripwire for NEW splits: if one fires for a
# name not in the lists above, extend the lists, don't relax the test.
for name in set_state slot_state active_set.txt shadow_chain_config.json shadow_config.json; do
  grep -q "/data/UserData/schwung/$name" src/shadow/shadow_ui.js ||
    fail "expected JS literal for $name vanished — update this test's model"
  case " $expected_dirs $expected_files " in
    *" $name "*) : ;;
    *) fail "$name has a JS literal but is not on the shared-state lists" ;;
  esac
done

echo "PASS: shared user-state link contract intact"
