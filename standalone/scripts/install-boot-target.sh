#!/bin/bash
# Register dAVEBOx as a BOOT TARGET with stock Schwung's boot selector (>= 1.3.0).
#
# THE SECOND DOOR, and only ever an addition (Josh, 2026-09-11: "we need to also
# be able launch it from within schwung tools without issues"). This writes two
# files into stock's registry and changes nothing else — the Tools-menu module
# is untouched, and both entrances end up running the same launcher.
#
#   /data/UserData/boot-targets/davebox/boot.json
#   /data/UserData/boot-targets/davebox/entry.sh
#
# ⚠⚠ IT MUST NEVER WRITE `boot-targets/default`. Registering adds a ROW; it does
# not take the boot. The picker sets the default only when the user jog-clicks a
# row, and leaving it alone is what preserves the promise launch.sh states in its
# own header — "a reboot always returns to stock", so a broken davebox build can
# never brick the device. Stock's own docs say the same: set `default` "only on
# explicit user choice — never as a silent side effect of installing."
# Making dAVEBOx the default is a SEPARATE decision for Josh, and it trades that
# promise for the selector's ~2-second Back window.
#
# ⚠ Never create or touch `boot-targets/schwung/` — the selector rewrites that
# directory itself on every boot, and it is reserved along with `stock`.
#
# Degrades: on a stock older than 1.3.0 there is no registry and no picker, so
# this SKIPS with a message rather than failing. The Tools door still works, and
# that is the whole install on such a device.
#
#   MOVE_HOST=192.168.86.40 ./standalone/scripts/install-boot-target.sh
#   ./standalone/scripts/install-boot-target.sh --uninstall
set -eu

HERE="$(cd "$(dirname "$0")/.." && pwd)"
. "$HERE/config.sh"

MOVE_USER="${MOVE_USER:-ableton}"
MOVE_HOST="${MOVE_HOST:-move.local}"
SSH="ssh -o ConnectTimeout=10 ${MOVE_USER}@${MOVE_HOST}"
say() { printf '%s\n' "$*"; }

BOOT_ID=davebox
BOOT_ROOT=/data/UserData/boot-targets
BOOT_DIR="$BOOT_ROOT/$BOOT_ID"

UNINSTALL=0
[ "${1:-}" = "--uninstall" ] && UNINSTALL=1

$SSH true 2>/dev/null || { echo "cannot reach ${MOVE_HOST}" >&2; exit 1; }

# The registry is created by the selector's own entrypoint on every boot, so its
# ABSENCE means this stock predates the selector — not that something is broken.
if ! $SSH "test -d '$BOOT_ROOT'"; then
    say "      no $BOOT_ROOT on this device — stock Schwung predates the boot"
    say "      selector (needs >= 1.3.0). SKIPPING the boot row; the Tools-menu"
    say "      door is unaffected and remains the way in."
    exit 0
fi

if [ "$UNINSTALL" = "1" ]; then
    say "--- removing the dAVEBOx boot row"
    # If `default` names us, hand it back to Schwung. The selector tolerates a
    # dangling default (it falls back to schwung, then stock), but leaving our
    # id in a file we are deleting the target of is sloppy in a way that shows
    # up as a mystery two months later.
    $SSH "if [ \"\$(head -n1 '$BOOT_ROOT/default' 2>/dev/null)\" = '$BOOT_ID' ]; then
              printf 'schwung\n' > '$BOOT_ROOT/default.tmp' &&
              mv -f '$BOOT_ROOT/default.tmp' '$BOOT_ROOT/default' &&
              echo '      default named davebox — handed back to schwung'
          fi
          rm -rf '$BOOT_DIR'"
    say "      removed. dAVEBOx is still on the Tools menu."
    exit 0
fi

say "--- registering dAVEBOx as a boot target ($BOOT_DIR)"

# Write via a temp name then mv, so a dropped connection cannot leave a
# half-written boot.json that the selector would parse into an empty exec.
$SSH "mkdir -p '$BOOT_DIR'"
scp -q -o ConnectTimeout=10 "$HERE/boot-target/boot.json" \
    "${MOVE_USER}@${MOVE_HOST}:$BOOT_DIR/.boot.json.tmp"
scp -q -o ConnectTimeout=10 "$HERE/boot-target/entry.sh" \
    "${MOVE_USER}@${MOVE_HOST}:$BOOT_DIR/.entry.sh.tmp"
$SSH "chmod 0755 '$BOOT_DIR/.entry.sh.tmp' &&
      mv -f '$BOOT_DIR/.entry.sh.tmp' '$BOOT_DIR/entry.sh' &&
      mv -f '$BOOT_DIR/.boot.json.tmp' '$BOOT_DIR/boot.json'"

# Clear any strike the watchdog recorded against us. Three failed boots trip a
# FORCED picker, strikes never decay, and a fresh install is a fresh claim —
# carrying the old build's failures into it would open the picker on a boot that
# is about to work.
$SSH "rm -f '$BOOT_DIR/healthy'"

say "      boot.json + entry.sh installed"

# Verify by CONTENT, not by exit code: the row is worthless if the selector
# cannot read an exec out of it or the script is not executable.
_exec="$($SSH "sed -n 's/.*\"exec\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' '$BOOT_DIR/boot.json' | head -n1" || true)"
if [ "$_exec" != "$BOOT_DIR/entry.sh" ]; then
    echo "      REFUSING: boot.json exec reads '$_exec', expected '$BOOT_DIR/entry.sh'" >&2
    exit 1
fi
$SSH "test -x '$BOOT_DIR/entry.sh'" || {
    echo "      REFUSING: $BOOT_DIR/entry.sh is not executable — the selector would skip it" >&2
    exit 1
}
say "      verified: exec -> $_exec, entry.sh executable"

_default="$($SSH "head -n1 '$BOOT_ROOT/default' 2>/dev/null" || true)"
say "      boot default is '${_default:-<unset>}' — UNCHANGED by this install"
say "      dAVEBOx now appears in the boot picker (hold Back at boot) AND on the"
say "      Tools menu. A reboot still goes straight to '${_default:-schwung}'."
