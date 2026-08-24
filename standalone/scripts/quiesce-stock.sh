#!/bin/sh
# Ask the running (stock) Schwung to save its state and exit, before we tear the
# stack down to start the davebox host.
#
# Why this is needed: killing shadow_ui loses host state. Its main loop watches
# shadow_control->should_exit and, on seeing it, calls shadow_save_state_now()
# — autosaveAllSlots + saveMasterFxChainConfig + saveChainConfigToDir — and only
# then breaks. Nothing else flushes on the way out: shadow_ui registers just
# atexit(remove_pid), and neither it nor the shim handles SIGTERM.
#
# Without this the user loses whatever the periodic autosave has not written,
# and that autosave is both coarse (~10 s) and gated on !isOvertakeActive — so
# if they launched us from inside an overtake tool, nothing since that tool
# opened has been saved at all.
#
# This is the same protocol the host's own restart path uses; nothing new is
# invented here.
#
# Deliberately best-effort: if the SHM is missing, or shadow_ui ignores us, we
# return anyway and the caller proceeds to its kill sequence. Refusing to launch
# because a save might not have completed would be a worse trade than launching.
#
# Lives in its own file, rather than inline in launch.sh, because that script
# body is a single-quoted `setsid bash -c` argument where one apostrophe breaks
# everything after it — silently, since it runs detached.

CONTROL=/dev/shm/schwung-control

# Every line carries a wall-clock stamp: launch.log has none of its own, and
# the 2026-08-23 "three clicks to launch" hunt had to reconstruct this script's
# timeline from stock's debug.log. Never again.
say() {
    t=$(date '+%H:%M:%S.%N' 2>/dev/null | cut -c1-12)
    case "$t" in *N*) t=${t%.*} ;; esac      # a date without %N (BSD) prints the literal
    echo "$t quiesce: $*"
}

# Freeze Move the moment shadow_ui is gone (freeze_move is called below, on
# both the clean-exit and the timeout path). Once shadow_ui exits, the shim
# stops compositing and native Move would repaint the OLED and the pads (its
# set picker, at full brightness) for the second or two until the kill sweep
# lands; SIGSTOP means it cannot push a single frame — the panel and LEDs
# retain the stock menu straight through to the standalone splash. The
# stopped process ignores the sweep's SIGTERM but not its SIGKILL, which is
# what actually takes it down.
# ⚠ The freeze MUST NOT run before shadow_ui has exited: the shim inside
# MoveOriginal serves the shared-memory param bus shadow_ui blocks on, so a
# frozen Move deadlocks shadow_ui mid-save — it never sees should_exit, the
# wait below burns its full ceiling, and the SIGKILL then eats the unsaved
# state (observed on hardware 2026-08-15, first launch after this order was
# briefly inverted).
# Paint the dAVEBOx splash into the STOCK shadow display before freezing, so
# the frozen frame the panel retains through the whole entry gap is the
# splash — the user sees "picked the tool → splash" within a second, and the
# standalone host's own boot splash then replaces it — with the TEXT screen
# now (wordmark + Schwung base version), so the two screens say different
# things instead of the same one twice.
# ⭑ The artwork ROTATES (Josh, 2026-08-24): one of splash-0..N.hex at random,
# a different face each launch. Falls back to the single splash.hex if the
# numbered set is not installed, so an older payload still paints something.
# Without this the retained frame is the stock Tools menu, which reads as a
# hang (Josh, first hands-on 2026-08-15: "no indication that it's loading").
# The shim keeps compositing /dev/shm/schwung-display for the frames between
# shadow_ui's exit and the freeze — display_mode stays set (re-asserted here
# for good measure), which is exactly why the menu stayed on screen before.
# ⚠ The display SHM is PAGE-PACKED (8 pages x 128 cols, byte = 8 vertical
# pixels, bit 0 topmost — see movy grab-screen / display_server.c), while
# splash.hex is row-major MSB-first; the python below converts.
# Every LED dark, as early as the surface can be written (Josh, 2026-08-24:
# "as early as possible when davebox is selected from stock tool menu").
#
# ⚠⚠ The shim boot LED-strip is NOT enough on its own, and a first attempt that
# relied on it shipped without darkening anything: stripping stops Move
# REPAINTING, but an LED holds its last physically-written value and the freeze
# below catches a lit Tools menu. Only a write turns a pad off.
#
# blank-leds.py reaches the pads through the same shadow-UI MIDI-out ring the
# old pad ticker used — which is why this works this early in the launch, and
# was the lead Josh gave when the first attempt failed.
# ⚠⚠ ABSOLUTE PATH, like everything else in this file. The first version used
# "$DBX_DIR/scripts/..." — and DBX_DIR is never DEFINED here (this script is run
# as `sh quiesce-stock.sh`, not sourced from the launcher). It expanded to
# empty, the -x test failed, and the function returned 0 in silence: the whole
# feature shipped, twice, doing nothing. A guard that skips quietly on a
# misspelled path is indistinguishable from a feature that ran.
BLANK_LEDS=/data/UserData/dbx-host/scripts/blank-leds.py
blank_leds() {
    if [ ! -x "$BLANK_LEDS" ]; then
        say "WARNING: $BLANK_LEDS missing — LEDs will hold the stock menu"
        return 0
    fi
    python3 "$BLANK_LEDS" --shm /dev/shm/schwung-midi-out >/dev/null 2>&1 \
        && say "LEDs blanked (stock ring)" \
        || say "WARNING: LED blank failed"
    return 0
}

