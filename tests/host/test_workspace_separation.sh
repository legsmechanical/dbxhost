#!/usr/bin/env bash
set -euo pipefail

# Workspace separation: a standalone install is a SEPARATE WORKSPACE from the
# stock install (Josh's ruling, 2026-08-06). Host state never crosses installs;
# installed content (modules/presets/patches) is shared by symlink.
#
# The failure mode this pins against was found on hardware the same day, in
# BOTH directions on consecutive attempts:
#   - state paths hardcoded to the stock tree in the JS while the C side
#     composes SCHWUNG_INSTALL_DIR "/..." → the two halves of ONE host read
#     different files ("slot settings don't stick", no error anywhere);
#   - "fixing" that with symlinks → both hosts silently FUSED into one
#     workspace, which is explicitly not the design.
#
# The correct shape: every state path in the JS composes from
# HOST_INSTALL_DIR (registered by js_host_common.c from SCHWUNG_INSTALL_DIR),
# so the JS and C halves agree in ANY flavour, and each flavour gets its own
# tree. Content stays shared by the installer's symlinks.

cd "$(dirname "$0")/../.."

cfg=standalone/config.sh
inst=standalone/scripts/install-host.sh
ui=src/shadow/shadow_ui.js
common=src/host/js_host_common.c

fail() { echo "FAIL: $*" >&2; exit 1; }

for f in "$cfg" "$inst" "$ui" "$common"; do
  [ -f "$f" ] || fail "$f missing"
done

# shellcheck disable=SC1090
. "$cfg"

[ "${DBX_SHARED_LINKS:-}" = "modules presets patches" ] ||
  fail "DBX_SHARED_LINKS drifted: '${DBX_SHARED_LINKS:-}'"
[ "${DBX_PRIVATE_STATE:-}" = "set_state slot_state active_set.txt shadow_chain_config.json shadow_config.json" ] ||
  fail "DBX_PRIVATE_STATE drifted: '${DBX_PRIVATE_STATE:-}'"

grep -q 'DBX_SHARED_LINKS' "$inst"  || fail "install-host.sh does not consume DBX_SHARED_LINKS"
grep -q 'DBX_PRIVATE_STATE' "$inst" || fail "install-host.sh does not consume DBX_PRIVATE_STATE"

# The C side must publish the install dir to every JS context.
grep -q '"HOST_INSTALL_DIR", JS_NewString(ctx, SCHWUNG_INSTALL_DIR)' "$common" ||
  fail "js_host_common.c no longer registers HOST_INSTALL_DIR"

# The shadow UI must derive its state root from it...
grep -q 'HOST_STATE_ROOT' "$ui" || fail "shadow_ui.js lost HOST_STATE_ROOT"
grep -q 'typeof HOST_INSTALL_DIR === "string"' "$ui" ||
  fail "shadow_ui.js HOST_STATE_ROOT no longer derives from HOST_INSTALL_DIR"

# ...and carry NO hardcoded stock-tree literal for any private state family.
# (patches/modules literals are fine — those are the shared families.)
for name in set_state slot_state active_set.txt shadow_chain_config.json shadow_config.json; do
  if grep -qF "/data/UserData/schwung/$name" "$ui"; then
    fail "shadow_ui.js re-grew a stock-tree literal for private state: $name"
  fi
done

echo "PASS: workspace-separation contract intact"
