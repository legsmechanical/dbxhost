/* ui_midi_import.mjs — the MIDI browser: a MIDI file into the current clip.
 *
 * Import MIDI and the phrase browser as ONE screen (Josh, 2026-09-29; the
 * approved mockups are tools/mockup_midi_browser.mjs). Opened from K8 of the
 * CLIP / DRUM LANE card (touch + click; the tick calls miOpen) and hosted as a
 * modal: ui.js routes its input, the tick runs miTick, drawUI draws it over
 * everything. Back closes it onto the card (or steps out of a multi-part file).
 *
 *   the page   one playable item — a single-part file, or one part of a
 *              multi-part file. Header: its name, n/N (or what will not land,
 *              or REPLACES). K1 Start · K2 Bars · K3 Grid · K4 Stretch; one
 *              LANE of its notes with the window bracketed; K5 Oct · K6 Semi ·
 *              K7 Scale as small cells (a drum track: K5 Map). Footer JOG FILE ·
 *              CLK LOAD · SHFT MUTE.
 *   the list   turning the jog raises the folder's list (small font) and moves
 *              through it; it drops half a second after the jog stops — unless
 *              the row is a folder or a multi-part file, which have nothing to
 *              hear. `..` goes up; a folder goes in; a multi-part file (`NAME>`)
 *              goes in like a folder, its parts laid out like files.
 *   first open no folder remembered yet: the user data folder as a plain list.
 *              After that it reopens where it was (ui_prefs midiPlace).
 *
 * ⭑ Every playable item is HEARD as you land on it: in time while the track
 * plays its clip (tN_audclip, swapped in on the beat), otherwise alone and
 * free-running (tN_audition). Shift+click mutes (remembered); the lane blinks
 * while muted. Nothing is written until the click.
 * ⭑ A load goes into the CURRENT clip, one undo unit, no confirm (the header
 * says REPLACES first; Undo brings it back). Melodic: the clip is replaced,
 * automation included. Drum: only the lanes a sound goes to are replaced —
 * the rest keep their notes (Josh, 2026-09-29).
 * ⭑ The transport is never stopped.
 *
 * ⭑ A file is parsed when the jog RESTS on it (PARSE_REST_MS), not on every
 * detent, and recent parses are cached — scrolling past ten files reads none.
 * Small files are parsed in the background, one a tick, to fill the list's
 * bar / part counts.
 *
 * Decisions are ui_midi_notes.mjs (pure) and ui_midifile.mjs (the parser);
 * this file reads files, draws, and queues the engine writes on
 * S.pendingDefaultSetParams (one per tick).
 */
import * as os from 'os';
import * as std from 'std';
import { S as GS, noteUndoUnit } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { TPS_VALUES, SCENE_LETTERS, PAD_MODE_DRUM, PAD_MODE_CONDUCT, DRUM_LANES, LED_OFF } from './ui_constants.mjs';
import { White, VividYellow, Cyan, NeonPink, BrightOrange, NeonGreen, ElectricViolet, BrightRed, Lime } from '/data/UserData/schwung/shared/constants.mjs';
import { syncClipsTargeted } from './ui_dsp_bridge.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { automationClearClipQueued } from './ui_automation.mjs';
import { midiPlace, setMidiPlace, midiMuted, setMidiMuted, midiMap, setMidiMap } from './ui_prefs.mjs';
import {
    drawKitHeader, drawKitList, drawKitHintRow, drawKitBankPage, kitUseLayout, enumOverlayWouldDraw,
    mvPrint, mvWidth, MV_FOOTER_Y,
} from './ui_movy.mjs';
import { buildFilepathBrowserState, refreshFilepathBrowser } from '/data/UserData/schwung/shared/filepath_browser.mjs';
import { smfParse, SMF_MAX_BYTES, SMF_EXTENSIONS } from './ui_midifile.mjs';
import {
    STRETCH_STEPS, STRETCH_DEFAULT, OCT_MIN, OCT_MAX, SEMI_MIN, SEMI_MAX, MN_MAX_SOUNDS, MAP_MODES,
    mapPitch, planNotes, maxBarsAt, gridFor, partBarsOf, barTicks, drumVoices, defaultAssign, drumLaneNotes,
    melodicImportVal, melodicAudclipVal, lanesAudclipVal, lanesImportVal, voiceName,
} from './ui_midi_notes.mjs';

export const MI_ROOT = '/data/UserData';
/* Install internals under the root, never a place a user keeps MIDI files. */
const HIDDEN_TOP = new Set(['schwung', 'dbx-host', 'settings', 'boot-targets']);
export const GRID_LABELS = ['1/32', '1/16', '1/8', '1/4', '1/2', '1'];

const LIST_LINGER_MS = 500;      /* the list drops this long after the jog stops */
const PARSE_REST_MS = 120;       /* the jog rests this long on a file before it is read */
const CACHE_MAX = 8;             /* parsed files kept */
const BG_PARSE_MAX = 64 * 1024;  /* larger files are read only when landed on */
/* Detents per step, by knob: Start, Bars, Grid, Stretch, Oct/Map, Semi, Scale. */
const KNOB_SENS = [6, 6, 12, 12, 12, 6, 12];

