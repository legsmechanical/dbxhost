/* ui_audio.mjs — AUDIO TRACKS, the UI half (the engine is dsp/seq8_audio.c).
 *
 * An Audio track is a DRUM track (S.trackPadMode stays PAD_MODE_DRUM, so every
 * lane / step / FX screen keeps working) with S.trackAudio[t] set: its lanes
 * play SLICES of each clip's sample. Each clip has:
 *   - its own sample (picked in the chooser, copied into the project),
 *   - a Mode: Loop (plays like a loop; pads jump) or Slice (up to 32 slices,
 *     one per lane; all 32 pads are slices: left 4x4 = 1-16, right 4x4 = 17-32).
 * Two banks: SAMPLE (per clip) and SLICE (the selected slice = the selected
 * lane). Values are the DSP's, read through tN_au_info_C / tN_au_sl_C_L and
 * cached here (a read costs a frame, so input handlers never read: they use
 * the cache and write; the tick refreshes what changed).
 *
 * No host_* call happens at module init. */

import { S } from './ui_state.mjs';
import { PAD_MODE_DRUM, NUM_CLIPS } from './ui_constants.mjs';

export const AU_MODE_LOOP = 0, AU_MODE_SLICE = 1;
export const AU_METH_NAMES = ['Even', 'Manual', 'Lazy'];
export const AU_PLAY_NAMES = ['One', 'Gate', 'Loop'];
export const AU_JUMPS = [2, 4, 8, 16, 32];
export const AU_ERR_TEXT = ['', "Can't read file", 'Not WAV / AIFF', 'Too long', 'Out of memory', "Can't copy"];

/* Bank indices — after CONFIG (16). Stubs in BANKS; this module owns them. */
export const BANK_SAMPLE = 17;
export const BANK_SLICE = 18;

export function isAudioTrack(t) {
    return t >= 0 && t < 8 && !!S.trackAudio[t] && S.trackPadMode[t] === PAD_MODE_DRUM;
}

/* The clip the SAMPLE bank edits: the track's current clip (a queued one
 * while stopped, as everywhere in Track View). */
export function auClipOf(t) {
    const qc = S.trackQueuedClip[t];
    return (!S.playing && qc >= 0) ? qc : (S.trackActiveClip[t] | 0);
}

/* ---- the cache ---- */

const _sl = new Map();         /* "t_c_l" -> slice record */
const _peaks = new Map();      /* "t_c" -> { name, amp: [128 numbers 0..1] } */
const _stale = new Set();      /* "t_c" whose info must be re-read */
let _pos = { t: -1, on: 0, rel: 0, abs: 0, lane: -1 };
let _lazy = { on: 0, n: 0, pos: 0 };
let _padKey = '';

export function auParseInfo(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const bar = String(raw).indexOf('|');
    const head = (bar >= 0 ? String(raw).slice(0, bar) : String(raw)).trim().split(/\s+/).map((x) => parseInt(x, 10));
    if (head.length < 13 || head.some((x) => isNaN(x))) return null;
    return {
        state: head[0], err: head[1], mode: head[2], method: head[3], n: head[4], jump: head[5],
        rstart: head[6], rend: head[7], pitch: head[8], gain: head[9],
        nframes: head[10], rate: head[11], ch: head[12],
        name: bar >= 0 ? String(raw).slice(bar + 1) : '',
    };
}

const DEFAULT_INFO = { state: 0, err: 0, mode: 0, method: 0, n: 8, jump: 16, rstart: 0, rend: 1000,
                       pitch: 0, gain: 0, nframes: 0, rate: 0, ch: 0, name: '' };

export function auInfo(t, c) {
    const i = S.auInfo[t] && S.auInfo[t][c];
    return i || DEFAULT_INFO;
}

/* Re-read clip (t,c) now (tick context only). */
export function auRead(t, c) {
    const i = auParseInfo(host_module_get_param('t' + t + '_au_info_' + c));
    if (i) {
        S.auInfo[t][c] = i;
        /* A clip with a sample has content (Session View, the overview). */
        if (i.name && S.drumClipNonEmpty && S.drumClipNonEmpty[t]) S.drumClipNonEmpty[t][c] = true;
    }
    _stale.delete(t + '_' + c);
    return i;
}

