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

# ---- WARP's stretcher: Bungee (C++) behind dsp/seq8_stretch.h ----------------
# Built once into a static library every test links (each test contains seq8.c,
# which calls the shim). Cached by a hash of its sources, so the cold ~30-60 s
# build happens only when third_party or the shim changes. Same defines as
# scripts/build_sound.sh. A missing C++ compiler is a FAILURE, not a skip.
CXX="${CXX:-clang++}"
case "$(uname)" in Darwin) CXXLIB="-lc++" ;; *) CXXLIB="-lstdc++ -lm" ;; esac
BUNGEE_LIB="$OUT/libbungee.a"
if ! command -v "$CXX" >/dev/null 2>&1; then
    echo "FAIL: $CXX not found - Bungee (WARP) cannot be built, so no test can link" >&2
    exit 1
fi
bungee_stamp="$(cat dsp/seq8_stretch.h dsp/seq8_stretch.cpp $(find dsp/third_party -type f | LC_ALL=C sort) | cksum) $CXX"
if [ ! -f "$BUNGEE_LIB" ] || [ "$(cat "$BUNGEE_LIB.stamp" 2>/dev/null)" != "$bungee_stamp" ]; then
    echo "Building Bungee for the tests (cached until its sources change)..."
    bobj="$OUT/bungee-obj"; rm -rf "$bobj" "$BUNGEE_LIB"; mkdir -p "$bobj"
    TP=dsp/third_party
    BDEF="-DNDEBUG -DBUNGEE_VISIBILITY= -DBUNGEE_SELF_TEST=0 -Deigen_assert=BUNGEE_ASSERT1 -DEIGEN_DONT_PARALLELIZE=1 -DBUNGEE_VERSION=\"ableton-c9cd42d\""
    BINC="-I$TP/bungee -I$TP/eigen -I$TP/pffft -I$TP"
    bfail=0
    for f in "$TP"/pffft/pffft.c "$TP"/pffft/fftpack.c; do
        "$CC" -O2 -c "$f" -o "$bobj/$(basename "$f" .c).o" 2>> "$OUT/bungee.build.log" || bfail=1
    done
    for f in "$TP"/bungee/src/*.cpp dsp/seq8_stretch.cpp; do
        "$CXX" -std=c++20 -O2 -fwrapv $BDEF $BINC -c "$f" -o "$bobj/$(basename "$f" .cpp).o" 2>> "$OUT/bungee.build.log" &
    done
    wait
    [ "$(ls "$bobj"/*.o 2>/dev/null | wc -l)" -eq "$(( $(ls "$TP"/bungee/src/*.cpp | wc -l) + 3 ))" ] || bfail=1
    if [ "$bfail" -ne 0 ] || ! ar rcs "$BUNGEE_LIB" "$bobj"/*.o; then
        echo "FAIL: Bungee did not build:"; cat "$OUT/bungee.build.log"; rm -f "$BUNGEE_LIB"; exit 1
    fi
    echo "$bungee_stamp" > "$BUNGEE_LIB.stamp"
fi

# ---- every unit, N at a time (tests/harness/pool.sh) --------------------------
# C units, JS units and shell invariants share ONE pool, so no kind waits on
# another's slowest unit. Each unit writes its own files under a PER-TREE
# directory: a shared one would let two worktrees' suites overwrite each other's
# binaries mid-run (the JS runner paid for that 2026-09-05). Results are then
# printed per kind, in glob order, exactly as the serial loops printed them.
. tests/harness/pool.sh
TREE_ID="$(printf %s "$PWD" | cksum | cut -d" " -f1)"
pool_start "$OUT/run-$TREE_ID"
export CC FLAGS BUNGEE_LIB CXXLIB
pool_ccache_init "$OUT/ccache" "$CXXLIB|$(cksum < "$BUNGEE_LIB")"

shopt -s nullglob
c_names=(); sh_names=(); js_names=(); units=(); failed=()
# ⚠ C units that wait on a REAL THREAD are built in the pool but RUN AFTER IT,
# one at a time. They poll the audio loader / stretcher thread with a fixed
# budget of iterations x 1 ms sleeps (~2-4 s), sized for a quiet machine. With
# every core busy compiling, that thread can be starved past the budget: on
# 2026-11-15 test_slicer_warp failed "the retired copy was never freed (a leak)"
# in one of ~12 full-width runs, and passed alone every time. Run alone they
# cost ~7 s. Picked out by what their source calls (usleep / nanosleep /
# pthread_create — every thread-waiting unit does), so a new one is caught
# without a list to maintain.
solo_names=()
for t in tests/test_*.c; do
    n="$(basename "$t" .c)"; c_names+=("$n")
    if grep -qE 'usleep|nanosleep|pthread_create' "$t"; then
        solo_names+=("$n"); units+=("cb:$n")
    else
        units+=("c:$n")
    fi
done
for t in tests/test_*.sh; do sh_names+=("$(basename "$t" .sh)"); units+=("sh:$(basename "$t" .sh)"); done

# The JS units need their bundles first: one esbuild call (~2 s), before the
# pool. A missing node is a FAILURE unless DBX_ALLOW_MISSING_TOOLS=1.
have_node=0; command -v node >/dev/null 2>&1 && have_node=1
js_built=0
if [ "$have_node" = 1 ]; then
    # Per tree, the same derivation as tests/js/run.sh and run-one.sh.
    export DAVEBOX_JS_TEST_DIR="${DAVEBOX_JS_TEST_DIR:-/tmp/davebox-js-tests-$TREE_ID}"
    mkdir -p "$DAVEBOX_JS_TEST_DIR"
    if node tests/js/build.mjs > "$POOL_DIR/js/build.log" 2>&1; then
        js_built=1
        for t in tests/js/test_*.mjs; do
            js_names+=("$(basename "$t" .mjs)"); units+=("js:$(basename "$t" .mjs)")
        done
    fi
fi

echo "units: ${#c_names[@]} C, ${#js_names[@]} JS, ${#sh_names[@]} shell - $(pool_jobs) at a time;" \
     "${#solo_names[@]} C units that wait on a thread run alone after"
pool_run "$OUT/timings-$TREE_ID" ${units[@]+"${units[@]}"}
pool_run_solo ${solo_names[@]+"${solo_names[@]}"}

# ---- C ------------------------------------------------------------------------
if [ -n "${POOL_CCACHE:-}" ]; then
    # find, not `ls glob`: under nullglob an empty glob makes `ls` list the cwd
    n_cached=$(find "$POOL_DIR/c" -name '*.cached' | wc -l | tr -d ' ')
    echo "C compile cache: $n_cached of ${#c_names[@]} binaries reused (every unit still runs; DBX_TEST_NO_CCACHE=1 compiles all)"
else
    echo "C compile cache: off - every unit compiled"
fi
pass=0; fail=0
for name in ${c_names[@]+"${c_names[@]}"}; do
    rc="$(pool_rc c "$name")"
    case "$rc" in
        build) echo "BUILD FAIL: $name"; cat "$POOL_DIR/c/$name.build.log"
               fail=$((fail+1)); failed+=("$name (build)"); continue ;;
        none)  echo "FAIL: $name (no result - its worker was killed or crashed before finishing)"
               fail=$((fail+1)); failed+=("$name (no result)"); continue ;;
    esac
    cat "$POOL_DIR/c/$name.log"
    pool_note_skips c "$name" "$name"
    if [ "$rc" = 0 ]; then echo "PASS: $name"; pass=$((pass+1))
    else
        [ "$rc" -gt 128 ] && echo "  (killed by signal $((rc - 128)))"
        echo "FAIL: $name"; fail=$((fail+1)); failed+=("$name")
    fi
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
if [ "$have_node" = 1 ]; then
    cat "$POOL_DIR/js/build.log"
    if [ "$js_built" = 1 ]; then
        pool_report_js ${js_names[@]+"${js_names[@]}"}
        echo "JS: $js_npass passed, $js_nfail failed"
        if [ "${#js_names[@]}" -eq 0 ]; then
            echo "FAIL: collected NO tests/js/test_*.mjs - the JS units did not run" >&2
            js_nfail=1
        fi
    else
        echo "FAIL: tests/js/build.mjs - no JS unit could run"; js_nfail=1
    fi
    if [ "$js_nfail" -eq 0 ]; then
        echo "JS: PASS"
    else
        echo "JS: FAIL"; js_fail=1
        [ "$js_built" = 1 ] || failed+=("tests/js/build.mjs")
    fi
elif [ "${DBX_ALLOW_MISSING_TOOLS:-0}" = "1" ]; then
    echo "JS: SKIPPED (node not found, DBX_ALLOW_MISSING_TOOLS=1)" >&2
    echo "  JS units: SKIPPED - node not found, DBX_ALLOW_MISSING_TOOLS=1" >> "$POOL_SKIPS"
else
    echo "FAIL: node not found - the JS units cannot run" >&2
    echo "      Install node, or set DBX_ALLOW_MISSING_TOOLS=1 to skip deliberately." >&2
    js_fail=1; failed+=("JS units (node not found)")
fi

# Remote UI halves: web_ui.html loads web_ui_*.js as plain classic scripts, so a
# syntax error there is only visible as a dead page on the device. node --check
# parses each one as a classic script (they are not modules and must not be).
web_fail=0
if command -v node >/dev/null 2>&1; then
    for f in web_ui_*.js; do
        [ -f "$f" ] || continue
        if node --check "$f"; then echo "PASS: node --check $f"
        else echo "FAIL: node --check $f"; web_fail=1; failed+=("node --check $f"); fi
    done
elif [ "${DBX_ALLOW_MISSING_TOOLS:-0}" = "1" ]; then
    echo "WEB UI: SKIPPED (node not found, DBX_ALLOW_MISSING_TOOLS=1)" >&2
    echo "  web_ui_*.js: SKIPPED - node not found, DBX_ALLOW_MISSING_TOOLS=1" >> "$POOL_SKIPS"
else
    echo "FAIL: node not found - web_ui_*.js cannot be syntax-checked" >&2
    echo "      A syntax error there is only visible as a dead page on the device." >&2
    web_fail=1; failed+=("node --check web_ui_*.js (node not found)")
fi

# Repo-invariant shell checks (no compilation, no device). These pin conventions
# whose breakage is silent — e.g. a release overwriting the frozen legacy manual.
# They ran in the pool above; printed here in glob order.
sh_fail=0
for name in ${sh_names[@]+"${sh_names[@]}"}; do
    rc="$(pool_rc sh "$name")"
    [ -f "$POOL_DIR/sh/$name.log" ] && cat "$POOL_DIR/sh/$name.log"
    pool_note_skips sh "$name" "$name.sh"
    if [ "$rc" = none ]; then
        echo "FAIL: $name.sh (no result - its worker was killed or crashed before finishing)"
        sh_fail=1; failed+=("$name.sh (no result)")
    elif [ "$rc" != 0 ]; then
        echo "FAIL: $name.sh"; sh_fail=1; failed+=("$name.sh")
    fi
done
if [ "${#sh_names[@]}" -eq 0 ]; then
    echo "FAIL: collected NO tests/test_*.sh - the invariants did not run" >&2
    sh_fail=1
fi

# ---- what this run did NOT do, beside the result ------------------------------
# The output above is long and run in parallel; the hook shows only its tail. So
# the failures are named again here, and every skip any unit printed is counted
# and named — a skip otherwise leaves the count identical to a clean run.
echo "==="
n_skip=$(wc -l < "$POOL_SKIPS" | tr -d ' ')
echo "skipped: $n_skip"
[ "$n_skip" -gt 0 ] && cat "$POOL_SKIPS"
if [ "${#failed[@]}" -gt 0 ]; then
    echo "failed: ${#failed[@]}"
    printf '  %s\n' ${failed[@]+"${failed[@]}"}
fi

[ "$fail" -eq 0 ] && [ "$js_fail" -eq 0 ] && [ "$web_fail" -eq 0 ] && [ "$sh_fail" -eq 0 ]
