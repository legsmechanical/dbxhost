/* ui_midi_import.mjs — Import MIDI, the sound menu's door to a MIDI file.
 *
 * Four stages on one screen (VIEW_MIDI_IMPORT in ui_sound.mjs, which only
 * delegates here):
 *
 *   files    a browser over the user data folder: folders and MIDI files only
 *   tracks   the file's parts, with a miniature of the selected one
 *   opts     K1 start bar · K2 bars · K3 grid · K4 destination clip, and a
 *            picture of what will land (bracketed) against what will not
 *   confirm  only when the import replaces a clip that has notes, or cuts some
 *
 * ⭑ NOTES ONLY. The file's controllers, bends and programs never reach a clip
 * (ui_midifile.mjs does not return them). The file's tempo is not applied:
 * notes are in beats, so they play at the project's tempo.
 *
 * ⭑ The transport STOPS when the screen opens and stays stopped: the read, the
 * preview and the write never share the engine with playback.
 *
 * ⭑ The file is read ONCE, when picked, and nothing refers to it afterwards —
 * the notes live in the clip.
 *
 * Every engine write rides S.pendingDefaultSetParams, the tick's one-per-tick
 * queue, so none can be coalesced away by another write in the same buffer.
 * The import is ONE key (tN_cC_import): one undo unit. The preview is
 * tN_audition, which is heard but never recorded or arpeggiated.
 */
import * as os from 'os';
import * as std from 'std';
import { S as GS, noteUndoUnit } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { NUM_CLIPS, TPS_VALUES, SCENE_LETTERS, PAD_MODE_DRUM, PAD_MODE_CONDUCT } from './ui_constants.mjs';
import { syncClipsTargeted } from './ui_dsp_bridge.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import {
    drawKitHeader, drawKitList, drawKitHintRow, drawKitBankPage, drawKitPrompt, drawKitNoteRoll,
    kitUseLayout, MV_FOOTER_Y,
} from './ui_movy.mjs';
import {
    buildFilepathBrowserState, refreshFilepathBrowser,
    moveFilepathBrowserSelection, activateFilepathBrowserItem,
} from '/data/UserData/schwung/shared/filepath_browser.mjs';
import {
    smfParse, planImport, maxBarsFor, partBars, barTicksOf, SMF_MAX_BYTES, SMF_EXTENSIONS,
} from './ui_midifile.mjs';

export const MI_ROOT = '/data/UserData';
/* Install internals under the root, never a place a user keeps MIDI files. */
const HIDDEN_TOP = new Set(['schwung', 'dbx-host', 'settings', 'boot-targets']);
export const GRID_LABELS = ['1/32', '1/16', '1/8', '1/4', '1/2', '1'];
/* Detents per step: bars move a notch every 6, the two lists every 12 — the
 * same PICK / DELIBERATE rates the editor's cells use (ui_discover.mjs). */
const KNOB_SENS = [6, 6, 12, 12];

let MI = null;

export function miActive() { return !!MI; }
export function miStateForTest() { return MI; }

/* ---- the file browser ---- */

function fsAdapter(sizes) {
    return {
        readdir(path) {
            const out = os.readdir(path) || [];
            const names = Array.isArray(out[0]) ? out[0] : (Array.isArray(out) ? out : []);
            return path === MI_ROOT ? names.filter(n => !HIDDEN_TOP.has(n)) : names;
        },
        stat(path) {
            const st = os.stat(path);
            if (st && st[0] && !st[1]) sizes[path] = st[0].size || 0;
            return st;
        },
    };
}

function refreshFiles() {
    MI.sizes = {};
    refreshFilepathBrowser(MI.browser, fsAdapter(MI.sizes));
}

function fmtSize(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return '1K';
    return Math.round(n / 1024) + 'K';
}

/* ---- opening and closing ---- */

/* Tick context (runAction). Stops the transport first — before any other
 * write — and says so, so a stop the user did not ask for is never a mystery. */
export function miOpen(track) {
    MI = {
        track, stage: 'files',
        browser: buildFilepathBrowserState({ root: MI_ROOT, filter: SMF_EXTENSIONS, name: 'Import MIDI' }, ''),
        sizes: {}, file: null, result: null, part: 0,
        startBar: 1, bars: 1, grid: 1, toIdx: 0, choices: [], plan: null,
        knobAcc: [0, 0, 0, 0], readTicks: 0,
        preview: null, commit: null, stopTries: 0,
    };
    refreshFiles();
    stopTransport();
}

