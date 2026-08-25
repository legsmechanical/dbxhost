#!/usr/bin/env bash
# The skipback rolling buffer must never be allocated on the audio callback.
#
# Until 2026-08-25 it was: skipback_init() ran from BOTH RT capture sites (the
# pre-ioctl mix and the post-ioctl Move-Input path), every block. It early-
# returned once the buffer existed, so the cost was one-shot — but that one shot
# landed inside a 900 us deadline the moment Resample capture first engaged, and
# it was a calloc() of 5.3 MB (53 MB at the 300 s max) plus a log call that takes
# a mutex and fflush()es to eMMC. Allocation and file I/O on SCHED_FIFO 90.
#
# This is a SOURCE pin, deliberately. The failure is silent by construction: the
# audio still works, the buffer still gets made, and the only symptom is a stall
# at a moment nobody is watching a profiler. Nothing else in the suite would
# notice the call coming back.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
SAMP=src/host/shadow_sampler.c
HDR=src/host/shadow_sampler.h
for f in "$SHIM" "$SAMP" "$HDR"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

echo "skipback allocation stays off the RT path:"

# 1. The old name must not come back anywhere callable. Comments may cite it
#    (the history is the point), so only look at code lines.
no_init_calls() {
    ! grep -rn "skipback_init" "$SHIM" "$SAMP" "$HDR" \
        | grep -vE "^\s*[^:]+:[0-9]+:\s*[*/]" \
        | grep -q "skipback_init *("
}
check "skipback_init() has no call sites left (renamed, not wrapped)" no_init_calls

# 2. The allocator is called exactly once, and from startup — not either RT site.
prepare_called_once() {
    [ "$(grep -c "skipback_prepare(skipback_seconds_setting)" "$SHIM")" = "1" ]
}
check "skipback_prepare() is called exactly once in the shim" prepare_called_once

# 3. ⭑ The property that matters: neither RT capture site allocates. Both call
#    skipback_capture() and nothing that can reach calloc.
rt_sites_capture_only() {
    local n
    n=$(grep -n "skipback_capture(" "$SHIM" | wc -l | tr -d ' ')
    [ "$n" = "2" ] || return 1
    # ⚠ Strip COMMENT lines first. The first cut of this check did not, matched
    # the explanatory comment above each call site ("the buffer is allocated at
    # startup by skipback_prepare()"), and failed against correct code. A
    # source pin must read code, not prose.
    ! grep -B4 "skipback_capture(" "$SHIM" \
        | grep -vE "^\s*[-0-9]*[-:]?\s*[*/]" \
        | grep -q "skipback_prepare *(\|skipback_init *(\|calloc *("
}
check "both RT capture sites call skipback_capture() only" rt_sites_capture_only

# 4. The allocator must publish the pointer with a release-store, because the
#    audio thread now reads a pointer another thread wrote. Without it, capture
#    could pair a live pointer with a length not yet visible.
publishes_with_release() {
    grep -A40 "^void skipback_prepare" "$SAMP" \
        | grep -q "__atomic_store_n(&skipback_buffer, buf, __ATOMIC_RELEASE)"
}
check "skipback_prepare() publishes the buffer with a RELEASE store" publishes_with_release

# 5. ...and the reader must acquire-load it. Half the pair is no pair.
reads_with_acquire() {
    grep -A12 "^void skipback_capture" "$SAMP" \
        | grep -q "__atomic_load_n(&skipback_buffer, __ATOMIC_ACQUIRE)"
}
check "skipback_capture() ACQUIRE-loads the buffer pointer" reads_with_acquire

# 6. Capture must not resurrect the buffer itself — if it is not ready, it
#    declines the block. This is what makes (3) safe rather than merely tidy.
capture_never_allocates() {
    ! grep -A25 "^void skipback_capture" "$SAMP" | grep -q "calloc\|malloc\|realloc"
}
check "skipback_capture() never allocates — it declines the block" capture_never_allocates

if [ "$fails" = "0" ]; then
    echo "PASS: skipback allocation is off the audio callback"
else
    echo "FAIL: skipback allocation pin broken" >&2
fi
exit "$fails"
