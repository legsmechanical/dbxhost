#!/usr/bin/env bash
# build-stt-addon.sh — build the DICTATION ADD-ON: the speech-to-text runtime
# libraries and the model, which the release does not carry (they are ~160 MB
# unpacked; the release keeps only the helper and its launcher, build/stt/).
# dAVEBOx installs it from its menu (src/stt/addon.sh), into
# <install-dir>/addons/dictation/.
#
#   scripts/build-stt-addon.sh           # build dist/stt-addon/dictation-addon-<N>.tar.gz
#   scripts/build-stt-addon.sh --pin     # ... and write its hash + sizes into src/stt/addon.json
#
# <N> is "version" in src/stt/addon.json. BUMP IT whenever what the add-on holds
# changes (scripts/stt-deps.lock: the runtime, the model, the voice detector):
# a release pins exactly one add-on by its hash, and an install whose add-on
# is an older version offers "Update" in the menu.
#
# REPRODUCIBLE: the same lock gives the same bytes (sorted names, fixed owner
# and time, gzip without a name or time), so --pin can be checked by building
# again — tests/host/test_stt_addon.sh does, when the stage is present.
#
# The archive (no top folder):
#   addon.json   {"name":"dictation","version":N}  — what the installer checks
#   lib/libsherpa-onnx-c-api.so lib/libonnxruntime.so   (stripped)
#   model/encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt silero_vad.onnx
#   licenses/  the texts for everything above
set -euo pipefail
cd "$(dirname "$0")/.."
PIN=0; [ "${1:-}" = --pin ] && PIN=1
SPEC=src/stt/addon.json
VER="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["version"]))' "$SPEC")"
NAME="dictation-addon-$VER.tar.gz"
scripts/fetch-stt.sh >/dev/null
STAGE=.cache/stt/stage
OUT=dist/stt-addon
mkdir -p "$OUT"
rm -rf .cache/stt/addon; mkdir -p .cache/stt/addon

# Assemble + strip + pack inside the build container: the cross strip, and GNU
# tar for the reproducible flags (macOS tar has neither).
docker run --rm -v "$PWD:/build" -w /build -u "$(id -u):$(id -g)" schwung-builder sh -euc '
    A=.cache/stt/addon/root; S='"$STAGE"'
    mkdir -p $A/lib $A/model $A/licenses
    # --strip-unneeded keeps the dynamic symbols the helper links against;
    # ONNX Runtime ships with full debug info (~17 MB of it).
    for l in libsherpa-onnx-c-api.so libonnxruntime.so; do
        aarch64-linux-gnu-strip --strip-unneeded -o $A/lib/$l $S/lib/$l
        if aarch64-linux-gnu-readelf -S $A/lib/$l | grep -q "\.debug_"; then echo "still has debug info: $l" >&2; exit 1; fi
    done
    for m in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt silero_vad.onnx; do cp $S/model/$m $A/model/; done
    cp $S/model/PARAKEET_LICENSE $A/licenses/PARAKEET_LICENSE.txt
    cp $S/model/SILERO_VAD_LICENSE $A/licenses/SILERO_VAD_LICENSE.txt
    cp licenses/Apache-2.0.txt src/stt/addon-licenses/ONNXRUNTIME_LICENSE.txt src/stt/addon-licenses/NOTICE.txt $A/licenses/
    printf "{\"name\":\"dictation\",\"version\":'"$VER"'}\n" > $A/addon.json
    chmod 644 $A/model/* $A/licenses/* $A/addon.json; chmod 755 $A/lib/*
    tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 --format=gnu \
        -C $A -cf - addon.json lib model licenses | gzip -n -9 > .cache/stt/addon/out.tar.gz
'
for l in libsherpa-onnx-c-api.so libonnxruntime.so; do
    bash davebox/scripts/check-glibc.sh ".cache/stt/addon/root/lib/$l" 2.34 >/dev/null \
        || { echo "ERROR: $l needs a glibc newer than the Move's" >&2; exit 1; }
done
for f in licenses/NOTICE.txt licenses/Apache-2.0.txt licenses/ONNXRUNTIME_LICENSE.txt licenses/PARAKEET_LICENSE.txt licenses/SILERO_VAD_LICENSE.txt; do
    [ -s ".cache/stt/addon/root/$f" ] || { echo "ERROR: the add-on would ship without $f" >&2; exit 1; }
done
mv -f .cache/stt/addon/out.tar.gz "$OUT/$NAME"
SUM="$(shasum -a 256 "$OUT/$NAME" | cut -d' ' -f1)"
BYTES="$(wc -c < "$OUT/$NAME" | tr -d ' ')"
UNPACKED="$(du -sk .cache/stt/addon/root | cut -f1)"; UNPACKED=$((UNPACKED * 1024))
echo "$OUT/$NAME"
echo "  sha256   $SUM"
echo "  bytes    $BYTES  (unpacked ~$UNPACKED)"
if [ $PIN = 1 ]; then
    python3 - "$SPEC" "$SUM" "$BYTES" "$UNPACKED" <<'EOF'
import json, sys
p, s, b, u = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
d = json.load(open(p))
d.update(sha256=s, bytes=b, unpacked_bytes=u)
open(p, "w").write(json.dumps(d, indent=2) + "\n")
EOF
    echo "  pinned in $SPEC"
fi