/* The ONE place playback is stopped: on opening, and again if Play is pressed
 * while the screen is up. With the transport following Move a stop only asks,
 * so this gives up after three rather than looping. */
function stopTransport() {
    if (!GS.playing || MI.stopTries >= 3) return;
    if (GS.pendingDefaultSetParams.some(e => e.key === 'transport')) return;
    previewStop();
    GS.pendingDefaultSetParams.push({ key: 'transport', val: 'stop' });
    if (!MI.stopTries) showActionPopup('STOPPED', 'FOR IMPORT');
    MI.stopTries++;
}

/* Every way out ends here: sounding preview notes are released first. */
export function miClose() {
    if (!MI) return;
    previewStop();
    MI = null;
}

/* ---- the parts and the window ---- */

function isDrumTrack(t) { return GS.trackPadMode[t] === PAD_MODE_DRUM; }
function clipEmpty(t, c) { return isDrumTrack(t) ? !GS.drumClipNonEmpty[t][c] : !GS.clipNonEmpty[t][c]; }

/* Empty clips, plus the track's current clip whether or not it is empty (that
 * one is a REPLACE). Default: the current clip if it is empty, else the first
 * empty clip after it, else the current clip. */
function destinationChoices(t) {
    const cur = GS.trackActiveClip[t] | 0;
    const list = [];
    for (let c = 0; c < NUM_CLIPS; c++) if (c === cur || clipEmpty(t, c)) list.push(c);
    let def = cur;
    if (!clipEmpty(t, cur)) {
        for (let k = 1; k < NUM_CLIPS; k++) {
            const c = (cur + k) % NUM_CLIPS;
            if (clipEmpty(t, c)) { def = c; break; }
        }
    }
    return { list, def: Math.max(0, list.indexOf(def)) };
}

function curPart() { return MI && MI.result ? MI.result.parts[MI.part] : null; }
function destClip() { return MI.choices[MI.toIdx]; }
function replacing() { return !clipEmpty(MI.track, destClip()); }
/* The pitch each pad plays IN THE DESTINATION CLIP — lane pitches are per
 * clip, and the engine matches against the destination's. Read in the tick
 * (MI.lanes); until then, the active clip's, which is the right answer when
 * the destination IS the active clip. */
function laneNotes() {
    if (!isDrumTrack(MI.track)) return null;
    const c = MI.stage === 'opts' || MI.stage === 'confirm' ? destClip() : GS.trackActiveClip[MI.track];
    if (MI.lanes && MI.lanes.clip === c) return MI.lanes.notes;
    return GS.drumLaneNote[MI.track].slice(0, 32);
}
function planCut() { return MI.plan ? MI.plan.cut + MI.plan.before : 0; }

/* A part's grid: the finest that holds the whole part, 1/16 at the finest. */
function defaultGrid(part, ts) {
    const need = partBars(part, ts);
    for (let g = 1; g < TPS_VALUES.length; g++) if (maxBarsFor(TPS_VALUES[g], ts) >= need) return g;
    return TPS_VALUES.length - 1;
}

function replan() {
    const part = curPart();
    if (!part) { MI.plan = null; return; }
    const ts = MI.result.timeSig;
    const maxB = maxBarsFor(TPS_VALUES[MI.grid], ts);
    const total = partBars(part, ts);
    MI.startBar = Math.max(1, Math.min(total, MI.startBar));
    MI.bars = Math.max(1, Math.min(maxB, MI.bars));
    MI.plan = planImport(part, { startBar: MI.startBar, bars: MI.bars, tps: TPS_VALUES[MI.grid],
                                 timeSig: ts, laneNotes: laneNotes() });
}

function enterOptions() {
    const part = curPart();
    const ts = MI.result.timeSig;
    MI.grid = defaultGrid(part, ts);
    MI.startBar = 1;
    MI.bars = Math.min(maxBarsFor(TPS_VALUES[MI.grid], ts), partBars(part, ts));
    const d = destinationChoices(MI.track);
    MI.choices = d.list; MI.toIdx = d.def;
    MI.stage = 'opts';
    replan();
}

/* ---- reading the file (tick) ---- */

