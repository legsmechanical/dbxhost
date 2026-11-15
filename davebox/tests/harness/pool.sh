# tests/harness/pool.sh — one fixed-width worker pool for the test runners.
# Sourced by tests/run.sh and tests/js/run.sh (and by each worker); not a test —
# the runners glob tests/test_*.sh, which this is not.
#
# WHY. The suite ran one unit at a time: 172 C units compiled (~0.6 s each, every
# one #includes all of dsp/seq8.c) and run serially, then 268 JS bundles, then
# the shell invariants — ~3.5 min, all of it on one core of a 10-core machine.
#
# ⭑ ONE POOL FOR EVERY KIND, not one pool per phase. Run per phase, each phase
# waited on its own slowest unit (a C sweep ~20 s under load, an invariant 10 s)
# with the other cores idle. In one pool, slowest first, those tails overlap and
# the short units fill in around them. The REPORT is still printed per kind and
# in glob order, exactly as the serial runner printed it.
#
# ⚠ BASH 3.2. tests/js/run.sh runs by its #!/bin/bash shebang, which on macOS is
# bash 3.2: no `wait -n`, no `mapfile`, no `declare -A`. So the pool is
# `xargs -P`, which both BSD and GNU xargs have.
#
# ⚠ THE CONTRACT THAT KEEPS A DEAD WORKER FROM VANISHING. A unit leaves its
# output in $POOL_DIR/<kind>/<name>.log and, as its LAST act, its exit status in
# <name>.rc. Results are read from those files, never from xargs' exit status.
# A worker that crashes or is killed before writing .rc leaves NO .rc, and
# pool_rc reports "none", which every report prints as a failure in its own
# words — it cannot read as a pass, and it cannot drop out of the count. (If the
# pool itself is killed, every unit it never started has no .rc either, and is
# named the same way.)
#
# Units are "<kind>:<name>":
#   c:<name>   compile tests/<name>.c and run it   (needs CC FLAGS BUNGEE_LIB CXXLIB)
#   cb:<name>  compile only; pool_run_solo runs it after the pool, alone
#   js:<name>  node $DAVEBOX_JS_TEST_DIR/<name>.js (the bundle tests/js/build.mjs made)
#   sh:<name>  bash tests/<name>.sh
# All run from the davebox tree, which is where both runners cd to.

pool_jobs() {
    if [ -n "${DBX_TEST_JOBS:-}" ]; then echo "$DBX_TEST_JOBS"; return; fi
    getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null \
        || nproc 2>/dev/null || echo 4
}

# pool_unit <kind:name> — run ONE unit (called inside a worker).
pool_unit() {
    local kind=${1%%:*} n=${1#*:} d s rc
    d="$POOL_DIR/$kind"; s=$SECONDS
    case "$kind" in
        c)  pool_build_c "$n" "$d" || { echo build > "$d/$n.rc"; return 0; }
            "$d/$n" > "$d/$n.log" 2>&1 ;;
        cb) d="$POOL_DIR/c"   # build only; pool_run_solo runs it afterwards
            if pool_build_c "$n" "$d"; then : > "$d/$n.built"; else echo build > "$d/$n.rc"; fi
            echo "$((SECONDS - s)) $1" > "$d/$n.secs"
            return 0 ;;
        js) node "$DAVEBOX_JS_TEST_DIR/$n.js" > "$d/$n.log" 2>&1 ;;
        sh) bash "tests/$n.sh" > "$d/$n.log" 2>&1 ;;
        *)  echo "pool: unknown unit kind '$kind'" > "$d/$n.log"; false ;;
    esac
    rc=$?
    echo "$((SECONDS - s)) $1" > "$d/$n.secs"
    echo "$rc" > "$d/$n.rc"
}

