#!/usr/bin/env bash
# Source-invariant pins for WHICH INSTALL TREE a path points at.
#
# There are two install trees and the names collide, which is the whole trap:
#
#   /data/UserData/schwung/    the STOCK install. SHARED on purpose for
#                              modules/, presets/, patches/ — and, because
#                              modules are shared, it is also where davebox's
#                              own per-set files live (set_state/<uuid>/seq8sa-*).
#
# ⚠⚠ shared/*.mjs IS THE EXCEPTION, AND IT IS NOT WHAT IT LOOKS LIKE. An import
# of '/data/UserData/schwung/shared/constants.mjs' does NOT load the stock copy:
# host REWRITES that prefix to SCHWUNG_INSTALL_DIR/shared/ at module-load time
# (shadow_ui.c, schwung_module_loader). Under SA that is dbx-host/shared/, so
# davebox already runs OUR copies. The literal names the MODULE CONTRACT — the
# string every module hardcodes — not which tree serves it. Section 4 guards it.
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

# 4. ⚠⚠ THE SHARED-IMPORT PREFIX MUST STAY CANONICAL, and this is the least
#    obvious pin in the file, because the "obvious improvement" it blocks looks
#    like a safety fix.
#
#    dAVEBOx SA runs under dbx-host and must never load the stock tree's
#    shared/*.mjs. IT ALREADY DOESN'T: shadow_ui.c's schwung_module_loader
#    rewrites the prefix /data/UserData/schwung/shared/ to
#    SCHWUNG_INSTALL_DIR/shared/, and the SA host is built with
#    SCHWUNG_INSTALL_DIR=$DBX_DIR (standalone/scripts/build-host.sh).
#
#    So "repointing" davebox's imports at /data/UserData/dbx-host/shared/ would
#    be a REGRESSION, not a fix: the specifier would stop matching
#    SHARED_IMPORT_CANONICAL, the rewrite would never fire, and the module would
#    resolve ONE install location literally -- which is the exact coupling the
#    rewrite exists to remove. It would keep working on today's install and
#    break under any host built with a different SCHWUNG_INSTALL_DIR, silently.
#    shadow_ui.c carries the same warning on the #define, for the same reason.
#
#    THE PROOF THAT THE REWRITE IS LIVE, so none of this is theory: davebox
#    imports shared/session_state.mjs, and our shared/filepath_browser.mjs
#    imports it too. That file has NEVER existed in stock schwung, at any
#    version. If these resolved against the stock tree davebox could not save
#    state and its file browser could not load. Both work on hardware.
echo ""
echo "shared-import prefix (the host rewrites it; do not 'fix' it):"
CANON="/data/UserData/schwung/shared/"
if grep -rn "UserData/dbx-host/shared/" ui/*.mjs ui/*.js >/dev/null 2>&1; then
    bad "a davebox import names dbx-host/shared directly -- that BYPASSES the host rewrite"
else
    ok "no davebox import hardcodes dbx-host/shared"
fi
n_imports=$(grep -rho "$CANON[a-z_]*\.mjs" ui/*.mjs ui/*.js 2>/dev/null | sort -u | wc -l | tr -d ' ')
if [ "$n_imports" -ge 8 ]; then
    ok "davebox's $n_imports shared imports all use the canonical prefix"
else
    bad "only $n_imports canonical shared imports found -- did they get repointed?"
fi
# The rewrite is what MAKES the canonical prefix safe, so pin the rewrite too:
# without it, the canonical prefix really would load the stock tree.
if grep -q 'define SHARED_IMPORT_CANONICAL "/data/UserData/schwung/shared/"' ../src/shadow/shadow_ui.c; then
    ok "the host still declares the canonical shared-import prefix"
else
    bad "shadow_ui.c no longer declares SHARED_IMPORT_CANONICAL -- the rewrite is gone"
fi
if grep -q 'SHARED_IMPORT_LOCAL     SCHWUNG_INSTALL_DIR "/shared/"' ../src/shadow/shadow_ui.c; then
    ok "the rewrite still targets THIS install's shared/"
else
    bad "the shared-import rewrite no longer targets SCHWUNG_INSTALL_DIR"
fi
if grep -q 'JS_SetModuleLoaderFunc(rt, NULL, schwung_module_loader, NULL)' ../src/shadow/shadow_ui.c; then
    ok "the rewriting module loader is still installed"
else
    bad "shadow_ui.c no longer installs schwung_module_loader -- shared imports fall back to stock"
fi
if grep -q 'SCHWUNG_INSTALL_DIR=' ../standalone/scripts/build-host.sh; then
    ok "the SA host build sets SCHWUNG_INSTALL_DIR"
else
    bad "build-host.sh no longer sets SCHWUNG_INSTALL_DIR -- the rewrite would be a no-op"
fi

[ "$fail" -eq 0 ] && echo "PASS: paths point at the install tree that owns them" \
                  || echo "FAIL: an install-tree path points at the wrong host"
exit "$fail"
