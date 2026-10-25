/* ui_resample.mjs — the SAMPLE MENU and SCENE RESAMPLE (Josh, 2026-10-25).
 *
 * A Sample tap opens one short menu — "pick what you want to do and select
 * how". Session View: Bake scene / Resample scene / Live merge. Track View:
 * Bake clip / Live merge track. The old ways in (tap Sample then a row = bake
 * scene, Shift+Sample = Live Merge) are gone. Bake and Resample go on to the
 * scene picker (pendingSceneBakePicker, `scenePickFor` says which), then that
 * action's options. Back steps back a level; Note/Session tears it all down.
 *
 * RESAMPLE records the scene's audio to a WAV through the engine's
 * `resample_scene` (seq8_resample.c): from a STOPPED transport, the row
 * launches and the take runs bar-exact for Bars (+ Tail) bars. The file lands
 * in the library, so Move's sampler can browse it, never inside the project.
 * While it runs a gauge shows the bar; Back or Play cancels. The engine's
 * outcome arrives in state_snapshot (S.resampleState / Done / Frames); the
 * file is complete only once the host's sampler stops recording.
 *
 * Input is wired in ui_input_cc.mjs (jog, Back, the picker); this module holds
 * the state transitions and the drawing. */
import * as os from 'os';
import { S } from './ui_state.mjs';
import { showActionPopup, showActionPopupFor, showActionPopupGauge } from './ui_persistence.mjs';
import { SCENE_LETTERS } from './ui_constants.mjs';
import { sanitizeName } from './ui_export.mjs';
import { nowMs } from './ui_clock.mjs';
import { drawKitHeader, drawKitList } from './ui_movy.mjs';

export const RESAMPLE_DIR = '/data/UserData/UserLibrary/Samples/dAVEBOx/Resample';

/* The engine's states (seq8_resample.c RS_*) */
const RS_IDLE = 0, RS_ARMED = 1, RS_STARTING = 2, RS_RECORDING = 3,
      RS_DONE = 4, RS_CANCELLED = 5, RS_FAILED = 6;

const RS_ERR_TEXT = {
    1: ['Stop playback', 'first.'],
    2: ['Not while following', "Move's clock."],
    4: ['Busy: a merge or', 'bake is running.'],
    5: ['Could not start.'],
    6: ['The sampler is busy.'],
};

const TAIL_MAX = 8;
const BARS_MAX = 64;

/* ---- the menu ---------------------------------------------------------- */

const SESSION_ITEMS = [
    { id: 'bake',     label: 'Bake scene' },
    { id: 'resample', label: 'Resample scene' },
    { id: 'merge',    label: 'Live merge' },
];
const TRACK_ITEMS = [
    { id: 'bake',     label: 'Bake clip' },
    { id: 'merge',    label: 'Live merge track' },
];

export function resampleRunning() { return S.resampleTake !== null; }

/* Every layer of the Sample flow, for the modal lists. */
export function sampleFlowUp() {
    return S.sampleMenu !== null || S.confirmResample !== null;
}

export function openSampleMenu() {
    if (resampleRunning()) { showActionPopup('RESAMPLING', 'Back to cancel.'); return; }
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
    drawKitList(m.items.map((it) => ({ label: it.label })), m.sel);
}

/* ---- the options ------------------------------------------------------- */

const ROW_BARS = 0, ROW_WARM = 1, ROW_TAIL = 2, ROW_START = 3;

/* The picker chose row `c`. A take starts from stopped, so the refusal is up
 * front, before the options. */
export function openResampleOptions(c) {
    if (S.playing) { closeSampleFlow(); showActionPopup('RESAMPLE', 'Stop playback', 'first.'); return; }
    if (S.clockFollowOn) { closeSampleFlow(); showActionPopup('RESAMPLE', 'Not while following', "Move's clock."); return; }
    const bars = parseInt(host_module_get_param('resample_bars_' + c), 10) | 0;
    if (bars <= 0) { closeSampleFlow(); showActionPopup('RESAMPLE', 'Scene ' + SCENE_LETTERS[c], 'is empty.'); return; }
    S.confirmResample = { clip: c, bars, warm: false, tail: 0, sel: ROW_START, editing: false };
    S.screenDirty = true;
}

export function resampleOptionsRotate(delta) {
    const r = S.confirmResample;
    if (!r || !delta) return;
    const d = delta > 0 ? 1 : -1;
    if (r.editing) {
        if (r.sel === ROW_BARS) r.bars = Math.max(1, Math.min(BARS_MAX, r.bars + d));
        else if (r.sel === ROW_TAIL) r.tail = Math.max(0, Math.min(TAIL_MAX, r.tail + d));
    } else {
        r.sel = Math.max(ROW_BARS, Math.min(ROW_START, r.sel + d));
    }
    S.screenDirty = true;
}

/* Jog click. Returns true when the take was started. */
export function resampleOptionsClick() {
    const r = S.confirmResample;
    if (!r) return false;
    if (r.sel === ROW_WARM) { r.warm = !r.warm; S.screenDirty = true; return false; }
    if (r.sel === ROW_BARS || r.sel === ROW_TAIL) { r.editing = !r.editing; S.screenDirty = true; return false; }
    return startResample();
}

