#!/usr/bin/env bash
# Fetch the speech-to-text runtime + model pinned in scripts/stt-deps.lock into
# .cache/stt/ (gitignored), verify every hash, and unpack a stage the cross
# build reads:
#
#   .cache/stt/stage/include/c-api.h
#   .cache/stt/stage/lib/{libsherpa-onnx-c-api.so,libonnxruntime.so}
#   .cache/stt/stage/model/{encoder.int8.onnx,decoder.int8.onnx,joiner.int8.onnx,tokens.txt,
#                           PARAKEET_LICENSE,silero_vad.onnx,SILERO_VAD_LICENSE}
#
# Runs on the HOST before Docker (the container has no network), like the
# Move-manual fetch — but unlike that one this FAILS CLOSED: a build without the
# runtime ships a keyboard whose push-to-talk can only ever say STT FAILED.
#
#   scripts/fetch-stt.sh            # fetch what is missing, verify everything
#   STT_LOCK=<file> STT_CACHE=<dir> scripts/fetch-stt.sh   # tests
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
LOCK="${STT_LOCK:-$HERE/stt-deps.lock}"
CACHE="${STT_CACHE:-$ROOT/.cache/stt}"

[ -f "$LOCK" ] || { echo "fetch-stt: no lock file at $LOCK" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"
elif command -v shasum >/dev/null 2>&1; then SHA="shasum -a 256"
else echo "fetch-stt: FAIL - no sha256sum or shasum" >&2; exit 1; fi
command -v tar >/dev/null 2>&1 || { echo "fetch-stt: FAIL - no tar" >&2; exit 1; }

mkdir -p "$CACHE/dl"
entries=0
while read -r name sum url; do
    case "$name" in ''|'#'*) continue ;; esac
    [ -n "${sum:-}" ] && [ -n "${url:-}" ] || { echo "fetch-stt: malformed lock line: $name" >&2; exit 1; }
    entries=$((entries + 1))
    file="$CACHE/dl/${url##*/}"
    if [ ! -f "$file" ]; then
        command -v curl >/dev/null 2>&1 || { echo "fetch-stt: FAIL - no curl to fetch $name" >&2; exit 1; }
        echo "fetch-stt: fetching $name"
        curl -fsSL --retry 3 -o "$file.part" "$url"
        mv -f "$file.part" "$file"
    fi
    got="$($SHA "$file" | awk '{print $1}')"
    if [ "$got" != "$sum" ]; then
        echo "fetch-stt: FAIL - $name hash mismatch" >&2
        echo "  want $sum" >&2
        echo "  got  $got  ($file)" >&2
        rm -f "$file"
        exit 1
    fi
    printf '%s %s\n' "$name" "${url##*/}"
done < "$LOCK" > "$CACHE/verified.txt"
[ "$entries" -gt 0 ] || { echo "fetch-stt: FAIL - lock file lists nothing" >&2; exit 1; }

path_of() {   # basenames in the record: the repo path may contain spaces
    local b; b="$(awk -v n="$1" '$1 == n {print $2}' "$CACHE/verified.txt")"
    [ -n "$b" ] && printf '%s' "$CACHE/dl/$b"
}
LIB_TAR="$(path_of sherpa-onnx-lib)"; HDR="$(path_of sherpa-onnx-header)"; MODEL_TAR="$(path_of parakeet-tdt-110m-en)"; MODEL_LIC="$(path_of parakeet-license)"
VAD="$(path_of silero-vad)"; VAD_LIC="$(path_of silero-vad-license)"
for v in LIB_TAR HDR MODEL_TAR MODEL_LIC VAD VAD_LIC; do
    [ -n "${!v}" ] || { echo "fetch-stt: FAIL - lock file has no entry for $v" >&2; exit 1; }
done

# Rebuild the stage whenever the verified set changes (stamp = the lock's hash).
STAMP="$($SHA "$LOCK" | awk '{print $1}')"
STAGE="$CACHE/stage"
if [ "$(cat "$STAGE/.stamp" 2>/dev/null || true)" != "$STAMP" ]; then
    rm -rf "$STAGE" "$CACHE/x"; mkdir -p "$STAGE"/{include,lib,model} "$CACHE/x"
    tar -xjf "$LIB_TAR" -C "$CACHE/x"
    tar -xjf "$MODEL_TAR" -C "$CACHE/x"
    cp "$HDR" "$STAGE/include/c-api.h"
    for so in libsherpa-onnx-c-api.so libonnxruntime.so; do
        f="$(find "$CACHE/x" -name "$so" -type f | head -1)"
        [ -n "$f" ] || { echo "fetch-stt: FAIL - $so not in the runtime archive" >&2; exit 1; }
        cp "$f" "$STAGE/lib/"
    done
    for m in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
        f="$(find "$CACHE/x" -path '*parakeet*' -name "$m" -type f | head -1)"
        [ -n "$f" ] || { echo "fetch-stt: FAIL - $m not in the model archive" >&2; exit 1; }
        cp "$f" "$STAGE/model/"
    done
    cp "$MODEL_LIC" "$STAGE/model/PARAKEET_LICENSE"
    cp "$VAD" "$STAGE/model/silero_vad.onnx"
    cp "$VAD_LIC" "$STAGE/model/SILERO_VAD_LICENSE"
    rm -rf "$CACHE/x"
    printf '%s' "$STAMP" > "$STAGE/.stamp"
fi
echo "fetch-stt: stage ready at $STAGE"
