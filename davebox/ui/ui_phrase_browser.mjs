/* ui_phrase_browser.mjs — the phrase library's screen.
 *
 * Opened by touching K6 on the CLIP or DRUM LANE bank and clicking the jog
 * (a trigger, like Legato). A modal over the track: its own knobs, jog, Back
 * and pads; Play, Shift and Note/Session keep working.
 *
 *   K1 Type    the instrument category (a drum track: drum categories only;
 *              a melodic track: every category — a drum phrase plays notes)
 *   K2 Style   jumps to where a style starts in the list (a genre name tag, or
 *              BASIC); follows the phrase as the list is scrolled
 *   K3 Time    /8 … x8
 *   K4 Octave  melodic tracks: −3 … +3, heard and loaded (Josh, 2026-09-23)
 *   K5 Voice   a melodic track, a phrase of several sounds: hold it to see
 *              every sound and its note; a pad tap sets the highlighted one
 *   jog        opens the phrase PICKER (every phrase of the type, many at a
 *              time) and moves through it; it closes half a second after the
 *              jog is let go (Josh, 2026-09-23), or on a click or Back
 *   click      load · Shift+click: preview on/off · Back: leave
 *   pads       a drum phrase of several sounds (Josh, 2026-09-23: "this note
 *              from the sequence goes on this drum track pad (or melodic track
 *              NOTE) by tapping the relevant pad"):
 *                drum track   the RIGHT-hand pads are the phrase's sounds; hold
 *                             one (heard alone) and tap lane pads on the left to
 *                             put it there, or again to take it off
 *                melodic      hold K5 Voice, turn to a sound, tap a pad for its
 *                             note (again: off)
 *              Nothing moves on to the next sound by itself.
 *
 * ⭑ The preview REPLACES what the track plays: in time while the transport
 * runs and the track plays its clip (tN_audclip, swapped in on the beat),
 * otherwise alone, free-running (tN_audition). Every change — phrase, time,
 * a pad — is heard at once; nothing is written until the load.
 * ⭑ A load is ONE undo unit and closes the screen; the screen remembers, per
 * track, where it was.
 *
 * The decisions are ui_phrases.mjs (pure); this file reads files, draws, and
 * queues the engine writes on S.pendingDefaultSetParams (one per tick).
 */
import { S as GS, noteUndoUnit } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import {
    PAD_MODE_DRUM, PAD_MODE_CONDUCT, SCENE_LETTERS, NOTE_KEYS, DRUM_LANES, LED_OFF,
} from './ui_constants.mjs';
import { White, VividYellow, Cyan, NeonPink, BrightOrange, NeonGreen, ElectricViolet } from '/data/UserData/schwung/shared/constants.mjs';
import { DAVEBOX_HOST_DIR } from './ui_engine.mjs';
import { syncClipsTargeted } from './ui_dsp_bridge.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { automationClearClipQueued } from './ui_automation.mjs';
import {
    drawKitBankPage, drawKitPrompt, drawKitNoteRoll, drawKitList, kitUseLayout, enumOverlayWouldDraw,
    hdrPrint, hdrWidth, mvPrint, MV_FOOTER_Y,
} from './ui_movy.mjs';
import {
    PB_DRUM_CATS, PB_MELODIC_CATS, PB_CAT_LABEL, PB_TIMES, PB_TIME_DEFAULT, PB_BAR, PB_OCT_MIN, PB_OCT_MAX,
    isPbDrumCat, parseLibrary, mergeLibraries, styleGroups, styleOf, timing, melodicNotes,
    drumVoices, defaultAssign, drumLaneNotes, defaultNoteAssign, drumAsMelodicNotes,
    melodicImportVal, melodicAudclipVal, laneImportVal, laneAudclipVal, lanesAudclipVal, lanesImportVal,
    rollOf, decodePhrase, PB_MAX_VOICES,
} from './ui_phrases.mjs';

/* Our module directory (see ui_export.mjs): the shipped library is
 * <module>/phrases/<cat>.json. The user's own files sit in one folder of the
 * user data, merged after the shipped set. */
const MODULE_ID = (typeof DAVEBOX_MODULE_ID === 'string') ? DAVEBOX_MODULE_ID : 'davebox';
export const PB_SHIPPED_DIR = DAVEBOX_HOST_DIR + '/modules/tools/' + MODULE_ID + '/phrases';
export const PB_USER_DIR = '/data/UserData/davebox-phrases';
export const PB_KNOB = 5;                 /* K6 on the CLIP / DRUM LANE bank */

