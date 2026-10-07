#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A "<comp>:state" READ SAVES THE KNOB, NOT THE MODULATION; a state/preset
# WRITE re-captures the base it replaced. (From upstream #572, re-implemented:
# upstream's swap lived in chain_scene.c, which this fork does not carry.)
#
#   RUN   the real chain_mod.c against a fake synth
#         (tests/host/test_chain_mod_state_read.c).
#   PIN   that the chain's two param entry points are the wrappers that call
#         it — a route added beside them would save the swing again.

fail() { echo "FAIL: $1"; exit 1; }

bin="build/tests/test_chain_mod_state_read"
mkdir -p "$(dirname "$bin")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '#include <stdlib.h>\n' > "$work/malloc.h"

cc -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-unused-function \
  -Wno-sign-compare \
  -I"$work" -Isrc -Isrc/host -Isrc/modules/chain/dsp \
  tests/host/test_chain_mod_state_read.c \
  src/modules/chain/dsp/chain_mod.c \
  src/modules/chain/dsp/chain_params.c \
  src/modules/chain/dsp/chain_json.c \
  -o "$bin"

"$bin"

H=src/modules/chain/dsp/chain_host.c
command grep -q '^    \.set_param = v2_set_param,$' "$H" || fail "the plugin's set_param is not the wrapper"
command grep -q '^    \.get_param = v2_get_param,$' "$H" || fail "the plugin's get_param is not the wrapper"
awk '/^static void v2_set_param\(/,/^}/' "$H" > "$work/set.c"
command grep -q 'v2_set_param_route(instance, key, val);' "$work/set.c" || fail "the set wrapper does not route"
command grep -q 'chain_mod_after_set_param(instance, key);' "$work/set.c" || fail "a bulk write no longer rebases the modulated params"
awk '/^static int v2_get_param\(/,/^}/' "$H" > "$work/get.c"
begin=$(command grep -n 'chain_mod_state_read_begin' "$work/get.c" | sed -n 1p | cut -d: -f1)
route=$(command grep -n 'v2_get_param_route' "$work/get.c" | sed -n 1p | cut -d: -f1)
out=$(command grep -n 'chain_mod_state_swap_out' "$work/get.c" | sed -n 1p | cut -d: -f1)
[ -n "$begin" ] && [ -n "$route" ] && [ -n "$out" ] || fail "the get wrapper is missing a step"
[ "$begin" -lt "$route" ] && [ "$route" -lt "$out" ] || fail "the get wrapper must swap in, read, then swap out"

echo "PASS: a state read saves the knob, and a state write is the new knob"
