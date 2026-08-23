#!/usr/bin/env bash
# Source-invariant pins for WHICH INSTALL TREE a path points at.
#
# There are two install trees and the names collide, which is the whole trap:
#
#   /data/UserData/schwung/    the STOCK install. SHARED on purpose for
#                              shared/*.mjs, modules/, presets/ — and, because
#                              modules are shared, it is also where davebox's
#                              own per-set files live (set_state/<uuid>/seq8sa-*).
#   /data/UserData/dbx-host/   THIS build's private state. standalone/config.sh
#                              names it: set_state, slot_state, active_set.txt,
#                              shadow_chain_config.json, shadow_config.json.
#
# So `schwung/set_state/<uuid>/` and `dbx-host/set_state/<uuid>/` BOTH exist and
# hold different things, and `active_set.txt` / `shadow_chain_config.json` exist
# in both trees with independent contents. Reading the stock copy of a private
# file silently returns another host's state: on hardware the two chain configs
# differed by 500 bytes and half an hour. Every failure here is silent.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "install-tree paths:"

# 1. Per-install PRIVATE state must come from DAVEBOX_HOST_DIR, never the stock
#    tree. Listed from config.sh's DBX_PRIVATE_STATE.
for f in active_set.txt shadow_chain_config.json shadow_config.json; do
    if grep -rn "'/data/UserData/schwung/$f'" ui/*.mjs >/dev/null 2>&1; then
        bad "$f is read from the STOCK tree — that is another host's state, not ours"
    else
        ok "$f is not read from the stock tree"
    fi
done
grep -q "DAVEBOX_HOST_DIR + '/active_set.txt'" ui/ui_persistence.mjs \
    && ok "active_set.txt comes from DAVEBOX_HOST_DIR" \
    || bad "active_set.txt no longer comes from DAVEBOX_HOST_DIR"
grep -q "DAVEBOX_HOST_DIR + '/shadow_chain_config.json'" ui/ui_export.mjs \
    && ok "the export reads the RUNNING host's chain config" \
    || bad "the export's chain config no longer comes from DAVEBOX_HOST_DIR"

# 2. Our own module directory must follow the BUILD'S module id. SA ships as
#    davebox-sound, Legacy as davebox, a test build as its own id again — and
#    this path is used for pack.py and the export JSON templates, so a wrong
#    one makes every asset read return null and the packer never run.
grep -q "modules/tools/davebox'" ui/ui_export.mjs \
    && bad "the export hardcodes tools/davebox — that directory does not exist under SA" \
    || ok "the export does not hardcode the Legacy module id"
grep -q "typeof DAVEBOX_MODULE_ID === 'string'" ui/ui_export.mjs \
    && ok "the module dir follows the injected build id" \
    || bad "DAVEBOX_MODULE_ID is no longer consulted — the module dir cannot follow the build"
grep -q 'define:DAVEBOX_MODULE_ID' scripts/build_sound.sh \
    && ok "build_sound.sh injects DAVEBOX_MODULE_ID" \
    || bad "build_sound.sh stopped injecting DAVEBOX_MODULE_ID — the JS falls back to Legacy's id"

# 3. The injected id must actually reach the built bundle. The define is easy to
#    add and easy to lose, and losing it fails silently: the fallback is a valid
#    string that happens to name the wrong directory.
if [ -f dist/davebox-sound/ui.js ]; then
    grep -q 'MODULE_ID = true ? "davebox-sound"' dist/davebox-sound/ui.js \
        && ok "the built bundle carries davebox-sound as its module id" \
        || bad "the built bundle did not pick up DAVEBOX_MODULE_ID (stale dist? re-run build_sound.sh)"
else
    echo "  skip — dist/davebox-sound/ui.js not built"
fi

# 5. The umbrella installer must hand FORCE to the module half. install-host.sh
#    takes --force; install_sound.sh reads $FORCE. Until 2026-08-23 install-sa.sh
#    only did the first, so `--force` over a live session landed the host half
#    and then refused the davebox half — two halves, two versions.
if sed -n '/^if \[ "\$DO_DAVEBOX" = "1" \]/,/^fi/p' ../standalone/scripts/install-sa.sh \
        | grep -v '^ *#' | tr '\\\n' '  ' | grep -q 'FORCE="\$FORCE".*install_sound.sh'; then
    ok "install-sa.sh passes FORCE through to the davebox half"
else
    bad "install-sa.sh does not pass FORCE to install_sound.sh (--force would deploy only the host half)"
fi

[ "$fail" -eq 0 ] && echo "PASS: paths point at the install tree that owns them" \
                  || echo "FAIL: an install-tree path points at the wrong host"
exit "$fail"
