#!/usr/bin/env bash
# A PROJECT SWITCH IS ACTED ON WITHIN ~50 ms OF BEING KNOWN (from upstream #552).
#
# The worker thread decides which set is loaded and publishes a snapshot; the
# SPI path consumes it. It looked once every 500 frames (~1.5 s), so every
# switch waited up to that long for nothing. The look is two volatile reads
# and a memcpy, and a repeat of the same set is dropped by the handler's first
# comparison — so it can be frequent.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
n=$(sed -n 's/^#define SET_SNAPSHOT_CONSUME_FRAMES \([0-9][0-9]*\)$/\1/p' src/schwung_shim.c)
[ -n "$n" ] || fail "SET_SNAPSHOT_CONSUME_FRAMES is not defined as a plain number"
[ "$n" -le 32 ] || fail "the set snapshot is consumed every $n frames (~$((n * 29 / 10)) ms) — a project switch waits on it"
[ "$n" -ge 1 ] || fail "SET_SNAPSHOT_CONSUME_FRAMES must be at least 1"
grep -q 'if (set_poll_counter >= SET_SNAPSHOT_CONSUME_FRAMES) {' src/schwung_shim.c \
    || fail "the consume is not gated on SET_SNAPSHOT_CONSUME_FRAMES"
# The safety the frequency rests on: a repeat is dropped before any work.
first=$(awk '/^void shadow_handle_set_loaded\(/,/^}/' src/host/shadow_set_pages.c | sed -n 1,12p)
printf '%s\n' "$first" | grep -q 'strcmp(sampler_current_set_name, set_name) == 0' \
    || fail "shadow_handle_set_loaded no longer drops a repeat of the same set first"
echo "PASS: the set snapshot is consumed every $n frames"
