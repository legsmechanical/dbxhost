/* ui_audio.mjs — AUDIO, the UI half (the engine is dsp/seq8_audio.c).
 *
 * Audio is picked in Instmt/Dest like the Conductor (Josh, 2026-10-27: "audio
 * should be an instrument rather than type" · "it shouldn't have a track
 * type. just like conductor doesn't"): S.trackPadMode[t] === PAD_MODE_AUDIO,
 * melodic clips whose notes are SLICES (pitch 36 + slice). Each clip has its
 * own sample (copied into the project) and a Mode:
 *   - Loop: the clip plays the sample like a loop; the pads are jump points;
 *     the steps only show where it is (Q7: "just show playback").
 *   - Slice: up to 32 slices; all 32 pads are slices (left 4x4 = 1-16, right
 *     4x4 = 17-32); one sequence per clip, a step holds one slice.
 * The AUDIO editor (ui_audio_editor.mjs) holds the clip's audio settings at
 * the instrument door: "inst" ... "would take you an editor with all the
 * audio settings (mode, slicing, etc) while clip bank would have all the
 * sequence settings". Its pages and knobs live here.
 *
 * Values are the DSP's, read through tN_au_info_C / tN_au_sl_C_L / tN_au_all_C
 * and cached (a read costs a frame, so input handlers never read: they use
 * the cache and write; the tick refreshes what changed).
 *
 * No host_* call happens at module init. */

import { S } from './ui_state.mjs';
import { PAD_MODE_AUDIO, NUM_CLIPS } from './ui_constants.mjs';

export const AU_MODE_LOOP = 0, AU_MODE_SLICE = 1;
export const AU_METH_NAMES = ['Even', 'Manual', 'Lazy'];
export const AU_PLAY_NAMES = ['One', 'Gate', 'Loop'];
export const AU_JUMPS = [2, 4, 8, 16, 32];
export const AU_JMPQ_NAMES = ['Off', '1/16', '1/8', '1/4'];
export const AU_ERR_TEXT = ['', "Can't read file", 'Not WAV / AIFF', 'Too long', 'Out of memory', "Can't copy"];

export function isAudioTrack(t) {
    return t >= 0 && t < 8 && S.trackPadMode[t] === PAD_MODE_AUDIO;
}

/* The clip the AUDIO editor edits: the track's current clip (a queued one
 * while stopped, as everywhere in Track View). */
export function auClipOf(t) {
    const qc = S.trackQueuedClip[t];
    return (!S.playing && qc >= 0) ? qc : (S.trackActiveClip[t] | 0);
}

/* Slice mode on the track's current clip (the pads are slices). */
export function audioSliceMode(t) {
    return isAudioTrack(t) && auInfo(t, auClipOf(t)).mode === AU_MODE_SLICE;
}

/* The slice the SLICE n page edits: the last pad tapped while the editor is
 * up (or on the track at all — a pad tap is a pad tap). */
export function auSelSlice(t) { return S.auSelSlice[t] | 0; }
export function auSetSelSlice(t, k) { S.auSelSlice[t] = k; S.screenDirty = true; }

/* ---- the cache ---- */

const _sl = new Map();         /* "t_c_l" -> slice record */
const _all = new Map();        /* "t_c" -> ALL SLICES: 8 values, null where the slices differ */
const _peaks = new Map();      /* "t_c" -> { name, amp: [128 numbers 0..1] } */
const _stale = new Set();      /* "t_c" whose info must be re-read */
let _pos = { t: -1, on: 0, rel: 0, abs: 0, slice: -1 };
let _lazy = { on: 0, n: 0, pos: 0 };
let _padKey = '';