/* Detents per step — the editor's PICK / DELIBERATE rates. */
const KNOB_SENS = [12, 12, 12, 12, 6];
/* The picker closes this long after the jog is let go. */
const PICKER_LINGER_MS = 500;

let PB = null;
const LIB = new Map();                    /* cat → phrases, read while the screen is open */
/* Where the screen was, per track: { cat, style, time, id }. */
export const pbMem = new Array(8).fill(null);
let loadSync = null;                      /* after a load: refresh the clip view once it has landed */

export function pbActive() { return !!PB; }
export function pbStateForTest() { return PB; }
export function pbResetForTest() { PB = null; LIB.clear(); loadSync = null; for (let i = 0; i < 8; i++) pbMem[i] = null; }

/* ---- the library ---- */

function readText(path) {
    try { return host_file_exists(path) ? (host_read_file(path) || '') : ''; } catch (e) { return ''; }
}
function catExists(cat) {
    try { return host_file_exists(PB_SHIPPED_DIR + '/' + cat + '.json') || host_file_exists(PB_USER_DIR + '/' + cat + '.json'); }
    catch (e) { return false; }
}
function libraryOf(cat) {
    if (!LIB.has(cat)) {
        const docs = [PB_SHIPPED_DIR, PB_USER_DIR].map(d => {
            const txt = readText(d + '/' + cat + '.json');
            const doc = txt ? parseLibrary(txt) : null;
            return doc && doc.cat === cat ? doc : null;
        });
        LIB.set(cat, mergeLibraries(docs));
    }
    return LIB.get(cat);
}

/* ---- opening and closing ---- */

function isDrumTrack(t) { return GS.trackPadMode[t] === PAD_MODE_DRUM; }

/* Why the screen cannot open on track t, or null. */
export function pbRefusal(t) {
    if (GS.trackPadMode[t] === PAD_MODE_CONDUCT) return 'NOT ON CONDUCTOR';
    if (GS.recordArmed || GS.stepRecActive) return 'NOT WHILE RECORDING';
    return null;
}

export function pbOpen(t) {
    const why = pbRefusal(t);
    if (why) { showActionPopup('PHRASES', why); return false; }
    LIB.clear();
    const drum = isDrumTrack(t);
    const order = drum ? PB_DRUM_CATS : PB_MELODIC_CATS.concat(PB_DRUM_CATS);
    const cats = order.filter(catExists);
    if (!cats.length) { showActionPopup('PHRASES', 'NO LIBRARY'); return false; }
    PB = {
        track: t, drum, cats, catIdx: 0, styles: [], starts: [], time: PB_TIME_DEFAULT, octave: 0,
        all: [], list: [], idx: 0, voices: [], assign: [], voiceSel: 0, held: -1,
        lane: drum ? (GS.activeDrumLane[t] | 0) : -1, clip: GS.trackActiveClip[t] | 0,
        hear: true, confirm: false, picker: false, jogTouched: false, jogLetGo: 0, knobAcc: [0, 0, 0, 0, 0],
        staged: null, mode: null, free: null,
    };
    const mem = pbMem[t];
    const ci = mem ? cats.indexOf(mem.cat) : -1;
    PB.catIdx = ci >= 0 ? ci : 0;
    enterCategory(mem && ci >= 0 ? mem : null);
    computePadNoteMap();          /* the engine stops reading the right-hand drum pads (see _padDispatchMutedNow) */
    return true;
}

/* Leave without writing: the preview ends and the track plays what it had. */
export function pbClose() {
    if (!PB) return;
    remember();
    stopPreview();
    PB = null;
    computePadNoteMap();          /* the right-hand drum pads are the track's again */
    GS.screenDirty = true;
}

function remember() {
    const p = cur();
    pbMem[PB.track] = { cat: PB.cats[PB.catIdx], time: PB.time, octave: PB.octave, id: p ? p.id : null };
}

/* ---- the selection ---- */

function cur() { return PB && PB.list.length ? PB.list[Math.max(0, Math.min(PB.list.length - 1, PB.idx))] : null; }
function curCat() { return PB.cats[PB.catIdx]; }

