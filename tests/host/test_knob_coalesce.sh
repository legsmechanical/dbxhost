#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# KNOB DETENTS REACH MOVE SUMMED, EVERY FEW FRAMES — the volume knob included.
#
#   RUN   the coalescer and a model of the inject drain's gate
#         (tests/host/test_knob_coalesce.c).
#   PIN   that the shim sends the volume knob through it when it passes CC 79
#         to Move, drops what it gathered once the knob is claimed, and that
#         the emit pass covers every knob (track knobs AND volume). A volume
#         knob passed one CC per detent kept MIDI_IN busy during a fast spin
#         and the notes a module sends to Move's own tracks stuttered.

bin="build/tests/test_knob_coalesce"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-parameter -Isrc/host tests/host/test_knob_coalesce.c -o "$bin"
"$bin"

fail() { echo "FAIL: $*"; exit 1; }
shim=src/schwung_shim.c
grep -q '#include "host/knob_coalesce.h"' "$shim" || fail "shim does not use knob_coalesce.h"
grep -q 'knob_coalesce_add(&s_knob_coalesce, KNOB_COALESCE_VOLUME, d2);' "$shim" || fail "the volume knob is not coalesced"
grep -q 'if (!filter && cin == 0x0B && type == 0xB0 && d1 == CC_MASTER_KNOB) {' "$shim" || fail "volume coalesce is not gated on the knob passing through"
grep -q 'if (vol_claimed) knob_coalesce_drop(&s_knob_coalesce, KNOB_COALESCE_VOLUME);' "$shim" || fail "a claimed volume knob keeps its gathered motion"
grep -q 'knob_coalesce_add(&s_knob_coalesce, d1 - 71, d2);' "$shim" || fail "the track knobs are not coalesced"
grep -q 'for (int k = 0; k < KNOB_COALESCE_KNOBS; k++) {' "$shim" || fail "the emit pass does not cover every knob"
grep -q 'knob_coalesce_place(sh_midi, SHADOW_MIDI_IN_BYTES, knob_coalesce_cc(k), d2)' "$shim" || fail "the emit pass does not place into MIDI_IN"
echo "PASS: knob detents reach Move summed, volume knob included"