/* Back: an edit first, then the options themselves (back to the picker). */
export function resampleOptionsBack() {
    const r = S.confirmResample;
    if (!r) return;
    if (r.editing) { r.editing = false; S.screenDirty = true; return; }
    S.confirmResample = null;
    S.pendingSceneBakePicker = true;
    S.scenePickFor = 'resample';
    S.screenDirty = true;
}

function barsLabel(n) { return n + (n === 1 ? ' bar' : ' bars'); }

export function drawResampleOptions() {
    clear_screen();
    const r = S.confirmResample;
    drawKitHeader('RESAMPLE SCENE ' + SCENE_LETTERS[r.clip], false);
    drawKitList([
        { label: 'Length',  value: barsLabel(r.bars), editing: r.editing && r.sel === ROW_BARS },
        { label: 'Warm-up', value: r.warm ? 'On' : 'Off' },
        { label: 'Tail',    value: r.tail ? barsLabel(r.tail) : 'Off', editing: r.editing && r.sel === ROW_TAIL },
        { label: 'Start', hdr: true },
    ], r.sel);
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
    if (S.playing) { closeSampleFlow(); showActionPopup('RESAMPLE', 'Stop playback', 'first.'); return false; }
    const bpm = (S.bpmMirror > 0 && isFinite(S.bpmMirror)) ? S.bpmMirror : 120;
    const base = sanitizeName(S.currentSetName) + ' Scene ' + SCENE_LETTERS[r.clip] + ' ' +
                 r.bars + 'bar ' + Math.round(bpm) + 'bpm';
    /* The directory is the HOST's to create: it hands every level it makes to
     * the user Move runs as. Made here, it would be root's. */
    const path = freePath(base);
    if (!path) { closeSampleFlow(); showActionPopup('RESAMPLE', 'No free file name.'); return false; }
    S.pendingDefaultSetParams.push({ key: 'resample_scene',
        val: r.clip + ' ' + r.bars + ' ' + (r.warm ? 1 : 0) + ' ' + r.tail + ' |' + path });
    S.resampleTake = { path, file: path.slice(RESAMPLE_DIR.length + 1), scene: SCENE_LETTERS[r.clip],
                       bars: r.bars + r.tail, warm: r.warm, at: nowMs(), seen: false,
                       stopSent: false, shownBar: -1 };
    closeSampleFlow();
    showActionPopupGauge(0, -1, 'RESAMPLE', r.warm ? 'Warm-up...' : 'Starting...');
    return true;
}

/* Back / Play while a take runs: the transport stop is the cancel. */
export function cancelResample() {
    if (!S.resampleTake) return;
    S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
}

function finish(...lines) {
    S.pendingDefaultSetParams.push({ key: 'resample_clear', val: '1' });
    S.resampleTake = null;
    showActionPopupFor(3000, ...lines);
}

function sampling() {
    try { return !!host_sampler_is_recording(); } catch (e) { return false; }
}

/* Every tick while a take is up. */
export function resampleTick() {
    const t = S.resampleTake;
    if (!t) return;
    const st = S.resampleState | 0;
    if (st === RS_IDLE) {
        /* The engine has not taken the command yet — it lands within a frame
         * or two. Not at all means it never arrived. */
        if (!t.seen && nowMs() - t.at > 3000) finish('RESAMPLE', 'No response.');
        return;
    }
    t.seen = true;
    if (st === RS_ARMED || st === RS_STARTING) return;
    if (st === RS_RECORDING) {
        const frames = S.resampleFrames >>> 0, done = S.resampleDone >>> 0;
        if (!frames) return;
        const bar = Math.min(t.bars, Math.floor(done * t.bars / frames) + 1);
        if (bar !== t.shownBar) {
            t.shownBar = bar;
            showActionPopupGauge(done / frames, -1, 'RESAMPLE', 'Scene ' + t.scene + '  bar ' + bar + '/' + t.bars);
        }
        S.actionPopupEndTick = nowMs() + 1000;     /* held while it runs */
        return;
    }
    if (st === RS_DONE) {
        if (!t.stopSent) { t.stopSent = true; S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' }); }
        if (sampling()) return;                    /* the file is still being written */
        const [s] = os.stat(t.path);
        if (s) finish('SAVED', t.file.length > 18 ? t.file.slice(0, 17) + '~' : t.file);
        else   finish('RESAMPLE', 'Save failed.');
        return;
    }
    if (st === RS_CANCELLED) {
        if (sampling()) return;
        try { os.remove(t.path); } catch (e) { /* never written */ }
        finish('RESAMPLE', 'Cancelled.');
        return;
    }
    if (st === RS_FAILED) {
        const err = parseInt(host_module_get_param('resample_err'), 10) | 0;
        /* A sampler that refused at the start leaves the scene playing: the
         * take this started is over, so is the playback. */
        if (err === 6 && S.playing) S.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
        finish('RESAMPLE', ...(RS_ERR_TEXT[err] || ['Could not start.']));
    }
}