function enterCategory(mem) {
    const g = styleGroups(libraryOf(curCat()));
    PB.list = g.list; PB.styles = g.styles; PB.starts = g.starts;
    if (mem && mem.time >= 0 && mem.time < PB_TIMES.length) PB.time = mem.time;
    if (mem && mem.octave >= PB_OCT_MIN && mem.octave <= PB_OCT_MAX) PB.octave = mem.octave;
    const i = mem && mem.id ? PB.list.findIndex(p => p.id === mem.id) : -1;
    PB.idx = i >= 0 ? i : 0;
    enterPhrase();
}
function styleIdx() { const p = cur(); return p ? Math.max(0, PB.styles.indexOf(styleOf(p))) : 0; }

/* A new phrase: its instruments, and where each goes by default. */
function enterPhrase() {
    const p = cur();
    PB.voiceSel = 0;
    PB.held = -1;
    PB.voices = p && isPbDrumCat(p.cat) ? drumVoices(p).slice(0, PB_MAX_VOICES) : [];
    if (!p || !isPbDrumCat(p.cat)) PB.assign = [];
    else if (PB.drum) {
        const t = PB.track;
        PB.assign = defaultAssign(PB.voices, GS.drumLaneNote[t], GS.drumLaneHasNotes[t], PB.lane);
    } else PB.assign = defaultNoteAssign(PB.voices, p.cat);
    GS.screenDirty = true;
}

/* Does this load replace notes? */
function replacing() {
    const p = cur(), t = PB.track;
    if (!p) return false;
    if (PB.drum) return [...drumLanes(true).keys()].some(l => GS.drumLaneHasNotes[t][l]);
    return !!GS.clipNonEmpty[t][PB.clip];
}

/* ---- what is played / written ---- */

/* While a sound pad is held only that sound is heard (the others' lanes go
 * back to the track's own notes for as long as it is held). */
function heardAssign() { return PB.held >= 0 ? PB.assign.map((a, i) => i === PB.held ? a : -1) : PB.assign; }
function drumLanes(all) { return drumLaneNotes(cur(), PB.time, PB.voices, all ? PB.assign : heardAssign()); }
function melodicOut() {
    const p = cur();
    return isPbDrumCat(p.cat) ? drumAsMelodicNotes(p, PB.time, PB.voices, PB.assign, PB.octave)
                              : melodicNotes(p, PB.time, GS.padKey | 0, GS.padScale | 0, PB.octave);
}

/* ---- the preview ---- */

function queue(key, val) {
    const q = GS.pendingDefaultSetParams;
    const e = q.find(x => x.key === key);
    if (e) e.val = val; else q.push({ key, val });
}
function queueAudition(tokens) {
    const key = 't' + PB.track + '_audition';
    const q = GS.pendingDefaultSetParams;
    const last = q.length ? q[q.length - 1] : null;
    if (last && last.key === key) last.val += ' ' + tokens;
    else q.push({ key, val: tokens });
}

function wantMode() {
    /* It keeps playing through the replace confirm: a preview that stops there
     * reads as "cancelled" (Josh, 2026-09-23). */
    if (!PB.hear || !cur()) return null;
    return (GS.playing && GS.trackClipPlaying[PB.track]) ? 'clip' : 'free';
}

function stopPreview() {
    if (PB.mode === 'clip') queue('t' + PB.track + '_audclip', 'off');
    if (PB.mode === 'free' && PB.free && PB.free.sounding.size) queueAudition('alloff');
    PB.mode = null; PB.free = null; PB.staged = null;
}

function stageKey(mode) {
    return [mode, cur().id, PB.time, PB.octave, heardAssign().join(','), GS.padKey, GS.padScale].join('|');
}