# pool_build_c <name> <dir> — build tests/<name>.c into <dir>/<name>.
#
# ⭑ CONTENT-ADDRESSED COMPILE CACHE. Compiling is ~2/3 of the suite's CPU (every
# unit #includes all of dsp/seq8.c), and on a commit that does not touch dsp/
# or tests/*.c every binary would come out the same. So a binary is keyed on a
# hash of EVERYTHING the compiler sees: the unit's fully PREPROCESSED source
# (`$CC -E` — every #included byte, so a change to any header or to seq8.c is a
# new key), plus $POOL_CKEY (compiler version, flags, the preprocessed harness
# sources, the Bungee library's own checksum). A key that matches is the same
# compile; there is no mtime and no file list to go stale. The unit still RUNS
# every time — only the compile is reused — and the runner prints how many
# were. DBX_TEST_NO_CCACHE=1 compiles everything.
#
# The cache lives in $POOL_CCACHE, shared by every tree (a content key cannot
# collide across trees), two binaries per unit kept. A hit is HARD-LINKED into
# the run dir, so another tree pruning the cache cannot pull it out from under
# a unit that is about to exec it.
pool_build_c() {
    local n=$1 d=$2 key="" e
    if [ -n "${POOL_CCACHE:-}" ] \
       && $CC $FLAGS -E "tests/$n.c" -o "$d/$n.i" 2>/dev/null; then
        key=$( { echo "$POOL_CKEY"; cat "$d/$n.i"; } | $POOL_SHA | cut -c1-40 )
        rm -f "$d/$n.i"
        e="$POOL_CCACHE/$n.$key"
        if [ -f "$e" ] && { ln -f "$e" "$d/$n" 2>/dev/null || cp -p "$e" "$d/$n"; }; then
            touch "$e" "$d/$n.cached"   # touch: recently used is what pruning keeps
            return 0
        fi
    fi
    rm -f "$d/$n.i"
    $CC $FLAGS "tests/$n.c" tests/harness/stub_host.c tests/harness/compat.c \
        "$BUNGEE_LIB" $CXXLIB -o "$d/$n" > "$d/$n.build.log" 2>&1 || return 1
    if [ -n "$key" ]; then
        # temp + rename: a reader never sees a half-written binary
        cp -p "$d/$n" "$e.$$.tmp" 2>/dev/null && mv -f "$e.$$.tmp" "$e"
        ls -t "$POOL_CCACHE/$n".* 2>/dev/null | grep -v '\.tmp$' | tail -n +3 \
            | while read -r old; do rm -f "$old"; done
    fi
    return 0
}

# pool_ccache_init <dir> <extra key text> — turn the compile cache on (needs
# CC, FLAGS exported). Leaves it off, so everything compiles, when
# DBX_TEST_NO_CCACHE=1 or there is no sha256 tool.
pool_ccache_init() {
    POOL_CCACHE=""; POOL_SHA=""; POOL_CKEY=""
    [ "${DBX_TEST_NO_CCACHE:-0}" = 1 ] && return 0
    if command -v sha256sum >/dev/null 2>&1; then POOL_SHA="sha256sum"
    elif command -v shasum >/dev/null 2>&1; then POOL_SHA="shasum -a 256"
    else return 0; fi
    POOL_CKEY=$( { $CC --version; echo "$FLAGS|$2"
                   $CC $FLAGS -E tests/harness/stub_host.c
                   $CC $FLAGS -E tests/harness/compat.c; } 2>&1 | $POOL_SHA )
    mkdir -p "$1" && POOL_CCACHE=$1
    export POOL_CCACHE POOL_SHA POOL_CKEY
}

# pool_start <dir> — a fresh result tree for one run.
pool_start() {
    POOL_DIR=$1
    rm -rf "$POOL_DIR"; mkdir -p "$POOL_DIR/c" "$POOL_DIR/js" "$POOL_DIR/sh"
    POOL_SKIPS="$POOL_DIR/skips"; : > "$POOL_SKIPS"
    export POOL_DIR POOL_SKIPS
}

