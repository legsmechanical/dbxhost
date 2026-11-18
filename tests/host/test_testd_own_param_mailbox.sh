#!/bin/bash
# test_testd_own_param_mailbox.sh — schwung-testd has its OWN param mailbox,
# and the shim maps it only while a live daemon claims it (zero cost otherwise).
#
# ⚠ THE BUG THIS PINS (device, 2026-11-18): testd shared /…-param with
# shadow_ui and the manager. "Wait until request_type == 0, then write" does
# not exclude another process, and the shim clears request_type before the
# requester copies the answer. Measured over 150 GETs: 5 s timeouts (a request
# overwritten before the shim read it) and WRONG answers — testd got the
# manager's rui_poll digest and pieces of shadow_ui's bulk replies, which
# desynced its line protocol. The shim and daemon are bound to SHM and cannot
# run here, so this pins the wiring.
set -e
cd "$(dirname "$0")/../.."
H=src/host/shadow_constants.h
S=src/schwung_shim.c
D=src/host/test_daemon/schwung_testd.c
fail=0
say() { echo "  $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

grep -q '#define SHM_TESTD_PARAM SCHWUNG_SHM_PREFIX "testd-param"' "$H" \
  && say "ok   — the daemon's mailbox has its own name" || bad "SHM_TESTD_PARAM missing"
grep -q 'volatile uint32_t testd_param_pid;' "$H" \
  && say "ok   — shadow_control names the owning daemon by pid" || bad "testd_param_pid missing"

# the daemon CREATES its mailbox at the shim's mapping size, never touches shadow_ui's
wire=$(awk '/^static int wire_shm\(/{f=1} f{print} f&&/^}/{exit}' "$D")
echo "$wire" | grep -q 'create_shm_rw(SHM_TESTD_PARAM, SHADOW_PARAM_BUFFER_SIZE' \
  && say "ok   — testd creates SHM_TESTD_PARAM at the size the shim maps" || bad "testd does not create its own mailbox"
echo "$wire" | grep -q '(SHM_SHADOW_PARAM,' \
  && bad "testd still maps shadow_ui's mailbox" || say "ok   — ...and no longer maps shadow_ui's"

# claim on start (header reset FIRST), release on both exits (pid cleared + unlink)
main=$(awk '/^int main\(/{f=1} f{print}' "$D")
reset_line=$(echo "$main" | grep -n 'request_type, 0, __ATOMIC_RELEASE' | head -1 | cut -d: -f1)
set_line=$(echo "$main" | grep -n 'testd_param_pid, (uint32_t)getpid()' | head -1 | cut -d: -f1)
[ -n "$set_line" ] && say "ok   — testd names itself on start" || bad "testd never claims the mailbox"
[ -n "$reset_line" ] && [ -n "$set_line" ] && [ "$reset_line" -lt "$set_line" ] \
  && say "ok   — ...after resetting the header (no stale request served)" || bad "header not reset before the claim"
nrel=$(echo "$main" | grep -c 'testd_release_mailbox(&shm)')
[ "$nrel" -ge 2 ] && say "ok   — the claim is released on every exit after it ($nrel)" || bad "released on $nrel exit path(s), want the listener failure AND the normal exit"
rel=$(awk '/^static void testd_release_mailbox\(/{f=1} f{print} f&&/^}/{exit}' "$D")
echo "$rel" | grep -q 'testd_param_pid, 0' && echo "$rel" | grep -q 'shm_unlink(SHM_TESTD_PARAM)' \
  && say "ok   — release clears the pid and unlinks the segment" || bad "release does not clear the pid and unlink"

# the shim: NOTHING mapped at startup — only the worker maps, and only for a live pid
grep -q 'shadow_shm_map(SHM_TESTD_PARAM' "$S" || bad "shim never maps the mailbox"
nmap=$(grep -c 'shadow_shm_map(SHM_TESTD_PARAM' "$S")
[ "$nmap" = 1 ] && say "ok   — one place maps it" || bad "mapped at $nmap sites"
hook=$(awk '/^static void shim_hook_testd_param\(/{f=1} f{print} f&&/^}/{exit}' "$S")
echo "$hook" | grep -q 'shadow_shm_map(SHM_TESTD_PARAM' && say "ok   — ...and it is the worker hook (never startup, never the SPI thread)" || bad "the map is not in the worker hook"
echo "$hook" | grep -q 'kill((pid_t)pid, 0)' && say "ok   — a dead daemon's pid counts as no daemon" || bad "no liveness check"
echo "$hook" | grep -q 'munmap(testd_param_retired' && say "ok   — the mailbox is unmapped when the claim goes" || bad "never unmapped"
# two-phase: the munmap happens BEFORE (i.e. a tick after) the pointer is retired
um=$(echo "$hook" | grep -n 'munmap(testd_param_retired' | head -1 | cut -d: -f1)
rt=$(echo "$hook" | grep -n 'testd_param_retired = testd_param_shm' | head -1 | cut -d: -f1)
[ -n "$um" ] && [ -n "$rt" ] && [ "$um" -lt "$rt" ] && say "ok   — unmap is a tick after retiring the pointer the SPI thread reads" || bad "unmap is not deferred a tick"
grep -q 'testd_param_service    = shim_hook_testd_param' "$S" && grep -q 'worker_hooks.testd_param_service()' src/host/shim_worker.c \
  && say "ok   — the worker calls the hook" || bad "the hook is not wired into the worker"

# SPI side: one pointer load, the same handler, the UI mailbox put back
blk=$(grep -n '__atomic_load_n(&testd_param_shm, __ATOMIC_ACQUIRE)' "$S" | head -1 | cut -d: -f1)
[ -n "$blk" ] || { bad "SPI side never loads the pointer"; blk=1; }
gate=$(sed -n "$((blk)),$((blk+7))p" "$S")
echo "$gate" | grep -q 'shadow_param = testd_mailbox;' && echo "$gate" | grep -q 'shadow_inprocess_handle_param_request();' \
  && say "ok   — the same handler serves the test mailbox" || bad "test mailbox not served"
echo "$gate" | grep -q 'shadow_param = ui_mailbox;' \
  && say "ok   — ...and shadow_ui's mailbox is put back right after" || bad "the UI mailbox pointer is not restored"
awk '/^static void shim_hook_testd_param\(/{skip=1} skip&&/^}/{skip=0;next} !skip' "$S" | grep -v '^ *\(\*\|/\*\|//\)' | grep -q 'testd_param_pid' \
  && bad "something besides the worker hook reads testd_param_pid" || say "ok   — only the worker reads the pid (the SPI thread never touches shared state for this)"
fn_ui=$(awk '/^[a-z].*\(.*\) *\{$/{fn=$0} /shadow_inprocess_handle_param_request\(\);/{print fn}' "$S" | sort -u | wc -l | tr -d ' ')
[ "$fn_ui" = 1 ] && say "ok   — both mailboxes are served from one function (same thread, same block)" || bad "handler called from $fn_ui functions"

# control: the pins can fail
echo 'if (map_shm_rw(SHM_SHADOW_PARAM, sizeof(shadow_param_t),' | grep -q 'create_shm_rw(SHM_TESTD_PARAM' \
  && bad "control: a shared-mailbox wire passed" || say "ok   — control: a shared-mailbox wire fails the pin"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
