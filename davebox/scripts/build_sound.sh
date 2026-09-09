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

# ⚠⚠ WIPE, don't just ensure. install_sound.sh ships `dist/${MODULE_ID}/*`
# WHOLESALE, so anything this directory has ever held goes to the device —
# a renamed bundle, a file whose source was deleted, an artifact from a build
# of a different shape. Nothing warns: the build prints its usual success and
# the stale file rides along under a manifest that counts it as ours.
# Found 2026-09-08 by the DR32 session hitting the same class one door over —
# a tracked `build/obj/*.o` survived its source's deletion and got LINKED into
# the shipped dsp.so, silently, because a shared-library link need not resolve
# undefined symbols. Different mechanism, same rule: a build output directory
# is derived state, so REGENERATE it rather than accumulate into it.
# Safe to delete: dist/ is gitignored (0 tracked files) and every artifact
# below is rewritten by this script.
# ⚠⚠ ONLY ON THE OUTER PASS. This script RE-RUNS ITSELF inside Docker with
# SKIP_BUNDLE=1 on the same mounted volume (see the docker run below), so an
# unguarded wipe here executes TWICE and the second one deletes the ui.js the
# host just bundled — leaving a module with no UI, from a build that exits 0
# and prints its usual success. Caught by a decoy file, not by reading it.
if [ -z "$SKIP_BUNDLE" ]; then
    rm -rf "dist/${MODULE_ID}"
fi
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
        --define:DAVEBOX_MODULE_ID="\"${MODULE_ID}\"" \
        --format=esm \
        --outfile="dist/${MODULE_ID}/ui.js" \
        --log-level=warning
    echo "Bundle: dist/${MODULE_ID}/ui.js ($(wc -c < "dist/${MODULE_ID}/ui.js" | tr -d ' ') bytes)"
fi

# Re-enter inside Docker if there's no cross compiler.
if ! command -v "${CROSS_PREFIX}gcc" >/dev/null 2>&1; then
    echo "Cross compiler not found, building via Docker..."
    docker build -t davebox-builder -f Dockerfile .
    # ⚠ The shared build gates live in the REPO ROOT's scripts/, which is
    # OUTSIDE this mount — only davebox is mounted at /build. Mount them too
    # rather than keeping a second copy: a duplicated gate is a gate that
    # drifts. DBX_SCRIPTS is what the inner pass looks for.
    docker run --rm -v "$PROJECT_DIR:/build" \
        -v "$(cd "$PROJECT_DIR/.." && pwd)/scripts:/dbxscripts:ro" -w /build davebox-builder \
        bash -c "SKIP_BUNDLE=1 CROSS_PREFIX=aarch64-linux-gnu- EXPECT_GCC='${EXPECT_GCC:-}' DBX_SCRIPTS=/dbxscripts ./scripts/build_sound.sh"
    exit $?
fi

echo "=== Building dAVEBOx SA (state prefix: ${STATE_PREFIX}) ==="
echo "Compiling DSP..."
"${CROSS_PREFIX}gcc" -g -O3 -shared -fPIC \
    -DSEQ8_STATE_PREFIX="\"${STATE_PREFIX}\"" \
    -DDAVEBOX_MODULE_ID="\"${MODULE_ID}\"" \
    dsp/seq8.c \
    -o "dist/${MODULE_ID}/dsp.so" \
    -I. \
    -lm

cp sound/module.json "dist/${MODULE_ID}/module.json"
cp web_ui.html       "dist/${MODULE_ID}/"
# The remote UI's classic <script src> halves (web_ui_core.js, web_ui_seq.js and
# any future sibling). Globbed so a new one ships without touching this line —
# a missing half is silent on device: the page loads and does nothing.
cp web_ui_*.js       "dist/${MODULE_ID}/"

# Export packager + templates, same as the stable build (read on-device at
# export time). Cheap to ship and their absence is a confusing runtime failure.
cp export/pack.py                         "dist/${MODULE_ID}/pack.py"
cp export/ableton-master.json             "dist/${MODULE_ID}/ableton-master.json"
cp export/ableton-export-drift-dummy.json "dist/${MODULE_ID}/drift-dummy.json"

# Metronome click: convert source asset to 16-bit mono 48 kHz for DSP render_block.
python3 - <<'PYEOF'
import wave, struct, audioop, warnings
warnings.filterwarnings('ignore')
src = "assets/db-click.wav"
dst = "dist/davebox-sound/click-seq8.wav"
with wave.open(src, 'rb') as r:
    rate, nch, sw, nf = r.getframerate(), r.getnchannels(), r.getsampwidth(), r.getnframes()
    raw = r.readframes(nf)
