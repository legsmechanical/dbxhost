#!/usr/bin/env bash
# The GLIBC gate fails when it should — and the build calls it.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
run() { printf '%s\n' "$1" | GLIBC_VERSIONS_FROM_STDIN=1 scripts/check-glibc.sh - 2.35 >/dev/null 2>&1; echo $?; }
ok="                 U memcpy@GLIBC_2.17
                 U fmemopen@GLIBC_2.22
                 U __libc_start_main@GLIBC_2.34"
[ "$(run "$ok")" = "0" ] || { echo "FAIL: versions <= 2.35 were refused" >&2; fail=1; }
[ "$(run "$ok
                 U __isoc23_strtol@GLIBC_2.38")" = "1" ] || { echo "FAIL: GLIBC_2.38 was accepted" >&2; fail=1; }
[ "$(run "                 U x@GLIBC_2.35")" = "0" ] || { echo "FAIL: exactly 2.35 was refused" >&2; fail=1; }
[ "$(run "                 U x@GLIBC_2.36")" = "1" ] || { echo "FAIL: 2.36 was accepted" >&2; fail=1; }
[ "$(run "                 U x@GLIBC_3.0")" = "1" ] || { echo "FAIL: 3.0 was accepted" >&2; fail=1; }
[ "$(run "0000 T nothing_versioned")" = "1" ] || { echo "FAIL: reading NO versions passed (unreadable file = green)" >&2; fail=1; }
grep -q 'scripts/check-glibc.sh "dist/${MODULE_ID}/dsp.so"' scripts/build_sound.sh \
    || { echo "FAIL: build_sound.sh does not call the gate" >&2; fail=1; }
grep -n 'GLIBC' scripts/build_sound.sh | grep -q '|| true' \
    && { echo "FAIL: build_sound.sh still swallows the GLIBC check" >&2; fail=1; }
[ $fail -eq 0 ] && echo "PASS: the GLIBC gate fails on a too-new symbol and on an unreadable file"
exit $fail