function previewTick() {
    const mode = wantMode();
    if (mode !== PB.mode) stopPreview();
    if (!mode) return;
    const key = stageKey(mode);
    if (key !== PB.staged) {
        PB.staged = key;
        PB.mode = mode;
        const tm = timing(cur(), PB.time), t = PB.track;
        if (mode === 'clip') {
            let val;
            if (PB.drum) {
                const lanes = drumLanes();
                val = lanes.size === 1 ? laneAudclipVal(tm, [...lanes.keys()][0], [...lanes.values()][0])
                                       : lanesAudclipVal(tm, lanes);
            } else val = melodicAudclipVal(tm, melodicOut());
            queue('t' + t + '_audclip', val);
        } else {
            if (PB.free && PB.free.sounding.size) queueAudition('alloff');
            let notes;
            if (PB.drum) {
                notes = [];
                for (const [l, ns] of drumLanes())
                    for (const n of ns) notes.push({ t: n.t, g: n.g, v: n.v, p: GS.drumLaneNote[t][l] | 0 });
                notes.sort((a, b) => a.t - b.t);
            } else notes = melodicOut();
            PB.free = { t0: nowMs(), span: tm.ticks, notes, idx: 0, lastTick: -1, sounding: new Map() };
        }
    }
    if (PB.mode === 'free') freeTick();
}

/* The free-running preview: the phrase alone, looped at the project tempo. */
function freeTick() {
    const pv = PB.free;
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
        if (n.t + n.g <= now) continue;
        if (pv.sounding.has(n.p)) toks.push('off ' + n.p);
        toks.push('on ' + n.p + ' ' + n.v);
        pv.sounding.set(n.p, n.t + n.g);
    }
    pv.lastTick = now;
    pv.playhead = now;
    if (toks.length) queueAudition((PB.drum ? 'clip ' + PB.clip + ' ' : '') + toks.join(' '));
}

/* ---- the load ---- */

function commit() {
    const p = cur(), t = PB.track;
    if (!p) return;
    const tm = timing(p, PB.time);
    const repl = replacing();
    /* The free preview's notes end first; the engine ends an in-time preview
     * itself, before it takes its undo snapshot. */
    if (PB.mode === 'free' && PB.free && PB.free.sounding.size) queueAudition('alloff');
    PB.mode = null; PB.free = null; PB.staged = null;
    let key, val, count;
    if (PB.drum) {
        const lanes = drumLanes(true);
        count = [...lanes.values()].reduce((a, ns) => a + ns.length, 0);
        if (lanes.size === 1) {
            const l = [...lanes.keys()][0];
            key = 't' + t + '_l' + l + '_import'; val = laneImportVal(tm, lanes.get(l), repl);
        } else { key = 't' + t + '_lanes_import'; val = lanesImportVal(tm, lanes, repl); }
        GS.pendingDefaultSetParams.push({ key, val });
        GS.drumLaneLengthManuallySet[t] = true;
    } else {
        const notes = melodicOut();
        count = notes.length;
        key = 't' + t + '_c' + PB.clip + '_import';
        val = melodicImportVal(tm, notes, repl);
        GS.pendingDefaultSetParams.push({ key, val });
        /* The clip's automation goes with a melodic load, as with Import MIDI:
         * what plays is exactly the phrase. Queued behind the load, inside its
         * undo unit. */
        if (!automationClearClipQueued(GS.pendingDefaultSetParams, t, PB.clip))
            GS.pendingDefaultSetParams.push({ key: 't' + t + '_pa_clear', val: String(PB.clip) });
        GS.clipLengthManuallySet[t][PB.clip] = true;
    }
    noteUndoUnit();
    loadSync = { key, t, c: PB.clip, drum: PB.drum, wait: 0 };
    const placed = PB.assign.filter(a => a >= 0).length;
    const where = PB.drum ? (PB.voices.length > 1 ? placed + ' PADS' : 'PAD ' + (PB.assign[0] + 1))
                          : 'CLIP ' + SCENE_LETTERS[PB.clip];
    showActionPopup('LOADED', p.name, where + ' · ' + count + ' NOTES');
    remember();
    PB = null;
    computePadNoteMap();
    GS.screenDirty = true;
}

/* ---- input ---- */

/* Which knob picks the voice: K4 on a drum track, K5 on a melodic one (K4 is
 * Octave there). -1 when the phrase has one instrument. */
function voiceKnob() { return PB.voices.length < 1 || PB.drum ? -1 : 4; }