function readFile(path) {
    const st = os.stat(path);
    if (!st || st[1] || !st[0]) return { error: 'CAN\'T READ FILE' };
    const size = st[0].size | 0;
    if (size > SMF_MAX_BYTES) return { error: 'FILE TOO BIG' };
    const f = std.open(path, 'rb');
    if (!f) return { error: 'CAN\'T READ FILE' };
    const buf = new ArrayBuffer(size);
    let got = 0;
    try { got = f.read(buf, 0, size); } finally { f.close(); }
    return smfParse(new Uint8Array(buf, 0, Math.max(0, got | 0)));
}

/* ---- input ---- */

/* K1-K4. K5-K8 do nothing here — and are claimed by the caller, so they
 * never fall through to the track's levels. */
export function miOnKnob(k, delta) {
    if (!MI || MI.stage !== 'opts' || k > 3 || !delta) return;
    MI.knobAcc[k] += delta;
    const sens = KNOB_SENS[k];
    let steps = 0;
    while (MI.knobAcc[k] >= sens) { MI.knobAcc[k] -= sens; steps++; }
    while (MI.knobAcc[k] <= -sens) { MI.knobAcc[k] += sens; steps--; }
    if (!steps) return;
    const ts = MI.result.timeSig;
    if (k === 0) MI.startBar += steps;
    else if (k === 1) MI.bars += steps;
    else if (k === 2) MI.grid = Math.max(0, Math.min(TPS_VALUES.length - 1, MI.grid + steps));
    else MI.toIdx = Math.max(0, Math.min(MI.choices.length - 1, MI.toIdx + steps));
    if (k === 2) MI.bars = Math.min(MI.bars, maxBarsFor(TPS_VALUES[MI.grid], ts));
    replan();
    if (MI.preview && k !== 3) previewStart();
}

export function miOnJog(delta) {
    if (!MI || !delta) return;
    if (MI.stage === 'files') moveFilepathBrowserSelection(MI.browser, delta > 0 ? 1 : -1);
    else if (MI.stage === 'tracks') {
        const n = MI.result.parts.length;
        const was = MI.part;
        MI.part = Math.max(0, Math.min(n - 1, MI.part + (delta > 0 ? 1 : -1)));
        if (MI.part !== was && MI.preview) previewStart();
    } else if (MI.stage === 'opts') {
        MI.knobAcc[0] = 0;
        MI.startBar += delta > 0 ? 1 : -1;
        replan();
        if (MI.preview) previewStart();
    }
}

/* Returns 'close' when the screen should give way to the sound menu. */
export function miOnClick(shift) {
    if (!MI) return 'close';
    if (shift && (MI.stage === 'tracks' || MI.stage === 'opts')) {
        if (MI.preview) previewStop(); else previewStart();
        return null;
    }
    if (MI.stage === 'files') {
        const r = activateFilepathBrowserItem(MI.browser);
        if (r.action === 'open') refreshFiles();
        else if (r.action === 'select') {
            MI.file = { path: r.value, name: String(r.filename || '').replace(/\.[^.]+$/, '') };
            MI.stage = 'reading'; MI.readTicks = 0;
        }
    } else if (MI.stage === 'tracks') {
        previewStop();
        enterOptions();
    } else if (MI.stage === 'opts') {
        if (!MI.plan || !MI.plan.notes.length) return null;
        previewStop();
        if (replacing() || planCut() > 0) MI.stage = 'confirm';
        else MI.commit = { phase: 'send' };
    } else if (MI.stage === 'confirm') {
        MI.commit = { phase: 'send' };
    }
    return null;
}

export function miOnBack() {
    if (!MI) return 'close';
    previewStop();
    if (MI.stage === 'files' || MI.stage === 'reading') {
        const b = MI.browser;
        if (MI.stage === 'files' && b.currentDir !== b.root) {
            b.currentDir = b.currentDir.replace(/\/[^/]*$/, '') || b.root;
            b.selectedIndex = 0;
            refreshFiles();
            return null;
        }
        if (MI.stage === 'reading') { MI.stage = 'files'; return null; }
        miClose();
        return 'close';
    }
    if (MI.stage === 'tracks') MI.stage = 'files';
    else if (MI.stage === 'opts') MI.stage = MI.result.parts.length > 1 ? 'tracks' : 'files';
    else if (MI.stage === 'confirm') MI.stage = 'opts';
    return null;
}

/* ---- the preview ---- */

