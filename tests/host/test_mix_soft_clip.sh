#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# THE REBUILT MIX IS SUMMED WITH HEADROOM AND SOFT-CLIPPED ONCE
# (port of upstream #581).
#
#   RUN   the curve itself (tests/host/test_mix_soft_clip.c, upstream's).
#   PIN   that the rebuild sums into la_acc and converts exactly once, before
#         the first FX that reads the mix as int16 — and that no per-add clamp
#         into the mailbox has come back. This fork's rebuild has FOUR adds:
#         the Move FX buses, the slots, the send returns and the overtake DSP.

bin="build/tests/test_mix_soft_clip"
mkdir -p "$(dirname "$bin")"
cc -std=gnu11 -O2 -Wall -Wextra -Wno-unused-parameter \
  -Isrc/host \
  tests/host/test_mix_soft_clip.c \
  -o "$bin" -lm
"$bin"

fail() { echo "FAIL: $*"; exit 1; }
shim=src/schwung_shim.c
n=$(grep -c 'mix_soft_clip_block(la_acc, mailbox_audio' "$shim" || true)
[ "$n" -eq 1 ] || fail "the rebuild sum is converted $n times, want exactly 1"
adds=$(grep -c 'la_acc\[i\] += ' "$shim" || true)
[ "$adds" -eq 4 ] || fail "the rebuild has $adds adds into la_acc, want 4 (Move FX bus, slot, send return, overtake DSP)"
if grep -nE 'mailbox_audio\[i\] \+ \(int32_t\)(lroundf|shadow_deferred_dsp_buffer)|\(int32_t\)mailbox_audio\[i\] \+ (scaled|sv)\b' "$shim"; then
  fail "a per-add clamp into mailbox_audio is back in the rebuild (above)"
fi
conv=$(grep -n 'mix_soft_clip_block(la_acc, mailbox_audio' "$shim" | sed -n 1p | cut -d: -f1)
last_add=$(grep -n 'la_acc\[i\] += ' "$shim" | tail -n 1 | cut -d: -f1)
first_fx=$(grep -n 'int16_t \*fx_target = rebuild_from_la ? mailbox_audio : me_unity_i16;' "$shim" | sed -n 1p | cut -d: -f1)
[ -n "$conv" ] && [ -n "$last_add" ] && [ -n "$first_fx" ] || fail "cannot locate the conversion, the adds or the first FX"
[ "$last_add" -lt "$conv" ] || fail "an add into la_acc comes AFTER the conversion — it is never heard"
[ "$conv" -lt "$first_fx" ] || fail "the conversion comes after the first FX reads the mailbox"
grep -q 'memset(la_acc, 0, sizeof(la_acc));' "$shim" || fail "la_acc is not zeroed with the mailbox"
echo "PASS: the rebuilt mix is summed with headroom and soft-clipped once"