export function pbOnKnob(k, delta) {
    if (!PB || PB.confirm || k > 4 || !delta) return;
    const kind = k === 0 ? 'type' : k === 1 ? 'style' : k === 2 ? 'time'
        : k === voiceKnob() ? 'voice' : (k === 3 && !PB.drum) ? 'octave' : null;
    if (!kind) return;
    PB.knobAcc[k] += delta;
    const sens = KNOB_SENS[k];
    let steps = 0;
    while (PB.knobAcc[k] >= sens) { PB.knobAcc[k] -= sens; steps++; }
    while (PB.knobAcc[k] <= -sens) { PB.knobAcc[k] += sens; steps--; }
    if (!steps) return;
    const clampI = (x, n) => Math.max(0, Math.min(n - 1, x));
    if (kind === 'type') {
        const was = PB.catIdx;
        PB.catIdx = clampI(PB.catIdx + steps, PB.cats.length);
        if (PB.catIdx !== was) enterCategory({ time: PB.time, octave: PB.octave, id: null });
    } else if (kind === 'style') {
        const was = styleIdx();
        const to = clampI(was + steps, PB.styles.length);
        if (to !== was && PB.starts[to] >= 0) { PB.idx = PB.starts[to]; enterPhrase(); }
    } else if (kind === 'time') {
        PB.time = clampI(PB.time + steps, PB_TIMES.length);
    } else if (kind === 'octave') {
        PB.octave = Math.max(PB_OCT_MIN, Math.min(PB_OCT_MAX, PB.octave + steps));
    } else {
        PB.voiceSel = clampI(PB.voiceSel + steps, PB.voices.length);
    }
    GS.screenDirty = true;
}

/* The jog's touch: the picker stays while it is held and goes half a second
 * after it is let go. */
export function pbJogTouch(on) {
    if (!PB) return;
    PB.jogTouched = !!on;
    if (!on) PB.jogLetGo = nowMs();
}

export function pbOnJog(delta) {
    if (!PB || PB.confirm || !delta || !PB.list.length) return;
    PB.picker = true;
    if (!PB.jogTouched) PB.jogLetGo = nowMs();       /* no touch seen: time from the turn */
    GS.screenDirty = true;
    const was = PB.idx;
    PB.idx = Math.max(0, Math.min(PB.list.length - 1, PB.idx + (delta > 0 ? 1 : -1)));
    if (PB.idx !== was) enterPhrase();
}

export function pbOnClick(shift) {
    if (!PB) return;
    if (PB.confirm) { PB.confirm = false; commit(); return; }
    if (shift) { PB.hear = !PB.hear; GS.screenDirty = true; return; }
    if (PB.picker) { PB.picker = false; GS.screenDirty = true; return; }   /* picked */
    if (!cur()) return;
    if (replacing()) { PB.confirm = true; GS.screenDirty = true; return; }
    commit();
}

export function pbOnBack() {
    if (!PB) return;
    if (PB.confirm) { PB.confirm = false; GS.screenDirty = true; return; }
    if (PB.picker) { PB.picker = false; GS.screenDirty = true; return; }
    pbClose();
}

/* The sounds' own pad colours (drum track, right-hand pads), in order. */
const SOUND_COLORS = [VividYellow, Cyan, NeonPink, BrightOrange, NeonGreen, ElectricViolet];

/* A drum track's right-hand pad as a sound index, or -1. Sounds fill the
 * bottom row first: pads 4-7, then 12-13. */
function soundOfPad(i) {
    const col = i % 8, row = Math.floor(i / 8);
    if (col < 4) return -1;
    const s = row * 4 + (col - 4);
    return s < PB.voices.length ? s : -1;
}
function laneOfPad(i) {
    const col = i % 8, row = Math.floor(i / 8);
    if (col >= 4) return -1;
    const lane = (GS.drumLanePage[PB.track] | 0) * 16 + row * 4 + col;
    return lane < DRUM_LANES ? lane : -1;
}
function noteOfPad(i) {
    const n = GS.padNoteMap[i];
    if (n === 0xFF || n == null) return -1;
    return Math.max(0, Math.min(127, (n | 0) + (GS.trackOctave[PB.track] | 0) * 12));
}

/* A pad pressed (0-31, bottom-left first). */
export function pbPadTap(i) {
    if (!PB || PB.confirm || PB.voices.length < 1) return;
    let who = -1, target = -1;
    if (PB.drum) {
        const snd = soundOfPad(i);
        if (snd >= 0) { PB.held = snd; PB.voiceSel = snd; GS.screenDirty = true; return; }
        /* A phrase of several sounds: holding a sound pad is the only way to
         * place one — a lane tap alone just sounds the lane. A phrase of ONE
         * sound goes wherever a lane is tapped, held or not (Josh, 2026-09-23). */
        who = PB.voices.length === 1 ? 0 : PB.held;
        target = laneOfPad(i);
    } else {
        if (GS.knobTouched !== 4) return;              /* hold K5 Voice first */
        who = PB.voiceSel;
        target = noteOfPad(i);
    }
    if (target < 0 || who < 0) return;
    /* Tapping where a sound already is takes it off (a sound of one is always
     * somewhere, so for it a tap only moves it). */
    PB.assign[who] = (PB.assign[who] === target && PB.voices.length > 1) ? -1 : target;
    GS.screenDirty = true;
}