function previewStart() {
    previewStop();
    const part = curPart();
    if (!part || GS.recordArmed) return;
    let notes, span;
    if (MI.stage === 'opts' && MI.plan) {
        notes = MI.plan.notes.map(n => ({ t: n.t, g: n.g, p: n.p, v: n.v }));
        span = MI.plan.bars * MI.plan.barTicks;
    } else {
        notes = part.notes;
        span = partBars(part, MI.result.timeSig) * barTicksOf(MI.result.timeSig);
    }
    if (!notes.length) return;
    MI.preview = { t0: nowMs(), span, notes, idx: 0, lastTick: -1, sounding: new Map() };
}

function previewStop() {
    if (!MI || !MI.preview) return;
    if (MI.preview.sounding.size) queueAudition(MI.track, 'alloff');
    MI.preview = null;
}

/* One queue entry per track per tick: a second write in the same tick is
 * folded into the entry already waiting, never a second set_param. */
function queueAudition(t, tokens) {
    const key = 't' + t + '_audition';
    const q = GS.pendingDefaultSetParams;
    const last = q.length ? q[q.length - 1] : null;
    if (last && last.key === key) last.val += ' ' + tokens;
    else q.push({ key, val: tokens });
}

function previewTick() {
    const pv = MI.preview;
    const bpm = GS.bpmMirror > 0 ? GS.bpmMirror : 120;
    const abs = (nowMs() - pv.t0) * bpm * 96 / 60000;
    const now = abs % pv.span;
    const toks = [];
    /* a wrap: release everything and start the pass again */
    if (pv.lastTick >= 0 && now < pv.lastTick) {
        for (const p of pv.sounding.keys()) toks.push('off ' + p);
        pv.sounding.clear();
        pv.idx = 0;
    }
    for (const [p, end] of pv.sounding) if (now >= end) { toks.push('off ' + p); pv.sounding.delete(p); }
    while (pv.idx < pv.notes.length && pv.notes[pv.idx].t <= now) {
        const n = pv.notes[pv.idx++];
        if (n.t + n.g <= now) continue;          /* already over: a late tick skips it */
        if (pv.sounding.has(n.p)) toks.push('off ' + n.p);
        toks.push('on ' + n.p + ' ' + n.v);
        pv.sounding.set(n.p, n.t + n.g);
    }
    pv.lastTick = now;
    pv.playhead = now;
    if (toks.length) {
        const viaClip = isDrumTrack(MI.track) && MI.stage === 'opts' ? 'clip ' + destClip() + ' ' : '';
        queueAudition(MI.track, viaClip + toks.join(' '));
    }
}

/* ---- the write ---- */

function importPayload() {
    const flags = replacing() ? 1 : 0;
    const head = flags + ' ' + MI.grid + ' ' + MI.plan.lengthSteps + '|';
    return head + MI.plan.notes.map(n => 'a ' + n.t + ' ' + n.p + ' ' + n.v + ' ' + n.g).join(';');
}

function commitTick() {
    const cm = MI.commit, t = MI.track, c = destClip();
    const drum = isDrumTrack(t);
    if (cm.phase === 'send') {
        cm.key = 't' + t + '_c' + c + '_import';
        cm.val = importPayload();
        GS.pendingDefaultSetParams.push({ key: cm.key, val: cm.val });
        cm.phase = 'wait'; cm.wait = 0;
        /* The engine takes its undo snapshot inside the import, so Undo must
         * reach it — and not a stale JS-side unit first. Claimed now, so a screen
         * closed while the write settles still leaves Undo pointed at it. */
        noteUndoUnit();
        if (drum) GS.drumLaneLengthManuallySet[t] = true;
        else GS.clipLengthManuallySet[t][c] = true;
        return null;
    }
    if (cm.phase === 'wait') {
        /* Settle: the queue must have sent it; then look every few ticks for up
         * to ~half a second. Never re-sent — a second send would be a second
         * undo snapshot, and Undo would land on the first import. */
        if (GS.pendingDefaultSetParams.some(e => e.key === cm.key)) return null;
        cm.wait++;
        if (cm.wait < 2 || (cm.wait % 5) !== 2) return null;
        syncClipsTargeted((drum ? 'd ' : 'm ') + t + ' ' + c);
        const landed = drum ? !!GS.drumClipNonEmpty[t][c] : !!GS.clipNonEmpty[t][c];
        if (!landed && cm.wait < 45) return null;
        showActionPopup(landed ? 'IMPORTED' : 'IMPORT FAILED',
                        'CLIP ' + SCENE_LETTERS[c] + (landed ? ' \u00b7 ' + MI.plan.notes.length + ' NOTES' : ''));
        miClose();
        return 'close';
    }
    return null;
}

