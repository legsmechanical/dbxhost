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
# These pins keep the order and the zombie test in place. (A pad-LED launch
# ticker lived here for a day — removed 2026-08-23 once the launch was fast.)
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

# 3b. The launcher body is ONE bash -c argv: any `pkill -f` pattern that appears
#     in the body matches the supervisor itself. 2026-08-23: a pkill -f on a
#     child script name killed the launcher on exit; the device froze on the
#     farewell screen. Kill children by PID.
L=../standalone/scripts/launch.sh
open=$(grep -n "^setsid bash -c '" "$L" | head -1 | cut -d: -f1)
close=$(grep -n "^' &" "$L" | head -1 | cut -d: -f1)
if sed -n "$((open+1)),$((close-1))p" "$L" | grep -v '^[[:space:]]*#' | grep -q 'pkill -f'; then
    bad "pkill -f inside the launcher body — it matches the supervisor's own argv"
else
    ok "no pkill -f inside the launcher body (it would kill the supervisor)"
fi

# 4. Every progress line is stamped (launch.log has no timestamps of its own).
if code | grep -q 'quiesce: ' ; then
    n=$(code | grep -c 'echo "quiesce:' || true)
    [ "${n:-0}" -eq 0 ] && ok "no unstamped 'echo \"quiesce:' lines remain" \
                        || bad "$n unstamped echo \"quiesce:\" line(s) — use say"
fi

# 5. save_song Pings for D-Bus liveness (short timeout) before the 4 s save —
#    the returned Move can be deaf on D-Bus and stall the launch (dbxhost.md 81).
sb=$(code | sed -n '/^save_song()/,/^}/p')
ping_l=$(printf '%s\n' "$sb" | grep -n 'Peer.Ping' | head -1 | cut -d: -f1)
save_l=$(printf '%s\n' "$sb" | grep -n 'saveSongIfDirty' | grep -v SKIPPED | head -1 | cut -d: -f1)
if [ -n "$ping_l" ] && [ -n "$save_l" ] && [ "$ping_l" -lt "$save_l" ]; then
    ok "save_song pings for D-Bus liveness before the save"
else
    bad "save_song does not gate the 4 s save on a fast liveness ping"
fi
printf '%s\n' "$sb" | grep -q 'reply-timeout="?800' || printf '%s\n' "$sb" | grep -q '800' \
    && ok "the liveness ping uses a short (sub-second) timeout" \
    || bad "the liveness ping has no short timeout — a deaf Move still stalls the launch"

[ "$fail" -eq 0 ] && echo "PASS: quiesce order and zombie-aware wait are pinned" \
                  || echo "FAIL: quiesce-stock.sh regressed"
exit "$fail"
