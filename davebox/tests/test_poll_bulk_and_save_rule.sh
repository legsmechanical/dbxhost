#!/usr/bin/env bash
# The poll reads its standing keys in ONE bulk round-trip (a round-trip is an
# SPI frame whatever it carries), and the deferred save obeys the ruled rule:
# never while playing except at Record-off, one second of quiet while stopped.
set -euo pipefail
cd "$(dirname "$0")/.."
f() { echo "FAIL: $*"; exit 1; }
D=ui/ui_dsp_bridge.mjs
grep -q "host_module_get_params(bulkEncode(keys))" $D || f "the tick must prefetch in one bulk read"
grep -q "tickPrefetch();" ui/ui_tick.mjs || f "_tickImpl must run the prefetch at the top of every tick"
grep -q "dget('metro_beat_count')" ui/ui_tick.mjs || f "the metronome's per-tick read must ride the prefetch"
grep -q "dget('t' + _lt + '_tarp_on')" ui/ui_tick.mjs || f "the arp LED's per-tick reads must ride the prefetch"
for k in bpm rui_rev clock_follow_on clock_send_on clock_follow_fallback capture_pending capture_info state_snapshot state_uuid; do
  grep -q "'$k'" $D || f "standing key $k missing from the prefetch"
done
# Inside pollDSP no direct single read remains — every read goes through pget (the fallback).
awk '/^export function pollDSP\(\)/,/^}/' $D | grep -q "host_module_get_param(" && f "pollDSP still makes a direct single read — route it through pget()"
grep -q "const _saveAllowed = S.saveNowOnce ||" $D || f "the save gate must honour the Record-off one-shot"
grep -q "(!S.playing && (S.clockMs - S.lastInputTick) >= SAVE_QUIET_MS)" $D || f "the save gate must require stopped + quiet (a DURATION in ms, never ticks)"
grep -q "S.saveNowOnce          = true;" ui/ui_record.mjs || f "disarmRecord must raise the one-shot save"
grep -q "S.lastInputTick = nowMs();" ui/ui.js || f "the MIDI handler must stamp the quiet clock"
echo "PASS: the poll is one bulk read; the save waits for stop, quiet, or the end of a take"
