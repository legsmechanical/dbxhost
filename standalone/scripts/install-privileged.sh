#!/bin/sh
# davebox host — THE ONE PRIVILEGED STEP, run once, ever.
#
# All this does is install davebox-heal as setuid-root. Everything after —
# mirroring the shim into /usr/lib, and every future davebox host update — is
# handled by heal and needs no root, because the payload lands in the
# ableton-owned tree and the launcher calls heal before exec.
#
# Why root is needed at all: MoveOriginal carries file capabilities, so it runs
# AT_SECURE, where glibc honours an LD_PRELOAD entry only if it is a bare
# soname from a standard directory carrying the setuid bit. /usr/lib is not
# writable by `ableton`, which is what module installs, schwung-manager and the
# launcher all run as.
#
# What this grants: nothing the device owner did not already have. They have
# ableton SSH and can write /data freely. davebox-heal has its source and
# destination compiled in — never taken from argv, environment or cwd — so it
# can only ever act on the one install it was built for. It accepts exactly two
# flags (--pause-launcher / --resume-launcher, for the systemd unit named in the
# same compile-time constants); neither can be pointed anywhere else. The
# library it installs is setuid *ableton*, not root, and is loaded
# into a process already running as ableton — so it confers no privilege; the
# setuid bit exists purely to satisfy glibc's check.

set -e

# ⚠ Literal, NOT sourced from ../config.sh: this script is deployed to the device
# as $DBX_DIR/bless.sh — at the root of the install tree, not under scripts/ — so
# a relative source would resolve outside the payload and the one privileged step
# would fail. config.sh is still authoritative; scripts/check-config.sh pins this
# line against it so the two cannot drift.
DBX_DIR=/data/UserData/dbx-host
DBX_HEAL_DIR=/data/UserData/schwung/modules/tools/davebox-sa/bin
DBX_HEAL_NAME=heal
DBX_SHIM_SONAME=davebox-shim.so

# The helper lives in the LAUNCHER MODULE's bin/ (2026-09-05) — the path stock's
# own schwung-heal blesses a staged `heal.new` at (charlesvestal/schwung#419),
# which is what makes a ZERO-SSH install possible once that ships. This script is
# the manual route for a stock host that predates it: the same result, by hand.
HEAL_DST=$DBX_HEAL_DIR/$DBX_HEAL_NAME
HEAL_NEW=$DBX_HEAL_DIR/$DBX_HEAL_NAME.new

[ "$(id -u)" = "0" ] || { echo "must run as root" >&2; exit 1; }
if [ -f "$HEAL_NEW" ] && [ ! -f "$HEAL_DST" ]; then
    mv -f "$HEAL_NEW" "$HEAL_DST"          # a staged helper nobody has blessed yet
fi
if [ ! -f "$HEAL_DST" ]; then
    echo "no heal at $HEAL_DST" >&2
    [ -f "$DBX_DIR/bin/davebox-heal" ] && echo "  (an OLD-layout $DBX_DIR/bin/davebox-heal exists — re-run the installer, which stages the helper in the module dir)" >&2
    exit 1
fi

chown root:root "$HEAL_DST"
chmod 4755 "$HEAL_DST"
echo "installed $HEAL_DST"
ls -la "$HEAL_DST"

# Prime it once so the shim is in place immediately (a missing shim source is
# tolerated: on a fresh device the payload may not be there yet).
echo "priming:"
"$HEAL_DST" || true
ls -la "/usr/lib/$DBX_SHIM_SONAME" 2>/dev/null || true

# --- boot recovery for the project-library swap ------------------------------
# The unit is written by heal itself now (`--install-restore-unit`, 2026-09-05),
# so the launcher can install it without root once the helper is blessed; here
# it runs as root, which is also fine. See davebox-heal.c RESTORE_UNIT_TEXT.
"$HEAL_DST" --install-restore-unit
echo "installed davebox-restore.service (boot recovery for the library swap)"
