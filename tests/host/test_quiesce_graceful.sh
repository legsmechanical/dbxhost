#!/usr/bin/env bash
# The GRACEFUL stock-Move exit in standalone/scripts/quiesce-stock.sh.
#
# 2026-09-15: a SIGSTOPped-then-SIGKILLed Move never quiesces the audio
# hardware. Captured 20:59:55 that night — a -3 dBFS burst starting exactly at
# launch.sh's kill sweep and running until our Move's first frames arrived
# (~1.5 s). An identical launch was silent, so the codec is non-deterministic
# once it is driverless; the fix is to give stock an ORDERLY shutdown before the
# sweep, which quiesces it on the way out.
#
# That shutdown needs a THREAD-directed SIGTERM. MoveOriginal handles SIGTERM on
# one thread parked in rt_sigtimedwait — the only thread of the process whose
# SigBlk is 0 — and a process-directed kill lands on whichever thread happens to
# have SIGTERM unblocked (in the stock stack, a shim helper whose crash handler
# _exit()s). So the picker is the load-bearing part, and it gets a real unit
# below against a fake /proc tree; the rest are source pins on the sequence.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

Q=standalone/scripts/quiesce-stock.sh
P=standalone/scripts/pick-signal-thread.py
[ -f "$Q" ] && [ -f "$P" ] || { echo "FAIL: missing $Q or $P"; exit 1; }

# Strip comments so no pin can be satisfied by prose.
code() { grep -v '^[[:space:]]*#' "$Q"; }
lineof() { code | grep -n -- "$1" | head -1 | cut -d: -f1; }

echo "quiesce-stock.sh graceful exit:"

# 1. Placement: on every route the graceful step sits AFTER save_song and
#    BEFORE (as the alternative to) freeze_move. The param-bus deadlock that
#    the freeze comment records applies here identically.
calls=$(code | grep -c 'graceful_move_exit || freeze_move')
routes=$(code | grep -c '^[[:space:]]*save_song$')
if [ "$calls" -ge 3 ] && [ "$calls" -eq "$routes" ]; then
    ok "every save_song route ($routes) is followed by 'graceful_move_exit || freeze_move'"
else
    bad "graceful step is on $calls of $routes save_song routes — it must be on all of them"
fi
badorder=0
while read -r n; do
    prev=$(code | sed -n "$((n - 1))p")
    case "$prev" in *save_song) ;; *) badorder=1 ;; esac
done <<EOF
$(code | grep -n 'graceful_move_exit || freeze_move' | cut -d: -f1)
EOF
[ "$badorder" -eq 0 ] \
    && ok "each graceful call is immediately preceded by save_song" \
    || bad "a graceful call does not follow save_song — the D-Bus save must finish first"

# 2. It refuses to run while shadow_ui is still live (same constraint as the
#    freeze: the shim serves the param bus shadow_ui blocks on).
body=$(code | sed -n '/^graceful_move_exit()/,/^}/p')
printf '%s\n' "$body" | grep -q 'shadow_ui_live' \
    && ok "graceful_move_exit checks shadow_ui_live before signalling" \
    || bad "graceful_move_exit does not gate on shadow_ui_live — it can deadlock the save"

# 3. tgkill, by number, behind an arch guard.
printf '%s\n' "$body" | grep -q 'syscall(131' \
    && ok "uses tgkill (aarch64 syscall 131)" \
    || bad "no tgkill(131) — a process-directed kill can be taken by the wrong thread"
if printf '%s\n' "$body" | grep -q 'uname -m' \
   && printf '%s\n' "$body" | grep -q 'aarch64' \
   && printf '%s\n' "$body" | grep -q 'kill -TERM'; then
    ok "arch-guarded: non-aarch64 falls back to a process-directed kill -TERM"
else
    bad "the tgkill number is not guarded by uname -m with a kill -TERM fallback"
fi

# 4. The thread is selected by SigBlk == 0, and the picker is invoked.
printf '%s\n' "$body" | grep -q 'pick-signal-thread.py\|PICK_SIGNAL_THREAD' \
    && ok "graceful_move_exit calls the signal-thread picker" \
    || bad "graceful_move_exit does not call pick-signal-thread.py"
