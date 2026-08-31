#!/bin/bash
# Bundle dAVEBOx UI modules into dist/davebox/ui.js using esbuild.
#
# esbuild resolves local relative imports (./ui_*.mjs) and bundles them inline.
# Shared schwung imports (/data/UserData/schwung/shared/*) are marked external
# and kept as import statements in the output for the QuickJS runtime to resolve.
#
# Requires Node.js + esbuild (npm install). Runs on the host before Docker.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f "node_modules/.bin/esbuild" ]; then
    echo "Installing build dependencies..."
    npm install --silent
fi

mkdir -p dist/davebox

# ---------------------------------------------------------------------------
# THE MODULE EDITOR IS VENDORED, AND davebox OWNS THE COPY (2026-08-31)
#
# Josh, in one breath, and all four constraints matter:
#   "i want davebox module editing to be the same as stock module editing.
#    i don't want to change anything outside of module editing.
#    i want davebox module editing to be something it owns so that future
#    upstream updates don't break things. but i also want to be able to easily
#    pull any module editor updates into davebox if they're desirable."
#
# So `davebox/ui/vendor/` is a COMMITTED copy of the host's binding, not a
# build-time regeneration. Regenerating from src/shadow/ on every build would
# have satisfied "the same as stock" and broken "updates don't break things" —
# an upstream change to that file would silently change davebox's editor with
# no diff, no review and no way to decline it. Freezing the copy is what makes
# it OURS — and keeping it VERBATIM is what keeps a future update cheap: taking
# one is a copy plus a diff review, never a merge. (No update script yet, by
# request; the architecture is what preserves the option, not tooling.)
#
# What the bundle does with it: esbuild inlines the vendored file and its
# relative ctx import, while its `/data/UserData/schwung/shared/*` imports stay
# external and ride the module loader's prefix rewrite to THIS install — the
# same route every other davebox shared import takes.
#
# ⚠⚠ NEVER import `/data/UserData/schwung/shadow/...` at runtime instead. The
# loader rewrites ONLY the shared/ prefix (SHARED_IMPORT_CANONICAL in
# src/shadow/shadow_ui.c), so a shadow/ import executes the STOCK TREE — the
# dependency that let a v1.0.0 update replace a chain DSP under us on
# 2026-08-30 — and it would hand davebox the same module INSTANCE the host
# already imported, sharing its singleton controller and host-wired ctx.
if [ ! -f "$PROJECT_DIR/ui/vendor/shadow_ui_param_pages.mjs" ]; then
    echo "ERROR: ui/vendor/shadow_ui_param_pages.mjs is missing — it is a" >&2
    echo "       COMMITTED copy of src/shadow/shadow_ui_param_pages.mjs." >&2
    exit 1
fi

echo "Bundling UI..."
# 'os' is a QuickJS built-in MODULE resolved on the device (ui_engine.mjs scans
# the module tree with os.readdir) — must stay external or esbuild pulls in
# Node's os and the device import breaks. shadow_ui.js imports it the same way.
node_modules/.bin/esbuild ui/ui.js \
    --bundle \
    --external:'/data/UserData/schwung/*' \
    --external:os \
    --format=esm \
    --outfile=dist/davebox/ui.js \
    --log-level=warning

lines=$(wc -l < dist/davebox/ui.js | tr -d ' ')
bytes=$(wc -c < dist/davebox/ui.js | tr -d ' ')
echo "Bundle: dist/davebox/ui.js (${lines} lines, ${bytes} bytes)"

# Remote-UI page is a static single file; ship it on the JS-only deploy path too
# (install.sh scp's dist/davebox/*). build.sh also copies it for full builds.
if [ -f web_ui.html ]; then
    cp web_ui.html dist/davebox/web_ui.html
    # Sibling JS (split 2026-08-16): without these the shell loads NOTHING.
    cp web_ui_*.js dist/davebox/ 2>/dev/null || true
    echo "Copied: dist/davebox/web_ui.html ($(wc -c < web_ui.html | tr -d ' ') bytes)"
fi