/* A pad let go: letting go of the held sound pad ends the hold. */
export function pbPadRelease(i) {
    if (!PB || !PB.drum || PB.held < 0) return;
    if (soundOfPad(i) === PB.held) { PB.held = -1; GS.screenDirty = true; }
}

/* The pads the screen owns, as colours; null where the track's own lights
 * stay (Josh, 2026-09-23: the lane pads "should stay just how they always
 * are"). Drum track: the right-hand pads (the sounds), and — only while a
 * sound pad is held — the lanes that have a sound, in its colour (cycling
 * through the colours when a lane has several). Melodic track: every pad, but only while K5 Voice is held —
 * where each sound's note is, the highlighted one white. Otherwise null. */
export function pbPadColors() {
    if (!PB || !PB.voices.length) return null;
    const out = new Array(32).fill(null);
    if (PB.drum) {
        /* While a sound pad is held (placing), each lane with a sound takes that
         * sound's colour, matching its pad on the right; the held sound's pad
         * and lane pulse together. Let go and the lanes are the track's again. */
        const pulse = (nowMs() % 400) < 200;
        const colorOf = (v) => (v === PB.held && pulse) ? White : SOUND_COLORS[v % SOUND_COLORS.length];
        for (let i = 0; i < 32; i++) {
            if (i % 8 >= 4) { const snd = soundOfPad(i); out[i] = snd < 0 ? LED_OFF : colorOf(snd); continue; }
            if (PB.held < 0) continue;
            /* several sounds on one lane: cycle through their colours */
            const lane = laneOfPad(i);
            const here = PB.assign.map((a, v) => a === lane ? v : -1).filter(v => v >= 0);
            if (here.length) out[i] = colorOf(here[Math.floor(nowMs() / 300) % here.length]);
        }
        return out;
    }
    if (GS.knobTouched !== 4) return null;
    for (let i = 0; i < 32; i++) {
        const note = noteOfPad(i);
        const v = note < 0 ? -1 : PB.assign.indexOf(note);
        out[i] = v < 0 ? LED_OFF : (PB.assign[PB.voiceSel] === note ? White : SOUND_COLORS[v % SOUND_COLORS.length]);
    }
    return out;
}

/* ---- tick ---- */

export function pbTick() {
    if (loadSync) {
        const ls = loadSync;
        if (!GS.pendingDefaultSetParams.some(e => e.key === ls.key)) {
            if (++ls.wait === 3) {
                syncClipsTargeted((ls.drum ? 'd ' : 'm ') + ls.t + ' ' + ls.c);
                loadSync = null;
            }
        }
    }
    if (!PB) return;
    /* The track or its mode changed under us (a track button, Note/Session):
     * leave. */
    if (GS.activeTrack !== PB.track || isDrumTrack(PB.track) !== PB.drum || GS.sessionView) { pbClose(); return; }
    if (GS.recordArmed) { pbClose(); return; }
    if (PB.picker && !PB.jogTouched && nowMs() - PB.jogLetGo >= PICKER_LINGER_MS) { PB.picker = false; GS.screenDirty = true; }
    previewTick();
    if (PB.mode === 'free' || (nowMs() % 400) < 20) GS.screenDirty = true;
}

/* ---- drawing ---- */

const VOICE_NAME = { 35: 'KICK', 36: 'KICK', 37: 'RIM', 38: 'SNARE', 39: 'CLAP', 40: 'SNARE', 41: 'TOM',
    42: 'HAT', 43: 'TOM', 44: 'PEDAL', 45: 'TOM', 46: 'OPEN', 47: 'TOM', 48: 'TOM', 49: 'CRASH',
    50: 'TOM', 51: 'RIDE', 52: 'CHINA', 53: 'BELL', 54: 'TAMB', 55: 'SPLSH', 56: 'COWBL', 57: 'CRASH',
    59: 'RIDE', 60: 'BONGO', 61: 'BONGO', 62: 'CONGA', 63: 'CONGA', 64: 'CONGA', 69: 'CABAS',
    70: 'SHAKR', 75: 'CLAVE', 76: 'BLOCK', 77: 'BLOCK' };
