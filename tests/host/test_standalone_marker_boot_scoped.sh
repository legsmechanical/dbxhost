#!/usr/bin/env bash
set -euo pipefail

# The standalone-session marker must be scoped to the boot that wrote it.
#
# It lives in /data (persistent) and the launcher removes it only on the
# clean-exit path, so a hard reboot — the documented "always returns you to
# stock" recovery action — left it behind. Stock Schwung then believed a
# standalone session was live, and every davebox Quit became a surprise device
# restart until someone deleted the file by hand.
#
# Three consumers must agree on the rule, or the bug comes back through
# whichever one drifts: the launcher (write + double-launch guard), the shadow
# UI (Shift+Back routing), and the installer (refuse-to-deploy check).
#
# Staleness must be decided by comparing the stamp to the running kernel's boot
# id. Fallbacks must be PERMISSIVE — an empty/legacy marker or an unreadable
# boot id means "assume live" — because a false negative sends Shift+Back down
# the teardown path during a real session.

cd "$(dirname "$0")/../.."

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

launch="standalone/scripts/launch.sh"
ui="src/shadow/shadow_ui.js"
inst="standalone/scripts/install-host.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. The launcher must stamp the marker with the boot id, not truncate it empty.
rg -q 'boot_id > "\$DBX_DIR/standalone_active"' "$launch" \
  || fail "$launch no longer stamps standalone_active with the boot id"

# 2. The launcher must refuse a second launch within the same boot.
rg -q 'refusing to launch' "$launch" \
  || fail "$launch lost its double-launch guard"

# 3. ...but must NOT lock the user out when the marker is from a previous boot.
rg -q 'clearing standalone marker from a previous boot' "$launch" \
  || fail "$launch does not clear a stale (previous-boot) marker — a stranded marker would block every launch"

# 4. The shadow UI must compare against the live boot id.
rg -q 'random/boot_id' "$ui" \
  || fail "$ui no longer compares the marker against the running boot id"

# 5. The installer's refuse-to-deploy check must be boot-scoped too, or a marker
#    from a session that ended days ago blocks deploys forever.
rg -q 'random/boot_id' "$inst" \
  || fail "$inst still treats mere existence of standalone_active as a live session"

# 6. Nobody may go back to bare existence checks for liveness.
if rg -n 'host_file_exists\(STANDALONE_DIR \+ "/standalone_active"\)' "$ui" | rg -qv 'host_read_file'; then
  if ! rg -q 'typeof host_read_file !== "function"' "$ui"; then
    fail "$ui resolves liveness by existence alone (the pre-fix behaviour)"
  fi
fi

echo "PASS: standalone marker is boot-scoped across launcher, shadow UI and installer"
exit 0
