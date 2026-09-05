#!/bin/bash
# test_midi_via_slot_pins.sh — item 15: BOTH emitters (melodic pfx_emit and the
# drum lanes' emit) route a MIDI track through its parked slot when the track's
# midi_via_slot flag is set. The behaviour is unit-tested for the melodic path
# (test_midi_via_slot.c); the drum path is pinned here so the two cannot drift.
set -e
cd "$(dirname "$0")/.."
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }
for f in dsp/seq8.c dsp/seq8_drum.c; do
    grep -q 'pfx.midi_via_slot' "$f" && say "ok   — $f reads the track's midi_via_slot" || bad "$f does not route via the slot"
    awk '/midi_via_slot\)/{f=1} f&&/midi_send_internal_slot\(/{hit=1} f&&/return;/{exit} END{exit !hit}' "$f" \
        && say "ok   — ...and sends INTO the slot there" || bad "$f: the via-slot branch does not send into the slot"
done
grep -q '"midi_via_slot"' dsp/setparam/sp_track_config.c && say "ok   — tN_midi_via_slot is a setparam" || bad "setter missing"
grep -q '"midi_via_slot"' dsp/seq8.c && say "ok   — ...and a getparam" || bad "getter missing"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