paint_splash() {
    # ⭑ Here rather than at the call sites: every path that reaches the freeze
    # paints, and freeze_move paints again after the save, so one insertion
    # covers all four routes and a new one inherits it. Writing dark twice is
    # dark — the repeat also re-asserts after the save.
    blank_leds
    [ -e /dev/shm/schwung-display ] || return 0
    python3 - <<'PY' && say "splash painted into stock display"
import glob, mmap, os, random
frames = sorted(glob.glob("/data/UserData/dbx-host/splash-*.hex"))
pick = random.choice(frames) if frames else "/data/UserData/dbx-host/splash.hex"
if not os.path.isfile(pick):
    raise SystemExit(0)
src = bytes.fromhex(open(pick).read().strip())
out = bytearray(1024)
for y in range(64):
    row = y * 16
    for x in range(128):
        if (src[row + (x >> 3)] >> (7 - (x & 7))) & 1:
            out[(y >> 3) * 128 + x] |= 1 << (y & 7)
with open("/dev/shm/schwung-display", "r+b") as f:
    mm = mmap.mmap(f.fileno(), 1024)
    mm[:] = bytes(out)
    mm.flush(); mm.close()
with open("/dev/shm/schwung-control", "r+b") as f:
    mm = mmap.mmap(f.fileno(), 84)
    mm[0] = 1          # display_mode: keep the shim compositing our frame
    mm.flush(); mm.close()
PY
}

freeze_move() {
    paint_splash
    # A few SPI frames (~3 ms each) so the shim pushes the new frame to the
    # panel before Move stops producing frames at all.
    sleep 0.2
    pids=$(pidof MoveOriginal 2>/dev/null || true)
    if [ -n "$pids" ]; then
        kill -STOP $pids 2>/dev/null && say "MoveOriginal frozen ($pids)"
    fi
}

