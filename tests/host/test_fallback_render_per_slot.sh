#!/bin/bash
# test_fallback_render_per_slot.sh — the shim's FALLBACK render path (a chain
# without same-frame FX) renders into a PER-SLOT buffer and judges silence on
# THAT buffer, never on the shared accumulator.
#
# ⚠ THE RACE THIS PINS (parallel-render survey, 2026-09-05): the fallback path
# rendered into a stack scratch and then read shadow_deferred_dsp_buffer — the
# accumulator of every slot mixed so far — for its idle decision, so slot B's
# silence check saw slot A's audio (a silent B never napped while A played), and
# under a render pool every fallback slot would have written one buffer.
set -e
cd "$(dirname "$0")/../.."
C=src/schwung_shim.c
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }
grep -q '^static int16_t shadow_slot_fallback\[SHADOW_CHAIN_INSTANCES\]\[FRAMES_PER_BLOCK \* 2\];' "$C" \
    && say "ok   — a per-slot fallback buffer exists, sized by the slot count" || bad "no per-slot fallback buffer"
blk=$(awk '/Fallback: full render \(synth \+ FX\)/{f=1} f{print} f&&/Check if synth render output is silent/{exit}' "$C")
[ -n "$blk" ] || { bad "fallback block not found"; echo FAIL; exit 1; }
echo "$blk" | grep -q 'int16_t \*render_buffer = shadow_slot_fallback\[s\];' && say "ok   — the fallback renders into THIS slot's buffer" || bad "fallback still renders into a scratch"
! echo "$blk" | grep -q 'int16_t render_buffer\[FRAMES_PER_BLOCK \* 2\];' && say "ok   — no stack scratch left on the fallback path" || bad "stack scratch remains"
grep -q 'same_frame_fx ? shadow_slot_deferred\[s\] : shadow_slot_fallback\[s\]' "$C" \
    && say "ok   — the silence check reads the slot's own output on both paths" || bad "silence check still reads the accumulator on the fallback path"
! grep -q 'same_frame_fx ? shadow_slot_deferred\[s\] : shadow_deferred_dsp_buffer' "$C" \
    && say "ok   — ...and never the accumulator" || bad "accumulator still used for a slot's silence"
# the accumulator is still the reduce target (serial today; a pool reduces after the loop)
grep -q 'int32_t mixed = shadow_deferred_dsp_buffer\[i\] + (int32_t)(render_buffer\[i\] \* vol \* pg);' "$C" \
    && say "ok   — the mix into the accumulator is unchanged (the reduce step a pool would move)" || bad "mix-in changed"
echo "int16_t render_buffer[FRAMES_PER_BLOCK * 2];" | grep -q 'shadow_slot_fallback' && bad "control: a scratch line passed" || say "ok   — control: a stack scratch does not pass the pin"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
