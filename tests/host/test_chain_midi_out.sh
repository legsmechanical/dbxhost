#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# The chain's `midi_out` sink (item 15): runs the REAL v2_on_midi out of
# chain_midi.c against a fake synth and a fake host ring. See the .c header.
work="$(mktemp -d "${TMPDIR:-/tmp}/schwung-midi-out.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/shim"
cat > "$work/shim/malloc.h" <<'EOT'
#include <stdlib.h>
EOT
bin="build/tests/test_chain_midi_out"
mkdir -p "$(dirname "$bin")"
dl_flag=""
if ! cc -std=gnu11 -x c -o /dev/null - <<'EOT' >/dev/null 2>&1
#include <dlfcn.h>
int main(void) { return dlopen("", 0) != 0; }
EOT
then
  dl_flag="-ldl"
fi
cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -I"$work/shim" -Isrc -Isrc/modules/chain/dsp -Isrc/host \
  tests/host/test_chain_midi_out.c src/modules/chain/dsp/chain_midi.c \
  -o "$bin" $dl_flag
"$bin"
