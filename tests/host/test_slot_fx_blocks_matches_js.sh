#!/usr/bin/env bash
set -euo pipefail

# SLOT_FX_BLOCKS must equal the number of fxN entries in CHAIN_COMPONENTS.
#
# host_build_info() reports SLOT_FX_BLOCKS so a module can hide rows for FX
# blocks this host does not route. If the C constant and the JS list disagree,
# the report is a lie in the most damaging direction: a module trusts it, renders
# a block the host does not route, and every read returns nothing while every
# write is silently discarded. That is precisely the failure the probe exists to
# prevent, so an inconsistency here is worse than having no probe at all.
#
# Both numbers are fork divergences (4 here, 2 upstream), which is exactly why
# they drift: a rebase touches one and not the other.

hdr="src/host/shadow_constants.h"
js="src/shadow/shadow_ui.js"

c_count="$(grep -oE '^#define SLOT_FX_BLOCKS[[:space:]]+[0-9]+' "$hdr" | grep -oE '[0-9]+$' || true)"
if [ -z "$c_count" ]; then
  echo "FAIL: SLOT_FX_BLOCKS not found in $hdr" >&2
  exit 1
fi

# Count fxN entries in the CHAIN_COMPONENTS literal only (it ends at the ]).
js_count="$(awk '/^const CHAIN_COMPONENTS = \[/,/^\];/' "$js" \
            | grep -cE 'key: "fx[0-9]+"' || true)"

if [ "$c_count" != "$js_count" ]; then
  echo "FAIL: SLOT_FX_BLOCKS=$c_count but CHAIN_COMPONENTS lists $js_count fxN blocks" >&2
  echo "      host_build_info() would misreport the routed FX blocks to every module." >&2
  echo "      $hdr vs $js" >&2
  exit 1
fi

echo "PASS: SLOT_FX_BLOCKS ($c_count) matches CHAIN_COMPONENTS fxN count ($js_count)"
exit 0
