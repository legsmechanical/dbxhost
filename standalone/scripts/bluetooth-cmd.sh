#!/bin/sh
# The Bluetooth radio, for the session: on, off, and the saved choice.
#
#   bluetooth-cmd.sh apply   at launch: note whether this unit has a Bluetooth
#                            controller, and put the radio where the saved
#                            choice says. No saved choice = left as found.
#   bluetooth-cmd.sh on|off  from the menu: power the controller up or down.
#
# The menu owns the saved choice ($DBX_DIR/bluetooth.txt, "1" or "0") and
# writes it before calling here; this script only ever reads it. The marker
# $DBX_DIR/bluetooth-present is how the menu knows whether to show the row at
# all: a stock unit has no controller and no bluetoothctl.
#
# Powering goes through bluetoothd over D-Bus, which the session user is
# allowed to do; nothing here needs root. The power call can take a second, so
# on/off return at once and let it finish in the background: the caller is the
# UI process, blocked for as long as this runs.

DBX_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PREF="$DBX_DIR/bluetooth.txt"
MARK="$DBX_DIR/bluetooth-present"

# Where the kernel lists Bluetooth controllers. Overridable so the test can
# stand in a unit with and without one.
BT_SYSFS="${BT_SYSFS:-/sys/class/bluetooth}"

present() {
    [ -d "$BT_SYSFS/hci0" ] && command -v bluetoothctl >/dev/null 2>&1
}

power() {
    timeout 8 bluetoothctl power "$1" >/dev/null 2>&1
}

case "$1" in
    apply)
        if ! present; then rm -f "$MARK"; exit 0; fi
        : > "$MARK"
        [ -f "$PREF" ] || exit 0
        case "$(head -c 1 "$PREF")" in
            1) power on ;;
            0) power off ;;
        esac
        ;;
    on|off)
        present || exit 1
        power "$1" &
        ;;
    *)
        echo "usage: bluetooth-cmd.sh apply|on|off" >&2
        exit 2
        ;;
esac
exit 0
