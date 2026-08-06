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

if [ ! -e "$CONTROL" ]; then
    echo "quiesce: no stock control SHM — nothing to save"
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
    pgrep -x shadow_ui >/dev/null 2>&1 || { echo "quiesce: shadow_ui exited after $((i * 100))ms"; exit 0; }
    sleep 0.1
    i=$((i + 1))
done

echo "quiesce: shadow_ui still running after 5s — proceeding anyway"
exit 0
