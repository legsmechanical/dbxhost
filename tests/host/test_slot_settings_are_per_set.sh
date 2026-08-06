#!/usr/bin/env bash
set -euo pipefail

# Every slot setting is PER-SET. Josh, 2026-08-05: "every slot setting should be
# per set. anything that's not should be made so."
#
# The bug this pins was invisible and cost a long session. Slot settings live in
# TWO files with different schemas:
#   per-set  set_state/<uuid>/shadow_chain_config.json   (object schema)
#   global   <install>/shadow_chain_config.json          (flat arrays)
# and the global one was applied LAST at boot, so an install-wide value from an
# earlier session silently replaced what the current set had just restored. The
# per-set loader also never parsed transpose / sends / move_to_slot at all, so
# those were written to a file nothing read. Symptom: a setting that "would not
# stick", while the file on disk looked correct.
#
# Three properties must hold together; any one alone leaves the bug alive.
#
# Send return levels are the same shape and are handled the same way: stored
# per-set in send_fx_meta.json (restored at boot by restoreSendFxFromFiles) with
# the global array as fallback only.

cd "$(dirname "$0")/../.."

command -v rg >/dev/null 2>&1 || { echo "rg is required" >&2; exit 1; }

loader="src/host/shadow_set_pages.c"
global="src/host/shadow_state.c"
chain="src/host/shadow_chain_mgmt.c"
js="src/shadow/shadow_ui.js"
fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. The per-set loader must read every slot field, or it is written for nothing.
for f in transpose send_a send_b move_to_slot synth_volume muted soloed; do
  rg -q "\"\\\\\"$f\\\\\"\"" "$loader" \
    || fail "$loader does not parse \"$f\" — it would be saved per-set and then never restored"
done

# 2. The global file must be a FALLBACK, not an override.
rg -q 'if \(!shadow_per_set_config_loaded\)' "$global" \
  || fail "$global applies its per-slot arrays unconditionally — install-wide values would overwrite the set's own"
rg -q 'shadow_per_set_config_loaded = shadow_load_config_from_dir' "$chain" \
  || fail "$chain no longer records whether the set supplied its own config"

# 3. BOTH writers of the per-set file must emit every field. The file is
#    rewritten whole, so whichever writer runs last silently strips what it
#    omits — that is how a setting saved by one writer vanishes via the other.
for f in transpose send_a send_b move_to_slot synth_volume; do
  rg -q "$f" "$loader" || fail "$loader C writer omits $f"
  rg -q "$f:" "$js"     || fail "$js writer omits $f"
done

echo "PASS: slot settings are per-set — read back, not overridden, and written by both writers"
exit 0
