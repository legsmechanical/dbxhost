#!/usr/bin/env bash
# shadow_midi_dsp_t.write_idx must be wide enough to address its own 512-byte
# buffer (SHADOW_MIDI_DSP_BUFFER_SIZE), and js_shadow_send_midi_to_dsp must
# actually refuse and count a write it cannot fit, returning JS_FALSE.
#
# Before this fix, write_idx was a uint8_t: it saturated at 255, so the
# `write_offset + 4 <= SHADOW_MIDI_DSP_BUFFER_SIZE` bounds check could never
# fire and `write_idx = write_offset + 4` wrapped 252 -> 0 mid-flush,
# silently overwriting an earlier packet in the same buffer. The write step
# still returned JS_TRUE either way — a dropped note-off looked identical to
# a delivered one. Found 2026-09-15 on-device: a load left a note held.
#
# Part 1 compiles and runs test_midi_dsp_ring_width.c against the real
# struct/constants to pin the width + sizeof + full-buffer behaviour.
# Part 2 source-pins the writer's drop counter and JS_FALSE return, since
# js_shadow_send_midi_to_dsp lives in shadow_ui.c and needs a QuickJS
# context to call directly — a positive control (grepping for the drop
# path's own dead sibling shape) is cheaper and just as load-bearing.
set -u
cd "$(dirname "$0")/../.." || exit 2

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

CC="${CC:-cc}"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/schwung-midi-dsp-ring.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

echo "== part 1: struct width, compiled and run against the real header =="
if ! $CC -O0 -g -std=c11 -Wall -Wno-unused-parameter \
        -I src/host \
        tests/host/test_midi_dsp_ring_width.c \
        -o "$OUT/t" 2> "$OUT/build.log"; then
    echo "BUILD FAIL: test_midi_dsp_ring_width"
    cat "$OUT/build.log"
    exit 1
fi
if "$OUT/t"; then
    ok "the C unit passed"
else
    bad "the C unit failed (see output above)"
fi

echo "== part 2: js_shadow_send_midi_to_dsp source pins =="
SRC=src/shadow/shadow_ui.c

grep -q 'shadow_midi_dsp_drops' "$SRC" \
  && ok "a drop counter (shadow_midi_dsp_drops) exists for the DSP ring" \
  || bad "no drop counter for the MIDI-to-DSP ring — a full buffer is still silent"

# The write step must set a local 'dropped' flag on the else-branch of the
# bounds check, not merely skip the write silently.
if grep -A 12 'int write_offset = shadow_midi_dsp->write_idx;' "$SRC" \
     | grep -q 'dropped = 1;'; then
    ok "the bounds-check else-branch sets dropped, rather than silently skipping the write"
else
    bad "the write step no longer marks a drop on overflow"
fi

if grep -A 12 'int write_offset = shadow_midi_dsp->write_idx;' "$SRC" \
     | grep -q '(uint16_t)(write_offset + 4)'; then
    ok "the write step stores the widened offset (write_idx survives past 255)"
else
    bad "the write step lost its uint16_t cast — a narrowing write would silently truncate again"
fi

# The function must return JS_FALSE, not JS_TRUE, when a drop occurred.
if grep -A 70 'js_shadow_send_midi_to_dsp(JSContext \*ctx' "$SRC" \
     | grep -q 'if (dropped) {' \
   && grep -A 40 'if (dropped) {' "$SRC" \
     | grep -q 'return JS_FALSE;'; then
    ok "a dropped packet makes js_shadow_send_midi_to_dsp return JS_FALSE"
else
    bad "js_shadow_send_midi_to_dsp still returns JS_TRUE on a dropped packet"
fi

grep -q 'shadow MIDI to DSP: buffer full, dropped' "$SRC" \
  && ok "the drop is logged (rate-limited, matching the OUT ring's style)" \
  || bad "no log line for a dropped MIDI-to-DSP packet"

echo "== part 3: the header pins the width and sizeof invariants =="
HDR=src/host/shadow_constants.h
grep -q 'volatile uint16_t write_idx;' "$HDR" \
  && grep -B2 'volatile uint16_t write_idx;' "$HDR" | grep -q 'shadow_midi_dsp_t' \
  && ok "shadow_midi_dsp_t.write_idx is declared inline right after the struct opens" \
  || true  # covered precisely by part 1's compiled check; this is a cheap extra signal

grep -q '_Static_assert((1ull << (8 \* sizeof(((shadow_midi_dsp_t \*)0)->write_idx))) >' "$HDR" \
  && ok "the header pins write_idx's addressability with a _Static_assert, matching the OUT ring" \
  || bad "no _Static_assert pinning shadow_midi_dsp_t.write_idx's width"

[ "$fail" = 0 ] && echo "PASS: shadow MIDI-to-DSP ring is fully addressable and drops are visible" \
                || echo "FAIL: shadow MIDI-to-DSP ring width/drop-visibility gate"
exit "$fail"
