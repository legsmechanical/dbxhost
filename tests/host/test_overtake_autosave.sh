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

# 9. ⚠ A save that could not read the DSP must NOT clear the dirty bit.
#    Reading a synth's state needs the param mailbox, which a tool owning the
#    device keeps busy; the read times out and buildSlotPatchJson bails rather
#    than clobber a good file. Clearing the bit in front of that bail discards
#    the user's edit permanently — observed on hardware 2026-08-05, where a
#    transpose change logged a save and never reached disk.
rg -q 'const wroteChain  = autosaveAllSlots\(slot\);' "$js" \
  || fail "$js no longer captures whether the chain was actually written"
rg -q 'if \(wroteChain \|\| wroteConfig\) \{' "$js" \
  || fail "$js clears the dirty bit without checking whether anything was actually written — a failed save silently loses the edit"
rg -q 'return wrote;' "$js" \
  || fail "$js: autosaveAllSlots no longer reports whether it persisted anything"

# 10. The FX buses are deliberately NOT written from the overtake path: their
#     savers treat an unreadable module name as "empty" and write {}, which
#     would blank a good bus config when a read times out. Transition flushes
#     still cover them. If this return is removed, that clobber is live again.
rg -q 'Buses are collected but NOT written from here' "$js" \
  || fail "$js re-enabled FX bus writes from the overtake path; a timed-out read there blanks a good bus config"

# 10b. A slot edit must write BOTH files. slot_N.json holds the chain (synth/FX
#      state); shadow_chain_config.json holds the slot's OWN settings (volume,
#      channel, mute/solo, sends, transpose). Writing only the chain is why a
#      slot:transpose change survived nothing on hardware 2026-08-05.
rg -q 'saveChainConfigToDir\(activeSlotStateDir\);' "$js" \
  || fail "$js overtake autosave no longer writes shadow_chain_config.json — slot settings (transpose, sends, mute) would not persist mid-session"
rg -q 'wroteChain \|\| wroteConfig' "$js" \
  || fail "$js does not treat a config-only write as success — a synth without get_param(\"state\") would retry forever and never persist readable settings"

# 10c. slot:transpose must actually be serialised. It was wired end to end in
#      the shim and shown in the UI, but nothing wrote it, so it reset to 0 on
#      every host start.
rg -q 'transpose: transpose' "$js" \
  || fail "$js no longer saves slot:transpose into the per-set chain config"
rg -q 'setSlotParamWithTimeout\(i, "slot:transpose"' "$js" \
  || fail "$js no longer restores slot:transpose when loading a set"

# 10d. The config save must refuse to run on unreadable params: every field
#      falls back to a default, so a failed read round would overwrite the
#      user's settings with defaults rather than error.
rg -q 'refusing to overwrite with defaults' "$js" \
  || fail "$js saveChainConfigToDir lost its unreadable-params guard; it would clobber settings with defaults"

# 11. Still exactly one unit of work per tick.
rg -q 'function saveOneDirtyOvertakeUnit' "$js" \
  || fail "$js lost the one-unit-per-tick worker"

# --- staying in step with the underlying Move set -------------------------
# The bus files are PER-SET. Transition points whose contract is "all state is
# now on disk" (set change, shutdown, overtake entry/exit) must persist every
# bus family — a bare saveMasterFxChainConfig() dispatches on activeFxBus and
# saves only whichever bus the editor last showed, so with the editor on a send
# bus a set change dropped master and Move onto the floor. The loss lands on the
# OUTGOING set and stays invisible until that set is next loaded.

# 12. The all-bus helper exists and covers all three families.
rg -q 'function saveAllFxBusConfigs' "$js" \
  || fail "$js lost saveAllFxBusConfigs — transition flushes would persist only one bus family"
for fn in 'saveMasterFxChainConfig\(true\)' 'saveSendFxChainConfig\(\)' 'saveMoveFxChainConfig\(\)'; do
  rg -q "$fn" "$js" || fail "$js: saveAllFxBusConfigs no longer covers $fn"
done

# 13. Every transition flush (paired with autosaveAllSlots) must use it. The
#     periodic autosave is deliberately excluded — it is the steady-state cost
#     path, and transitions provide the completeness guarantee.
bare=$(rg -U -c 'autosaveAllSlots\(\);\n\s*saveMasterFxChainConfig\(\);' "$js" || echo 0)
if [ "${bare:-0}" -gt 1 ]; then
  echo "FAIL: $js has ${bare} transition flushes still calling bare saveMasterFxChainConfig()." >&2
  echo "      Only the periodic autosave may do that; the rest must use saveAllFxBusConfigs()." >&2
  exit 1
fi

echo "PASS: overtake autosave persists slots only-on-success; buses deferred to transitions"
exit 0
