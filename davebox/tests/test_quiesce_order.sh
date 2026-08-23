#!/usr/bin/env bash
# Source-invariant pins on standalone/scripts/quiesce-stock.sh — the script that
# turns a Tools-menu click into a dead stock menu and a splash.
#
# 2026-08-23, "dAVEBOx needs three clicks": the first click DID launch, but for
# ~9 s nothing changed on screen and stock's menu stayed live, so the user kept
# clicking (the later clicks were refused by the session lock). Two stalls,
# both in this script's ORDER and WAIT, neither in stock:
#   1. the D-Bus song save (4 s reply timeout) ran before should_exit;
#   2. the "is shadow_ui gone" wait used bare pgrep, which lists the ZOMBIE
#      stock's shim never reaps, so the 5 s ceiling burned on every launch.
# These pins keep the order and the zombie test in place.
set -u
cd "$(dirname "$0")/.." || exit 2
Q=../standalone/scripts/quiesce-stock.sh
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

echo "quiesce-stock.sh order:"

# Strip comments so a pin can never be satisfied by prose.
code() { grep -v '^[[:space:]]*#' "$Q"; }
lineof() { code | grep -n -- "$1" | head -1 | cut -d: -f1; }

# 1. should_exit is written BEFORE any D-Bus save can run.
se=$(lineof 'mm\[2\] = 1'); sv=$(lineof 'saveSongIfDirty')
# The D-Bus call lives inside save_song(). Its first CALL on the normal path
# must come after should_exit. The no-control branch (`if [ ! -e "$CONTROL"`)
# has no shadow UI to signal and may save first — skip its lines.
nc_start=$(lineof 'if \[ ! -e "\$CONTROL" \]')
nc_end=$(code | awk -v s="$nc_start" 'NR>s && /^fi$/ {print NR; exit}')
first_call=$(code | grep -n '^[[:space:]]*save_song$' | cut -d: -f1 \
             | awk -v a="$nc_start" -v b="$nc_end" '$1<a || $1>b' | head -1)
if [ -n "$se" ] && [ -n "$first_call" ] && [ "$se" -lt "$first_call" ]; then
    ok "should_exit is set before the first save_song call (line $se < $first_call)"
else
    bad "save_song (D-Bus, 4 s timeout) runs before should_exit — the menu stays live while it waits"
fi

# 2. In the shadow_ui-exited branch, the splash goes up before the save and the freeze.
branch=$(code | sed -n '/shadow_ui exited after/,/exit 0/p')
order=$(printf '%s\n' "$branch" | grep -o 'paint_splash\|save_song\|freeze_move' | tr '\n' ' ')
if [ "$order" = "paint_splash save_song freeze_move " ]; then
    ok "exited branch: splash → save → freeze"
else
    bad "exited branch order is '$order', want 'paint_splash save_song freeze_move '"
fi

# 3. The wait must not count a zombie as running.
if code | sed -n '/^shadow_ui_live()/,/^}/p' | grep -q '/proc/\$p/stat'; then
    ok "shadow_ui_live reads /proc/<pid>/stat (state), not bare pgrep"
else
    bad "shadow_ui_live does not read the process state — a zombie shadow_ui burns the full wait"
fi
if code | sed -n '/^shadow_ui_live()/,/^}/p' | grep -q 'Z|X|""'; then
    ok "zombie (Z) and dead (X) states count as exited"
else
    bad "the state case does not treat Z as exited"
fi
if code | sed -n '/^while/,/^done/p' | grep -q 'shadow_ui_live'; then
    ok "the wait loop uses shadow_ui_live"
else
    bad "the wait loop does not call shadow_ui_live"
fi

# 3b. The pad ticker runs between the splash and the freeze, and the freeze
#     stops it BEFORE SIGSTOP (a stopped Move would never flush the kill).
order=$(printf '%s\n' "$branch" | grep -o 'paint_splash\|start_ticker\|save_song\|freeze_move' | tr '\n' ' ')
if [ "$order" = "paint_splash start_ticker save_song freeze_move " ]; then
    ok "exited branch: splash → ticker → save → freeze"
