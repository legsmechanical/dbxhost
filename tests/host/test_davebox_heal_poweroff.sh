#!/usr/bin/env bash
# tests/host/test_davebox_heal_poweroff.sh — `heal --poweroff` tells the XMOS
# first ("/opt/move/MoveXmosPower shutdown": power goes within 30 s whatever the
# OS does) and THEN halts the OS ("/sbin/shutdown -h now"). An OS halt alone left
# a Move dark but powered on 2026-10-23. Either failing is reported; both failing
# is an error. The verb takes no argument, and the plain launch run never calls it.
#
# Built NATIVELY with -DHEAL_TESTING (skips the setuid/root gate), the shutdown
# binary replaced by a stub that logs its argv. Linux only — the source uses
# mount(2)/umount2(2); macOS cannot compile it (test-linux.sh runs it).
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: mount(2) in the source)"; exit 0; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx" "$T/heal"
build() { # $1 = shutdown stub exit code, $2 = xmos stub exit code (default 0)
    cat > "$T/shutdown" <<STUB
#!/bin/sh
echo "shutdown \$*" >> "$T/shutdown.log"
exit $1
STUB
    cat > "$T/xmos" <<STUB
#!/bin/sh
echo "xmos \$*" >> "$T/shutdown.log"
exit ${2:-0}
STUB
    chmod +x "$T/shutdown" "$T/xmos"
    # The REAL build's surface (build-heal.sh): no _GNU_SOURCE. A test built
    # with more than the release has passed against code the release refused.
    gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -Wall -Wextra -Werror \
        -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
        -DSYSTEMCTL="\"$T/systemctl-unused\"" -DSHUTDOWN_BIN="\"$T/shutdown\"" -DXMOS_POWER_BIN="\"$T/xmos\"" \
        -DDST_SHIM="\"$T/usr/davebox-shim.so\"" -DSHIM_UID="$(id -u)" -DSHIM_GID="$(id -g)" \
        -o "$T/heal-bin" standalone/src/davebox-heal.c || { echo "FAIL: build"; exit 1; }
    : > "$T/shutdown.log"
}

echo "heal --poweroff:"
build 0
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "returns 0 when shutdown accepts" || bad "rc=$rc: $(cat "$T/err")"
[ "$(cat "$T/shutdown.log")" = "$(printf 'xmos shutdown\nshutdown -h now')" ] \
    && ok "tells the XMOS (MoveXmosPower shutdown), THEN halts (shutdown -h now), exactly" || bad "calls: $(cat "$T/shutdown.log")"

build 1 0
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "the XMOS took it: a refused OS halt still leaves a power-off coming (0)" || bad "rc=$rc"
grep -q "failed" "$T/err" && ok "…and the refusal is reported" || bad "silent: $(cat "$T/err")"

build 0 1
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
grep -q "shutdown -h now" "$T/shutdown.log" && ok "a refused XMOS command does not stop the halt" || bad "no halt: $(cat "$T/shutdown.log")"
grep -q "failed" "$T/err" && ok "…and is reported" || bad "silent: $(cat "$T/err")"

build 1 1
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
[ "$rc" = 2 ] && ok "both refused is an error (2), not success" || bad "rc=$rc"

build 0
"$T/heal-bin" --poweroff now 2>/dev/null; rc=$?
[ "$rc" = 1 ] && [ ! -s "$T/shutdown.log" ] && ok "an extra argument is refused and shuts nothing down" || bad "rc=$rc log=$(cat "$T/shutdown.log")"
"$T/heal-bin" --power-off 2>/dev/null; rc=$?
[ "$rc" = 1 ] && [ ! -s "$T/shutdown.log" ] && ok "a near-miss flag is refused" || bad "rc=$rc"

# The no-argument launch run (every launch) must never reach it.
mkdir -p "$T/usr"; echo shim > "$T/usr/davebox-shim.so"; chmod 4755 "$T/usr/davebox-shim.so"
"$T/heal-bin" 2>/dev/null
[ ! -s "$T/shutdown.log" ] && ok "the plain launch run never powers off" || bad "launch run shut down: $(cat "$T/shutdown.log")"

[ "$fail" = 0 ] && echo "PASS: test_davebox_heal_poweroff" || { echo "FAIL: test_davebox_heal_poweroff"; exit 1; }
