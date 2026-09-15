#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# dAVEBOx ties the vol_block claim to Shift (davebox/ui/ui_input_cc.mjs
# engineVolBlock(S.shiftHeld)). On the vol_block 1->0 edge with the volume
# knob still physically held, the shim injects a volume-touch-ON to Move so
# it learns the held state ("vol claim released mid-touch: injected
# volume-touch-on to Move"). Without more, the very next display gate check
# in shadow_swap_display() reads shadow_volume_knob_touched && !shift_held &&
# !vol_block as true and hands the OLED to Move's native volume overlay for
# one frame before the finger lifts, then back to the tool once note-8
# touch-off arrives -- a one-frame flash of Move's own display peeking
# through dAVEBOx.
#
# Fix: the same edge that injects the touch-on also arms the existing latch
# shadow_block_plain_volume_hide_until_release (already used to suppress the
# analogous flash around the Shift+Vol shortcut launch), so the shadow
# display gate keeps the OLED on the tool until the real note-8 touch-off
# clears the latch.
#
# Source-pinned like test_boot_pad_block.sh / test_boot_led_blank.sh: no
# off-device harness feeds raw MIDI into the shim, so this checks the source
# site that makes the behavioural claim true.
#
# Fails on pre-fix code: the vol_block-release block injects the touch-on but
# never sets the latch, so the grep below misses.

shim="src/schwung_shim.c"
fail=0
note() { echo "FAIL: $1" >&2; fail=1; }

[ -f "$shim" ] || { echo "FAIL: $shim missing" >&2; exit 1; }

# Isolate the vol_block-release block: the `if (prev_vol_block && !vb_now &&
# shadow_volume_knob_touched && ...)` body that injects the touch-on.
block=$(awk '/if \(prev_vol_block && !vb_now && shadow_volume_knob_touched &&/,/^        }$/' "$shim")
[ -n "$block" ] || note "the vol_block-release inject block is gone from $shim"

echo "$block" | grep -q 'shadow_midi_inject_push(shadow_midi_inject_shm, vol_touch_on)' \
    || note "the block no longer injects the volume-touch-on -- wrong block isolated?"

# The latch must be armed unconditionally in this block (not only on the
# success path of the inject push), so the hide-suppression holds even if
# the inject ring was full and the push was dropped.
echo "$block" | grep -Eq '^[[:space:]]*shadow_block_plain_volume_hide_until_release[[:space:]]*=[[:space:]]*1;[[:space:]]*$' \
    || note "vol_block-release block does not arm shadow_block_plain_volume_hide_until_release"

if [ "$fail" = 0 ]; then
    echo "PASS: vol_block release arms the plain-volume hide latch"
else
    exit 1
fi