let MI = null;
let loadSync = null;             /* after a load: verify it landed (the screen has closed) */
const CACHE = new Map();         /* path → { res } | { error } — insertion order is the LRU */

export function miActive() { return !!MI; }
export function miStateForTest() { return MI; }
export function miResetForTest() { MI = null; loadSync = null; CACHE.clear(); }
/* Offered on every track that plays notes: a Conductor emits none. */
export function miOffered(track) { return GS.trackPadMode[track] !== PAD_MODE_CONDUCT; }

/* ---- files ---- */

function statOf(path) {
    try { const st = os.stat(path); return (st && st[0] && !st[1]) ? st[0] : null; } catch (e) { return null; }
}
function isDirPath(path) {
    const st = statOf(path);
    return !!(st && typeof st.mode === 'number' && (st.mode & 0o170000) === 0o040000);
}
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
function readFile(path) {
    const st = statOf(path);
    if (!st) return { error: 'CAN\'T READ FILE' };
    const size = st.size | 0;
    if (size > SMF_MAX_BYTES) return { error: 'FILE TOO BIG' };
    const f = std.open(path, 'rb');
    if (!f) return { error: 'CAN\'T READ FILE' };
    const buf = new ArrayBuffer(size);
    let got = 0;
    try { got = f.read(buf, 0, size); } finally { f.close(); }
    const res = smfParse(new Uint8Array(buf, 0, Math.max(0, got | 0)));
    if (!res.error && (!res.parts || !res.parts.length)) return { error: 'NO NOTES' };
    return res;
}
/* A file's parse, cached. */
function parsed(path) {
    if (CACHE.has(path)) { const e = CACHE.get(path); CACHE.delete(path); CACHE.set(path, e); return e; }
    const r = readFile(path);
    const e = r.error ? { error: r.error } : { res: r };
    CACHE.set(path, e);
    while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    return e;
}
const baseName = (p) => String(p || '').split('/').pop();
const noExt = (n) => String(n).replace(/\.[^.]+$/, '');

/* ---- opening and closing ---- */

function isDrumTrack(t) { return GS.trackPadMode[t] === PAD_MODE_DRUM; }

/* Tick context (opening lists a folder). */
export function miOpen(track) {
    if (!miOffered(track)) return false;
    if (GS.recordArmed || GS.stepRecActive) { showActionPopup('IMPORT MIDI', 'NOT WHILE RECORDING'); return false; }
    MI = {
        track, drum: isDrumTrack(track), root: false,
        B: buildFilepathBrowserState({ root: MI_ROOT, filter: SMF_EXTENSIONS, name: 'Import MIDI' }, ''),
        sizes: {}, file: null, items: [], idx: 0,
        list: { up: false, touched: false, letGo: 0 },
        pending: null, cur: null, plan: null,
        startBar: 1, bars: 1, grid: 1, stretch: STRETCH_DEFAULT, oct: 0, semi: 0, scaleOn: true,
        map: midiMap(), knobAcc: [0, 0, 0, 0, 0, 0, 0],
        voices: [], extraSounds: 0, assign: [], held: -1, lanes: new Map(),
        hear: !midiMuted(), pmode: null, staged: null, free: null, keySig: '', mask: null,
    };
    const place = midiPlace();
    if (place.dir && place.dir.startsWith(MI_ROOT) && (place.dir === MI_ROOT || isDirPath(place.dir))) {
        enterDir(place.dir, place.file);
    } else {
        if (place.dir) showActionPopup('FOLDER GONE', noExt(baseName(place.dir)).toUpperCase());
        MI.root = true;
        enterDir(MI_ROOT, '');
    }
    computePadNoteMap();          /* a drum track: the engine stops reading the right-hand pads */
    return true;
}

/* Leave without writing: the preview ends and the track plays what it had. */
export function miClose() {
    if (!MI) return;
    remember();
    stopPreview();
    MI = null;
    computePadNoteMap();
    GS.screenDirty = true;
}

function remember() {
    if (MI.root) return;
    const it = MI.items[MI.idx];
    const file = MI.file ? MI.file.path : (it && it.kind === 'file' ? it.path : '');
    setMidiPlace(MI.B.currentDir, file);
}

/* ---- the list ---- */

