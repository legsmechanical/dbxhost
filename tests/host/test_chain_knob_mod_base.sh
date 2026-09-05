#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A chain knob turn is an EDIT of the resting value, not a write past the
# modulation bus. (Re-derived from upstream 84953eee — this fork's
# knob_forward_value carries fx3/fx4 and midi_fx routes, so the fix is
# re-applied by hand and the pin counts THIS tree's call sites.)
#
#   RUN   the real knob_forward_value against the real chain_mod.c and a fake
#         synth, and prove a turn on a modulated parameter updates the BASE and
#         survives every later LFO tick — while an unmodulated parameter still
#         goes straight through (tests/host/test_chain_knob_mod_base.c).
#
#   PIN   that knob_forward_value stays the ONE place a chain knob reaches a
#         plugin: the external relative-CC decode and the absolute CC in
#         chain_midi.c, and knob_N_adjust in chain_host.c (the path the
#         device's own encoders and davebox's macro legs use). A fourth route
#         would reintroduce the bug for one input method only.

fail() { echo "FAIL: $1"; exit 1; }

# ------------------------------------------------------------------ run half
bin="build/tests/test_chain_knob_mod_base"
mkdir -p "$(dirname "$bin")"

# chain_internal.h includes <malloc.h>, which is glibc-only; one shim header
# lets this compile on macOS too and changes nothing about the code under test.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '#include <stdlib.h>\n' > "$work/malloc.h"

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -Wno-sign-compare \
  -I"$work" -Isrc -Isrc/host -Isrc/modules/chain/dsp \
  tests/host/test_chain_knob_mod_base.c \
  src/modules/chain/dsp/chain_mod.c \
  src/modules/chain/dsp/chain_params.c \
  src/modules/chain/dsp/chain_json.c \
  -o "$bin"

"$bin"

# ------------------------------------------------------------------ pin half
P=src/modules/chain/dsp/chain_params.c
command grep -q 'chain_mod_is_target_active(inst, target, param)' "$P" \
  || fail "knob_forward_value does not ask whether the target is modulated"
command grep -q 'chain_mod_update_base_from_set_param(inst, target, param, val_str)' "$P" \
  || fail "knob_forward_value does not update the base"

# ...and it does so BEFORE any plugin write. A write that already happened
# cannot be taken back; the ordering is the whole fix.
awk '/^void knob_forward_value/,/^}/' "$P" > "$work/kfv.c"
base_line=$(command grep -n 'chain_mod_update_base_from_set_param' "$work/kfv.c" | head -1 | cut -d: -f1)
set_line=$(command grep -n -- '->set_param(' "$work/kfv.c" | head -1 | cut -d: -f1)
[ -n "$base_line" ] && [ -n "$set_line" ] || fail "could not locate both calls in knob_forward_value"
[ "$base_line" -lt "$set_line" ] \
  || fail "knob_forward_value writes the plugin before telling the modulation bus"

# Every knob path funnels through it: exactly the three known call sites.
sites=$(command grep -c 'knob_forward_value(inst, target, param, val_str);' \
  src/modules/chain/dsp/chain_host.c src/modules/chain/dsp/chain_midi.c | awk -F: '{s+=$2} END {print s}')
[ "$sites" = 3 ] || fail "expected 3 knob_forward_value call sites (host knob_N_adjust, midi relative, midi absolute), found $sites"

echo "PASS: a knob turn edits the base, and every knob path goes through it"
