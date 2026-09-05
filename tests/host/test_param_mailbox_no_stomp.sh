#!/bin/bash
# test_param_mailbox_no_stomp.sh — a fire-and-forget SET never STOMPS the
# mailbox; it queues, in order, and every path that takes the mailbox drains
# the queue first.
#
# ⚠ THE BUG THIS PINS (device, 2026-08-23; fixed 2026-09-05): shadow_set_param
# in overtake waited 8 ms for the single-slot mailbox and then overwrote it —
# back-to-back SETs on different keys lost the first on a late SPI frame. The
# ring itself is unit-tested (test_shadow_param_queue.c); this pins the WIRING
# in shadow_ui.c, which is bound to SHM and QuickJS and cannot be run here.
set -e
cd "$(dirname "$0")/../.."
C=src/shadow/shadow_ui.c
fail=0
say() { echo "  $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

# the set path, from set_common's signature to its closing brace
body=$(awk '/^static int shadow_set_param_common\(/{f=1} f{print} f&&/^}/{exit}' "$C")
[ -n "$body" ] || { bad "shadow_set_param_common not found"; echo "FAIL"; exit 1; }

echo "$body" | grep -q 'spq_offer(&g_param_pending' && say "ok   — the fire-and-forget SET is OFFERED to the queue" || bad "no spq_offer in set_common"
echo "$body" | grep -q 'act == SPQ_QUEUED' && say "ok   — ...and a QUEUED answer returns without touching the mailbox" || bad "QUEUED branch missing"
# the old stomp: wait 8 then a raw commit, with no queue in between. Allowed
# only under the FALLBACK label (full queue / oversize value).
stomp_ctx=$(echo "$body" | grep -B3 'shadow_param_wait_idle(8);' | head -8)
echo "$stomp_ctx" | grep -q 'SPQ_FALLBACK' && say "ok   — the 8 ms wait-then-claim survives ONLY as the FALLBACK" || bad "the 8 ms wait-then-claim is not confined to the fallback"
n8=$(echo "$body" | grep -c 'shadow_param_wait_idle(8);')
[ "$n8" = 1 ] && say "ok   — ...exactly once" || bad "wait_idle(8) appears $n8 times"

# every mailbox writer goes through ONE commit function
ncommit=$(grep -c '__atomic_store_n(&shadow_param->request_type, (uint8_t)1, __ATOMIC_RELEASE)' "$C")
[ "$ncommit" = 1 ] && say "ok   — one SET commit site (shadow_param_commit_set)" || bad "SET is committed at $ncommit sites"

# blocking callers drain first: wait_idle drains as it goes
wi=$(awk '/^static int shadow_param_wait_idle\(/{f=1} f{print} f&&/^}/{exit}' "$C")
echo "$wi" | grep -q 'shadow_param_drain_pending()' && say "ok   — wait_idle drains the pending queue before answering idle" || bad "wait_idle does not drain"
echo "$wi" | grep -q 'spq_count(&g_param_pending) == 0' && say "ok   — ...and idle means EMPTY queue too" || bad "wait_idle can answer idle with writes pending"

# the main loop drains every iteration, before MIDI and tick
loop=$(awk '/while \(!global_exit_flag\) \{/{f=1} f{print} f&&/callGlobalFunction\(ctx, &JSTick, 0\)/{exit}' "$C")
echo "$loop" | grep -q 'shadow_param_drain_pending()' && say "ok   — the main loop drains before MIDI and tick" || bad "main loop does not drain"

# the drain commits at most ONE per call — the mailbox holds one request
dr=$(awk '/^static uint32_t shadow_param_drain_pending\(/{f=1} f{print} f&&/^}/{exit}' "$C")
echo "$dr" | grep -q 'if (spq_count' && ! echo "$dr" | grep -q 'while (spq_count' && say "ok   — the drain commits one entry per idle mailbox, not a burst" || bad "drain is a loop"

# control: the pins can fail
echo "static int shadow_set_param_common(int a) {\n}" | grep -q 'spq_offer' && bad "control: an empty body passed" || say "ok   — control: an empty set_common fails the pin"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
