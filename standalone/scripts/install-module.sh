#!/usr/bin/env bash
# Install the "dAVEBOx SA" launcher into STOCK Schwung's tools directory.
#
# This module is deliberately tiny: a manifest plus one executable. It is not
# davebox — it is the thing that swaps the host underneath so davebox can then
# run inside the davebox build, as an ordinary tool.
#
# Why it is a separate module rather than a flag on davebox itself: the shadow
# UI dispatches a tool by the FIRST branch that matches, and davebox declares
# tool_config.skip_file_browser + .interactive (+ .overtake), all of which are
# tested before `standalone`. Setting standalone on davebox would therefore be
# silently ignored — it would keep launching as an interactive/overtake tool.
#
# Needs no root: it writes only into the ableton-owned modules tree. The one
# privileged step is scripts/install-privileged.sh, run once, separately.

set -euo pipefail

HOST="${MOVE_HOST:-ableton@move.local}"
STOCK_TOOLS="/data/UserData/schwung/modules/tools"
MODULE_ID="davebox-sa"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing $MODULE_ID to $HOST:$STOCK_TOOLS/$MODULE_ID"

# The host runs "<module dir>/standalone" — the name is fixed, not read from
# the manifest (shadow_ui.js: `tool.path + "/standalone"`).
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/$MODULE_ID"
cp "$HERE/module/module.json" "$tmp/$MODULE_ID/module.json"
cp "$HERE/scripts/launch.sh"  "$tmp/$MODULE_ID/standalone"
chmod +x "$tmp/$MODULE_ID/standalone"

ssh "${HOST%%:*}" "mkdir -p '$STOCK_TOOLS/$MODULE_ID'"
scp -q "$tmp/$MODULE_ID/module.json" "$HOST:$STOCK_TOOLS/$MODULE_ID/module.json"
scp -q "$tmp/$MODULE_ID/standalone"  "$HOST:$STOCK_TOOLS/$MODULE_ID/standalone"
# scp does not preserve the executable bit reliably across these paths.
ssh "${HOST%%:*}" "chmod +x '$STOCK_TOOLS/$MODULE_ID/standalone'"

echo "Installed. It appears in stock Schwung's Tools menu as 'dAVEBOx SA'."
echo "A host restart is required before a newly added module is discovered."
