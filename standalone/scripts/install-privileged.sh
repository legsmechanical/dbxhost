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
# ableton SSH and can write /data freely. davebox-heal takes NO arguments and
# has both its source and destination hardcoded, so it can only ever do one
# thing. The library it installs is setuid *ableton*, not root, and is loaded
# into a process already running as ableton — so it confers no privilege; the
# setuid bit exists purely to satisfy glibc's check.

set -e

DBX_DIR=/data/UserData/dbx-host
HEAL_SRC=$DBX_DIR/bin/davebox-heal
HEAL_DST=$DBX_DIR/bin/davebox-heal

[ "$(id -u)" = "0" ] || { echo "must run as root" >&2; exit 1; }
[ -f "$HEAL_SRC" ]   || { echo "no davebox-heal at $HEAL_SRC" >&2; exit 1; }

chown root:root "$HEAL_DST"
chmod 4755 "$HEAL_DST"
echo "installed $HEAL_DST"
ls -la "$HEAL_DST"

# Prime it once so the shim is in place immediately.
echo "priming:"
"$HEAL_DST"
ls -la /usr/lib/davebox-shim.so
