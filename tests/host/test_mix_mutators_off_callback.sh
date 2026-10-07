#!/usr/bin/env bash
# MUTE AND SOLO DO NO FILE I/O ON THE AUDIO THREAD (from upstream #552 / #572).
#
# shadow_apply_mute and the solo setters run on the SPI callback: a session's
# mixer writes slot:muted / slot:soloed / move_fx:N:* through the param serve.
# They used to call shadow_save_state() (fopen + a full rewrite of the config
# file) and shadow_log() (unified_log: fopen/fprintf/fflush when debug logging
# is armed) right there. Now they only ASK: a flag for the save, a counter for
# the log, both serviced by the shim worker thread.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*"; exit 1; }
M=src/host/shadow_chain_mgmt.c

for fn in 'void shadow_apply_mute(int slot, int is_muted)' \
          'void shadow_chain_set_solo(int slot, int is_soloed)' \
          'void shadow_toggle_solo(int slot)' \
          'void shadow_move_fx_apply_mute(int bus, int is_muted)' \
          'void shadow_move_fx_set_solo(int bus, int is_soloed)'; do
    body=$(awk -v f="$fn" 'index($0, f) == 1 {on=1} on {print} on && /^}/ {exit}' "$M")
    [ -n "$body" ] || fail "cannot find: $fn"
    code=$(printf '%s\n' "$body" | grep -vE '^\s*(/\*|\*|//)')
    if printf '%s\n' "$code" | grep -q 'shadow_save_state()'; then fail "$fn saves the config file on the audio thread"; fi
    if printf '%s\n' "$code" | grep -q 'shadow_log('; then fail "$fn logs on the audio thread"; fi
done
# ...and what they ask for is actually done: a request with no servicer is a
# mute that is never saved.
awk '/^void shadow_apply_mute\(/,/^}/' "$M" | grep -q 'shadow_request_save_state();' \
    || fail "a mute no longer asks for a save at all"
awk '/^void shadow_toggle_solo\(/,/^}/' "$M" | grep -q 'shadow_request_save_state();' \
    || fail "a solo toggle no longer asks for a save at all"
grep -q '^        shadow_save_state_service();' src/host/shim_worker.c \
    || fail "the shim worker does not service the save request"
grep -q '^        shadow_mix_log_service();' src/host/shim_worker.c \
    || fail "the shim worker does not service the mix log"
grep -q 'if (__atomic_exchange_n(&g_save_requested, 0, __ATOMIC_ACQ_REL)) shadow_save_state();' src/host/shadow_state.c \
    || fail "shadow_save_state_service does not save when asked"
echo "PASS: mute and solo only ask; the worker saves and logs"
