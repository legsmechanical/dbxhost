/*
 * Device-global switches that are not a song's: read once, lazily; written on
 * every change. Each lives in its own small file under dbx-host, beside the
 * Daves switch, so it survives updates and the uninstaller keeps it.
 */
import { S, nowMs } from './ui_state.mjs';

/* Card Hold (Josh, 2026-10-13: "a custom knob overview hold setting that
 * dictates how long a card remains on screen after a knob touch is released").
 * Let go of a knob and the page it was showing — the bank's page in Track
 * View, the mixer page in Session View — stays up this long before the
 * overview comes back. Off = it goes with the finger, as before. Device-wide;
 * absent file = Off. */
export const CARD_HOLD_PATH = '/data/UserData/dbx-host/card-hold.txt';
export const CARD_HOLD_CHOICES = [0, 500, 1000, 2000];   /* ms */

export function cardHoldMs() {
    if (S.cardHoldMs === null) {
        let ms = 0;
        try {
            if (host_file_exists(CARD_HOLD_PATH)) ms = parseInt(String(host_read_file(CARD_HOLD_PATH) || '').trim(), 10);
        } catch (e) { ms = 0; }
        S.cardHoldMs = CARD_HOLD_CHOICES.includes(ms) ? ms : 0;
    }
    return S.cardHoldMs;
}

export function setCardHoldMs(v) {
    S.cardHoldMs = CARD_HOLD_CHOICES.includes(v | 0) ? (v | 0) : 0;
    if (S.cardHoldMs === 0) S.cardHoldUntil = -1;
    let wrote = false;
    try { wrote = !!host_write_file(CARD_HOLD_PATH, S.cardHoldMs + '\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[prefs] could not persist Card Hold to ' + CARD_HOLD_PATH);
}

/* A knob was let go: the page it showed stays until the hold runs out. It
 * belongs to the place it was armed — the view, the track and the bank — so
 * moving on never drags a held page along. */
export function armCardHold() {
    const ms = cardHoldMs();
    if (!(ms > 0)) { S.cardHoldUntil = -1; return; }
    S.cardHoldUntil = nowMs() + ms;
    S.cardHoldAt = (S.sessionView ? 's' : 't') + ':' + S.activeTrack + ':' + S.activeBank;
}
/* Is a held page still to be drawn? A RENDER gate only, like the jog-touch
 * reveal: nothing that reads input asks it. Shift stands it down. */
export function cardHoldShows() {
    return S.cardHoldUntil >= 0 && nowMs() < S.cardHoldUntil && !S.shiftHeld &&
           S.cardHoldAt === (S.sessionView ? 's' : 't') + ':' + S.activeTrack + ':' + S.activeBank;
}
/* Once per tick: true the tick the hold runs out, so the overview is redrawn. */
export function cardHoldExpired() {
    if (S.cardHoldUntil < 0 || nowMs() < S.cardHoldUntil) return false;
    S.cardHoldUntil = -1;
    return true;
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
