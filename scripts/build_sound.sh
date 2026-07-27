#!/bin/bash
# Build the sound-mode TEST build of dAVEBOx — a second, complete davebox that
# installs alongside the stable one under module id `davebox-sound`.
#
# The only difference from a normal build is SEQ8_STATE_PREFIX. dAVEBOx's state
# files are keyed by set UUID alone and carry no module id, so two installs
# would otherwise read and write the same seq8-state.json — a bug in the test
# build could corrupt the daily driver's sessions. Both halves of the prefix
# must agree: the DSP gets -DSEQ8_STATE_PREFIX, the JS bundle gets the matching
# esbuild --define. They are set together here and nowhere else.
#
# Consequence worth knowing before you test: this build starts with EMPTY
# sessions. It cannot see the stable install's sets.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODULE_ID="davebox-sound"
STATE_PREFIX="seq8sm"
CROSS_PREFIX="${CROSS_PREFIX:-aarch64-linux-gnu-}"

mkdir -p "dist/${MODULE_ID}"

# Bundle UI on the host (Docker image has no Node).
if [ -z "$SKIP_BUNDLE" ]; then
    if [ ! -f "node_modules/.bin/esbuild" ]; then
        echo "Installing build dependencies..."
        npm install --silent
    fi
    echo "Bundling UI (state prefix: ${STATE_PREFIX})..."
    node_modules/.bin/esbuild ui/ui.js \
        --bundle \
        --external:'/data/UserData/schwung/*' \
        --external:os \
        --define:SEQ8_STATE_PREFIX="\"${STATE_PREFIX}\"" \
        --format=esm \
        --outfile="dist/${MODULE_ID}/ui.js" \
        --log-level=warning
    echo "Bundle: dist/${MODULE_ID}/ui.js ($(wc -c < "dist/${MODULE_ID}/ui.js" | tr -d ' ') bytes)"
fi

# Re-enter inside Docker if there's no cross compiler.
if ! command -v "${CROSS_PREFIX}gcc" >/dev/null 2>&1; then
    echo "Cross compiler not found, building via Docker..."
    docker build -t davebox-builder -f Dockerfile .
    docker run --rm -v "$PROJECT_DIR:/build" -w /build davebox-builder \
        bash -c "SKIP_BUNDLE=1 CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build_sound.sh"
    exit $?
fi

echo "=== Building dAVEBOx SND (state prefix: ${STATE_PREFIX}) ==="
echo "Compiling DSP..."
"${CROSS_PREFIX}gcc" -g -O3 -shared -fPIC \
    -DSEQ8_STATE_PREFIX="\"${STATE_PREFIX}\"" \
    dsp/seq8.c \
    -o "dist/${MODULE_ID}/dsp.so" \
    -I. \
    -lm

cp sound/module.json "dist/${MODULE_ID}/module.json"
cp web_ui.html       "dist/${MODULE_ID}/"

# Export packager + templates, same as the stable build (read on-device at
# export time). Cheap to ship and their absence is a confusing runtime failure.
cp export/pack.py                         "dist/${MODULE_ID}/pack.py"
cp export/ableton-master.json             "dist/${MODULE_ID}/ableton-master.json"
cp notes/ableton-export-drift-dummy.json  "dist/${MODULE_ID}/drift-dummy.json"

# Metronome click: the stable build generates this from source at build time.
# Reuse it if present rather than duplicating the conversion.
if [ -f "dist/davebox/click-seq8.wav" ]; then
    cp dist/davebox/click-seq8.wav "dist/${MODULE_ID}/click-seq8.wav"
else
    echo "NOTE: dist/davebox/click-seq8.wav not found — run ./scripts/build.sh once"
    echo "      if you want the metronome click in the test build."
fi

echo "Verifying GLIBC symbol versions (must be <= 2.35)..."
NM_BIN="${CROSS_PREFIX}nm"
command -v "$NM_BIN" >/dev/null 2>&1 || NM_BIN="nm"
"$NM_BIN" -D "dist/${MODULE_ID}/dsp.so" 2>/dev/null \
    | grep -o 'GLIBC_[0-9.]*' | sort -u || true

echo "=== Built dist/${MODULE_ID} ==="