function noteName(n) { return NOTE_KEYS[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 2); }
function voiceLabel(i) {
    const v = PB.voices[i];
    const nm = v.pitch >= 0 ? (VOICE_NAME[v.pitch] || ('N' + v.pitch)) : PB_CAT_LABEL[curCat()];
    return nm;
}
function targetLabel(x) {
    if (x == null || x < 0) return '--';
    return PB.drum ? 'P' + (x + 1) : noteName(x);
}

const OCT_LABELS = ['-3', '-2', '-1', '0', '+1', '+2', '+3'];
function cells() {
    const cats = PB.cats.map(c => PB_CAT_LABEL[c] || c.toUpperCase());
    const si = styleIdx();
    const out = [
        { kind: 'enumsq', label: 'Type', name: 'Type', text: cats[PB.catIdx], options: cats, sel: PB.catIdx },
        { kind: 'enumsq', label: 'Style', name: 'Style', text: PB.styles[si] || '--', options: PB.styles, sel: si },
        { kind: 'enumsq', label: 'Time', name: 'Time', text: PB_TIMES[PB.time].label,
          options: PB_TIMES.map(x => x.label), sel: PB.time },
    ];
    /* A plain signed number, no picker (Josh, 2026-09-23). */
    if (!PB.drum) out.push({ kind: 'valsq', label: 'Oct', name: 'Octave', text: OCT_LABELS[PB.octave - PB_OCT_MIN] });
    if (voiceKnob() >= 0)
        out.push({ kind: 'valsq', label: 'Voice', name: 'Voice', text: voiceLabel(PB.voiceSel) });
    return out;
}
export function pbRingCells() { return PB && !PB.confirm ? cells() : null; }

/* The header names the destination — for a drum phrase of several sounds,
 * how many there are. */
function header() {
    const t = PB.track;
    if (PB.voices.length > 1 && PB.drum) return '(' + (t + 1) + ') ' + PB.voices.length + ' SOUNDS';
    if (PB.drum) return '(' + (t + 1) + ') PAD ' + ((PB.assign[0] ?? PB.lane) + 1);
    return '(' + (t + 1) + ') CLIP ' + SCENE_LETTERS[PB.clip];
}

function footer(shift, touched) {
    const verb = PB.hear ? 'STOP' : 'HEAR';
    if (shift) return [['CLK', verb], ['BACK', '']];
    /* Josh, 2026-09-23: RTPAD SOUND at rest, LFTPD SET while a sound is held. */
    if (panelOpen(touched)) return PB.drum ? [['LFTPD', 'SET'], ['AGAIN', 'OFF']] : [['TAP', 'NOTE'], ['AGAIN', 'OFF']];
    if (PB.drum && PB.voices.length >= 1 && !PB.picker) return [['RTPAD', 'SOUND'], ['CLK', 'LOAD']];   /* no room for BACK too; Back still leaves */
    if (PB.picker) return [['JOG', 'PHRASE'], ['CLK', 'PICK'], ['BACK', '']];
    return [['JOG', 'PHRASE'], ['CLK', 'LOAD'], ['BACK', '']];
}

function drawRoll(y, h) {
    const p = cur();
    const r = rollOf(p, PB.time, GS.padKey | 0, GS.padScale | 0, PB.octave);
    const tm = timing(p, PB.time);
    const opts = { rows: r.rows, barTicks: Math.round(PB_BAR * tm.f) };
    if (PB.mode === 'free' && PB.free && PB.free.playhead != null) opts.playhead = PB.free.playhead;
    drawKitNoteRoll(4, y, 122, h, r.notes, r.ticks, opts);
    /* a mark at the left of each placed sound's row */
    if (PB.voices.length > 1 && r.rows > 1)
        PB.voices.forEach((_, v) => {
            if (PB.assign[v] < 0) return;
            fill_rect(0, y + h - 1 - Math.floor(v * (h - 1) / (r.rows - 1)), 2, 1, 1);
        });
}