grep -q 'SigBlk' "$P" && grep -q 'blk == 0' "$P" \
    && ok "picker selects on SigBlk == 0 (world-readable; we run as ableton)" \
    || bad "picker does not select on a zero SigBlk mask"

# 5. A 3 s bound on the wait, polled at 100 ms, and it is not silent.
if printf '%s\n' "$body" | grep -q '\-lt 30' && printf '%s\n' "$body" | grep -q 'sleep 0.1'; then
    ok "bounded wait: 30 polls x 100 ms = 3 s"
else
    bad "no 3 s bound on the graceful wait (want 30 iterations of sleep 0.1)"
fi
printf '%s\n' "$body" | grep -q 'no graceful exit after 3 s' \
    && ok "the timeout says so and falls through to the freeze" \
    || bad "the timeout path does not log its fall-through to the freeze"

# 6. The knob really can turn it off, and defaults ON.
if code | grep -q 'DBX_QUIESCE_GRACEFUL:-1'; then
    ok "DBX_QUIESCE_GRACEFUL defaults to 1 (ON)"
else
    bad "DBX_QUIESCE_GRACEFUL has no default-ON parameter expansion"
fi
if code | grep -q 'GRACEFUL_OFF_FLAG=/data/UserData/dbx-host/' && code | grep -q '\[ -e "\$GRACEFUL_OFF_FLAG" \]'; then
    ok "a touch-file flag (absolute path) also disables it on the device"
else
    bad "no absolute-path file flag to disable the graceful exit without a redeploy"
fi
# Behavioural: with the knob off, graceful_enabled must return non-zero.
if ( set -e
     eval "$(sed -n '/^graceful_enabled()/,/^}/p' "$Q")"
     GRACEFUL_OFF_FLAG=/nonexistent-flag-file
     DBX_QUIESCE_GRACEFUL=0 graceful_enabled && exit 1
     DBX_QUIESCE_GRACEFUL=1 graceful_enabled || exit 1
     unset DBX_QUIESCE_GRACEFUL; graceful_enabled || exit 1 ) 2>/dev/null
then ok "graceful_enabled: 0 disables, 1 enables, unset enables"
else bad "graceful_enabled does not honour DBX_QUIESCE_GRACEFUL (0 off / unset on)"
fi

# 7. Both signalled pids, child (higher pid) first.
printf '%s\n' "$body" | grep -q 'sort -rn' \
    && ok "both MoveOriginal pids are signalled, highest (the child) first" \
    || bad "the pid list is not ordered child-first (sort -rn)"

# 8. The picker itself, against a FAKE /proc. This is the part a source pin
#    cannot check, and the part everything else rests on.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkthread() { # dir tid sigblk comm [syscallline]
    d="$1/task/$2"; mkdir -p "$d"
    printf 'Name:\t%s\nTgid:\t1\nSigBlk:\t%s\nSigIgn:\t0000000000000000\n' "$4" "$3" > "$d/status"
    printf '%s\n' "$4" > "$d/comm"
    [ -n "${5:-}" ] && printf '%s\n' "$5" > "$d/syscall"
    return 0
}
# A Move-shaped process: many 0x4202 threads, one zero-mask thread.
mkdir -p "$tmp/proc/4242"; printf 'MoveOriginal\n' > "$tmp/proc/4242/comm"
mkthread "$tmp/proc/4242" 4242 0000000000004202 MoveOriginal
mkthread "$tmp/proc/4242" 4300 0000000000004202 AudioThread
mkthread "$tmp/proc/4242" 4310 0000000000000000 MoveOriginal
mkthread "$tmp/proc/4242" 4320 0000000000004202 Worker
got=$(python3 "$P" 4242 --proc-root "$tmp/proc" 2>/dev/null); rc=$?
if [ "$rc" = 0 ] && [ "$got" = 4310 ]; then
    ok "picker: finds the single SigBlk==0 thread (tid $got)"
else
    bad "picker returned '$got' (rc=$rc), want 4310"
fi
# No zero-mask thread anywhere: must FAIL, not guess. quiesce then freezes.
mkdir -p "$tmp/proc/5000"; printf 'MoveOriginal\n' > "$tmp/proc/5000/comm"
mkthread "$tmp/proc/5000" 5000 0000000000004202 MoveOriginal
mkthread "$tmp/proc/5000" 5001 0000000000004202 Worker
got=$(python3 "$P" 5000 --proc-root "$tmp/proc" 2>/dev/null); rc=$?
if [ "$rc" != 0 ] && [ -z "$got" ]; then
    ok "picker: no zero-mask thread -> exit 1, prints nothing (caller freezes as today)"
