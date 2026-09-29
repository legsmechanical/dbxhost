#!/usr/bin/env bash
# The web mirror's device view is only true if the shim reads each half at the
# one place it is true:
#
#   LEDs    -- the FINAL MIDI_OUT: the last statement of shim_pre_transfer,
#              after every MIDI_OUT writer, so it is what the XMOS receives.
#   presses -- the RAW MIDI_IN: the top of shim_post_transfer, before any
#              blocking site can swallow an event.
#
# Move either call and the page still draws -- just a DIFFERENT surface from
# the device's, and nothing else in the suite would notice. So this is a source
# pin, plus the realtime rule: the scanners run on SCHED_FIFO 90 and must stay
# free of allocation, file I/O, logging and locks.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
HDR=src/host/surface_live_shm.h
for f in "$SHIM" "$HDR"; do
    [ -f "$f" ] || { echo "FAIL: $f missing" >&2; exit 1; }
done

fails=0
check() { # desc cond...
    local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi
}

# The body of a top-level function: from its signature to the first `}` in
# column 0. Code lines only (comments stripped), so a mention is not a call.
body() {
    awk -v sig="$1" '
        index($0, sig) == 1 { on = 1 }
        on { print }
        on && /^}/ { exit }' "$SHIM" | grep -vE '^\s*(/\*|\*|//)'
}
PRE=$(body "static void shim_pre_transfer(")
POST=$(body "static void shim_post_transfer(")

echo "surface_live call sites:"
check "shim_pre_transfer was found" test -n "$PRE"
check "shim_post_transfer was found" test -n "$POST"

# LEDs: scan_out is the LAST call in shim_pre_transfer -- nothing that could
# still write MIDI_OUT follows it.
last_call_is_scan_out() {
    local tail
    tail=$(printf '%s\n' "$PRE" | grep -nE '[a-z_]+ *\(' | tail -3)
    case "$tail" in *surface_live_scan_out*) ;; *) return 1 ;; esac
    local after
    after=$(printf '%s\n' "$PRE" | awk '/surface_live_scan_out/ { f = 1; next } f' \
            | grep -E '[a-z_]+ *\(' | grep -vE '^\s*(if|while|for) *\(\s*surface_live_shm')
    # Only the call's own continuation line may follow.
    [ -z "$(printf '%s\n' "$after" | grep -v 'MIDI_OUT_OFFSET, HW_MIDI_OUT_SIZE')" ]
}
check "surface_live_scan_out is the last call in shim_pre_transfer (final MIDI_OUT)" last_call_is_scan_out

reads_final_out() {
    local s; s=$(printf '%s\n' "$PRE" | grep -A1 'surface_live_scan_out')
    case "$s" in *"shadow + MIDI_OUT_OFFSET, HW_MIDI_OUT_SIZE"*) return 0 ;; esac
    return 1
}
check "it reads shadow + MIDI_OUT_OFFSET, the whole HW_MIDI_OUT_SIZE" reads_final_out

# Presses: scan_in is the first call after the root span in shim_post_transfer,
# and it reads hw (the raw mailbox), not shadow (already filtered).
first_call_is_scan_in() {
    local first
    first=$(printf '%s\n' "$POST" | grep -E '[a-z_]+ *\(' | grep -vE '^static void|TRACE_SCOPE|\(void\)' | head -2)
    case "$first" in *surface_live_scan_in*) return 0 ;; esac
    return 1
}
check "surface_live_scan_in is the first call in shim_post_transfer (raw MIDI_IN)" first_call_is_scan_in

reads_raw_in() {
    local s; s=$(printf '%s\n' "$POST" | grep -A1 'surface_live_scan_in')
    case "$s" in *"hw + MIDI_IN_OFFSET"*) return 0 ;; esac
    return 1
}
check "it reads hw + MIDI_IN_OFFSET (raw), not shadow" reads_raw_in

echo "surface_live scanners stay realtime-safe:"
CODE=$(grep -vE '^\s*(/\*|\*|//)' "$HDR")
no_rt_hazards() {
    local hits
    hits=$(printf '%s\n' "$CODE" | grep -nE '\b(malloc|calloc|realloc|free|fopen|fprintf|printf|unified_log|LOG_[A-Z]+|pthread_mutex_[a-z]+|shm_open|mmap|open|write|usleep)\s*\(')
    [ -z "$hits" ] || { printf '%s\n' "$hits" >&2; return 1; }
}
check "no allocation, I/O, logging or locks in surface_live_shm.h" no_rt_hazards

[ "$fails" -eq 0 ]
