#!/usr/bin/env bash
# tests/host/test_power_off_path.sh — SAVE & POWER OFF, the launcher half.
#   power-off.sh: Move's song is saved, THEN the marker is written, THEN the
#     session ends the normal way (exit-to-stock.sh) — run for real here, with
#     dbus-send and the exit script stubbed and their order logged.
#   launch.sh: a marker from an earlier session is cleared at start; the
#     power-off runs only after the set swap is undone, through the helper
#     itself (not the unit() wrapper, which skips at boot), and waits rather
#     than fall into the quit path that brings Move back.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx/scripts" "$T/bin"
cat > "$T/bin/dbus-send" <<STUB
#!/bin/sh
echo "dbus \$*" >> "$T/order.log"
[ -e "$T/dbx/poweroff-request" ] && echo "dbus AFTER the marker" >> "$T/order.log"
exit 0
STUB
cat > "$T/dbx/scripts/exit-to-stock.sh" <<STUB
#!/bin/sh
[ -e "$T/dbx/poweroff-request" ] && echo "exit with marker" >> "$T/order.log" || echo "exit WITHOUT marker" >> "$T/order.log"
STUB
chmod +x "$T/bin/dbus-send" "$T/dbx/scripts/exit-to-stock.sh"

echo "power-off.sh:"
PATH="$T/bin:$PATH" DBX_DIR="$T/dbx" sh standalone/scripts/power-off.sh; rc=$?
[ "$rc" = 0 ] && ok "exits 0" || bad "rc=$rc"
head -1 "$T/order.log" | grep -q "saveSongIfDirty" && ok "first saves Move's song (saveSongIfDirty)" || bad "order: $(cat "$T/order.log")"
! grep -q "AFTER the marker" "$T/order.log" && ok "…before the marker exists" || bad "song saved after the marker"
[ "$(tail -1 "$T/order.log")" = "exit with marker" ] && ok "then ends the session, with the marker in place" || bad "order: $(cat "$T/order.log")"

echo "launch.sh:"
python3 - standalone/scripts/launch.sh <<'PY' && ok "stale marker cleared at start; power-off after the set swap, before the quit path; helper called directly; waits" || bad "launch.sh power-off placement"
import sys
s = open(sys.argv[1]).read()
clr = s.index('rm -f "$DBX_DIR/poweroff-request"')
loop = s.index('rm -f "$DBX_DIR/relaunch_requested"')
assert clr < loop, "the stale marker is cleared only after Move starts"
swap = s.index('sh "$DBX_DIR/scripts/set-swap.sh" exit ||')
blk = s.index('if [ -f "$DBX_DIR/poweroff-request" ]; then')
quit = s.index('at_boot || date +%s > "$DBX_DIR/quit-to-stock"', swap)
assert swap < blk < quit, (swap, blk, quit)
body = s[blk:quit]
assert 'if "$HEAL" --poweroff; then' in body, "not the helper itself"
assert "unit --poweroff" not in body
assert "sleep 1" in body and "-lt 60" in body, "does not wait for the shutdown"
assert body.index('rm -f "$DBX_DIR/poweroff-request"') < body.index('"$HEAL" --poweroff'), "marker not consumed first"
PY
[ "$fail" = 0 ] && echo "PASS: test_power_off_path" || { echo "FAIL: test_power_off_path"; exit 1; }