# pool_run <timings-file> <kind:name>... — run every unit, $(pool_jobs) at a time,
# slowest-last-time first, so a long sweep starts at once instead of being the
# tail the whole pool waits on. Units with no recorded time (new tests, a first
# run) go first too: they may be slow. Order only affects wall time.
pool_run() {
    local tf=$1; shift
    [ $# -gt 0 ] || return 0
    printf '%s\n' "$@" | awk -v tf="$tf" '
        BEGIN { while ((getline l < tf) > 0) { split(l, a, " "); t[a[2]] = a[1] } }
        { print ((($0 in t) ? t[$0] : 999999) " " $0) }' \
        | sort -k1,1nr -k2 | cut -d" " -f2 | tr '\n' '\0' \
        | xargs -0 -n 1 -P "$(pool_jobs)" \
            bash -c 'bash -c "$0" _ "$1"; exit 0' '. tests/harness/pool.sh && pool_unit "$1"'
    # ⚠ The worker runs as a CHILD of a shell that always exits 0. xargs aborts
    # the whole pool when a command it ran dies by a signal ("terminated with
    # signal 9; aborting"), which turned one killed worker into ~470 "no result"
    # failures. Now only that unit has no .rc, and the rest still run.
    # Next run's order. Written via a temp so a killed run cannot truncate it.
    cat "$POOL_DIR"/*/*.secs > "$tf.new" 2>/dev/null && mv "$tf.new" "$tf"
    return 0   # deliberately: the per-unit .rc files are the result
}

# pool_run_solo <name>... — run C units built by `cb:` one at a time, after the
# pool. A unit whose build failed already has its .rc; one whose worker died
# has neither .built nor .rc, and stays "none".
pool_run_solo() {
    local n d="$POOL_DIR/c"
    for n in "$@"; do
        [ -f "$d/$n.built" ] && [ ! -f "$d/$n.rc" ] || continue
        "$d/$n" > "$d/$n.log" 2>&1
        echo $? > "$d/$n.rc"
    done
}

# pool_rc <kind> <name> — the unit's exit status, "build" (C compile failed), or
# "none" if its worker never finished (see the contract above).
pool_rc() {
    if [ -f "$POOL_DIR/$1/$2.rc" ]; then cat "$POOL_DIR/$1/$2.rc"; else echo none; fi
}

# pool_note_skips <kind> <name> <label> — append any SKIP lines the unit printed
# to $POOL_SKIPS, so the runner can count and name them beside its result.
# Shapes in use: "SKIP: …" (shell invariants) and "  skip — …" (C and JS steps).
pool_note_skips() {
    [ -f "$POOL_DIR/$1/$2.log" ] || return 0
    grep -E '^[[:space:]]*(SKIP\b|skip —)' "$POOL_DIR/$1/$2.log" 2>/dev/null \
        | sed -E "s/^[[:space:]]*/  $3: /" >> "$POOL_SKIPS"
    return 0
}

# pool_report_js <name>... — print the JS units as the serial loop did (each
# one's output, then PASS:/FAIL: <name>.mjs). Sets js_npass / js_nfail and
# appends failures to the caller's `failed` array.
pool_report_js() {
    local n rc
    js_npass=0; js_nfail=0
    for n in "$@"; do
        rc="$(pool_rc js "$n")"
        [ -f "$POOL_DIR/js/$n.log" ] && cat "$POOL_DIR/js/$n.log"
        pool_note_skips js "$n" "$n.mjs"
        if [ "$rc" = 0 ]; then echo "PASS: $n.mjs"; js_npass=$((js_npass+1))
        elif [ "$rc" = none ]; then
            echo "FAIL: $n.mjs (no result - its worker was killed or crashed before finishing)"
            js_nfail=$((js_nfail+1)); failed+=("$n.mjs (no result)")
        else
            echo "FAIL: $n.mjs"; js_nfail=$((js_nfail+1)); failed+=("$n.mjs")
        fi
    done
}
