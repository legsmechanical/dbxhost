#!/usr/bin/env bash
# Source-invariant pins for the Instrument selector
# (docs/working/TRACK_OWNS_ITS_INSTRUMENT.md, step 2).
#
# A track OWNS its instrument: one row says where its notes go, and there is no
# second place that can disagree. Every failure below is silent — the menu still
# draws, the notes still go somewhere, just not where the screen says.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "instrument selector:"

# 1. The three superseded rows are GONE. Keeping any one of them re-creates the
#    ambiguity the selector exists to remove: `Channel` would silently move a
#    Move track to another instrument while `Instr` still read the old one.
for dead in Route Slot Channel; do
    if grep -qE "create(Enum|Value)\('$dead'" ui/ui_menu.mjs; then
        bad "the $dead row is back — the track menu expresses routing in two places again"
    else
        ok "the $dead row is gone"
    fi
done

# 2. The selector IS the channel on a Move track. Move addresses its four
#    instruments by MIDI channel, so `Move 3` must write channel 3 — and write
#    it BEFORE the route, because applyTrackConfig('route') re-derives Link
#    Audio routing and normalises aftertouch against the channel it finds.
grep -q "applyTrackConfig(t, 'channel', (v | 0) + 1);" ui/ui_menu.mjs \
    && ok "picking Move N writes channel N (1-based)" \
    || bad "the Instrument row no longer writes the channel — Move N addresses nothing"
if [ "$(grep -n "applyTrackConfig(t, 'channel', (v | 0) + 1);" ui/ui_menu.mjs | cut -d: -f1)" \
     -lt "$(grep -n "applyTrackConfig(t, 'route', 1);" ui/ui_menu.mjs | cut -d: -f1)" ]; then
    ok "channel is written BEFORE route"
else
    bad "route is written before channel — the derived state reads the OLD instrument"
fi

# 3. `MIDI to` is a MIDI-track row only. On any other route it would be a second
#    channel control sitting next to the selector that owns it.
grep -q "S.trackRoute\[S.activeTrack\] === 2) ? \[" ui/ui_menu.mjs \
    && ok "the MIDI to row is conditional on the MIDI route" \
    || bad "MIDI to is unconditional — a Move/Schwung track shows a routing row again"

# 4. `MIDI to` writes BOTH halves. The DSP stores the channel and the follow
#    target separately; leaving the other half behind is how a stale target
#    outlives the choice that set it and silently keeps stealing the notes.
grep -q "applyTrackConfig(t, 'midi_to', 0);" ui/ui_menu.mjs \
    && ok "picking an Ext channel clears the follow target" \
    || bad "Ext no longer clears midi_to — a stale target keeps stealing the notes"

# 5. The eligible-target list is rebuilt per menu open, not captured once:
#    whether a track is a legal target depends on ITS instrument, which can
#    have changed since.
grep -q "options: midiToOptions(S.trackRoute, S.activeTrack)," ui/ui_menu.mjs \
    && ok "target list is recomputed against live routes" \
    || bad "the MIDI to target list is stale or hardcoded"

# 6. The follower's RAW path (CC / pitch bend) follows too. Notes go through
#    the DSP and resolve there; this path does not, so without it a follower's
#    mod wheel goes out the USB port while its notes play a Move instrument.
grep -q "S.trackMidiTo\[t\] > 0" ui/ui_dsp_bridge.mjs \
    && ok "raw CC/PB follows the target too" \
    || bad "a follower's CC/PB still goes out USB-A while its notes go elsewhere"

# 7. The slot has no user-facing spelling left. `slotLetter` existed only to
#    print one, so its return means the concept came back.
grep -rq "slotLetter(" ui/ \
    && bad "slotLetter is back — the slot is user-facing again" \
    || ok "no slot letters anywhere in the UI"

exit $fail