else
    bad "exited branch order is '$order', want 'paint_splash start_ticker save_song freeze_move '"
fi
fm=$(code | sed -n '/^freeze_move()/,/^}/p')
st=$(printf '%s\n' "$fm" | grep -n 'stop_ticker' | head -1 | cut -d: -f1)
sp=$(printf '%s\n' "$fm" | grep -n 'kill -STOP' | head -1 | cut -d: -f1)
if [ -n "$st" ] && [ -n "$sp" ] && [ "$st" -lt "$sp" ]; then
    ok "freeze_move stops the ticker before SIGSTOP"
else
    bad "freeze_move does not stop the ticker before kill -STOP"
fi
# The ticker itself renders (no SHM needed in preview) and keeps a frame under
# the ring's uint8 write_idx ceiling.
T=../standalone/scripts/pad-ticker.py
if out=$(python3 "$T" --preview 1 2>&1) && printf '%s' "$out" | grep -q 'period [0-9]* columns'; then
    ok "pad-ticker.py renders a preview"
else
    bad "pad-ticker.py --preview failed: $out"
fi
python3 - "$T" <<'PY' && ok "a ticker frame is 32 pad packets (128 B) under the 252 B ring ceiling, notes 68..99" \
                 || bad "pad-ticker frame/packet contract broke"
import importlib.util, sys
sp = importlib.util.spec_from_file_location("t", sys.argv[1]); t = importlib.util.module_from_spec(sp); sp.loader.exec_module(t)
cols = t.columns(t.TEXT); pk = t.packets(t.frame(cols, 3), 120)
assert len(pk) == 128 and len(pk) <= 252
notes = sorted(pk[i + 2] for i in range(0, 128, 4)); assert notes == list(range(68, 100)), notes
assert all(pk[i] == 0x09 and pk[i + 1] == 0x90 for i in range(0, 128, 4))
assert t.pad_note(0, 0) == 92 and t.pad_note(3, 0) == 68 and t.pad_note(3, 7) == 75
assert t.period(cols) > t.COLS * 2
PY

# 3c. The ticker ships: build.sh stages scripts/ by an explicit cp list.
if grep -v '^[[:space:]]*#' ../scripts/build.sh | grep -q 'cp ./standalone/scripts/pad-ticker.py ./build/scripts/'; then
    ok "build.sh stages pad-ticker.py into the payload"
else
    bad "build.sh does not stage pad-ticker.py — quiesce would silently skip the ticker on device"
fi
if grep -q "scripts/\*.py" ../standalone/scripts/install-host.sh; then
    ok "install-host.sh chmods scripts/*.py"
else
    bad "install-host.sh leaves scripts/*.py non-executable (start_ticker tests -x)"
fi

# 3d. Two legs, one scroll: quiesce keeps the offset, launch.sh resumes from it
#     before each Move exec and stops on the session's flag; the session writes
#     that flag on its FIRST LED-init batch (before it clears any pad).
L=../standalone/scripts/launch.sh
if code | sed -n '/^start_ticker()/,/^}/p' | grep -q -- '--state /data/UserData/dbx-host/ticker_offset'; then
    ok "quiesce leg 1 records the offset (--state ticker_offset)"
else
    bad "quiesce leg 1 does not record its offset — leg 2 would restart the word"
fi
leg2=$(grep -n 'pad-ticker.py.*--shm /dev/shm/dbxhost-midi-out' "$L" | head -1 | cut -d: -f1)
execl=$(grep -n '^ *env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal' "$L" | head -1 | cut -d: -f1)
if [ -n "$leg2" ] && [ -n "$execl" ] && [ "$leg2" -lt "$execl" ]; then
    ok "launch.sh starts leg 2 against OUR ring before exec'ing Move (line $leg2 < $execl)"
else
    bad "launch.sh leg 2 missing or after the Move exec (it blocks until Move exits)"
