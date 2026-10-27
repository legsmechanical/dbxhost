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
 * Slicing: chops are CREATED (Lazy, Manual) and then EDITED in one waveform
 * editor; Even is an override over that hand set, which it keeps (Josh,
 * 2026-10-27, the chop design). Every position is a sample frame.
 *
 * Values are the DSP's, read through tN_au_info_C / tN_au_sl_C_L / tN_au_all_C
 * / tN_au_marks_C / tN_au_wave_C_A_B and cached (a read costs a frame, so input handlers never read: they use
 * the cache and write; the tick refreshes what changed).
 *
 * No host_* call happens at module init. */

import { S } from './ui_state.mjs';
import { PAD_MODE_AUDIO, NUM_CLIPS } from './ui_constants.mjs';

export const AU_MODE_LOOP = 0, AU_MODE_SLICE = 1;
export const AU_LAZY_NONE = 0, AU_LAZY_ARMED = 1, AU_LAZY_RUN = 2, AU_LAZY_ENDED = 3;
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
const _all = new Map();        /* "t_c" -> ALL SLICES: 6 values, null where the slices differ */
const _peaks = new Map();      /* "t_c" -> { name, amp: [128 numbers 0..1] } */
const _stale = new Set();      /* "t_c" whose info must be re-read */
let _pos = { t: -1, on: 0, frame: 0, slice: -1 };
let _lazy = { state: 0, n: 0, frame: 0 };
let _padKey = '';
let _marks = { key: '', t: -1, c: -1, v: [], at: -1 };   /* every slice as it plays: [[a, b], ...] frames */
let _wave = { key: '', amp: null };                       /* the zoomed window's 128 columns */
let _waveWant = null;                                     /* { t, c, A, B } the editor asks for */
let _waveLast = null;                                     /* the last window read: drawn from while the next one loads */

export function auParseInfo(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const bar = String(raw).indexOf('|');
    const head = (bar >= 0 ? String(raw).slice(0, bar) : String(raw)).trim().split(/\s+/).map((x) => parseInt(x, 10));
    if (head.length < 17 || head.some((x) => isNaN(x))) return null;   /* detune (18th) came later */
    /* even: 0 = Off, else Even's count; hand: the hand set's slices; n: what
     * plays (Even's count or the hand set's); rstart / rend: frames */
    return {
        state: head[0], err: head[1], mode: head[2], even: head[3], hand: head[4], jump: head[5],
        rstart: head[6], rend: head[7], pitch: head[8], gain: head[9],
        nframes: head[10], rate: head[11], ch: head[12],
        revrs: head[13], nudge: head[14], jmpq: head[15], n: head[16], detune: head[17] | 0,
        name: bar >= 0 ? String(raw).slice(bar + 1) : '',
    };
}

const DEFAULT_INFO = { state: 0, err: 0, mode: 0, even: 8, hand: 1, n: 8, jump: 16, rstart: 0, rend: 0,
                       pitch: 0, detune: 0, gain: 0, nframes: 0, rate: 0, ch: 0, revrs: 0, nudge: 0, jmpq: 0, name: '' };
const DEFAULT_SLICE = { a: 0, b: 0, pinned: 0, pitch: 0, detune: 0, gain: 0, rev: 0, play: 0, atk: 0, dec: 0 };

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
    if (v.length < 9 || v.some((x) => isNaN(x))) return null;
    const r = { a: v[0], b: v[1], pinned: v[2], pitch: v[3], gain: v[4], rev: v[5], play: v[6], atk: v[7], dec: v[8], detune: v[9] | 0 };
    _sl.set(t + '_' + c + '_' + l, r);
    return r;
}
/* ALL SLICES: the sound fields in the engine's `all_C` order (Josh chose
 * "Sound only": the chop editor places the slices), each a number or null. */
export const ALL_FIELDS = ['pitch', 'gain', 'rev', 'atk', 'dec', 'play', 'detune'];
/* SLICE n's knobs: Detune beside Pitch (Josh, 2026-10-28: "if we're going to
 * have a coarse pitch knob, we also need a detune knob. goes for both "clip"
 * and slice n"). */
