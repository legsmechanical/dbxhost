#!/usr/bin/env bash
set -euo pipefail

# clearModuleParamShims must delete ONLY what setupModuleParamShims installed.
#
# It used to also delete host_module_set_param_blocking / host_exit_module /
# host_suspend_overtake — bindings the TOOL lifecycle owns — so closing a
# chain-component editor mid-session killed the live tool's suspend/exit API.
# Behind the old typeof gates that was a silent no-op (Back-hold suspend
# "just flashed the LEDs", hardware 2026-08-09); after the P4b de-gate it was
# a ReferenceError in the module's tick. A lifecycle binding may only be
# deleted by the lifecycle that installed it.

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

js="src/shadow/shadow_ui.js"
fail() { echo "FAIL: $1" >&2; exit 1; }

# Extract the clearModuleParamShims body (up to the next top-level function).
body=$(awk '/^function clearModuleParamShims/{f=1} f{print} f&&/^}/{exit}' "$js")
[ -n "$body" ] || fail "$js lost clearModuleParamShims"

for sym in host_exit_module host_suspend_overtake host_hide_module host_module_set_param_blocking; do
  echo "$body" | rg -q "delete globalThis\.$sym" \
    && fail "clearModuleParamShims deletes $sym — a tool-lifecycle binding it never installed (kills the live tool's suspend/exit API)"
done

# The bindings it DID install must still be cleaned up.
for sym in host_swap_module host_open_file_in_tool; do
  echo "$body" | rg -q "delete globalThis\.$sym" \
    || fail "clearModuleParamShims no longer cleans up $sym (installed by setupModuleParamShims)"
done

echo "PASS: param-shim teardown touches only param-shim bindings"
exit 0
