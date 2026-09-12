#!/bin/bash
# dAVEBOx SA — boot-target entry script (stock Schwung's boot selector, >= 1.3.0).
#
# THE SECOND DOOR. dAVEBOx is reachable two ways and both must keep working
# (Josh, 2026-09-11: "we need to also be able launch it from within schwung
# tools without issues"):
#
#   Tools menu  →  stock's launch-standalone.sh  →  the module's `standalone`
#   boot picker →  THIS FILE                     →  the module's `standalone`
#
# ⭐ Note the shared tail. This script does not reimplement the launcher — it
# runs the SAME file the Tools menu runs, with DBX_ENTRY=boot so the launcher
# can skip the handful of steps that only make sense when a stock stack is
# already up (grep `# ENTRY:` in it). One body, two doors, no drift.
#
# The contract this satisfies (stock's docs/BOOT_TARGETS.md):
#   * runs as `ableton`, never root — the launcher gets root through our own
#     setuid helper (davebox-heal), exactly as the doc says to;
#   * starts its own services — the launcher starts schwung-manager and
#     display-server itself; the selector starts nothing for us;
#   * EXEC, not fork. The selector's watchdog tests the pid it exec-ed, 15 s
#     later. Exec keeps that pid ours: the launcher blocks in `setsid --wait`
#     for the whole session, so the check passes. (The launcher also touches
#     the `healthy` marker once it is up, which covers the same ground without
#     depending on pid identity.)
#   * the LED surface arrives DARK — the selector sends a MIDI System Reset at
#     handover, and nothing later can stop that sweep. Suits us: the launcher's
#     usual LED blank runs inside quiesce, which does not happen at boot.
#
# ⚠ Nothing here may write /opt/move/Move, /usr/lib/schwung-shim.so or
# /etc/ld.so.preload — the selector's contract forbids it, and we never did:
# the launcher runs `env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal`,
# our shim over stock's untouched original.

set -u

LAUNCHER=/data/UserData/schwung/modules/tools/davebox-sa/standalone
LOG=/data/UserData/dbx-host/launch.log

if [ ! -x "$LAUNCHER" ]; then
    # No launcher = no session. Say so where the launch log will be read, then
    # fall through to STOCK rather than leaving the device on a dead frame:
    # exec'ing MoveOriginal is what the selector itself does for a target it
    # cannot start, and it is the difference between "dAVEBOx did not start"
    # and "the Move did not boot".
    echo "$(date) boot entry: launcher missing at $LAUNCHER — booting stock instead" \
        >> "$LOG" 2>/dev/null || true
    exec /opt/move/MoveOriginal
fi

# ⚠⚠ AN ARGUMENT, NOT AN EXPORTED VARIABLE. This said `export DBX_ENTRY=boot`
# for one hour and left the device in a split state — Move native on the OLED,
# dAVEBOx on everything else. The boot path ends in `exec /opt/move/Move`, and
# an exported variable survives exec: it rode into stock Schwung, was inherited
# by that whole session, and the next Tools-menu launch read it and took every
# BOOT branch. An argument is not inherited, so the leak cannot happen.
exec "$LAUNCHER" --boot
