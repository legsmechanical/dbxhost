#!/usr/bin/env bash
# The host extension that lets an overtake DSP set a chain-slot parameter from
# its own render (move_host_ext_v1_t.set_slot_param, plugin_api_v1.h).
#
# What must stay true, and cannot be seen by running anything off-device:
#   - it is a SYNCHRONOUS call into the narrow setter, not a queue — a queue
#     drained next frame would land AFTER the note the value was written for;
#   - it refuses the keys that load things (spl_key_eligible);
#   - the host hands it over after create_instance, by dlsym, so the frozen
#     host_api_v1_t geometry is untouched;
#   - the two copies of the header agree.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; say() { echo "FAIL: $*" >&2; fail=1; }
S=src/schwung_shim.c; H=src/host/plugin_api_v1.h

fn="$(awk '/^static int overtake_set_slot_param\(/,/^}/' "$S")"
[ -n "$fn" ] || say "overtake_set_slot_param not found in $S"
echo "$fn" | grep -q 'spl_key_eligible(key)'            || say "the entry point does not refuse loader keys (spl_key_eligible)"
echo "$fn" | grep -q 'shadow_direct_set_param('         || say "the entry point does not land on shadow_direct_set_param"
echo "$fn" | grep -q 'shadow_param_apply_set'           && say "the entry point uses the WIDE dispatcher (it may activate slots / load modules)"
echo "$fn" | grep -qE 'spl_push|ring|queue'             && say "the entry point queues the write — it must be synchronous"
echo "$fn" | grep -qE 'unified_log|shadow_log|printf|malloc|fopen' && say "the entry point logs, allocates or does I/O on the audio thread"
echo "$fn" | grep -q 'SHADOW_CHAIN_INSTANCES'           || say "the entry point does not bound the slot"

load="$(awk '/^static void shadow_overtake_dsp_load\(|^void shadow_overtake_dsp_load\(|shadow_overtake_dsp_load\(const char/,/^}/' "$S")"
[ -n "$load" ] || say "shadow_overtake_dsp_load not found"
ci="$(echo "$load" | grep -n 'create_instance(' | head -1 | cut -d: -f1)"
hs="$(echo "$load" | grep -n 'MOVE_PLUGIN_HOST_EXT_V1_SYMBOL' | head -1 | cut -d: -f1)"
if [ -z "$hs" ]; then say "the load path never looks up MOVE_PLUGIN_HOST_EXT_V1_SYMBOL"
elif [ -z "$ci" ] || [ "$hs" -le "$ci" ]; then say "the extension handshake must come AFTER create_instance"; fi
echo "$load" | grep -q 'ext_fn(&overtake_host_ext)' || say "the handshake does not pass the host's extension struct"

grep -q 'set_slot_param = overtake_set_slot_param' "$S" || say "the extension struct does not carry the entry point"
grep -q '_Static_assert(sizeof(host_api_v1_t) == 184' "$H" || say "host_api_v1_t's size assert is gone"
awk '/typedef struct host_api_v1/,/} host_api_v1_t;/' "$H" | grep -q 'set_slot_param' \
    && say "set_slot_param was added INSIDE host_api_v1_t (frozen geometry)"
cmp -s "$H" davebox/dsp/host/plugin_api_v1.h || say "the two copies of plugin_api_v1.h differ"

[ $fail -eq 0 ] && echo "PASS: module slot-param extension is synchronous, narrow, refused for loaders, handed over after create"
exit $fail
