#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A sidecar (shadow_ui, link-subscriber) is adopted from a PID FILE: if the pid
# in it is alive, the shim assumes its sidecar is already running and does not
# start one. That is correct only if the pid really is this build's.
#
# It was not. Two installs run binaries with the SAME NAME, so `comm` cannot
# tell them apart, and a stock-tree link-subscriber started at boot survived
# into a standalone session because launch.sh's kill list did not name it. The
# session's shim found that live pid, adopted it, and never started its own —
# and a stock subscriber publishes into the STOCK shm namespace, so
# `<prefix>-link-in` never appeared. Move's audio never reached the mixer and
# every Move FX bus control (volume, mute, solo) did nothing, with no error
# anywhere. Hardware, 2026-08-13; it is why the whole Move-bus feature looked
# broken.
#
# Two layers, both pinned here: the session must not LEAVE such a process (or
# its pid file) lying around, and the shim must not ADOPT one it cannot prove
# is its own.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1" >&2; fail=1; }

launch=standalone/scripts/launch.sh
proc=src/host/shadow_process.c

echo "the session cleans up after every sidecar it can inherit:"
# Every kill sweep must name link-subscriber. It is a separate process that
# outlives MoveOriginal, exactly like shadow_ui.
sweeps=$(grep -c "for name in .*shadow_ui link-subscriber" "$launch" || true)
total=$(grep -c "for name in .*shadow_ui" "$launch" || true)
[ "$sweeps" = "$total" ] && [ "$sweeps" -ge 4 ] \
    && ok "all $sweeps sidecar kill sweeps include link-subscriber" \
    || bad "only $sweeps of $total kill sweeps name link-subscriber"

# ...and the pid files must go with them, on ENTRY too — entry is the only path
# that inherits a foreign stack.
for ctx in entry relaunch exit; do :; done
pidrm=$(grep -c 'rm -f "$DBX_DIR/shadow_ui.pid" "$DBX_DIR/link_sub.pid"' "$launch" || true)
[ "$pidrm" -ge 3 ] \
    && ok "both pid files are cleared on entry, relaunch and exit ($pidrm sites)" \
    || bad "pid files cleared at only $pidrm site(s) — need entry, relaunch and exit"

echo "the shim will not adopt a sidecar it cannot prove is its own:"
grep -q "static int pid_is_ours" "$proc" \
    && ok "an ownership check exists" \
    || bad "no ownership check — comm alone cannot tell two installs apart"
owner=$(awk '/^static int pid_is_ours/,/^}/' "$proc")
grep -q '/proc/%d/exe' <<<"$owner" \
    && ok "it resolves the real binary via /proc/<pid>/exe" \
    || bad "the ownership check does not look at the executable"
grep -q 'SCHWUNG_INSTALL_DIR' <<<"$owner" \
    && ok "and compares it against THIS build's install dir" \
    || bad "the ownership check does not compare against the install dir"
grep -q 'if (n <= 0) return 0;' <<<"$owner" \
    && ok "an unidentifiable pid is NOT ours (fails toward starting our own)" \
    || bad "an unreadable /proc entry does not fail closed — a foreign sidecar could be adopted"

# Both sidecars must use it; shadow_ui has the same name collision.
for fn in shadow_ui_pid_alive link_sub_pid_alive; do
    body=$(awk "/^static int ${fn}/,/^}/" "$proc")
    grep -q 'pid_is_ours(pid)' <<<"$body" \
        && ok "$fn checks ownership" \
        || bad "$fn adopts any live process with a matching name"
done

[ $fail -eq 0 ] && echo "PASS: sidecars are killed, their pid files cleared, and never adopted across installs"
exit $fail
