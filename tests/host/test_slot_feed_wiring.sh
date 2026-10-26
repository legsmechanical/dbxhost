#!/usr/bin/env bash
# Audio an overtake DSP hands a slot (move_host_ext_v1_t.slot_audio_feed) is
# HEARD. The rules are run in test_slot_feed.c; these are SOURCE pins on the
# shim around them, because each miss is silent: a feed nobody mixes, a slot
# with no instrument that is never rendered, a fed slot the mix skips.
set -u
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c
fails=0
check() { local desc="$1"; shift
    if "$@"; then echo "  ok   $desc"; else echo "  FAIL $desc" >&2; fails=1; fi; }
code() { grep -vE "^\s*(/\*|\*|//)" "$1"; }

echo "slot feed wiring:"
filled() { code "$SHIM" | grep -q '\.slot_audio_feed = overtake_slot_audio_feed'; }
check "the shim fills slot_audio_feed" filled
in_render() { code "$SHIM" | grep -A2 'static int overtake_slot_audio_feed' | grep -q 'if (!overtake_in_render'; }
check "a feed outside the overtake render is refused" in_render
mixed() { [ "$(code "$SHIM" | grep -c 'if (feed) slot_feed_mix(')" = 2 ]; }
check "both slot render paths (deferred FX and fallback) mix the feed" mixed
woken() { code "$SHIM" | grep -A3 'const int16_t \*feed = slot_feed_current' | grep -q 'shadow_slot_idle\[s\] = 0;'; }
check "a fed slot is woken before the idle gate" woken
rendered() { code "$SHIM" | grep -q 'if (!shadow_chain_slots\[s\].active && !fed_live) continue;'; }
check "a fed slot with no instrument is rendered" rendered
mix_gate() { code "$SHIM" | grep -q 'int slot_active = ((shadow_chain_slots\[s\].active || shadow_slot_feed\[s\].live) &&'; }
check "the Link Audio rebuild mixes a fed slot" mix_gate
[ "$fails" = 0 ] && echo "PASS: test_slot_feed_wiring" || { echo "FAIL: test_slot_feed_wiring"; exit 1; }
