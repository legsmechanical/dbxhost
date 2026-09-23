/* ui_midifile.mjs — Standard MIDI File reading for Import MIDI.
 *
 * PURE: bytes in, plain objects out. No host globals, no state, no imports, so
 * it loads unchanged in node and every rule below is pinned by
 * tests/js/test_midifile_parse.mjs with hand-built files.
 *
 * ⭑ NOTES ONLY. Controllers, pitch bend, aftertouch, program changes and sysex
 * are walked past and COUNTED (so the screen can say they were there), never
 * returned. Tempo and time signature are read for bar arithmetic and display;
 * nothing here writes them anywhere.
 *
 * Times come out in dAVEBOx ticks: 96 per quarter note (PPQN in dsp/seq8.c).
 *
 * What "all common MIDI file types" means here:
 *   - format 0 (one track, many channels) → one importable part per CHANNEL;
 *   - format 1 (parallel tracks)          → one part per track that has notes
 *     (the tempo/conductor track has none and is not offered);
 *   - format 2 (sequential patterns)      → one part per pattern;
 *   - RIFF-wrapped files (.rmi)           → the SMF inside the wrapper;
 *   - PPQ and SMPTE time divisions.
 * A damaged file is read as far as it makes sense and reports a warning; this
 * never throws on bad input.
 */

export const SMF_PPQN = 96;
export const SMF_MAX_BYTES = 256 * 1024;   /* read cap: bounds the one-tick parse */
export const SMF_MAX_PARTS = 64;
export const SMF_MAX_NOTES_PER_PART = 4096;
export const SMF_EXTENSIONS = ['.mid', '.midi', '.smf', '.kar', '.rmi'];

export function isMidiFileName(name) {
    const n = String(name || '').toLowerCase();
    for (const e of SMF_EXTENSIONS) if (n.endsWith(e)) return true;
    return false;
}

/* Printable ASCII only, trimmed, at most 24 characters: a name is drawn in a
 * font that has nothing past 0x7E, and a file's names are often padded. */
function cleanName(bytes, from, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
        const c = bytes[from + i];
        s += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : ' ';
    }
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > 24 ? s.slice(0, 24).trim() : s;
}

function u32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
function u16(b, i) { return (b[i] << 8) | b[i + 1]; }
function tag(b, i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); }

/* Where the SMF header starts: 0 for a plain file; inside the `data` chunk of a
 * RIFF RMID wrapper; -1 when there is no header at all. */
function findHeader(b) {
    if (b.length >= 14 && tag(b, 0) === 'MThd') return 0;
    if (b.length >= 12 && tag(b, 0) === 'RIFF' && tag(b, 8) === 'RMID') {
        let i = 12;
        while (i + 8 <= b.length) {
            const id = tag(b, i);
            const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
            if (id === 'data') return (i + 8 + 4 <= b.length && tag(b, i + 8) === 'MThd') ? i + 8 : -1;
            i += 8 + len + (len & 1);
        }
    }
    return -1;
}

/* One MTrk, walked to its end. Emits raw note spans in FILE ticks plus the
 * first tempo / time signature / name it meets. */