fi
sed -n "${leg2},$((leg2+3))p" "$L" | tr '\n' ' ' | grep -q -- '--offset-file.*ticker_offset.*--stop.*ticker_stop' \
    && ok "leg 2 resumes from ticker_offset and stops on ticker_stop" \
    || bad "leg 2 lacks --offset-file ticker_offset / --stop ticker_stop"
grep -q 'rm -f "\$DBX_DIR/ticker_stop"' "$L" && ok "launch.sh clears a stale ticker_stop before leg 2" \
                                             || bad "a stale ticker_stop would end leg 2 instantly"
grep -q 'kill "\$TICKER2_PID"' "$L" && ok "launch.sh kills leg 2 by PID after Move exits" \
                                      || bad "a ticker could outlive the session"
# ⚠ The launcher body is ONE bash -c argv: any `pkill -f` pattern that appears
# in the body matches the supervisor itself. 2026-08-23: pkill -f pad-ticker.py
# killed the launcher on exit; the device froze on the farewell screen.
open=$(grep -n "^setsid bash -c '" "$L" | head -1 | cut -d: -f1)
close=$(grep -n "^' &" "$L" | head -1 | cut -d: -f1)
if sed -n "$((open+1)),$((close-1))p" "$L" | grep -v '^[[:space:]]*#' | grep -q 'pkill -f'; then
    bad "pkill -f inside the launcher body — it matches the supervisor's own argv"
else
    ok "no pkill -f inside the launcher body (it would kill the supervisor)"
fi
U=ui/ui_leds.mjs
d=$(sed -n '/^export function drainLedInit()/,/^}/p' "$U")
printf '%s\n' "$d" | grep -q "ticker_stop" && ok "drainLedInit writes ticker_stop" || bad "drainLedInit does not write ticker_stop"
w=$(printf '%s\n' "$d" | grep -n "ticker_stop" | head -1 | cut -d: -f1)
c=$(printf '%s\n' "$d" | grep -n "LED_OFF" | head -1 | cut -d: -f1)
[ -n "$w" ] && [ -n "$c" ] && [ "$w" -lt "$c" ] && ok "…before the first pad is cleared (line $w < $c)" \
                                                 || bad "ticker_stop is written after pads start clearing — the ticker repaints them"
printf '%s\n' "$d" | grep -q "ledInitIndex === 0" && ok "…on the FIRST batch only" || bad "ticker_stop is not gated on the first batch"
# Functional: stop flag ends the run, the offset resumes and advances.
python3 - "$T" <<'PY' && ok "ticker: resumes from --offset-file, advances --state, exits on --stop, waits for the ring" \
                 || bad "ticker two-leg contract broke"
import subprocess, tempfile, os, time, sys
T = sys.argv[1]; d = tempfile.mkdtemp()
shm = os.path.join(d, "ring"); st = os.path.join(d, "off"); stop = os.path.join(d, "stop")
open(st, "w").write("23\n")
p = subprocess.Popen([sys.executable, T, "--shm", shm, "--wait", "3", "--fps", "50",
                      "--offset-file", st, "--state", st, "--stop", stop])
time.sleep(0.3); open(shm, "wb").write(b"\0" * 516)     # ring appears late, as on boot
time.sleep(0.4); open(stop, "w").write("1")
assert p.wait(timeout=3) == 0
ring = open(shm, "rb").read(); off = int(open(st).read())
assert ring[0] == 128 and ring[1] == 1, (ring[0], ring[1])
assert 23 < off < 58, off
PY

# 4. Every progress line is stamped (launch.log has no timestamps of its own).
if code | grep -q 'quiesce: ' ; then
    n=$(code | grep -c 'echo "quiesce:' || true)
    [ "${n:-0}" -eq 0 ] && ok "no unstamped 'echo \"quiesce:' lines remain" \
                        || bad "$n unstamped echo \"quiesce:\" line(s) — use say"
fi

[ "$fail" -eq 0 ] && echo "PASS: quiesce order and zombie-aware wait are pinned" \
                  || echo "FAIL: quiesce-stock.sh regressed"
exit "$fail"
