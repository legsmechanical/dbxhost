/* ui_resample.mjs — the SAMPLE MENU and SCENE RESAMPLE (Josh, 2026-10-25).
 *
 * A Sample tap opens one short menu — "pick what you want to do and select
 * how". Session View: Bake scene / Resample scene / Resample clip / Live
 * merge. Track View: Bake clip / Resample clip / Live merge track. The old ways in (tap Sample then a row = bake
 * scene, Shift+Sample = Live Merge) are gone. Bake and Resample go on to the
 * scene picker (pendingSceneBakePicker, `scenePickFor` says which), then that
 * action's options. Back steps back a level; Note/Session tears it all down.
 *
 * RESAMPLE records the scene's audio to a WAV through the engine's
 * `resample_scene` (seq8_resample.c): from a STOPPED transport, the row
 * launches and the take runs bar-exact for Bars (+ Tail) bars. The file lands
 * in the library, so Move's sampler can browse it, never inside the project.
 * It looks and holds the surface as a Post-module PRINT does (ui_print.mjs):
 * the same notices (RESAMPLING / RESAMPLED / RESAMPLE CANCELLED / STOP TO
 * RESAMPLE), Back cancels, every other button is swallowed. The engine's
 * outcome arrives in state_snapshot (S.resampleState / Done / Frames); the
 * file is complete only once the host's sampler stops recording.
 *
 * Input is wired in ui_input_cc.mjs (jog, Back, the picker); this module holds
 * the state transitions and the drawing. */
import * as os from 'os';
import { S } from './ui_state.mjs';
import { showActionPopupFor } from './ui_persistence.mjs';
import { SCENE_LETTERS } from './ui_constants.mjs';
import { sanitizeName } from './ui_export.mjs';
import { nowMs } from './ui_clock.mjs';
import { drawKitHeader, drawKitList } from './ui_movy.mjs';
import { MoveBack, MoveShift } from '/data/UserData/schwung/shared/constants.mjs';

export const RESAMPLE_DIR = '/data/UserData/UserLibrary/Samples/dAVEBOx/Resample';

/* The engine's states (seq8_resample.c RS_*) */
const RS_IDLE = 0, RS_ARMED = 1, RS_STARTING = 2, RS_RECORDING = 3,
      RS_DONE = 4, RS_CANCELLED = 5, RS_FAILED = 6;

/* Why a take did not run (resample_err), as RESAMPLE FAILED's second line. */
const RS_ERR_TEXT = {
    1: 'Stop playback first',
    2: 'Clock Follow is on',
    4: 'A merge or bake is running',
    5: 'Could not start',
    6: 'The sampler is busy',
    7: 'The track plays no instrument',
    8: 'The track is muted',
};

const TAIL_MAX = 8;
const BARS_MAX = 64;

/* ---- the menu ---------------------------------------------------------- */

/* A row that opens a screen (a picker, the options) carries the chevron; one
 * that opens a confirm or a notice does not (UI_LANGUAGE §5.0). */
const SESSION_ITEMS = [
    { id: 'bake',          label: 'Bake scene',     chevron: true },   /* the scene picker */
    { id: 'resample',      label: 'Resample scene', chevron: true },
    { id: 'resample_clip', label: 'Resample clip',  chevron: true },   /* the clip picker */
    { id: 'merge',         label: 'Live merge' },
];
const TRACK_ITEMS = [
    { id: 'bake',          label: 'Bake clip' },
    { id: 'resample_clip', label: 'Resample clip',  chevron: true },   /* the active clip's options */
    { id: 'merge',         label: 'Live merge track' },
];

export function resampleRunning() { return S.resampleTake !== null; }

/* Every layer of the Sample flow, for the modal lists. */
export function sampleFlowUp() {
    return S.sampleMenu !== null || S.confirmResample !== null;
}

export function openSampleMenu() {
    S.sampleMenu = { items: S.sessionView ? SESSION_ITEMS : TRACK_ITEMS, sel: 0 };
    S.screenDirty = true;
}

export function closeSampleFlow() {
    S.sampleMenu = null;
    S.confirmResample = null;
    S.scenePickFor = 'bake';
    S.sampleFlow = false;
}

export function sampleMenuRotate(delta) {
    const m = S.sampleMenu;
    if (!m || !delta) return;
    m.sel = Math.max(0, Math.min(m.items.length - 1, m.sel + (delta > 0 ? 1 : -1)));
    S.screenDirty = true;
}

