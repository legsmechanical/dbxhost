#!/bin/bash
# test_blank_leds_layout.sh — blank-leds.py must speak shadow_midi_out_t's
# ACTUAL layout, derived from the header, not remembered.
#
# ⚠⚠ THE BUG THIS PINS (2026-08-31): upstream v1.0.0 widened write_idx to
# uint16 — taking the byte `ready` lived in — and blank-leds.py kept the old
# offsets. Its "ready bump" then corrupted write_idx's HIGH byte, the real
# ready never changed, the shim's `ready == last_ready` gate never opened:
# no drain, every wait burned its 2 s ceiling, and the pads held the lit
# stock menu through the whole launch. Nothing logged; quiesce even printed
# "LEDs blanked". A cross-language layout copy is exactly the kind of pin
# that must be DERIVED, so this test computes the offsets from the struct.
set -e
cd "$(dirname "$0")/../.."
HDR=src/host/shadow_constants.h
PY=standalone/scripts/blank-leds.py
fail=0
say() { echo "  $1"; }

# --- derive the field offsets from the header ------------------------------
# Pull the struct body, STRIP COMMENTS FIRST (a commented-out field still
# matches a grep), then walk the fields accumulating offsets.
derived=$(python3 - "$HDR" <<'PYEOF'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'typedef struct shadow_midi_out_t \{(.*?)\} shadow_midi_out_t;', src, re.S)
if not m: raise SystemExit("struct shadow_midi_out_t not found")
body = re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S)
body = re.sub(r'//[^\n]*', '', body)
sizes = {'uint8_t': 1, 'uint16_t': 2, 'uint32_t': 4}
off = 0; fields = {}
for line in body.split(';'):
    fm = re.search(r'(?:volatile\s+)?(uint8_t|uint16_t|uint32_t)\s+(\w+)(?:\[(\d+)\])?', line)
    if not fm: continue
    ty, name, arr = fm.group(1), fm.group(2), fm.group(3)
    fields[name] = (off, ty)
    off += sizes[ty] * (int(arr) if arr else 1)
print(f"write_idx {fields['write_idx'][0]} {fields['write_idx'][1]}")
print(f"ready {fields['ready'][0]} {fields['ready'][1]}")
print(f"buffer {fields['buffer'][0]}")
PYEOF
)
widx_off=$(echo "$derived" | awk '/^write_idx/{print $2}')
widx_ty=$(echo "$derived"  | awk '/^write_idx/{print $3}')
ready_off=$(echo "$derived" | awk '/^ready/{print $2}')
buf_off=$(echo "$derived"   | awk '/^buffer/{print $2}')

[ "$widx_off" = "0" ] && [ "$widx_ty" = "uint16_t" ] \
    && say "ok   — header: write_idx is uint16_t at offset 0" \
    || { say "FAIL — header write_idx moved ($widx_ty at $widx_off): update blank-leds.py AND this test"; fail=1; }
[ "$ready_off" = "2" ] \
    && say "ok   — header: ready at offset 2" \
    || { say "FAIL — header ready offset is $ready_off"; fail=1; }
[ "$buf_off" = "4" ] \
    && say "ok   — header: buffer at offset 4 (HDR=4)" \
    || { say "FAIL — buffer offset is $buf_off"; fail=1; }

# --- blank-leds.py must use the same numbers, at the CALL SITES -------------
grep -Eq 'WIDX_LO, WIDX_HI, READY_OFF = 0, 1, 2' "$PY" \
    && say "ok   — blank-leds constants match the derived layout" \
    || { say "FAIL — blank-leds offset constants drifted from the header"; fail=1; }
# The constants must be USED, not merely defined — a stray mm[1] write is the
# original bug back again (it corrupts write_idx's high byte).
grep -Eq 'mm\[READY_OFF\] *= *\(mm\[READY_OFF\] *\+ *1\)' "$PY" \
    && say "ok   — ready bump goes through READY_OFF" \
    || { say "FAIL — ready bump does not use READY_OFF"; fail=1; }
stripped=$(python3 -c "
import re
s=open('$PY').read()
s=re.sub(r'\"\"\".*?\"\"\"','',s,flags=re.S)
s=re.sub(r'#[^\n]*','',s)
print(s)")
echo "$stripped" | grep -Eq 'mm\[[01]\] *=' \
    && { say "FAIL — a bare mm[0]/mm[1] assignment survives (the high-byte corruption path)"; fail=1; } \
    || say "ok   — no bare mm[0]/mm[1] assignments outside the helpers"
echo "$stripped" | grep -Eq 'def write_widx' \
    && say "ok   — write_widx helper exists" \
    || { say "FAIL — write_widx helper missing"; fail=1; }

# --- stage-1 splash handoff: both sides of the sh/JS seam name ONE file -----
q=$(grep -o 'splash-stage1[a-z.]*' standalone/scripts/quiesce-stock.sh | head -1)
j=$(grep -o 'splash-stage1[a-z.]*' src/shadow/shadow_ui.js | head -1)
[ -n "$q" ] && [ "$q" = "$j" ] \
    && say "ok   — stage-1 handoff filename agrees across the seam ($q)" \
    || { say "FAIL — handoff filename mismatch: quiesce='$q' shadow_ui='$j'"; fail=1; }
# The host must CONSUME it and GATE the artwork on it (call-site, not wiring).
grep -q 'stage1Done && pool.length' src/shadow/shadow_ui.js \
    && say "ok   — artwork stage is gated on stage1Done" \
    || { say "FAIL — artwork stage not gated on the handoff"; fail=1; }

[ $fail = 0 ] && echo "PASS: blank-leds layout + stage-1 handoff" || echo "FAIL"
exit $fail