function readTrack(b, start, end, out, warn) {
    const notes = [];
    const open = new Map();          /* ch*128+pitch -> [{t, v}] in onset order */
    const channels = new Set();
    let name = null, pos = start, t = 0, running = 0, ended = false;

    const close = (key, at) => {
        const q = open.get(key);
        if (!q || !q.length) return false;
        const n = q.shift();
        if (!q.length) open.delete(key);
        notes.push({ t: n.t, e: Math.max(at, n.t), p: key & 127, v: n.v, ch: key >> 7 });
        return true;
    };

    const vlq = () => {
        let v = 0;
        for (let k = 0; k < 4; k++) {
            if (pos >= end) return -1;
            const c = b[pos++];
            v = (v << 7) | (c & 0x7f);
            if (!(c & 0x80)) return v;
        }
        return -1;
    };

    while (pos < end) {
        const dt = vlq();
        if (dt < 0) { warn('TRUNCATED'); break; }
        t += dt;
        if (pos >= end) { warn('TRUNCATED'); break; }
        let st = b[pos];
        if (st & 0x80) { pos++; }
        else if (running) { st = running; }
        else { warn('DAMAGED'); break; }

        if (st === 0xff) {
            if (pos >= end) { warn('TRUNCATED'); break; }
            const type = b[pos++];
            const len = vlq();
            if (len < 0 || pos + len > end) { warn('TRUNCATED'); break; }
            if (type === 0x03 && name == null) name = cleanName(b, pos, len);
            else if (type === 0x51 && len === 3 && out.tempoUs == null) out.tempoUs = (b[pos] << 16) | (b[pos + 1] << 8) | b[pos + 2];
            else if (type === 0x58 && len >= 2 && out.timeSig == null) {
                const num = b[pos], den = 1 << b[pos + 1];
                if (num >= 1 && den >= 1 && den <= 64) out.timeSig = { num, den };
            } else if (type === 0x2f) { pos += len; ended = true; break; }
            pos += len;
            continue;
        }
        if (st === 0xf0 || st === 0xf7) {
            const len = vlq();
            if (len < 0 || pos + len > end) { warn('TRUNCATED'); break; }
            pos += len; out.ignored.sysex++; running = 0;
            continue;
        }
        if (st >= 0xf1) { warn('DAMAGED'); break; }

        running = st;
        const kind = st & 0xf0, ch = st & 0x0f;
        const nData = (kind === 0xc0 || kind === 0xd0) ? 1 : 2;
        if (pos + nData > end) { warn('TRUNCATED'); break; }
        const d1 = b[pos] & 0x7f, d2 = nData === 2 ? (b[pos + 1] & 0x7f) : 0;
        pos += nData;

        if (kind === 0x90 && d2 > 0) {
            const key = (ch << 7) | d1;
            /* Same pitch struck again before its release: the first ends HERE.
             * Keeping both open would hand the release to whichever the engine
             * met first, and a zero-length note is inaudible. */
            if (open.has(key)) close(key, t);
            const q = open.get(key) || [];
            q.push({ t, v: d2 });
            open.set(key, q);
            channels.add(ch);
        } else if (kind === 0x80 || kind === 0x90) {
            close((ch << 7) | d1, t);
        } else if (kind === 0xb0) out.ignored.cc++;
        else if (kind === 0xe0) out.ignored.pb++;
        else if (kind === 0xa0 || kind === 0xd0) out.ignored.at++;
        else if (kind === 0xc0) out.ignored.pc++;
    }
    if (open.size) {
        warn(ended ? 'HELD NOTES' : 'TRUNCATED');
        for (const key of [...open.keys()]) while (close(key, t)) { /* drain */ }
    }
    notes.sort((a, c) => a.t - c.t || a.p - c.p);
    return { notes, channels: [...channels].sort((a, c) => a - c), name, endTick: t };
}

/* Bytes → parts. `bytes` is a Uint8Array (or anything indexable with .length). */
export function smfParse(bytes) {
    const b = bytes;
    if (!b || !b.length) return { error: 'EMPTY FILE' };
    if (b.length > SMF_MAX_BYTES) return { error: 'FILE TOO BIG' };
    const h = findHeader(b);
    if (h < 0) return { error: 'NOT A MIDI FILE' };
    const hlen = u32(b, h + 4);
    if (hlen < 6 || h + 8 + hlen > b.length) return { error: 'NOT A MIDI FILE' };
    const format = u16(b, h + 8), ntrks = u16(b, h + 10), div = u16(b, h + 12);
    if (format > 2) return { error: 'UNKNOWN FORMAT' };

    const warnings = [];
    const warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const out = { tempoUs: null, timeSig: null, ignored: { cc: 0, pb: 0, at: 0, pc: 0, sysex: 0 } };

    const raw = [];
    let i = h + 8 + hlen;
    while (i + 8 <= b.length && raw.length < Math.max(ntrks, 1) + 16) {
        const id = tag(b, i), len = u32(b, i + 4);
        const s = i + 8, e = Math.min(b.length, s + len);
        if (s + len > b.length) warn('TRUNCATED');
        if (id === 'MTrk') raw.push(readTrack(b, s, e, out, warn));
        i = s + len;
    }
    if (!raw.length) return { error: 'NO TRACKS' };

    /* File ticks → dAVEBOx ticks. */
    const bpm = out.tempoUs ? 60000000 / out.tempoUs : 120;
    let toTick;
    if (div & 0x8000) {
        const fps = 256 - (div >> 8), tpf = div & 0xff;
        const perSec = (fps === 29 ? 29.97 : fps) * (tpf || 1);
        toTick = (x) => Math.round(x / perSec * bpm / 60 * SMF_PPQN);
        warn('SMPTE TIME');
    } else {
        const ppq = div || 96;
        toTick = (x) => Math.round(x * SMF_PPQN / ppq);
    }

    /* Group raw tracks into importable parts. */
    const groups = [];
    raw.forEach((rt, idx) => {
        if (format === 0) {
            /* One channel: it IS the file's one part, so it keeps the file's
             * name for it. Several: each channel is a part, named by channel. */
            const solo = rt.channels.length === 1;
            for (const ch of rt.channels) {
                groups.push({ name: (solo && rt.name) || ('Ch ' + (ch + 1)), channels: [ch],
                              notes: rt.notes.filter(n => n.ch === ch) });
            }
        } else if (rt.notes.length) {
            const fallback = (format === 2 ? 'Pattern ' : 'Track ') + (idx + 1);
            groups.push({ name: rt.name || fallback, channels: rt.channels, notes: rt.notes });
        }
    });

    let tooMany = 0;
    const parts = [];
    for (const g of groups) {
        if (parts.length >= SMF_MAX_PARTS) { warn('TOO MANY PARTS'); break; }
        let src = g.notes;
        if (src.length > SMF_MAX_NOTES_PER_PART) { tooMany += src.length - SMF_MAX_NOTES_PER_PART; src = src.slice(0, SMF_MAX_NOTES_PER_PART); }
        const notes = src.map(n => {
            const t = toTick(n.t);
            return { t, g: Math.max(1, toTick(n.e) - t), p: n.p, v: Math.max(1, Math.min(127, n.v)) };
        });
        let lo = 127, hi = 0, endTick = 0;
        for (const n of notes) {
            if (n.p < lo) lo = n.p;
            if (n.p > hi) hi = n.p;
            if (n.t + n.g > endTick) endTick = n.t + n.g;
        }
        parts.push({ name: g.name, channels: g.channels, drum: g.channels.length > 0 && g.channels.every(c => c === 9),
                     notes, noteCount: notes.length, minPitch: lo, maxPitch: hi, endTick });
    }
    if (tooMany) warn('NOTES OVER LIMIT');
    /* Names must tell parts apart: a duplicated name gets its channel. */
    const seen = {};
    for (const p of parts) seen[p.name] = (seen[p.name] || 0) + 1;
    for (const p of parts) if (seen[p.name] > 1 && p.channels.length === 1) p.qual = 'Ch ' + (p.channels[0] + 1);

    return {
        format, parts, warnings,
        bpm: Math.round(bpm * 100) / 100,
        timeSig: out.timeSig || { num: 4, den: 4 },
        ignored: out.ignored,
    };
}