export function auParseInfo(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const bar = String(raw).indexOf('|');
    const head = (bar >= 0 ? String(raw).slice(0, bar) : String(raw)).trim().split(/\s+/).map((x) => parseInt(x, 10));
    if (head.length < 16 || head.some((x) => isNaN(x))) return null;
    return {
        state: head[0], err: head[1], mode: head[2], method: head[3], n: head[4], jump: head[5],
        rstart: head[6], rend: head[7], pitch: head[8], gain: head[9],
        nframes: head[10], rate: head[11], ch: head[12],
        revrs: head[13], nudge: head[14], jmpq: head[15],
        name: bar >= 0 ? String(raw).slice(bar + 1) : '',
    };
}

const DEFAULT_INFO = { state: 0, err: 0, mode: 0, method: 0, n: 8, jump: 16, rstart: 0, rend: 1000,
                       pitch: 0, gain: 0, nframes: 0, rate: 0, ch: 0, revrs: 0, nudge: 0, jmpq: 0, name: '' };
const DEFAULT_SLICE = { a: 0, b: 0, nudge: 0, len: 100, pitch: 0, gain: 0, rev: 0, play: 0, atk: 0, dec: 0 };

export function auInfo(t, c) {
    const i = S.auInfo[t] && S.auInfo[t][c];
    return i || DEFAULT_INFO;
}

/* Re-read clip (t,c) now (tick context only). */
export function auRead(t, c) {
    const i = auParseInfo(host_module_get_param('t' + t + '_au_info_' + c));
    if (i) {
        S.auInfo[t][c] = i;
        /* A clip with a sample has content (Session View, launching). */
        if (i.name && S.clipNonEmpty && S.clipNonEmpty[t]) S.clipNonEmpty[t][c] = true;
    }
    _stale.delete(t + '_' + c);
    return i;
}

export function auMarkStale(t, c) {
    _stale.add(t + '_' + c);
    _all.delete(t + '_' + c);
    for (const k of _sl.keys()) if (k.startsWith(t + '_' + c + '_')) _sl.delete(k);
}