const SLICE_FIELDS = ['pitch', 'detune', 'gain', 'rev', 'atk', 'dec', 'play'];
export function auAll(t, c) { return _all.get(t + '_' + c) || null; }
function auReadAll(t, c) {
    const v = String(host_module_get_param('t' + t + '_au_all_' + c) || '').trim().split(/\s+/);
    if (v.length < 6) return null;
    const r = ALL_FIELDS.map((f, k) => (v[k] === undefined ? 0 : v[k] === 'x' ? null : parseInt(v[k], 10)));
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
    const amp = parseCols(raw);
    const i = auInfo(t, c);
    _peaks.set(t + '_' + c, { name: i.name, nframes: i.nframes, amp });
}

/* Every slice as it plays, [[a, b], ...] in frames: read when the clip's
 * slicing changed (or S.auStartsRev was bumped), cached otherwise. The chop
 * editor moves points in this cache as it writes them (auMarksLocal), so a
 * fast turn never steps from a stale value; the re-read waits for a pause. */
function marksKey(t, c) {
    const i = auInfo(t, c);
    return [t, c, i.name, i.nframes, i.n, i.even, i.hand, i.rstart, i.rend, S.auStartsRev | 0].join('_');
}
function auReadMarks(t, c) {
    const raw = String(host_module_get_param('t' + t + '_au_marks_' + c) || '').trim();
    const n = raw ? raw.split(/\s+/).map((x) => parseInt(x, 10)) : [];
    const v = [];
    for (let k = 0; k + 1 < n.length; k += 2) v.push([n[k], n[k + 1]]);
    _marks = { key: marksKey(t, c), t, c, v, at: -1 };
    return v;
}
export function auMarks(t, c) {
    if (_marks.t === t && _marks.c === c && (_marks.at >= 0 || _marks.key === marksKey(t, c))) return _marks.v;
    return auReadMarks(t, c);
}
/* The editor wrote a point: the cache takes it now; a fresh read follows a
 * moment after the last edit. */
export function auMarksLocal(t, c, v) {
    _marks = { key: marksKey(t, c), t, c, v, at: (S.tickCount | 0) + 12 };
    S.screenDirty = true;
}

/* The zoomed waveform: frames A..B as 128 columns 0..1, or null until the
 * tick has read it (one read per window). */
export function auWave(t, c, A, B) {
    const key = t + '_' + c + '_' + A + '_' + B + '_' + auInfo(t, c).name;
    if (_wave.key === key) return _wave.amp;
    _waveWant = { t, c, A, B, key };
    return null;
}
function parseCols(raw) {
    const amp = [];
    for (let k = 0; k < 128; k++) {
        let lo = parseInt(raw.substr(k * 4, 2), 16), hi = parseInt(raw.substr(k * 4 + 2, 2), 16);
        if (lo > 127) lo -= 256;
        if (hi > 127) hi -= 256;
        amp.push(Math.min(1, Math.max(Math.abs(lo), Math.abs(hi)) / 127));
    }
    return amp;
}