/* ---- the window: what lands in a clip ----
 *
 * Bars follow the file's time signature: a bar is num/den of a whole note, so
 * 4/4 is 384 ticks and 6/8 is 288. A clip holds at most 256 steps (SEQ_STEPS)
 * of `tps` ticks each, which is what caps the length.
 */
export const IMPORT_MAX_STEPS = 256;
export const IMPORT_MAX_NOTES_MELODIC = 512;   /* MAX_NOTES_PER_CLIP */
export const IMPORT_MAX_NOTES = 2048;          /* one payload, drum lanes included */

export function barTicksOf(timeSig) {
    const ts = timeSig || { num: 4, den: 4 };
    return Math.max(1, Math.round(ts.num * SMF_PPQN * 4 / ts.den));
}

/* Longest window, in bars, a clip at this resolution can hold. */
export function maxBarsFor(tps, timeSig) {
    return Math.max(1, Math.floor(IMPORT_MAX_STEPS * tps / barTicksOf(timeSig)));
}

/* Bars the part spans, counted from bar 1 (at least 1). */
export function partBars(part, timeSig) {
    return Math.max(1, Math.ceil((part ? part.endTick : 0) / barTicksOf(timeSig)));
}

/* startBar is 1-based. laneNotes (drum destinations only) is the pitch each of
 * the 32 pads plays; a note whose pitch no pad plays is counted in `noPad`
 * and left out. */
export function planImport(part, opts) {
    const o = opts || {};
    const barT = barTicksOf(o.timeSig);
    const tps = o.tps || 24;
    const maxBars = maxBarsFor(tps, o.timeSig);
    const bars = Math.max(1, Math.min(maxBars, o.bars | 0 || 1));
    const from = (Math.max(1, o.startBar | 0 || 1) - 1) * barT;
    const to = from + bars * barT;
    const lengthSteps = Math.min(IMPORT_MAX_STEPS, Math.ceil(bars * barT / tps));
    const drum = Array.isArray(o.laneNotes);
    const lane = drum ? new Map(o.laneNotes.map((p, l) => [p, l])) : null;
    const res = { notes: [], lengthSteps, maxBars, bars, barTicks: barT,
                  cut: 0, shortened: 0, noPad: 0, overCap: 0 };
    const perLane = new Array(32).fill(0);
    const dedupe = new Set();
    for (const n of (part ? part.notes : [])) {
        if (n.t < from) continue;
        if (n.t >= to) { res.cut++; continue; }
        let l = -1;
        if (drum) {
            if (!lane.has(n.p)) { res.noPad++; continue; }
            l = lane.get(n.p);
        }
        const t = n.t - from;
        const k = t * 128 + n.p;
        if (dedupe.has(k)) continue;
        if (drum ? perLane[l] >= IMPORT_MAX_NOTES_MELODIC : res.notes.length >= IMPORT_MAX_NOTES_MELODIC) { res.overCap++; continue; }
        if (res.notes.length >= IMPORT_MAX_NOTES) { res.overCap++; continue; }
        let g = n.g;
        if (t + g > to - from) { g = Math.max(1, to - from - t); res.shortened++; }
        dedupe.add(k);
        if (drum) perLane[l]++;
        res.notes.push({ t, g, p: n.p, v: n.v, lane: l });
    }
    return res;
}
