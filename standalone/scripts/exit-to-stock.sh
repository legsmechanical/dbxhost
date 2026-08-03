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

setsid sh -c '
  sleep 1
  pkill -x MoveOriginal
' >/dev/null 2>&1 &

exit 0
