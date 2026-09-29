#!/bin/sh
# tests/host/test_blank_leds.sh — the launch actually turns the LEDs OFF.
#
# Josh, 2026-08-24, after the first attempt shipped and changed nothing:
# "leds don't go blank on launch. should be doable since we had the scrolling
# animation pop up almost immediately on launch a while back."
#
# ⚠⚠ THE LESSON THIS FILE EXISTS FOR: stripping is not blanking. The shim
# already dropped Move's LED writes during the boot window, and the first fix
# leaned on that — but an LED holds its last physically-written value, and the
# launch SIGSTOPs Move mid-Tools-menu. Suppressing future paints cannot darken a
# pad that is already lit. Only a write can. Josh's pointer to the old pad
# ticker was the answer: it reached the pads this early through the shadow-UI
# MIDI-out ring, so the blank goes the same way.
set -u
cd "$(dirname "$0")/../.."
fail=0
ok()  { printf '  ok   — %s\n' "$1"; }
bad() { printf '  FAIL — %s\n' "$1" >&2; fail=1; }

S=standalone/scripts/blank-leds.py
[ -x "$S" ] && ok "blank-leds.py is present and executable" \
            || bad "blank-leds.py missing or not executable"

# --- 1. it writes DARK, and covers the whole surface -----------------------
python3 - "$S" <<'PY' && ok "every message is velocity/value 0 across pads, steps and buttons" \
                      || bad "the payload does not darken the whole surface"