function metaOf(path) {
    const e = CACHE.get(path);
    if (!e || e.error) return null;
    const r = e.res;
    return { parts: r.parts.length, bars: partBarsOf(r.parts[0], r.timeSig), drum: !!r.parts[0].drum };
}
function buildItems() {
    if (MI.file) {
        const r = MI.file.res;
        MI.items = [{ kind: 'up', label: '..' }].concat(r.parts.map((p, i) =>
            ({ kind: 'part', label: p.name + (p.qual ? ' ' + p.qual : ''), part: i,
               drum: !!p.drum, bars: partBarsOf(p, r.timeSig) })));
        return;
    }
    MI.sizes = {};
    refreshFilepathBrowser(MI.B, fsAdapter(MI.sizes));
    MI.items = (MI.B.items || []).map(it =>
        it.kind === 'up' ? { kind: 'up', label: '..', path: it.path }
        : it.kind === 'dir' ? { kind: 'dir', label: String(it.label).replace(/^\[|\]$/g, ''), path: it.path }
        : { kind: 'file', label: noExt(it.label), path: it.path });
}
function enterDir(dir, selectPath) {
    MI.file = null;
    MI.B.currentDir = dir;
    buildItems();
    const want = selectPath ? MI.items.findIndex(it => it.path === selectPath) : -1;
    MI.idx = want >= 0 ? want : Math.min(MI.items.length - 1, MI.items.length && MI.items[0].kind === 'up' ? 1 : 0);
    MI.idx = Math.max(0, MI.idx);
    MI.list.up = true; MI.list.letGo = nowMs();
    land();
}
function enterFile(path, res) {
    MI.file = { path, name: noExt(baseName(path)), res };
    buildItems();
    MI.idx = 1;
    MI.list.up = true; MI.list.letGo = nowMs();
    land();
}
function goUp() {
    if (MI.file) {
        const from = MI.file.path;
        enterDir(MI.B.currentDir, from);
        return;
    }
    const dir = MI.B.currentDir;
    if (dir === MI_ROOT) return;
    const parent = dir.replace(/\/[^/]*$/, '') || MI_ROOT;
    enterDir(parent.startsWith(MI_ROOT) ? parent : MI_ROOT, dir);
}

/* The row the jog is on: a playable item becomes the page. */
function land() {
    MI.cur = null; MI.plan = null; MI.pending = null; MI.held = -1; MI.mask = null;
    const it = MI.items[MI.idx];
    if (!it) return;
    if (it.kind === 'part') { setCur(MI.file.res, it.part, MI.file.path + '#' + it.part, it.label); return; }
    if (it.kind !== 'file') return;
    if (CACHE.has(it.path)) { fromParse(it, true); return; }
    MI.pending = { path: it.path, at: nowMs() };
}
/* A landed file's parse: a single part is the page; a multi-part file waits
 * for a click. `announce` says what the file could not give. */
function fromParse(it, announce) {
    const e = parsed(it.path);
    if (e.error) { if (announce) showActionPopup(e.error, it.label.toUpperCase()); return; }
    if (announce) {
        const WARN = { TRUNCATED: 'FILE CUT SHORT', DAMAGED: 'FILE DAMAGED',
                       'NOTES OVER LIMIT': 'SOME NOTES SKIPPED', 'TOO MANY PARTS': 'FIRST 64 PARTS ONLY' };
        const w = (e.res.warnings || []).find(k => WARN[k]);
        if (w) showActionPopup(WARN[w], it.label.toUpperCase());
    }
    if (e.res.parts.length === 1) setCur(e.res, 0, it.path, it.label);
}
function playable() { return !!MI.cur; }

/* ---- the page ---- */

const stretchF = () => STRETCH_STEPS[MI.stretch].f;

function setCur(res, partIdx, key, name) {
    const part = res.parts[partIdx];
    const ts = res.timeSig;
    MI.cur = { key, name, part, ts };
    MI.startBar = 1;
    MI.grid = gridFor(part, ts, stretchF());
    MI.bars = Math.min(maxBarsAt(TPS_VALUES[MI.grid], ts, stretchF()), partBarsOf(part, ts));
    if (MI.drum) {
        const all = drumVoices(part.notes);
        MI.voices = all.slice(0, MN_MAX_SOUNDS);
        MI.extraSounds = all.length - MI.voices.length;
        reassign();
    } else { MI.voices = []; MI.extraSounds = 0; MI.assign = []; }
    replan();
}
function reassign() {
    MI.assign = defaultAssign(MI.voices, GS.drumLaneNote[MI.track], MI.map, GS.activeDrumLane[MI.track] | 0);
}
function replan() {
    const c = MI.cur;
    if (!c) { MI.plan = null; return; }
    const f = stretchF();
    MI.bars = Math.max(1, Math.min(maxBarsAt(TPS_VALUES[MI.grid], c.ts, f), MI.bars));
    MI.startBar = Math.max(1, Math.min(partBarsOf(c.part, c.ts), MI.startBar));
    MI.keySig = (GS.padKey | 0) + '/' + (GS.padScale | 0);
    const o = { startBar: MI.startBar, bars: MI.bars, tps: TPS_VALUES[MI.grid], timeSig: c.ts, f };
    if (!MI.drum) {
        const po = { oct: MI.oct, semi: MI.semi, scaleOn: MI.scaleOn, key: GS.padKey | 0, scale: GS.padScale | 0 };
        o.pitch = (p) => mapPitch(p, po);
    }
    MI.plan = planNotes(c.part, o);
    MI.lanes = MI.drum ? drumLaneNotes(MI.plan.notes, MI.voices, MI.assign) : new Map();
    MI.mask = null;
    GS.screenDirty = true;
}
function destClip() { return GS.trackActiveClip[MI.track] | 0; }
function replacing() {
    const t = MI.track;
    if (MI.drum) return [...MI.lanes.keys()].some(l => GS.drumLaneHasNotes[t][l]);
    return !!GS.clipNonEmpty[t][destClip()];
}
function unplaced() { return MI.extraSounds + MI.assign.filter(a => a < 0).length; }

/* What will not land, or REPLACES — the header's right side (the footer is for
 * gestures). */
