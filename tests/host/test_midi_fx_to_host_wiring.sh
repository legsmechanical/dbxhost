#!/usr/bin/env bash
# Generated MIDI FX output -> the overtake DSP (chain key `midi_fx_to_host`):
# the wiring that no unit test can see.
#
# tests/host/test_chain_midi_fx_to_host.sh runs the chain half for real. What
# is pinned here is everything between the chain and the module, which only
# exists inside the shim:
#   - the chain's sink export exists, is NOT static, and has a prototype;
#   - the host registers its sink through dlsym, NULL-checked (stock's chain
#     DSP does not export it);
#   - the sink only QUEUES — it never calls the overtake DSP (it runs on a pool
#     lane, or re-entrantly inside the overtake render) and never logs;
#   - the drain is AFTER the overtake render and before the preview mix, in
#     shadow_inprocess_render_to_buffer;
#   - the module's entry is looked up after create_instance and cleared at
#     unload BEFORE the instance is destroyed;
#   - the key is stored, read, parsed, applied at both patch-apply sites, reset
#     at unload, and SAVED (a key the saver does not carry is a setting that
#     silently reverts on the next project load);
#   - nothing was added inside the frozen host_api_v1_t, and the two header
#     copies agree.
#
# Every pin reads CODE with comments stripped: a pin that can match its own
# explanation passes on a tree where the code is gone.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; say() { echo "FAIL: $*" >&2; fail=1; }

code() { sed -e 's://.*$::' "$1" | awk 'BEGIN{c=0} { line=$0; out="";
    while (length(line)) { if (c) { i=index(line,"*/"); if (!i) { line=""; break } line=substr(line,i+2); c=0 }
      else { i=index(line,"/*"); if (!i) { out=out line; line="" } else { out=out substr(line,1,i-1); line=substr(line,i+2); c=1 } } }
    print out }'; }
# A top-level function's body: from its signature line to the first line that
# is exactly "}".
body() { echo "$1" | awk -v sig="$2" 'index($0, sig) && !f { f=1 } f { print } f && /^}/ { exit }'; }

CM=src/modules/chain/dsp/chain_midi.c; CI=src/modules/chain/dsp/chain_internal.h
CH=src/modules/chain/dsp/chain_host.c; CP=src/modules/chain/dsp/chain_patch.c
M=src/host/shadow_chain_mgmt.c; S=src/schwung_shim.c; H=src/host/plugin_api_v1.h
J=src/shadow/shadow_ui.js

cm="$(code "$CM")"; ci="$(code "$CI")"; ch="$(code "$CH")"; cp="$(code "$CP")"
m="$(code "$M")"; s="$(code "$S")"; h="$(code "$H")"; j="$(code "$J")"

# ---- the chain's export ----
echo "$cm" | grep -q '^void chain_set_midi_fx_sink(chain_midi_fx_sink_fn sink)' \
    || say "chain_set_midi_fx_sink is not defined as a non-static function in $CM"
echo "$cm" | grep -q 'static.*void chain_set_midi_fx_sink' && say "chain_set_midi_fx_sink is static (the shim resolves it by dlsym)"
echo "$ci" | grep -q 'void chain_set_midi_fx_sink(chain_midi_fx_sink_fn sink);' || say "no prototype for chain_set_midi_fx_sink in $CI"
echo "$ci" | grep 'chain_set_midi_fx_sink' | grep -q 'CHAIN_INTERNAL' && say "chain_set_midi_fx_sink is hidden-visibility"
[ "$(echo "$cm" | grep -c 'midi_fx_to_host_emit(inst, out_msgs\[i\], out_lens\[i\])')" = 3 ] \
    || say "expected the hand-off at exactly three sites in $CM (tick path + clock path + midi_fx_host_route)"
tick="$(body "$cm" 'int v2_tick_midi_fx(chain_instance_t *inst, int frames)')"
echo "$tick" | grep -q 'midi_fx_to_host_emit' || say "v2_tick_midi_fx does not hand tick output to the host"
onm="$(body "$cm" 'void v2_on_midi(void *instance, const uint8_t *msg, int len, int source)')"
# Two hand-offs in v2_on_midi: the generated-only one, gated on a CLOCK input,
# and midi_fx_host_route's, which takes everything and RETURNS before the synth.
echo "$onm" | grep -B1 'midi_fx_to_host_emit' | grep -q 'chain_fx_input_is_clock(msg, len)' \
    || say "v2_on_midi hands over output that is not gated on a CLOCK input"
