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
#
# ⚠⚠ AND AGAIN (upstream 988ed244, stock 1.5.0): the segment became an SPSC
# ring and byte 2 became read_idx — the CONSUMER's index. The old ready bump
# would now move the shim's read position by one byte. So beyond the offsets,
# the C ring header itself reads back what the script wrote.
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
print(f"read_idx {fields['read_idx'][0]} {fields['read_idx'][1]}")
print(f"buffer {fields['buffer'][0]}")
PYEOF
)
widx_off=$(echo "$derived" | awk '/^write_idx/{print $2}')
widx_ty=$(echo "$derived"  | awk '/^write_idx/{print $3}')
ridx_off=$(echo "$derived" | awk '/^read_idx/{print $2}')
ridx_ty=$(echo "$derived"  | awk '/^read_idx/{print $3}')
buf_off=$(echo "$derived"   | awk '/^buffer/{print $2}')

[ "$widx_off" = "0" ] && [ "$widx_ty" = "uint16_t" ] \
    && say "ok   — header: write_idx is uint16_t at offset 0" \
    || { say "FAIL — header write_idx moved ($widx_ty at $widx_off): update blank-leds.py AND this test"; fail=1; }
[ "$ridx_off" = "2" ] && [ "$ridx_ty" = "uint16_t" ] \
    && say "ok   — header: read_idx is uint16_t at offset 2" \
    || { say "FAIL — header read_idx moved ($ridx_ty at $ridx_off): update blank-leds.py AND this test"; fail=1; }
[ "$buf_off" = "4" ] \
    && say "ok   — header: buffer at offset 4 (HDR=4)" \
    || { say "FAIL — buffer offset is $buf_off"; fail=1; }

# --- blank-leds.py must use the same numbers, and stay a PRODUCER -----------
grep -Eq '^WIDX_OFF, RIDX_OFF = 0, 2' "$PY" \
    && say "ok   — blank-leds offsets match the derived layout" \
    || { say "FAIL — blank-leds offset constants drifted from the header"; fail=1; }
stripped=$(python3 -c "
import re
s=open('$PY').read()
s=re.sub(r'\"\"\".*?\"\"\"','',s,flags=re.S)
s=re.sub(r'#[^\n]*','',s)
print(s)")
echo "$stripped" | grep -Eq 'ridx\.value *=[^=]' \
    && { say "FAIL — blank-leds writes read_idx (the consumer's index)"; fail=1; } \
    || say "ok   — blank-leds never writes read_idx"
echo "$stripped" | grep -Eq 'mm\[[0-3]\] *=' \
    && { say "FAIL — a bare header byte assignment (a torn index, or the consumer's)"; fail=1; } \
    || say "ok   — no bare header byte assignments"

# --- the C ring header reads back exactly what the script wrote --------------
# Both wraps at once: the indices start 12 bytes short of 65536, so the payload
# crosses the end of the buffer AND the uint16 wrap. Driven against OUR header
# (512) — the script takes N from the file, so stock's 4096 is the same code.
T=$(mktemp -d)
cat > "$T/rd.c" <<'CEOF'
#include <fcntl.h>
#include <stdio.h>
#include <sys/mman.h>
#include "shadow_constants.h"
#include "ui_midi_out_ring.h"
int main(int argc, char **argv) {
    int fd = open(argv[1], O_RDONLY);
    shadow_midi_out_t *m = mmap(0, sizeof *m, PROT_READ, MAP_SHARED, fd, 0);
    if (m == MAP_FAILED) return 2;
    uint8_t out[SHADOW_MIDI_OUT_BUFFER_SIZE];
    uint16_t n = ui_midi_out_used(m);
    ui_midi_out_copy(m, out, n);
    printf("%u %u ", (unsigned)m->read_idx, (unsigned)n);
    for (int i = 0; i < n; i++) printf("%02x", out[i]);
    printf("\n");
    return 0;
}
CEOF
if ${CC:-cc} -I src/host -o "$T/rd" "$T/rd.c" 2>"$T/cc.err"; then
    python3 - "$PY" "$T" <<'PYEOF' && say "ok   — the C ring reads the script's payload whole, in order, across both wraps; read_idx untouched" \
                              || { say "FAIL — the C ring does not read back what blank-leds wrote"; fail=1; }
import importlib.util, os, struct, subprocess, sys
py, t = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("b", py)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
seg = os.path.join(t, "ring")
start = 65536 - 12
with open(seg, "wb") as f: f.write(struct.pack("<HH", start, start) + bytes(512))
rc = subprocess.run([sys.executable, py, "--shm", seg, "--rounds", "1", "--gap", "0"]).returncode
assert rc == 0, ("rc", rc)
ridx, n, hexs = subprocess.run([os.path.join(t, "rd"), seg], capture_output=True, text=True).stdout.split()
assert int(ridx) == start, ("read_idx moved", ridx)
assert bytes.fromhex(hexs) == m.messages(), ("payload differs", n, len(m.messages()))
PYEOF
else
    say "FAIL — could not compile the C reader:"; cat "$T/cc.err"; fail=1
fi
rm -rf "$T"

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
