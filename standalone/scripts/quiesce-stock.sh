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

# Ask Move to save a dirty song first — the Design-B library swap moves the
# native set directories, so unsaved musical edits must reach disk before the
# stack dies. Best-effort like everything here: in the ordinary Tools-menu
# launch Move is already gone by now (launch-standalone.sh killed it) and this
# no-ops; it matters on the direct/dev launch path where the stack is alive.
# Whether Move's own clean teardown also saves is device experiment DE-1
# (docs/working/DBSA_SET_WORKSPACE.md in the davebox repo).
if pgrep -x MoveOriginal >/dev/null 2>&1; then
    dbus-send --system --print-reply --reply-timeout=4000 \
        --dest=com.ableton.move \
        /com/ableton/move/browser \
        com.ableton.move.Browser.saveSongIfDirty string: \
        >/dev/null 2>&1 && echo "quiesce: saveSongIfDirty done" \
                        || echo "quiesce: saveSongIfDirty unavailable"
fi

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
    python3 - <<'PY' && echo "quiesce: splash painted into stock display"
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
    # A few SPI frames (~3 ms each) so the shim pushes the new frame to the
    # panel before Move stops producing frames at all.
    sleep 0.2
    pids=$(pidof MoveOriginal 2>/dev/null || true)
    if [ -n "$pids" ]; then
        kill -STOP $pids 2>/dev/null && echo "quiesce: MoveOriginal frozen ($pids)"
    fi
}

if [ ! -e "$CONTROL" ]; then
    echo "quiesce: no stock control SHM — nothing to save"
    freeze_move
    exit 0
fi

# should_exit is byte 2 of shadow_control_t (display_mode, shadow_ready,
# should_exit, ...). Setting it asks for a saved, orderly exit.
python3 - "$CONTROL" <<'PY'
import mmap, sys
try:
    with open(sys.argv[1], "r+b") as f:
        mm = mmap.mmap(f.fileno(), 84)
        mm[2] = 1
        mm.flush()
        mm.close()
    print("quiesce: should_exit set")
except Exception as e:
    print("quiesce: could not set should_exit: %s" % e)
PY

# Wait for shadow_ui to finish saving and go. The save is a handful of small
# JSON writes, so this is fast; the ceiling only exists so a wedged UI cannot
# stall the launch forever.
i=0
while [ "$i" -lt 50 ]; do
    pgrep -x shadow_ui >/dev/null 2>&1 || { echo "quiesce: shadow_ui exited after $((i * 100))ms"; freeze_move; exit 0; }
    sleep 0.1
    i=$((i + 1))
done

echo "quiesce: shadow_ui still running after 5s — proceeding anyway"
freeze_move
exit 0
