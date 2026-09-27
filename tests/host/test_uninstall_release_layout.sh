#!/usr/bin/env bash
# tests/host/test_uninstall_release_layout.sh — the "Uninstall dAVEBOx" tarball
# (2026-09-27): one top-level dir named after the module id (what the manager's
# Install from File expects), the helper STAGED as bin/heal.new, never blessed,
# and the module id matching the path uninstall.sh / ui.js / config.sh assume.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
printf 'HEAL' > "$T/heal"
HEAL_BIN="$T/heal" bash standalone/scripts/build-uninstall-release.sh "$T/out" > "$T/log" 2>&1 || bad "build: $(cat "$T/log")"
tb="$T/out/davebox-uninstall-module.tar.gz"
[ -f "$tb" ] && ok "tarball built" || { bad "no tarball"; exit 1; }
L="$(tar -tzf "$tb" | grep -v '/$' | LC_ALL=C sort | tr '\n' ' ')"
[ "$L" = "davebox-uninstall/bin/heal.new davebox-uninstall/module.json davebox-uninstall/ui.js davebox-uninstall/uninstall.sh " ] \
    && ok "exactly module.json, ui.js, uninstall.sh and bin/heal.new under davebox-uninstall/" || bad "contents: $L"
tar -xzf "$tb" -C "$T"
[ "$(cat "$T/davebox-uninstall/bin/heal.new")" = HEAL ] && ok "bin/heal.new is the helper given" || bad "heal.new wrong"
[ -x "$T/davebox-uninstall/uninstall.sh" ] && ok "uninstall.sh is executable" || bad "uninstall.sh not executable"
grep -q '"id": "davebox-uninstall"' "$T/davebox-uninstall/module.json" && ok "module id is davebox-uninstall" || bad "id"
grep -q '"component_type": "tool"' "$T/davebox-uninstall/module.json" && grep -q '"interactive": true' "$T/davebox-uninstall/module.json" \
    && grep -q '"skip_file_browser": true' "$T/davebox-uninstall/module.json" && ok "an interactive Tools module with no file browser" || bad "tool_config"
. standalone/config.sh
grep -q "MOD_DIR = '$DBX_UNINSTALL_HEAL_DIR" "$T/davebox-uninstall/ui.js" && bad "ui.js MOD_DIR points at bin/" || true
grep -q "MOD_DIR = '${DBX_UNINSTALL_HEAL_DIR%/bin}'" "$T/davebox-uninstall/ui.js" && ok "ui.js's module dir == config.sh's uninstaller dir" || bad "ui.js MOD_DIR disagrees with config.sh (${DBX_UNINSTALL_HEAL_DIR%/bin})"
grep -q "\"/data/UserData/schwung/modules/tools/$DBX_UNINSTALL_ID/bin\"" standalone/src/davebox-heal.c && bad "a hardcoded uninstaller HEAL_DIR in the C (it must come from build-heal.sh)" || ok "the helper's HEAL_DIR comes from the build, not the source"
grep -q 'DBX_UNINSTALL_HEAL_DIR' standalone/scripts/build-heal.sh && grep -q 'HEAL_UNINSTALL_ONLY' standalone/scripts/build-heal.sh \
    && ok "build-heal.sh builds the uninstall-only helper with that dir" || bad "build-heal.sh"
grep -q 'davebox-uninstall-module.tar.gz' .github/workflows/release.yml && ok "the release workflow attaches it" || bad "not in release.yml"
grep -q 'davebox-uninstall' release.json && bad "release.json names the uninstaller (release asset ONLY, never the catalog)" || ok "not in release.json"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