# Move's own song save, asked over D-Bus. Best-effort; it matters because the
# library swap moves the native set directories, so unsaved musical edits must
# reach disk before the stack dies.
# ⚠ Ordered AFTER shadow_ui's exit and the splash, on purpose. It used to run
# FIRST, and with a 4 s reply timeout that was the first of two stalls behind
# "dAVEBOx needs three clicks" (Josh, 2026-08-23): stock's Tools menu stayed
# fully live for those seconds — jog, click, launch again (refused by the lock)
# — with nothing on screen to say the first click had taken. The call is
# independent of shadow_ui (it is Move's save, not the host's), so nothing is
# lost by letting the user see the splash first. The stale claim that stock
# "is already gone by now" dates from before launch-standalone.sh stopped
# pre-killing it (2026-08-15); Move is alive here, and this runs every launch.
save_song() {
    pgrep -x MoveOriginal >/dev/null 2>&1 || return 0

    # ⚠ GATE the save on a fast liveness Ping, and NEVER block long on it.
    # The Move that a Tools-menu launch quiesces is the one the PREVIOUS
    # session left running (launch-standalone.sh restarts it on exit), and that
    # Move can sit not answering com.ableton.move D-Bus at all — NoReply for the
    # full reply-timeout, on every launch, well past its boot (measured
    # 2026-08-23: ~15 ms on a systemd-booted Move, 4008 ms NoReply on the
    # returned one). A freshly booted Move answers at once. So Ping first with a
    # tight ceiling: if it does not answer, the save could not have run anyway
    # and the 4 s wait bought nothing but a frozen-looking launch. (Why the
    # returned Move goes deaf — a second MoveOriginal, an unclean D-Bus name
    # hand-off — is a separate board item; this only stops the stall.)
    _dbus() {  # method, extra-args...  — $1 timeout-ms
        local to="$1"; shift
        dbus-send --system --print-reply --reply-timeout="$to" \
            --dest=com.ableton.move "$@" 2>&1
    }
    t0=$(date +%s%N 2>/dev/null || echo 0)
    if ! _dbus 800 /com/ableton/move/browser org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1; then
        t1=$(date +%s%N 2>/dev/null || echo 0)
        say "saveSongIfDirty SKIPPED — Move not answering D-Bus ($(( (t1 - t0) / 1000000 )) ms ping)"
        return 0
    fi
    out=$(_dbus 4000 /com/ableton/move/browser com.ableton.move.Browser.saveSongIfDirty string:)
    rc=$?
    t1=$(date +%s%N 2>/dev/null || echo 0)
    ms=$(( (t1 - t0) / 1000000 ))
    if [ "$rc" = "0" ]; then
        say "saveSongIfDirty done (${ms} ms)"
    else
        say "saveSongIfDirty FAILED rc=$rc after ${ms} ms: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-200)"
    fi
}

# "Still running" must mean RUNNING. Stock's shim reaps shadow_ui only inside
# launch_shadow_ui(), after an early return that fires while it still believes
# the child is up — so the exited shadow_ui sits as a ZOMBIE until MoveOriginal
# dies, and `pgrep -x shadow_ui` keeps listing it. That was the second stall:
# the wait below burned its full 5 s ceiling on EVERY launch ("still running
# after 5s — proceeding anyway" on each header since the order was fixed on
# 08-15). A zombie has saved and gone; treat it as exited.
shadow_ui_live() {
    for p in $(pgrep -x shadow_ui 2>/dev/null); do
        case "$(cut -d' ' -f3 "/proc/$p/stat" 2>/dev/null)" in
            Z|X|"") ;;            # zombie / dead / vanished between pgrep and read
            *) return 0 ;;
        esac
    done
    return 1
}

if [ ! -e "$CONTROL" ]; then
    say "no stock control SHM — nothing to save"
    paint_splash
    save_song
    freeze_move
    exit 0
fi

# should_exit is byte 2 of shadow_control_t (display_mode, shadow_ready,
# should_exit, ...). Setting it asks for a saved, orderly exit. FIRST thing we
# do: the sooner the menu is gone, the sooner the user stops clicking it.
say "$(python3 - "$CONTROL" <<'PY'
import mmap, sys
try:
    with open(sys.argv[1], "r+b") as f:
        mm = mmap.mmap(f.fileno(), 84)
        mm[2] = 1
        mm.flush()
        mm.close()
    print("should_exit set")
except Exception as e:
    print("could not set should_exit: %s" % e)
PY
)"

# Wait for shadow_ui to finish saving and go. The save is a handful of small
# JSON writes (~0.4 s on hardware); the ceiling only exists so a wedged UI
# cannot stall the launch forever.
i=0
while [ "$i" -lt 50 ]; do
    if ! shadow_ui_live; then
        z=""; pgrep -x shadow_ui >/dev/null 2>&1 && z=" (zombie left for stock to reap)"
        say "shadow_ui exited after $((i * 100))ms$z"
        paint_splash
        save_song
        freeze_move
        exit 0
    fi
    sleep 0.1
    i=$((i + 1))
done

say "shadow_ui still running after 5s — proceeding anyway"
paint_splash
save_song
freeze_move
exit 0
