#!/usr/bin/env bash
# The poll reads its standing keys in ONE bulk round-trip (a round-trip is an
# SPI frame whatever it carries), and the deferred save obeys the ruled rule:
# never while playing except at Record-off, one second of quiet while stopped.
set -euo pipefail
cd "$(dirname "$0")/.."
f() { echo "FAIL: $*"; exit 1; }
D=ui/ui_dsp_bridge.mjs
grep -q "host_module_get_params(bulkEncode(keys))" $D || f "pollDSP must prefetch its standing keys in one bulk read"
for k in bpm rui_rev clock_follow_on clock_send_on clock_follow_fallback capture_pending capture_info state_snapshot state_uuid; do
  grep -q "'$k'" $D || f "standing key $k missing from the prefetch"
done
# Inside pollDSP no direct single read remains — every read goes through pget (the fallback).
awk '/^export function pollDSP\(\)/,/^}/' $D | grep -q "host_module_get_param(" && f "pollDSP still makes a direct single read — route it through pget()"
grep -q "const _saveAllowed = S.saveNowOnce ||" $D || f "the save gate must honour the Record-off one-shot"
grep -q "(!S.playing && (S.tickCount - S.lastInputTick) >= SAVE_QUIET_TICKS)" $D || f "the save gate must require stopped + quiet"
grep -q "S.saveNowOnce          = true;" ui/ui_record.mjs || f "disarmRecord must raise the one-shot save"
grep -q "S.lastInputTick = S.tickCount;" ui/ui.js || f "the MIDI handler must stamp the quiet clock"
echo "PASS: the poll is one bulk read; the save waits for stop, quiet, or the end of a take"