route_blk="$(echo "$onm" | awk '/if \(inst->midi_fx_host_route\) \{/{f=1} f{print} f&&/^    \}/{exit}')"
echo "$route_blk" | grep -q 'midi_fx_to_host_emit' && echo "$route_blk" | grep -q 'return;' \
    || say "v2_on_midi's midi_fx_host_route branch does not hand everything over and return before the synth"
r_at="$(echo "$onm" | grep -n 'if (inst->midi_fx_host_route) {' | head -1 | cut -d: -f1)"
s_at="$(echo "$onm" | grep -n 'synth_plugin_v2->on_midi(inst->synth_instance, out_msgs' | head -1 | cut -d: -f1)"
{ [ -n "$r_at" ] && [ -n "$s_at" ] && [ "$r_at" -lt "$s_at" ]; } || say "the midi_fx_host_route branch is not ahead of the send to the synth"

# ---- the key: set, get, parse, both applies, unload reset ----
echo "$ch" | grep -q 'strcmp(key, "midi_fx_to_host") == 0' || say "$CH does not handle the midi_fx_to_host key"
[ "$(echo "$ch" | grep -c 'strcmp(key, "midi_fx_to_host") == 0')" -ge 2 ] || say "midi_fx_to_host is not in BOTH set_param and get_param"
echo "$ch" | grep -q 'inst->midi_fx_to_host = temp_patch->midi_fx_to_host' || say "the load-from-file apply site drops midi_fx_to_host"
echo "$cp" | grep -q 'json_get_int(json, "midi_fx_to_host", &patch->midi_fx_to_host)' || say "the patch parser does not read midi_fx_to_host"
echo "$cp" | grep -q 'inst->midi_fx_to_host = inst->patches\[patch_idx\].midi_fx_to_host' || say "the library-patch apply site drops midi_fx_to_host"
body "$cm" 'void v2_unload_midi_fx_slot(chain_instance_t *inst, int slot)' | grep -q 'inst->midi_fx_to_host = 0' \
    || say "unloading a MIDI FX does not reset midi_fx_to_host"

