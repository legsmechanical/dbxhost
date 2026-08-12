#!/usr/bin/env bash
set -euo pipefail

# "Is a standalone session live?" must be answered by LIVENESS, never a marker.
#
# History (both failure modes shipped): the /data marker standalone_active was
# removed only on the clean-exit path, so a hard reboot left it behind and
# every davebox Quit became a surprise device restart; boot-id stamping fixed
# that, but a session that CRASHED left a same-boot marker that refused every
# launch until reboot. P4b replaced the marker with a /dev/shm flock whose
# payload is the supervisor PID:
#   - the launcher holds the flock for the life of the session; a second
#     launch's flock -n fails while (and only while) the session is live;
#   - a crash releases the lock, a reboot clears /dev/shm — by construction;
#   - readers (shadow UI, installer) probe the PID against /proc.
#
# Three consumers must agree on the mechanism, or the bug comes back through
# whichever one drifts: the launcher (lock + double-launch guard), the shadow
# UI (Shift+Back routing / in-session launch refusal), and the installer
# (refuse-to-deploy check). Path agreement is pinned by check-config.sh
# (DBX_SESSION_LOCK); this test pins the SEMANTICS.

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

launch="standalone/scripts/launch.sh"
ui="src/shadow/shadow_ui.js"
# The JS probe moved out of shadow_ui.js into a shared module once the file
# browsers needed the same answer (to hide a live session's project library).
# shadow_ui.js is still a CONSUMER — it routes Shift+Back on it — so both files
# are checked: the semantics where they now live, the retired marker in both.
probe="src/shared/session_state.mjs"
inst="standalone/scripts/install-host.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. The launcher guards with a non-blocking flock held on a long-lived fd.
rg -q 'flock -n 9' "$launch" \
  || fail "$launch lost the flock double-launch guard"
rg -q 'refusing to launch' "$launch" \
  || fail "$launch no longer refuses on a held lock"

# 2. The lock must be opened O_APPEND (9>>): a REFUSED launch must not
#    truncate the live session's PID payload as a side effect of opening.
rg -q '9>>/dev/shm/\.dbxhost-session\.lock' "$launch" \
  || fail "$launch opens the lock with truncation (or moved it) — a refused launch would empty the live session's PID payload"

# 3. The lock path must be a DOTFILE the dbxhost-* SHM wipes cannot match —
#    deleting the locked inode would let a second launcher lock a fresh file
#    at the same path.
rg -q 'rm -f /dev/shm/schwung-\* /dev/shm/dbxhost-\*' "$launch" \
  || fail "$launch lost the SHM wipe this dotfile requirement exists for (re-check the interaction before relaxing this)"
rg -q '/dev/shm/\.dbxhost-session\.lock' "$launch" \
  || fail "$launch lock file is not the dotfile path"

# 4. Nobody writes the retired /data marker any more (the launcher may still
#    rm a stale one; writing it would resurrect the staleness protocol).
if rg -n 'standalone_active' "$launch" "$ui" "$probe" "$inst" | rg -qv 'rm -f|retired|HISTORY|marker'; then
  fail "a consumer still reads or writes the retired standalone_active marker"
fi
rg -q '> "\$DBX_DIR/standalone_active"' "$launch" \
  && fail "$launch writes the retired standalone_active marker"

# 5. The shared probe answers by PID liveness with PERMISSIVE fallbacks — a
#    false negative sends Shift+Back down the teardown path during a real
#    session, AND exposes the live project library to the file browsers.
rg -q '/proc/. \+ pid \+ ./cmdline' "$probe" \
  || rg -qF '"/proc/" + pid + "/cmdline"' "$probe" \
  || fail "$probe no longer probes the lock PID against /proc"
rg -q 'assume live' "$probe" \
  || fail "$probe lost the permissive fallbacks (unreadable/garbled payload must count as live)"
# ...and the shadow UI consumes THAT one, rather than growing its own copy back.
rg -q 'session_state\.mjs' "$ui" \
  || fail "$ui no longer imports the shared session probe"
rg -q '^function standaloneSessionActive' "$ui" \
  && fail "$ui defined its own standaloneSessionActive again — two probes to keep in step"

# 6. The installer's refuse-to-deploy check probes the same PID, and treats a
#    non-numeric payload as live rather than deployable.
rg -qF '/proc/\$p' "$inst" \
  || fail "$inst no longer probes the lock PID for the deploy guard"

echo "PASS: session liveness is flock+PID across launcher, shadow UI and installer"
exit 0
