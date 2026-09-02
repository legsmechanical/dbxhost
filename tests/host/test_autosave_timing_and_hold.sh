#!/usr/bin/env bash
set -euo pipefail

# The mid-session autosave must not stall a running performance.
#
# 2026-09-02, traced on device: with automation playing, the host serialized
# a whole slot (~100 single param reads, ~300 ms on the SPI thread) every
# 2.0 s for as long as the transport ran — the playhead visibly stuck on one
# step each cycle — and wrote the mid-sweep value to disk as the slot's
# resting value. Three causes, three pins:
#   1. Every write to the overtake DSP ("overtake_dsp:" at slot 0) and every
#      bulk playback push marked the slot dirty, so the quiet period never
#      elapsed and the save fell through to its cap.
#   2. The cap was counted in TICKS ("~10 s at 30fps"); the overtake loop
#      runs ~500 Hz, so it was ~2 s.
#   3. A module had no way to say "not now".

cd "$(dirname "$0")/../.."
command -v rg >/dev/null 2>&1 || { echo "rg is required" >&2; exit 1; }
c="src/shadow/shadow_ui.c"
js="src/shadow/shadow_ui.js"
fail() { echo "FAIL: $1" >&2; exit 1; }

# 1a. The overtake DSP's keys never dirty a slot: the tool persists its own state.
rg -q 'static int shadow_param_key_dirties' "$c" \
  || fail "$c lost shadow_param_key_dirties — overtake_dsp: writes dirty slot 0 again"
rg -q 'strncmp\(key, "overtake_dsp:", 13\) != 0' "$c" \
  || fail "$c: shadow_param_key_dirties no longer excludes the overtake_dsp: prefix"
rg -q 'slot < 32 && shadow_param_key_dirties\(key\)' "$c" \
  || fail "$c: the common setter marks dirty without asking shadow_param_key_dirties"
rg -q 'slot < 32 && shadow_param_key_dirties\(shadow_param->key\)' "$c" \
  || fail "$c: the bulk setter marks dirty without asking shadow_param_key_dirties"

# 1b. A bulk SET can be declared TRANSIENT (4th arg, default off) and then
#     marks neither slots nor buses. Off by default so a :state restore still marks.
rg -q 'int transient = \(argc >= 4\) \? JS_ToBool\(ctx, argv\[3\]\) : 0;' "$c" \
  || fail "$c: bulk SET lost its optional transient argument"
rg -q 'if \(req_type == 4 && !transient\)' "$c" \
  || fail "$c: a transient bulk SET still marks dirty"
rg -q '"shadow_set_params", 4\)' "$c" \
  || fail "$c: shadow_set_params is not declared with 4 parameters"

# 2. Every autosave interval is in milliseconds off Date.now(), never ticks.
for k in AUTOSAVE_MAX_DEFER_MS AUTOSAVE_QUIET_MS AUTOSAVE_RETRY_MS AUTOSAVE_SUPPRESS_MS; do
  rg -q "const $k = [0-9]+;" "$js" || fail "$js lost $k"
done
rg -q 'AUTOSAVE_INTERVAL|AUTOSAVE_DIRTY_QUIET_TICKS|AUTOSAVE_DIRTY_RETRY_TICKS|autosaveDirtyAge|autosaveDirtyQuiet' "$js" \
  && fail "$js counts an autosave interval in ticks again — a tick is a different duration in every mode"
rg -q 'autosaveSuppressUntil--' "$js" \
  && fail "$js counts the set-change suppression in ticks again"
n=$(rg -c 'autosaveNotBefore = Date.now\(\) \+ AUTOSAVE_RETRY_MS;' "$js" || echo 0)
[ "${n:-0}" -ge 5 ] || fail "$js: the mailbox-busy back-off is not time-based at every saver ($n of 5)"
rg -q 'autosaveNotBefore = nowMs \+ AUTOSAVE_QUIET_MS;' "$js" \
  || fail "$js: the quiet period is not time-based"

# 3. The hold: installed with the module globals, honoured in the tick,
#    cleared on unload so the next tool starts unheld.
rg -q 'globalThis.host_autosave_hold = function\(on\)' "$js" \
  || fail "$js does not expose host_autosave_hold to modules"
rg -q 'if \(ready && !autosaveHold && !isPresetPreviewActive\(\)\)' "$js" \
  || fail "$js: the autosave tick ignores the hold"
rg -qU 'autosaveHold = false;\s*delete globalThis.host_autosave_hold;' "$js" \
  || fail "$js: exitOvertakeMode does not clear the hold and remove the binding"
# The hold DEFERS; it must not clear the bits (nothing may be lost).
rg -q 'autosaveHold' "$js" && ! rg -q 'autosaveHold\) \{[^}]*autosaveDirtySlots = 0' "$js" \
  || fail "$js: the hold discards dirty bits"

echo "PASS: overtake_dsp/transient writes do not dirty, autosave timing is in ms, the hold is honoured and cleared"
