#!/usr/bin/env bash
# Regenerate the Screen view's offline fixtures: one REAL document per manual
# screen, published by the real UI while the manual renderer plays a viewer
# (tools/render_manual_screens.mjs, HUD_OUT). Never hand-edit them.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=tools/websmoke/hud_fixtures
T=$(mktemp -d "${TMPDIR:-/tmp}/hudfx.XXXXXX"); trap 'rm -rf "$T"' EXIT
HUD_OUT="$T/hud" node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$T/png" > "$T/log" 2>&1 \
    || { grep -E "PROBLEM|SKIPPED" "$T/log" | head; exit 1; }
rm -rf "$out"; mkdir -p "$out"; cp "$T"/hud/*.json "$out"/
echo "$(ls "$out" | wc -l | tr -d ' ') files -> $out"
