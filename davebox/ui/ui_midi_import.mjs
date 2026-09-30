/* ui_midi_import.mjs — the MIDI browser: a MIDI file into the current clip.
 *
 * Import MIDI and the phrase browser as ONE screen (Josh, 2026-09-29), and —
 * after the first device pass — with dAVEBOx's own feel (2026-09-30: "it LOOKS
 * great, but it doesn't FEEL like the rest of davebox"). The approved mockups
 * are tools/mockup_midi_browser2.mjs. Opened from K8 of the CLIP / DRUM LANE
 * card (touch + click; the tick calls miOpen); a modal hosted by ui.js, the
 * tick and drawUI. Three layers, one Back each, as the AUTOMATION bank's:
 *
 *   card      the file you PICKED, playing: its name, n/N (or what will not
 *             land, or REPLACES); K1 Start · K2 Bars · K3 Res · K4 Stretch as
 *             the bank page's top row; one lane of its notes with the window
 *             bracketed and the playhead; K5 Oct · K6 Semi · K7 Scale (a drum
 *             track: K5 Map) and K8 the file's BPM as small cells. The knobs
 *             behave as on every bank: a touch NAMES the knob, a list comes up
 *             only on a TURN (Stretch, Map); Res is the CLIP card's
 *             Resolution cell (a fraction that turns into an arc). Click =
 *             Load; jog = the list; Back = leave (asking first if a file is
 *             picked).
 *   list      the folder: `..` up (the only way up, as in dAVEBOx's file
 *             browser), a folder (NAME/) or a multi-part file (NAME>, entered
 *             like a folder) opened by a click, a file PICKED by a click (back
 *             to the card). Landing on a file plays it, after a short rest.
 *             Back closes the list and puts back the file you had; with none
 *             (a track's first open) it leaves.
 *   confirm   dAVEBOx's Yes/No dialog, No selected; the jog chooses, the click
 *             commits, Back = No. LOAD INTO CLIP A (from a click on the card)
 *             and LEAVE IMPORT (from Back with a file picked: Yes loads and
 *             leaves, No leaves without loading). Nothing reaches a clip
 *             without a Yes (Josh, 2026-09-30).
 *
 * ⭑ The preview replaces what the track plays: in time while the track plays
 * its clip (tN_audclip, swapped in on the beat), alone and free-running
 * otherwise (tN_audition). Shift+click mutes (remembered); the lane blinks.
 * ⭑ A load goes into the CURRENT clip, one undo unit. Melodic: the clip is
 * replaced, automation included. Drum: only the lanes a sound goes to — the
 * rest keep their notes (Josh, 2026-09-29).
 * ⭑ Each track reopens on its own last file (or folder), in memory only — a
 * drums folder on a drum track, a melodic one on a piano track (Josh,
 * 2026-09-30: "don't overthink it"). A new file starts at Start 1, Res 1/16,
 * Stretch x1, Bars = its length; Bars never passes the file's end or what the
 * clip holds at that resolution.
 * ⭑ The transport is never stopped. Step buttons are blocked (dim white).
 *
 * Decisions are ui_midi_notes.mjs (pure) and ui_midifile.mjs (the parser);
 * this file reads files, draws, and queues the engine writes on
 * S.pendingDefaultSetParams (one per tick).
 */
import * as os from 'os';
import * as std from 'std';
import { S as GS, noteUndoUnit } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { TPS_VALUES, SCENE_LETTERS, PAD_MODE_DRUM, PAD_MODE_CONDUCT, DRUM_LANES, LED_OFF, fmtRes } from './ui_constants.mjs';
import { White, VividYellow, Cyan, NeonPink, BrightOrange, NeonGreen, ElectricViolet, BrightRed, Lime } from '/data/UserData/schwung/shared/constants.mjs';
import { drawDialogYesNoRow } from '/data/UserData/schwung/shared/menu_layout.mjs';
import { syncClipsTargeted } from './ui_dsp_bridge.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { automationClearClipQueued } from './ui_automation.mjs';
import { midiMuted, setMidiMuted, midiMap, setMidiMap } from './ui_prefs.mjs';
import { ccKnobDelta, knobPick, KNOB_PICK, KNOB_DELIB } from './ui_input_cc.mjs';
import { fontPrint4x5, fontWidth4x5, fit4x5 } from './ui_fonts_pp.mjs';
import {
    drawKitBankPage, drawKitMarkHeader, kitUseLayout, enumOverlayWouldDraw,
    mvPrint, mvWidth, MV_FOOTER_Y,
} from './ui_movy.mjs';
import { buildFilepathBrowserState, refreshFilepathBrowser } from '/data/UserData/schwung/shared/filepath_browser.mjs';
import { smfParse, SMF_MAX_BYTES, SMF_EXTENSIONS } from './ui_midifile.mjs';
import {
    STRETCH_STEPS, STRETCH_DEFAULT, OCT_MIN, OCT_MAX, SEMI_MIN, SEMI_MAX, MN_MAX_SOUNDS, MAP_MODES,
    mapPitch, planNotes, maxBarsAt, partBarsOf, barTicks, drumVoices, defaultAssign, drumLaneNotes,
    melodicImportVal, melodicAudclipVal, lanesAudclipVal, lanesImportVal, voiceName,
} from './ui_midi_notes.mjs';

