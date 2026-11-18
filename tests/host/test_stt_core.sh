#!/usr/bin/env bash
# The speech-to-text helper's recognizer-free core: WAV + downmix, the
# go/cancel handshake, the atomic result file. (src/stt/stt_core.c)
set -euo pipefail
cd "$(dirname "$0")/../.."
bin="build/tests/test_stt_core"
mkdir -p "$(dirname "$bin")"
cc -std=c11 -Wall -Wextra -Isrc/stt tests/host/test_stt_core.c src/stt/stt_core.c -o "$bin" -lm
"$bin"