function warning() {
    const p = MI.plan;
    if (!p) return null;
    if (!p.notes.length) return 'NO NOTES';
    if (p.before + p.cut > 0) return (p.before + p.cut) + ' CUT';
    if (p.overCap > 0) return p.overCap + ' OVER';
    if (MI.drum && unplaced() > 0) return unplaced() + ' OFF';
    if (replacing()) return 'REPLACES';
    return null;
}
function position() {
    const up = MI.items.length && MI.items[0].kind === 'up' ? 1 : 0;
    return (MI.idx - up + 1) + '/' + (MI.items.length - up);
}

/* ---- the preview ---- */

function queue(key, val) {
    const q = GS.pendingDefaultSetParams;
    const e = q.find(x => x.key === key);
    if (e) e.val = val; else q.push({ key, val });
}
function queueAudition(tokens) {
    const key = 't' + MI.track + '_audition';
    const q = GS.pendingDefaultSetParams;
    const last = q.length ? q[q.length - 1] : null;
    if (last && last.key === key) last.val += ' ' + tokens;
    else q.push({ key, val: tokens });
}
/* While a sound pad is held only that sound is heard. */
function heardLanes() {
    if (!MI.drum || MI.held < 0) return MI.lanes;
    return drumLaneNotes(MI.plan.notes, MI.voices, MI.assign.map((a, i) => i === MI.held ? a : -1));
}
function wantMode() {
    if (!MI.hear || !MI.cur || !MI.plan || !MI.plan.notes.length) return null;
    if (MI.drum && !heardLanes().size) return null;
    return (GS.playing && GS.trackClipPlaying[MI.track]) ? 'clip' : 'free';
}
function stopPreview() {
    if (MI.pmode === 'clip') queue('t' + MI.track + '_audclip', 'off');
    if (MI.pmode === 'free' && MI.free && MI.free.sounding.size) queueAudition('alloff');
    MI.pmode = null; MI.free = null; MI.staged = null;
}
function stageKey(mode) {
    return [mode, MI.cur.key, MI.startBar, MI.bars, MI.grid, MI.stretch, MI.oct, MI.semi, MI.scaleOn,
            MI.map, MI.held, MI.assign.join(','), MI.keySig].join('|');
}
function previewTick() {
    const mode = wantMode();
    if (mode !== MI.pmode) stopPreview();
    if (!mode) return;
    const key = stageKey(mode);
    if (key !== MI.staged) {
        MI.staged = key;
        MI.pmode = mode;
        const t = MI.track, p = MI.plan;
        if (mode === 'clip') {
            queue('t' + t + '_audclip', MI.drum ? lanesAudclipVal(MI.grid, p.lengthSteps, heardLanes())
                                                : melodicAudclipVal(MI.grid, p.lengthSteps, p.notes));
        } else {
            if (MI.free && MI.free.sounding.size) queueAudition('alloff');
            let notes;
            if (MI.drum) {
                notes = [];
                for (const [l, ns] of heardLanes())
                    for (const n of ns) notes.push({ t: n.t, g: n.g, v: n.v, p: GS.drumLaneNote[t][l] | 0 });
                notes.sort((a, b) => a.t - b.t);
            } else notes = p.notes;
            MI.free = { t0: nowMs(), span: p.span, notes, idx: 0, lastTick: -1, sounding: new Map() };
        }
    }
    if (MI.pmode === 'free') freeTick();
}
/* The free-running preview: the part alone, looped at the project tempo. */
function freeTick() {
    const pv = MI.free;
    if (!pv || !pv.notes.length) return;
    const bpm = GS.bpmMirror > 0 ? GS.bpmMirror : 120;
    const now = ((nowMs() - pv.t0) * bpm * 96 / 60000) % pv.span;
    const toks = [];
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
    if (toks.length) queueAudition((MI.drum ? 'clip ' + destClip() + ' ' : '') + toks.join(' '));
}

/* ---- the load ---- */

function commit() {
    const t = MI.track, c = destClip(), p = MI.plan;
    if (!MI.cur || !p || !p.notes.length) return;
    if (MI.drum && !MI.lanes.size) { showActionPopup('NO SOUND', 'ON A LANE'); return; }
    const repl = replacing();
    /* The free preview's notes end first; the engine ends an in-time preview
     * itself, before it takes its undo snapshot. */
    if (MI.pmode === 'free' && MI.free && MI.free.sounding.size) queueAudition('alloff');
    MI.pmode = null; MI.free = null; MI.staged = null;
    let key, val, count, where;
    if (MI.drum) {
        key = 't' + t + '_lanes_import';
        val = lanesImportVal(MI.grid, p.lengthSteps, MI.lanes, repl);
        count = [...MI.lanes.values()].reduce((a, ns) => a + ns.length, 0);
        where = MI.lanes.size + (MI.lanes.size === 1 ? ' LANE' : ' LANES');
        GS.pendingDefaultSetParams.push({ key, val });
        GS.drumLaneLengthManuallySet[t] = true;
    } else {
        key = 't' + t + '_c' + c + '_import';
        val = melodicImportVal(MI.grid, p.lengthSteps, p.notes, repl);
        count = p.notes.length;
        where = 'CLIP ' + SCENE_LETTERS[c];
        GS.pendingDefaultSetParams.push({ key, val });
        /* The clip's automation goes with a melodic load (Josh, 2026-09-23):
         * what plays is exactly the file. Queued behind the load, inside its
         * undo unit. A drum load keeps it — it replaces only some lanes. */
        if (!automationClearClipQueued(GS.pendingDefaultSetParams, t, c))
            GS.pendingDefaultSetParams.push({ key: 't' + t + '_pa_clear', val: String(c) });
        GS.clipLengthManuallySet[t][c] = true;
    }
    /* The engine takes its undo snapshot inside the load, so Undo must reach
     * it — and not a stale JS-side unit first. */
    noteUndoUnit();
    loadSync = { key, t, c, drum: MI.drum, wait: 0 };
    showActionPopup('LOADED', MI.cur.name.toUpperCase(), where + ' · ' + count + ' NOTES');
    miClose();
}

