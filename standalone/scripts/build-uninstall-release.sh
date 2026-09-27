#!/usr/bin/env bash
# standalone/scripts/build-uninstall-release.sh — the "Uninstall dAVEBOx" Tools
# module tarball (2026-09-27). A release asset only, never a catalog entry: it
# is installed on purpose, through the manager's Install from File.
#
#   davebox-uninstall/
#     module.json      a stock Tools module (interactive, no file browser)
#     ui.js            the screen: asks, starts uninstall.sh, reports
#     uninstall.sh     does the work (also runnable over ssh)
#     bin/heal.new     the HEAL_UNINSTALL_ONLY helper, STAGED for stock's
#                      schwung-heal to bless (uninstall.sh asks it to). ⚠ Never
#                      a pre-blessed bin/heal: the manager chowns the tree to
#                      ableton on install, which strips setuid anyway.
#
#   ./standalone/scripts/build-uninstall-release.sh [out-dir]
# Env for tests: HEAL_BIN (default standalone/build/heal-uninstall, from build-heal.sh).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
. "$HERE/config.sh"
HEAL_BIN="${HEAL_BIN:-$HERE/build/$DBX_HEAL_NAME-uninstall}"
OUT="${1:-$REPO_ROOT}"
ID="$DBX_UNINSTALL_ID"
[ -f "$HEAL_BIN" ] || { echo "ERROR: missing $HEAL_BIN — run build-heal.sh first" >&2; exit 1; }

stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
M="$stage/$ID"
mkdir -p "$M/bin"
cp "$HERE/uninstall/module.json" "$HERE/uninstall/ui.js" "$HERE/uninstall/uninstall.sh" "$M/"
chmod 755 "$M/uninstall.sh"
cp "$HEAL_BIN" "$M/bin/heal.new"; chmod 755 "$M/bin/heal.new"
mkdir -p "$OUT"
tarball="$OUT/$ID-module.tar.gz"
COPYFILE_DISABLE=1 tar -C "$stage" -czf "$tarball" "$ID/"   # no ._ AppleDouble files from a Mac build
echo "built $tarball ($(du -h "$tarball" | cut -f1))"
