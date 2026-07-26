#!/bin/bash
# Bundle the dAVEBOx Lab rig into dist/davebox-lab/ui.js using esbuild.
#
# Same contract as bundle_ui.sh: local relative imports are inlined (which is
# how lab/ shares ../ui/ui_movy.mjs with davebox without a copy), and the
# schwung shared modules stay external for the QuickJS runtime to resolve.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -f "node_modules/.bin/esbuild" ]; then
    echo "Installing build dependencies..."
    npm install --silent
fi

mkdir -p dist/davebox-lab

echo "Bundling Lab UI..."
# 'os' is a QuickJS built-in module resolved on the device — must stay external
# or esbuild tries to bundle Node's os and the device import breaks.
node_modules/.bin/esbuild lab/ui.js \
    --bundle \
    --external:'/data/UserData/schwung/*' \
    --external:os \
    --format=esm \
    --outfile=dist/davebox-lab/ui.js \
    --log-level=warning

cp lab/module.json dist/davebox-lab/module.json

lines=$(wc -l < dist/davebox-lab/ui.js | tr -d ' ')
bytes=$(wc -c < dist/davebox-lab/ui.js | tr -d ' ')
echo "Bundle: dist/davebox-lab/ui.js (${lines} lines, ${bytes} bytes)"
