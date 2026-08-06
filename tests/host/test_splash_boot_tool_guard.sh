#!/usr/bin/env bash
set -euo pipefail

# The splash-end display handoff must NEVER dismiss to Move while a boot-tool
# launch is pending.
#
# Mechanism being pinned: at splash end the shadow UI hands the OLED back to
# Move (shadow_request_exit). Under a standalone/boot-tool session the tool is
# opened LATER IN THE SAME TICK (shadow_get_open_tool_cmd auto-clears), so the
# unguarded dismiss made the handoff a per-boot race — the shim could only
# re-raise the display if one of its ~2.9 ms frames landed inside the sub-ms
# window between the dismiss and the flag's auto-clear. Losing the race loads
# the tool HEADLESS: LEDs alive, OLED and inputs on Move native, no error
# anywhere (hardware, 2026-08-06 — surfaced when an unrelated change made the
# in-between tick section faster and closed the window).
#
# The guard: skip the dismiss when <install>/boot_tool.json exists. An ordinary
# install never has that file, so stock behaviour is untouched.

cd "$(dirname "$0")/../.."
ui=src/shadow/shadow_ui.js

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -f "$ui" ] || fail "$ui missing"

# The guard must exist, keyed on boot_tool.json under the state root...
grep -q 'host_file_exists(HOST_STATE_ROOT + "/boot_tool.json")' "$ui" ||
  fail "splash-end dismiss lost its boot_tool.json guard"

# ...and must appear BEFORE the unconditional dismiss branch in the splash-end
# chain (guard clause above the else that calls shadow_request_exit).
awk '/boot_tool.json.*guard|host_file_exists\(HOST_STATE_ROOT \+ "\/boot_tool.json"\)/{g=NR}
     /Dismiss shadow display mode/{d=NR}
     END{exit !(g && d && g < d)}' "$ui" ||
  fail "boot_tool.json guard is not ahead of the splash-end dismiss"

echo "PASS: splash-end dismiss is guarded by the pending boot tool"
