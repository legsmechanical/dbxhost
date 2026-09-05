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

[ "${DBX_SHARED_LINKS:-}" = "presets patches" ] ||
  fail "DBX_SHARED_LINKS drifted: '${DBX_SHARED_LINKS:-}'"

# ⚠ `modules` MUST NOT be back in that list. A bare symlink into the stock tree
# is how a stock v1.0.0 update replaced modules/chain/dsp.so underneath dAVEBOx
# (2026-08-30): upstream's chain does not answer the fork's colon readback
# (`synth:module`), so shadow_get_param returned empty, discovery took its
# silent early return, and every slot in every project rendered "EMPTY / CLICK
# TO PICK" with the state files perfectly intact. The two module.json files are
# BYTE-IDENTICAL, version string included, so nothing else can catch this.
case " ${DBX_SHARED_LINKS:-} " in
  *" modules "*) fail "modules is back in DBX_SHARED_LINKS — a stock update would \
again replace the chain DSP that dAVEBOx runs" ;;
esac
[ "${DBX_OWNED_MODULE_DIRS:-}" = "chain tools/davebox-sound" ] ||
  fail "DBX_OWNED_MODULE_DIRS drifted: '${DBX_OWNED_MODULE_DIRS:-}'"

# davebox-sound must be installed into the OWNED tree, never stock's.
command grep -q 'INSTALL_DIR="/data/UserData/dbx-host/modules/tools/\${MODULE_ID}"' \
  davebox/scripts/install_sound.sh ||
  fail "install_sound.sh does not target the owned modules tree — a stock update \
could overwrite or drop dAVEBOx SA the way v1.0.0 replaced the chain DSP"

# ...and the host must SCAN its own tools dir, or owning it achieves nothing.
command grep -q 'HOST_INSTALL_DIR' src/shadow/shadow_ui_tools.mjs ||
  fail "scanForToolModules no longer composes TOOLS_DIR from the install dir — a \
secondary install would scan the DEFAULT install's tools and silently miss its own"
command grep -q '"/data/UserData/schwung/modules/tools"' src/shadow/shadow_ui_tools.mjs &&
  fail "scanForToolModules still hardcodes the stock tools path"

# The installer must (a) not let the payload write modules/, and (b) deploy the
# owned categories from OUR build.
command grep -q -- '--exclude=/modules' "$inst" ||
  fail "install-host.sh does not exclude /modules from the payload rsync — the \
build's own modules/ would replace the per-category symlinks and un-share the \
user's module library"
# Anchored on the TRANSFER, not merely on the string appearing somewhere: the
# guard above it names the same path, so a looser match stays green while the
# rsync source is pointed elsewhere (found by mutation).
command grep -qE 'rsync .*"\$REPO_ROOT/build/modules/\$own/"' "$inst" ||
  fail "install-host.sh does not rsync DBX_OWNED_MODULE_DIRS from build/modules \
— the pinned category would not actually be deployed from this build"

# The premise: the fork's chain is what implements the colon readback. If this
# moves, the pin above is still right but someone should re-derive why.
command grep -q 'synth:module' src/modules/chain/dsp/chain_host.c ||
  fail "the fork's chain DSP no longer carries the synth:module readback — \
re-examine whether dbx-host still needs to own modules/chain"
[ "${DBX_PRIVATE_STATE:-}" = "slot_state active_set.txt shadow_chain_config.json shadow_config.json" ] ||
  fail "DBX_PRIVATE_STATE drifted: '${DBX_PRIVATE_STATE:-}'"

# The consumer moved (2026-09-05): the device-side layout is ONE script,
# layout-install.sh, which install-host.sh runs from the stage and the first-launch
# bootstrap runs from the launcher module's payload. Pin both halves of that.
lay=standalone/scripts/layout-install.sh
grep -q 'DBX_SHARED_LINKS' "$lay"  || fail "layout-install.sh does not consume DBX_SHARED_LINKS"
grep -q 'DBX_PRIVATE_STATE' "$lay" || fail "layout-install.sh does not consume DBX_PRIVATE_STATE"
grep -q 'DBX_OWNED_MODULE_DIRS' "$lay" || fail "layout-install.sh does not consume DBX_OWNED_MODULE_DIRS"
grep -q 'layout-install.sh' "$inst" || fail "install-host.sh no longer runs layout-install.sh — the two deploy paths have diverged"
grep -q 'layout-install.sh' standalone/scripts/bootstrap.sh || fail "bootstrap.sh no longer runs layout-install.sh"
grep -q 'layout-install.sh' scripts/build.sh || fail "build.sh does not stage layout-install.sh into the payload"

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