import importlib.util, sys
spec = importlib.util.spec_from_file_location("b", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
p = m.messages()
assert len(p) % 4 == 0
notes, ccs = set(), set()
for i in range(0, len(p), 4):
    cin, status, d1, d2 = p[i], p[i+1], p[i+2], p[i+3]
    assert d2 == 0, "message %d is not dark (value %d)" % (i // 4, d2)
    if status == 0x90: notes.add(d1)
    elif status == 0xB0: ccs.add(d1)
    else: raise AssertionError("unexpected status 0x%02x" % status)
    assert cin in (0x09, 0x0B), cin
# pads 68-99 and the 16 step buttons — the grid plus the sequencer row
assert set(range(68, 100)) <= notes, "not every pad is covered"
assert set(range(16, 32)) <= notes, "not every step button is covered"
assert len(ccs) > 20, "button CC coverage looks too thin: %d" % len(ccs)
sys.exit(0)
PY

# --- 2. pushes fit the ring and never split a message ----------------------
python3 - "$S" <<'PY' && ok "pushes fit each ring's capacity (ours 508, stock 4092) and split on message boundaries" \
                      || bad "a push exceeds the ring's capacity or splits mid-message"
import importlib.util, sys
spec = importlib.util.spec_from_file_location("b", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
for cap in (508, 4092, 60):
    cs = m.chunks(m.messages(), cap)
    assert sum(len(c) for c in cs) == len(m.messages()), "chunking lost bytes"
    for c in cs:
        assert len(c) <= cap, (cap, len(c))
        assert len(c) % 4 == 0, "a push was split mid-message"
sys.exit(0)
PY

# --- 2b. STOCK'S RING IS WRITTEN; A RING WE DO NOT KNOW IS SKIPPED AT ONCE ---
# ⚠⚠ Stock's 2026-09-26 update (1.5.0) made its ring 4100 bytes: the SPSC ring
# of upstream 988ed244 with a 4096-byte buffer. The old writer read it as the
# 516-byte layout and refused it — fast (the 09-27 fix, after each call had
# burned a 2 s wait: "the tool menu on stock lingers for a good while"), but
# from then on NOTHING was blanked. The header captured on the device,
# d8 dd d8 dd, is write_idx == read_idx == 56792: an empty ring.
T=$(mktemp -d)
python3 - "$S" "$T" <<'PY' && ok "stock's 4100-byte ring and ours are written; read_idx is never touched; an unknown ring exits 5 at once; a full one says so" \
                           || bad "the blank does not speak the ring, or an unknown ring is not skipped at once"
import importlib.util, subprocess, sys, time, os, struct
s, t = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("b", s)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
P = m.messages()
def run(name, content):
    path = os.path.join(t, name)
    with open(path, "wb") as f: f.write(content)
    t0 = time.monotonic()
    rc = subprocess.run([sys.executable, s, "--shm", path, "--rounds", "1", "--gap", "0"]).returncode
    return rc, time.monotonic() - t0, open(path, "rb").read()
# stock 1.5.0, as captured
rc, dt, d = run("stock", bytes([216, 221, 216, 221]) + bytes(4096))
w, r = struct.unpack_from("<HH", d)
pos = 56792 & 4095
assert rc == 0, ("stock", rc)
assert d[4 + pos:4 + pos + len(P)] == P, ("stock: payload not at write_idx", pos)
assert w == 56792 + len(P) and r == 56792, ("stock: indices", w, r)
# ours, empty
rc, dt, d = run("ours", bytes(516))
w, r = struct.unpack_from("<HH", d)
assert rc == 0 and d[4:4 + len(P)] == P and w == len(P) and r == 0, ("ours", rc, w, r)
# unknown sizes: not a power-of-2 buffer, or too small
for name, size in (("odd", 4101), ("tiny", 20)):
    rc, dt, d = run(name, bytes(size))
    assert rc == 5 and dt < 1.0, (name, rc, dt)
# right size, indices that cannot be a ring (more used than it holds)
rc, dt, d = run("garbled", struct.pack("<HH", 56792, 0) + bytes(512))
assert rc == 5 and dt < 1.0, ("garbled", rc, dt)
assert d[4:] == bytes(512), "garbled: something was written anyway"
# full, and no shim draining it: gives up after its deadline and says so
rc, dt, d = run("full", struct.pack("<HH", 508, 0) + bytes(512))
assert rc == 3 and struct.unpack_from("<HH", d) == (508, 0), ("full", rc)
sys.exit(0)
PY
rm -rf "$T"
grep -q 'LED blank skipped' standalone/scripts/quiesce-stock.sh \
    && ok "quiesce names the skip rather than calling it a failure" \
    || bad "quiesce does not tell a skipped ring from a failed blank"

# --- 3. BOTH legs are wired, and the script is shipped ---------------------
# ⭑ Generating the right bytes into a script nobody calls is the quiet way for
# this to do nothing at all — which is exactly what the first attempt did.
grep -q 'blank-leds.py' standalone/scripts/quiesce-stock.sh \
    && ok "leg 1: quiesce-stock blanks before the freeze" \
    || bad "quiesce-stock does not call blank-leds.py — nothing darkens at selection"
grep -q 'blank_leds' standalone/scripts/quiesce-stock.sh \
    && ok "...and paint_splash carries the call, so every route inherits it" \
    || bad "the blank is not wired into paint_splash"
# ⚠⚠ THE BUG THAT SHIPPED TWICE: the call used "$DBX_DIR/scripts/blank-leds.py",
# and DBX_DIR is never DEFINED in quiesce-stock.sh (it is run as a script, not
# sourced from the launcher). It expanded to empty, the -x test failed, and the
# function returned 0 in silence — the feature shipped doing nothing, and looked
# wired the whole time because the grep above passed. So: assert the path is
# ABSOLUTE and that it is the path the installer actually writes to.
grep -qE 'BLANK_LEDS=/data/UserData/dbx-host/scripts/blank-leds\.py' standalone/scripts/quiesce-stock.sh \
    && ok "leg 1 names an ABSOLUTE path (no undefined variable to expand to nothing)" \
    || bad "the blank path is not absolute — an unset variable makes it a silent no-op"
grep -q 'DBX_DIR' standalone/scripts/quiesce-stock.sh && {
    # only the explanatory comment may mention it
    if grep 'DBX_DIR' standalone/scripts/quiesce-stock.sh | grep -qv '^#'; then
        bad "quiesce-stock.sh USES \$DBX_DIR, which it never defines"
    else
        ok "...and \$DBX_DIR appears only in the comment explaining why not"
    fi
}
grep -q 'WARNING' standalone/scripts/quiesce-stock.sh \
    && ok "a missing script SAYS SO instead of skipping quietly" \
    || bad "the blank still fails silently when the script is absent"
# ⭑ There is deliberately NO second leg. Writing note-offs down OUR ring during
# boot cannot work: the shim drains the ring into the outgoing mailbox and then
# strips every cable-0 LED write from it while boot_tool_led_blank is armed.
grep -q 'blank-leds.py' standalone/scripts/launch.sh \
    && bad "launch.sh blanks our ring — those writes are stripped by the shim; it is a no-op" \
    || ok "no second leg: our own boot strip would eat it, and leg 1 already covers the window"
grep -q 'blank-leds.py' scripts/build.sh \
    && ok "build.sh ships it (both legs depend on it being on the device)" \
    || bad "build.sh does not stage blank-leds.py — both call sites would no-op"

# --- 4. launch.sh stays apostrophe-free in the session body ----------------
# ⚠⚠ The whole session body is ONE single-quoted bash -c string: a bare
# apostrophe anywhere in it, even inside a comment, ends the string and every
# later line is reparsed as garbage. It fails SILENTLY, because the launcher is
# detached. This bit me writing the block above, and the file already carried
# two warnings about it — so it is a check now, not a third warning.
bash -n standalone/scripts/launch.sh 2>/dev/null \
    && ok "launch.sh parses (no stray apostrophe in the session body)" \
    || bad "launch.sh does not parse — almost certainly an apostrophe in the bash -c body"
bash -n standalone/scripts/quiesce-stock.sh 2>/dev/null \
    && ok "quiesce-stock.sh parses" || bad "quiesce-stock.sh does not parse"

[ "$fail" = "0" ] && printf 'PASS: the launch writes every LED dark, while stock still owns the surface\n'
exit $fail
