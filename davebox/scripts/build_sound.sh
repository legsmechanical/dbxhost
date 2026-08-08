#!/bin/bash
# Build the dAVEBOx SA build — the one that runs under the dAVEBOx host, and the
# one active development targets. Module id `davebox-sound`.
#
# This began life as a throwaway "sound-mode test build" installed beside the
# stable davebox. It is not that any more: SA is the successor, and the plain
# module is becoming a frozen legacy install for people with old sessions.
#
# ⚠ SA sessions and legacy sessions are DELIBERATELY NOT COMPATIBLE (Josh,
# 2026-08-03). They are separate namespaces on purpose, and no migration between
# them is planned or owed — legacy exists so old sessions stay openable, not so
# they travel. Do not "fix" this by pointing SA at the legacy prefix.
#
# ⚠ Legacy keeps the UNSUFFIXED `seq8` prefix even though SA is the successor,
# for the same reason legacy keeps the `davebox` catalog id: it is already on
# users' devices, and the whole job of legacy is reading state that is already
# there. SA is the one that takes a new name.
#
# The prefix is the ONLY difference from a normal build. State files are keyed by
# set UUID alone and carry no module id, so two installs would otherwise read and
# write the same seq8-state.json. Both halves must agree: the DSP gets
# -DSEQ8_STATE_PREFIX, the JS bundle gets the matching esbuild --define. Set
# together here and nowhere else. It keys FIVE things — the per-set state and
# ui-state, the no-set fallback state file, snapshots (`<prefix>-snap-*`), the log,
# and `<prefix>_name_index.json` (underscore, not hyphen — easy to miss when
# renaming).
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

MODULE_ID="davebox-sound"
# `seq8sa`, not the old `seq8sm`: "sm" meant sound-mode TEST build, and leaving a
# throwaway name on the successor's permanent state namespace is how it gets
# mistaken for scratch data later. Renamed 2026-08-03; existing seq8sm files on a
# device are migrated by scripts/migrate_sa_state.sh.
STATE_PREFIX="seq8sa"
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

echo "=== Building dAVEBOx SA (state prefix: ${STATE_PREFIX}) ==="
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