export function pbRender(touchedIdx, shift) {
    if (!PB) return;
    clear_screen();
    const p = cur();
    if (PB.confirm) {
        const what = PB.drum ? (PB.voices.length > 1 ? 'PADS' : 'PAD ' + (PB.assign[0] + 1))
                             : 'CLIP ' + SCENE_LETTERS[PB.clip];
        drawKitPrompt('REPLACE ' + what + '?', [p.name, 'UNDO BRINGS IT BACK'], [['CLK', 'YES'], ['BACK', 'NO']]);
        return;
    }
    kitUseLayout('bank');
    const cs = cells();
    const touched = touchedIdx >= 0 && touchedIdx < cs.length ? touchedIdx : -1;
    if (!p) {
        drawKitBankPage(cs, { headerText: header(), headerRight: '0/0', touchedIdx: touched, footer: [['BACK', '']] });
        if (!enumOverlayWouldDraw(cs, touched)) hdrPrint(Math.floor((128 - hdrWidth('NO PHRASES')) / 2), 36, 'NO PHRASES', 1);
        return;
    }
    if (!enumOverlayWouldDraw(cs, touched)) {
        const name = p.name;
        hdrPrint(Math.max(0, Math.floor((128 - hdrWidth(name)) / 2)), 34, name, 1);
        drawRoll(44, 8);
    }
    drawKitBankPage(cs, {
        headerText: header(), headerRight: (PB.idx + 1) + '/' + PB.list.length + (PB.hear ? '' : ' MUTE'),
        touchedIdx: touched, footer: footer(shift, touched),
    });
    if (panelOpen(touched)) drawSounds();
    else if (PB.picker && touched < 0) drawPicker();
}

/* The sounds panel: up while a drum track's sound pad is held, or a melodic
 * track's K5 Voice is touched. One row per sound: its name, where it goes, a
 * picture of its part; the one the pads set is highlighted. */
function panelOpen(touched) {
    if (!PB || PB.voices.length < 1) return false;
    return PB.drum ? PB.held >= 0 : touched === 4;
}
function drawSounds() {
    const X = PICK_X, Y = PICK_Y, W = PICK_W, H = MV_FOOTER_Y - 1 - PICK_Y;
    fill_rect(X, Y, W, H, 0);
    draw_rect(X, Y, W, H, 1);
    const hot = PB.drum ? PB.held : PB.voiceSel;
    const tm = timing(cur(), PB.time);
    const notes = decodePhrase(cur());
    const rowH = 7, top = Y + 3;
    PB.voices.forEach((v, i) => {
        const y = top + i * rowH, on = i === hot, c = on ? 0 : 1;
        if (on) fill_rect(X + 2, y - 1, W - 4, rowH, 1);
        mvPrint(X + 5, y, voiceLabel(i), c);
        const a = PB.assign[i];
        mvPrint(X + 36, y, a < 0 ? '--' : (PB.drum ? 'PAD ' + (a + 1) : noteName(a + 12 * PB.octave)), c);
        /* the part: a tick per hit across the phrase */
        const rx = X + 66, rw = W - 70;
        for (const n of notes) if (n.p === v.pitch) {
            const px = rx + Math.floor(Math.round(n.t * tm.f) * rw / tm.ticks);
            fill_rect(px, y + 1, 1, 3, c);
        }
    });
}

/* The phrase picker: the list floats over the page's body, between the header
 * and the footer, in the small movy font — several phrases at a time, the
 * selected one highlighted, its length in bars on the right. */
const PICK_X = 2, PICK_Y = 9, PICK_W = 124;
function drawPicker() {
    const h = MV_FOOTER_Y - 1 - PICK_Y;
    fill_rect(PICK_X, PICK_Y, PICK_W, h, 0);
    draw_rect(PICK_X, PICK_Y, PICK_W, h, 1);
    /* The small movy font (Josh, 2026-09-23: "phrases listed in movy font to
     * allow users to see more at a time"): six rows where the listing font fits four. */
    const rows = PB.list.map(p => ({ label: p.name, labelFont: 'small', value: p.bars + (p.bars > 1 ? ' BARS' : ' BAR') }));
    drawKitList(rows, PB.idx, { x: PICK_X + 1, w: PICK_W - 2, topY: PICK_Y + 3, h: h - 3, rowH: 7 });
}