/* ---- tick (soundTick) ----
 * `inView` false while the screen is open = it was left by some other door
 * (a track switch, the menu closing): release and forget. Returns 'close'
 * when the screen should hand back to the sound menu. */
export function miTick(inView, track) {
    if (!MI) return null;
    if (!inView || track !== MI.track) { miClose(); return inView ? 'close' : null; }
    stopTransport();
    if (MI.stage === 'reading') {
        if (MI.readTicks++ < 1) return null;   /* one frame of READING first */
        const res = readFile(MI.file.path);
        if (res.error || !res.parts || !res.parts.length) {
            MI.stage = 'files';
            showActionPopup(res.error || 'NO NOTES', MI.file.name.toUpperCase());
            return null;
        }
        MI.result = res; MI.part = 0;
        /* The file read, but not all of it: say so rather than import quietly. */
        const WARN = { TRUNCATED: 'FILE CUT SHORT', DAMAGED: 'FILE DAMAGED',
                       'NOTES OVER LIMIT': 'SOME NOTES SKIPPED', 'TOO MANY PARTS': 'FIRST 64 PARTS ONLY' };
        const w = (res.warnings || []).find(k => WARN[k]);
        if (w) showActionPopup(WARN[w], MI.file.name.toUpperCase());
        if (res.parts.length === 1) enterOptions();
        else MI.stage = 'tracks';
        return null;
    }
    if (MI.commit) return commitTick();
    if (MI.stage === 'opts' && isDrumTrack(MI.track) && (!MI.lanes || MI.lanes.clip !== destClip())) {
        const c = destClip();
        const raw = host_module_get_param('t' + MI.track + '_c' + c + '_lane_notes');
        const notes = String(raw || '').trim().split(/\s+/).map(Number);
        if (notes.length === 32 && notes.every(n => n >= 0 && n <= 127)) {
            MI.lanes = { clip: c, notes };
            replan();
            if (MI.preview) previewStart();
        }
    }
    if (MI.preview) previewTick();
    return null;
}

export function miAnimating() { return !!(MI && (MI.preview || MI.stage === 'reading' || MI.commit)); }

/* ---- drawing ---- */

function partRoll(part, drumRows) {
    /* Melodic: one row per pitch between the part's lowest and highest.
     * Drum destination: one row per pad the part hits, and a bottom row for
     * notes no pad plays (dotted). */
    if (!drumRows) {
        const lo = part.minPitch, rows = Math.max(1, part.maxPitch - lo + 1);
        return { rows, map: (n) => ({ t: n.t, g: n.g, row: n.p - lo }) };
    }
    const lane = new Map(drumRows.map((p, l) => [p, l]));
    const used = [...new Set(part.notes.filter(n => lane.has(n.p)).map(n => lane.get(n.p)))].sort((a, b) => a - b);
    const noPad = part.notes.some(n => !lane.has(n.p));
    const rowOf = new Map(used.map((l, i) => [l, i + (noPad ? 1 : 0)]));
    const rows = Math.max(1, used.length + (noPad ? 1 : 0));
    return { rows, map: (n) => lane.has(n.p) ? { t: n.t, g: n.g, row: rowOf.get(lane.get(n.p)) }
                                              : { t: n.t, g: n.g, row: 0, dim: true } };
}

function drawRoll(y, h, withWindow) {
    const part = curPart();
    const ts = MI.result.timeSig;
    const bt = barTicksOf(ts);
    const span = partBars(part, ts) * bt;
    const pr = partRoll(part, laneNotes());
    const opts = { rows: pr.rows, barTicks: bt };
    if (withWindow && MI.plan) {
        const from = (MI.startBar - 1) * bt;
        opts.win = { from, to: from + MI.plan.bars * bt };
        if (MI.preview && MI.preview.playhead != null) opts.playhead = from + MI.preview.playhead;
    } else if (MI.preview && MI.preview.playhead != null) opts.playhead = MI.preview.playhead;
    drawKitNoteRoll(2, y, 124, h, part.notes.map(pr.map), Math.max(span, opts.win ? opts.win.to : 0), opts);
}

