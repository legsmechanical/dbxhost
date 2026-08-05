#!/usr/bin/env bash
set -euo pipefail

# Host state must keep saving while an overtake module owns the device.
#
# The periodic autosave is gated `!isOvertakeActive` because polling each slot's
# dirty flag costs a get_param round-trip (~2.6 ms) — fine for a tool visited
# briefly, but a tool that owns the WHOLE session (dAVEBOx SA) then has its
# host-side state written only at entry and teardown, so a crash or hard reboot
# loses every edit since launch.
#
# The fix must keep three properties, each of which reintroduces a real bug if
# it drifts:
#   1. Detection is FREE (a C-side dirty bit on param writes), never a poll —
#      polling in the tick is what the gate exists to prevent.
#   2. BULK sets mark dirty too. A `<prefix>:state` restore is a bulk SET and
#      bypasses shadow_set_param_common; missing it drops whole-blob writes.
#   3. The save is deferred but NOT starvable — a tool writing every tick must
#      not hold the quiet period open forever.

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

c="src/shadow/shadow_ui.c"
js="src/shadow/shadow_ui.js"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. The free detection path exists and auto-clears (take semantics).
rg -q 'g_slot_param_dirty_mask' "$c" \
  || fail "$c lost the slot dirty mask — detection would have to poll again"
rg -q 'shadow_take_dirty_slots' "$c" \
  || fail "$c no longer exposes shadow_take_dirty_slots to JS"

# 2. BOTH write paths mark: the common setter and the bulk setter.
common_marks=$(rg -c 'g_slot_param_dirty_mask \|=' "$c" || echo 0)
[ "${common_marks:-0}" -ge 2 ] \
  || fail "$c marks the dirty bit in fewer than 2 places; the bulk SET path (a :state restore) is almost certainly uncovered"

# 3. The JS side consumes it while overtake is active — the whole point.
rg -q 'isOvertakeActive && typeof shadow_take_dirty_slots' "$js" \
  || fail "$js does not run the dirty-driven autosave during overtake"

# 4. Starvation guard: a continuous writer must still get saved.
rg -q 'overtakeDirtyAge >= AUTOSAVE_INTERVAL' "$js" \
  || fail "$js lost the deferral cap — a tool writing every tick would never be saved, silently restoring the original bug"

# 5. The save must be staggered (one slot per tick), not a whole flush in-frame.
rg -q 'autosaveAllSlots\(slot\)' "$js" \
  || fail "$js no longer saves a single slot per tick; a multi-slot flush would stall the tool's frame"

# 6. The preset-audition guard must still hold, and must not clear the bits.
rg -q '!isPresetPreviewActive\(\)' "$js" \
  || fail "$js can persist an uncommitted preset audition during overtake"

# --- FX buses -------------------------------------------------------------
# Master / Send / Move buses all live at slot 0 and differ only by key
# namespace, so the slot mask cannot see them. They need prefix-based marking
# and their own saver per bus.

# 7. Prefix-based bus detection exists and distinguishes the buses.
rg -q 'shadow_mark_fx_bus_dirty' "$c" \
  || fail "$c does not mark FX buses dirty; master/send/move edits would never autosave"
for prefix in 'master_fx:' 'send_fx:' 'move_fx:'; do
  rg -q "\"$prefix\"" "$c" \
    || fail "$c does not recognise the $prefix namespace when marking dirty buses"
done
rg -q 'shadow_take_dirty_fx_buses' "$c" \
  || fail "$c no longer exposes shadow_take_dirty_fx_buses to JS"

# 8. Bulk sets must mark buses too — a bus :state restore is a bulk SET.
rg -q 'shadow_mark_fx_bus_dirty\(shadow_param->key\)' "$c" \
  || fail "$c bulk path does not mark FX buses (and must read the key from shared memory, not the freed JS string)"

# 9. Each bus must be saved by its own saver, NOT via the editor's dispatcher —
#    activeFxBus reflects the last bus opened on screen, which during overtake
#    has nothing to do with the bus that changed.
rg -q 'saveMasterFxChainConfig\(true\)' "$js" \
  || fail "$js does not force the master-bus save, so it would follow activeFxBus and persist the wrong bus"
rg -q 'saveSendFxChainConfig\("a"\)' "$js" \
  || fail "$js does not narrow the send-bus save to the bus that changed"
rg -q 'saveMoveFxChainConfig\(m\)' "$js" \
  || fail "$js does not narrow the Move-bus save; a full walk is 16 blocks in one frame"

# 10. Still exactly one unit of work per tick.
rg -q 'function saveOneDirtyOvertakeUnit' "$js" \
  || fail "$js lost the one-unit-per-tick worker"

echo "PASS: overtake autosave covers slots AND fx buses, dirty-driven, staggered, non-starvable"
exit 0
