#!/usr/bin/env bash
# The headphone-jack state a host believes at boot (jack_state.h, run in
# test_jack_state.c). Source pins on the wiring, because each failure is silent:
#   - the worker must read STOCK's saved state too, not only its own tree's —
#     a fork's file can be weeks stale (measured: "speaker" since 10-31 with
#     headphones in all along, so the fork told Move "speaker" every launch);
#   - the boot re-assert must set this host's own speaker flag, or
#     host_speaker_active() keeps its boot guess and the feedback question fires
#     with headphones in.
set -u
cd "$(dirname "$0")/../.."
W=src/host/shim_worker.c; S=src/schwung_shim.c
fails=0
check() { local d="$1"; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d" >&2; fails=1; fi; }
code() { grep -vE "^\s*(/\*|\*|//)" "$1"; }
echo "jack state wiring:"
reads_stock() { code "$W" | grep -q '#define JACK_STATE_STOCK_PATH SCHWUNG_STOCK_DIR "/jack_state"' &&
                code "$W" | grep -q 'return jack_state_pick(own, own_t, jack_state_read_one(JACK_STATE_STOCK_PATH, &stock_t), stock_t);' &&
                code "$W" | grep -q 'int boot_jack = jack_state_read();'; }
check "the worker's boot value is the newer of its own and stock's saved state" reads_stock
flag() { code "$S" | awk '/if \(shim_inject_boot_jack >= 0 && shadow_midi_inject_shm\) \{/,/Boot jack re-assert: injected/' > /tmp/jsw.$$;
         grep -q 'if (!shadow_speaker_active_known) {' /tmp/jsw.$$ &&
         grep -q 'if (shadow_control) shadow_control->speaker_active = (uint8_t)sp;' /tmp/jsw.$$; local r=$?; rm -f /tmp/jsw.$$; return $r; }
check "the boot re-assert sets this host's speaker flag (unless XMOS spoke first)" flag
[ $fails = 0 ] && echo PASS || { echo FAIL; exit 1; }
