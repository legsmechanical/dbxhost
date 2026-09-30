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

/* Touching the jog shows the current bank card (Josh, 2026-09-30: "Add global
 * menu option for touch jog to show current bank card.  Shows bank cards on jog
 * touch like davebox legacy did. Showing the bank card should be the default.").
 * On = while a finger rests on the jog the card of the bank you are on is shown
 * (the session mixer page in session view), and a turn draws the bank column
 * over it; Off = the bare touch shows nothing, as since 2026-08-31. Absent file
 * = On. */
export const JOG_TOUCH_CARD_PATH = '/data/UserData/dbx-host/jog-touch-card.txt';

export function jogTouchCardOn() {
    if (S.jogTouchCardOn === null) {
        let on = true;
        try {
            on = !(host_file_exists(JOG_TOUCH_CARD_PATH) &&
                   String(host_read_file(JOG_TOUCH_CARD_PATH) || '').trim() === '0');
        } catch (e) { on = true; }
        S.jogTouchCardOn = on;
    }
    return S.jogTouchCardOn;
}

export function setJogTouchCardOn(v) {
    S.jogTouchCardOn = !!v;
    let wrote = false;
    try { wrote = !!host_write_file(JOG_TOUCH_CARD_PATH, S.jogTouchCardOn ? '1\n' : '0\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[prefs] could not persist Jog Touch Card to ' + JOG_TOUCH_CARD_PATH);
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

/* The MIDI browser (ui_midi_import, Josh 2026-09-29): it plays or not as it was
 * left, and places a drum file's sounds by the Map it was last set to. One
 * small file each. (Where each track was is kept in memory only.) */
export const MIDI_MUTE_PATH  = '/data/UserData/dbx-host/midi-mute.txt';    /* absent = heard */
export const MIDI_MAP_PATH   = '/data/UserData/dbx-host/midi-map.txt';     /* off | gm | move; absent = gm */

function readPref(path) {
    try { return host_file_exists(path) ? String(host_read_file(path) || '') : ''; } catch (e) { return ''; }
}
function writePref(path, text, what) {
    let wrote = false;
    try { wrote = !!host_write_file(path, text); } catch (e) { wrote = false; }
    if (!wrote) console.log('[prefs] could not persist ' + what + ' to ' + path);
}

export function midiMuted() {
    if (S.midiMuted === null) S.midiMuted = readPref(MIDI_MUTE_PATH).trim() === '1';
    return S.midiMuted;
}
export function setMidiMuted(v) {
    S.midiMuted = !!v;
    writePref(MIDI_MUTE_PATH, S.midiMuted ? '1\n' : '0\n', 'the MIDI preview mute');
}

const MIDI_MAPS = ['off', 'gm', 'move'];
export function midiMap() {
    if (S.midiMap === null) {
        const v = readPref(MIDI_MAP_PATH).trim();
        S.midiMap = MIDI_MAPS.includes(v) ? v : 'gm';
    }
    return S.midiMap;
}
export function setMidiMap(v) {
    S.midiMap = MIDI_MAPS.includes(v) ? v : 'gm';
    writePref(MIDI_MAP_PATH, S.midiMap + '\n', 'the MIDI drum map');
}
