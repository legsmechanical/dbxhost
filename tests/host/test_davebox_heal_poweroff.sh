#!/usr/bin/env bash
# tests/host/test_davebox_heal_poweroff.sh — `heal --poweroff` runs exactly
# "/sbin/shutdown -h now" (what Move's own power service runs) and reports its
# failure; the verb takes no argument, and nothing else in the helper calls it.
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
build() { # $1 = shutdown stub exit code
    cat > "$T/shutdown" <<STUB
#!/bin/sh
echo "\$*" >> "$T/shutdown.log"
exit $1
STUB
    chmod +x "$T/shutdown"
    # The REAL build's surface (build-heal.sh): no _GNU_SOURCE. A test built
    # with more than the release has passed against code the release refused.
    gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -Wall -Wextra -Werror \
        -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
        -DSYSTEMCTL="\"$T/systemctl-unused\"" -DSHUTDOWN_BIN="\"$T/shutdown\"" \
        -DDST_SHIM="\"$T/usr/davebox-shim.so\"" -DSHIM_UID="$(id -u)" -DSHIM_GID="$(id -g)" \
        -o "$T/heal-bin" standalone/src/davebox-heal.c || { echo "FAIL: build"; exit 1; }
    : > "$T/shutdown.log"
}

echo "heal --poweroff:"
build 0
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "returns 0 when shutdown accepts" || bad "rc=$rc: $(cat "$T/err")"
[ "$(cat "$T/shutdown.log")" = "-h now" ] && ok "runs shutdown -h now, exactly" || bad "argv: $(cat "$T/shutdown.log")"

build 1
"$T/heal-bin" --poweroff 2>"$T/err"; rc=$?
[ "$rc" = 2 ] && ok "a refused shutdown is an error (2), not success" || bad "rc=$rc"
grep -q "failed" "$T/err" && ok "…and says so" || bad "silent: $(cat "$T/err")"

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
