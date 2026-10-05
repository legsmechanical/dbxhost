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
# The arp LED reads the ARP IN bank's mirror, not the engine: a key in the
# prefetch every tick made the idle tick pay a round-trip for an LED.
grep -q "_tarp_on\|_tarp_latch" <<<"$(awk '/^export function tickPrefetch\(\)/,/^}/' $D)" && f "the arp LED must not put a read in every tick's prefetch"
grep -q "(_ab\[0\] | 0) !== 0 && (_ab\[7\] | 0) !== 0" ui/ui_tick.mjs || f "the arp LED must read the ARP IN mirror (Style, Latch)"
# A tick that wants nothing makes no read at all.
grep -q "if (!keys.length) return;" $D || f "an idle tick must skip the bulk read when it wants no keys"
# The stopped-and-quiet poll does not ask for chunk 0 when the engine says clean.
grep -q "const _clean = !_forced && pget('state_dirty') === '0';" $D || f "the save must skip chunk 0 when the poll says the state is clean"
for k in state_dirty bpm rui_rev clock_follow_on clock_send_on clock_follow_fallback capture_pending capture_info state_snapshot state_uuid; do
  grep -q "'$k'" $D || f "standing key $k missing from the prefetch"
done
# Inside pollDSP no direct single read remains — every read goes through pget (the fallback).
awk '/^export function pollDSP\(\)/,/^}/' $D | grep -q "host_module_get_param(" && f "pollDSP still makes a direct single read — route it through pget()"
grep -q "const _saveAllowed = S.saveNowOnce ||" $D || f "the save gate must honour the Record-off one-shot"
grep -q "(!S.playing && (S.clockMs - S.lastInputTick) >= SAVE_QUIET_MS)" $D || f "the save gate must require stopped + quiet (a DURATION in ms, never ticks)"
grep -q "S.saveNowOnce          = true;" ui/ui_record.mjs || f "disarmRecord must raise the one-shot save"
grep -q "S.lastInputTick = nowMs();" ui/ui.js || f "the MIDI handler must stamp the quiet clock"
echo "PASS: the poll is one bulk read; the save waits for stop, quiet, or the end of a take"
