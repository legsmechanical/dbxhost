#!/usr/bin/env bash
# Input priority must follow DRAW priority for sound mode.
#
# Sound mode's three MIDI hooks sit ahead of dAVEBOx's own knob/jog/Back
# handling, because that is exactly what they replace. But drawUI puts sound
# mode BELOW every overlay — the global menu, tap tempo, perf mode, the
# confirms and the pickers all paint over it. When those two orders disagree
# the overlay is drawn but input-dead: the global menu opened from sound mode
# showed on the OLED and the jog did nothing, because sound mode still owned
# the jog (Josh, on hardware).
#
# `soundModeCovered()` is the reconciliation, and it is a MIRROR of drawUI's
# gate list — the failure mode is a new overlay added to drawUI and not to the
# predicate, which silently re-opens the same bug for that one screen. So this
# test does not check a spelling: it extracts both flag sets and diffs them.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

echo "sound-mode overlay gate (input priority follows draw priority):"

R=ui/ui_render.mjs

# --- set A: the overlays drawUI checks between the co-run bail and soundRender.
# Top-level gates in drawUI are indented exactly 4 spaces; the draw bodies
# beneath them are indented 8, which keeps body-local state (S.mergeNoticeSingle-
# Track and friends) out of the set.
#
# ⚠ The co-run bail ABOVE this region is deliberately excluded, here and in the
# predicate: Move firmware owns the OLED during co-run, but sound mode keeps its
# claim on the volume knob there on purpose (ui_sound.mjs — releasing it let Move
# cover the screen with its native master overlay). Co-run is a different
# ownership question and is not what this pin is about.
draw_flags=$(awk '/if \(S\.sessionOverlayHeld\)/,/if \(soundRender\(\)\) return;/' "$R" |
    grep -E '^    if \(' | grep -oE 'S\.[A-Za-z_][A-Za-z0-9_]*' | sort -u)

# --- set B: the flags soundModeCovered() actually tests.
pred_flags=$(awk '/^export function soundModeCovered/,/^}/' "$R" |
    grep -oE 'S\.[A-Za-z_][A-Za-z0-9_]*' | sort -u)

if [ -z "$draw_flags" ] || [ -z "$pred_flags" ]; then
    bad "could not extract the flag sets — drawUI or soundModeCovered was restructured"
else
    missing=$(comm -23 <(echo "$draw_flags") <(echo "$pred_flags"))
    extra=$(comm -13 <(echo "$draw_flags") <(echo "$pred_flags"))
    if [ -n "$missing" ]; then
        bad "overlay(s) drawn above sound mode but NOT gating its input: $(echo $missing)"
    else
        ok "every overlay drawn above sound mode also gates its input"
    fi
    if [ -n "$extra" ]; then
        bad "soundModeCovered gates flag(s) drawUI no longer checks: $(echo $extra)"
    else
        ok "the predicate gates nothing drawUI does not draw"
    fi
fi

# The gate has to be applied to ALL THREE hooks. The raw hook is the sound-mode
# keyboard and the note hook is its pad handling; leaving either ungated leaves
# an overlay half-steerable.
n=$(grep -c '_soundSteers' ui/ui.js)
if [ "$n" -ge 4 ]; then
    ok "all three sound hooks share one gated predicate ($n uses)"
else
    bad "the sound hooks no longer share the gated predicate ($n uses of _soundSteers)"
fi

if grep -q 'soundActive() && !soundModeCovered()' ui/ui.js; then
    ok "the predicate is computed from soundActive() && !soundModeCovered()"
else
    bad "ui.js no longer derives its sound dispatch from soundModeCovered()"
fi

# And nothing may reintroduce a bare `soundActive() && soundOnX(` dispatch that
# bypasses the gate.
if grep -E 'soundActive\(\) && sound(OnCC|OnNote|OnMidiRaw)\(' ui/ui.js >/dev/null; then
    bad "an ungated soundActive() && soundOnX( dispatch is back"
else
    ok "no ungated sound-hook dispatch"
fi

[ "$fail" -eq 0 ] && echo "test_sound_mode_overlay_gate: PASS" || echo "test_sound_mode_overlay_gate: FAIL"
exit "$fail"
