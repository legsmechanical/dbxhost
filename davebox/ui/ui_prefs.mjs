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

/* Seq Follow (Josh, 2026-09-29): ONE switch for the whole device, toggled by
 * holding Left or Right and pressing Play. On = the step page tracks the
 * playhead while the active clip plays. Absent file = On (the old default). */
export const SEQ_FOLLOW_PATH = '/data/UserData/dbx-host/seq-follow.txt';

export function seqFollowOn() {
    if (S.seqFollowOn === null) {
        let on = true;
        try {
            on = !(host_file_exists(SEQ_FOLLOW_PATH) &&
                   String(host_read_file(SEQ_FOLLOW_PATH) || '').trim() === '0');
        } catch (e) { on = true; }
        S.seqFollowOn = on;
    }
    return S.seqFollowOn;
}

export function setSeqFollowOn(v) {
    S.seqFollowOn = !!v;
    let wrote = false;
    try { wrote = !!host_write_file(SEQ_FOLLOW_PATH, S.seqFollowOn ? '1\n' : '0\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[prefs] could not persist Seq Follow to ' + SEQ_FOLLOW_PATH);
}

/* Whether the page follows the playhead right now: the switch, unless an arrow
 * press paused it during this run of the transport (S.followPaused, cleared by
 * the next real stop — a restart is not a stop). */
export function followActive() {
    return seqFollowOn() && !S.followPaused;
}
