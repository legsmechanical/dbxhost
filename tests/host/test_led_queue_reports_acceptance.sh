#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# The overtake LED queue must tell its callers that a queued packet was ACCEPTED.
#
# THE CONTRACT. move_midi_internal_send's return value answers "did this packet
# get queued". shared/input_filter.mjs relies on it:
#
#     const sent = move_midi_internal_send([0x09, MidiNoteOn, note, color]);
#     ledCache[note] = sent ? color : -1;
#
# A falsy answer stores -1 so the next draw re-emits. That is correct when a
# write really was refused, and catastrophic when it was not.
#
# THE REGRESSION THIS PINS (device-verified 2026-08-30). activateLedQueue
# replaces move_midi_internal_send during overtake with a batching wrapper that
# holds LED writes last-writer-wins and flushes LED_QUEUE_MAX_PER_TICK of them
# per tick. Its note and CC branches fell off the end of the function, so they
# returned undefined -- telling every caller that every LED write had failed.
#
# The consequence is not a dropped LED, it is a STARVED one. With the cache
# defeated, each painter re-queues every LED it touches on every frame, and
# flushLedQueue walks the queue's integer keys in ASCENDING order. A surface
# that repaints low notes each frame consumes the entire per-tick budget, so
# high notes are never reached at all -- on hardware, a 32-pad picker at notes
# 68..99 stayed dark indefinitely while notes 16..31 were served every tick.
#
# Queueing IS acceptance: the packet is held and will be sent. Say so.

fail() { echo "FAIL: $1" >&2; exit 1; }
file="src/shadow/shadow_ui.js"

# --- structural window: the wrapper installed by activateLagQueue -----------
#
# Bound to the enclosing function, not a line count: a comment added above the
# body must not slide the window off the code under test.
body=$(awk '/^function activateLedQueue\(\)/,/^function deactivateLedQueue\(\)/' "$file")
[ -n "$body" ] || fail "activateLedQueue is gone -- this test no longer measures anything"

# Read CODE, never the prose beside it. Every check below runs on this.
code=$(sed -e 's://.*::' <<<"$body" | perl -0777 -pe 's{/\*.*?\*/}{}gs')

command grep -q "globalThis.move_midi_internal_send = function" <<<"$code" || \
  fail "activateLedQueue no longer installs a move_midi_internal_send wrapper"

# --- the queueing path must report acceptance ------------------------------
#
# Both LED branches store and fall through to a shared truthy return. Assert on
# the STORE-then-return shape rather than counting `return true`, so a stray
# truthy return elsewhere in the function cannot satisfy this.
command grep -q "ledQueueNotes\[arr\[2\]\] =" <<<"$code" || \
  fail "the note-LED branch no longer queues"
command grep -q "ledQueueCCs\[arr\[2\]\] =" <<<"$code" || \
  fail "the CC-LED branch no longer queues"

# Everything after the last queue store, up to the end of the wrapper.
tail_after_store=$(sed -n '/ledQueueCCs\[arr\[2\]\] =/,$p' <<<"$code")
command grep -qE '^\s*return true;' <<<"$tail_after_store" || \
  fail "the LED-queue path does not return a truthy value -- callers will read \
every queued LED write as REFUSED, defeat their LED cache, and starve the high \
notes out of the per-tick flush budget"

# --- the premise, so this design is re-examined rather than rotting --------
#
# If input_filter stops keying its cache on the return value, the pin above is
# still correct but no longer load-bearing, and someone should know.
inp="src/shared/input_filter.mjs"
icode=$(sed -e 's://.*::' "$inp" | perl -0777 -pe 's{/\*.*?\*/}{}gs')
command grep -q "ledCache\[note\] = sent ? color : -1;" <<<"$icode" || \
  fail "input_filter no longer records its LED cache from the send's return \
value -- re-examine whether the wrapper's return contract still matters"

# --- the starvation premise: the flush is ascending and budgeted -----------
flush=$(awk '/^function flushLedQueue\(\)/,/^}/' "$file")
fcode=$(sed -e 's://.*::' <<<"$flush" | perl -0777 -pe 's{/\*.*?\*/}{}gs')
command grep -q "LED_QUEUE_MAX_PER_TICK" <<<"$fcode" || \
  fail "flushLedQueue no longer enforces a per-tick budget -- the starvation \
this contract prevents may have changed shape"

echo "PASS: the overtake LED queue reports queued packets as accepted"
