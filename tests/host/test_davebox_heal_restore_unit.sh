#!/usr/bin/env bash
# tests/host/test_davebox_heal_restore_unit.sh — davebox-heal --install-restore-unit
# (2026-09-05): the boot-recovery unit is written by the helper itself, so a
# zero-SSH install has no root step left once stock's heal has blessed it.
#
# Built NATIVELY with -DHEAL_TESTING (skips the setuid/root gate) and every path
# redirected into a temp dir, systemctl replaced by a stub that logs its argv.
# Linux only — the source uses mount(2)/umount2(2); macOS cannot compile it.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: mount(2) in the source)"; exit 0; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx/scripts" "$T/heal" "$T/unit"
cat > "$T/systemctl" <<'STUB'
#!/bin/sh
echo "$*" >> "$(dirname "$0")/systemctl.log"
STUB
chmod +x "$T/systemctl"
gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -D_GNU_SOURCE -Wall -Wextra -Werror \
    -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
    -DSYSTEMCTL="\"$T/systemctl\"" -DRESTORE_UNIT_PATH="\"$T/unit/davebox-restore.service\"" \
    -o "$T/heal-bin" standalone/src/davebox-heal.c || { echo "FAIL: build"; exit 1; }

echo "davebox-heal --install-restore-unit:"
"$T/heal-bin" --install-restore-unit 2>"$T/err1"; rc=$?
[ "$rc" = 0 ] && ok "returns 0" || { bad "rc=$rc: $(cat "$T/err1")"; }
U="$T/unit/davebox-restore.service"
[ -f "$U" ] && ok "the unit file is written" || bad "no unit file"
grep -q "^ExecStart=/bin/sh $T/dbx/scripts/set-swap.sh recover$" "$U" && ok "ExecStart runs set-swap.sh recover under DBX_DIR" || bad "ExecStart wrong: $(grep ExecStart "$U")"
grep -q "^ConditionPathExists=$T/dbx/scripts/set-swap.sh$" "$U" && ok "ConditionPathExists points at the payload" || bad "ConditionPathExists wrong"
grep -q "^User=ableton$" "$U" && ok "the unit runs as ableton (root only writes it)" || bad "User line"
grep -q "^Before=move-launcher.service$" "$U" && ok "ordered before the launcher" || bad "Before line"
grep -qx "daemon-reload" "$T/systemctl.log" && ok "systemctl daemon-reload" || bad "no daemon-reload: $(cat "$T/systemctl.log")"
grep -qx "enable davebox-restore.service" "$T/systemctl.log" && ok "systemctl enable davebox-restore.service" || bad "no enable"
[ "$(wc -l < "$T/systemctl.log")" = 2 ] && ok "exactly two systemctl calls, hardcoded argv" || bad "systemctl calls: $(cat "$T/systemctl.log")"
grep -q "wrote" "$T/err1" && ok "reports the write" || bad "no write report"

echo "idempotent:"
cp "$U" "$T/unit.first"
"$T/heal-bin" --install-restore-unit 2>"$T/err2"; rc=$?
[ "$rc" = 0 ] && ok "second run returns 0" || bad "second run rc=$rc"
cmp -s "$U" "$T/unit.first" && ok "content unchanged" || bad "content changed on a no-op run"
grep -q "wrote" "$T/err2" && bad "rewrote an identical unit" || ok "an identical unit is not rewritten"

echo "repair:"
echo "garbage" > "$U"
"$T/heal-bin" --install-restore-unit 2>/dev/null
cmp -s "$U" "$T/unit.first" && ok "a corrupted unit is rewritten to the constant text" || bad "corrupted unit left in place"

echo "closed set:"
"$T/heal-bin" --install-restore-unit-please 2>/dev/null; [ $? = 1 ] && ok "an unknown flag is refused" || bad "unknown flag accepted"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
