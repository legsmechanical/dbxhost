#!/usr/bin/env bash
set -euo pipefail

# `Slot fx max` must time EVERY path an audio FX chain can run on.
#
# Why this pin exists (2026-08-26). The counter was added around the DEFERRED
# per-slot FX call and reads its name — "Slot fx max(us): s0..s7" — as though it
# prices a slot's FX. It does not, on the path that matters: `skip_deferred_fx`
# skips the deferred call whenever Link Audio is enabled, routing, and any slot
# is live, which is the ordinary case once Move tracks are in play. The chain
# then runs inside the rebuild_from_la branch of
# shadow_inprocess_mix_from_buffer(), which was UNTIMED.
#
# The failure was not academic. A positive control (CAVE loaded and audibly
# processing, MoveOriginal at ~86% of a core for 20 s) left every slot counter
# at 0 for the whole run, and that silence was then read as evidence that "the
# modules were idle, so the saturation is not the DSP" — in TWO separate
# investigations. The cost was inside the la_rebuild mix phase, the very phase
# being blamed. See [[schwung-observable-must-match-the-mechanism]].
#
# So the rule this pins is: every shadow_chain_process_fx() call site is
# bracketed by clock_gettime and feeds spi_slot_fx_max. A new render path added
# later without a timer would silently re-open the same hole.

shim="src/schwung_shim.c"

sites="$(grep -n 'shadow_chain_process_fx(shadow_chain_slots' "$shim" | cut -d: -f1)"
if [ -z "$sites" ]; then
  echo "FAIL: no shadow_chain_process_fx() call sites found — has the FX entry" >&2
  echo "      point been renamed? This pin is then blind and must be updated." >&2
  exit 1
fi

n_sites=0
for ln in $sites; do
  n_sites=$((n_sites + 1))
  # The timer must bracket the call: a clock read just above it, and an update
  # of the max tracker just below. Windows are deliberately tight — a match
  # from an unrelated timer elsewhere in the function would defeat the pin.
  before="$(sed -n "$((ln - 6)),$((ln - 1))p" "$shim")"
  after="$(sed -n "$((ln + 1)),$((ln + 12))p" "$shim")"

  if ! printf '%s' "$before" | grep -q 'clock_gettime(CLOCK_MONOTONIC'; then
    echo "FAIL: the shadow_chain_process_fx() call at $shim:$ln has no" >&2
    echo "      clock_gettime immediately before it — this FX path is UNTIMED," >&2
    echo "      so 'Slot fx max' will read zero while it burns a core." >&2
    exit 1
  fi
  if ! printf '%s' "$after" | grep -q 'spi_slot_fx_max\[s\]'; then
    echo "FAIL: the shadow_chain_process_fx() call at $shim:$ln does not feed" >&2
    echo "      spi_slot_fx_max — its cost is invisible in the spi_timing line." >&2
    exit 1
  fi
done

# Control: the pin is only meaningful if it is actually looking at more than one
# path. Both the deferred site and the rebuild_from_la site must exist — if a
# refactor collapses them to one, that is fine, but this pin must be re-read
# rather than silently passing on a single call it happens to like.
if [ "$n_sites" -lt 2 ]; then
  echo "FAIL: only $n_sites FX call site(s) found; this pin was written against" >&2
  echo "      TWO (deferred + rebuild_from_la). Re-read it against the new shape" >&2
  echo "      instead of assuming the remaining one is the only path." >&2
  exit 1
fi

echo "PASS: all $n_sites shadow_chain_process_fx() call sites are timed into spi_slot_fx_max"
exit 0
