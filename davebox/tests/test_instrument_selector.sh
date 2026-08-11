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

# 4. The slot has no user-facing spelling left. `slotLetter` existed only to
#    print one, so its return means the concept came back.
grep -rq "slotLetter(" ui/ \
    && bad "slotLetter is back — the slot is user-facing again" \
    || ok "no slot letters anywhere in the UI"

exit $fail