export function auPos() { return _pos; }

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
    const pk = t + '_' + c + '_' + cur.mode + '_' + cur.n + '_' + (auLazyOpen() ? 1 : 0);
    if (pk !== _padKey) { _padKey = pk; S.pendingPadNoteMapRecompute = true; S.ledsDirtyAudio = true; }
    if (cur.state === 2 && !auPeaks(t, c) && (S.tickCount % 8) === 0) { auReadPeaks(t, c); S.screenDirty = true; }
    const ed = S.auPanel;
    if ((ed && ed.t === t) || S.auEditor) {
        const l = auSelSlice(t);
        if (!auSlice(t, c, l)) { auReadSlice(t, c, l); S.screenDirty = true; }
        if (ed && auPanelPageName(ed) === 'CLIP' && cur.mode === AU_MODE_SLICE && !auAll(t, c)) { auReadAll(t, c); S.screenDirty = true; }
    }
    /* the chop editor's points, re-read a moment after its last edit */
    if (_marks.at >= 0 && (S.tickCount | 0) >= _marks.at) { auMarkStale(t, c); _marks.at = -1; _marks.key = ''; S.screenDirty = true; }
    /* the zoomed waveform the editor asked for (one read per window) */
    if (_waveWant && _waveWant.key !== _wave.key) {
        const w = _waveWant;
        const raw = String(host_module_get_param('t' + w.t + '_au_wave_' + w.c + '_' + w.A + '_' + w.B) || '');
        _wave = { key: w.key, amp: raw.length >= 512 ? parseCols(raw) : null };
        if (_wave.amp) _waveLast = { t: w.t, c: w.c, A: w.A, B: w.B, amp: _wave.amp, name: auInfo(w.t, w.c).name };
        _waveWant = null;
        S.screenDirty = true;
    }
    if ((S.tickCount % 3) === 0) {
        const raw = String(host_module_get_param('t' + t + '_au_pos') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
        const np = { t, on: raw[0] | 0, frame: raw[1] | 0, slice: isNaN(raw[2]) ? -1 : raw[2] };
        if (np.on !== _pos.on || np.frame !== _pos.frame || np.slice !== _pos.slice) { S.screenDirty = true; S.ledsDirtyAudio = true; }
        _pos = np;
        const se = S.auEditor;
        if (auLazyOpen()) {
            const lz = String(host_module_get_param('t' + t + '_au_lazy') || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
            const nl = { state: lz[0] | 0, n: lz[1] | 0, frame: lz[2] | 0 };
            if (nl.state !== _lazy.state || nl.n !== _lazy.n) {
                S.auStartsRev = (S.auStartsRev | 0) + 1; auMarkStale(t, c);
                S.ledsDirtyAudio = true;
            }
            _lazy = nl;
            /* played out (or Back while it ran): "Keep N new chops?" */
            if (nl.state === AU_LAZY_ENDED && !se.ask) se.ask = { kind: 'keep', sel: 0, n: nl.n };
            /* the engine never armed it (no sample, too long): nothing to show */
            if (nl.state === AU_LAZY_NONE && !se.ask && (S.clockMs | 0) - (se.lazyAt | 0) > 1500) {
                se.mode = 'wave';
                S.pendingPadNoteMapRecompute = true;
            }
            S.screenDirty = true;
        }
    }
}

/* A Lazy chop is up in the editor (armed, running, or asking to keep). */
export function auLazyOpen() { return !!(S.auEditor && S.auEditor.mode === 'lazy'); }

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
export function auSet(t, c, field, v) {
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
export function auLazyStart(t, c) { setKey(t, 'lazy', c + ' 1'); _lazy = { state: AU_LAZY_ARMED, n: 0, frame: 0 }; }
export function auLazyStop(t, c) { setKey(t, 'lazy', c + ' 0'); auMarkStale(t, c); }
export function auLazyTap(t) { setKey(t, 'lazy_tap', 1); }
export function auLazyKeep(t, c, keep) { setKey(t, 'lazy_keep', keep ? 1 : 0); _lazy = { state: 0, n: 0, frame: 0 }; auMarkStale(t, c); }
export function auLazyState() { return _lazy; }
/* The chop editor's writes (frames; an end of 0 = home). */
export function auSliceStart(t, c, l, frame) { auSetSlice(t, c, l, 'start', frame); }
export function auSliceEnd(t, c, l, frame) { auSetSlice(t, c, l, 'end', frame); }
export function auMarkAdd(t, c, frame) { setKey(t, 'mark_add', c + ' ' + frame); auMarkStale(t, c); }
export function auMarkDel(t, c, l) { setKey(t, 'mark_del', c + ' ' + l); auMarkStale(t, c); }
export function auManual(t, c) { setKey(t, 'manual', c); auMarkStale(t, c); }
/* Even's slices become the clip's own chops (Even Off). */
export function auEvenBake(t, c) { setKey(t, 'even_bake', c); auMarkStale(t, c); }

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
/* Pitch as a number in its box, as SHIFT is (Josh, 2026-10-28: the pitch knob
 * "doesn't read out any values" — an arc moved 1/24 a semitone). */
const pitchCell = (name, v) => ({ kind: 'valsq', label: 'Pitch', name: name + ' (semitones)',
                                  text: v == null ? '--' : (v >= 0 ? '+' : '') + v,
                                  ringNorm: ((v | 0) + 24) / 48 });
/* Detune as a knob (Josh, 2026-10-28: "detune should be a knob"): a centred
 * arc, the cents read out while it is touched. */
const detuneCell = (name, v) => ({ kind: 'arcbip', label: 'Detune', name: name + ' (cents)',
                                   text: v == null ? '--' : (v >= 0 ? '+' : '') + v,
                                   signed: (v | 0) / 50 });
const fmtDb = (v) => (v === 0 ? '0 dB' : (v > 0 ? '+' : '') + v + ' dB');
const fmtMs = (v) => (v > 0 ? '+' : '') + v + 'ms';
/* A frame as time: "1.234s", "1:02.35" past a minute. */
export function auFmtTime(frames, rate) {
    const s = (frames | 0) / (rate || 44100);
    if (s < 60) return s.toFixed(s < 10 ? 3 : 2) + 's';
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
}
/* The clip's real End: 0 in the engine means the sample's end. */
export function auEnd(i) { return i.rend > 0 ? i.rend : i.nframes; }

/* Even: Off, 2..32. */
export const AU_EVEN_MAX = 32;
const fmtEven = (v) => (v ? String(v) : 'Off');

/* ---- the AUDIO editor's pages ---- */

/* The AUDIO editor's pages (Josh, 2026-10-28, from the Layout Map: SLICING
 * "don't need this - it's now on wave"; ALL SLICES "merge with "clip""; SLICE
 * n "only show when sliice mode is active"): Slice mode CLIP · SLICE n, Loop
 * mode CLIP. The sample and its Start / End live on WAVE. */
export function auPanelPages(t) {
    return auInfo(t, auClipOf(t)).mode === AU_MODE_SLICE ? ['CLIP', 'SLICE'] : ['CLIP'];
}
export function auPanelPageName(ed) {
    const p = auPanelPages(ed.t);
    return p[Math.min(ed.page | 0, p.length - 1)];
}
export function auPanelTitle(ed) {
    const name = auPanelPageName(ed);
    const i = auInfo(ed.t, auClipOf(ed.t));
    if (name === 'SLICE') return 'SLICE ' + (auSelSlice(ed.t) + 1) + '/' + i.n;
    /* the first page says what it sets (Josh, 2026-10-28: "the "audio" bank
     * header should read "All slices" on the first page, and "Loop" when not
     * in slice mode") */
    if (name === 'CLIP') return i.mode === AU_MODE_SLICE ? 'ALL SLICES' : 'LOOP';
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

/* The sound fields, as cells (SLICE n: one slice; CLIP in Slice mode: every
 * slice, `--` while they differ). */
const soundCell = {
    pitch: (r) => pitchCell('Slice Pitch', r.pitch),
    detune: (r) => detuneCell('Slice Detune', r.detune),
    gain: (r) => ({ kind: 'arc', label: 'Gain', name: 'Slice Gain', text: r.gain == null ? '--' : fmtDb(r.gain), norm: ((r.gain | 0) + 40) / 52 }),
    rev: (r) => ({ kind: 'enumsq', label: 'Revrs', name: 'Reverse', text: r.rev == null ? '--' : (r.rev ? 'On' : 'Off'), options: ['Off', 'On'], sel: r.rev | 0 }),
    atk: (r) => ({ kind: 'arc', label: 'Attk', name: 'Attack', text: r.atk == null ? '--' : r.atk + 'ms', norm: Math.min(1, (r.atk | 0) / 2000) }),
    dec: (r) => ({ kind: 'arc', label: 'Decay', name: 'Decay', text: r.dec == null ? '--' : (r.dec ? r.dec + 'ms' : 'Full'),
                   norm: r.dec ? Math.min(1, r.dec / DEC_MAX) * 0.95 : 1 }),   /* Full: the top */
    play: (r) => ({ kind: 'enumsq', label: 'Play', name: 'Play Mode', text: r.play == null ? '--' : AU_PLAY_NAMES[r.play], options: AU_PLAY_NAMES, sel: r.play | 0 }),
};
/* CLIP, Slice mode: knob k -> the ALL SLICES field it sets (null: a clip knob).
 * >Seq moved to the CLIP bank (Josh, 2026-10-28: "since it's about the
 * sequence, maybe we should put >seq in the clip BANK"). */
const SLICE_CLIP_ALL = [null, null, null, null, 'rev', 'atk', 'dec', 'play'];

export function auPanelCells(ed) {
    const t = ed.t, c = auClipOf(t), i = auInfo(t, c);
    const has = i.state === 2;
    const page = auPanelPageName(ed);
    const live = (x) => (has || x === BLANK || x.label === 'Mode') ? x : dash(x);
    const mode = { kind: 'enumsq', label: 'Mode', name: 'Mode', text: i.mode ? 'Slice' : 'Loop',
                   sq: i.mode ? 'Slce' : 'Loop', options: ['Loop', 'Slice'], sel: i.mode };
    const pitch = pitchCell('Pitch', i.pitch);
    const detune = detuneCell('Detune', i.detune);
    const gain = { kind: 'arc', label: 'Gain', name: 'Gain', text: fmtDb(i.gain), norm: (i.gain + 40) / 52 };
    if (page === 'CLIP') {
        if (i.mode !== AU_MODE_SLICE) {
            const jump = { kind: 'valsq', label: 'Jump', name: 'Jump Points', text: String(i.jump) };
            return [mode, pitch, detune, gain, jump].concat(loopCells(i)).map(live);
        }
        /* every slice's sound here (Josh: "merge the "all slices" items to
         * this bank"): `--` while the slices differ, a turn sets them all */
        const a = auAll(t, c);
        const all = {};
        ALL_FIELDS.forEach((f, k) => { all[f] = a ? a[k] : null; });
        const cells = [mode, pitch, detune, gain];
        for (let k = 4; k < 8; k++) {
            const cell = soundCell[SLICE_CLIP_ALL[k]](all);
            cell.name = 'All Slices: ' + cell.name;
            cells.push(cell);
        }
        return cells.map(live);
    }
    /* SLICE n */
    const l = auSelSlice(t);
    const r = auSlice(t, c, l) || DEFAULT_SLICE;
    const cells = SLICE_FIELDS.map((f) => soundCell[f](r)).concat([BLANK]);
    return (!has || l >= i.n) ? cells.map((x) => (x === BLANK ? x : dash(x))) : cells;
}

/* How a knob steps (ui_input_cc's classes): '' sweeps; 'pick' a step per
 * detent run — Pitch, a semitone at a time (Josh, 2026-10-28: the pitch
 * knob "is very touchy"); 'delib' for toggles and the rest that pick. */
export function auPanelKnobClass(ed, k) {
    const page = auPanelPageName(ed);
    if (page === 'CLIP') {
        if (k === 1) return 'pick';
        return (auInfo(ed.t, auClipOf(ed.t)).mode === AU_MODE_SLICE
            ? (k === 0 || k === 4 || k === 7) : (k === 0 || k === 4 || k === 5 || k === 7)) ? 'delib' : '';
    }
    if (k === 0) return 'pick';
    return (k === 3 || k === 6) ? 'delib' : '';
}

/* Decay along the dial: shortest at the bottom, 5000 ms, then Full (0, no
 * decay) one step past it at the top (Josh, 2026-10-28: it "snaps to full at
 * the max dial position ... when it's turned all the way down. it should be
 * max at max when it's turned all the way up"). */
const DEC_MIN = 5, DEC_MAX = 5000;
function stepDecay(v, steps) {
    if (v === 0) return steps < 0 ? Math.max(DEC_MIN, DEC_MAX + (steps + 1) * 50) : 0;
    const n = v + steps * (v < 200 ? 5 : 50);
    if (n > DEC_MAX) return v === DEC_MAX ? 0 : DEC_MAX;
    return Math.max(DEC_MIN, n);
}

/* One field stepped: the next value, clamped. */
function stepSliceField(f, v, steps) {
    const dir = steps > 0 ? 1 : -1;
    if (f === 'pitch') return Math.max(-24, Math.min(24, v + dir));
    if (f === 'detune') return Math.max(-50, Math.min(50, v + steps));
    if (f === 'gain') return Math.max(-40, Math.min(12, v + dir));
    if (f === 'rev') return dir > 0 ? 1 : 0;
    if (f === 'play') return Math.max(0, Math.min(2, v + dir));
    if (f === 'atk') return Math.max(0, Math.min(2000, v + steps * (v < 100 ? 2 : 20)));
    if (f === 'dec') return stepDecay(v, steps);
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

/* The clip's Start / End by `steps` (frames: 1/500 of the sample a step,
 * Shift 1/5000). Returns true when it moved. */
export function auRangeStep(t, c, which, steps, per) {
    const i = auInfo(t, c);
    if (i.state !== 2 || !i.nframes) return false;
    const st = per != null ? per : Math.max(1, Math.round(i.nframes / (S.shiftHeld ? 5000 : 500)));
    const loc = Object.assign({}, i);
    const e = auEnd(i), G = 16;
    if (which === 'start') {
        const v = Math.max(0, Math.min(e - G, i.rstart + steps * st));
        if (v === i.rstart) return false;
        loc.rstart = v; auSet(t, c, 'start', v);
    } else {
        const v = Math.max(i.rstart + G, Math.min(i.nframes, e + steps * st));
        if (v === e) return false;
        loc.rend = v >= i.nframes ? 0 : v; auSet(t, c, 'end', v);
    }
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    return true;
}

/* One knob step on the AUDIO editor. Returns true when something changed. */
export function auPanelKnob(ed, k, steps) {
    const t = ed.t, c = auClipOf(t), i = auInfo(t, c);
    const dir = steps > 0 ? 1 : -1;
    const page = auPanelPageName(ed);
    const loc = Object.assign({}, i);
    if (page === 'CLIP') {
        if (k === 0) {
            const m = Math.max(0, Math.min(1, i.mode + dir));
            if (m === i.mode) return false;
            loc.mode = m; auSet(t, c, 'mode', m);
            ed.page = 0;
        } else if (i.state !== 2) {
            return false;
        } else if (k === 1) {
            const v = Math.max(-24, Math.min(24, i.pitch + dir));
            if (v === i.pitch) return false;
            loc.pitch = v; auSet(t, c, 'pitch', v);
        } else if (k === 2) {
            const v = Math.max(-50, Math.min(50, (i.detune | 0) + steps));
            if (v === (i.detune | 0)) return false;
            loc.detune = v; auSet(t, c, 'detune', v);
        } else if (k === 3) {
            const v = Math.max(-40, Math.min(12, i.gain + dir));
            if (v === i.gain) return false;
            loc.gain = v; auSet(t, c, 'gain', v);
        } else if (i.mode !== AU_MODE_SLICE) {
            if (k === 4) return auJumpKnob(t, c, i, loc, dir);
            if (k >= 5 && k <= 7) return auLoopKnob(t, k - 5, steps);
            return false;
        } else {
            const f = SLICE_CLIP_ALL[k];
            if (!f) return false;
            const fi = ALL_FIELDS.indexOf(f);
            const a = auAll(t, c) || [];
            let base = a[fi];
            if (base == null) {
                const s1 = auSlice(t, c, 0);
                base = s1 ? s1[f] : DEFAULT_SLICE[f];
            }
            const v = stepSliceField(f, base, steps);
            if (v === a[fi]) return false;
            auSetAll(t, c, f, v);
            const na = a.length ? a.slice() : new Array(ALL_FIELDS.length).fill(null);
            na[fi] = v;
            _all.set(t + '_' + c, na);
            return true;
        }
    } else {
        const l = auSelSlice(t);
        if (i.state !== 2 || l >= i.n || k >= SLICE_FIELDS.length) return false;
        const r = Object.assign({}, DEFAULT_SLICE, auSlice(t, c, l) || {});
        const f = SLICE_FIELDS[k];
        const v = stepSliceField(f, r[f], steps);
        if (v === r[f]) return false;
        r[f] = v;
        auSetSlice(t, c, l, f, v);
        _sl.set(t + '_' + c + '_' + l, r);
        return true;
    }
    S.auInfo[t][c] = loc;
    S.auStartsRev = (S.auStartsRev | 0) + 1;
    return true;
}

/* Jump points (Loop mode). */
function auJumpKnob(t, c, i, loc, dir) {
    const j = Math.max(0, Math.min(AU_JUMPS.length - 1, AU_JUMPS.indexOf(i.jump) + dir));
    if (AU_JUMPS[j] === i.jump) return false;
    loc.jump = AU_JUMPS[j]; auSet(t, c, 'jump', loc.jump);
    S.auInfo[t][c] = loc;
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
/* The pad of slice k (auPadToSlice's inverse). */
export function auSliceToPad(k) {
    return k < 16 ? Math.floor(k / 4) * 8 + (k % 4) : Math.floor((k - 16) / 4) * 8 + 4 + ((k - 16) % 4);
}
/* The jump point the playhead is in (Loop mode), or -1. */
export function auPlayheadJump(t) {
    const i = auInfo(t, auClipOf(t));
    if (_pos.t !== t || !_pos.on || i.mode !== AU_MODE_LOOP) return -1;
    const e = auEnd(i);
    if (e <= i.rstart) return -1;
    let rel = (_pos.frame - i.rstart) / (e - i.rstart);
    if (i.revrs) rel = 1 - rel;
    return Math.max(0, Math.min(i.jump - 1, Math.floor(rel * i.jump)));
}

/* ---- the waveform ---- */

/* Columns 0..1 for a w-pixel span of the sample, frames A..B. Each column
 * comes from the best source that covers it:
 *   1. the zoomed read of exactly this window;
 *   2. the last zoomed read, wherever it overlaps (a scroll or a zoom step
 *      redraws from it at once instead of waiting a tick for the new read);
 *   3. the whole sample's 128 columns — only where a pixel spans at least
 *      half of one, so it is never stretched (stretched, one loud column
 *      filled the screen: found by Josh, "the whole screen turns white while
 *      adjusting start/end/cursor rapidly");
 *   4. else nothing (the centre line).
 * null only when there is no sample or no waveform yet. */
function fromWindow(win, f0, f1) {
    if (!win || !win.amp || f1 <= win.A || f0 >= win.B) return null;
    const span = win.B - win.A;
    const i0 = Math.max(0, Math.floor((f0 - win.A) / span * 128));
    const i1 = Math.min(128, Math.max(i0 + 1, Math.ceil((f1 - win.A) / span * 128)));
    let m = 0;
    for (let k = i0; k < i1; k++) if (win.amp[k] > m) m = win.amp[k];
    return m;
}
export function auWaveColumns(t, c, w, A, B) {
    const i = auInfo(t, c);
    const fr = i.nframes;
    if (!fr || B <= A) return null;
    const peaks = auPeaks(t, c);
    if (!peaks) return null;
    const whole = { A: 0, B: fr, amp: peaks };
    const zoom = (A <= 0 && B >= fr) ? null : auWave(t, c, A, B);
    const exact = zoom ? { A, B, amp: zoom } : (A <= 0 && B >= fr ? whole : null);
    const last = (_waveLast && _waveLast.t === t && _waveLast.c === c && _waveLast.name === i.name) ? _waveLast : null;
    const coarseOk = (B - A) / w >= fr / 128 / 2;
    const out = [];
    for (let x = 0; x < w; x++) {
        const f0 = A + (B - A) * x / w, f1 = A + (B - A) * (x + 1) / w;
        let m = exact ? fromWindow(exact, f0, f1) : null;
        if (m === null) m = fromWindow(last, f0, f1);
        if (m === null && coarseOk) m = fromWindow(whole, f0, f1);
        out.push(m === null ? 0 : m);
    }
    return out;
}
