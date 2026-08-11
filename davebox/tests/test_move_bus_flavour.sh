#!/usr/bin/env bash
# Source-invariant pins for the MOVE flavour of sound mode (P8a 1b).
#
# Everything here is a silent failure mode: the module keeps loading, the screen
# keeps drawing, and the only symptom is a row that reads empty or writes into
# the void. None of it is reachable from a unit test without stubbing the whole
# shadow param bus, so it is pinned at the source.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "move-bus flavour invariants:"

# 1. The `move_fx:` prefix is 1-BASED and built in exactly ONE place. A second
#    site is how an off-by-one gets fixed on one screen and not the other.
n=$(grep -c "'move_fx:'" ui/*.mjs | awk -F: '{s+=$2} END {print s+0}')
[ "$n" = "1" ] && ok "move_fx: prefix built once (moveBusFor)" \
                || bad "move_fx: prefix built in $n places — must be 1 (moveBusFor)"
grep -q "const bus = track + 1;" ui/ui_sound.mjs \
    && ok "bus number is 1-based off the track index" \
    || bad "moveBusFor no longer derives a 1-based bus from the track"

# 2. A bus component's :module takes a DSP PATH; a chain component takes an ID.
#    Passing an id loads nothing (the host answers error 7 and the row stays
#    empty), so the branch that picks between them must stay.
grep -q "S.bus ? (mod.path || '') : mod.id" ui/ui_sound.mjs \
    && ok "bus inserts still load by DSP path, chain components by id" \
    || bad "loadSelected no longer distinguishes bus PATH from chain ID"

# 3. Move>Slot is retired host-side — no key, no row, nowhere.
if grep -rqE "['\"]move_to_slot['\"]" ui/*.mjs dsp/*.c 2>/dev/null; then
    bad "move_to_slot is back; the host has no such key (retired in P8a 1a)"
else
    ok "no move_to_slot survivor"
fi

# 4. Both Move- and Schwung-routed tracks take the same door into sound mode.
#    A route that falls through to the popup means a track with a perfectly good
#    sound reports 'NO SOUND TO EDIT'.
grep -q "S.trackRoute\[S.activeTrack\] === 1 ||" ui/ui_input_cc.mjs \
    && ok "Shift+Note/Session opens sound mode on BOTH routes" \
    || bad "the Move route no longer shares the sound-mode entry"

# 5. Co-run entry from sound mode goes through the consume-flag, not an import:
#    ui_sound importing ui_corun would close a cycle.
grep -qE "^import .*ui_corun" ui/ui_sound.mjs \
    && bad "ui_sound imports ui_corun — that closes an import cycle" \
    || ok "ui_sound does not import ui_corun (co-run via soundConsumeCoRunRequest)"
grep -q "soundConsumeCoRunRequest" ui/ui_tick.mjs \
    && ok "the tick consumes the co-run request" \
    || bad "nothing consumes soundConsumeCoRunRequest — the SYNTH row is dead"

# 6. The volume knob's target is derived in ONE place. Both halves of this are
#    silent: a Move bus that does NOT claim the knob lets Move move its master
#    AND writes the turn into chain slot 0 (S.slot is pinned to 0 on a bus), and
#    a write site that bypasses volTarget() sends a bus value to a chain key.
n=$(grep -c "engineSetSlotParam(S.slot, SLOT_LEVEL_KEY" ui/ui_sound.mjs || true)
[ "$n" = "0" ] && ok "no volume write bypasses writeVolLevel()" \
                || bad "$n volume write(s) bypass writeVolLevel() — bus value into a chain key"
grep -q "claimVolume(S.slot);" ui/ui_sound.mjs \
    && ok "the Move flavour CLAIMS the volume knob" \
    || bad "soundEnterMove no longer claims the knob — Move's master will move too"

# 7. Retarget keeps your place ONLY when you were inside a block's editor. Any
#    other origin (picker, slot settings, a preset list) must land on the block
#    list — otherwise switching tracks drops you a level deeper than you were,
#    and the two flavours disagree about it.
grep -q "const keepPlace = !leftMoveBus && S.view === VIEW_EDIT;" ui/ui_sound.mjs \
    && ok "retarget keeps your place only from inside a block editor" \
    || bad "the retarget landing rule changed — picker vs editor asymmetry is back"

exit $fail
