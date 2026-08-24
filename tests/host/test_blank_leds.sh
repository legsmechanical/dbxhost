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

# --- 2. frames fit the ring's uint8 write_idx ------------------------------
# ⭑ The constraint that makes this non-obvious: the consumer snapshots a
# ONE-BYTE write_idx, so a frame over 252 bytes corrupts the header rather than
# just dropping. 92 messages is 368 bytes — it MUST be split.
python3 - "$S" <<'PY' && ok "the payload is split into frames the ring can address (<=252 bytes)" \
                      || bad "a frame exceeds 252 bytes — this would tear the ring header"
import importlib.util, sys
spec = importlib.util.spec_from_file_location("b", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
cs = m.chunks(m.messages())
assert len(cs) > 1, "payload was not split at all — it is larger than one frame"
for c in cs:
    assert len(c) <= 252, len(c)
    assert len(c) % 4 == 0, "a frame was split mid-message"
sys.exit(0)
PY

# --- 3. BOTH legs are wired, and the script is shipped ---------------------
# ⭑ Generating the right bytes into a script nobody calls is the quiet way for
# this to do nothing at all — which is exactly what the first attempt did.
grep -q 'blank-leds.py' standalone/scripts/quiesce-stock.sh \
    && ok "leg 1: quiesce-stock blanks before the freeze" \
    || bad "quiesce-stock does not call blank-leds.py — nothing darkens at selection"
grep -q 'blank_leds' standalone/scripts/quiesce-stock.sh \
    && ok "...and paint_splash carries the call, so every route inherits it" \
    || bad "the blank is not wired into paint_splash"
grep -q 'blank-leds.py' standalone/scripts/launch.sh \
    && ok "leg 2: launch.sh blanks our ring during the boot of the new Move" \
    || bad "launch.sh does not call blank-leds.py — LEDs relight as Move boots"
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

[ "$fail" = "0" ] && printf 'PASS: the launch writes every LED dark, on both legs\n'
exit $fail
