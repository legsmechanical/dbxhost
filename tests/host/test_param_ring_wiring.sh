#!/bin/bash
# test_param_ring_wiring.sh — the param WRITE LANE is wired on both sides of
# the shim seam, and in the right order.
#
# The lane (shadow_param_ring.h) is only a ring; what makes it correct is the
# wiring: the shim drains it BEFORE it services the mailbox in the same frame
# (a write pushed before a read lands before the read), the producer uses it
# only for small fire-and-forget SETs while the ordered fallback queue is
# empty, both sides name ONE segment and ONE version byte, and an old shim
# (no handshake) leaves every write on the mailbox.
set -e
cd "$(dirname "$0")/../.."
SHIM=src/schwung_shim.c; UI=src/shadow/shadow_ui.c; H=src/host/shadow_param_ring.h; C=src/host/shadow_constants.h
fail=0; say() { echo "  $1"; }; bad() { echo "  FAIL — $1"; fail=1; }

# one segment name, one version, in the constants
grep -q '^#define SHM_SHADOW_PARAM_WRITE ' "$C" && say "ok   — the lane's segment is named once, in shadow_constants.h" || bad "no SHM_SHADOW_PARAM_WRITE"
grep -q '^#define SHADOW_PARAM_WRITE_VERSION ' "$C" && say "ok   — ...with a handshake version" || bad "no version"

# consumer: created by the shim, handshake published, drained BEFORE the mailbox
grep -q 'shadow_shm_map(SHM_SHADOW_PARAM_WRITE' "$SHIM" && say "ok   — the shim creates the segment" || bad "shim does not create the lane"
grep -q 'reserved\[1\], (uint8_t)SHADOW_PARAM_WRITE_VERSION' "$SHIM" && say "ok   — ...and publishes the handshake byte" || bad "no handshake publish"
frame=$(awk '/shadow_drain_param_write\(\);/{a=NR} /shadow_inprocess_handle_param_request\(\);/{b=NR} END{print a" "b}' "$SHIM")
a=${frame% *}; b=${frame#* }
[ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] && [ $((b - a)) -le 3 ] && say "ok   — the frame drains the lane FIRST, then services the mailbox" || bad "drain is not immediately before the mailbox service ($frame)"
grep -q 'shadow_direct_set_param(e->slot, e->key, e->value)' "$SHIM" && say "ok   — entries take the mailbox SET's own route (shadow_direct_set_param)" || bad "lane entries bypass the direct-set route"
grep -q 'overtake_dsp_gen->set_param(overtake_dsp_gen_inst, e->key + 13, e->value)' "$SHIM" && say "ok   — ...and overtake keys reach the overtake DSP" || bad "overtake keys not routed"
grep -q '"param write lane: drained=%u pending=%u"' "$SHIM" && say "ok   — the spi_timing block reports the lane (the device measurement hook)" || bad "no counter line"

# producer: small fire-and-forget SETs only, queue empty, fallback intact
body=$(awk '/^static int shadow_set_param_common\(/{f=1} f{print} f&&/^}/{exit}' "$UI")
echo "$body" | grep -q 'spw_ready(shadow_param_write) && spq_count(&g_param_pending) == 0' && say "ok   — the producer uses the lane only when ready AND the fallback queue is empty" || bad "lane gate wrong"
echo "$body" | grep -q 'spw_push(shadow_param_write, (uint8_t)slot, key, value)' && say "ok   — ...pushing the SET" || bad "no push"
echo "$body" | grep -q 'spq_offer(&g_param_pending' && say "ok   — the pending queue remains the fallback" || bad "fallback gone"
# a blocking SET never touches the lane (it must see its own write answered)
blocking=$(echo "$body" | awk '/if \(!shadow_param_wait_idle\(timeout_ms\)\)/{f=1} f')
echo "$blocking" | grep -q 'spw_push' && bad "a blocking SET uses the lane" || say "ok   — blocking SETs keep the mailbox (they wait for an answer)"
grep -q 'shadow_shm_map(SHM_SHADOW_PARAM_WRITE, sizeof(web_param_set_ring_t), 0, 0)' "$UI" && say "ok   — shadow_ui ATTACHES (never creates) the lane, optional" || bad "shadow_ui creates or requires the lane"

# the header: size-gated push, refuse when full, handshake read with acquire
grep -q 'strlen(value) < WEB_PARAM_VALUE_LEN' "$H" && say "ok   — an oversize value is refused (takes the mailbox)" || bad "no size gate"
grep -q 'if (spw_count(r) >= WEB_PARAM_SET_ENTRIES) return 0;' "$H" && say "ok   — a full ring refuses, never overwrites" || bad "no full check"
grep -q '__atomic_load_n(&r->reserved\[1\], __ATOMIC_ACQUIRE) == SHADOW_PARAM_WRITE_VERSION' "$H" && say "ok   — readiness is the consumer's version byte" || bad "handshake not checked"

# control: the pins can fail
echo "static int shadow_set_param_common(int a) {\n}" | grep -q 'spw_push' && bad "control: an empty body passed" || say "ok   — control: an empty set_common fails the pin"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
