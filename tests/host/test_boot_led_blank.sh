#!/usr/bin/env bash
set -euo pipefail

# The boot-tool LED blank must stay bounded on BOTH sides.
#
# While a boot tool is pending, the shadow display is claimed but Move is still
# booting underneath — loading its set and painting pads and buttons at full
# brightness under our splash for the ~3.4 s it runs. The shim strips those LED
# writes so a standalone session shows only its own surface.
#
# That blank is a LATCH, and a latch that never releases leaves the device dark
# and dead-looking with no way back. Two independent releases must exist, because
# either one alone has a hole:
#
#   1. overtake_mode  — the boot tool took the surface. The normal, fast exit.
#                       Must also CLEAR the latch, or the blank returns the
#                       moment that tool drops to the menu, where Move's LEDs
#                       are legitimately the user's surface.
#   2. a deadline     — the boot tool never arrived (missing module, throwing
#                       init, stale boot_tool.json). Nothing raises overtake_mode
#                       in that case, so without a timeout release #1 never
#                       fires and the surface stays dark forever.
#
# Both are source-pinned here because both failures are silent: nothing logs,
# nothing crashes, the pads are just wrong.

cd "$(dirname "$0")/../.."

shim="src/schwung_shim.c"
fail=0

note() { echo "FAIL: $1" >&2; fail=1; }

[ -f "$shim" ] || { echo "FAIL: $shim missing" >&2; exit 1; }

# The latch exists and is armed only alongside the boot-tool signal.
if ! grep -q "boot_tool_led_blank = 1;" "$shim"; then
    note "boot_tool_led_blank is never armed"
fi
if ! grep -B14 "boot_tool_led_blank = 1;" "$shim" | grep -q "boot_tool.json"; then
    note "the blank is armed without a boot_tool.json check — it would blank every boot"
fi

# Release 1: overtake clears the latch, not just an early return.
if ! grep -A4 "if (shadow_control->overtake_mode) {" "$shim" | grep -q "boot_tool_led_blank = 0;"; then
    note "overtake_mode does not CLEAR the latch (it would re-blank on the menu)"
fi

# Release 2: a deadline exists and actually clears the latch.
if ! grep -q "^#define BOOT_LED_BLANK_MAX_MS" "$shim"; then
    note "no deadline constant for the boot LED blank"
fi
if ! grep -q "boot_tool_led_blank_deadline_ms = _now + BOOT_LED_BLANK_MAX_MS;" "$shim"; then
    note "the deadline is never armed — a tool that never loads leaves the surface dark forever"
fi
if ! grep -A6 "boot_tool_led_blank_deadline_ms) {" "$shim" | grep -q "boot_tool_led_blank = 0;"; then
    note "the deadline never clears the latch"
fi

# The blank must still be a no-op on an ordinary boot: no boot tool, no actuator.
if ! grep -q "if (!shadow_control->select_phase && !boot_tool_led_blank) return;" "$shim"; then
    note "the blanking function no longer no-ops when neither window is active"
fi

if [ "$fail" -ne 0 ]; then
    exit 1
fi
echo "PASS: boot LED blank is armed narrowly and released two ways"
