#!/usr/bin/env bash
# tests/host/test_davebox_heal_no_follow.sh — copy_atomic() runs as root with
# BOTH ends in directories ableton can write (the staged self-update in the
# module's bin/, the shim source under DBX_DIR), so it must never follow a
# symlink on either end:
#   - a link planted at <dst>.heal-tmp made root truncate, write and
#     fchmod 04755 whatever it pointed at;
#   - a link at the SOURCE made root copy a file ableton cannot read into a
#     04755 one it can.
# Built natively with -DHEAL_TESTING and every path redirected into a temp dir.
# Linux only (mount(2) in the source). Must run as root for the fchown to
# ableton's uid, as the helper does on the device.
set -u
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname -s)" = Linux ] || { echo "SKIP: $(basename "$0") (Linux-only: mount(2) in the source)"; exit 0; }
[ "$(id -u)" = 0 ] || { echo "SKIP: $(basename "$0") (needs root: the mirror fchowns to uid 1000)"; exit 0; }
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx" "$T/heal" "$T/usr"
build() {
    gcc -O0 -std=c11 -D_POSIX_C_SOURCE=200809L -D_GNU_SOURCE -Wall -Wextra -Werror \
        -DHEAL_TESTING -DDBX_DIR="\"$T/dbx\"" -DHEAL_DIR="\"$T/heal\"" \
        -DDST_SHIM="\"$T/usr/davebox-shim.so\"" -DSYSTEMCTL=\"/bin/true\" \
        -o "$1" standalone/src/davebox-heal.c || { echo "FAIL: build"; exit 1; }
}
build "$T/heal-bin"
DST="$T/usr/davebox-shim.so"

echo "tmp planted as a symlink:"
echo "the new shim" > "$T/dbx/schwung-shim.so"
echo "precious" > "$T/victim"; chmod 0600 "$T/victim"
ln -s "$T/victim" "$DST.heal-tmp"
"$T/heal-bin" 2>"$T/err1"; rc=$?
[ "$(cat "$T/victim")" = precious ] && ok "the link's target is not written" || bad "victim overwritten: $(cat "$T/victim")"
[ "$(stat -c %a "$T/victim")" = 600 ] && ok "the link's target keeps its mode" || bad "victim mode now $(stat -c %a "$T/victim")"
[ "$rc" = 0 ] && cmp -s "$DST" "$T/dbx/schwung-shim.so" && ok "the shim is still mirrored (the planted link is removed, not obeyed)" || bad "rc=$rc, mirror missing: $(cat "$T/err1")"
[ "$(stat -c %a "$DST")" = 4755 ] && ok "mirrored shim is 04755" || bad "mode $(stat -c %a "$DST")"

echo "source is a symlink:"
rm -f "$DST" "$T/dbx/schwung-shim.so"
echo "root-only secret" > "$T/secret"; chmod 0600 "$T/secret"
ln -s "$T/secret" "$T/dbx/schwung-shim.so"
"$T/heal-bin" 2>/dev/null; rc=$?
[ "$rc" != 0 ] && ok "refused (rc=$rc)" || bad "returned 0"
{ [ ! -e "$DST" ] || ! cmp -s "$DST" "$T/secret"; } && ok "the secret is not copied out" || bad "secret copied to $DST"

echo "staged self-update is a symlink:"
rm -f "$T/dbx/schwung-shim.so"; echo "the new shim" > "$T/dbx/schwung-shim.so"
echo "old heal" > "$T/heal/heal"
ln -s "$T/secret" "$T/heal/heal.new"
"$T/heal-bin" 2>/dev/null
[ "$(cat "$T/heal/heal")" = "old heal" ] && ok "a linked heal.new is not installed" || bad "heal replaced by the link target"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
