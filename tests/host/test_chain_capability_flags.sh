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
# The shim honours it on EVERY FX path. There are three (deferred, the Link
# Audio rebuild, the inline fallback); the keep-alive used to live in one, and a
# Link Audio session runs another, so the flag was dead there even when parsed.
sh=src/schwung_shim.c
parks="$(grep -c 'shadow_slot_fx_idle\[s\] = 1' "$sh" || true)"
calls="$(grep -c '^ *shadow_slot_fx_track_idle(s, fx_buf);' "$sh" || true)"
if [ "$parks" != 1 ]; then echo "  FAIL $sh parks a slot's FX in $parks places (want 1: shadow_slot_fx_track_idle)"; fail=1
else echo "  ok   one place parks a slot's FX"; fi
if ! awk '/^static inline void shadow_slot_fx_track_idle/,/^}/' "$sh" | grep -q 'shadow_chain_fx_requires_continuous('; then
  echo "  FAIL shadow_slot_fx_track_idle does not consult the continuous-processing flag"; fail=1
else echo "  ok   that place honours requires_continuous_processing"; fi
if [ "$calls" -lt 3 ]; then echo "  FAIL only $calls FX path(s) call shadow_slot_fx_track_idle (want 3)"; fail=1
else echo "  ok   all $calls FX paths go through it"; fi
[ $fail = 0 ] && echo "PASS: capability flag parse sites + the shim keep-alive" || { echo "FAIL: capability flags"; exit 1; }
