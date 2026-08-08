#!/usr/bin/env bash
set -euo pipefail

# The number of fxN entries in the host's CHAIN_COMPONENTS must equal davebox's
# SLOT_FX_BLOCKS (davebox/ui/ui_engine.mjs).
#
# davebox's sound mode renders one row per routed slot-FX block. If the module's
# constant and the host's routed list disagree, the mismatch is silent in the
# most damaging direction: a rendered row whose reads return nothing and whose
# writes are discarded. Both numbers are fork divergences (4 here, 2 upstream),
# which is exactly why they drift: a change touches one and not the other.
#
# (This test used to pin the C SLOT_FX_BLOCKS constant that host_build_info()
# reported to modules. The producer and the constant were deleted in P3 of the
# re-architecture — one repo, one deliverable, nothing left to report — so the
# pin now runs between the two living declarations.)

host_js="src/shadow/shadow_ui.js"
davebox_js="davebox/ui/ui_engine.mjs"

db_count="$(grep -oE 'export const SLOT_FX_BLOCKS = [0-9]+' "$davebox_js" | grep -oE '[0-9]+$' || true)"
if [ -z "$db_count" ]; then
  echo "FAIL: SLOT_FX_BLOCKS not found in $davebox_js" >&2
  exit 1
fi

# Count fxN entries in the CHAIN_COMPONENTS literal only (it ends at the ]).
js_count="$(awk '/^const CHAIN_COMPONENTS = \[/,/^\];/' "$host_js" \
            | grep -cE 'key: "fx[0-9]+"' || true)"

if [ "$db_count" != "$js_count" ]; then
  echo "FAIL: davebox SLOT_FX_BLOCKS=$db_count but CHAIN_COMPONENTS lists $js_count fxN blocks" >&2
  echo "      Sound mode would render FX rows the host does not route (or hide routed ones)." >&2
  echo "      $davebox_js vs $host_js" >&2
  exit 1
fi

echo "PASS: davebox SLOT_FX_BLOCKS ($db_count) matches CHAIN_COMPONENTS fxN count ($js_count)"
exit 0
