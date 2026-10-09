#!/usr/bin/env bash
# A sidecar's external MIDI (Bluetooth) must reach the module on the channel a
# hardware event would carry: the cable-2 remap is applied to hardware events
# in place before anything reads them, so a module filtering on the remapped
# channel accepts a USB note and would drop the same note from a sidecar if
# the drain published the packet as it arrived. ext_midi_in_for_module() makes
# the decision (test_ext_midi_in.c); this pins that the shim's drain USES it,
# for both ways a packet is handed to the module.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
[ -f "$SHIM" ] || { echo "FAIL: $SHIM missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

# The drain: from its ring guard to the flush that follows it, code lines only.
BLOCK=$(awk '/if \(ext_midi_in_shm\) \{/ { on = 1 } on { print } on && /shadow_flush_pending_input_leds\(\)/ { exit }' "$SHIM" \
        | grep -vE '^\s*(/\*|\*|//)')

echo "ext_midi_in drain:"
check "the drain was found" test -n "$BLOCK"
has() { printf '%s\n' "$BLOCK" | grep -qF "$1"; }
hasnt() { ! has "$1"; }
check "it asks ext_midi_in_for_module for the module's packet" has 'ext_midi_in_for_module(pkt, remap, thru, ui);'
check "a note-on is queued from that packet" has 'shadow_queue_input_led(ui[0], ui[1], ui[2], ui[3]);'
check "everything else is published from that packet" has 'shadow_ui_midi_publish(ui[0], ui[1], ui[2], ui[3]);'
check "nothing is handed to the module as it arrived (queue)" hasnt 'shadow_queue_input_led(pkt['
check "nothing is handed to the module as it arrived (publish)" hasnt 'shadow_ui_midi_publish(pkt['
check "Move's leg still goes through ext_midi_in_for_move" has 'ext_midi_in_for_move(pkt, remap, thru, to_move)'

[ "$fails" -eq 0 ] && echo "PASSED" || { echo "FAILED" >&2; exit 1; }
