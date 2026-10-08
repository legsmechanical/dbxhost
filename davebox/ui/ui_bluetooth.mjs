/* ui_bluetooth.mjs — the Bluetooth switch in the global menu.
 *
 * The radio belongs to the unit, not to a project, so the choice is
 * device-global: a pref file beside the others. The launcher applies it at
 * session start and leaves a marker when the unit has a Bluetooth controller
 * at all (scripts/bluetooth-cmd.sh) — a stock unit has none, and there the
 * row is not shown.
 *
 * No pref file = On: the radio is left the way it was found. */

import { S } from './ui_state.mjs';
import { DAVEBOX_HOST_DIR } from './ui_engine.mjs';

const PREF_PATH    = DAVEBOX_HOST_DIR + '/bluetooth.txt';
const PRESENT_PATH = DAVEBOX_HOST_DIR + '/bluetooth-present';
const BLUETOOTH_CMD = DAVEBOX_HOST_DIR + '/scripts/bluetooth-cmd.sh';

export function bluetoothPresent() {
    try { return !!host_file_exists(PRESENT_PATH); } catch (e) { return false; }
}

export function bluetoothOn() {
    if (S.bluetoothOn === null) {
        let on = true;
        try {
            if (host_file_exists(PREF_PATH))
                on = String(host_read_file(PREF_PATH) || '').trim() !== '0';
        } catch (e) { on = true; }
        S.bluetoothOn = on;
    }
    return S.bluetoothOn;
}

export function setBluetoothOn(v) {
    S.bluetoothOn = !!v;
    /* The file first: it is what the next launch applies, so a radio that
     * changed with no record of it would silently flip back. */
    let wrote = false;
    try { wrote = !!host_write_file(PREF_PATH, S.bluetoothOn ? '1\n' : '0\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[bluetooth] could not persist the Bluetooth switch to ' + PREF_PATH);
    let rc = -1;
    try { rc = host_system_cmd('sh ' + BLUETOOTH_CMD + (S.bluetoothOn ? ' on' : ' off')); } catch (e) { rc = -1; }
    if (rc !== 0) console.log('[bluetooth] ' + BLUETOOTH_CMD + ' failed (' + rc + ')');
}
