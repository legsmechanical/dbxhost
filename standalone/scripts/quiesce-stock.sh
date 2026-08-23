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
# standalone host's own boot splash then replaces it with the same image.
# Without this the retained frame is the stock Tools menu, which reads as a
# hang (Josh, first hands-on 2026-08-15: "no indication that it's loading").
# The shim keeps compositing /dev/shm/schwung-display for the frames between
# shadow_ui's exit and the freeze — display_mode stays set (re-asserted here
# for good measure), which is exactly why the menu stayed on screen before.
# ⚠ The display SHM is PAGE-PACKED (8 pages x 128 cols, byte = 8 vertical
# pixels, bit 0 topmost — see movy grab-screen / display_server.c), while
# splash.hex is row-major MSB-first; the python below converts.
paint_splash() {
    [ -e /dev/shm/schwung-display ] || return 0
    [ -f /data/UserData/dbx-host/splash.hex ] || return 0
    python3 - <<'PY' && say "splash painted into stock display"
import mmap
src = bytes.fromhex(open("/data/UserData/dbx-host/splash.hex").read().strip())
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
    stop_ticker
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
# The launch ticker: "dAVEBOx" scrolling across the pads (Josh, 2026-08-23)
# for as long as stock Move is alive to show it — from the moment stock's UI
# has gone until the freeze. It writes stock's shadow-UI LED ring, the same
# path stock's menu LEDs took a second ago; pad-ticker.py documents the ring.
# Looping with no end by design: the freeze simply keeps the last frame.
TICKER_PID=""
start_ticker() {
    [ -x /data/UserData/dbx-host/scripts/pad-ticker.py ] || return 0
    [ -e /dev/shm/schwung-midi-out ] || return 0
    python3 /data/UserData/dbx-host/scripts/pad-ticker.py >/dev/null 2>&1 &
    TICKER_PID=$!
    say "pad ticker started ($TICKER_PID)"
}
stop_ticker() {
    [ -n "$TICKER_PID" ] || return 0
    kill "$TICKER_PID" 2>/dev/null && say "pad ticker stopped (last frame stays on the pads)"
    TICKER_PID=""
}
trap stop_ticker EXIT

save_song() {
    pgrep -x MoveOriginal >/dev/null 2>&1 || return 0
    dbus-send --system --print-reply --reply-timeout=4000 \
        --dest=com.ableton.move \
        /com/ableton/move/browser \
        com.ableton.move.Browser.saveSongIfDirty string: \
        >/dev/null 2>&1 && say "saveSongIfDirty done" \
                        || say "saveSongIfDirty unavailable"
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
    start_ticker
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
        start_ticker
        save_song
        freeze_move
        exit 0
    fi
    sleep 0.1
    i=$((i + 1))
done

say "shadow_ui still running after 5s — proceeding anyway"
paint_splash
start_ticker
save_song
freeze_move
exit 0