else
    bad "picker guessed a tid ('$got', rc=$rc) when no thread had a zero mask"
fi
# Two zero-mask threads: the one with rt_sigtimedwait evidence (syscall 137)
# wins over the lower tid.
mkdir -p "$tmp/proc/6000"; printf 'MoveOriginal\n' > "$tmp/proc/6000/comm"
mkthread "$tmp/proc/6000" 6001 0000000000000000 Helper
mkthread "$tmp/proc/6000" 6002 0000000000000000 MoveOriginal "137 0x1 0x2 0x3"
got=$(python3 "$P" 6000 --proc-root "$tmp/proc" 2>/dev/null)
[ "$got" = 6002 ] \
    && ok "picker: prefers the thread evidenced in rt_sigtimedwait (syscall 137)" \
    || bad "picker returned '$got' with syscall evidence present, want 6002"
# STOCK-shaped (measured 2026-09-15, stock 1.4.0 pid 8783): six zero-mask
# threads — five stock-shim helpers (loggers in nanosleep, the worker in a
# futex) and Move's signal thread — with NO readable syscall/wchan evidence,
# then Move's named threads. The signal thread is the highest zero-mask tid
# below the first named thread (8843 < sentry-http 8850). The naive lowest
# tid (8836) is a shim logger: aiming there reproduces the abrupt exit.
mkdir -p "$tmp/proc/8783"; printf 'MoveOriginal\n' > "$tmp/proc/8783/comm"
mkthread "$tmp/proc/8783" 8783 0000000000004202 MoveOriginal
for t in 8836 8838 8839 8840 8841 8843; do mkthread "$tmp/proc/8783" $t 0000000000000000 MoveOriginal; done
mkthread "$tmp/proc/8783" 8850 0000000000004202 sentry-http
mkthread "$tmp/proc/8783" 8856 0000000000004202 "Link Main"
mkthread "$tmp/proc/8783" 8859 0000000000004202 MoveOriginal
mkthread "$tmp/proc/8783" 8865 0000000000004202 "Audio Main/SPI"
got=$(python3 "$P" 8783 --proc-root "$tmp/proc" 2>/dev/null)
[ "$got" = 8843 ] \
    && ok "picker: stock-shaped process -> the last zero-mask thread before Move's named threads (8843)" \
    || bad "picker returned '$got' for the stock-shaped layout, want 8843 (8836 would hit a shim logger)"
# OUR host's shape (7742-7746 are our wrapped threads, mask 0x4003; 7748 the signal thread).
mkdir -p "$tmp/proc/7740"; printf 'MoveOriginal\n' > "$tmp/proc/7740/comm"
mkthread "$tmp/proc/7740" 7740 0000000000004202 MoveOriginal
for t in 7742 7743 7744 7745 7746; do mkthread "$tmp/proc/7740" $t 0000000000004003 MoveOriginal; done
mkthread "$tmp/proc/7740" 7748 0000000000000000 MoveOriginal
mkthread "$tmp/proc/7740" 7749 0000000000004202 sentry-http
got=$(python3 "$P" 7740 --proc-root "$tmp/proc" 2>/dev/null)
[ "$got" = 7748 ] && ok "picker: our host's shape -> 7748" || bad "picker returned '$got' for our host's layout, want 7748"
python3 "$P" 999999 --proc-root "$tmp/proc" >/dev/null 2>&1 \
    && bad "picker succeeded on a nonexistent pid" \
    || ok "picker: unknown pid -> exit 1"

# 9. Everything still parses.
sh -n "$Q" && python3 -m py_compile "$P" && ok "quiesce-stock.sh parses; picker compiles" \
    || bad "a script does not parse"

# Control: this suite catches a revert. Removing the SigBlk rule from the picker
# fails step 4 and step 8; dropping the `|| freeze_move` fallback fails step 1.
[ "$fail" -eq 0 ] && echo "PASS: graceful stock-Move exit is pinned" \
                  || { echo "FAIL: quiesce graceful"; exit 1; }
exit 0
