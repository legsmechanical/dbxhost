#!/usr/bin/env bash
# Build the dAVEBOx SA manual as one self-contained HTML page, with every OLED screen rendered
# off-device from the real UI code. Generated from docs/working/MANUAL-SA.draft.md — edit that,
# never the output.
#
#   scripts/build_manual_html.sh [out.html]      (default: dist/manual/dAVEBOx-SA-manual.html)
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-dist/manual/dAVEBOx-SA-manual.html}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs "$tmp" >/dev/null
node tools/build_manual_html.mjs --screens "$tmp/screens.json" --out "$out"
