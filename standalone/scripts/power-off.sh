#!/bin/sh
# power-off.sh — end the session and turn the Move off (dAVEBOx's SAVE & POWER
# OFF). Run by the module through host_system_cmd once ITS state is saved.
#
# The order is the whole point:
#   1. Move's own song reaches disk (nobody saves it on a normal quit; Move
#      would otherwise lose an unsaved edit to its instruments or mixer).
#   2. A marker tells the launcher this quit is a power-off.
#   3. The session ends exactly as exit-to-stock.sh ends it: the host's
#      SIGTERM saves (slots, buses, chains) run, the launcher tears down —
#      set swap, SHM — and only THEN, seeing the marker, runs
#      `heal --poweroff`. Powering off from here instead would cut the
#      teardown short.
DBX_DIR="${DBX_DIR:-/data/UserData/daveboxSA}"

# 1. Best effort, bounded: an unanswered D-Bus call must not hold the Move on.
dbus-send --system --print-reply --reply-timeout=4000 \
    --dest=com.ableton.move /com/ableton/move/browser \
    com.ableton.move.Browser.saveSongIfDirty string: >/dev/null 2>&1 || true
sync

# 2.
: > "$DBX_DIR/poweroff-request"
sync

# 3.
exec sh "$DBX_DIR/scripts/exit-to-stock.sh"
