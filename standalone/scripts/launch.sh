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

  # Refuse to start on top of a live session. There was no guard here at all,
  # and a second launch is not a harmless no-op: it tears the stack down under
  # the session that is already running. It also becomes a corruption path once
  # this script rewrites set routing — the second launch would record the FIRST
  # already-patched values from launch one as the "originals" to restore.
  #
  # Staleness is decided by boot id, exactly as the readers do (see the marker
  # write below), so a marker stranded by a hard reboot does NOT lock the user
  # out of launching — which would turn one bug into a worse one.
  if [ -s "$DBX_DIR/standalone_active" ]; then
    _prev=$(cat "$DBX_DIR/standalone_active" 2>/dev/null)
    _now=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)
    if [ -n "$_now" ] && [ "$_prev" = "$_now" ]; then
      echo "a standalone session is already active this boot — refusing to launch"
      exit 1
    fi
    echo "clearing standalone marker from a previous boot ($_prev)"
    rm -f "$DBX_DIR/standalone_active"
  fi

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
  #
  # STAMPED WITH THE CURRENT BOOT ID, because we own the edges only when we are
  # allowed to run them. The marker lives in /data (persistent) and is removed
  # only on the clean-exit path below — so a hard reboot, which is precisely the
  # documented "always returns you to stock" recovery action, used to leave it
  # behind. Stock Schwung then believed a standalone session was live and every
  # davebox Quit became a surprise device restart, until someone deleted the
  # file by hand. Readers compare the stamp to the live kernel boot id, so
  # a marker from a previous boot is self-evidently dead.
  #
  # (An empty marker is treated as live by readers, so a payload from an older
  # launcher keeps the previous semantics rather than breaking mid-session.)
  cat /proc/sys/kernel/random/boot_id > "$DBX_DIR/standalone_active" 2>/dev/null \
    || : > "$DBX_DIR/standalone_active"

  # DIRECT BOOT into the tool (v3 model): the session opens in the module on
  # the last project, and project selection is the modules OWN pad picker —
  # the set-select gate survives only as a headless actuator the module arms
  # for switches (shadow_select_arm(pad)). No boot-time picker: the earlier
  # boot select phase made the half-controlled native Move UI a user surface
  # and the seams showed. Two files because the mechanism is split: the shim
  # raises open_tool_cmd when boot_tool.json exists (which also turns the
  # shadow display ON), and the shadow UI reads the tool from
  # open_tool_cmd.json. Writing the latter under the STOCK tree is deliberate:
  # that path is a hardcoded literal in the shared UI code, and the file is a
  # transient command, which is exactly what stock uses it for.
  # WARNING: double quotes only, and no apostrophes anywhere in this block --
  # not even in a comment. The whole body is wrapped in a single-quoted
  # setsid bash -c argument, so one stray single quote closes it early and
  # everything after is reparsed as garbage. It fails silently, because the
  # launcher is detached. This exact comment has broken the block before.
  BOOT_JSON="{\"tool_id\": \"davebox-sound\", \"file_path\": \"\"}"
  rm -f "$DBX_DIR/select_phase"
  rm -f "$DBX_DIR/select_list.json" "$DBX_DIR/select_hook_result.json"
  echo "$BOOT_JSON" > "$DBX_DIR/boot_tool.json"
  echo "$BOOT_JSON" > /data/UserData/schwung/open_tool_cmd.json
  # Fresh-session marker: the module opens its project picker over the boot
  # project when this is present (and consumes it). The relaunch branch
  # removes it so an in-session switch or rewire never re-asks.
  printf 1 > "$DBX_DIR/fresh_session"

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

  # Design-B project workspace: this session sees ITS OWN set library, never
  # the users native sets. Recover first (a hard reboot mid-session leaves the
  # swap in a non-none phase; the blessed boot unit normally heals it, this is
  # the backstop), then swap in. A failed swap refuses the launch — starting a
  # session over a half-swapped library would mix the two worlds.
  if [ -x "$DBX_DIR/scripts/set-swap.sh" ]; then
    sh "$DBX_DIR/scripts/set-swap.sh" recover || {
      echo "set-swap recover failed — refusing to launch"; exit 1; }
    # First run: seed the library with the wired-correctly template project.
    if [ -d "$DBX_DIR/sets/template" ] && [ -z "$(ls "$DBX_DIR/sets/library" 2>/dev/null)" ]; then
      _tuuid=$(cat /proc/sys/kernel/random/uuid)
      mkdir -p "$DBX_DIR/sets/library/$_tuuid"
      cp -r "$DBX_DIR/sets/template/." "$DBX_DIR/sets/library/$_tuuid/"
      # Pad position in the native picker IS user.song-index; pin the seed to
      # index 0 so the first project sits on the first pad (and the select
      # phases pad<->index mapping holds from the very first boot).
      python3 -c "import os,sys; os.setxattr(sys.argv[1], \"user.song-index\", b\"0\")" \
        "$DBX_DIR/sets/library/$_tuuid" 2>/dev/null || true
      echo "seeded first project $_tuuid from template"
    fi
    sh "$DBX_DIR/scripts/set-swap.sh" enter || {
      echo "set-swap enter failed — restoring and refusing to launch"
      sh "$DBX_DIR/scripts/set-swap.sh" recover || true
      exit 1
    }
  fi

  # Mirror the shim for THIS build into /usr/lib (setuid) first. We run as
  # ableton and cannot write /usr/lib; davebox-heal is setuid-root and hardcodes
  # both paths. Refusing to launch on failure is deliberate: without a valid
  # preload MoveOriginal comes up silently WITHOUT Schwung, which is a far more
  # confusing failure than not launching at all.
  if ! $DBX_DIR/bin/davebox-heal; then
    echo "davebox-heal failed — refusing to launch"
    sh "$DBX_DIR/scripts/set-swap.sh" exit 2>/dev/null || true
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
  # Supervisor loop: MoveOriginal exiting normally ends the session, BUT an
  # in-session project switch needs Move restarted IN PLACE (new
  # currentSongIndex). The host requests that by writing relaunch_requested
  # before letting Move exit; we consume the marker and go again. Everything a
  # fresh entry needs (boot_tool.json, the open-tool command, the splash
  # guard, heal) is still in place, and standalone_active stays valid — same
  # boot. The SHM wipe between iterations is the same stale-ring hygiene the
  # session entry does.
  rm -f "$DBX_DIR/relaunch_requested" "$DBX_DIR/relaunch_select"
  while :; do
    echo "run LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal"
    env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal
    if [ -f "$DBX_DIR/relaunch_requested" ]; then
      rm -f "$DBX_DIR/relaunch_requested"
      # Kill the session sidecars BEFORE wiping SHM. They survive MoveOriginal
      # (separate processes), and rm on a mapped file does not invalidate
      # mappings — an un-killed shadow_ui keeps running the module against the
      # DELETED segments, invisible to the fresh stack, while the new shim
      # sees its stale pid file and never respawns it (observed on hardware
      # 2026-08-06: session alive, module apparently loaded, controls dead).
      # Same name list as the session entry above.
      for name in MoveMessageDisplay Move schwung shadow_ui; do
        pids=$(pidof $name 2>/dev/null || true)
        [ -n "$pids" ] && kill $pids 2>/dev/null || true
      done
      sleep 1
      for name in MoveMessageDisplay Move schwung shadow_ui; do
        pids=$(pidof $name 2>/dev/null || true)
        [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
      done
      rm -f "$DBX_DIR/shadow_ui.pid"
      rm -f /dev/shm/dbxhost-*
      # Apply the requested project index NOW — after Move exited. Writing it
      # earlier loses: the dying Move saves Settings.json on SIGTERM and
      # overwrites the value with its own stale in-memory index, so the fresh
      # boot lands in an unmatched set. Same ordering the host set-page change
      # uses (kill, rewrite, start).
      # Deferred set patch (select-hook wiring rewrite): applied ONLY after
      # Move exited, for the same reason as the song index below — the dying
      # process saves on SIGTERM and would clobber an earlier disk write.
      if [ -f "$DBX_DIR/relaunch_patch.sh" ]; then
        sh "$DBX_DIR/relaunch_patch.sh" || echo "WARNING: relaunch patch failed"
        rm -f "$DBX_DIR/relaunch_patch.sh"
      fi
      if [ -f "$DBX_DIR/relaunch_song_index" ]; then
        _rsi=$(cat "$DBX_DIR/relaunch_song_index")
        rm -f "$DBX_DIR/relaunch_song_index"
        case "$_rsi" in
          [0-9]*)
            sed "s/\(\"currentSongIndex\":[[:space:]]*\)-\{0,1\}[0-9][0-9]*/\1$_rsi/" \
              /data/UserData/settings/Settings.json > /data/UserData/settings/Settings.json.dbxtmp \
              && mv -f /data/UserData/settings/Settings.json.dbxtmp /data/UserData/settings/Settings.json
            echo "applied project index $_rsi"
            ;;
        esac
      fi
      echo "relaunch requested — restarting Move within the session"
      rm -f "$DBX_DIR/fresh_session"
      if [ -f "$DBX_DIR/relaunch_select" ]; then
        # In-session return to the set-select gate (project-cmd.sh select):
        # the user asked for the picker, so RE-ARM the phase — marker on,
        # boot_tool.json off — and the fresh Move holds at the picker again.
        rm -f "$DBX_DIR/relaunch_select" "$DBX_DIR/fresh_session" "$DBX_DIR/boot_tool.json"
        rm -f "$DBX_DIR/select_list.json" "$DBX_DIR/select_hook_result.json"
        : > "$DBX_DIR/select_phase"
        echo "set-select gate re-armed for this relaunch"
      else
        # Every other relaunch is post-selection (project switch, or the
        # select hook rewiring a set): DIRECT-BOOT the tool, never re-ask.
        # The shadow UI already staged boot_tool.json when the selection was
        # made; re-assert both files here so a programmatic switch can never
        # land on the select screen again.
        echo "$BOOT_JSON" > "$DBX_DIR/boot_tool.json"
        rm -f "$DBX_DIR/select_phase"
      fi
      echo "$BOOT_JSON" > /data/UserData/schwung/open_tool_cmd.json
      continue
    fi
    break
  done
  echo "davebox host exited ($?) — restoring the watchdog"

  # Kill surviving sidecars on EXIT too — same reason as the relaunch branch:
  # they outlive MoveOriginal, and a stray shadow_ui keeps running against
  # deleted SHM while stock respawns its own (observed: two shadow_ui
  # processes after a session ended via Shift+Back).
  for name in MoveMessageDisplay Move schwung shadow_ui; do
    pids=$(pidof $name 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  sleep 1
  for name in MoveMessageDisplay Move schwung shadow_ui; do
    pids=$(pidof $name 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
  rm -f "$DBX_DIR/shadow_ui.pid"

  # Swap the project library out and the users native sets back BEFORE stock
  # returns — stock must boot seeing exactly what it saw before the session.
  if [ -x "$DBX_DIR/scripts/set-swap.sh" ]; then
    sh "$DBX_DIR/scripts/set-swap.sh" exit || \
      echo "WARNING: set-swap exit failed — boot recovery will heal it"
  fi

  # Resuming the unit is what brings stock Move back, so this is the restore
  # path, not just cleanup. Our caller (launch-standalone.sh) also starts Move
  # when we exit; leave the SHM namespaces clean either way.
  rm -f /dev/shm/dbxhost-*
  rm -f "$DBX_DIR/standalone_active"
  # Session-scoped select/boot state: all of it dies with the session, so the
  # NEXT entry re-arms a fresh select phase (and stock never sees any of it).
  rm -f "$DBX_DIR/select_phase" "$DBX_DIR/boot_tool.json"
  rm -f "$DBX_DIR/select_list.json" "$DBX_DIR/select_hook_result.json"
  rm -f "$DBX_DIR/relaunch_select" "$DBX_DIR/fresh_session"
  # Leave no standing open-tool command behind for the stock host to act on.
  rm -f /data/UserData/schwung/open_tool_cmd.json
  $DBX_DIR/bin/davebox-heal --resume-launcher
' &
