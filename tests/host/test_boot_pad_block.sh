#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Move can read an early pad press, while it is still booting underneath our
# boot splash, as one of its OWN set-selection gestures — silently switching
# sets before the boot tool we are about to hand the surface to ever sees the
# press. Measured on device: pad note-ons landing 24-36 ms before each extra
# "About to load ..." line that makes Move fall back to another project;
# clean (single-load) runs had no pad input in that window at all.
#
# Fix: raise pad_block for the SAME window as the existing boot_tool_led_blank
# latch (armed alongside it, released at the same two points — the tool taking
# the surface, and the BOOT_LED_BLANK_MAX_MS timeout), so a stray pad press is
# filtered before Move ever sees it. The passthrough filter that enforces
# pad_block (notes 68-99 + pad aftertouch) already exists for the mid-session
# case — this only widens WHEN the flag is armed.
#
# Source-pinned, matching this repo's existing style for shim latches
# (test_boot_led_blank.sh, test_pad_block_not_stranded.sh): the shim has no
# off-device test harness for raw MIDI-in filtering, so the behavioural claim
# ("a pad note-on during the boot window is filtered") is checked at the
# source sites that make it true rather than by feeding bytes into a binary.
#
# Fails on pre-fix code: none of the boot-side pad_block arm/release lines
# below exist yet, so every grep here misses.

shim="src/schwung_shim.c"
fail=0
note() { echo "FAIL: $1" >&2; fail=1; }

[ -f "$shim" ] || { echo "FAIL: $shim missing" >&2; exit 1; }

# --- armed alongside the boot LED blank, inside the SAME boot_tool.json gate
boot_block=$(awk '/if \(stat\(SCHWUNG_INSTALL_DIR "\/boot_tool\.json", &_bt\) == 0\)/,/^            }$/' "$shim")
[ -n "$boot_block" ] || note "the boot_tool.json gate block is gone from $shim"
# -E anchored on the trimmed line, deliberately NOT a bare substring grep: a
# mutation that comments the statement out (`/* shadow_control->pad_block =
# 1; */`) still CONTAINS the substring and must not read as present.
live_line() { command grep -Eq "^[[:space:]]*${1};[[:space:]]*\$"; }

command grep -q "boot_tool_led_blank = 1;" <<<"$boot_block" || note "boot_tool_led_blank is not armed in the boot_tool.json gate (test itself is stale)"
live_line "shadow_control->pad_block = 1" <<<"$boot_block" || \
    note "pad_block is not armed (live) alongside boot_tool_led_blank in the boot_tool.json gate"

# --- release 1: overtake_mode (the tool has taken the surface) -------------
overtake=$(awk '/if \(shadow_control->overtake_mode\) \{/,/^    \}$/' "$shim" | head -6)
command grep -q "boot_tool_led_blank = 0;" <<<"$overtake" || note "overtake_mode no longer clears boot_tool_led_blank (test is stale)"
live_line "shadow_control->pad_block = 0" <<<"$overtake" || \
    note "overtake_mode does not clear pad_block (live) — a boot press-block would outlive the tool taking the surface"

# --- release 2: the BOOT_LED_BLANK_MAX_MS timeout --------------------------
timeout_block=$(awk '/_now >= boot_tool_led_blank_deadline_ms\) \{/,/^        }$/' "$shim")
[ -n "$timeout_block" ] || note "the boot LED blank timeout block is gone from $shim"
command grep -q "boot_tool_led_blank = 0;" <<<"$timeout_block" || note "the timeout no longer clears boot_tool_led_blank (test is stale)"
live_line "shadow_control->pad_block = 0" <<<"$timeout_block" || \
    note "the BOOT_LED_BLANK_MAX_MS timeout does not clear pad_block (live) — a missing/crashing boot tool would strand pads dead forever"

# --- the existing passthrough filter enforces it on notes 68-99 -----------
if ! command grep -q "shadow_control->pad_block && d1 >= 68 && d1 <= 99" "$shim"; then
    note "no passthrough filter drops pad notes (68-99) when pad_block is set"
fi

if [ "$fail" -ne 0 ]; then
    exit 1
fi
echo "PASS: boot pad-input latch armed with the LED blank, released the same two ways"
