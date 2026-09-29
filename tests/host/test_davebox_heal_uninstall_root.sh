#!/usr/bin/env bash
# tests/host/test_davebox_heal_uninstall_root.sh — davebox-heal --uninstall-root
# and the uninstaller's HEAL_UNINSTALL_ONLY build (2026-09-27).
#
# Built NATIVELY with -DHEAL_TESTING (skips the setuid/root gate), every path
# redirected into a temp dir, systemctl replaced by a stub that logs its argv.
# "Sets bound" is simulated with a symlink: sets_is_bound() compares inodes
# through stat(), which follows it — and umount() on a symlink fails, which is
# exactly the "cannot unbind" case the ordering must survive.
# Linux only — the source uses mount(2)/umount2(2); macOS cannot compile it.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: mount(2) in the source)"; exit 0; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cat > "$T/systemctl" <<'STUB'
#!/bin/sh
echo "$*" >> "$(dirname "$0")/systemctl.log"
STUB
chmod +x "$T/systemctl"
build() {  # $1 = output, rest = extra flags
    out="$1"; shift
    gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -D_GNU_SOURCE -Wall -Wextra -Werror \
        -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
        -DSYSTEMCTL="\"$T/systemctl\"" -DRESTORE_UNIT_PATH="\"$T/etc/davebox-restore.service\"" \
        -DRESTORE_WANTS_PATH="\"$T/etc/wants/davebox-restore.service\"" \
        -DDST_SHIM="\"$T/usr/davebox-shim.so\"" -DSETS_DIR="\"$T/Sets\"" -DSETTINGS_DIR="\"$T/settings\"" \
        "$@" -o "$out" standalone/src/davebox-heal.c
}
build "$T/heal-full" || { echo "FAIL: build (full)"; exit 1; }
build "$T/heal-un" -DHEAL_UNINSTALL_ONLY || { echo "FAIL: build (uninstall-only)"; exit 1; }
installed() {  # a device with everything an install leaves in root-owned places
    rm -rf "$T/etc" "$T/usr" "$T/Sets" "$T/settings" "$T/dbx"; : > "$T/systemctl.log"
    mkdir -p "$T/etc/wants" "$T/usr" "$T/dbx/sets/library" "$T/Sets" "$T/dbx/settings" "$T/settings"
    echo '{"theirs":1}' > "$T/settings/Settings.json"
    echo unit > "$T/etc/davebox-restore.service"
    ln -s ../davebox-restore.service "$T/etc/wants/davebox-restore.service"
    echo shim > "$T/usr/davebox-shim.so"
    echo "their set" > "$T/Sets/mine.txt"
}

