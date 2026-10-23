#!/usr/bin/env bash
# tests/host/test_power_button_wiring.sh — the POWER button's path is WIRED:
# the shim decides through shim_power_gate (unit-tested in
# test_shim_power_gate.c) on the power SysEx; shadow_ui reads the press and
# hands it to the module's onPowerButton; and the claim is dropped whenever the
# module stops owning the screen, so Move's own power prompt comes back.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
S=src/schwung_shim.c; J=src/shadow/shadow_ui.js; C=src/shadow/shadow_ui.c

python3 - "$S" <<'PY' && ok "the shim gates the power SysEx through shim_power_gate, with the lead packet's id" || bad "the shim's power-SysEx branch does not call shim_power_gate"
import re, sys
s = open(sys.argv[1]).read()
m = re.search(r"if \(power_sysex_hit\)\s*filter = shim_power_gate\(overtake_mode,[^;]*power_sysex_lead, power_sysex_id\);", s)
assert m, "gate call missing"
assert "power_sysex_id = hw_midi[j + 17];" in s, "id not taken from the lead packet"
PY
grep -q '"shadow_get_power_button"' "$C" && grep -q '"host_power_claim"' "$C" \
    && ok "both bindings are registered" || bad "a binding is not registered"
python3 - "$J" <<'PY' && ok "shadow_ui hands the press to onPowerButton before the module's tick" || bad "shadow_ui does not forward the press"
import sys
s = open(sys.argv[1]).read()
i = s.find("shadow_get_power_button()")
j = s.find("globalThis.onPowerButton(powerId)")
k = s.find("runToolCallback(function() { overtakeModuleCallbacks.tick(); });")
assert 0 < i < j < k, (i, j, k)
PY
python3 - "$J" <<'PY' && ok "the claim is derived each tick from the module exporting onPowerButton" || bad "the claim is not derived from the export"
import sys
s = open(sys.argv[1]).read()
i = s.index('host_power_claim(typeof globalThis.onPowerButton === "function" ? 1 : 0);')
assert i < s.find("shadow_get_power_button()"), "claim set after the read"
PY
python3 - "$J" <<'PY' && ok "exitOvertakeMode and suspendOvertakeMode drop the claim" || bad "the claim outlives the module's screen"
import re, sys
s = open(sys.argv[1]).read()
for fn in ("exitOvertakeMode", "suspendOvertakeMode"):
    body = s[s.index("function %s() {" % fn):][:600]
    assert "host_power_claim(0)" in body, fn
PY
[ "$fail" = 0 ] && echo "PASS: test_power_button_wiring" || { echo "FAIL: test_power_button_wiring"; exit 1; }
