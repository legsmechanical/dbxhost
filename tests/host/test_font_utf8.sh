#!/usr/bin/env bash
# A glyph past ASCII in the host bitmap font draws — see test_font_utf8.c.
set -euo pipefail

cd "$(dirname "$0")/../.."

out="build/tests/font_utf8"
mkdir -p "$out"
python3 scripts/generate_font.py --deploy-png "$out/font.png" >/dev/null

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter \
  -Isrc -Isrc/host -Ilibs/quickjs/quickjs-2025-04-26 \
  tests/host/test_font_utf8.c src/host/js_display.c \
  -lm -o "$out/test_font_utf8"

"$out/test_font_utf8" "$out/font.png"
