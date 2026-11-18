#!/usr/bin/env bash
# The speech-to-text helper's recognizer-free core: WAV + downmix, the
# go/cancel handshake, the atomic result file. (src/stt/stt_core.c)
set -euo pipefail
cd "$(dirname "$0")/../.."
bin="build/tests/test_stt_core"
mkdir -p "$(dirname "$bin")"
cc -std=c11 -Wall -Wextra -Isrc/stt tests/host/test_stt_core.c src/stt/stt_core.c -o "$bin" -lm
"$bin"

# The helper itself needs the recognizer, so it is not built here; pin that it
# judges silence the tested way — stt_gate on the raw (pre-normalising) peak,
# never a peak of the normalised buffer it decodes.
h=src/stt/stt_helper.c
grep -q 'stt_gate(audio_ms, raw_peak)' "$h" || { echo "FAIL: stt_helper.c does not gate on the raw peak"; exit 1; }
grep -q '&raw_peak' "$h" || { echo "FAIL: stt_helper.c does not read the raw peak"; exit 1; }
! grep -q 'stt_peak(' "$h" || { echo "FAIL: stt_helper.c measures the NORMALISED buffer (stt_peak)"; exit 1; }
echo "PASS stt_helper gates on the raw peak"
grep -q 'stt_limits((argc > 7) ? atoi(argv\[7\]) : 0' src/stt/stt_helper.c && grep -q 'stt_wait_go(go, cancel, go_ms' src/stt/stt_helper.c \
    && grep -q 'alarm((unsigned)hard_s)' src/stt/stt_helper.c \
    || { echo "FAIL: stt_helper.c does not size its waits from the take length"; exit 1; }
echo "PASS stt_helper sizes its waits from the take length"
# Only the voice is decoded: the detector's model is loaded, a take where it
# finds none is no_speech, and the recognizer gets the voiced span at 16 kHz.
grep -q '"%s/silero_vad.onnx"' "$h" && grep -q 'voiced_span(vad, x16, n16, &from, &to) != 0) skip = "no_speech"' "$h" \
    && grep -q 'SherpaOnnxAcceptWaveformOffline(st, VAD_RATE, x16 + from, (int32_t)(to - from))' "$h" \
    && grep -q 'stt_span(st, ln, k, n, ' "$h" \
    || { echo "FAIL: stt_helper.c does not decode only the voiced span"; exit 1; }
echo "PASS stt_helper decodes only what the voice detector heard"
