#!/bin/bash
# davebox host launcher.
#
# Invoked by the Schwung Tools menu as a standalone module binary. A module
# declaring "standalone": true is run through the host's launch-standalone.sh,
# which has already killed the stock stack and freed the SPI device by the time
# we get here, and which restarts stock Move when we exit.
#
# What this does: bring Move back up under the DAVEBOX Schwung build instead of
# the stock one. The official install is never modified — it stays on disk
# untouched, and a reboot always returns to it, so a broken davebox build cannot
# brick the device.
#
# Requires the one-time privileged install (scripts/install-privileged.sh).

setsid bash -c '
  DBX_DIR=/data/UserData/dbx-host
  LOG=$DBX_DIR/launch.log
  exec >>"$LOG" 2>&1
  echo "=== davebox host launch $(date) ==="

  # Close ALL inherited FDs 3+ — we inherit the SPI device from our parent, and
  # holding it open would keep the device busy for the host we are starting.
  i=3
  while [ $i -lt 1024 ]; do
    eval "exec ${i}>&-" 2>/dev/null
    i=$((i+1))
  done

  # Stand the watchdog down FIRST. move-launcher.service is systemd-supervised
  # with Restart=on-failure, so killing MoveLauncher makes systemd revive the
  # whole stock stack a few seconds later — and it would then be running
  # alongside us, both driving /dev/ablspi0.0. We are ableton and cannot stop a
  # unit, so davebox-heal (setuid root, hardcoded unit name) does it.
  if ! $DBX_DIR/bin/davebox-heal --pause-launcher; then
    echo "could not pause move-launcher — refusing to launch (stock would respawn alongside us)"
    exit 1
  fi

  # Marker for "a standalone session is running". davebox and the host UI both
  # live in directories SHARED with stock, so neither can tell which host it is
  # under at build time — this is the runtime signal, and we own both of its
  # edges. Without it, Shift+Back under stock Schwung would try to tear down
  # stock.
  : > "$DBX_DIR/standalone_active"

  # Boot straight into dAVEBOx rather than the host menu. Two files because the
  # mechanism is split: the shim raises open_tool_cmd when boot_tool.json exists
  # (which is also what turns the shadow display ON — JS can read display_mode
  # but not set it), and the shadow UI reads the tool to open from
  # open_tool_cmd.json. Writing the latter under the STOCK tree is deliberate:
  # that path is a hardcoded literal in the shared UI code, and the file is a
  # transient command, which is exactly what stock uses it for.
  # WARNING: double quotes only, and no apostrophes anywhere in this block --
  # not even in a comment. The whole body is wrapped in a single-quoted
  # setsid bash -c argument, so one stray single quote closes it early and
  # everything after is reparsed as garbage. It fails silently, because the
  # launcher is detached. This exact comment used to contain quotes and broke
  # the boot files it was documenting.
  BOOT_JSON="{\"tool_id\": \"davebox-sound\", \"file_path\": \"\"}"
  echo "$BOOT_JSON" > "$DBX_DIR/boot_tool.json"
  echo "$BOOT_JSON" > /data/UserData/schwung/open_tool_cmd.json

  # Ask stock Schwung to save and exit first. Killing shadow_ui loses host state:
  # its main loop saves only when it sees should_exit, and nothing else flushes
  # on the way out. Best-effort -- if it does not go, the kill below still does.
  sh "$DBX_DIR/scripts/quiesce-stock.sh"

  # Belt and braces: launch-standalone.sh has already done this, but this script
  # is also run directly during development.
  for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui; do
    pids=$(pidof $name 2>/dev/null || true)
    if [ -n "$pids" ]; then echo "TERM $name $pids"; kill $pids 2>/dev/null || true; fi
  done
  sleep 1
  for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui; do
    pids=$(pidof $name 2>/dev/null || true)
    if [ -n "$pids" ]; then echo "KILL $name $pids"; kill -9 $pids 2>/dev/null || true; fi
  done
  sleep 0.5

  pids=$(fuser /dev/ablspi0.0 2>/dev/null || true)
  if [ -n "$pids" ]; then echo "SPI holders $pids"; kill -9 $pids 2>/dev/null || true; sleep 0.5; fi

  # Both namespaces. launch-standalone.sh does NOT do this, and stale rings hang
  # slots on reattach — a partial teardown leaves pointers that outlive it.
  rm -f /dev/shm/schwung-* /dev/shm/dbxhost-*

  # Mirror the shim for THIS build into /usr/lib (setuid) first. We run as
  # ableton and cannot write /usr/lib; davebox-heal is setuid-root and hardcodes
  # both paths. Refusing to launch on failure is deliberate: without a valid
  # preload MoveOriginal comes up silently WITHOUT Schwung, which is a far more
  # confusing failure than not launching at all.
  if ! $DBX_DIR/bin/davebox-heal; then
    echo "davebox-heal failed — refusing to launch"
    exit 1
  fi

  export LD_LIBRARY_PATH=$DBX_DIR/lib:$LD_LIBRARY_PATH

  # BARE SONAME, never a path. MoveOriginal carries file capabilities, so it
  # runs AT_SECURE, where glibc silently drops any LD_PRELOAD entry containing a
  # slash and honours only bare names from standard directories carrying the
  # setuid bit. An absolute path here fails with no error anywhere.
  # NOT exec: we need to regain control when the davebox host exits so the
  # watchdog can be put back. Leaving it stopped would mean stock Move is
  # unsupervised until the next reboot.
  echo "run LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal"
  env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal
  echo "davebox host exited ($?) — restoring the watchdog"

  # Resuming the unit is what brings stock Move back, so this is the restore
  # path, not just cleanup. Our caller (launch-standalone.sh) also starts Move
  # when we exit; leave the SHM namespaces clean either way.
  rm -f /dev/shm/dbxhost-*
  rm -f "$DBX_DIR/standalone_active"
  # Leave no standing open-tool command behind for the stock host to act on.
  rm -f /data/UserData/schwung/open_tool_cmd.json
  $DBX_DIR/bin/davebox-heal --resume-launcher
' &