/* After a load: once the write has gone, look every few ticks for ~half a
 * second that it landed. Never re-sent — a second send would be a second undo
 * snapshot, and Undo would land on the first load. */
function loadSyncTick() {
    const ls = loadSync;
    if (GS.pendingDefaultSetParams.some(e => e.key === ls.key)) return;
    ls.wait++;
    if (ls.wait < 2 || (ls.wait % 5) !== 2) return;
    syncClipsTargeted((ls.drum ? 'd ' : 'm ') + ls.t + ' ' + ls.c);
    const landed = ls.drum ? !!GS.drumClipNonEmpty[ls.t][ls.c] : !!GS.clipNonEmpty[ls.t][ls.c];
    if (landed) { loadSync = null; return; }
    if (ls.wait >= 45) { showActionPopup('LOAD FAILED', 'CLIP ' + SCENE_LETTERS[ls.c]); loadSync = null; }
}

/* ---- input ---- */

/* Which setting a knob turns: the page's eight, by track kind. */
function knobKind(k) {
    const common = ['start', 'bars', 'grid', 'stretch'];
    if (k < 4) return common[k];
    if (MI.drum) return k === 4 ? 'map' : null;
    return ['oct', 'semi', 'scale'][k - 4] || null;
}

export function miOnKnob(k, delta) {
    if (!MI || MI.root || !MI.cur || !delta) return;
    const kind = knobKind(k);
    if (!kind) return;
    MI.knobAcc[k] += delta;
    const sens = KNOB_SENS[k];
    let steps = 0;
    while (MI.knobAcc[k] >= sens) { MI.knobAcc[k] -= sens; steps++; }
    while (MI.knobAcc[k] <= -sens) { MI.knobAcc[k] += sens; steps--; }
    if (!steps) return;
    const c = MI.cur;
    if (kind === 'start') MI.startBar += steps;
    else if (kind === 'bars') MI.bars += steps;
    else if (kind === 'grid') MI.grid = Math.max(0, Math.min(TPS_VALUES.length - 1, MI.grid + steps));
    else if (kind === 'stretch') {
        const was = MI.stretch;
        MI.stretch = Math.max(0, Math.min(STRETCH_STEPS.length - 1, MI.stretch + steps));
        if (MI.stretch !== was) MI.grid = gridFor(c.part, c.ts, stretchF());
    }
    else if (kind === 'oct') MI.oct = Math.max(OCT_MIN, Math.min(OCT_MAX, MI.oct + steps));
    else if (kind === 'semi') MI.semi = Math.max(SEMI_MIN, Math.min(SEMI_MAX, MI.semi + steps));
    else if (kind === 'scale') MI.scaleOn = steps > 0;
    else if (kind === 'map') {
        const i = Math.max(0, Math.min(MAP_MODES.length - 1, MAP_MODES.indexOf(MI.map) + steps));
        if (MAP_MODES[i] !== MI.map) { MI.map = MAP_MODES[i]; setMidiMap(MI.map); reassign(); }
    }
    replan();
}

/* The jog's touch: the list stays while it is held. */
export function miJogTouch(on) {
    if (!MI) return;
    MI.list.touched = !!on;
    if (!on) MI.list.letGo = nowMs();
}

export function miOnJog(delta) {
    if (!MI || !delta || !MI.items.length) return;
    if (!MI.root) {
        MI.list.up = true;
        if (!MI.list.touched) MI.list.letGo = nowMs();      /* no touch seen: time from the turn */
    }
    const was = MI.idx;
    MI.idx = Math.max(0, Math.min(MI.items.length - 1, MI.idx + (delta > 0 ? 1 : -1)));
    if (MI.idx !== was) land();
    GS.screenDirty = true;
}

export function miOnClick(shift) {
    if (!MI) return;
    if (shift) {
        if (MI.root) return;
        MI.hear = !MI.hear;
        setMidiMuted(!MI.hear);
        GS.screenDirty = true;
        return;
    }
    const it = MI.items[MI.idx];
    if (!it) return;
    if (it.kind === 'up') { goUp(); return; }
    if (it.kind === 'dir') { MI.root = false; enterDir(it.path, ''); return; }
    if (it.kind === 'file') {
        if (!MI.cur || MI.cur.key !== it.path) {
            MI.pending = null;
            const e = parsed(it.path);
            if (e.error) { showActionPopup(e.error, it.label.toUpperCase()); return; }
            if (e.res.parts.length > 1) { MI.root = false; enterFile(it.path, e.res); return; }
            fromParse(it, true);
            /* the first-open list: a click OPENS the file as the page */
            if (MI.root) { MI.root = false; MI.list.up = false; GS.screenDirty = true; return; }
        }
        if (MI.root) { MI.root = false; MI.list.up = false; GS.screenDirty = true; return; }
        commit();
        return;
    }
    if (it.kind === 'part') commit();
}