for bin in heal-full heal-un; do
    echo "$bin --uninstall-root:"
    installed
    "$T/$bin" --uninstall-root 2>"$T/err"; rc=$?
    [ "$rc" = 0 ] && ok "returns 0" || bad "rc=$rc: $(cat "$T/err")"
    [ ! -e "$T/etc/davebox-restore.service" ] && ok "the restore unit is removed" || bad "unit left"
    [ ! -L "$T/etc/wants/davebox-restore.service" ] && ok "its wants link is removed" || bad "wants link left"
    [ ! -e "$T/usr/davebox-shim.so" ] && ok "the mirrored shim is removed" || bad "shim left"
    grep -qx "disable davebox-restore.service" "$T/systemctl.log" && ok "systemctl disable davebox-restore.service" || bad "no disable: $(cat "$T/systemctl.log")"
    grep -qx "daemon-reload" "$T/systemctl.log" && ok "systemctl daemon-reload" || bad "no daemon-reload"
    [ "$(wc -l < "$T/systemctl.log")" = 2 ] && ok "exactly two systemctl calls" || bad "calls: $(cat "$T/systemctl.log")"
    [ "$(cat "$T/Sets/mine.txt")" = "their set" ] && ok "the user's Sets are untouched" || bad "Sets touched"

    echo "$bin, run again (idempotent):"
    : > "$T/systemctl.log"
    "$T/$bin" --uninstall-root 2>"$T/err"; rc=$?
    [ "$rc" = 0 ] && ok "returns 0 with nothing left to remove" || bad "rc=$rc: $(cat "$T/err")"
    [ ! -s "$T/systemctl.log" ] && ok "no systemctl calls when the unit is already gone" || bad "calls: $(cat "$T/systemctl.log")"

    echo "$bin, a dangling wants link with no unit file:"
    installed; rm "$T/etc/davebox-restore.service"
    "$T/$bin" --uninstall-root 2>/dev/null; rc=$?
    [ "$rc" = 0 ] && [ ! -L "$T/etc/wants/davebox-restore.service" ] && ok "the orphan link is removed" || bad "rc=$rc, link $(ls -la "$T/etc/wants")"

    echo "$bin, Sets still bound and cannot be unbound:"
    installed; rm -rf "$T/Sets"; ln -s "$T/dbx/sets/library" "$T/Sets"
    "$T/$bin" --uninstall-root 2>"$T/err"; rc=$?
    [ "$rc" = 2 ] && ok "fails (rc 2)" || bad "rc=$rc"
    grep -q "removing nothing else" "$T/err" && ok "says why" || bad "no reason: $(cat "$T/err")"
    [ -e "$T/etc/davebox-restore.service" ] && [ -e "$T/usr/davebox-shim.so" ] && [ ! -s "$T/systemctl.log" ] \
        && ok "the restore unit and shim are KEPT while our library may be over the user's" || bad "removed things with Sets bound"

    echo "$bin, settings still bound and cannot be unbound:"
    installed; rm -rf "$T/settings"; ln -s "$T/dbx/settings" "$T/settings"
    "$T/$bin" --uninstall-root 2>"$T/err"; rc=$?
    [ "$rc" = 2 ] && grep -q "settings still bound — removing nothing else" "$T/err" && ok "fails, and says why" || bad "rc=$rc: $(cat "$T/err")"
    [ -e "$T/etc/davebox-restore.service" ] && [ -e "$T/usr/davebox-shim.so" ] && [ ! -s "$T/systemctl.log" ] \
        && ok "the restore unit and shim are KEPT while our settings may be over the user's" || bad "removed things with settings bound"

    echo "$bin --umount-settings with nothing bound:"
    installed
    "$T/$bin" --umount-settings 2>"$T/err"; rc=$?
    [ "$rc" = 0 ] && grep -q "settings not bound — nothing to undo" "$T/err" && ok "success, nothing to undo" || bad "rc=$rc: $(cat "$T/err")"
    [ "$(cat "$T/settings/Settings.json")" = '{"theirs":1}' ] && ok "the user's settings are untouched" || bad "settings touched"
done

echo "heal-full --mount-settings:"
installed; rm -rf "$T/dbx/settings"
"$T/heal-full" --mount-settings 2>"$T/err"; rc=$?
[ "$rc" = 2 ] && grep -q "dbx/settings missing or not a directory — refusing to mount" "$T/err" \
    && ok "refuses when the session's settings folder is missing" || bad "rc=$rc: $(cat "$T/err")"
installed; rm -rf "$T/settings"; ln -s "$T/dbx/settings" "$T/settings"
"$T/heal-full" --mount-settings 2>"$T/err"; rc=$?
[ "$rc" = 0 ] && grep -q "settings already bound — nothing to do" "$T/err" \
    && ok "already bound: success, no second mount" || bad "rc=$rc: $(cat "$T/err")"

echo "the uninstall-only build refuses every install verb:"
for v in --mount-sets --mount-settings --pause-launcher --resume-launcher --install-restore-unit ""; do
    installed; : > "$T/systemctl.log"
    if [ -n "$v" ]; then "$T/heal-un" "$v" 2>/dev/null; else "$T/heal-un" 2>/dev/null; fi; rc=$?
    [ "$rc" = 1 ] && [ ! -s "$T/systemctl.log" ] && [ -e "$T/usr/davebox-shim.so" ] \
        && ok "'${v:-<none>}' refused, nothing done" || bad "'${v:-<none>}' rc=$rc"
done
installed; rm -rf "$T/heal"; mkdir -p "$T/heal"; echo new > "$T/heal/heal.new"
"$T/heal-un" --uninstall-root 2>/dev/null
[ -f "$T/heal/heal.new" ] && [ ! -e "$T/heal/heal" ] && ok "no self-update in the uninstall build" || bad "it self-updated"
nm "$T/heal-un" | grep -q -E " (copy_atomic|sets_mount|settings_mount|install_restore_unit)$" \
    && bad "install-only code is compiled into the uninstall build" || ok "install-only code is not compiled in"
nm "$T/heal-full" | grep -q " sets_mount$" && ok "(positive control: the full build has sets_mount)" || bad "nm control failed"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
