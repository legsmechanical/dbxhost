#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# VOLUME, PAN AND MUTE GLIDE INTO THE MIX (from upstream #566).
#
#   RUN   the glide itself (tests/host/test_mix_glide.c).
#   PIN   that EVERY mix loop uses it. This fork has four slot loops (the
#         deferred fallback, the Move->Schwung rebuild, and the two non-rebuild
#         paths — they differ in how the mailbox is built, not in what gain a
#         slot owes it) plus the Move FX bus loop, and a loop left on the
#         per-block gain is zipper noise in one mode only.

bin="build/tests/test_mix_glide"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-parameter -Isrc/host tests/host/test_mix_glide.c -o "$bin" -lm
"$bin"

fail() { echo "FAIL: $*"; exit 1; }
shim=src/schwung_shim.c
n=$(grep -c 'mix_glide_t \*mg = shadow_mix_targets(s);' "$shim" || true)
[ "$n" -eq 4 ] || fail "$n slot mix loops set glide targets, want 4"
a=$(grep -c 'if (i & 1) { shadow_fade_advance(s); mix_glide_advance(mg); }' "$shim" || true)
[ "$a" -eq 4 ] || fail "$a slot mix loops advance the glide, want 4"
grep -q 'mix_glide_t \*bg = shadow_move_fx_mix_targets(s);' "$shim" || fail "the Move FX bus loop does not set glide targets"
grep -q 'if (i & 1) mix_glide_advance(bg);' "$shim" || fail "the Move FX bus loop does not advance the glide"
# No mix loop may go back to a per-block gain. (cap_vol — captures and sends —
# stays per-block on purpose and is the only allowed reader.)
bad=$(grep -n 'shadow_effective_volume(s) \* shadow_chain_slots\[s\]\.fade\.gain' "$shim" | grep -v 'cap_vol' || true)
[ -z "$bad" ] || fail "a mix loop computes a per-block gain again: $bad"
if grep -nE 'lroundf\(\(float\)msrc\[i\] \* mvol' "$shim"; then fail "the Move FX bus mix is back on the per-block volume"; fi
# The master volume: one ramp, used by every loop that scales audio by it.
grep -q 'mix_glide_ramp(&mv_glide, mv, mv_ramp, FRAMES_PER_BLOCK);' "$shim" || fail "the master volume is not ramped"
m=$(grep -c 'mv_ramp\[i >> 1\]' "$shim" || true)
[ "$m" -eq 3 ] || fail "$m loops use the master-volume ramp, want 3"
echo "PASS: volume, pan and mute glide in every mix loop"