/* The picked item's id; the caller (ui_input_cc) acts on it. */
export function sampleMenuPick() {
    const m = S.sampleMenu;
    if (!m) return null;
    const id = m.items[m.sel].id;
    S.sampleMenu = null;
    S.sampleFlow = true;
    S.screenDirty = true;
    return id;
}

/* Back from the scene picker or a bake dialog that the menu opened. */
export function reopenSampleMenu(sel) {
    const items = S.sessionView ? SESSION_ITEMS : TRACK_ITEMS;
    S.sampleMenu = { items, sel: Math.max(0, Math.min(items.length - 1, sel | 0)) };
    S.screenDirty = true;
}

export function menuIndexOf(id) {
    const items = S.sessionView ? SESSION_ITEMS : TRACK_ITEMS;
    for (let i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return 0;
}

export function drawSampleMenu() {
    clear_screen();
    const m = S.sampleMenu;
    drawKitHeader('SAMPLE', false);
    drawKitList(m.items.map((it) => ({ label: it.label, chevron: !!it.chevron })), m.sel);
}

/* ---- the options ------------------------------------------------------- */

/* A scene's rows: Length, Warm-up, Tail, Start. A clip's add Source (Wet /
 * Dry) after Length. `rows(r)` names them in order. */
function rows(r) {
    return r.track >= 0 ? ['bars', 'src', 'warm', 'tail', 'start'] : ['bars', 'warm', 'tail', 'start'];
}
const rowAt = (r) => rows(r)[r.sel];

/* The picker chose row `c`. A take starts from stopped, so the refusal is up
 * front, before the options. */
export function notPlayingForResample() {
    if (!S.playing) return true;
    showActionPopupFor(2500, 'STOP TO RESAMPLE', 'It plays from the top');
    return false;
}

export function openResampleOptions(c) {
    if (!notPlayingForResample()) { closeSampleFlow(); return; }
    if (S.clockFollowOn) { closeSampleFlow(); showActionPopupFor(2500, 'RESAMPLE FAILED', RS_ERR_TEXT[2]); return; }
    const bars = parseInt(host_module_get_param('resample_bars_' + c), 10) | 0;
    if (bars <= 0) { closeSampleFlow(); showActionPopupFor(2500, 'NOTHING TO', 'RESAMPLE', 'Scene ' + SCENE_LETTERS[c] + ' is empty'); return; }
    S.confirmResample = { track: -1, clip: c, bars, warm: false, tail: 0, src: 0, dryOk: false,
                          sel: 3, editing: false };
    S.screenDirty = true;
}

/* What track t's notes play: 'schwung', 'move', or null (MIDI out / none). A
 * MIDI track that follows another plays THAT track's instrument. */
function clipInstrument(t) {
    let r = S.trackRoute[t] | 0;
    const to = S.trackMidiTo[t] | 0;
    if (r === 2 && to > 0) r = S.trackRoute[to - 1] | 0;
    return r === 0 ? 'schwung' : r === 1 ? 'move' : null;
}

function clipName(t, c) { return (t + 1) + SCENE_LETTERS[c]; }

/* Track t's clip c, from Track View (its active clip) or the Session View clip
 * picker (`from`: 'menu' / 'picker' — where Back returns). Refusals up front. */
export function openClipResampleOptions(t, c, from) {
    if (!notPlayingForResample()) { closeSampleFlow(); return; }
    if (S.clockFollowOn) { closeSampleFlow(); showActionPopupFor(2500, 'RESAMPLE FAILED', RS_ERR_TEXT[2]); return; }
    const inst = clipInstrument(t);
    if (!inst) { closeSampleFlow(); showActionPopupFor(2500, 'NOTHING TO', 'RESAMPLE', 'Track ' + (t + 1) + ' plays MIDI out'); return; }
    const anySolo = S.trackSoloed.some((v) => v);
    if (S.trackMuted[t] || (anySolo && !S.trackSoloed[t])) {
        closeSampleFlow(); showActionPopupFor(2500, 'NOTHING TO', 'RESAMPLE', 'Track ' + (t + 1) + ' is muted'); return;
    }
    const bars = parseInt(host_module_get_param('resample_bars_t' + t + '_c' + c), 10) | 0;
    if (bars <= 0) { closeSampleFlow(); showActionPopupFor(2500, 'NOTHING TO', 'RESAMPLE', 'Clip ' + clipName(t, c) + ' is empty'); return; }
    /* A Move instrument comes back late (it plays out to Move and returns), so
     * its takes start with Warm-up on: the late tail wraps into the loop. */
    S.confirmResample = { track: t, clip: c, bars, warm: inst === 'move', tail: 0, src: 0,
                          dryOk: inst === 'schwung', from: from || 'menu', sel: 4, editing: false };
    S.screenDirty = true;
}

export function resampleOptionsRotate(delta) {
    const r = S.confirmResample;
    if (!r || !delta) return;
    const d = delta > 0 ? 1 : -1;
    if (r.editing) {
        if (rowAt(r) === 'bars') r.bars = Math.max(1, Math.min(BARS_MAX, r.bars + d));
        else if (rowAt(r) === 'tail') r.tail = Math.max(0, Math.min(TAIL_MAX, r.tail + d));
    } else {
        r.sel = Math.max(0, Math.min(rows(r).length - 1, r.sel + d));
    }
    S.screenDirty = true;
}

/* Jog click. Returns true when the take was started. */
export function resampleOptionsClick() {
    const r = S.confirmResample;
    if (!r) return false;
    const row = rowAt(r);
    if (row === 'warm') { r.warm = !r.warm; S.screenDirty = true; return false; }
    /* Source flips like a toggle; on a Move instrument it is not available. */
    if (row === 'src') { if (r.dryOk) r.src = r.src ? 0 : 1; S.screenDirty = true; return false; }
    if (row === 'bars' || row === 'tail') { r.editing = !r.editing; S.screenDirty = true; return false; }
    return startResample();
}

/* Back: an edit first, then the options themselves — back to the picker they
 * came from, or to the menu (Track View's clip). */
export function resampleOptionsBack() {
    const r = S.confirmResample;
    if (!r) return;
    if (r.editing) { r.editing = false; S.screenDirty = true; return; }
    S.confirmResample = null;
    if (r.track >= 0 && r.from === 'menu') {
        reopenSampleMenu(menuIndexOf('resample_clip'));
        return;
    }
    S.pendingSceneBakePicker = true;
    S.scenePickFor = r.track >= 0 ? 'resample_clip' : 'resample';
    S.screenDirty = true;
}

function barsLabel(n) { return n + (n === 1 ? ' bar' : ' bars'); }

export function drawResampleOptions() {
    clear_screen();
    const r = S.confirmResample;
    const editing = (name) => r.editing && rowAt(r) === name;
    const all = {
        bars:  { label: 'Length',  value: barsLabel(r.bars), editing: editing('bars') },
        /* Dry needs a Schwung chain: on a Move instrument the value is '-'
         * (UI_LANGUAGE §6: unavailable is said in the value). */
        src:   { label: 'Source',  value: r.dryOk ? (r.src ? 'Dry' : 'Wet') : '-' },
        warm:  { label: 'Warm-up', value: r.warm ? 'On' : 'Off' },
        tail:  { label: 'Tail',    value: r.tail ? barsLabel(r.tail) : 'Off', editing: editing('tail') },
        start: { label: 'Start', hdr: true },
    };
    drawKitHeader(r.track >= 0 ? 'RESAMPLE CLIP ' + clipName(r.track, r.clip)
                               : 'RESAMPLE SCENE ' + SCENE_LETTERS[r.clip], false);
    drawKitList(rows(r).map((n) => all[n]), r.sel);
}

/* ---- the take ---------------------------------------------------------- */

/* A free name in the folder: the base, then " 2" … " 99". */
function freePath(base) {
    for (let n = 1; n <= 99; n++) {
        const p = RESAMPLE_DIR + '/' + base + (n > 1 ? ' ' + n : '') + '.wav';
        const [st] = os.stat(p);
        if (!st) return p;
    }
    return null;
}

function startResample() {
    const r = S.confirmResample;
    if (!notPlayingForResample()) { closeSampleFlow(); return false; }
    const bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? S.bpmMirror : 120;
    const clip = r.track >= 0;
    /* A clip is named as the MIDI export names it (`mngk 3B`); a scene says so. */
    const what = clip ? clipName(r.track, r.clip) : 'Scene ' + SCENE_LETTERS[r.clip];
    const base = sanitizeName(S.currentSetName) + ' ' + what + ' ' + r.bars + 'bar ' + Math.round(bpm) + 'bpm';
    /* The directory is the HOST's to create: it hands every level it makes to
     * the user Move runs as. Made here, it would be root's. */
    const path = freePath(base);
    if (!path) { closeSampleFlow(); showActionPopupFor(2500, 'RESAMPLE FAILED', 'No free file name'); return false; }
    const common = r.bars + ' ' + (r.warm ? 1 : 0) + ' ' + r.tail;
    if (clip)
        S.pendingDefaultSetParams.push({ key: 'resample_clip',
            val: r.track + ' ' + r.clip + ' ' + common + ' ' + (r.dryOk && r.src ? 1 : 0) + ' |' + path });
    else
        S.pendingDefaultSetParams.push({ key: 'resample_scene', val: r.clip + ' ' + common + ' |' + path });
    S.resampleTake = { path, file: path.slice(RESAMPLE_DIR.length + 1),
                       what: clip ? 'Clip ' + what : what,
                       bars: r.bars + r.tail, loopBars: r.bars, warm: r.warm, at: nowMs(), seen: false,
                       stopSent: false, shownBar: -1 };
    closeSampleFlow();
    showRunning(S.resampleTake, r.warm ? 'warm-up' : 'starting');
    return true;
}

/* The running notice, as PRINTING's: held until the next one replaces it. */
function showRunning(t, where) {
    showActionPopupFor(60000, 'RESAMPLING', t.what + ', ' + where, 'Back cancels');
}

/* Back while a take runs: the transport stop is the cancel. */
export function cancelResample() {
    if (!S.resampleTake) return;
    S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
}

/* The surface while a take runs, as a print holds it: Back cancels; Shift
 * passes; every other button press and release is swallowed. Returns true if
 * it took the event. */
export function resampleModalCC(d1, d2) {
    if (!S.resampleTake) return false;
    if (d1 === MoveShift) return false;
    if (d1 === MoveBack) { if (d2 === 127) cancelResample(); return true; }
    /* knobs, touches and the jog are not buttons; leave them be */
    if ((d1 >= 71 && d1 <= 79) || (d1 >= 102 && d1 <= 109) || d1 === 14 || d1 === 8 || d1 === 9) return false;
    return true;
}

function finish(ms, ...lines) {
    S.pendingDefaultSetParams.push({ key: 'resample_clear', val: '1' });
    S.resampleTake = null;
    showActionPopupFor(ms, ...lines);
}

function sampling() {
    try { return !!host_sampler_is_recording(); } catch (e) { return false; }
}

/* Every tick while a take is up. */
export function resampleTick() {
    const t = S.resampleTake;
    /* a conversion's takes are auConvertTick's (ui_audio_convert): this one
     * would put "undefined, bar NaN" on its notice and end it early */
    if (!t || t.convert) return;
    const st = S.resampleState | 0;
    if (st === RS_IDLE) {
        /* The engine has not taken the command yet — it lands within a frame
         * or two. Not at all means it never arrived. */
        if (!t.seen && nowMs() - t.at > 3000) finish(2500, 'RESAMPLE FAILED', 'No response');
        return;
    }
    t.seen = true;
    if (st === RS_ARMED || st === RS_STARTING) return;
    if (st === RS_RECORDING) {
        const frames = S.resampleFrames >>> 0, done = S.resampleDone >>> 0;
        if (!frames) return;
        const bar = Math.min(t.bars, Math.floor(done * t.bars / frames) + 1);
        if (bar !== t.shownBar) { t.shownBar = bar; showRunning(t, 'bar ' + bar + '/' + t.bars); }
        return;
    }
    if (st === RS_DONE) {
        if (!t.stopSent) { t.stopSent = true; S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' }); }
        if (sampling()) return;                    /* the file is still being written */
        const [s] = os.stat(t.path);
        /* What and where, not the file name: the card fits ~18 characters and
         * the name's distinguishing part (scene, length) is at its END — on the
         * device it read "Polite Gate Scene~". BAKED's card shape. */
        if (s) finish(2500, 'RESAMPLED', t.what + ', ' + barsLabel(t.loopBars), 'In Samples/dAVEBOx');
        else   finish(2500, 'RESAMPLE FAILED', 'Not saved');
        return;
    }
    if (st === RS_CANCELLED) {
        if (sampling()) return;
        try { os.remove(t.path); } catch (e) { /* never written */ }
        finish(1500, 'RESAMPLE CANCELLED');
        return;
    }
    if (st === RS_FAILED) {
        const err = parseInt(host_module_get_param('resample_err'), 10) | 0;
        /* A sampler that refused at the start leaves the scene playing: the
         * take this started is over, so is the playback. */
        if (err === 6 && S.playing) S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
        finish(2500, 'RESAMPLE FAILED', RS_ERR_TEXT[err] || 'Could not start');
    }
}