export const MI_ROOT = '/data/UserData';
/* Install internals under the root, never a place a user keeps MIDI files. */
const HIDDEN_TOP = new Set(['schwung', 'dbx-host', 'settings', 'boot-targets']);
export const GRID_LABELS = [0, 1, 2, 3, 4, 5].map(fmtRes);
const GRID_DEFAULT = 1;          /* 1/16: every new file starts here (Josh, 2026-09-30) */

const PREVIEW_DELAY_MS = 160;    /* a file is read and heard once the jog rests — the preset list's delay */
const CACHE_MAX = 8;             /* parsed files kept */
const BG_PARSE_MAX = 64 * 1024;  /* larger files get their list counts only when landed on */

let MI = null;
let loadSync = null;             /* after a load: verify it landed (the screen has closed) */
const CACHE = new Map();         /* path → { res } | { error } — insertion order is the LRU */
const META = new Map();          /* path → { parts, bars, drum } | null — the list's counts; never evicted */
/* Where each track was: { dir, path, part } — in memory only (Josh, 2026-09-30). */
const MEM = new Array(8).fill(null);

export function miActive() { return !!MI; }
export function miStateForTest() { return MI; }
export function miMarqueeForTest() { return MQ; }
export function miResetForTest() { MI = null; loadSync = null; CACHE.clear(); META.clear(); MEM.fill(null); }
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
function metaOfRes(r) {
    return r && !r.error ? { parts: r.parts.length, bars: partBarsOf(r.parts[0], r.timeSig), drum: !!r.parts[0].drum } : null;
}
/* A file's parse, cached; its list counts are kept apart, for good. */
function parsed(path) {
    if (CACHE.has(path)) { const e = CACHE.get(path); CACHE.delete(path); CACHE.set(path, e); return e; }
    const r = readFile(path);
    const e = r.error ? { error: r.error } : { res: r };
    CACHE.set(path, e);
    META.set(path, metaOfRes(r));
    while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    return e;
}
const baseName = (p) => String(p || '').split('/').pop();
const noExt = (n) => String(n).replace(/\.[^.]+$/, '');

/* ---- opening and closing ---- */

function isDrumTrack(t) { return GS.trackPadMode[t] === PAD_MODE_DRUM; }

function freshState(track) {
    return {
        track, drum: isDrumTrack(track), layer: 'list', confirm: null,
        B: buildFilepathBrowserState({ root: MI_ROOT, filter: SMF_EXTENSIONS, name: 'Import MIDI' }, ''),
        sizes: {}, file: null, items: [], idx: 0,
        pending: null, sel: null, cur: null, plan: null,
        startBar: 1, bars: 1, grid: GRID_DEFAULT, stretch: STRETCH_DEFAULT, oct: 0, semi: 0, scaleOn: true,
        map: midiMap(), saved: null,
        voices: [], extraSounds: 0, assign: [], held: -1, lanes: new Map(),
        hear: !midiMuted(), pmode: null, staged: null, free: null, keySig: '', mask: null,
    };
}

/* Tick context (opening lists a folder). A track that has been here reopens
 * on its file's card; otherwise on the list, in its folder or the user data
 * folder. */
