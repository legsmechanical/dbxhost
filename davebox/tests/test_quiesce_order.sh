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

# 4. Every progress line is stamped (launch.log has no timestamps of its own).
if code | grep -q 'quiesce: ' ; then
    n=$(code | grep -c 'echo "quiesce:' || true)
    [ "${n:-0}" -eq 0 ] && ok "no unstamped 'echo \"quiesce:' lines remain" \
                        || bad "$n unstamped echo \"quiesce:\" line(s) — use say"
fi

[ "$fail" -eq 0 ] && echo "PASS: quiesce order and zombie-aware wait are pinned" \
                  || echo "FAIL: quiesce-stock.sh regressed"
exit "$fail"