export function auMarkStale(t, c) { _stale.add(t + '_' + c); for (const k of _sl.keys()) if (k.startsWith(t + '_' + c + '_')) _sl.delete(k); }

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
    const pk = t + '_' + c + '_' + cur.mode;
    if (pk !== _padKey) { _padKey = pk; S.pendingPadNoteMapRecompute = true; S.ledsDirtyAudio = true; }
    if (cur.state === 2 && !auPeaks(t, c) && (S.tickCount % 8) === 0) { auReadPeaks(t, c); S.screenDirty = true; }
    if (S.activeBank === BANK_SLICE || S.auEditor) {
        const l = S.auEditor ? S.auEditor.sel : (S.activeDrumLane[t] | 0);
        if (!auSlice(t, c, l)) auReadSlice(t, c, l);
    }
    if ((S.tickCount % 3) === 0) {
        const raw = String(host_module_get_param('t' + t + '_au_pos') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
        const np = { t, on: raw[0] | 0, rel: (raw[1] | 0) / 1000, abs: (raw[2] | 0) / 1000, lane: isNaN(raw[3]) ? -1 : raw[3] };
        if (np.on !== _pos.on || np.rel !== _pos.rel || np.lane !== _pos.lane) S.screenDirty = true;
        _pos = np;
        if (S.auEditor && S.auEditor.lazy) {
            const lz = String(host_module_get_param('t' + t + '_au_lazy') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
            const nl = { on: lz[0] | 0, n: lz[1] | 0, pos: (lz[2] | 0) / 1000 };
            if (nl.on !== _lazy.on || nl.n !== _lazy.n) { S.auStartsRev = (S.auStartsRev | 0) + 1; auMarkStale(t, c); }
            _lazy = nl;
            /* The chop is running once the engine says so; it is over when the
             * engine stops (the sample ended) — or if it never started. */
            const ed = S.auEditor;
            if (nl.on) ed.lazySeen = true;
            else if (ed.lazySeen || S.clockMs - (ed.lazyAt || 0) > 1500) {
                ed.lazy = false; ed.lazySeen = false; auMarkStale(t, c);
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

/* Session View / clip content: a clip with a sample has content. */
export function auClipHasSample(t, c) {
    const i = S.auInfo[t] && S.auInfo[t][c];
    return !!(i && i.name);
}

/* ---- writes (any context) ---- */

function setKey(t, sub, val) { host_module_set_param('t' + t + '_au_' + sub, String(val)); }

export function auSetTrackAudio(t, on) {
    setKey(t, 'on', on ? 1 : 0);
    S.trackAudio[t] = on ? 1 : 0;
    /* The engine gives every lane its own note on the way in (a slice per
     * lane, found by note): the mirror follows. */
    if (on && S.drumLaneNote && S.drumLaneNote[t]) for (let l = 0; l < 32; l++) S.drumLaneNote[t][l] = 36 + l;
    for (let c = 0; c < NUM_CLIPS; c++) { S.auInfo[t][c] = null; auMarkStale(t, c); }
}

export function auPick(t, c, path) {
    setKey(t, 'pick', c + '|' + path);
    const i = Object.assign({}, auInfo(t, c), { state: 1, err: 0, name: '' });
    S.auInfo[t][c] = i;
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
    auMarkStale(t, c);
}

export function auChop(t, c) { setKey(t, 'chop', c); auMarkStale(t, c); S.pendingDrumResync = 2; }
/* A press and its release are two keys: one key written twice before it drains
 * keeps only the second, and a quick tap would never jump. */
export function auJump(t, k, down) { setKey(t, down ? 'jump' : 'jump_off', k); }
export function auLazyStart(t, c) { setKey(t, 'lazy', c + ' 1'); }
export function auLazyStop(t, c) { setKey(t, 'lazy', c + ' 0'); auMarkStale(t, c); }
export function auLazyTap(t) { setKey(t, 'lazy_tap', 1); }
export function auSlicePos(t, c, l, frame) { auSetSlice(t, c, l, 'pos', frame); }

/* ---- the SAMPLE bank ---- */

function shortName(name) {
    let n = String(name || '').replace(/\.(wav|aif|aiff)$/i, '');
    return n.length > 14 ? n.slice(0, 13) + '~' : n;
}
export function auSampleName(t, c) {
    const i = auInfo(t, c);
    if (i.state === 1) return 'Loading...';
    if (i.state === 3) return AU_ERR_TEXT[i.err] || 'Failed';
    return i.name ? shortName(i.name) : 'No sample';
}
const fmtSemi = (v) => (v === 0 ? '0 st' : (v > 0 ? '+' : '') + v + ' st');
const fmtDb = (v) => (v === 0 ? '0 dB' : (v > 0 ? '+' : '') + v + ' dB');
const fmtPct = (v) => (v / 10).toFixed(1) + '%';
function fmtSecs(nframes, rate) {
    if (!rate) return '--';
    const s = nframes / rate;
    return s >= 60 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : s.toFixed(1) + 's';
}

export function auSampleCells(t) {
    const c = auClipOf(t), i = auInfo(t, c);
    const has = i.state === 2;
    const smpl = { kind: 'action', oneWay: true, label: 'Smpl', name: 'Sample: ' + auSampleName(t, c), text: '->', opens: true };
    const mode = { kind: 'enumsq', label: 'Mode', name: 'Mode', text: i.mode ? 'Slice' : 'Loop',
                   sq: i.mode ? 'Slce' : 'Loop', options: ['Loop', 'Slice'], sel: i.mode };
    const start = { kind: 'arc', label: 'Start', name: 'Start  ' + fmtPct(i.rstart), text: fmtPct(i.rstart), norm: i.rstart / 1000 };
    const end = { kind: 'arc', label: 'End', name: 'End  ' + fmtPct(i.rend), text: fmtPct(i.rend), norm: i.rend / 1000 };
    const pitch = { kind: 'arcbip', label: 'Pitch', name: 'Pitch', text: fmtSemi(i.pitch), signed: i.pitch / 24 };
    const gain = { kind: 'arc', label: 'Gain', name: 'Gain', text: fmtDb(i.gain), norm: (i.gain + 40) / 52 };
    if (i.mode === AU_MODE_SLICE) {
        const sl = { kind: 'valsq', label: 'Slice', name: 'Slices (' + AU_METH_NAMES[i.method] + ')  click: edit', text: String(i.n), opens: true };
        const chop = { kind: 'action', oneWay: true, label: 'Chop', name: 'Chop to Steps', text: '->', opens: true };
        return [smpl, mode, start, end, sl, chop, pitch, gain].map((x) => (has || x === smpl || x === mode) ? x : Object.assign({}, x, { text: '--' }));
    }
    const jump = { kind: 'valsq', label: 'Jump', name: 'Jump Points', text: String(i.jump) };
    const len = { kind: 'valsq', label: 'Len', name: 'Sample Length', text: fmtSecs(i.nframes, i.rate) };
    return [smpl, mode, start, end, jump, len, pitch, gain].map((x) => (has || x === smpl || x === mode) ? x : Object.assign({}, x, { text: '--' }));
}

/* One knob step on the SAMPLE bank. Returns true when something changed. */
export function auSampleKnob(t, k, steps) {
    const c = auClipOf(t), i = auInfo(t, c);
    const dir = steps > 0 ? 1 : -1;
    const loc = Object.assign({}, i);
    if (k === 1) {
        const m = Math.max(0, Math.min(1, i.mode + dir));
        if (m === i.mode) return false;
        loc.mode = m; auSet(t, c, 'mode', m);
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
    } else if (k === 4 && i.mode === AU_MODE_SLICE) {
        const v = Math.max(1, Math.min(32, i.n + dir));
        if (v === i.n) return false;
        loc.n = v; loc.method = 0; auSet(t, c, 'slices', v);
    } else if (k === 4) {
        const j = Math.max(0, Math.min(AU_JUMPS.length - 1, AU_JUMPS.indexOf(i.jump) + dir));
        if (AU_JUMPS[j] === i.jump) return false;
        loc.jump = AU_JUMPS[j]; auSet(t, c, 'jump', loc.jump);
    } else if (k === 6) {
        const v = Math.max(-24, Math.min(24, i.pitch + dir));
        if (v === i.pitch) return false;
        loc.pitch = v; auSet(t, c, 'pitch', v);
    } else if (k === 7) {
        const v = Math.max(-40, Math.min(12, i.gain + dir));
        if (v === i.gain) return false;
        loc.gain = v; auSet(t, c, 'gain', v);
    } else {
        return false;
    }
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    return true;
}

/* Knobs that pick (one step per detent) rather than sweep. */
export function auSampleKnobDeliberate(k) { return k === 1; }

/* ---- the SLICE bank ---- */

export function auSliceCells(t) {
    const c = auClipOf(t), i = auInfo(t, c), l = S.activeDrumLane[t] | 0;
    if (i.mode !== AU_MODE_SLICE) return null;
    const r = auSlice(t, c, l) || { nudge: 0, len: 100, pitch: 0, gain: 0, rev: 0, play: 0, atk: 0, dec: 0 };
    const off = l >= i.n;
    const cells = [
        { kind: 'arcbip', label: 'Start', name: 'Slice Start (nudge)', text: (r.nudge > 0 ? '+' : '') + r.nudge + 'ms', signed: r.nudge / 500 },
        { kind: 'arc', label: 'Len', name: 'Slice Length', text: r.len + '%', norm: r.len / 100 },
        { kind: 'arcbip', label: 'Pitch', name: 'Slice Pitch', text: fmtSemi(r.pitch), signed: r.pitch / 24 },
        { kind: 'arc', label: 'Gain', name: 'Slice Gain', text: fmtDb(r.gain), norm: (r.gain + 40) / 52 },
        { kind: 'enumsq', label: 'Revrs', name: 'Reverse', text: r.rev ? 'On' : 'Off', options: ['Off', 'On'], sel: r.rev },
        { kind: 'arc', label: 'Attk', name: 'Attack', text: r.atk + 'ms', norm: Math.min(1, r.atk / 2000) },
        { kind: 'arc', label: 'Decay', name: 'Decay', text: r.dec ? r.dec + 'ms' : 'Full', norm: r.dec ? Math.min(1, r.dec / 5000) : 1 },
        { kind: 'enumsq', label: 'Play', name: 'Play Mode', text: AU_PLAY_NAMES[r.play], options: AU_PLAY_NAMES, sel: r.play },
    ];
    return off ? cells.map((x) => Object.assign({}, x, { text: '--' })) : cells;
}

const SLICE_FIELDS = ['nudge', 'len', 'pitch', 'gain', 'rev', 'atk', 'dec', 'play'];
export function auSliceKnob(t, k, steps) {
    const c = auClipOf(t), i = auInfo(t, c), l = S.activeDrumLane[t] | 0;
    if (i.mode !== AU_MODE_SLICE || l >= i.n) return false;
    const r = Object.assign({ nudge: 0, len: 100, pitch: 0, gain: 0, rev: 0, play: 0, atk: 0, dec: 0 }, auSlice(t, c, l) || {});
    const dir = steps > 0 ? 1 : -1;
    const f = SLICE_FIELDS[k];
    let v = r[f];
    if (f === 'nudge') v = Math.max(-500, Math.min(500, v + steps * (S.shiftHeld ? 1 : 5)));
    else if (f === 'len') v = Math.max(1, Math.min(100, v + steps));
    else if (f === 'pitch') v = Math.max(-24, Math.min(24, v + dir));
    else if (f === 'gain') v = Math.max(-40, Math.min(12, v + dir));
    else if (f === 'rev') v = dir > 0 ? 1 : 0;
    else if (f === 'play') v = Math.max(0, Math.min(2, v + dir));
    else if (f === 'atk') v = Math.max(0, Math.min(2000, v + steps * (v < 100 ? 2 : 20)));
    else if (f === 'dec') v = Math.max(0, Math.min(5000, v + steps * (v < 200 ? 5 : 50)));
    if (v === r[f]) return false;
    r[f] = v;
    auSetSlice(t, c, l, f === 'nudge' ? 'nudge' : f, v);
    _sl.set(t + '_' + c + '_' + l, r);
    return true;
}
export function auSliceKnobDeliberate(k) { return k === 4 || k === 7; }

/* ---- pads ---- */

/* Slice mode: left 4x4 = slices 1-16, right 4x4 = 17-32 (the drum layout's
 * row/col order within each half). -1 = not a slice pad (Loop mode). */
export function auPadToLane(t, padIdx) {
    if (auInfo(t, auClipOf(t)).mode !== AU_MODE_SLICE) return -1;
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
    return Math.min(i.jump - 1, Math.floor(_pos.rel * i.jump));
}

/* ---- the waveform ---- */

/* Columns 0..1 for a w-pixel span of the sample from `a` to `b` (fractions). */
export function auWaveColumns(t, c, w, a, b) {
    const amp = auPeaks(t, c);
    if (!amp) return null;
    const out = [];
    for (let x = 0; x < w; x++) {
        const f0 = a + (b - a) * x / w, f1 = a + (b - a) * (x + 1) / w;
        let i0 = Math.floor(f0 * 128), i1 = Math.max(i0 + 1, Math.ceil(f1 * 128));
        let m = 0;
        for (let k = i0; k < i1 && k < 128; k++) if (amp[k] > m) m = amp[k];
        out.push(m);
    }
    return out;
}
