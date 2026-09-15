#!/usr/bin/env bash
set -euo pipefail

# pserve_emit (src/host/shadow_chain_mgmt.c) used to compute the param-serve
# duration with an unsigned cast applied BEFORE the nanosecond subtraction's
# sign could be accounted for:
#
#   uint64_t us = (uint64_t)(w1.tv_sec - ps->w0.tv_sec) * 1000000ull
#               + (uint64_t)(w1.tv_nsec - ps->w0.tv_nsec) / 1000ull;
#
# When the serve straddled a CLOCK_MONOTONIC second boundary, tv_nsec went
# backwards, the signed difference was negative, and casting to uint64_t
# BEFORE dividing wrapped it to ~1.8e19 -- caught by the 0xFFFFFFFF clamp a
# few lines down and logged as "took 4294967.295 ms", a false param-slow
# alarm on ordinary, fast serves.
#
# The fix: use the already-extracted, already-tested timespec_delta_us()
# helper (src/host/timespec_delta.h, tests/host/test_timespec_delta.c),
# which does the subtraction in signed int64_t nanoseconds and floors
# backwards/zero spans to 0 instead of wrapping.
#
# This is a source-pin, not a unit test: pserve_emit is a static function
# deep inside a large, heavily-dependent .c file with no seam to link it
# standalone. It pins that the fix is actually IN PLACE, plus a positive
# control proving the pin can fail (it fails against the pre-fix source).

cd "$(dirname "$0")/../.."
SRC=src/host/shadow_chain_mgmt.c
HDR=src/host/timespec_delta.h

[ -f "$SRC" ] || { echo "FAIL: $SRC missing" >&2; exit 1; }
[ -f "$HDR" ] || { echo "FAIL: $HDR missing" >&2; exit 1; }

fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }

echo "test_pserve_emit_signed_delta"

# The header include must be present so the helper is reachable.
check "shadow_chain_mgmt.c includes timespec_delta.h" \
    grep -q '#include "timespec_delta.h"' "$SRC"

# pserve_emit's duration line must call the signed-safe helper...
check "pserve_emit computes us via timespec_delta_us(&ps->w0, &w1)" \
    grep -q 'uint64_t us = timespec_delta_us(&ps->w0, &w1);' "$SRC"

# ...and must NOT still contain the old unsigned-cast-before-subtract pattern
# anywhere in the file (the only place it ever appeared).
check "the old '(uint64_t)(...tv_nsec...)' cast pattern is gone from the file" \
    bash -c "! grep -q '(uint64_t)(w1.tv_nsec - ps->w0.tv_nsec)' '$SRC'"

# The extracted helper itself must do the subtraction in signed int64_t
# nanoseconds (the actual fix), not cast an unsigned type before subtracting.
check "timespec_delta_us subtracts tv_nsec as signed int64_t" \
    grep -q 'int64_t ns = (int64_t)(t1->tv_sec - t0->tv_sec) \* 1000000000LL' "$HDR"
check "timespec_delta_us floors non-advancing/backwards spans to 0" \
    grep -q 'if (ns <= 0) return 0;' "$HDR"

# ---- positive control -------------------------------------------------
# Prove this pin can actually fail: it must NOT match against the
# known-buggy expression that shipped before the fix.
BUGGY=$(mktemp)
trap 'rm -f "$BUGGY"' EXIT
cat > "$BUGGY" <<'EOF'
static void pserve_emit(pserve_span_t *ps) {
    struct timespec w1;
    clock_gettime(CLOCK_MONOTONIC, &w1);
    uint64_t us = (uint64_t)(w1.tv_sec - ps->w0.tv_sec) * 1000000ull
                + (uint64_t)(w1.tv_nsec - ps->w0.tv_nsec) / 1000ull;
    if (us < PARAM_SLOW_THRESHOLD_US) return;
}
EOF
check "control: the buggy expression would NOT pass the 'gone' check" \
    bash -c "! (! grep -q '(uint64_t)(w1.tv_nsec - ps->w0.tv_nsec)' '$BUGGY')"
check "control: the buggy source has no timespec_delta_us call" \
    bash -c "! grep -q 'uint64_t us = timespec_delta_us(&ps->w0, &w1);' '$BUGGY'"

[ "$fails" = 0 ] && echo "PASS: pserve_emit_signed_delta" || { echo "FAIL: pserve_emit_signed_delta" >&2; exit 1; }
