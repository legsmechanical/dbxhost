#!/usr/bin/env bash
# Compile and run every tests/test_*.c natively. No Docker.
set -u
cd "$(dirname "$0")/.." || exit 2   # the davebox tree (a subtree of dbxhost)

CC="${CC:-clang}"
# _GNU_SOURCE: seq8.c uses fmemopen (state_full serialization), which glibc
# hides under strict -std=c11 without a feature macro — macOS clang exposes it
# regardless, so this only ever failed in Linux CI, not locally.
FLAGS="-std=c11 -D_GNU_SOURCE -Idsp -Itests/harness -Wall -Wno-unused-function -g"
OUT="/tmp/davebox-tests"
mkdir -p "$OUT"

pass=0; fail=0
shopt -s nullglob
for t in tests/test_*.c; do
    name="$(basename "$t" .c)"
    bin="$OUT/$name"
    log="$OUT/$name.build.log"
    if ! $CC $FLAGS "$t" tests/harness/stub_host.c tests/harness/compat.c -o "$bin" 2> "$log"; then
        echo "BUILD FAIL: $name"; cat "$log"; fail=$((fail+1)); continue
    fi
    if "$bin"; then echo "PASS: $name"; pass=$((pass+1)); else echo "FAIL: $name"; fail=$((fail+1)); fi
done
echo "---"
echo "$pass passed, $fail failed"

js_fail=0
if command -v node >/dev/null 2>&1; then
    if tests/js/run.sh; then
        echo "JS: PASS"
    else
        echo "JS: FAIL"
        js_fail=1
    fi
else
    echo "JS: SKIPPED (node not found)"
fi

# Remote UI halves: web_ui.html loads web_ui_*.js as plain classic scripts, so a
# syntax error there is only visible as a dead page on the device. node --check
# parses each one as a classic script (they are not modules and must not be).
web_fail=0
if command -v node >/dev/null 2>&1; then
    for f in web_ui_*.js; do
        [ -f "$f" ] || continue
        if node --check "$f"; then echo "PASS: node --check $f"
        else echo "FAIL: node --check $f"; web_fail=1; fi
    done
else
    echo "WEB UI: SKIPPED (node not found)"
fi

# Repo-invariant shell checks (no compilation, no device). These pin conventions
# whose breakage is silent — e.g. a release overwriting the frozen legacy manual.
sh_fail=0
for t in tests/test_*.sh; do
    [ -f "$t" ] || continue
    if bash "$t"; then :; else echo "FAIL: $(basename "$t")"; sh_fail=1; fi
done

[ "$fail" -eq 0 ] && [ "$js_fail" -eq 0 ] && [ "$web_fail" -eq 0 ] && [ "$sh_fail" -eq 0 ]