export function miOpen(track) {
    MQ.key = null;
    if (!miOffered(track)) return false;
    if (GS.recordArmed || GS.stepRecActive) { showActionPopup('IMPORT MIDI', 'NOT WHILE RECORDING'); return false; }
    MI = freshState(track);
    const mem = MEM[track];
    const dir = mem && mem.dir && (mem.dir === MI_ROOT || isDirPath(mem.dir)) ? mem.dir : MI_ROOT;
    enterDir(dir, mem ? mem.path : '');
    if (mem && mem.path && MI.items[MI.idx] && MI.items[MI.idx].path === mem.path) {
        const e = parsed(mem.path);
        if (!e.error) {
            if (e.res.parts.length > 1) {
                enterFile(mem.path, e.res);
                MI.idx = Math.max(1, Math.min(MI.items.length - 1, (mem.part | 0) + 1));
                land();
            } else landNow();
            pick();
        }
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
    const s = MI.sel;
    MEM[MI.track] = s ? { dir: s.dir, path: s.path, part: s.part } : { dir: MI.B.currentDir, path: '', part: 0 };
}

/* ---- the list ---- */

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
function firstRow() { return MI.items.length && MI.items[0].kind === 'up' ? Math.min(1, MI.items.length - 1) : 0; }
function enterDir(dir, selectPath) {
    MI.file = null;
    MI.B.currentDir = dir;
    buildItems();
    const want = selectPath ? MI.items.findIndex(it => it.path === selectPath) : -1;
    MI.idx = Math.max(0, want >= 0 ? want : firstRow());
    land();
}
function enterFile(path, res) {
    MI.file = { path, name: noExt(baseName(path)), res };
    buildItems();
    MI.idx = 1;
    land();
}
function goUp() {
    if (MI.file) { enterDir(MI.B.currentDir, MI.file.path); return; }
    const dir = MI.B.currentDir;
    if (dir === MI_ROOT) return;
    const parent = dir.replace(/\/[^/]*$/, '') || MI_ROOT;
    enterDir(parent.startsWith(MI_ROOT) ? parent : MI_ROOT, dir);
}

/* The row the jog is on: a file waits for the jog to rest (the preview's
 * delay), then plays; a part plays at once (its file is already read). */
function land() {
    MI.cur = null; MI.plan = null; MI.pending = null; MI.held = -1; MI.mask = null;
    const it = MI.items[MI.idx];
    if (!it) return;
    if (it.kind === 'part') { setCur(MI.file.res, it.part, it.label, MI.file.path); return; }
    if (it.kind === 'file') MI.pending = { at: nowMs() };
}
function landNow() {
    const it = MI.items[MI.idx];
    MI.pending = null;
    if (it && it.kind === 'file') fromParse(it, true);
}
/* A landed file's parse: a single part is heard; a multi-part file waits for
 * a click. `announce` says what the file could not give. */
function fromParse(it, announce) {
    const e = parsed(it.path);
    if (e.error) { if (announce) showActionPopup(e.error, it.label.toUpperCase()); return; }
    if (announce) {
        const WARN = { TRUNCATED: 'FILE CUT SHORT', DAMAGED: 'FILE DAMAGED',
                       'NOTES OVER LIMIT': 'SOME NOTES SKIPPED', 'TOO MANY PARTS': 'FIRST 64 PARTS ONLY' };
        const w = (e.res.warnings || []).find(k => WARN[k]);
        if (w) showActionPopup(WARN[w], it.label.toUpperCase());
    }
    if (e.res.parts.length === 1) setCur(e.res, 0, it.label, it.path);
}

/* The item heard becomes the card's. */
function pick() {
    if (!MI.cur) return;
    MI.sel = { ...MI.cur, dir: MI.B.currentDir };
    MI.saved = null;
    MI.layer = 'card';
    GS.screenDirty = true;
}
/* The list, raised from the card: what the card had is kept, to put back. */
function openList() {
    MQ.key = null;
    MI.saved = MI.sel ? { cur: MI.cur, startBar: MI.startBar, bars: MI.bars, grid: MI.grid, stretch: MI.stretch,
                          voices: MI.voices, extraSounds: MI.extraSounds, assign: MI.assign } : null;
    MI.layer = 'list';
    GS.screenDirty = true;
}
function closeList() {
    const sv = MI.saved;
    if (!sv) return false;
    const s = MI.sel;
    /* the list shows the picked file's row again next time — inside its
     * multi-part file, on its part */
    if (s) {
        enterDir(s.dir, s.path);
        const e = CACHE.get(s.path);
        if (e && e.res && e.res.parts.length > 1) { enterFile(s.path, e.res); MI.idx = Math.min(MI.items.length - 1, (s.part | 0) + 1); }
    }
    Object.assign(MI, { cur: sv.cur, startBar: sv.startBar, bars: sv.bars, grid: sv.grid, stretch: sv.stretch,
                        voices: sv.voices, extraSounds: sv.extraSounds, assign: sv.assign, pending: null, held: -1 });
    MI.saved = null;
    MI.layer = 'card';
    replan();
    return true;
}

/* ---- the card ---- */

const stretchF = () => STRETCH_STEPS[MI.stretch].f;

/* A new file: Start 1, Res 1/16, Stretch x1, Bars its length (Josh, 2026-09-30). */
function setCur(res, partIdx, name, path) {
    const part = res.parts[partIdx];
    const ts = res.timeSig;
    MI.cur = { key: path + '#' + partIdx, name, path, part: partIdx, p: part, ts,
               bpm: res.hasTempo ? res.bpm : null };
    MI.startBar = 1;
    MI.grid = GRID_DEFAULT;
    MI.stretch = STRETCH_DEFAULT;
    MI.bars = partBarsOf(part, ts);
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
/* Bars never passes the file's end (from Start), nor what the clip holds at
 * this resolution and Stretch — the two stay linked, as the old import had them. */
function maxBars() {
    const c = MI.cur;
    return Math.max(1, Math.min(maxBarsAt(TPS_VALUES[MI.grid], c.ts, stretchF()),
                                partBarsOf(c.p, c.ts) - MI.startBar + 1));
}
function replan() {
    const c = MI.cur;
    if (!c) { MI.plan = null; return; }
    MI.startBar = Math.max(1, Math.min(partBarsOf(c.p, c.ts), MI.startBar));
    MI.bars = Math.max(1, Math.min(maxBars(), MI.bars));
    MI.keySig = (GS.padKey | 0) + '/' + (GS.padScale | 0);
    const o = { startBar: MI.startBar, bars: MI.bars, tps: TPS_VALUES[MI.grid], timeSig: c.ts, f: stretchF() };
    if (!MI.drum) {
        const po = { oct: MI.oct, semi: MI.semi, scaleOn: MI.scaleOn, key: GS.padKey | 0, scale: GS.padScale | 0 };
        o.pitch = (p) => mapPitch(p, po);
    }
    MI.plan = planNotes(c.p, o);
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
    if (!MI.hear || !MI.cur || !MI.plan || !MI.plan.notes.length || MI.layer === 'confirm') return null;
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
/* Where the preview is, in clip ticks (or null): the free clock, or — in time
 * — the track's own playhead, which the swapped-in clip drives. */
function playheadTicks() {
    if (MI.pmode === 'free' && MI.free && MI.free.playhead != null) return MI.free.playhead;
    if (MI.pmode === 'clip') {
        const step = MI.drum ? GS.drumCurrentStep[MI.track] : GS.trackCurrentStep[MI.track];
        if (step >= 0) return step * TPS_VALUES[MI.grid];
    }
    return null;
}

/* ---- the load ---- */

function commit() {
    const t = MI.track, c = destClip(), p = MI.plan;
    if (!MI.cur || !p || !p.notes.length) return false;
    if (MI.drum && !MI.lanes.size) { showActionPopup('NO SOUND', 'ON A LANE'); return false; }
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
    return true;
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

/* ---- the confirm ---- */

function askLoad() {
    if (!MI.cur || !MI.plan || !MI.plan.notes.length) return;
    MI.confirm = { kind: 'load', yes: false };
    MI.layer = 'confirm';
    GS.screenDirty = true;
}
function askLeave() {
    MI.confirm = { kind: 'leave', yes: false };
    MI.layer = 'confirm';
    GS.screenDirty = true;
}
function answer(yes) {
    const kind = MI.confirm.kind;
    MI.confirm = null;
    MI.layer = 'card';
    if (yes) { if (commit()) miClose(); return; }
    if (kind === 'leave') { miClose(); return; }     /* No = leave without loading */
    GS.screenDirty = true;
}

/* ---- input ---- */

/* Which setting a knob turns on the card, and how it feels: continuous for
 * the bar counts and semitones, a pick rate for the lists, deliberate for the
 * toggle — the same classes as every bank's knobs (ui_input_cc knobClass). K8
 * is the file's BPM: shown, not set. */
function knobKind(k) {
    const common = ['start', 'bars', 'grid', 'stretch'];
    if (k < 4) return common[k];
    if (MI.drum) return k === 4 ? 'map' : null;
    return ['oct', 'semi', 'scale'][k - 4] || null;
}
const CONT = new Set(['start', 'bars', 'semi']);

/* d2 is the raw knob value (the frame's whole detent count). */
export function miOnKnob(k, d2) {
    if (!MI || MI.layer !== 'card' || !MI.cur) return;
    const kind = knobKind(k);
    if (!kind) return;
    const dir = (d2 >= 1 && d2 <= 63) ? d2 : (d2 >= 65 && d2 <= 127) ? d2 - 128 : 0;
    if (!dir) return;
    const steps = CONT.has(kind) ? ccKnobDelta(d2, k, 1)
                : knobPick(k, dir, kind === 'scale' ? KNOB_DELIB : KNOB_PICK);
    if (!steps) return;
    if (kind === 'start') MI.startBar += steps;
    else if (kind === 'bars') MI.bars += steps;
    else if (kind === 'grid') MI.grid = Math.max(0, Math.min(TPS_VALUES.length - 1, MI.grid + steps));
    else if (kind === 'stretch') MI.stretch = Math.max(0, Math.min(STRETCH_STEPS.length - 1, MI.stretch + steps));
    else if (kind === 'oct') MI.oct = Math.max(OCT_MIN, Math.min(OCT_MAX, MI.oct + steps));
    else if (kind === 'semi') MI.semi = Math.max(SEMI_MIN, Math.min(SEMI_MAX, MI.semi + steps));
    else if (kind === 'scale') MI.scaleOn = steps > 0;
    else if (kind === 'map') {
        const i = Math.max(0, Math.min(MAP_MODES.length - 1, MAP_MODES.indexOf(MI.map) + steps));
        if (MAP_MODES[i] !== MI.map) { MI.map = MAP_MODES[i]; setMidiMap(MI.map); reassign(); }
    }
    replan();
}

/* The jog's touch: nothing to do — the list is a layer, not a peek. */
export function miJogTouch() {}

export function miOnJog(delta) {
    if (!MI || !delta) return;
    if (MI.layer === 'confirm') { MI.confirm.yes = delta > 0; GS.screenDirty = true; return; }
    if (MI.layer === 'card') { openList(); return; }
    if (!MI.items.length) return;
    const was = MI.idx;
    MI.idx = Math.max(0, Math.min(MI.items.length - 1, MI.idx + (delta > 0 ? 1 : -1)));
    if (MI.idx !== was) land();
    GS.screenDirty = true;
}

export function miOnClick(shift) {
    if (!MI) return;
    if (MI.layer === 'confirm') { answer(MI.confirm.yes); return; }
    if (shift) {
        MI.hear = !MI.hear;
        setMidiMuted(!MI.hear);
        GS.screenDirty = true;
        return;
    }
    if (MI.layer === 'card') { askLoad(); return; }
    const it = MI.items[MI.idx];
    if (!it) return;
    if (it.kind === 'up') { goUp(); return; }
    if (it.kind === 'dir') { enterDir(it.path, ''); return; }
    if (it.kind === 'file' && (!MI.cur || MI.cur.path !== it.path)) {
        MI.pending = null;
        const e = parsed(it.path);
        if (e.error) { showActionPopup(e.error, it.label.toUpperCase()); return; }
        if (e.res.parts.length > 1) { enterFile(it.path, e.res); return; }
        fromParse(it, true);
    }
    pick();
}

/* Back, on its RELEASE (the press is the global hold-to-suspend clock): one
 * layer at a time. */
export function miOnBack() {
    if (!MI) return;
    if (MI.layer === 'confirm') { answer(false); return; }
    if (MI.layer === 'list') {
        /* Back closes the list (as dAVEBOx's file browser: `..` is the way up) */
        if (closeList()) { GS.screenDirty = true; return; }
        miClose();                            /* nothing picked yet: leave */
        return;
    }
    if (MI.sel) { askLeave(); return; }
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
function padsLive() { return !!(MI && MI.drum && MI.cur && MI.voices.length && MI.layer === 'card'); }
/* A pad pressed (0-31, bottom-left first). Hold a sound pad and tap a lane to
 * put it there, or again to take it off. A lane tap alone just plays the lane
 * (the engine does that; this only decides placement). */
export function miPadTap(i) {
    if (!padsLive()) return;
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
    if (!padsLive()) return null;
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
    if (MI.pending && now - MI.pending.at >= PREVIEW_DELAY_MS) {
        landNow();
        GS.screenDirty = true;
    } else if (!MI.pending && !MI.file && MI.layer === 'list') {
        /* the list's bar and part counts: one small file a tick, kept for good */
        const it = MI.items.find(x => x.kind === 'file' && !META.has(x.path) && (MI.sizes[x.path] | 0) <= BG_PARSE_MAX);
        if (it) {
            META.set(it.path, CACHE.has(it.path) && CACHE.get(it.path).res ? metaOfRes(CACHE.get(it.path).res) : metaOfRes(readFile(it.path)));
            GS.screenDirty = true;
        }
    }
    if (MI.cur && MI.keySig !== (GS.padKey | 0) + '/' + (GS.padScale | 0)) replan();
    previewTick();
    if (MI.pmode || !MI.hear || MI.held >= 0) GS.screenDirty = true;
    /* the list's scrolling name: a redraw only when it moves a character */
    if (MI.layer === 'list' && MQ.over > 0 && marqueeOffset(now) !== MQ.off) GS.screenDirty = true;
}

export function miAnimating() { return !!(MI && (MI.pmode || MI.pending || !MI.hear)); }

/* ---- the knob rings: the card's cells, dark where a knob does nothing ---- */

const BLANK = { kind: 'blank', label: '' };
export function miRingCells() {
    if (!MI) return null;
    if (MI.layer !== 'card' || !MI.cur) return new Array(8).fill(BLANK);
    const top = topCells().slice(0, 4);
    const low = MI.drum
        ? [{ kind: 'enumsq', label: 'Map', options: MAP_MODES, sel: MAP_MODES.indexOf(MI.map) }, BLANK, BLANK]
        : [{ kind: 'valsq', label: 'Oct', norm: (MI.oct - OCT_MIN) / (OCT_MAX - OCT_MIN) },
           { kind: 'valsq', label: 'Semi', norm: (MI.semi - SEMI_MIN) / (SEMI_MAX - SEMI_MIN) },
           { kind: 'pill', label: 'Scale', norm: MI.scaleOn ? 1 : 0 }];
    /* A number cell's ring needs its position said outright (`ringNorm`):
     * ringNormOfCell reads no value from a plain value cell, and without it
     * K1, K2, K5 and K6 went dark (Josh, device 2026-09-30). */
    return top.concat(low, [BLANK]).map(c => (c.kind === 'valsq' && typeof c.norm === 'number') ? { ...c, ringNorm: c.norm } : c);
}

/* ---- drawing ---- */

function listRows() {
    return MI.items.map(it => {
        if (it.kind === 'up') return { label: '..' };
        if (it.kind === 'dir') return { label: it.label + '/' };
        if (it.kind === 'part') return { label: it.label, value: (it.drum ? 'DRM ' : '') + it.bars + 'Br' };
        const m = META.get(it.path);
        if (!m) return { label: it.label, value: META.has(it.path) ? '--' : fmtSize(MI.sizes[it.path]) };
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
    const total = partBarsOf(c.p, c.ts);
    const maxB = maxBars();
    return [
        { kind: 'valsq', label: 'Start', name: 'Start Bar', text: String(MI.startBar),
          norm: total > 1 ? (MI.startBar - 1) / (total - 1) : 0 },
        { kind: 'valsq', label: 'Bars', name: 'Length', text: String(MI.bars),
          norm: maxB > 1 ? (MI.bars - 1) / (maxB - 1) : 0 },
        /* Res: the clip's Resolution, as the CLIP / DRUM LANE card's Res cell
         * (Josh, 2026-09-30) — a fraction at rest, an arc on the knob while it
         * is turned; no list. It sets the step size, never quantizes. */
        { kind: 'frac', label: 'Res', name: 'Resolution', text: GRID_LABELS[MI.grid], options: GRID_LABELS, sel: MI.grid,
          touchArc: { norm: MI.grid / (GRID_LABELS.length - 1), bip: false } },
        { kind: 'enumsq', label: 'Strch', name: 'Stretch', text: STRETCH_STEPS[MI.stretch].label,
          options: STRETCH_STEPS.map(s => s.label), sel: MI.stretch },
        BLANK, BLANK, BLANK, BLANK,
    ];
}
const signed = (n) => (n >= 0 ? '+' : '') + n;
/* K5-K8: small two-line cells (label over value) under their knobs. */
function lowCells() {
    const bpm = { label: 'BPM', name: 'File Tempo', value: MI.cur && MI.cur.bpm ? String(Math.round(MI.cur.bpm)) : '--' };
    if (MI.drum) return [{ label: 'MAP', name: 'Drum Map', value: MI.map === 'off' ? 'OFF' : MI.map.toUpperCase(),
                           options: MAP_MODES.map(m => m === 'off' ? 'OFF' : m.toUpperCase()), sel: MAP_MODES.indexOf(MI.map) },
                         null, null, bpm];
    return [
        { label: 'OCT', name: 'Octave', value: signed(MI.oct) },
        { label: 'SEMI', name: 'Semitones', value: signed(MI.semi) },
        { label: 'SCALE', name: 'Fit to Scale', value: MI.scaleOn ? 'ON' : 'OFF' },
        bpm,
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
    const span = Math.max(partBarsOf(c.p, c.ts) * barTicks(c.ts), p.to);
    const px = (t) => LANE_X + Math.floor(Math.max(0, Math.min(span, t)) * LANE_W / span);
    const inside = new Uint8Array(LANE_W), outside = new Uint8Array(LANE_W);
    for (const n of c.p.notes) {
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
    const ph = playheadTicks();
    if (ph != null) fill_rect(m.px(p.from + (ph % p.span) / stretchF()), LANE_Y - 1, 1, 5, 1);
}
function drawLowCells(touched) {
    lowCells().forEach((c, i) => {
        if (!c) return;
        const x0 = i * 32, on = touched === 4 + i;
        if (on) fill_rect(x0 + 1, 41, 30, 15, 1);
        mvPrint(x0 + Math.floor((32 - mvWidth(c.label)) / 2), 43, c.label, on ? 0 : 1);
        mvPrint(x0 + Math.floor((32 - mvWidth(c.value)) / 2), 50, c.value, on ? 0 : 1);
    });
}
function footer(shift) {
    const verb = MI.hear ? 'MUTE' : 'HEAR';
    if (shift) return [['CLK', verb]];
    if (MI.layer === 'list') {
        const it = MI.items[MI.idx];
        const open = it && (it.kind === 'up' || it.kind === 'dir' || (it.kind === 'file' && (META.get(it.path) || {}).parts > 1));
        return [['CLK', open ? 'OPEN' : 'PICK'], ['JOG', 'FILE'], ['SHFT', verb]];
    }
    if (MI.drum) return [['RTPAD', 'SOUND'], ['SHFT', verb]];
    return [['CLK', 'LOAD'], ['JOG', 'FILE'], ['SHFT', verb]];
}
export function miHintsForTest(shift) {
    if (!MI) return null;
    return { layer: MI.layer, footer: footer(!!shift), warning: MI.cur ? warning() : null };
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
/* The file list: names in the host font (mixed case, as the file is named),
 * readouts in movy, five 9px rows with the cursor on the middle one (Josh,
 * 2026-09-30). A name too long for its row SCROLLS on the cursor row — by
 * whole characters, as the host's menus do (print cannot clip) — and is cut
 * short on every other row. A part file's `>` and a folder's `/` stay on. */
const LIST_ROW_H = 9, LIST_ROWS = 5;
const MQ_WAIT_MS = 1000, MQ_STEP_MS = 80, MQ_HOLD_MS = 1500;
const MQ = { key: null, t0: 0, over: 0, off: 0 };
function marqueeOffset(now) {
    if (MQ.over <= 0) return 0;
    const u = (now - MQ.t0) % (MQ_WAIT_MS + MQ.over * MQ_STEP_MS + MQ_HOLD_MS);
    return u < MQ_WAIT_MS ? 0 : Math.min(MQ.over, Math.floor((u - MQ_WAIT_MS) / MQ_STEP_MS));
}
function drawList() {
    const h = MV_FOOTER_Y - 1 - PICK_Y;
    fill_rect(PICK_X, PICK_Y, PICK_W, h, 0);
    draw_rect(PICK_X, PICK_Y, PICK_W, h, 1);
    const rows = listRows(), n = rows.length;
    const x = PICK_X + 1, w = PICK_W - 2, topY = PICK_Y + 1;
    if (!n) {
        MQ.over = 0;
        mvPrint(x + ((w - mvWidth('NO MIDI FILES')) >> 1), topY + ((h - 5) >> 1), 'NO MIDI FILES', 1);
        return;
    }
    const sel = Math.max(0, Math.min(n - 1, MI.idx));
    const start = Math.max(0, Math.min(sel - (LIST_ROWS >> 1), n - LIST_ROWS));
    const hasScroll = n > LIST_ROWS;
    const right = x + w - (hasScroll ? 5 : 3), lx = x + 3, fillW = hasScroll ? w - 4 : w;
    for (let i = 0; i < LIST_ROWS && start + i < n; i++) {
        const idx = start + i, r = rows[idx], y = topY + i * LIST_ROW_H, on = idx === sel, ink = on ? 0 : 1;
        if (on) fill_rect(x, y, fillW, LIST_ROW_H, 1);
        const val = r.value != null ? String(r.value).toUpperCase() : '';
        const vw = val ? mvWidth(val) : 0;
        const avail = right - lx - (vw ? vw + 4 : 0);
        let label = String(r.label), tail = '';
        if (label.length > 1 && /[>/]$/.test(label)) { tail = label.slice(-1); label = label.slice(0, -1); }
        const fits = (t) => text_width(t + tail) <= avail;
        if (on) {
            const key = MI.items[idx].path || MI.items[idx].label;
            if (MQ.key !== key) { MQ.key = key; MQ.t0 = nowMs(); }
            let over = 0;
            while (over < label.length - 1 && !fits(label.slice(over))) over++;
            MQ.over = over;
            MQ.off = marqueeOffset(nowMs());
            label = label.slice(MQ.off);
        }
        while (label.length > 1 && !fits(label)) label = label.slice(0, -1);
        if (tail) label = label.replace(/ +$/, '');
        print(lx, y + 1, label + tail, ink);
        if (val) mvPrint(right - vw, y + 2, val, ink);
    }
    if (hasScroll) {
        const trackH = LIST_ROWS * LIST_ROW_H;
        const thumbH = Math.max(3, Math.round(trackH * LIST_ROWS / n));
        const thumbY = topY + Math.round((trackH - thumbH) * start / Math.max(1, n - LIST_ROWS));
        for (let ry = topY; ry < topY + trackH; ry += 2) set_pixel(x + w - 2, ry, 1);
        fill_rect(x + w - 3, thumbY, 2, thumbH, 1);
    }
}
/* dAVEBOx's Yes/No dialog (ui_dialogs: dlgHeader / dlgLines / drawYesNoRow). */
function drawConfirm() {
    const c = MI.cur, p = MI.plan;
    let title, lines;
    const name = c ? c.name.toUpperCase() : '';
    if (MI.confirm.kind === 'leave') {
        title = 'LEAVE IMPORT';
        lines = ['LOAD ' + name, MI.drum ? 'INTO THE LANES FIRST?' : 'INTO CLIP ' + SCENE_LETTERS[destClip()] + ' FIRST?'];
    } else if (MI.drum) {
        const hit = [...MI.lanes.keys()].filter(l => GS.drumLaneHasNotes[MI.track][l]).map(l => l + 1);
        title = 'LOAD INTO ' + MI.lanes.size + (MI.lanes.size === 1 ? ' LANE' : ' LANES');
        lines = [name + ' - ' + p.bars + ' BARS',
                 hit.length ? 'REPLACES LANE' + (hit.length > 1 ? 'S ' : ' ') + hit.join(', ') : 'THOSE LANES ARE EMPTY'];
    } else {
        const cl = destClip();
        title = 'LOAD INTO CLIP ' + SCENE_LETTERS[cl];
        lines = [name + ' - ' + p.bars + ' BARS', GS.clipNonEmpty[MI.track][cl] ? 'REPLACES ITS NOTES' : 'THE CLIP IS EMPTY'];
    }
    drawKitMarkHeader(title);
    const pitch = 10, bot = 44;
    const top = 7 + Math.floor((bot - 7 - (lines.length * pitch - (pitch - 5))) / 2);
    lines.forEach((l, i) => { const s = fit4x5(l, 124); fontPrint4x5(Math.floor((128 - fontWidth4x5(s)) / 2), top + i * pitch, s, 1); });
    drawDialogYesNoRow(!!MI.confirm.yes);
}

/* `overlayIdx` is the knob TURNED while touched (enumOverlayIdx in
 * ui_render): a touch names the knob, a turn raises its list. */
export function miRender(touchedIdx, shift, overlayIdx) {
    if (!MI) return;
    clear_screen();
    if (MI.layer === 'confirm') { drawConfirm(); return; }
    kitUseLayout('bank');
    if (MI.layer === 'list' || !MI.cur) {
        drawKitBankPage(new Array(8).fill(BLANK), { headerText: listTitle(),
                        headerRight: MI.pending ? 'READING' : (MI.items.length ? position() : ''),
                        touchedIdx: -1, footer: footer(shift) });
        drawList();
        return;
    }
    const cells = topCells();
    const touched = touchedIdx >= 0 && touchedIdx < 8 ? touchedIdx : -1;
    const topTouched = touched >= 0 && touched < 4 ? touched : -1;
    const ov = overlayIdx >= 0 && overlayIdx === topTouched ? overlayIdx : -1;
    const low = touched >= 4 ? lowCells()[touched - 4] : null;
    const lowOverlay = !!(low && low.options && overlayIdx === touched);
    if (!enumOverlayWouldDraw(cells, ov) && !lowOverlay) {
        drawLane();
        drawLowCells(low ? touched : -1);
    }
    let headerText = MI.cur.name.toUpperCase(), headerRight = warning() || position();
    if (low) { headerText = low.name.toUpperCase(); headerRight = low.value; }
    else if (MI.drum && MI.held >= 0 && MI.voices[MI.held]) {
        const a = MI.assign[MI.held];
        headerText = voiceName(MI.voices[MI.held].pitch) + ' > ' + (a >= 0 ? 'PAD ' + (a + 1) : '--');
        headerRight = '';
    }
    /* the drum Map's list, on a turn: raised as a top cell's would be */
    const pageCells = lowOverlay ? cells.slice(0, 4).concat([{ kind: 'enumsq', label: 'Map', name: low.name, text: low.value,
                                                                options: low.options, sel: low.sel }, BLANK, BLANK, BLANK]) : cells;
    drawKitBankPage(pageCells, { headerText, headerRight, touchedIdx: lowOverlay ? touched : topTouched,
                                 overlayIdx: lowOverlay ? touched : ov,
                                 footer: MI.drum && MI.held >= 0 ? [['TAP', 'LANE'], ['AGAIN', 'OFF']] : footer(shift) });
    if (MI.drum && MI.held >= 0) drawSounds();
}
