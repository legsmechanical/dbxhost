/*
 * Device-global switches that are not a song's: read once, lazily; written on
 * every change. Each lives in its own small file under dbx-host, beside the
 * Daves switch, so it survives updates and the uninstaller keeps it.
 */
import { S } from './ui_state.mjs';

/* The bank column in the BANK VIEW (Josh, 2026-09-27: "Global toggle to
 * disable bank navigation overlay when bank cards are locked"). On = the
 * column comes up while the jog walks the banks from the bank view, as on the
 * overview; Off = the bank view walks without it. The overview keeps its
 * column either way. Absent file = On (the behaviour before the switch). */
export const BANK_VIEW_MAP_PATH = '/data/UserData/dbx-host/bank-view-map.txt';

export function bankViewMapOn() {
    if (S.bankViewMapOn === null) {
        let on = true;
        try {
            on = !(host_file_exists(BANK_VIEW_MAP_PATH) &&
                   String(host_read_file(BANK_VIEW_MAP_PATH) || '').trim() === '0');
        } catch (e) { on = true; }
        S.bankViewMapOn = on;
    }
    return S.bankViewMapOn;
}

export function setBankViewMapOn(v) {
    S.bankViewMapOn = !!v;
    let wrote = false;
    try { wrote = !!host_write_file(BANK_VIEW_MAP_PATH, S.bankViewMapOn ? '1\n' : '0\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[prefs] could not persist Bank Map on Lock to ' + BANK_VIEW_MAP_PATH);
}
