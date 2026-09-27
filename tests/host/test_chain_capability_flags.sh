#!/usr/bin/env bash
# tests/host/test_chain_capability_flags.sh — module.json capability flags are
# read as flags (`true` or a number), and the chain reads them through that one
# helper: a C unit on json_get_flag_in_section, plus a pin that the two parse
# sites use it (reading a flag with json_get_int ignores `true`).
set -euo pipefail
cd "$(dirname "$0")/../.."

bin="build/tests/test_chain_capability_flags"
mkdir -p "$(dirname "$bin")"
# chain_internal.h pulls <malloc.h>, absent on macOS — same stub as the other chain_json tests.
stub="$(mktemp -d)"
trap 'rm -rf "$stub"' EXIT
printf '#include <stdlib.h>\n' > "$stub/malloc.h"
cc -std=gnu11 -Wall -I"$stub" -Isrc -Isrc/host \
  tests/host/test_chain_capability_flags.c src/modules/chain/dsp/chain_json.c -o "$bin"
"$bin"

fail=0
for site in "src/modules/chain/dsp/chain_host.c:requires_continuous_processing" \
            "src/modules/chain/dsp/chain_midi.c:pre_capable"; do
  f="${site%%:*}"; k="${site#*:}"
  ctx="$(grep -n "\"$k\"" "$f" | grep -v '^\s*[0-9]*:\s*/\?\*' || true)"
  if printf '%s\n' "$ctx" | grep -q "json_get_int"; then
    echo "  FAIL $f reads $k with json_get_int (ignores true)"; fail=1
  elif ! grep -B1 "\"$k\"" "$f" | grep -q "json_get_flag_in_section"; then
    echo "  FAIL $f does not read $k through json_get_flag_in_section"; fail=1
  else
    echo "  ok   $f reads $k as a flag"
  fi
done
[ $fail = 0 ] && echo "PASS: capability flag parse sites" || { echo "FAIL: capability flag parse sites"; exit 1; }