export function miOnBack() {
    if (!MI) return;
    if (MI.file) { goUp(); return; }
    miClose();
}

/* ---- pads (a drum track): the right-hand pads are the file's sounds ---- */

const SOUND_COLORS = [VividYellow, Cyan, NeonPink, BrightOrange, NeonGreen, ElectricViolet, BrightRed, Lime];
/* A right-hand pad as a sound index, or -1: the bottom row first (4-7, 12-15). */
function soundOfPad(i) {
    const col = i % 8, row = Math.floor(i / 8);
    if (col < 4) return -1;
    const s = row * 4 + (col - 4);
    return s < MI.voices.length ? s : -1;
}
function laneOfPad(i) {
    const col = i % 8, row = Math.floor(i / 8);
    if (col >= 4) return -1;
    const lane = (GS.drumLanePage[MI.track] | 0) * 16 + row * 4 + col;
    return lane < DRUM_LANES ? lane : -1;
}
/* A pad pressed (0-31, bottom-left first). Hold a sound pad and tap a lane to
 * put it there, or again to take it off. A lane tap alone just plays the lane
 * (the engine does that; this only decides placement). */
export function miPadTap(i) {
    if (!MI || !MI.drum || !MI.cur || !MI.voices.length) return;
    const snd = soundOfPad(i);
    if (snd >= 0) { MI.held = snd; GS.screenDirty = true; return; }
    const lane = laneOfPad(i);
    if (MI.held < 0 || lane < 0) return;
    MI.assign[MI.held] = (MI.assign[MI.held] === lane && MI.voices.length > 1) ? -1 : lane;
    replan();
}
export function miPadRelease(i) {
    if (!MI || !MI.drum || MI.held < 0) return;
    if (soundOfPad(i) === MI.held) { MI.held = -1; GS.screenDirty = true; }
}
/* The pads the screen owns, as colours; null where the track's own lights
 * stay. A drum track: the right-hand pads (the sounds), and each lane with a
 * sound in its colour; the held sound's pad and lane pulse. */
export function miPadColors() {
    if (!MI || !MI.drum || !MI.cur || !MI.voices.length) return null;
    const out = new Array(32).fill(null);
    const pulse = (nowMs() % 400) < 200;
    const colorOf = (v) => (v === MI.held && pulse) ? White : SOUND_COLORS[v % SOUND_COLORS.length];
    for (let i = 0; i < 32; i++) {
        if (i % 8 >= 4) { const snd = soundOfPad(i); out[i] = snd < 0 ? LED_OFF : colorOf(snd); continue; }
        const lane = laneOfPad(i);
        const here = MI.assign.map((a, v) => a === lane ? v : -1).filter(v => v >= 0);
        if (here.length) out[i] = colorOf(here[Math.floor(nowMs() / 300) % here.length]);
    }
    return out;
}

/* ---- tick ---- */

export function miTick() {
    if (loadSync) loadSyncTick();
    if (!MI) return;
    /* The track, its kind or the view changed under us: leave. */
    if (GS.activeTrack !== MI.track || isDrumTrack(MI.track) !== MI.drum || GS.sessionView || GS.recordArmed) {
        miClose();
        return;
    }
    const now = nowMs();
    if (MI.pending && now - MI.pending.at >= PARSE_REST_MS) {
        const it = MI.items[MI.idx];
        MI.pending = null;
        if (it && it.kind === 'file') fromParse(it, true);
        GS.screenDirty = true;
    } else if (!MI.pending && !MI.file) {
        /* the list's bar and part counts: one small file a tick */
        const it = MI.items.find(x => x.kind === 'file' && !CACHE.has(x.path) && (MI.sizes[x.path] | 0) <= BG_PARSE_MAX);
        if (it) { parsed(it.path); if (MI.list.up || MI.root) GS.screenDirty = true; }
    }
    if (MI.cur && MI.keySig !== (GS.padKey | 0) + '/' + (GS.padScale | 0)) replan();
    if (MI.list.up && !MI.list.touched && playable() && now - MI.list.letGo >= LIST_LINGER_MS) {
        MI.list.up = false;
        GS.screenDirty = true;
    }
    previewTick();
    if (MI.pmode === 'free' || !MI.hear || MI.held >= 0) GS.screenDirty = true;
}

export function miAnimating() { return !!(MI && (MI.pmode || MI.pending || !MI.hear)); }

/* ---- drawing ---- */

