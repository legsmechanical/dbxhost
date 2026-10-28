#!/usr/bin/env bash
# tests/host/test_power_button_wiring.sh — the POWER button's path is WIRED:
# the shim passes every power SysEx to Move through shim_power_gate (unit-tested
# in test_shim_power_gate.c); the D-Bus handler turns Move's prompt into the
# module's press and closes the prompt with a Back tap the shim sends; shadow_ui
# hands that press to the module's onPowerButton; and the claim is dropped
# whenever the module stops owning the screen, so Move's own prompt comes back.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
S=src/schwung_shim.c; J=src/shadow/shadow_ui.js; C=src/shadow/shadow_ui.c; D=src/host/shadow_dbus.c

python3 - "$S" <<'PY' && ok "the shim gates the power SysEx through shim_power_gate, with the lead packet's id" || bad "the shim's power-SysEx branch does not call shim_power_gate"
import re, sys
s = open(sys.argv[1]).read()
m = re.search(r"if \(power_sysex_hit\)\s*filter = shim_power_gate\(overtake_mode, shadow_control, power_sysex_lead,\s*power_sysex_id, power_sysex_val\);", s)
assert m, "gate call missing"
assert "power_sysex_id = hw_midi[j + 18];" in s, "press byte not taken from offset 18 (17 is the 0x3A subcommand)"
assert "power_sysex_val = hw_midi[j + 19];" in s, "value byte not taken from offset 19"
PY
grep -q '"shadow_get_power_button"' "$C" && grep -q '"host_power_claim"' "$C" \
    && ok "both bindings are registered" || bad "a binding is not registered"
python3 - "$S" "$D" <<'PY' && ok "Move's prompt is the claimed press: the D-Bus handler flags it and closes it with Back" || bad "the claimed prompt is not wired"
import re, sys
s = open(sys.argv[1]).read(); d = open(sys.argv[2]).read()
i = d.index("int power_ours = shim_power_prompt_claimed(ctrl, text, dbus_now_ms(), &power_prompt_last_ms);")
j = d.index("host.close_move_power_prompt();", i)
r = d.index("} else if (power_ours == 2) {", j)
repeat = d[r + 1:d.index("} else if", r + 1)]
assert "close_move_power_prompt" not in repeat and "power_prompt" not in repeat.replace("power_ours", ""), \
    "the repeat branch must not close the prompt again or flag a second press"
k = d.index("} else if (ctrl && strcasecmp(text, MOVE_POWER_PROMPT_TEXT) == 0) {")
assert i < j < k, "the claimed branch must come first and must not take the screen"
assert ".close_move_power_prompt = shim_close_move_power_prompt," in s, "callback not given to the D-Bus handler"
body = s[s.index("static void shim_power_back_frame(void)"):][:700]
assert "shim_select_inject(0x0B, 0xB0, CC_BACK, 127);" in body and "shim_select_inject(0x0B, 0xB0, CC_BACK, 0);" in body, "Back down/up not sent"
assert re.search(r"shim_select_gate_frame\(hw_midi, sh_midi\);\s*shim_power_back_frame\(\);", s), "Back tap not run each frame"
PY
python3 - "$J" <<'PY' && ok "shadow_ui hands Move's prompt to onPowerButton before the module's tick, and only logs the SysEx" || bad "shadow_ui does not forward the press"
import sys
s = open(sys.argv[1]).read()
i = s.find("shadow_get_power_button()")
p = s.find("if (powerRaw & 0x20000) {")
j = s.find("globalThis.onPowerButton(0x2A)")
assert 0 < i < p < j, ("only Move's prompt reaches the module", i, p, j)
assert "-> passed to Move" in s, "the SysEx log line is gone"
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
