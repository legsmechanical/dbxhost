#!/usr/bin/env bash
# tests/host/test_ui_midi_ring_wiring.sh — the shim -> shadow_ui MIDI ring is
# WIRED in arrival order on both sides (upstream 1dfd31f5).
#
# The C units prove the ring (test_ui_midi_ring_order) and the reserve
# (test_ui_midi_policy). What they cannot see is whether the two processes use
# them: the producer is inside the SPI callback and the consumer inside
# shadow_ui's main loop, neither of which builds on the host. So pin the joins:
# a producer that still takes the LOWEST FREE slot, or a consumer that drains in
# INDEX order, reorders a burst that straddles a drain (a release before its
# press), and a consumer that skips a slot without clearing it makes the
# producer see the ring as full forever.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   $1"; }; bad(){ echo "  FAIL $1"; fail=1; }
SHIM=src/schwung_shim.c
UI=src/shadow/shadow_ui.c
pub=$(awk '/^static inline void shadow_ui_midi_publish\(/{f=1} f{print} f&&/^}/{exit}' "$SHIM")
con=$(awk '/^static int process_shadow_midi\(/{f=1} f{print} f&&/^}/{exit}' "$UI")
[ -n "$pub" ] && ok "found shadow_ui_midi_publish" || bad "shadow_ui_midi_publish not found"
[ -n "$con" ] && ok "found process_shadow_midi" || bad "process_shadow_midi not found"

grep -q 'ui_midi_ring_put(shadow_ui_midi_shm, MIDI_BUFFER_SIZE, &ui_midi_wr' <<<"$pub" \
  && ok "the producer writes at its ring cursor" || bad "the producer does not use ui_midi_ring_put at a cursor"
grep -q 'for (int slot = 0' <<<"$pub" \
  && bad "the producer still scans for the lowest free slot" || ok "no lowest-free-slot scan left in the producer"
grep -q 'yields && shadow_ui_midi_reserve_blocks(shadow_ui_midi_shm, MIDI_BUFFER_SIZE, ui_midi_wr)' <<<"$pub" \
  && ok "a knob detent consults the reserve at the cursor" || bad "the reserve is not consulted for yielding events"
grep -q 'static int ui_midi_wr' <<<"$pub" && ok "the producer cursor persists (static)" || bad "the producer cursor is not static"

grep -q 'ui_midi_ring_next(shadow_ui_midi_shm, MIDI_BUFFER_SIZE, &ui_midi_rd)' <<<"$con" \
  && ok "the consumer reads in ring order" || bad "the consumer does not read via ui_midi_ring_next"
grep -q 'static int ui_midi_rd' <<<"$con" && ok "the consumer cursor persists (static)" || bad "the consumer cursor is not static"
grep -q 'for (int i = 0; i < MIDI_BUFFER_SIZE; i += 4)' <<<"$con" \
  && bad "the consumer still drains in index order" || ok "no index-order drain left in the consumer"
# The skipped slot is CLEARED: the release-store of 0 sits inside the skip branch, before its continue.
awk '/if \(cin < 0x04 \|\| cin > 0x0E\) \{/{b=1; next} b && /__atomic_store_n\(&shadow_ui_midi_shm\[i\], 0, __ATOMIC_RELEASE\);/{c=1} b && /continue;/{exit} END{exit c?0:1}' <<<"$con" \
  && ok "a skipped slot is cleared before moving on" || bad "a skipped slot is left full (the producer would see the ring full forever)"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
