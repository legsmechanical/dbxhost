#!/usr/bin/env bash
# Source pin: at boot, a slot whose autosave file is the empty marker (`{}`)
# starts EMPTY — it does not fall back to loading the preset the slot is
# named after.
#
# The boot restore loads slot_N.json when it holds a chain, and otherwise
# looked the slot's NAME up in the patch library. But the autosave writes `{}`
# precisely when a slot was emptied, and the name is not cleared with it, so a
# slot last named after a preset reloaded that preset: on the device
# (2026-10-23) a track set to Instrument None, its slot still named "HATCHET",
# came back as Hatchet at the next launch. The name lookup is for a slot with
# NO autosave file.
set -u
SRC="$(dirname "$0")/../../src/host/shadow_chain_mgmt.c"
fails=0
fail() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }
[ -f "$SRC" ] || { echo "FAIL: cannot find $SRC" >&2; exit 1; }

# The `if (af) { ... }` block of the boot restore, comments stripped.
blk=$(awk '/FILE \*af = fopen\(autosave_path, "r"\);/ {on=1} on {print} on && /^        }$/ {exit}' "$SRC" \
      | grep -vE '^\s*(/\*|\*|//)')
[ -n "$blk" ] || { echo "FAIL: the boot restore's autosave block is gone (test is stale)" >&2; exit 1; }

echo "$blk" | grep -q 'if (asize > 10) {' || fail "the 'file holds a chain' test changed shape (test is stale)"

# After the chain branch, still inside `if (af)`: the slot goes inactive and
# the loop moves on, never reaching the name lookup below.
# What follows the chain branch's closing brace (12 spaces: the `if (asize`
# block; the log block inside it sits deeper).
tail=$(echo "$blk" | awk '/^            }$/ {after=1; next} after {print}')
echo "$tail" | grep -q 'shadow_chain_slots\[i\].active = 0;' || fail "an empty-marker file does not leave the slot inactive"
echo "$tail" | grep -q 'continue;' || fail "an empty-marker file falls through to the name-based preset lookup"

[ "$fails" -eq 0 ] || exit 1
echo "PASS: an empty-marker slot file starts the slot empty at boot"