function optionCells() {
    const ts = MI.result.timeSig;
    const maxB = maxBarsFor(TPS_VALUES[MI.grid], ts);
    const total = partBars(MI.result.parts[MI.part], ts);
    const c = destClip();
    const clipName = 'CLIP ' + SCENE_LETTERS[c];
    return [
        { kind: 'valsq', label: 'Start', name: 'Start Bar', text: String(MI.startBar),
          norm: total > 1 ? (MI.startBar - 1) / (total - 1) : 0 },
        { kind: 'valsq', label: 'Bars', name: 'Length', text: String(MI.bars),
          norm: maxB > 1 ? (MI.bars - 1) / (maxB - 1) : 0 },
        { kind: 'enumsq', label: 'Grid', name: 'Grid', text: GRID_LABELS[MI.grid],
          options: GRID_LABELS, sel: MI.grid },
        { kind: 'enumsq', label: 'To', name: replacing() ? 'Replace ' + clipName : 'Destination',
          text: clipName, options: MI.choices.map(k => 'CLIP ' + SCENE_LETTERS[k]), sel: MI.toIdx },
    ];
}
export function miRingCells() { return (MI && MI.stage === 'opts' && MI.result) ? optionCells() : null; }

function optionFooter() {
    const p = MI.plan;
    const warn = !p ? null
        : !p.notes.length ? ['!', 'NO NOTES HERE']
        : planCut() > 0 ? ['!', planCut() + ' CUT']
        : p.noPad > 0 ? ['!', p.noPad + ' NO PAD']
        : p.overCap > 0 ? ['!', p.overCap + ' OVER LIMIT']
        : replacing() ? ['!', 'REPLACES']
        : null;
    if (MI.preview) return [warn || ['CLK', 'IMPORT'], ['SHFT', 'STOP'], ['BACK', '']];
    return warn ? [warn, ['CLK', 'IMPORT'], ['BACK', '']] : [['SHFT', 'HEAR'], ['CLK', 'IMPORT'], ['BACK', '']];
}

export function miRender(touchedIdx) {
    if (!MI) return;
    clear_screen();
    if (MI.stage === 'files' || MI.stage === 'reading') {
        const b = MI.browser;
        const title = b.currentDir === b.root ? 'IMPORT MIDI'
            : String(b.currentDir.split('/').pop() || '').toUpperCase();
        drawKitHeader(title, false);
        if (MI.stage === 'reading') {
            drawKitList([], -1, { emptyMsg: 'READING...', emptyHdr: true });
            return;
        }
        const rows = b.items.map(it =>
            it.kind === 'up' ? { label: '..' }
            : it.kind === 'dir' ? { label: String(it.label).replace(/^\[|\]$/g, '') + '/' }
            : { label: String(it.label).replace(/\.[^.]+$/, ''), value: fmtSize(MI.sizes[it.path]) });
        drawKitList(rows, b.selectedIndex, { emptyMsg: 'NO MIDI FILES' });
        return;
    }
    if (MI.stage === 'tracks') {
        drawKitHeader(String(MI.file.name).toUpperCase(), false);
        const rows = MI.result.parts.map(p => ({ label: p.name, qual: p.qual || (p.drum ? 'DRUMS' : ''),
                                                 value: String(p.noteCount) }));
        drawKitList(rows, MI.part, { topY: 9, rowH: 10, visible: 3 });
        drawRoll(42, 10, false);
        drawKitHintRow(MV_FOOTER_Y, [[ 'SHFT', MI.preview ? 'STOP' : 'HEAR'], ['CLK', 'NEXT'], ['BACK', '']]);
        return;
    }
    if (MI.stage === 'opts') {
        kitUseLayout('bank');
        drawKitBankPage(optionCells(), {
            headerText: '(' + (MI.track + 1) + ') ' + String(curPart().name).toUpperCase(),
            headerRight: 'IMPORT', touchedIdx: touchedIdx >= 0 && touchedIdx < 4 ? touchedIdx : -1,
        });
        drawRoll(36, 12, true);
        drawKitHintRow(MV_FOOTER_Y, optionFooter());
        return;
    }
    if (MI.stage === 'confirm') {
        const p = MI.plan;
        const c = destClip();
        const lines = [String(curPart().name) + ' > TRACK ' + (MI.track + 1),
                       p.bars + ' BARS  ' + p.notes.length + ' NOTES'];
        if (planCut() > 0) lines.push(planCut() + ' NOTES CUT');
        drawKitPrompt(replacing() ? 'REPLACE CLIP ' + SCENE_LETTERS[c] + '?' : 'IMPORT?', lines,
                      [['CLK', 'YES'], ['BACK', 'NO']]);
    }
}

/* Offered on every track that plays notes: a Conductor emits none. */
export function miOffered(track) { return GS.trackPadMode[track] !== PAD_MODE_CONDUCT; }
