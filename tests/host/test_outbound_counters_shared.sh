#!/usr/bin/env bash
# THE OUTBOUND COUNTERS MUST BE SHARED, NOT PER-TRANSLATION-UNIT.
#
# ui_midi_out_carry.h declares its counters `static`, which is right for a
# header full of inline helpers and fatal for a counter: every translation unit
# including it gets ITS OWN COPY. shadow_midi.c (which drains) incremented its
# copies while shim_worker.c (which logs) read its own, so every one of them
# reported zero forever.
#
# That is worse than no instrument. On 2026-09-11 it produced three consecutive
# "clean" windows -- zero foreign packets, zero stranded, zero placed -- during
# a capture where the screen was visibly garbling, and very nearly became the
# conclusion "our side is provably clean, report it to the vendor".
#
# So each counter is published through a real global, the way
# shim_ui_midi_out_drops already was, and this fails if a new one is added
# without doing the same.
set -euo pipefail
cd "$(dirname "$0")/../.."

fails=0
fail() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }

# THIS FORK's layout: declared in shadow_midi.h (which the reporter,
# schwung_shim.c, includes), defined ONCE and published in shadow_midi.c (the
# TU that drains), reported on the shim's 5 s spi_timing line. `stranded` is
# named `repeated` here: what it counts is our packet still in the mailbox a
# frame later, cleared so it is not sent twice.
for name in placed repeated foreign drops retries unretryable; do
    g="shim_ui_midi_out_${name}"
    grep -q "extern volatile uint32_t ${g};" src/host/shadow_midi.h \
      || fail "${g} is not declared in shadow_midi.h -- the reporter cannot see it"
    grep -q "^volatile uint32_t ${g} = 0;" src/host/shadow_midi.c \
      || fail "${g} has no single definition -- a per-TU static always reads zero"
    grep -q "    ${g} = " src/host/shadow_midi.c \
      || fail "${g} is never published from the TU that drains, so it stays zero"
    grep -q "${g}" src/schwung_shim.c \
      || fail "${g} is never reported"
done

# And no other TU may read the header's statics: only shadow_midi.c includes
# the carry, and the reporter reads the globals.
for f in src/schwung_shim.c src/host/shim_worker.c; do
    if grep -q "ui_midi_carry_[a-z_]*_count()" "$f"; then
        fail "$f reads a ui_midi_carry_*_count() -- that is its OWN zeroed copy of a header static"
    fi
done
others=$(grep -rl '#include "ui_midi_out_carry.h"\|#include "host/ui_midi_out_carry.h"' src | grep -v 'src/host/shadow_midi.c' || true)
[ -z "$others" ] || fail "the carry header is included elsewhere ($others) -- its counters would fork"

[ "$fails" -eq 0 ] || { echo "$fails check(s) failed" >&2; exit 1; }
echo "PASS: outbound counters are shared globals, not per-TU statics"
