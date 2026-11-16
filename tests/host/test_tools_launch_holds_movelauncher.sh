#!/usr/bin/env bash
# A Tools-door launch must not flash "Move crashed".
#
# MoveLauncher SUPERVISES stock MoveOriginal and shows "Move crashed" the moment
# its Move exits, however orderly. quiesce-stock.sh ends stock Move gracefully a
# second before launch.sh's sweep removes MoveLauncher, so the dialog flashed on
# every Tools launch (Josh, 2026-11-16: "it gives a brief 'move crashed' error
# before davebox loads"). The fix holds MoveLauncher (SIGSTOP) before Move is
# signalled; the sweep then ends a held one with SIGKILL, because a held
# process only queues a TERM; refuse() continues it if the launch stops short.
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

Q=standalone/scripts/quiesce-stock.sh
L=standalone/scripts/launch.sh
code() { grep -v '^[[:space:]]*#' "$1"; }

echo "Tools launch holds MoveLauncher:"

# 1. quiesce: hold_launcher runs inside graceful_move_exit, BEFORE the signal.
body=$(code "$Q" | sed -n '/^graceful_move_exit()/,/^}/p')
h=$(printf '%s\n' "$body" | grep -n '^[[:space:]]*hold_launcher$' | head -1 | cut -d: -f1)
s=$(printf '%s\n' "$body" | grep -n 'syscall(131' | head -1 | cut -d: -f1)
if [ -n "$h" ] && [ -n "$s" ] && [ "$h" -lt "$s" ]; then
    ok "graceful_move_exit holds MoveLauncher before signalling Move"
else
    bad "hold_launcher is not called before the tgkill in graceful_move_exit (hold=$h signal=$s)"
fi
code "$Q" | sed -n '/^hold_launcher()/,/^}/p' | grep -q 'kill -STOP' \
    && ok "hold_launcher stops it with SIGSTOP" \
    || bad "hold_launcher does not SIGSTOP MoveLauncher"

# 2. launch.sh: the sweep's TERM pass, run for real against a stopped process.
#    Lift the loop, point pidof at a stand-in named MoveLauncher, and check that
#    the held one is KILLed (a TERM alone would leave it stopped forever).
# Only the FIRST such loop (the TERM pass): the second is the KILL pass, and
# lifting both would kill the stand-in whatever the TERM pass does.
loop=$(awk '/^  for name in \$SWEEP_NAMES; do$/{f=1} f{print} f&&/^  done$/{exit}' "$L")
printf '%s\n' "$loop" | grep -q 'kill -9 \$pids' && bad "the lifted loop includes the KILL pass"

printf '%s\n' "$loop" | grep -q 'held by quiesce' || bad "cannot find the sweep TERM loop with the held-launcher branch"
tmp=$(mktemp -d)
trap 'p=$(cat "$tmp/pid" 2>/dev/null); [ -n "$p" ] && { pkill -9 -P "$p"; kill -9 "$p"; } 2>/dev/null; rm -rf "$tmp"' EXIT
# The stand-in HANDLES TERM, as MoveLauncher does (a TERM'd one exits with a
# status, not a signal). That matters: Linux kills even a STOPPED process on a
# TERM it does not handle, so a bare sleep would pass with TERM alone.
bash -c 'trap "exit 3" TERM; while :; do sleep 0.05; done' &
pid=$!; echo "$pid" > "$tmp/pid"
# Stop it only once the handler is installed (SigCgt bit 15), or the TERM
# would still be default-fatal and prove nothing.
for _ in $(seq 50); do
    cgt=$(sed -n 's/^SigCgt:[[:space:]]*//p' "/proc/$pid/status" 2>/dev/null)
    [ -n "$cgt" ] && [ $(( 0x$cgt & 0x4000 )) -ne 0 ] && break
    sleep 0.02
done
kill -STOP "$pid"
sleep 0.1
if [ ! -r "/proc/$pid/stat" ]; then
    echo "  skip — no /proc here (runs on Linux: scripts/test-linux.sh / CI)"
else
    out=$(SWEEP_NAMES="MoveLauncher" bash -c "pidof() { [ \"\$1\" = MoveLauncher ] && echo $pid; }; $loop" 2>&1)
    sleep 0.2
    st=$(cut -d' ' -f3 "/proc/$pid/stat" 2>/dev/null || echo gone)
    case "$st" in
        gone|Z) ok "a held MoveLauncher is KILLed by the sweep ($out)" ;;
        *) bad "a held MoveLauncher survived the sweep in state $st ($out)" ;;
    esac
fi

# 3. refuse() lets a held MoveLauncher run again (Tools door only).
code "$L" | sed -n '/^  refuse() {/,/^  }/p' | grep -q 'at_boot || pkill -CONT -x MoveLauncher' \
    && ok "refuse() continues a held MoveLauncher, Tools door only" \
    || bad "refuse() does not CONT MoveLauncher — a refused launch would leave it stopped with no Move"

# 4. The launch body is one single-quoted string: it must still parse.
bash -n "$L" && ok "launch.sh parses" || bad "launch.sh no longer parses"

[ "$fail" -eq 0 ] && echo "PASS" || { echo "FAIL"; exit 1; }
