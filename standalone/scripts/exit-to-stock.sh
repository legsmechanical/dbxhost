#!/bin/sh
# Leave the davebox host and return to stock Schwung.
#
# Called from inside the running davebox host — by the host's Shift+Back branch
# and by davebox's own "Quit" menu item — via host_system_cmd, whose allowlist
# permits an "sh " prefix.
#
# All this does is stop the davebox host. Everything after is already built:
# launch.sh is waiting on that process, and when it exits it clears the SHM
# namespace and resumes move-launcher.service — and resuming the unit is what
# brings stock Move back. So this deliberately does NOT start anything itself;
# two restorers would race and leave two hosts on the SPI device.
#
# SIGTERM, not SIGKILL: the host gets to run its own shutdown (state saves,
# slot autosave). launch.sh reports the exit status either way.
#
# Detached, because our caller is a child of the process we are about to
# signal — the shell would otherwise die mid-script.

# Mute our own mix BEFORE the kill. shadow_control_t byte 49, mute_move_audio,
# is the shim's whole-mix hardware mute (the last statement of the SPI
# pre-transfer callback zeroes the outgoing audio region after every mixer has
# run). The SIGTERM below is taken by the host's own sigwait() shutdown thread:
# the shim installs no SIGTERM disposition and every shim thread BLOCKS the
# signal at creation (src/host/shim_thread.h), so no shim thread can intercept
# it and pre-empt the host's audio quiesce. Even
# so, that teardown has no fade and no final silent frame, so whatever was in
# flight — a note, a reverb tail, a torn frame — is what the hardware would hold
# across the gap to stock. With the byte set, the last ~344 frames before the
# kill are silence.
# Same offset in stock 1.4.0 and this fork (compiled offsetof, pinned by
# tests/host/test_handoff_mute.sh). Nothing needs to clear it: launch.sh's
# teardown removes /dev/shm/dbxhost-* and the next session maps a fresh,
# zero-filled segment.
python3 - /dev/shm/dbxhost-control <<'PY' 2>/dev/null
import mmap, sys
try:
    with open(sys.argv[1], "r+b") as f:
        mm = mmap.mmap(f.fileno(), 256)
        mm[49] = 1
        mm.flush()
        mm.close()
except Exception:
    pass
PY

setsid sh -c '
  sleep 1
  pkill -x MoveOriginal
' >/dev/null 2>&1 &

exit 0
