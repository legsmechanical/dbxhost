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
#    site is how an off-by-one gets fixed on one screen and not the other —
#    and there are now two screens addressing a bus (sound mode's strip and
#    session view's level knob), which is exactly when that starts to bite.
n=$(grep -c "'move_fx:'" ui/*.mjs | awk -F: '{s+=$2} END {print s+0}')
[ "$n" = "1" ] && ok "move_fx: prefix built once (moveBusComp)" \
                || bad "move_fx: prefix built in $n places — must be 1 (moveBusComp)"
grep -q "^export function moveBusComp" ui/ui_engine.mjs \
    && ok "the bus key builders live in ui_engine (shared by both screens)" \
    || bad "moveBusComp is gone from ui_engine — the key builders have scattered"
# The bus is WHICH MOVE INSTRUMENT the track plays — its channel, which is what
# the Instrument row sets. NOT the track index: track 6 may play `Move 2`, and
# reading the index there opens another instrument's inserts silently.
n=$(grep -c "moveBusForChannel(" ui/*.mjs | awk -F: '{s+=$2} END {print s+0}')
[ "$n" -ge 3 ] && ok "bus number resolved through moveBusForChannel at every site" \
               || bad "only $n moveBusForChannel site(s) — expected the definition plus both screens"
grep -qE "moveBusForChannel\((GS|S)\.trackChannel\[" ui/ui_sound.mjs \
    && ok "sound mode's bus follows the track's Move instrument (channel), not its index" \
    || bad "moveBusFor no longer derives the bus from the track's channel"
grep -qE "moveBusForChannel\((GS|S)\.trackChannel\[" ui/ui_tick.mjs \
    && ok "session view's bus follows the track's channel too" \
    || bad "the session-view level resolver no longer derives the bus from the channel"
grep -q "return n < 1 ? 1 : (n > MOVE_BUSES ? MOVE_BUSES : n);" ui/ui_engine.mjs \
    && ok "the bus is clamped to Move's four instruments" \
    || bad "moveBusForChannel no longer clamps the bus to 1-4"

echo "session-view level knob (both flavours):"
# A Move-routed track is a mixer position exactly like a chain slot, so its
# level knob must work. The bug this pins: the handler asked "is this track a
# Schwung chain" and bailed on everything else, killing the level knob on
# tracks 1-4 (Move-routed by DEFAULT) — half the session view, silently.
grep -q "if (S.sessVolBus\[knobIdx\] <= 0) {" ui/ui_input_cc.mjs \
    && ok "the level knob serves a Move bus as well as a chain slot" \
    || bad "_sessionKnobVolume gates on the chain route again — Move tracks lose their level knob"
grep -q "engineSet(0, moveBusComp(_bus), 'volume', _v);" ui/ui_tick.mjs \
    && ok "a Move-routed track's pending level writes the BUS fader" \
    || bad "the session level write no longer reaches the bus — turns would vanish"
# The cached level belongs to whatever source it was read from. Re-routing a
# track, or pointing it at another Move instrument, must re-seed it or the first
# detent jumps from a level that belongs to something else.
grep -q "if (S.sessVolBus\[_t\] !== _bus) {" ui/ui_tick.mjs \
    && ok "a changed source invalidates the cached level" \
    || bad "the level cache is no longer invalidated when the track's source changes"
grep -q "S.sessVolBus\[_t\] = -1;" ui/ui_dsp_bridge.mjs \
    && ok "a project load drops the cached levels (they belong to the old project)" \
    || bad "the level cache survives a project load — first turn moves from a stale base"

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

echo "co-run return-to-origin (1d):"
# 8. Menu is the co-run EXIT. Back cannot be: Move owns it for its own menus.
grep -q "if (d2 === 127) exitMoveNativeCoRun();" ui/ui_input_cc.mjs \
    && ok "Menu exits Move co-run" \
    || bad "Menu no longer exits Move co-run — with Back owned by Move there is no way out"
# 9. The origin is recorded at ENTRY. Nothing on the return path can infer it:
#    sound mode is exited on the way in.
grep -q "enterMoveNativeCoRun(_cr, 'sound')" ui/ui_tick.mjs \
    && ok "the SYNTH row records a 'sound' origin" \
    || bad "co-run entry from sound mode no longer passes its origin"
grep -q "S.moveCoRunOrigin = (origin === 'sound')" ui/ui_corun.mjs \
    && ok "enterMoveNativeCoRun stores the origin" \
    || bad "the origin is not stored — Menu will always land on track view"
# 10. The FX-bus picker's old entry point is gone, and must NOT come back as a
#     second Menu meaning: the buses live in sound mode now.
grep -rqE "S\.coRunOverlayScreen" ui/*.mjs \
    && bad "coRunOverlayScreen is back — Menu has two meanings in co-run again" \
    || ok "the co-run FX-picker overlay entry is gone"

echo "bus mute/solo rows:"
# 11. The bus's mixer state is reachable at all. A host that gates the mix on
#     move_fx:N:muted with no row to set it is a feature nobody can use.
for k in muted soloed; do
    grep -q "key: '$k', label:" ui/ui_sound.mjs \
        && ok "the Move bus has a $k row" \
        || bad "the Move bus has no $k row — the host state is unreachable from the UI"
done
# 12. A 0/1 value has nothing to scrub, so the click IS the edit — entering the
#     level editor on a toggle leaves a row you can only change by jog-turning
#     past 1.
grep -q "if (_r.spec.toggle)" ui/ui_sound.mjs \
    && ok "jog-click flips a toggle row instead of opening the level editor" \
    || bad "toggle rows fall through to the level editor"
# 13. Written as an int. The host parses these with atoi, so "1.000" would read
#     back as a level in the set meta file.
grep -q "queueWrite(_r.spec.key, String(_r.val), _r.spec.comp)" ui/ui_sound.mjs \
    && ok "a toggle writes an int, not a fixed-point level" \
    || bad "toggle writes are not integers"
# 14. Solo is exclusive host-side, so flipping it invalidates every other row.
grep -q "if (_r.spec.key === 'soloed') S.pendingAction = { t: 'names' }" ui/ui_sound.mjs \
    && ok "flipping solo re-reads the other rows" \
    || bad "solo does not trigger a re-read — other rows will show a stale solo"

exit $fail
