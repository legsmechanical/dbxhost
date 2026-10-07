#!/usr/bin/env bash
# MIDI START AND CONTINUE WAKE A PARKED SLOT (port of upstream #586).
#
# A slot silent for ~1 s is parked and probed twice a second. A synth that
# runs off the transport can start sounding on Start with no note to wake it,
# so its opening beat waited for the next probe. Both places that hand
# realtime bytes to the slots — Move's own transport (the cable-0 tap in the
# shim) and a module DSP's (shadow_chain_broadcast_realtime) — wake first.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
tap=$(awk '/if \(status_usb == 0xFA \|\| status_usb == 0xFB\) \{/ {on=1} on {print; n++} n > 8 {exit}' src/schwung_shim.c)
printf '%s\n' "$tap" | grep -q 'shadow_slot_idle\[s\] = 0;' || fail "Move's Start/Continue does not wake the slots (shim cable-0 tap)"
printf '%s\n' "$tap" | grep -q 'shadow_slot_silence_frames\[s\] = 0;' || fail "the cable-0 tap does not reset the silence count — the slot re-parks at once"
bro=$(awk '/^void shadow_chain_broadcast_realtime\(/,/^}/' src/host/shadow_midi.c)
printf '%s\n' "$bro" | grep -q 'status == 0xFA || status == 0xFB' || fail "shadow_chain_broadcast_realtime does not single out Start/Continue"
printf '%s\n' "$bro" | grep -q 'host_slot_idle\[i\] = 0;' || fail "a module DSP's Start/Continue does not wake the slots"
# Clock (0xF8) must NOT wake: 24 a beat would keep every slot awake for ever.
printf '%s\n' "$bro" | grep -q '0xF8' && fail "the realtime broadcast wakes on clock ticks"
echo "PASS: Start and Continue wake a parked slot, on both paths"
