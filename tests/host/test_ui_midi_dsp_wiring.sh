#!/usr/bin/env bash
# THE MIDI-TO-DSP SEGMENT IS A RING: the shim owns read_idx and nothing else,
# shadow_ui owns write_idx and the bytes, and both go through ui_midi_dsp_ring.h.
#
# The drain used to finish with `write_idx = 0` and a memset of the buffer while
# js_shadow_send_midi_to_dsp (shadow_ui, a SEPARATE PROCESS) could be appending:
# a note the module was told was delivered was erased. test_ui_midi_dsp_ring.c
# and test_ui_midi_dsp_ring_threads.c pin the header; this pins the two call
# sites, so a hand-rolled write cannot come back around the helpers.
#
# It also carries the drop-visibility pins from the width fix (2026-09-15): a
# full ring is refused, counted, logged, and answered with JS_FALSE.
set -euo pipefail
cd "$(dirname "$0")/../.."

fails=0
fail() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }
ok()   { echo "  ok   $*"; }

CONSUMER=src/host/shadow_midi.c
PRODUCER=src/shadow/shadow_ui.c
SHIM=src/schwung_shim.c

drain=$(awk '/^void shadow_drain_ui_midi_dsp\(void\)/,/^}/' "$CONSUMER")
[ -n "$drain" ] || { echo "FAIL: shadow_drain_ui_midi_dsp not found" >&2; exit 1; }
send=$(awk '/^static JSValue js_shadow_send_midi_to_dsp\(/,/^}/' "$PRODUCER")
[ -n "$send" ] || { echo "FAIL: js_shadow_send_midi_to_dsp not found" >&2; exit 1; }

# --- the consumer: take through the helper, write nothing else ----------------
printf '%s\n' "$drain" | grep -q 'ui_midi_dsp_take(midi_dsp_shm, local_buf' \
    && ok "the drain takes through ui_midi_dsp_take" \
    || fail "the drain does not use ui_midi_dsp_take"
printf '%s\n' "$drain" | grep -q 'i < copy_len' \
    && ok "the dispatch loop walks exactly what was taken" \
    || fail "the dispatch loop is not bounded by the taken length"
if printf '%s\n' "$drain" | grep -nE 'midi_dsp_shm->(write_idx|read_idx|buffer)|memset|memcpy'; then
    fail "the drain touches the segment directly -- only ui_midi_dsp_take may"
else
    ok "the drain never touches the segment directly"
fi

# --- the producer: push through the helper, never read_idx --------------------
printf '%s\n' "$send" | grep -q 'ui_midi_dsp_push(shadow_midi_dsp, frame, 4)' \
    && ok "the sender pushes one whole frame through ui_midi_dsp_push" \
    || fail "the sender does not use ui_midi_dsp_push"
if printf '%s\n' "$send" | grep -nE 'shadow_midi_dsp->(write_idx|read_idx|buffer|ready)'; then
    fail "the sender writes the segment in place -- only ui_midi_dsp_push may"
else
    ok "the sender never writes the segment in place"
fi

# --- no trace of the old toggle anywhere --------------------------------------
if grep -rnE 'midi_dsp[a-z_]*(->|\.)ready|last_shadow_midi_dsp_ready' src; then
    fail "the old ready toggle survives"
else
    ok "no ready toggle left"
fi

# --- drops stay visible (the 2026-09-15 width fix) ----------------------------
printf '%s\n' "$send" | grep -q 'shadow_midi_dsp_drops += dropped' \
    && ok "a refused frame is counted" || fail "a refused frame is not counted"
printf '%s\n' "$send" | grep -q 'shadow MIDI to DSP: buffer full, dropped' \
    && ok "and logged" || fail "a refused frame is not logged"
printf '%s\n' "$send" | awk '/if \(dropped\) \{/,/return JS_FALSE;/' | grep -q 'return JS_FALSE;' \
    && ok "and answered with JS_FALSE" || fail "a refused frame still returns JS_TRUE"

# --- a discarded count is reported --------------------------------------------
grep -q 'dsp_discarded=%u' "$SHIM" && grep -q 'shim_ui_midi_dsp_discarded);' "$SHIM" \
    && ok "discarded counts reach the shim's spi_timing line" \
    || fail "shim_ui_midi_dsp_discarded is never reported"

[ "$fails" -eq 0 ] || { echo "$fails check(s) failed" >&2; exit 1; }
echo "PASS: the MIDI-to-DSP segment is a ring at both call sites"
