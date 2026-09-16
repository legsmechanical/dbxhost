#!/usr/bin/env bash
# Compile and run every tests/test_*.c natively. No Docker.
set -u
cd "$(dirname "$0")/.." || exit 2   # the davebox tree (a subtree of dbxhost)

CC="${CC:-clang}"
# _GNU_SOURCE: seq8.c uses fmemopen (state_full serialization), which glibc
# hides under strict -std=c11 without a feature macro — macOS clang exposes it
# regardless, so this only ever failed in Linux CI, not locally.
# SEQ8_TESTING: compiles the test-only seams (currently pa_test_midscan_hook,
# which lets a test run a store write in the middle of an audio-thread pass —
# a race single-threaded code cannot otherwise produce). The logic under test
# is identical either way; the shipped build has no hook.
FLAGS="-std=c11 -D_GNU_SOURCE -DSEQ8_TESTING -Idsp -Itests/harness -Wall -Wno-unused-function -g"
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
# ⚠ An empty suite is not a green suite. If the glob collected nothing the loop
# never ran, both counters are 0, and every check below still reports PASS - a
# result indistinguishable from a clean run. Say so instead.
if [ "$pass" -eq 0 ] && [ "$fail" -eq 0 ]; then
    echo "FAIL: collected NO tests/test_*.c - the suite did not run" >&2
    fail=1
fi

js_fail=0
if command -v node >/dev/null 2>&1; then
    if tests/js/run.sh; then
        echo "JS: PASS"
    else
        echo "JS: FAIL"
        js_fail=1
    fi
elif [ "${DBX_ALLOW_MISSING_TOOLS:-0}" = "1" ]; then
    echo "JS: SKIPPED (node not found, DBX_ALLOW_MISSING_TOOLS=1)" >&2
else
    echo "FAIL: node not found - the JS units cannot run" >&2
    echo "      Install node, or set DBX_ALLOW_MISSING_TOOLS=1 to skip deliberately." >&2
    js_fail=1
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
elif [ "${DBX_ALLOW_MISSING_TOOLS:-0}" = "1" ]; then
    echo "WEB UI: SKIPPED (node not found, DBX_ALLOW_MISSING_TOOLS=1)" >&2
else
    echo "FAIL: node not found - web_ui_*.js cannot be syntax-checked" >&2
    echo "      A syntax error there is only visible as a dead page on the device." >&2
    web_fail=1
fi

# Repo-invariant shell checks (no compilation, no device). These pin conventions
# whose breakage is silent — e.g. a release overwriting the frozen legacy manual.
sh_fail=0
for t in tests/test_*.sh; do
    [ -f "$t" ] || continue
    if bash "$t"; then :; else echo "FAIL: $(basename "$t")"; sh_fail=1; fi
done

[ "$fail" -eq 0 ] && [ "$js_fail" -eq 0 ] && [ "$web_fail" -eq 0 ] && [ "$sh_fail" -eq 0 ]
