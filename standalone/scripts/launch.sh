#!/bin/bash
# davebox host launcher.
#
# Invoked by the Schwung Tools menu as a standalone module binary. A module
# declaring "standalone": true is run through the host's launch-standalone.sh,
# which hands us the stock stack ALIVE (it stopped pre-killing it 2026-08-15 —
# the teardown is ours, so the quiesce below can save stock state and freeze
# the surface first) and which restarts stock Move when we exit.
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

  # Refuse to start on top of a live session — by LIVENESS, not a marker.
  # A second launch is not a harmless no-op: it tears the stack down under
  # the session that is already running, and it becomes a corruption path
  # where this script rewrites set routing (the second launch would record
  # launch one, already-patched values as the "originals" to restore).
  #
  # The guard is an exclusive flock on a /dev/shm dotfile, held on fd 9 for
  # the life of this supervisor (children inherit it, so the lock outlives
  # us only while session processes do). A crash releases it automatically
  # and a reboot clears /dev/shm by construction — no staleness protocol,
  # nothing to remember to delete. The PID payload is for observers (the
  # shadow UI and the installer check /proc/<pid>) and for humans.
  # ⚠ The path is a DOTFILE so the /dev/shm/dbxhost-* wipes below can never
  # delete the locked inode (a second launcher would then lock a fresh file
  # at the same path and the guard is gone). Must match DBX_SESSION_LOCK in
  # config.sh — pinned by check-config.sh.
  # NOTE: taken AFTER the FD-close loop above, which would close fd 9.
  # Open O_APPEND, not O_TRUNC: a REFUSED launch must not empty the live
  # session PID payload as a side effect of merely opening the file.
  exec 9>>/dev/shm/.dbxhost-session.lock
  if ! flock -n 9; then
    echo "a standalone session is already live (lock held) — refusing to launch"
    exit 1
  fi
  : > /dev/shm/.dbxhost-session.lock
  printf "%s\n" "$$" >&9

  # (The watchdog stand-down moved BELOW the kill sweep, 2026-08-15. It used
  # to run here — but the stock stack is alive at this point now that
  # launch-standalone.sh no longer pre-kills it, and `systemctl stop` TERMs
  # the whole cgroup: shadow_ui would die before quiesce ever saved it. The
  # sweep leaves the unit empty, so the stop below is instant and cancels any
  # restart systemd already scheduled.)

  # A refusal AFTER this point leaves the watchdog paused — and once the kill
  # loop below has run, the stock stack is dead too, so a bare exit strands
  # the device frozen on its last drawn frame with nothing supervising it.
  # Every later refuse path resumes the watchdog on the way out so systemd
  # revives stock Move. (Observed on hardware 2026-08-10: set-swap enter
  # failed and the bare-exit refusal froze the device until an SSH rescue.)
  refuse() {
    echo "$1 — refusing to launch"
    # ⚠ Undo the library swap on the way out, ALWAYS. Since 2026-08-12 the swap
    # is a bind mount, so a refusal after `enter` would otherwise strand the
    # user looking at OUR library instead of their own sets — with stock Move
    # about to be revived on top of it by the resume below. `exit` is
    # idempotent and converges from any state, so calling it unconditionally
    # here is both correct before `enter` (a no-op) and after it.
    # ⭑ Placed in refuse() rather than at each call site on purpose: a new
    # refusal path added later inherits the cleanup instead of forgetting it.
    sh "$DBX_DIR/scripts/set-swap.sh" exit >/dev/null 2>&1 || true
    $DBX_DIR/bin/davebox-heal --resume-launcher || true
    exit 1
  }

  # (The old /data marker standalone_active is retired — the lock above IS
  # the "session running" signal now, and readers probe its PID for
  # liveness. Clear any marker an older launcher left so no stale copy can
  # confuse a build that predates the retirement.)
  rm -f "$DBX_DIR/standalone_active"


  # Ask stock Schwung to save and exit first. Killing shadow_ui loses host
  # state: its main loop saves only when it sees should_exit, and nothing else
  # flushes on the way out. The stock stack is ALIVE here (launch-standalone.sh
  # stopped pre-killing it, 2026-08-15) so the save is real, and quiesce also
  # freezes MoveOriginal (SIGSTOP) so native Move cannot repaint the surface
  # once shadow_ui goes -- the panel and LEDs hold the stock menu until our
  # splash. Best-effort -- if it does not go, the kill below still does.
  sh "$DBX_DIR/scripts/quiesce-stock.sh"

  # The one and only teardown of the stock stack (launch-standalone.sh no
  # longer pre-kills it). The frozen MoveOriginal ignores the TERM phase and
  # dies on the KILL phase -- that is expected, not a leak.
  # schwung-manager is in the list to catch the STOCK manager (same binary
  # name, spawned by shim-entrypoint.sh): it holds :7700 and reads the stock
  # /schwung-* segments, so left alive it answers the browser with the wrong
  # host. The stock pid file goes too, or the stock "already running" check
  # misfires on pid reuse when stock returns.
  # (NOTE for editors: this whole session body is ONE single-quoted bash -c
  # string -- a bare apostrophe anywhere in it, even in a comment, ends the
  # string and the script stops parsing.)
  for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui link-subscriber schwung-manager display-server; do
    pids=$(pidof $name 2>/dev/null || true)
    if [ -n "$pids" ]; then echo "TERM $name $pids"; kill $pids 2>/dev/null || true; fi
  done
  sleep 1
  for name in MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui link-subscriber schwung-manager display-server; do
    pids=$(pidof $name 2>/dev/null || true)
    if [ -n "$pids" ]; then echo "KILL $name $pids"; kill -9 $pids 2>/dev/null || true; fi
  done
  rm -f /data/UserData/schwung/schwung-manager.pid
  sleep 0.5

  # Stand the watchdog down NOW, tight behind the sweep. move-launcher.service
  # is systemd-supervised with Restart=on-failure, so the MoveLauncher kill
  # above already started its restart clock; `systemctl stop` on the emptied
  # unit is instant, cancels that pending restart, and keeps stock from
  # respawning alongside us on /dev/ablspi0.0. We are ableton and cannot stop
  # a unit, so davebox-heal (setuid root, hardcoded unit name) does it.
  # Runs AFTER quiesce by design: stopping the unit TERMs its whole cgroup,
  # which would have killed shadow_ui before it saved.
  if ! $DBX_DIR/bin/davebox-heal --pause-launcher; then
    refuse "could not pause move-launcher (stock would respawn alongside us)"
  fi

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
  rm -f "$DBX_DIR/select_list.json" "$DBX_DIR/select_hook_result.json"
  echo "$BOOT_JSON" > "$DBX_DIR/boot_tool.json"
  echo "$BOOT_JSON" > /data/UserData/schwung/open_tool_cmd.json
  # Fresh-session marker: the module opens its project picker over the boot
  # project when this is present (and consumes it). The relaunch branch
  # removes it so an in-session switch or rewire never re-asks.
  printf 1 > "$DBX_DIR/fresh_session"


  # Sidecar pid files name processes the sweep above just killed. Leaving them
  # is not harmless: the shim adopts a live pid it finds there instead of
  # starting its own sidecar, and a pid can outlive its session — a
  # link-subscriber from the STOCK stack survived into a session this way
  # (2026-08-13), so the session ran with no subscriber of its own, no
  # <prefix>-link-in segment, no Move audio in the mixer, and every Move FX bus
  # control inert with nothing in any log to say why.
  # ⚠ The relaunch and exit paths already did this; ENTRY did not, which is the
  # one that matters most — it is the only path that inherits another stack.
  rm -f "$DBX_DIR/shadow_ui.pid" "$DBX_DIR/link_sub.pid"

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
    sh "$DBX_DIR/scripts/set-swap.sh" recover || refuse "set-swap recover failed"
    # First run: seed the library with the wired-correctly template project.
    # ⚠ "First run" means NO PROJECT, not an empty directory: the library also
    # carries a DO-NOT-EDIT notice for the file surfaces we cannot filter, and a
    # plain `ls` would count that as a project and silently skip the seeding —
    # a fresh install would come up on an empty picker. Directories only.
    if [ -d "$DBX_DIR/sets/template" ] && [ -z "$(ls -d "$DBX_DIR/sets/library"/*/ 2>/dev/null)" ]; then
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
      echo "set-swap enter failed — restoring"
      sh "$DBX_DIR/scripts/set-swap.sh" recover || true
      refuse "set-swap enter failed"
    }
    # Move mixer invariant, swept over the whole library while Move is NOT
    # running — the only window where its set files can be rewritten without
    # being clobbered by its own save on exit. Every Move track ends up unity,
    # unmuted, unsoloed, because the session mixes those instruments through
    # its FX buses and a set-level mute is invisible there. Creation already
    # guarantees it; this repairs projects that predate the rule, and any track
    # muted from Move during an earlier session. Parse-only unless something is
    # actually wrong, so it costs nothing on a healthy library.
    sh "$DBX_DIR/scripts/project-cmd.sh" normalize || \
      echo "WARNING: Move mixer normalize failed — continuing"
  fi

  # Mirror the shim for THIS build into /usr/lib (setuid) first. We run as
  # ableton and cannot write /usr/lib; davebox-heal is setuid-root and hardcodes
  # both paths. Refusing to launch on failure is deliberate: without a valid
  # preload MoveOriginal comes up silently WITHOUT Schwung, which is a far more
  # confusing failure than not launching at all.
  if ! $DBX_DIR/bin/davebox-heal; then
    refuse "davebox-heal failed"     # refuse() undoes the swap
  fi

  export LD_LIBRARY_PATH=$DBX_DIR/lib:$LD_LIBRARY_PATH

  # Web manager sidecar (browser UI on :7700). Started BEFORE the host on
  # purpose: every SHM attach in it is lazy-with-retry, so an early start is
  # free and the browser is reachable while Move boots. Restarted by the
  # relaunch branch below after each SHM wipe — its mappings die with the
  # segments, same rule as every other sidecar.
  start_manager() {
    mgr_log="$DBX_DIR/manager.log"
    if [ -f "$mgr_log" ] && [ "$(wc -c < "$mgr_log" 2>/dev/null || echo 0)" -gt 102400 ]; then
      tail -c 102400 "$mgr_log" > "$mgr_log.tmp" 2>/dev/null && mv "$mgr_log.tmp" "$mgr_log"
    fi
    if [ -x "$DBX_DIR/schwung-manager" ]; then
      "$DBX_DIR/schwung-manager" -port 7700 -roots /data/UserData/ \
        -base "$DBX_DIR" >>"$mgr_log" 2>&1 &
      echo "started schwung-manager ($!)"
    fi
    # OLED mirror source (SSE on :7681, proxied by the manager at /mirror).
    # Costs nothing until a viewer opens the page: the shim only copies
    # frames while shadow_control display_mirror is set, and the manager
    # sets that when /mirror is opened.
    if [ -x "$DBX_DIR/display-server" ]; then
      "$DBX_DIR/display-server" >/dev/null 2>&1 &
      echo "started display-server ($!)"
    fi
  }
  start_manager

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
  # guard, heal) is still in place, and the session lock stays held — same
  # supervisor. The SHM wipe between iterations is the same stale-ring hygiene the
  # session entry does.
  rm -f "$DBX_DIR/relaunch_requested"
  while :; do
    # Second leg of the pad ticker (the first ran in quiesce-stock.sh against
    # the STOCK ring until the freeze). Waits for OUR midi-out ring, which the
    # shim creates while Move boots, resumes at the column the freeze kept
    # (ticker_offset), and exits when the session LED init touches ticker_stop
    # just before its first paint. Dead gap = a pause mid-word.
    # (No apostrophes in here: this whole body is one single-quoted string.)
    # ⚠ Kill it by PID, never pkill -f: this whole body is the argv of one
    # bash -c, so a pattern that names pad-ticker.py matches the SUPERVISOR
    # too. That is exactly what happened on 2026-08-23 — the launcher killed
    # itself the moment Move exited, the teardown below never ran, and the
    # device sat on the EXITING farewell with the library still bound.
    rm -f "$DBX_DIR/ticker_stop"
    TICKER2_PID=""
    if [ -x "$DBX_DIR/scripts/pad-ticker.py" ]; then
      python3 "$DBX_DIR/scripts/pad-ticker.py" --shm /dev/shm/dbxhost-midi-out --wait 20 \
        --offset-file "$DBX_DIR/ticker_offset" --state "$DBX_DIR/ticker_offset" \
        --stop "$DBX_DIR/ticker_stop" >/dev/null 2>&1 &
      TICKER2_PID=$!
      echo "started pad ticker leg 2 ($TICKER2_PID)"
    fi
    echo "run LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal"
    env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal
    [ -n "$TICKER2_PID" ] && kill "$TICKER2_PID" 2>/dev/null || true
    if [ -f "$DBX_DIR/relaunch_requested" ]; then
      rm -f "$DBX_DIR/relaunch_requested"
      # Kill the session sidecars BEFORE wiping SHM. They survive MoveOriginal
      # (separate processes), and rm on a mapped file does not invalidate
      # mappings — an un-killed shadow_ui keeps running the module against the
      # DELETED segments, invisible to the fresh stack, while the new shim
      # sees its stale pid file and never respawns it (observed on hardware
      # 2026-08-06: session alive, module apparently loaded, controls dead).
      # Same name list as the session entry above. schwung-manager dies here
      # too — its SHM mappings would otherwise outlive the wipe below and keep
      # pointing at deleted segments; the browser reconnects to the fresh one.
      for name in MoveMessageDisplay Move schwung shadow_ui link-subscriber schwung-manager display-server; do
        pids=$(pidof $name 2>/dev/null || true)
        [ -n "$pids" ] && kill $pids 2>/dev/null || true
      done
      sleep 1
      for name in MoveMessageDisplay Move schwung shadow_ui link-subscriber schwung-manager display-server; do
        pids=$(pidof $name 2>/dev/null || true)
        [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
      done
      rm -f "$DBX_DIR/shadow_ui.pid" "$DBX_DIR/link_sub.pid"
      rm -f /dev/shm/dbxhost-*
      start_manager
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
      # Every relaunch is post-selection (a project switch, or the select hook
      # rewiring a set), so DIRECT-BOOT the tool. The shadow UI already staged
      # boot_tool.json when the selection was made; re-assert it here so a
      # programmatic switch always lands straight in the module.
      #
      # EXCEPT when the requester asked to RESELECT (relaunch_reselect marker):
      # a rename issued from the boot picker restarts Move without the user
      # ever having chosen a project, so the fresh session must come back to
      # the picker, not auto-load. Re-arming fresh_session is exactly how a
      # cold entry asks for that.
      if [ -f "$DBX_DIR/relaunch_reselect" ]; then
        rm -f "$DBX_DIR/relaunch_reselect"
        printf 1 > "$DBX_DIR/fresh_session"
        echo "reselect requested — re-arming the project picker"
      else
        rm -f "$DBX_DIR/fresh_session"
      fi
      echo "$BOOT_JSON" > "$DBX_DIR/boot_tool.json"
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
  # schwung-manager included: ours must release :7700 (and its SHM mappings)
  # before the stock shim-entrypoint starts the stock manager.
  for name in MoveMessageDisplay Move schwung shadow_ui link-subscriber schwung-manager display-server; do
    pids=$(pidof $name 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  sleep 1
  for name in MoveMessageDisplay Move schwung shadow_ui link-subscriber schwung-manager display-server; do
    pids=$(pidof $name 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
  rm -f "$DBX_DIR/shadow_ui.pid" "$DBX_DIR/link_sub.pid"

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
  # The flock on fd 9 dies with this process; remove the payload file too so
  # nothing lingers between sessions (a reboot would clear it anyway).
  rm -f /dev/shm/.dbxhost-session.lock
  # Session-scoped select/boot state: all of it dies with the session, so the
  # NEXT entry re-arms a fresh select phase (and stock never sees any of it).
  rm -f "$DBX_DIR/boot_tool.json"
  rm -f "$DBX_DIR/select_list.json" "$DBX_DIR/select_hook_result.json"
  rm -f "$DBX_DIR/fresh_session"
  # Leave no standing open-tool command behind for the stock host to act on.
  rm -f /data/UserData/schwung/open_tool_cmd.json
  $DBX_DIR/bin/davebox-heal --resume-launcher
' &
