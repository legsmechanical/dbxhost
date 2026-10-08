#!/bin/sh
# bluetooth-cmd.sh: the gate that keeps the Bluetooth row, and every radio
# command, off a unit that has no Bluetooth controller — which is every stock
# unit this ships to. Runs the real script against a stand-in sysfs and a
# stand-in bluetoothctl that records what it was asked.
set -u
cd "$(dirname "$0")/../.."
SRC="standalone/scripts/bluetooth-cmd.sh"
fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=1; }

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dbx/scripts" "$T/bin" "$T/nobt-bin" "$T/sys-with/hci0" "$T/sys-without"
cp "$SRC" "$T/dbx/scripts/bluetooth-cmd.sh"
printf '#!/bin/sh\necho "$*" >> "%s/calls"\n' "$T" > "$T/bin/bluetoothctl"
# timeout(1) is not on every dev machine; the stand-in drops the duration.
printf '#!/bin/sh\nshift\nexec "$@"\n' > "$T/bin/timeout"
cp "$T/bin/timeout" "$T/nobt-bin/timeout"
chmod +x "$T/bin/bluetoothctl" "$T/bin/timeout" "$T/nobt-bin/timeout"
CMD="$T/dbx/scripts/bluetooth-cmd.sh"
MARK="$T/dbx/bluetooth-present"; PREF="$T/dbx/bluetooth.txt"
run() {  # run <sysfs> <bin> <args...>
    _sys="$1"; _bin="$2"; shift 2
    BT_SYSFS="$_sys" PATH="$_bin:/usr/bin:/bin" sh "$CMD" "$@"
}
calls() { cat "$T/calls" 2>/dev/null | tr '\n' ';'; }
settle() { i=0; while [ $i -lt 40 ] && [ ! -s "$T/calls" ]; do sleep 0.05; i=$((i+1)); done; }

echo "test_bluetooth_cmd"

# --- a unit with no controller ---------------------------------------------
: > "$MARK"; echo 0 > "$PREF"; rm -f "$T/calls"
run "$T/sys-without" "$T/bin" apply; rc=$?
[ "$rc" = 0 ] && ok "apply exits 0 with no controller" || bad "apply rc=$rc"
[ ! -e "$MARK" ] && ok "...and takes a stale marker away" || bad "marker survived with no controller"
[ -z "$(calls)" ] && ok "...and never calls bluetoothctl, saved choice or not" || bad "called: $(calls)"
run "$T/sys-without" "$T/bin" off; rc=$?
[ "$rc" != 0 ] && [ -z "$(calls)" ] && ok "off refuses and does nothing" || bad "off rc=$rc calls=$(calls)"

# --- a controller in the kernel but no bluetoothctl -------------------------
rm -f "$MARK" "$T/calls"
run "$T/sys-with" "$T/nobt-bin" apply
[ ! -e "$MARK" ] && ok "no bluetoothctl: no marker" || bad "marker written without bluetoothctl"

# --- a unit with Bluetooth --------------------------------------------------
rm -f "$MARK" "$PREF" "$T/calls"
run "$T/sys-with" "$T/bin" apply
[ -e "$MARK" ] && ok "apply leaves the marker" || bad "no marker on a unit with Bluetooth"
[ -z "$(calls)" ] && ok "no saved choice: the radio is left as found" || bad "called: $(calls)"

echo 0 > "$PREF"; rm -f "$T/calls"; run "$T/sys-with" "$T/bin" apply
[ "$(calls)" = "power off;" ] && ok "saved Off powers the radio down" || bad "saved 0 -> $(calls)"
echo 1 > "$PREF"; rm -f "$T/calls"; run "$T/sys-with" "$T/bin" apply
[ "$(calls)" = "power on;" ] && ok "saved On powers it up" || bad "saved 1 -> $(calls)"

rm -f "$T/calls"; echo 1 > "$PREF"
run "$T/sys-with" "$T/bin" off; rc=$?; settle
[ "$rc" = 0 ] && [ "$(calls)" = "power off;" ] && ok "off powers down" || bad "off rc=$rc calls=$(calls)"
[ "$(cat "$PREF")" = 1 ] && ok "...and leaves the saved choice to the menu" || bad "the script rewrote the saved choice"
rm -f "$T/calls"; run "$T/sys-with" "$T/bin" on; settle
[ "$(calls)" = "power on;" ] && ok "on powers up" || bad "on -> $(calls)"

run "$T/sys-with" "$T/bin" bogus 2>/dev/null; [ $? = 2 ] && ok "an unknown verb is refused" || bad "unknown verb accepted"

# --- the launcher runs it ---------------------------------------------------
grep -q 'bluetooth-cmd.sh" apply' standalone/scripts/launch.sh \
    && ok "launch.sh applies the saved choice" || bad "launch.sh does not call apply"

[ "$fail" = 0 ] && echo "PASS: test_bluetooth_cmd" || { echo "FAIL: test_bluetooth_cmd"; exit 1; }