export function auSlice(t, c, l) {
    return _sl.get(t + '_' + c + '_' + l) || null;
}
function auReadSlice(t, c, l) {
    const raw = host_module_get_param('t' + t + '_au_sl_' + c + '_' + l);
    const v = String(raw || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
    if (v.length < 10 || v.some((x) => isNaN(x))) return null;
    const r = { a: v[0], b: v[1], nudge: v[2], len: v[3], pitch: v[4], gain: v[5], rev: v[6], play: v[7], atk: v[8], dec: v[9] };
    _sl.set(t + '_' + c + '_' + l, r);
    return r;
}
/* ALL SLICES: the eight SLICE fields in page order, each a number or null. */
export const ALL_FIELDS = ['nudge', 'len', 'pitch', 'gain', 'rev', 'atk', 'dec', 'play'];
export function auAll(t, c) { return _all.get(t + '_' + c) || null; }
function auReadAll(t, c) {
    const v = String(host_module_get_param('t' + t + '_au_all_' + c) || '').trim().split(/\s+/);
    if (v.length < 8) return null;
    const r = v.slice(0, 8).map((x) => (x === 'x' ? null : parseInt(x, 10)));
    _all.set(t + '_' + c, r);
    return r;
}

/* Waveform: 128 columns as 0..1 amplitudes. */
export function auPeaks(t, c) {
    const p = _peaks.get(t + '_' + c);
    const i = auInfo(t, c);
    return p && p.name === i.name && p.nframes === i.nframes ? p.amp : null;
}
function auReadPeaks(t, c) {
    const raw = String(host_module_get_param('t' + t + '_au_peaks_' + c) || '');
    if (raw.length < 512) { _peaks.delete(t + '_' + c); return; }
    const amp = [];
    for (let k = 0; k < 128; k++) {
        let lo = parseInt(raw.substr(k * 4, 2), 16), hi = parseInt(raw.substr(k * 4 + 2, 2), 16);
        if (lo > 127) lo -= 256;
        if (hi > 127) hi -= 256;
        amp.push(Math.min(1, Math.max(Math.abs(lo), Math.abs(hi)) / 127));
    }
    const i = auInfo(t, c);
    _peaks.set(t + '_' + c, { name: i.name, nframes: i.nframes, amp });
}

export function auStarts(t, c) {
    const raw = String(host_module_get_param('t' + t + '_au_starts_' + c) || '').trim();
    return raw ? raw.split(/\s+/).map((x) => parseInt(x, 10) / 1000) : [];
}
let _startsCache = { key: '', v: [] };
export function auStartsCached(t, c) {
    const i = auInfo(t, c);
    const key = t + '_' + c + '_' + i.name + '_' + i.n + '_' + i.method + '_' + i.rstart + '_' + i.rend + '_' + (S.auStartsRev | 0);
    if (_startsCache.key !== key) _startsCache = { key, v: auStarts(t, c) };
    return _startsCache.v;
}

export function auPos() { return _pos; }
export function auLazy() { return _lazy; }

/* Tick: keep the active Audio track's current clip fresh — a loading clip
 * until it lands, a stale one at once, the playhead every few ticks. */
export function auTick() {
    const t = S.activeTrack;
    if (!isAudioTrack(t)) { _pos.on = 0; return; }
    const c = auClipOf(t);
    const key = t + '_' + c;
    const i = S.auInfo[t][c];
    /* ...and every ~0.3 s regardless: the engine is the one writer, and a
     * change that did not come through this UI (an undo, a remote edit) must
     * not leave the pads in the wrong layout. */
    if (!i || _stale.has(key) || (i.state === 1 && (S.tickCount % 8) === 0) || (S.tickCount % 30) === 0) {
        const was = i ? i.state : -1;
        const n = auRead(t, c);
        if (n && n.state !== was) S.screenDirty = true;
    }
    const cur = auInfo(t, c);
    /* The pads follow the clip's Mode (slices / jump points). */
    const pk = t + '_' + c + '_' + cur.mode + '_' + cur.n + '_' + (S.auEditor && S.auEditor.lazy ? 1 : 0);
    if (pk !== _padKey) { _padKey = pk; S.pendingPadNoteMapRecompute = true; S.ledsDirtyAudio = true; }
    if (cur.state === 2 && !auPeaks(t, c) && (S.tickCount % 8) === 0) { auReadPeaks(t, c); S.screenDirty = true; }
    const ed = S.auPanel;
    if ((ed && ed.t === t) || S.auEditor) {
        const l = auSelSlice(t);
        if (!auSlice(t, c, l)) { auReadSlice(t, c, l); S.screenDirty = true; }
        if (ed && auPanelPageName(ed) === 'ALL SLICES' && !auAll(t, c)) { auReadAll(t, c); S.screenDirty = true; }
    }
    if ((S.tickCount % 3) === 0) {
        const raw = String(host_module_get_param('t' + t + '_au_pos') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
        const np = { t, on: raw[0] | 0, rel: (raw[1] | 0) / 1000, abs: (raw[2] | 0) / 1000, slice: isNaN(raw[3]) ? -1 : raw[3] };
        if (np.on !== _pos.on || np.rel !== _pos.rel || np.slice !== _pos.slice) { S.screenDirty = true; S.ledsDirtyAudio = true; }
        _pos = np;
        if (S.auEditor && S.auEditor.lazy) {
            const lz = String(host_module_get_param('t' + t + '_au_lazy') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
            const nl = { on: lz[0] | 0, n: lz[1] | 0, pos: (lz[2] | 0) / 1000 };
            if (nl.on !== _lazy.on || nl.n !== _lazy.n) { S.auStartsRev = (S.auStartsRev | 0) + 1; auMarkStale(t, c); }
            _lazy = nl;
            /* The chop is running once the engine says so; it is over when the
             * engine stops (the sample ended) — or if it never started. */
            const se = S.auEditor;
            if (nl.on) se.lazySeen = true;
            else if (se.lazySeen || S.clockMs - (se.lazyAt || 0) > 1500) {
                se.lazy = false; se.lazySeen = false; auMarkStale(t, c);
                S.pendingPadNoteMapRecompute = true;
            }
            S.screenDirty = true;
        }
    }
}

/* Every clip of track t, re-read (a project load, a conversion). */
export function auReadTrack(t) {
    for (let c = 0; c < NUM_CLIPS; c++) auRead(t, c);
}
/* A track that is no longer Audio forgets its clips. */
export function auForgetTrack(t) {
    for (let c = 0; c < NUM_CLIPS; c++) { S.auInfo[t][c] = null; auMarkStale(t, c); }
}

/* Session View / clip content: a clip with a sample has content. */
export function auClipHasSample(t, c) {
    const i = S.auInfo[t] && S.auInfo[t][c];
    return !!(i && i.name);
}

/* ---- writes (any context) ---- */

function setKey(t, sub, val) { host_module_set_param('t' + t + '_au_' + sub, String(val)); }

export function auPick(t, c, path) {
    setKey(t, 'pick', c + '|' + path);
    S.auInfo[t][c] = Object.assign({}, auInfo(t, c), { state: 1, err: 0, name: '' });
    auMarkStale(t, c);
}

export function auClear(t, c) {
    setKey(t, 'clear', c);
    S.auInfo[t][c] = Object.assign({}, auInfo(t, c), { state: 0, name: '', nframes: 0 });
    auMarkStale(t, c);
}

/* A key per field (see the engine): two fields on one key in one frame keep
 * only the second. */
function auSet(t, c, field, v) {
    setKey(t, 'set_' + field, c + ' ' + v);
    auMarkStale(t, c);
}
function auSetSlice(t, c, l, field, v) {
    setKey(t, 'slice_' + field, c + ' ' + l + ' ' + v);
    _sl.delete(t + '_' + c + '_' + l);
    _all.delete(t + '_' + c);
    _stale.add(t + '_' + c);
}
function auSetAll(t, c, field, v) {
    setKey(t, 'all_' + field, c + ' ' + v);
    for (const k of _sl.keys()) if (k.startsWith(t + '_' + c + '_')) _sl.delete(k);
    _stale.add(t + '_' + c);
}

export function auChop(t, c) { setKey(t, 'chop', c); auMarkStale(t, c); }
/* A press and its release are two keys: one key written twice before it drains
 * keeps only the second, and a quick tap would never jump. */
export function auJump(t, k, down) { setKey(t, down ? 'jump' : 'jump_off', k); }
export function auLazyStart(t, c) { setKey(t, 'lazy', c + ' 1'); }
export function auLazyStop(t, c) { setKey(t, 'lazy', c + ' 0'); auMarkStale(t, c); }
export function auLazyTap(t) { setKey(t, 'lazy_tap', 1); }
export function auSlicePos(t, c, l, frame) { auSetSlice(t, c, l, 'pos', frame); }

/* ---- formatting ---- */

function shortName(name) {
    const n = String(name || '').replace(/\.(wav|aif|aiff)$/i, '');
    return n.length > 14 ? n.slice(0, 13) + '~' : n;
}
/* "Missing: <name>" when the project's copy is gone (v1 default, Josh
 * 2026-10-27: "all sounds good"). */
export function auSampleName(t, c) {
    const i = auInfo(t, c);
    if (i.state === 1) return 'Loading...';
    if (i.state === 3) return i.err === 1 && i.name ? 'Missing: ' + shortName(i.name) : (AU_ERR_TEXT[i.err] || 'Failed');
    return i.name ? shortName(i.name) : 'No sample';
}
const fmtSemi = (v) => (v === 0 ? '0 st' : (v > 0 ? '+' : '') + v + ' st');
const fmtDb = (v) => (v === 0 ? '0 dB' : (v > 0 ? '+' : '') + v + ' dB');
const fmtPct = (v) => (v / 10).toFixed(1) + '%';
const fmtMs = (v) => (v > 0 ? '+' : '') + v + 'ms';

/* ---- the AUDIO editor's pages ---- */

/* Slice mode: CLIP, SLICING, SLICE n, ALL SLICES. Loop mode: CLIP, SLICING
 * (Jump, Revrs, Nudge, JmpQ). */
export function auPanelPages(t) {
    return auInfo(t, auClipOf(t)).mode === AU_MODE_SLICE ? ['CLIP', 'SLICING', 'SLICE', 'ALL SLICES'] : ['CLIP', 'SLICING'];
}
export function auPanelPageName(ed) {
    const p = auPanelPages(ed.t);
    return p[Math.min(ed.page | 0, p.length - 1)];
}
export function auPanelTitle(ed) {
    const name = auPanelPageName(ed);
    if (name === 'SLICE') return 'SLICE ' + (auSelSlice(ed.t) + 1) + '/' + auInfo(ed.t, auClipOf(ed.t)).n;
    return name;
}

const dash = (x) => Object.assign({}, x, { text: '--' });
const BLANK = { kind: 'blank', label: '' };

function loopCells(i) {
    return [
        { kind: 'enumsq', label: 'Revrs', name: 'Reverse', text: i.revrs ? 'On' : 'Off', options: ['Off', 'On'], sel: i.revrs },
        { kind: 'arcbip', label: 'Nudge', name: 'Nudge (start vs the bar)', text: fmtMs(i.nudge), signed: i.nudge / 500 },
        { kind: 'enumsq', label: 'JmpQ', name: 'Jump Quantize', text: AU_JMPQ_NAMES[i.jmpq] || 'Off',
          options: AU_JMPQ_NAMES, sel: i.jmpq },
    ];
}

export function auPanelCells(ed) {
    const t = ed.t, c = auClipOf(t), i = auInfo(t, c);
    const has = i.state === 2;
    const page = auPanelPageName(ed);
    if (page === 'CLIP') {
        const smpl = { kind: 'action', oneWay: true, label: 'Smpl', name: 'Sample: ' + auSampleName(t, c), text: '->', opens: true };
        const mode = { kind: 'enumsq', label: 'Mode', name: 'Mode', text: i.mode ? 'Slice' : 'Loop',
                       sq: i.mode ? 'Slce' : 'Loop', options: ['Loop', 'Slice'], sel: i.mode };
        const start = { kind: 'arc', label: 'Start', name: 'Start  ' + fmtPct(i.rstart), text: fmtPct(i.rstart), norm: i.rstart / 1000 };
        const end = { kind: 'arc', label: 'End', name: 'End  ' + fmtPct(i.rend), text: fmtPct(i.rend), norm: i.rend / 1000 };
        const pitch = { kind: 'arcbip', label: 'Pitch', name: 'Pitch', text: fmtSemi(i.pitch), signed: i.pitch / 24 };
        const gain = { kind: 'arc', label: 'Gain', name: 'Gain', text: fmtDb(i.gain), norm: (i.gain + 40) / 52 };
        const count = i.mode === AU_MODE_SLICE
            ? { kind: 'valsq', label: 'Slices', name: 'Slices (' + AU_METH_NAMES[i.method] + ')', text: String(i.n) }
            : { kind: 'valsq', label: 'Jump', name: 'Jump Points', text: String(i.jump) };
        const chop = i.mode === AU_MODE_SLICE
            ? { kind: 'action', oneWay: true, label: 'Chop', name: 'Chop to Steps', text: '->', opens: true }
            : BLANK;
        return [smpl, mode, start, end, pitch, gain, count, chop].map((x) => (has || x === smpl || x === mode || x === BLANK) ? x : dash(x));
    }
    if (page === 'SLICING') {
        if (i.mode !== AU_MODE_SLICE) {
            const jump = { kind: 'valsq', label: 'Jump', name: 'Jump Points', text: String(i.jump) };
            return [jump].concat(loopCells(i), [BLANK, BLANK, BLANK, BLANK]).map((x) => (has || x === BLANK) ? x : dash(x));
        }
        return [
            { kind: 'enumsq', label: 'Meth', name: 'Slicing Method', text: AU_METH_NAMES[i.method], options: AU_METH_NAMES, sel: i.method },
            { kind: 'valsq', label: 'Slices', name: 'Slices', text: String(i.n) },
            { kind: 'action', oneWay: true, label: 'Edit', name: 'Slice Editor', text: '->', opens: true },
            { kind: 'action', oneWay: true, label: 'Lazy', name: 'Lazy Chop', text: '->', opens: true },
            BLANK, BLANK, BLANK, BLANK,
        ].map((x) => (has || x === BLANK) ? x : dash(x));
    }
    const sliceCells = (r) => [
        { kind: 'arcbip', label: 'Start', name: 'Slice Start (nudge)', text: r.nudge == null ? '--' : fmtMs(r.nudge), signed: (r.nudge | 0) / 500 },
        { kind: 'arc', label: 'Len', name: 'Slice Length', text: r.len == null ? '--' : r.len + '%', norm: (r.len == null ? 100 : r.len) / 100 },
        { kind: 'arcbip', label: 'Pitch', name: 'Slice Pitch', text: r.pitch == null ? '--' : fmtSemi(r.pitch), signed: (r.pitch | 0) / 24 },
        { kind: 'arc', label: 'Gain', name: 'Slice Gain', text: r.gain == null ? '--' : fmtDb(r.gain), norm: ((r.gain | 0) + 40) / 52 },
        { kind: 'enumsq', label: 'Revrs', name: 'Reverse', text: r.rev == null ? '--' : (r.rev ? 'On' : 'Off'), options: ['Off', 'On'], sel: r.rev | 0 },
        { kind: 'arc', label: 'Attk', name: 'Attack', text: r.atk == null ? '--' : r.atk + 'ms', norm: Math.min(1, (r.atk | 0) / 2000) },
        { kind: 'arc', label: 'Decay', name: 'Decay', text: r.dec == null ? '--' : (r.dec ? r.dec + 'ms' : 'Full'),
          norm: r.dec ? Math.min(1, r.dec / 5000) : 1 },
        { kind: 'enumsq', label: 'Play', name: 'Play Mode', text: r.play == null ? '--' : AU_PLAY_NAMES[r.play], options: AU_PLAY_NAMES, sel: r.play | 0 },
    ];
    if (page === 'SLICE') {
        const l = auSelSlice(t);
        const cells = sliceCells(auSlice(t, c, l) || DEFAULT_SLICE);
        return (!has || l >= i.n) ? cells.map(dash) : cells;
    }
    /* ALL SLICES: the value every slice shares; `--` while they differ (a turn
     * sets them all, starting from slice 1's). */
    const a = auAll(t, c);
    const r = {};
    ALL_FIELDS.forEach((f, k) => { r[f] = a ? a[k] : null; });
    const cells = sliceCells(r);
    return has ? cells : cells.map(dash);
}

/* Knobs that pick (one step per detent) rather than sweep. */
export function auPanelKnobDeliberate(ed, k) {
    const page = auPanelPageName(ed);
    if (page === 'CLIP') return k === 1;
    if (page === 'SLICING') return auInfo(ed.t, auClipOf(ed.t)).mode === AU_MODE_SLICE ? k === 0 : (k === 1 || k === 3);
    return k === 4 || k === 7;
}

/* One field stepped: the next value, clamped. */
function stepSliceField(f, v, steps) {
    const dir = steps > 0 ? 1 : -1;
    if (f === 'nudge') return Math.max(-500, Math.min(500, v + steps * (S.shiftHeld ? 1 : 5)));
    if (f === 'len') return Math.max(1, Math.min(100, v + steps));
    if (f === 'pitch') return Math.max(-24, Math.min(24, v + dir));
    if (f === 'gain') return Math.max(-40, Math.min(12, v + dir));
    if (f === 'rev') return dir > 0 ? 1 : 0;
    if (f === 'play') return Math.max(0, Math.min(2, v + dir));
    if (f === 'atk') return Math.max(0, Math.min(2000, v + steps * (v < 100 ? 2 : 20)));
    if (f === 'dec') return Math.max(0, Math.min(5000, v + steps * (v < 200 ? 5 : 50)));
    return v;
}

/* Loop knobs (the SLICING page in Loop mode, the CLIP bank in Loop mode):
 * 0 Revrs, 1 Nudge, 2 JmpQ. */
export function auLoopKnob(t, k, steps) {
    const c = auClipOf(t), i = auInfo(t, c);
    if (i.state !== 2) return false;
    const dir = steps > 0 ? 1 : -1;
    const loc = Object.assign({}, i);
    if (k === 0) {
        const v = dir > 0 ? 1 : 0;
        if (v === i.revrs) return false;
        loc.revrs = v; auSet(t, c, 'revrs', v);
    } else if (k === 1) {
        const v = Math.max(-500, Math.min(500, i.nudge + steps * (S.shiftHeld ? 1 : 5)));
        if (v === i.nudge) return false;
        loc.nudge = v; auSet(t, c, 'nudge', v);
    } else if (k === 2) {
        const v = Math.max(0, Math.min(3, i.jmpq + dir));
        if (v === i.jmpq) return false;
        loc.jmpq = v; auSet(t, c, 'jmpq', v);
    } else return false;
    S.auInfo[t][c] = loc;
    return true;
}

/* One knob step on the AUDIO editor. Returns true when something changed. */
export function auPanelKnob(ed, k, steps) {
    const t = ed.t, c = auClipOf(t), i = auInfo(t, c);
    const dir = steps > 0 ? 1 : -1;
    const page = auPanelPageName(ed);
    const loc = Object.assign({}, i);
    if (page === 'CLIP') {
        if (k === 1) {
            const m = Math.max(0, Math.min(1, i.mode + dir));
            if (m === i.mode) return false;
            loc.mode = m; auSet(t, c, 'mode', m);
            ed.page = 0;
        } else if (i.state !== 2) {
            return false;
        } else if (k === 2) {
            const v = Math.max(0, Math.min(i.rend - 1, i.rstart + steps * (S.shiftHeld ? 1 : 5)));
            if (v === i.rstart) return false;
            loc.rstart = v; auSet(t, c, 'start', v);
        } else if (k === 3) {
            const v = Math.max(i.rstart + 1, Math.min(1000, i.rend + steps * (S.shiftHeld ? 1 : 5)));
            if (v === i.rend) return false;
            loc.rend = v; auSet(t, c, 'end', v);
        } else if (k === 4) {
            const v = Math.max(-24, Math.min(24, i.pitch + dir));
            if (v === i.pitch) return false;
            loc.pitch = v; auSet(t, c, 'pitch', v);
        } else if (k === 5) {
            const v = Math.max(-40, Math.min(12, i.gain + dir));
            if (v === i.gain) return false;
            loc.gain = v; auSet(t, c, 'gain', v);
        } else if (k === 6) {
            return auCountKnob(t, c, i, loc, dir);
        } else return false;
    } else if (page === 'SLICING') {
        if (i.state !== 2) return false;
        if (i.mode !== AU_MODE_SLICE) {
            if (k === 0) return auCountKnob(t, c, i, loc, dir);
            return auLoopKnob(t, k - 1, steps);
        }
        if (k === 0) {
            /* Even re-cuts the slices evenly; Manual and Lazy keep the starts
             * as they are, to move by hand (Josh, device: "slicing method
             * can't be changed once it's on even"). */
            const m = Math.max(0, Math.min(2, i.method + dir));
            if (m === i.method) return false;
            loc.method = m; auSet(t, c, 'method', m);
        } else if (k === 1) {
            return auCountKnob(t, c, i, loc, dir);
        } else return false;
    } else if (page === 'SLICE') {
        const l = auSelSlice(t);
        if (i.state !== 2 || l >= i.n) return false;
        const r = Object.assign({}, DEFAULT_SLICE, auSlice(t, c, l) || {});
        const f = ALL_FIELDS[k];
        const v = stepSliceField(f, r[f], steps);
        if (v === r[f]) return false;
        r[f] = v;
        auSetSlice(t, c, l, f, v);
        _sl.set(t + '_' + c + '_' + l, r);
        return true;
    } else {
        if (i.state !== 2) return false;
        const a = auAll(t, c) || [];
        const f = ALL_FIELDS[k];
        let base = a[k];
        if (base == null) {
            const s1 = auSlice(t, c, 0);
            base = s1 ? s1[f] : DEFAULT_SLICE[f];
        }
        const v = stepSliceField(f, base, steps);
        if (v === a[k]) return false;
        auSetAll(t, c, f, v);
        const na = a.length ? a.slice() : new Array(8).fill(null);
        na[k] = v;
        _all.set(t + '_' + c, na);
        return true;
    }
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    return true;
}

/* Slices (Slice mode, an Even re-cut) or Jump points (Loop mode). */
function auCountKnob(t, c, i, loc, dir) {
    if (i.mode === AU_MODE_SLICE) {
        const v = Math.max(1, Math.min(32, i.n + dir));
        if (v === i.n) return false;
        loc.n = v; loc.method = 0; auSet(t, c, 'slices', v);
    } else {
        const j = Math.max(0, Math.min(AU_JUMPS.length - 1, AU_JUMPS.indexOf(i.jump) + dir));
        if (AU_JUMPS[j] === i.jump) return false;
        loc.jump = AU_JUMPS[j]; auSet(t, c, 'jump', loc.jump);
    }
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    return true;
}

/* ---- the CLIP bank in Loop mode (Josh, 2026-10-27: "i can see clip mode
 * being empty in loop mode unless we want to add reverse or stuff like that
 * (which might be cool)" -> Revrs · Nudge · JmpQ). ---- */
export function auLoopBankCells(t) {
    const i = auInfo(t, auClipOf(t));
    const cells = loopCells(i).concat([BLANK, BLANK, BLANK, BLANK, BLANK]);
    return i.state === 2 ? cells : cells.map((x) => (x === BLANK ? x : dash(x)));
}

/* ---- pads ---- */

/* Slice mode: left 4x4 = slices 1-16, right 4x4 = 17-32 (row by row from the
 * bottom within each half). */
export function auPadToSlice(padIdx) {
    const col = padIdx % 8, row = Math.floor(padIdx / 8);
    return col < 4 ? row * 4 + col : 16 + row * 4 + (col - 4);
}
/* Loop mode: jump point k under a pad — row by row from the bottom-left, 8
 * per row; -1 past the clip's Jump count. */
export function auPadToJump(t, padIdx) {
    const i = auInfo(t, auClipOf(t));
    if (i.mode !== AU_MODE_LOOP) return -1;
    return padIdx < i.jump ? padIdx : -1;
}
/* The jump point the playhead is in (Loop mode), or -1. */
export function auPlayheadJump(t) {
    const i = auInfo(t, auClipOf(t));
    if (_pos.t !== t || !_pos.on || i.mode !== AU_MODE_LOOP) return -1;
    const rel = i.revrs ? 1 - _pos.rel : _pos.rel;
    return Math.max(0, Math.min(i.jump - 1, Math.floor(rel * i.jump)));
}

/* ---- the waveform ---- */

/* Columns 0..1 for a w-pixel span of the sample from `a` to `b` (fractions). */
export function auWaveColumns(t, c, w, a, b) {
    const amp = auPeaks(t, c);
    if (!amp) return null;
    const out = [];
    for (let x = 0; x < w; x++) {
        const f0 = a + (b - a) * x / w, f1 = a + (b - a) * (x + 1) / w;
        const i0 = Math.floor(f0 * 128), i1 = Math.max(i0 + 1, Math.ceil(f1 * 128));
        let m = 0;
        for (let k = i0; k < i1 && k < 128; k++) if (amp[k] > m) m = amp[k];
        out.push(m);
    }
    return out;
}