for k in midi_fx_host_route; do
  [ "$(echo "$ch" | grep -c "strcmp(key, \"$k\") == 0")" -ge 2 ] || say "$k is not in BOTH set_param and get_param"
  echo "$ch" | grep -q "inst->$k = temp_patch->$k" || say "the load-from-file apply site drops $k"
  echo "$cp" | grep -q "json_get_int(json, \"$k\", &patch->$k)" || say "the patch parser does not read $k"
  echo "$cp" | grep -q "inst->$k = inst->patches\[patch_idx\].$k" || say "the library-patch apply site drops $k"
  body "$cm" 'void v2_unload_midi_fx_slot(chain_instance_t *inst, int slot)' | grep -q "inst->$k = 0" \
      || say "unloading a MIDI FX does not reset $k"
  echo "$j" | grep 'const preKeys' -A2 | grep -q "\"$k\"" || say "the slot saver does not READ $k (preKeys)"
  echo "$j" | grep -q "patch.$k = " || say "the slot saver does not WRITE $k into the patch"
done

# ---- the saver ----
echo "$j" | grep 'const preKeys' -A2 | grep -q '"midi_fx_to_host"' || say "the slot saver does not READ midi_fx_to_host (preKeys)"
echo "$j" | grep -q 'patch.midi_fx_to_host = ' || say "the slot saver does not WRITE midi_fx_to_host into the patch"

# ---- the host's sink: registered by dlsym, queues only ----
echo "$m" | grep -q 'dlsym(shadow_dsp_handle, "chain_set_midi_fx_sink")' || say "the host does not look up chain_set_midi_fx_sink"
echo "$m" | grep -q 'if (set_sink) set_sink(shadow_chain_midi_fx_sink)' || say "the sink registration is not NULL-checked"
sink="$(body "$m" 'static void shadow_chain_midi_fx_sink(void *instance, const uint8_t *msg, int len)')"
[ -n "$sink" ] || say "shadow_chain_midi_fx_sink not found in $M"
echo "$sink" | grep -q 'shadow_midi_inject_push(&shadow_fx_out_ring' || say "the sink does not queue into the MPSC ring"
echo "$sink" | grep -Eq 'unified_log|shadow_log|printf|malloc|overtake' && say "the sink logs, allocates or reaches for the overtake DSP — it runs on a render lane"
drain="$(body "$m" 'int shadow_chain_fx_out_drain(shadow_fx_out_deliver_fn deliver)')"
echo "$drain" | grep -q 'SHADOW_MIDI_INJECT_SLOTS' || say "the drain is not bounded"
echo "$drain" | grep -q 'if (!deliver) continue' || say "the drain does not discard when nobody takes the notes (the ring would fill)"

# ---- the shim: lookup, unload, drain order ----
echo "$s" | grep -q 'dlsym(overtake_dsp_handle, MOVE_PLUGIN_SLOT_MIDI_V1_SYMBOL)' || say "the shim does not look up the module's slot-MIDI entry"
unl="$(body "$s" 'static void shadow_overtake_dsp_unload(void) {')"
a="$(echo "$unl" | grep -n 'overtake_slot_midi_fn = NULL' | head -1 | cut -d: -f1)"
b="$(echo "$unl" | grep -n 'destroy_instance' | head -1 | cut -d: -f1)"
if [ -z "$a" ] || [ -z "$b" ]; then say "unload: could not find the entry clear ($a) and destroy_instance ($b)";
elif [ "$a" -ge "$b" ]; then say "unload clears the slot-MIDI entry AFTER destroying the instance"; fi
ren="$(body "$s" 'static void shadow_inprocess_render_to_buffer(')"
[ -n "$ren" ] || ren="$(body "$s" 'void shadow_inprocess_render_to_buffer(')"
r1="$(echo "$ren" | grep -n 'overtake_in_render = 0' | head -1 | cut -d: -f1)"
r2="$(echo "$ren" | grep -n 'shadow_chain_fx_out_drain(' | head -1 | cut -d: -f1)"
r3="$(echo "$ren" | grep -n 'preview_render(' | head -1 | cut -d: -f1)"
r0="$(echo "$ren" | grep -n 'render_pool_run(' | head -1 | cut -d: -f1)"
if [ -z "$r0" ] || [ -z "$r1" ] || [ -z "$r2" ] || [ -z "$r3" ]; then
    say "render_to_buffer: could not order pool run ($r0), overtake render end ($r1), drain ($r2), preview ($r3)"
else
    [ "$r0" -lt "$r1" ] || say "the overtake render is not after the slot fork-join"
    [ "$r1" -lt "$r2" ] || say "the drain is not AFTER the overtake render (re-entrant output would wait a frame, or arrive mid-render)"
    [ "$r2" -lt "$r3" ] || say "the drain is not before the preview mix"
fi
[ "$(echo "$s" | grep -c 'shadow_chain_fx_out_drain(')" = 1 ] || say "expected exactly one drain call in the shim"
echo "$s" | grep -A1 'shadow_chain_fx_out_drain(' | grep -q 'overtake_slot_midi_fn && overtake_dsp_gen_inst' \
    || say "the drain does not fall back to discarding when no module takes the notes"

# ---- the frozen struct, and the header copies ----
echo "$h" | grep -q '#define MOVE_PLUGIN_SLOT_MIDI_V1_SYMBOL "move_plugin_slot_midi_v1"' || say "$H lacks the slot-MIDI symbol"
echo "$h" | awk '/typedef struct host_api_v1/,/} host_api_v1_t;/' | grep -Eq 'slot_midi|midi_fx_sink|fx_out' \
    && say "something for this feature was added INSIDE host_api_v1_t (frozen geometry)"
echo "$h" | grep -q '_Static_assert(sizeof(host_api_v1_t) == 184' || say "the 184-byte assert on host_api_v1_t is gone"
cmp -s "$H" davebox/dsp/host/plugin_api_v1.h || say "the two copies of plugin_api_v1.h differ"

[ "$fail" = 0 ] && echo "PASS: midi_fx_to_host is wired chain -> ring -> drain-after-render -> module, saved, and outside the frozen struct" || exit 1
