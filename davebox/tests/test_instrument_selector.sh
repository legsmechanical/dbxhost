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
grep -q "applyTrackConfig(t, 'channel', v + 1);" ui/ui_menu.mjs \
    && ok "picking Move N writes channel N (1-based)" \
    || bad "the Instrument row no longer writes the channel — Move N addresses nothing"
if [ "$(grep -n "applyTrackConfig(t, 'channel', v + 1);" ui/ui_menu.mjs | cut -d: -f1)" \
     -lt "$(grep -n "applyTrackConfig(t, 'route', 1);" ui/ui_menu.mjs | cut -d: -f1)" ]; then
    ok "channel is written BEFORE route"
else
    bad "route is written before channel — the derived state reads the OLD instrument"
fi

# 3. ONE row, never a conditional second one. `MIDI to` was briefly its own row
#    shown only on MIDI tracks — and it did NOT appear when you switched to
#    MIDI, because the menu list is built on OPEN, so a row that becomes
#    applicable while the menu is up cannot show until it is reopened.
#    (Josh, on hardware, 2026-08-11.)
grep -q "createEnum('MIDI to'" ui/ui_menu.mjs \
    && bad "MIDI to is a separate row again — it cannot appear when you switch to MIDI" \
    || ok "every destination lives in the one Instr row"
grep -q "options: instrOptions(S.trackRoute, S.activeTrack)," ui/ui_menu.mjs \
    && ok "destinations are recomputed against live routes" \
    || bad "the Instr option list is stale or hardcoded"

# 4. `MIDI to` writes BOTH halves. The DSP stores the channel and the follow
#    target separately; leaving the other half behind is how a stale target
#    outlives the choice that set it and silently keeps stealing the notes.
grep -c "applyTrackConfig(t, 'midi_to', 0);" ui/ui_menu.mjs | grep -q '^2$' \
    && ok "both non-follow destinations clear the follow target" \
    || bad "a destination no longer clears midi_to — a stale target keeps stealing the notes"

# 5. The eligible-target list is rebuilt per menu open, not captured once:
#    whether a track is a legal target depends on ITS instrument, which can
#    have changed since.

# 6. The follower's RAW path (CC / pitch bend) follows too. Notes go through
#    the DSP and resolve there; this path does not, so without it a follower's
#    mod wheel goes out the USB port while its notes play a Move instrument.
grep -q "S.trackMidiTo\[t\] > 0" ui/ui_dsp_bridge.mjs \
    && ok "raw CC/PB follows the target too" \
    || bad "a follower's CC/PB still goes out USB-A while its notes go elsewhere"

# 7. `tN_slot` is RETIRED, not deprecated. The slot is the track index —
#    derived, never stored — so there must be nothing that sets it, nothing
#    that persists it, and nothing that reads a stored one back. Any survivor
#    is a second opinion about which chain a track plays.
grep -q "strcmp(sub, \"slot\")" dsp/setparam/sp_track_config.c \
    && bad "the tN_slot setter is back — a track's chain is settable again" \
    || ok "no tN_slot setter"
grep -q '"t%d_sl' dsp/seq8_state.c \
    && bad "the slot is persisted again — a stored value can disagree with the model" \
    || ok "the slot is neither saved nor loaded"
grep -rq "S\.trackSlot\[" ui/*.mjs \
    && bad "S.trackSlot is back — the JS side keeps its own copy again" \
    || ok "no JS copy of the slot"
grep -q "return slotIndex(t);" ui/ui_corun.mjs \
    && ok "schSlotForTrack derives the slot from the track index" \
    || bad "schSlotForTrack no longer derives the slot from the track index"

# 8. CHAIN PARKING (spec decision 1): changing a track's instrument must PARK
#    its chain, never destroy it — switching a loaded Schwung track to `Move 2`
#    and back returns the synth, its effects and their state.
#
#    This holds BY CONSTRUCTION and the test's job is to keep it that way: a
#    track's chain is host state living in slot N, and a route change touches
#    only the route (plus its drum-lane mirror, the rui index, the dirty flag,
#    the derived Link Audio routing and the aftertouch normalisation). If
#    anything chain-shaped ever appears in that path, parking has silently
#    become a thing someone has to implement correctly — and getting it wrong
#    is unnoticed until a session later.
# (comments stripped — the existing ones legitimately discuss route/slot state)
if awk '/tN_route: set MIDI routing/,/^    }/' dsp/setparam/sp_track_config.c \
     | grep -vE '^\s*(\*|/\*)' \
     | grep -qiE "chain|slot|synth|unload|component"; then
    bad "the route setter now touches the chain — parking is no longer free"
else
    ok "a route change does not touch the chain (DSP)"
fi
if awk "/else if \(key === 'route'\)/,/^    }/" ui/ui_dsp_bridge.mjs \
     | grep -vE '^\s*(\*|/\*)' \
     | grep -qiE "chain|synth|unload|engineSet"; then
    bad "the JS route path now touches the chain — parking is no longer free"
else
    ok "a route change does not touch the chain (JS)"
fi

# 9. The slot has no user-facing spelling left. `slotLetter` existed only to
#    print one, so its return means the concept came back.
grep -rq "slotLetter(" ui/ \
    && bad "slotLetter is back — the slot is user-facing again" \
    || ok "no slot letters anywhere in the UI"

exit $fail
