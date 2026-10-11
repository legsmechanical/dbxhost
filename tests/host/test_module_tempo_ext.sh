#!/usr/bin/env bash
# The host extension by which an overtake DSP that runs its own clock declares
# its tempo (move_host_ext_v1_t.set_tempo, plugin_api_v1.h).
#
# The arithmetic is pinned by test_shadow_transport.c. What it cannot see:
#   - the extension struct really carries the entry point, and it reaches the
#     transport service;
#   - the tempo answer modules get (sampler_get_bpm) consults the declaration,
#     BELOW a running clock and ABOVE the Set's tempo — without that the
#     declaration is stored and never read;
#   - unloading the module withdraws it, or the next session inherits a tempo;
#   - nothing was added inside the frozen host_api_v1_t.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; say() { echo "FAIL: $*" >&2; fail=1; }
S=src/schwung_shim.c; H=src/host/plugin_api_v1.h; P=src/host/shadow_sampler.c

code() { sed -e 's://.*$::' "$1" | awk 'BEGIN{c=0} { line=$0; out="";
    while (length(line)) { if (c) { i=index(line,"*/"); if (!i) { line=""; break } line=substr(line,i+2); c=0 }
      else { i=index(line,"/*"); if (!i) { out=out line; line="" } else { out=out substr(line,1,i-1); line=substr(line,i+2); c=1 } } }
    print out }'; }

ext="$(code "$H" | awk '/typedef struct move_host_ext_v1/,/} move_host_ext_v1_t;/')"
[ -n "$ext" ] || say "move_host_ext_v1_t not found in $H"
echo "$ext" | grep -q 'void (\*set_tempo)(float' || say "the extension struct has no set_tempo(float)"
code "$H" | awk '/typedef struct host_api_v1/,/} host_api_v1_t;/' | grep -q 'set_tempo' \
    && say "set_tempo was added INSIDE host_api_v1_t (frozen geometry)"

shim="$(code "$S")"
echo "$shim" | grep -q '\.set_tempo = overtake_set_tempo' || say "the host's extension does not carry set_tempo"
echo "$shim" | awk '/^static void overtake_set_tempo\(/,/}/' | grep -q 'shadow_transport_declare_bpm(bpm)' \
    || say "overtake_set_tempo does not reach the transport service"
echo "$shim" | awk '/^static void shadow_overtake_dsp_unload\(void\) \{/,/^}/' | grep -q 'shadow_transport_declare_bpm(0' \
    || say "unloading the overtake DSP does not withdraw its declared tempo"

fn="$(code "$P" | awk '/^float sampler_get_bpm\(/,/^}/')"
[ -n "$fn" ] || say "sampler_get_bpm not found in $P"
ln() { echo "$fn" | grep -n "$1" | head -1 | cut -d: -f1; }
d="$(ln 'shadow_transport_declared_bpm()')"; c="$(ln 'sampler_clock_active')"; s="$(ln 's_set_tempo_ptr')"
[ -n "$d" ] || say "sampler_get_bpm never reads the declared tempo"
if [ -n "$d" ] && [ -n "$c" ] && [ -n "$s" ]; then
    [ "$c" -lt "$d" ] || say "the declared tempo is consulted before a running MIDI clock"
    [ "$d" -lt "$s" ] || say "the declared tempo is consulted after the Set's tempo"
else
    say "could not order the tempo sources (clock=$c declared=$d set=$s)"
fi

cmp -s "$H" davebox/dsp/host/plugin_api_v1.h || say "the two copies of plugin_api_v1.h differ"

[ "$fail" = 0 ] && echo "PASS: module tempo extension" || exit 1
