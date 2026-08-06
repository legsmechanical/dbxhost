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
DBX_HEAL_NAME=davebox-heal
DBX_SHIM_SONAME=davebox-shim.so

HEAL_SRC=$DBX_DIR/bin/$DBX_HEAL_NAME
HEAL_DST=$DBX_DIR/bin/$DBX_HEAL_NAME

[ "$(id -u)" = "0" ] || { echo "must run as root" >&2; exit 1; }
[ -f "$HEAL_SRC" ]   || { echo "no davebox-heal at $HEAL_SRC" >&2; exit 1; }

chown root:root "$HEAL_DST"
chmod 4755 "$HEAL_DST"
echo "installed $HEAL_DST"
ls -la "$HEAL_DST"

# Prime it once so the shim is in place immediately.
echo "priming:"
"$HEAL_DST"
ls -la "/usr/lib/$DBX_SHIM_SONAME"

# --- boot recovery for the project-library swap ------------------------------
# A standalone session swaps Move's set library for its own project library
# (Design B — the session never touches native sets, only relocates them).
# If the device hard-reboots mid-session, Sets/ still holds the projects and
# the native sets sit in the stash. Nothing is lost, but stock would boot
# showing the wrong library. This oneshot runs the swap engine's `recover`
# verb before move-launcher starts, so a power cycle ALWAYS yields stock Move
# with the user's own sets — no expert knowledge, no residue.
#
# Runs as ableton (every file involved lives under /data and is
# ableton-owned); root is only needed here, once, to install the unit.
# The engine is a no-op when the swap state is "none" — every ordinary boot.
cat > /etc/systemd/system/davebox-restore.service <<UNIT
[Unit]
Description=davebox: restore native set library after an interrupted session
Before=move-launcher.service
ConditionPathExists=$DBX_DIR/scripts/set-swap.sh

[Service]
Type=oneshot
User=ableton
ExecStart=/bin/sh $DBX_DIR/scripts/set-swap.sh recover
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable davebox-restore.service
echo "installed davebox-restore.service (boot recovery for the library swap)"