samples = []
for i in range(0, len(raw), sw * nch):
    ch_vals = []
    for ch in range(nch):
        b = raw[i + ch*sw : i + ch*sw + sw]
        if sw == 3:
            v = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0] >> 8
        elif sw == 2:
            v = struct.unpack('<h', b)[0]
        else:
            v = 0
        ch_vals.append(v)
    samples.append(max(-32768, min(32767, sum(ch_vals) // len(ch_vals))))
peak = max(abs(s) for s in samples) if samples else 1
if peak == 0: peak = 1
samples = [max(-32768, min(32767, round(s * 32767 / peak))) for s in samples]
raw16 = struct.pack('<' + 'h' * len(samples), *samples)
raw48, _ = audioop.ratecv(raw16, 2, 1, rate, 48000, None)
with wave.open(dst, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
    w.writeframes(raw48)
frames_out = len(raw48) // 2
print(f"click-seq8.wav: {frames_out} frames @ 48000 Hz, 16-bit mono (resampled from {rate} Hz)")
PYEOF

echo "Verifying GLIBC symbol versions (must be <= 2.35)..."
NM_BIN="${CROSS_PREFIX}nm"
command -v "$NM_BIN" >/dev/null 2>&1 || NM_BIN="nm"
"$NM_BIN" -D "dist/${MODULE_ID}/dsp.so" 2>/dev/null \
    | grep -o 'GLIBC_[0-9.]*' | sort -u || true

# ---- WHICH COMPILER ACTUALLY MADE THIS -------------------------------------
# gcc writes its version into the artifact's .comment section, always and for
# free — so this needs no change to how anything is built, no stamp of our own,
# and it does not affect byte-identity. It is READ, not added.
#
# ⚠⚠ WHY IT IS WORTH ASSERTING. A hash proves two artifacts match; it cannot
# say they were made the same way. The DR32 session shipped three commits built
# by gcc 11.4 while reporting them as the verified 12.2 build, because its
# builder-image selection fell through to a different image. Root cause (proven
# 2026-09-09, 5 attempts out of 5): `docker image inspect` FALSE-NEGATIVES on a
# present, listed, runnable image, while `docker run <image>` on the same image
# at the same moment succeeds.
#
# This fork cannot fall through — it names one image — but the same assertion
# also catches an image rebuilt on a moved base and a container run by hand,
# and costs one grep. Bump EXPECT_GCC deliberately when the toolchain moves;
# a surprise is exactly what this exists to make loud.
# ⚠ Defaulted with :- so an EMPTY forward from the outer pass still lands on
# the default. The outer pass exits straight after `docker run`, so THIS runs
# inside the container — an override that is not forwarded on that command line
# never arrives, which is how the first negative control of this very check
# passed while demanding a compiler that was not used.
EXPECT_GCC="${EXPECT_GCC:-12.2.0}"
_got_gcc="$(strings "dist/${MODULE_ID}/dsp.so" 2>/dev/null | grep -m1 -oE '^GCC: \(.*\) [0-9.]+' | grep -oE '[0-9.]+$' || true)"
if [ -z "$_got_gcc" ]; then
    echo "Error: dist/${MODULE_ID}/dsp.so carries no GCC version — cannot verify the toolchain" >&2
    exit 1
fi
if [ "$_got_gcc" != "$EXPECT_GCC" ]; then
    echo "Error: built with gcc $_got_gcc, expected $EXPECT_GCC." >&2
    echo "       The builder image is not the one this build assumes." >&2
    exit 1
fi
echo "Toolchain verified: gcc $_got_gcc"

# ⭐ READ THE ARTIFACT for symbols it references but does not contain. A module
# is a -shared object, so the link accepts them and the failure arrives at
# dlopen on the device. Same gate the host build runs; see
# ../scripts/check-artifact.sh for why it is one check and not four.
# DBX_SCRIPTS is set when this pass runs inside the container (where the repo
# root is not mounted); outside, the scripts sit beside the davebox tree.
# ⚠ NOT skipped when absent — a gate that quietly does not run is the failure
# it exists to prevent.
DBX_SCRIPTS="${DBX_SCRIPTS:-$PROJECT_DIR/../scripts}"
"$DBX_SCRIPTS/check-artifact.sh" "dist/${MODULE_ID}/dsp.so" "$NM_BIN"

echo "=== Built dist/${MODULE_ID} ==="
