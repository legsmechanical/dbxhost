#!/bin/bash
# test_manager_own_param_mailbox.sh — schwung-manager has its OWN param
# mailbox; the shim maps it only while the manager's file exists.
#
# ⚠ THE BUG THIS PINS (device, 2026-11-18): the manager shared shadow_ui's
# mailbox. With a remote page open and the transport stopped, over ~70 s the
# device UI saw 7 reads time out (null, after a 100 ms wait) and the manager
# lost 35 of 377 requests and read one answer that was not its own. The
# manager half (claim on use, release when idle) is shmparams_private_test.go;
# this pins the shim half, which is bound to SHM and cannot run here.
set -e
cd "$(dirname "$0")/../.."
H=src/host/shadow_constants.h
S=src/schwung_shim.c
G=schwung-manager/shmparams.go
fail=0
say() { echo "  $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

grep -q '#define SHM_WEB_PARAM SCHWUNG_SHM_PREFIX "web-param"' "$H" \
  && say "ok   — the manager's mailbox has its own name" || bad "SHM_WEB_PARAM missing"
grep -q 'shmPath("web-param")' "$G" \
  && say "ok   — ...and the manager uses that name" || bad "manager does not name web-param"
# the manager never maps shadow_ui's mailbox any more: OpenShmParams only stats it
op=$(awk '/^func OpenShmParams\(/{f=1} f{print} f&&/^}/{exit}' "$G")
echo "$op" | grep -q 'os.Stat(shmParamPath)' && ! echo "$op" | grep -q 'Mmap' \
  && say "ok   — OpenShmParams checks shadow_ui's segment exists, maps nothing" || bad "OpenShmParams still maps shadow_ui's mailbox"
grep -q 'shmPrivMailboxSize = 133120' "$G" && grep -q '#define SHADOW_PARAM_BUFFER_SIZE  133120' "$H" \
  && say "ok   — the manager sizes its file to SHADOW_PARAM_BUFFER_SIZE (the shim refuses less)" || bad "file size and SHADOW_PARAM_BUFFER_SIZE disagree"

# shim: mapped only by the worker hook, keyed on the inode, two-phase unmap
hook=$(awk '/^static void shim_hook_web_param\(/{f=1} f{print} f&&/^}/{exit}' "$S")
[ -n "$hook" ] || bad "shim_hook_web_param missing"
nmap=$(grep -c 'shadow_shm_map(SHM_WEB_PARAM,' "$S")
[ "$nmap" = 1 ] && echo "$hook" | grep -q 'shadow_shm_map(SHM_WEB_PARAM,' \
  && say "ok   — one place maps it, the worker hook" || bad "mapped at $nmap sites / not in the hook"
echo "$hook" | grep -q 'st.st_ino' && say "ok   — the claim is keyed on the file's inode" || bad "not keyed on the inode"
um=$(echo "$hook" | grep -n 'munmap(web_param_retired' | head -1 | cut -d: -f1)
rt=$(echo "$hook" | grep -n 'web_param_retired = web_param_shm' | head -1 | cut -d: -f1)
[ -n "$um" ] && [ -n "$rt" ] && [ "$um" -lt "$rt" ] \
  && say "ok   — unmap is a tick after retiring the pointer" || bad "unmap is not deferred a tick"
awk '/^static void shim_hook_private_mailboxes\(/{f=1} f{print} f&&/^}/{exit}' "$S" | grep -q 'shim_hook_web_param();' \
  && say "ok   — the worker runs it" || bad "the worker does not run it"

# SPI side: a pointer load, the same handler, the UI mailbox put back
blk=$(grep -n '__atomic_load_n(&web_param_shm, __ATOMIC_ACQUIRE)' "$S" | head -1 | cut -d: -f1)
[ -n "$blk" ] || { bad "SPI side never loads the pointer"; blk=1; }
gate=$(sed -n "$((blk)),$((blk+7))p" "$S")
echo "$gate" | grep -q 'shadow_param = web_mailbox;' && echo "$gate" | grep -q 'shadow_inprocess_handle_param_request();' \
  && echo "$gate" | grep -q 'shadow_param = ui_mailbox;' \
  && say "ok   — served by the same handler, shadow_ui's mailbox put back" || bad "not served, or UI mailbox not restored"
awk '/^static void shim_hook_web_param\(/{skip=1} skip&&/^}/{skip=0;next} !skip' "$S" | grep -v '^ *\(\*\|/\*\|//\)' | grep -q 'stat("/dev/shm" SHM_WEB_PARAM' \
  && bad "something besides the worker stats the file" || say "ok   — only the worker looks at the file"

# control: the pins can fail
echo 'data, err := syscall.Mmap(' | grep -q 'Mmap' && say "ok   — control: a mapping OpenShmParams would fail the pin" || bad "control broken"

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; exit 1; }
