#!/usr/bin/env bash
# The sampler's source switch is applied on the SPI thread
# (shadow_inprocess_mix_from_buffer) and must not be LOGGED there: a log line
# is an fprintf + fflush, and a push-to-talk take switches the source just as
# the shim worker closes the take's WAV, so the write waits on the disk. On a
# Move with debug logging on that put one frame over the compute budget in
# about one take in four. The logger thread reports it instead.
set -euo pipefail
cd "$(dirname "$0")/../.."
f=src/schwung_shim.c
fail=0

body="$(awk '/^static void shadow_inprocess_mix_from_buffer\(void\) \{/{on=1} on{print} on&&/^\}/{exit}' "$f")"
[ -n "$body" ] || { echo "FAIL: shadow_inprocess_mix_from_buffer() not found"; exit 1; }

if printf '%s\n' "$body" | grep -q 'unified_log('; then
    echo "FAIL: shadow_inprocess_mix_from_buffer() calls unified_log() on the SPI thread:"
    printf '%s\n' "$body" | grep -n 'unified_log('
    fail=1
fi
printf '%s\n' "$body" | grep -q '__atomic_store_n(&sampler_source_log_pending' \
    || { echo "FAIL: the source switch no longer hands its log line to the logger thread"; fail=1; }

logger="$(awk '/^static void \*spi_timing_logger_thread\(void \*arg\)/{on=1} on{print} on&&/^\}/{exit}' "$f")"
printf '%s\n' "$logger" | grep -q '__atomic_exchange_n(&sampler_source_log_pending' \
    && printf '%s\n' "$logger" | grep -q 'sampler source request applied' \
    || { echo "FAIL: spi_timing_logger_thread() does not report the source switch"; fail=1; }

[ $fail = 0 ] && echo "PASS: the sampler source switch is logged off the SPI thread"
exit $fail