function listRows() {
    return MI.items.map(it => {
        if (it.kind === 'up') return { label: '..' };
        if (it.kind === 'dir') return { label: it.label + '/' };
        if (it.kind === 'part') return { label: it.label, value: (it.drum ? 'DRM ' : '') + it.bars + 'Br' };
        const m = metaOf(it.path);
        if (!m) return { label: it.label, value: fmtSize(MI.sizes[it.path]) };
        if (m.parts > 1) return { label: it.label + '>', value: m.parts + ' PT' };
        return { label: it.label, value: (m.drum ? 'DRM ' : '') + m.bars + 'Br' };
    });
}
function fmtSize(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return '1K';
    return Math.round(n / 1024) + 'K';
}
function listTitle() {
    if (MI.file) return MI.file.name.toUpperCase() + ' >';
    const d = MI.B.currentDir;
    return d === MI_ROOT ? 'IMPORT MIDI' : baseName(d).toUpperCase() + '/';
}

function topCells() {
    const c = MI.cur;
    const total = partBarsOf(c.part, c.ts);
    const maxB = maxBarsAt(TPS_VALUES[MI.grid], c.ts, stretchF());
    return [
        { kind: 'valsq', label: 'Start', name: 'Start Bar', text: String(MI.startBar),
          norm: total > 1 ? (MI.startBar - 1) / (total - 1) : 0 },
        { kind: 'valsq', label: 'Bars', name: 'Length', text: String(MI.bars),
          norm: maxB > 1 ? (MI.bars - 1) / (maxB - 1) : 0 },
        { kind: 'enumsq', label: 'Grid', name: 'Grid', text: GRID_LABELS[MI.grid], options: GRID_LABELS, sel: MI.grid },
        { kind: 'enumsq', label: 'Strch', name: 'Stretch', text: STRETCH_STEPS[MI.stretch].label,
          options: STRETCH_STEPS.map(s => s.label), sel: MI.stretch },
        { kind: 'blank', label: '' }, { kind: 'blank', label: '' }, { kind: 'blank', label: '' }, { kind: 'blank', label: '' },
    ];
}
const signed = (n) => (n >= 0 ? '+' : '') + n;
/* K5-K7: small two-line cells (label over value) under their knobs. */
function lowCells() {
    if (MI.drum) return [{ label: 'MAP', name: 'Drum Map', value: MI.map === 'off' ? 'OFF' : MI.map.toUpperCase() }];
    return [
        { label: 'OCT', name: 'Octave', value: signed(MI.oct) },
        { label: 'SEMI', name: 'Semitones', value: signed(MI.semi) },
        { label: 'SCALE', name: 'Fit to Scale', value: MI.scaleOn ? 'ON' : 'OFF' },
    ];
}

/* One lane: every note of the part where it falls, its length as its width;
 * the window [Start, Start+Bars) bracketed, notes outside it dotted.
 * Rasterised once per part and window — a part can hold thousands of notes. */
const LANE_X = 4, LANE_W = 120, LANE_Y = 35;
function laneMask() {
    const c = MI.cur, p = MI.plan;
    const key = c.key + '|' + p.from + '|' + p.to;
    if (MI.mask && MI.mask.key === key) return MI.mask;
    const span = Math.max(partBarsOf(c.part, c.ts) * barTicks(c.ts), p.to);
    const px = (t) => LANE_X + Math.floor(Math.max(0, Math.min(span, t)) * LANE_W / span);
    const inside = new Uint8Array(LANE_W), outside = new Uint8Array(LANE_W);
    for (const n of c.part.notes) {
        const x0 = px(n.t), w = Math.max(2, px(n.t + n.g) - x0 - 1);
        const into = (n.t >= p.from && n.t < p.to) ? inside : outside;
        for (let x = x0; x < x0 + w && x < LANE_X + LANE_W; x++) into[x - LANE_X] = 1;
    }
    MI.mask = { key, inside, outside, px };
    return MI.mask;
}
function drawLane() {
    const p = MI.plan, m = laneMask();
    /* muted: the notes blink (Josh, 2026-09-29) — nothing is heard as you scroll */
    const showNotes = MI.hear || (nowMs() % 600) < 300;
    if (showNotes) for (let i = 0; i < LANE_W; i++) {
        const x = LANE_X + i;
        if (m.inside[i]) { set_pixel(x, LANE_Y, 1); set_pixel(x, LANE_Y + 1, 1); }
        else if (m.outside[i]) set_pixel(x, LANE_Y + ((x & 1) ? 1 : 0), 1);
    }
    for (const [cx, dir] of [[m.px(p.from), 1], [Math.min(LANE_X + LANE_W - 1, m.px(p.to)), -1]]) {
        fill_rect(cx, LANE_Y - 2, 1, 7, 1);
        fill_rect(dir > 0 ? cx : cx - 2, LANE_Y - 2, 3, 1, 1);
        fill_rect(dir > 0 ? cx : cx - 2, LANE_Y + 4, 3, 1, 1);
    }
    if (MI.pmode === 'free' && MI.free && MI.free.playhead != null)
        fill_rect(m.px(p.from + MI.free.playhead / stretchF()), LANE_Y - 1, 1, 5, 1);
}
function drawLowCells(touched) {
    lowCells().forEach((c, i) => {
        const x0 = i * 32, on = touched === 4 + i;
        if (on) fill_rect(x0 + 1, 41, 30, 15, 1);
        mvPrint(x0 + Math.floor((32 - mvWidth(c.label)) / 2), 43, c.label, on ? 0 : 1);
        mvPrint(x0 + Math.floor((32 - mvWidth(c.value)) / 2), 50, c.value, on ? 0 : 1);
    });
}
function footer(shift) {
    const verb = MI.hear ? 'MUTE' : 'HEAR';
    if (shift) return [['CLK', verb]];
    if (MI.drum) return [['RTPAD', 'SOUND'], ['SHFT', verb]];
    return [['JOG', 'FILE'], ['CLK', 'LOAD'], ['SHFT', verb]];
}
export function miHintsForTest(shift) {
    if (!MI) return null;
    return { footer: MI.root ? [['JOG', 'FOLDER'], ['CLK', 'OPEN']] : footer(!!shift), warning: MI.cur ? warning() : null };
}

