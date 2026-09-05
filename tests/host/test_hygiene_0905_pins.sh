#!/bin/bash
# test_hygiene_0905_pins.sh — the 2026-09-05 hygiene sweep stays swept.
#   (b) ONE json_get_int body: host/json_tiny.h. No static copy anywhere.
#   (d) chain_editor_view is not a primary service; enterChainEdit still exists.
set -e
cd "$(dirname "$0")/../.."
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }

# (b)
n=$(grep -rn 'static int json_get_int(' src --include=*.c --include=*.h | wc -l | tr -d ' ')
[ "$n" = 0 ] && say "ok   — no static json_get_int copy remains" || bad "$n static json_get_int copies"
n=$(grep -rn 'int json_get_int(const char' src --include=*.c --include=*.h | grep -v 'CHAIN_INTERNAL int json_get_int' | wc -l | tr -d ' ')
[ "$n" = 1 ] && say "ok   — one json_get_int definition left (chain_json's exported wrapper)" || bad "$n json_get_int definitions"
n=$(grep -rn 'static inline int json_tiny_get_int(' src --include=*.h | wc -l | tr -d ' ')
[ "$n" = 1 ] && say "ok   — one parser body (json_tiny.h)" || bad "$n json_tiny_get_int bodies"
grep -q 'return json_tiny_get_int(json, key, out) ? 0 : -1;' src/modules/chain/dsp/chain_json.c \
    && say "ok   — chain_json keeps its exported 0/-1 contract as a wrapper" || bad "chain_json wrapper missing"
for f in src/modules/midi_fx/arp/dsp/arp.c src/modules/midi_fx/chord/dsp/chord.c src/modules/midi_fx/velocity_scale/dsp/velocity_scale.c src/host/module_manager.c; do
    grep -q 'json_tiny_get_int(' "$f" && grep -q 'json_tiny.h' "$f" || bad "$f does not use json_tiny"
done
say "ok   — the four former copies call json_tiny_get_int"

# (d)
! grep -q '^\s*chain_editor_view:' src/shadow/shadow_ui.js && say "ok   — chain_editor_view is not a primary service" || bad "chain_editor_view service still registered"
grep -q '^function enterChainEdit(' src/shadow/shadow_ui.js && say "ok   — enterChainEdit still exists (reachable from the host's own screens)" || bad "enterChainEdit gone"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
