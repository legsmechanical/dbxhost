#!/usr/bin/env bash
# Compile and run every tests/test_*.c natively. No Docker.
set -u
cd "$(dirname "$0")/.." || exit 2   # repo root (schwung-davebox/)

CC="${CC:-clang}"
FLAGS="-std=c11 -Idsp -Itests/harness -Wall -Wno-unused-function -g"
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

# Repo-invariant shell checks (no compilation, no device). These pin conventions
# whose breakage is silent — e.g. a release overwriting the frozen legacy manual.
sh_fail=0
for t in tests/test_*.sh; do
    [ -f "$t" ] || continue
    if bash "$t"; then :; else echo "FAIL: $(basename "$t")"; sh_fail=1; fi
done

[ "$fail" -eq 0 ] && [ "$js_fail" -eq 0 ] && [ "$sh_fail" -eq 0 ]