/* The sounds panel: up while a sound pad is held. One row per sound: its
 * name, its lane, a tick per hit. */
const PICK_X = 2, PICK_Y = 9, PICK_W = 124;
function drawSounds() {
    const h = MV_FOOTER_Y - 1 - PICK_Y;
    fill_rect(PICK_X, PICK_Y, PICK_W, h, 0);
    draw_rect(PICK_X, PICK_Y, PICK_W, h, 1);
    const rowH = 7, fit = Math.floor((h - 4) / rowH);
    const first = Math.max(0, Math.min(MI.voices.length - fit, MI.held - Math.floor(fit / 2)));
    const span = Math.max(1, MI.plan.span);
    MI.voices.forEach((v, i) => {
        if (i < first || i >= first + fit) return;
        const y = PICK_Y + 3 + (i - first) * rowH, on = i === MI.held, c = on ? 0 : 1;
        if (on) fill_rect(PICK_X + 2, y - 1, PICK_W - 4, rowH, 1);
        mvPrint(PICK_X + 5, y, voiceName(v.pitch), c);
        const a = MI.assign[i];
        mvPrint(PICK_X + 38, y, a < 0 ? '--' : 'PAD ' + (a + 1), c);
        const rx = PICK_X + 66, rw = PICK_W - 70;
        for (const n of MI.plan.notes) if (n.p === v.pitch) fill_rect(rx + Math.floor(n.t * rw / span), y + 1, 1, 3, c);
    });
}
function drawList() {
    const h = MV_FOOTER_Y - 1 - PICK_Y;
    fill_rect(PICK_X, PICK_Y, PICK_W, h, 0);
    draw_rect(PICK_X, PICK_Y, PICK_W, h, 1);
    const rows = listRows().map(r => ({ labelFont: 'small', ...r }));
    drawKitList(rows, MI.idx, { x: PICK_X + 1, w: PICK_W - 2, topY: PICK_Y + 3, h: h - 3, rowH: 7, emptyMsg: 'NO MIDI FILES' });
}

export function miRender(touchedIdx, shift) {
    if (!MI) return;
    clear_screen();
    if (MI.root) {
        drawKitHeader('IMPORT MIDI', false);
        const rows = listRows();
        drawKitList(rows, MI.idx, { emptyMsg: 'NO MIDI FILES' });
        drawKitHintRow(MV_FOOTER_Y, [['JOG', 'FOLDER'], ['CLK', 'OPEN']]);
        return;
    }
    if (!MI.cur) {
        /* nothing to hear here (a folder, a multi-part file, one being read, an
         * empty folder): the list is the screen */
        kitUseLayout('bank');
        drawKitBankPage(new Array(8).fill({ kind: 'blank', label: '' }), { headerText: listTitle(), headerRight: MI.items.length ? position() : '',
                              touchedIdx: -1, footer: footer(shift) });
        drawList();
        if (MI.pending) mvPrint(PICK_X + 4, MV_FOOTER_Y - 9, 'READING...', 1);
        return;
    }
    kitUseLayout('bank');
    const cells = topCells();
    const touched = touchedIdx >= 0 && touchedIdx < 8 ? touchedIdx : -1;
    const topTouched = touched >= 0 && touched < 4 ? touched : -1;
    const low = touched >= 4 ? lowCells()[touched - 4] : null;
    const listUp = MI.list.up;
    if (!listUp && !enumOverlayWouldDraw(cells, topTouched)) {
        drawLane();
        drawLowCells(low ? touched : -1);
    }
    let headerText = MI.cur.name.toUpperCase(), headerRight = warning() || position();
    if (listUp) { headerText = listTitle(); headerRight = position(); }
    else if (low) { headerText = low.name.toUpperCase(); headerRight = low.value; }
    else if (MI.drum && MI.held >= 0 && MI.voices[MI.held]) {
        const a = MI.assign[MI.held];
        headerText = voiceName(MI.voices[MI.held].pitch) + ' > ' + (a >= 0 ? 'PAD ' + (a + 1) : '--');
        headerRight = '';
    }
    drawKitBankPage(cells, { headerText, headerRight, touchedIdx: listUp ? -1 : topTouched,
                             footer: MI.drum && MI.held >= 0 ? [['TAP', 'LANE'], ['AGAIN', 'OFF']] : footer(shift) });
    if (listUp) drawList();
    else if (MI.drum && MI.held >= 0) drawSounds();
}
