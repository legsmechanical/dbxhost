#!/usr/bin/env bash
# tests/host/test_davebox_heal_retire_restore_unit.sh — the boot-recovery unit is
# RETIRED (2026-09-29): the helper no longer installs it, and its every-launch
# no-argument run removes the one an earlier build left — best effort, never
# refusing the launch over it.
#
# Built NATIVELY with -DHEAL_TESTING (skips the setuid/root gate), every path
# redirected into a temp dir, systemctl replaced by a stub that logs its argv.
# The shim is set up already mirrored (setuid, no newer source), so the only
# thing the no-argument run can do is the retirement under test.
# Linux only — the source uses mount(2)/umount2(2); macOS cannot compile it.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: mount(2) in the source)"; exit 0; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx" "$T/heal"
cat > "$T/systemctl" <<'STUB'
#!/bin/sh
echo "$*" >> "$(dirname "$0")/systemctl.log"
STUB
chmod +x "$T/systemctl"
gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -D_GNU_SOURCE -Wall -Wextra -Werror \
    -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
    -DSYSTEMCTL="\"$T/systemctl\"" -DRESTORE_UNIT_PATH="\"$T/etc/davebox-restore.service\"" \
    -DRESTORE_WANTS_PATH="\"$T/etc/wants/davebox-restore.service\"" \
    -DDST_SHIM="\"$T/usr/davebox-shim.so\"" \
    -o "$T/heal-bin" standalone/src/davebox-heal.c || { echo "FAIL: build"; exit 1; }
U="$T/etc/davebox-restore.service"; W="$T/etc/wants/davebox-restore.service"
device() {  # $1 = with-unit | no-unit
    rm -rf "$T/etc" "$T/usr"; : > "$T/systemctl.log"
    mkdir -p "$T/etc/wants" "$T/usr"
    echo shim > "$T/usr/davebox-shim.so"; chmod 4755 "$T/usr/davebox-shim.so"
    if [ "$1" = with-unit ]; then
        echo unit > "$U"; ln -s ../davebox-restore.service "$W"
    fi
}

echo "a device an earlier build installed the unit on:"
device with-unit
"$T/heal-bin" 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "the launch run returns 0" || bad "rc=$rc: $(cat "$T/err")"
[ ! -e "$U" ] && ok "the unit file is removed" || bad "unit left"
[ ! -L "$W" ] && ok "its wants link is removed" || bad "wants link left"
grep -qx "disable davebox-restore.service" "$T/systemctl.log" && ok "systemctl disable davebox-restore.service" || bad "no disable: $(cat "$T/systemctl.log")"
grep -qx "daemon-reload" "$T/systemctl.log" && ok "systemctl daemon-reload" || bad "no daemon-reload"
[ "$(wc -l < "$T/systemctl.log")" = 2 ] && ok "no other systemctl call" || bad "systemctl calls: $(cat "$T/systemctl.log")"

echo "a device without it (every later launch):"
device no-unit
"$T/heal-bin" 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "returns 0" || bad "rc=$rc: $(cat "$T/err")"
[ ! -s "$T/systemctl.log" ] && ok "no systemctl call at all" || bad "systemctl ran: $(cat "$T/systemctl.log")"
[ ! -s "$T/err" ] && ok "and says nothing" || bad "output: $(cat "$T/err")"

echo "an orphaned wants link (unit already gone):"
device no-unit; ln -s ../davebox-restore.service "$W"
"$T/heal-bin" 2>/dev/null; rc=$?
[ "$rc" = 0 ] && [ ! -L "$W" ] && ok "the link is removed" || bad "rc=$rc, link $(ls -la "$T/etc/wants")"

echo "a unit that cannot be removed never refuses the launch:"
device no-unit; mkdir -p "$U/x"          # a non-empty directory: unlink fails, even as root
"$T/heal-bin" 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && ok "returns 0" || bad "rc=$rc: $(cat "$T/err")"
grep -q "WARNING: could not remove the old davebox-restore.service" "$T/err" && ok "...and says so" || bad "no warning: $(cat "$T/err")"

echo "the install verb is gone:"
device no-unit
"$T/heal-bin" --install-restore-unit 2>"$T/err"; rc=$?
[ "$rc" = 1 ] && grep -q "unknown argument --install-restore-unit" "$T/err" && ok "--install-restore-unit is refused as unknown" || bad "rc=$rc: $(cat "$T/err")"
[ ! -e "$U" ] && ok "...and writes nothing" || bad "a unit was written"
grep -q "RESTORE_UNIT_TEXT\|install_restore_unit" standalone/src/davebox-heal.c && bad "the install code is still in the source" || ok "no install code left in the source"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
