/* ui_groove_core.mjs — turning notes into a groove table, and reading groove
 * files.
 *
 * PURE: bytes or plain objects in, plain objects out. No host globals, no
 * state, no imports, so it loads unchanged in node and every rule below is
 * pinned by tests/js/test_groove_core.mjs with hand-built fixtures.
 *
 * A groove TABLE is what the engine plays (dsp/seq8.c, groove_t):
 *   base   slot length in ticks (96 per quarter note)
 *   n      slots before it repeats (1..128)
 *   off[]  per slot, how far from the grid a note there is moved, in 1/16ths
 *          of a tick: + late, - early
 *   vel[]  per slot, the velocity the template played there; 0 = no note, so
 *          the slot leaves timing and velocity alone
 *
 * It is made the same way from any source: for each slot, the nearest template
 * note within half a slot of the grid line (the loop wraps; a tie goes to the
 * earlier note) gives that slot its offset and velocity.
 *
 * Sources: a part of a MIDI file (ui_midifile.mjs), and an Ableton groove
 * file (.agr). An .agr is one of three containers — plain XML, gzip-wrapped
 * XML, or a binary serialization — and carries its own grid, length and
 * amounts. The binary kind is read by FINDING its note records (fixed-size,
 * little-endian), not by walking its schema, so its grid and length are worked
 * out from the notes and its amounts are not read: it comes in with Timing
 * 100 and the rest at 0. */

export const GROOVE_FINE = 16;
export const GROOVE_MAX_SLOTS = 128;
export const GROOVE_PPQN = 96;
export const GROOVE_EXTENSIONS = ['.agr'];

/* Ableton's Grid enum → slot length in ticks. */
const AGR_GRID_TICKS = [96, 48, 32, 24, 16, 12, 8];
/* Slot lengths offered for a groove made from MIDI, and their names. */
export const GROOVE_BASES = [96, 48, 32, 24, 16, 12];
export function grooveBaseName(ticks) {
    return ({ 96: '1/4', 48: '1/8', 32: '1/8T', 24: '1/16', 16: '1/16T', 12: '1/32', 8: '1/32T' })[ticks] || (ticks + 't');
}

export function isGrooveFileName(name) {
    return String(name || '').toLowerCase().endsWith('.agr');
}

/* Letters, digits, space and - _ . / only, at most 23 characters: the engine
 * keeps the name between quotes in the project file. */
export function grooveCleanName(s) {
    const t = String(s || '').replace(/[^A-Za-z0-9 \-_./]/g, '_').replace(/\s+/g, ' ').trim();
    return (t.length > 23 ? t.slice(0, 23).trim() : t) || 'Groove';
}

/* ---- notes → table ---- */

/* notes: [{ tick, vel }] in ticks (fractions allowed); base: slot length in
 * ticks; lengthTicks: the template's loop length.
 *
 * The template's notes are matched to grid lines IN ORDER — the first note to
 * the first line it can belong to, and so on — choosing the matching that
 * moves the notes least. Not "the nearest note to each line": a hard swing
 * puts its off-beat note half a slot late or more, where it is as near the
 * NEXT line as its own, and nearest-first hands it to the wrong one (or to
 * none). In order, a note may sit up to a whole slot late and half a slot
 * early and still be its own line's. */
export function grooveTableFromNotes(notes, base, lengthTicks) {
    const b = Math.max(1, Math.round(base));
    const n = Math.max(1, Math.min(GROOVE_MAX_SLOTS, Math.round(Math.max(b, lengthTicks) / b)));
    const loop = n * b;
    const off = new Array(n).fill(0), vel = new Array(n).fill(0);

    /* in time order; notes struck together are one (the loudest) */
    /* A template longer than the table holds is CUT at the table's end — not
     * folded back on itself, which would lay its second half over its first. */
    const whole = lengthTicks <= loop + b / 2;
    const src = (notes || []).filter(x => x.vel > 0 && isFinite(x.tick) && (whole || (x.tick >= 0 && x.tick < loop)))
        .map(x => ({ t: ((x.tick % loop) + loop) % loop, v: x.vel }))
        .sort((x, y) => x.t - y.t);
    const ns = [];
    for (const x of src) {
        const last = ns[ns.length - 1];
        if (last && x.t - last.t < 1) { if (x.v > last.v) last.v = x.v; } else ns.push({ t: x.t, v: x.v });
        if (ns.length >= 1024) break;
    }
    const m = ns.length;
    if (!m) return { base: b, n, off, vel };

    /* Lines 0..n: line n is the loop's end, which is line 0 again (a note
     * just before the end is the first line's, early). d = note - line. */
    const LATE = b - 1 / GROOVE_FINE, EARLY = b / 2;
    const fits = (d) => d <= LATE && d >= -EARLY;
    const SKIP = b * 4;                         /* leaving a note out costs more than any fit */
    const W = n + 2;
    const cost = new Float64Array((m + 1) * W), took = new Uint8Array((m + 1) * W);
    /* cost[i][j]: the first i notes placed on lines before j */
    for (let i = 1; i <= m; i++) cost[i * W] = i * SKIP;
    for (let i = 0; i <= m; i++) {
        for (let j = 1; j <= n + 1; j++) {
            let best = cost[i * W + (j - 1)], how = 0;                    /* line j-1 left empty */
            if (i > 0) {
                const d = ns[i - 1].t - (j - 1) * b;
                if (fits(d)) {
                    /* a dead heat goes to the EARLIER line, as its late note */
                    const c = cost[(i - 1) * W + (j - 1)] + (d >= 0 ? d : 0.001 - d);
                    if (c < best) { best = c; how = 1; }                  /* note i-1 on line j-1 */
                }
                const c2 = cost[(i - 1) * W + j] + SKIP;
                if (c2 < best) { best = c2; how = 2; }                    /* note i-1 left out */
            }
            cost[i * W + j] = best; took[i * W + j] = how;
        }
    }
    let i = m, j = n + 1;
    const put = [];
    while (j > 0) {
        const how = took[i * W + j];
        if (how === 1) { put.push({ line: j - 1, d: ns[i - 1].t - (j - 1) * b, v: ns[i - 1].v }); i--; j--; }
        else if (how === 2) i--;
        else j--;
    }
    for (const p of put) {
        const slot = p.line % n;                 /* the loop's end is the first line */
        if (vel[slot] && p.line === n) continue; /* the first line already has its own note */
        off[slot] = Math.round(p.d * GROOVE_FINE);
        vel[slot] = Math.max(1, Math.min(127, Math.round(p.v)));
    }
    return { base: b, n, off, vel };
}

/* The pieces the engine takes a table in (see groove_begin in
 * dsp/setparam/sp_globals_transport.c): [key, value] pairs, in order. Eight
 * slots a piece keeps each value far under the transport's 256 bytes. */
export function grooveMessages(g, trial) {
    const amt = (v, d) => Math.max(0, Math.min(100, Math.round(v === undefined ? d : v)));
    const out = [['groove_begin', [g.base, g.n, amt(g.timing, 100), amt(g.quantize, 0), amt(g.random, 0),
                                   amt(g.velocity, 0), grooveCleanName(g.name)].join(' ')]];
    for (let i = 0; i < g.n; i += 8) {
        const part = [];
        for (let j = i; j < Math.min(g.n, i + 8); j++) part.push(g.off[j] | 0, g.vel[j] | 0);
        out.push(['groove_slots_' + i, part.join(' ')]);
    }
    /* 'a': a trial — the engine keeps the groove before it, for a revert */
    out.push(['groove_commit', trial ? 'a' : '1']);
    return out;
}

/* A groove as it is kept on disk (our own JSON), and back. Reading checks
 * everything: the file may have been edited by hand. */
export function grooveToJson(g) {
    return JSON.stringify({ v: 1, name: grooveCleanName(g.name), base: g.base, n: g.n,
        timing: g.timing === undefined ? 100 : g.timing, quantize: g.quantize | 0,
        random: g.random | 0, velocity: g.velocity | 0, off: g.off, vel: g.vel });
}
export function grooveFromJson(text) {
    let o;
    try { o = JSON.parse(String(text)); } catch (e) { return { error: 'BAD GROOVE FILE' }; }
    if (!o || typeof o !== 'object' || !Array.isArray(o.off) || !Array.isArray(o.vel)) return { error: 'BAD GROOVE FILE' };
    const base = o.base | 0, n = o.n | 0;
    if (base < 1 || base > 255 || n < 1 || n > GROOVE_MAX_SLOTS || o.off.length !== n || o.vel.length !== n)
        return { error: 'BAD GROOVE FILE' };
    const pct = (v, d) => { const x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : d; };
    return { name: grooveCleanName(o.name), base, n,
        timing: pct(o.timing, 100), quantize: pct(o.quantize, 0), random: pct(o.random, 0), velocity: pct(o.velocity, 0),
        off: o.off.map(x => Math.max(-32767, Math.min(32767, Math.round(Number(x) || 0)))),
        vel: o.vel.map(x => Math.max(0, Math.min(127, Math.round(Number(x) || 0)))) };
}

/* ---- inflate (RFC 1951) and the gzip wrapper (RFC 1952) ---- */

const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function huffman(lengths) {
    const count = new Array(16).fill(0), offs = new Array(16).fill(0);
    for (const l of lengths) count[l]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    const symbol = new Array(lengths.length).fill(0);
    for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
    return { count, symbol };
}

/* Raw deflate → bytes, or null on damaged input or when the output would pass
 * `maxOut` (a groove file is small; this bounds a hostile one). */
export function inflateRaw(src, maxOut) {
    const cap = maxOut || (4 << 20);
    let pos = 0, bit = 0, nbit = 0, bad = false;
    const out = [];
    const bits = (n) => {
        while (nbit < n) {
            if (pos >= src.length) { bad = true; return 0; }
            bit |= src[pos++] << nbit; nbit += 8;
        }
        const v = bit & ((1 << n) - 1);
        bit >>>= n; nbit -= n;
        return v;
    };
    const decode = (h) => {
        let code = 0, first = 0, index = 0;
        for (let len = 1; len < 16; len++) {
            code |= bits(1);
            if (bad) return -1;
            const c = h.count[len];
            if (code - c < first) return h.symbol[index + (code - first)];
            index += c; first += c; first <<= 1; code <<= 1;
        }
        bad = true;
        return -1;
    };
    let fixedLit = null, fixedDist = null;
    for (;;) {
        const last = bits(1), type = bits(2);
        if (bad) return null;
        if (type === 0) {
            bit = 0; nbit = 0;
            if (pos + 4 > src.length) return null;
            const len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
            pos += 4;
            if ((len ^ 0xFFFF) !== nlen || pos + len > src.length || out.length + len > cap) return null;
            for (let i = 0; i < len; i++) out.push(src[pos++]);
        } else if (type === 1 || type === 2) {
            let lit, dist;
            if (type === 1) {
                if (!fixedLit) {
                    const l = [];
                    for (let i = 0; i < 288; i++) l.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
                    fixedLit = huffman(l); fixedDist = huffman(new Array(30).fill(5));
                }
                lit = fixedLit; dist = fixedDist;
            } else {
                const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
                if (bad || nlen > 286 || ndist > 30) return null;
                const cl = new Array(19).fill(0);
                for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]] = bits(3);
                const clh = huffman(cl), lens = [];
                while (lens.length < nlen + ndist) {
                    const sym = decode(clh);
                    if (bad) return null;
                    if (sym < 16) lens.push(sym);
                    else {
                        let rep, val = 0;
                        if (sym === 16) { if (!lens.length) return null; val = lens[lens.length - 1]; rep = 3 + bits(2); }
                        else if (sym === 17) rep = 3 + bits(3);
                        else rep = 11 + bits(7);
                        if (bad || lens.length + rep > nlen + ndist) return null;
                        while (rep--) lens.push(val);
                    }
                }
                lit = huffman(lens.slice(0, nlen)); dist = huffman(lens.slice(nlen));
            }
            for (;;) {
                const sym = decode(lit);
                if (bad) return null;
                if (sym < 256) { if (out.length >= cap) return null; out.push(sym); continue; }
                if (sym === 256) break;
                const li = sym - 257;
                if (li >= 29) return null;
                const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
                const di = decode(dist);
                if (bad || di < 0 || di >= 30) return null;
                const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
                if (bad || d > out.length || out.length + len > cap) return null;
                for (let i = 0; i < len; i++) out.push(out[out.length - d]);
            }
        } else return null;
        if (last) break;
    }
    return Uint8Array.from(out);
}

/* A gzip file's payload, or null. */
export function gunzip(b, maxOut) {
    if (!b || b.length < 18 || b[0] !== 0x1f || b[1] !== 0x8b || b[2] !== 8) return null;
    const flg = b[3];
    let p = 10;
    if (flg & 4) { if (p + 2 > b.length) return null; p += 2 + (b[p] | (b[p + 1] << 8)); }
    if (flg & 8) { while (p < b.length && b[p]) p++; p++; }
    if (flg & 16) { while (p < b.length && b[p]) p++; p++; }
    if (flg & 2) p += 2;
    if (p >= b.length) return null;
    return inflateRaw(b.subarray(p), maxOut);
}

/* ---- .agr ---- */

function asciiOf(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 8192)));
    return s;
}
const numAttr = (tag, name) => {
    const m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"').exec(tag);
    return m ? Number(m[1]) : NaN;
};
/* <Tag Value="x" /> — the LAST one when `last` (a MidiClip carries amounts of
 * its own before the groove's). */
function valueOf(xml, tag, last) {
    const re = new RegExp('<' + tag + '\\s+Value\\s*=\\s*"([^"]*)"', 'g');
    let m, got = null;
    while ((m = re.exec(xml))) { got = m[1]; if (!last) break; }
    return got;
}

function agrFromXml(xml) {
    if (xml.indexOf('<Groove') < 0) return { error: 'NOT A GROOVE FILE' };
    const notes = [];
    const re = /<MidiNoteEvent\b[^>]*>/g;
    let m;
    while ((m = re.exec(xml))) {
        const t = m[0];
        if (/\bIsEnabled\s*=\s*"false"/.test(t)) continue;
        const time = numAttr(t, 'Time'), vel = numAttr(t, 'Velocity');
        if (!isFinite(time) || time < 0) continue;
        notes.push({ tick: time * GROOVE_PPQN, vel: isFinite(vel) ? vel : 100 });
        if (notes.length > 4096) break;
    }
    if (!notes.length) return { error: 'NO NOTES' };
    const grid = Number(valueOf(xml, 'Grid', true));
    const base = AGR_GRID_TICKS[grid] || 24;
    let beats = Number(valueOf(xml, 'LoopEnd', false));
    if (!(beats > 0)) beats = Math.ceil(Math.max.apply(null, notes.map(n => n.tick)) / GROOVE_PPQN + 0.001);
    /* amounts are written either 0..1 or 0..100 */
    const pct = (tag, d) => {
        const raw = valueOf(xml, tag, true);
        const v = Number(raw);
        if (raw === null || !isFinite(v)) return d;
        return Math.max(0, Math.min(100, Math.round(Math.abs(v) <= 1.3 ? v * 100 : v)));
    };
    const t = grooveTableFromNotes(notes, base, beats * GROOVE_PPQN);
    return { ...t, name: grooveCleanName(valueOf(xml, 'Name', false) || ''),
        timing: pct('TimingAmount', 100), quantize: pct('QuantizationAmount', 0),
        random: pct('RandomAmount', 0), velocity: pct('VelocityAmount', 0) };
}

/* The binary container: note events are fixed 25-byte little-endian records —
 * time (double, beats), duration (double), velocity (float), one more float,
 * enabled (byte). Find the longest run of records that read as notes. */
function agrFromBinary(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const REC = 25;
    const okAt = (p, prevT) => {
        if (p + REC > b.length) return null;
        const t = dv.getFloat64(p, true), d = dv.getFloat64(p + 8, true), v = dv.getFloat32(p + 16, true);
        const en = b[p + 24];
        if (!(t >= 0 && t < 64) || !(d > 0 && d < 64) || !(v >= 1 && v <= 127) || en > 1) return null;
        if (t < prevT) return null;
        return { t, v, en };
    };
    let best = [];
    for (let p = 12; p + REC <= b.length; p++) {
        const first = okAt(p, 0);
        if (!first) continue;
        const run = [first];
        let q = p + REC, prev = first.t;
        for (;;) {
            const r = okAt(q, prev);
            if (!r) break;
            run.push(r); prev = r.t; q += REC;
        }
        if (run.length > best.length) best = run;
        if (run.length > 1) p = q - 1;
    }
    const notes = best.filter(r => r.en).map(r => ({ tick: r.t * GROOVE_PPQN, vel: r.v }));
    if (notes.length < 2) return { error: 'CAN\'T READ GROOVE' };
    /* Length: the notes' span rounded up to a whole beat. Grid: the coarsest
     * slot that still gives every note a slot of its own. */
    const lastTick = Math.max.apply(null, notes.map(n => n.tick));
    const beats = Math.max(1, Math.ceil(lastTick / GROOVE_PPQN + 0.001));
    const base = grooveGuessBase(notes, beats * GROOVE_PPQN, 0);
    const t = grooveTableFromNotes(notes, base, beats * GROOVE_PPQN);
    return { ...t, name: '', timing: 100, quantize: 0, random: 0, velocity: 0, guessed: true };
}

/* The grid a set of notes was played on, when nothing says: the coarsest of
 * the usual ones (1/4 … 1/32, in ticks) that still gives every hit a slot of
 * its own. Hits within `together` ticks of each other count as one (a chord, a
 * flam, two drums on the same beat). */
export function grooveGuessBase(notes, lengthTicks, together) {
    const all = notes.map(n => Math.round(n.tick)).sort((x, y) => x - y);
    const times = [];
    for (const t of all) if (!times.length || t - times[times.length - 1] > (together | 0)) times.push(t);
    let minGap = Infinity;
    for (let k = 1; k < times.length; k++) minGap = Math.min(minGap, times[k] - times[k - 1]);
    for (const cand of [96, 48, 32, 24, 16, 12])
        if (Math.round(lengthTicks / cand) >= times.length && cand <= minGap * 2) return cand;
    return 12;
}

/* Bytes of an .agr → a groove ({ base, n, off, vel, name, timing, quantize,
 * random, velocity }) or { error }. Never throws on bad input. */
export function agrParse(bytes) {
    try {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (b.length < 8) return { error: 'NOT A GROOVE FILE' };
        if (b[0] === 0x1f && b[1] === 0x8b) {
            const raw = gunzip(b, 4 << 20);
            if (!raw) return { error: 'CAN\'T READ GROOVE' };
            return agrFromXml(asciiOf(raw));
        }
        if (b[0] === 0xab && b[1] === 0x1e && b[2] === 0x56 && b[3] === 0x78) return agrFromBinary(b);
        /* XML, with or without a byte-order mark */
        const head = asciiOf(b.subarray(0, Math.min(64, b.length)));
        if (head.indexOf('<') >= 0) return agrFromXml(asciiOf(b));
        return { error: 'NOT A GROOVE FILE' };
    } catch (e) {
        return { error: 'CAN\'T READ GROOVE' };
    }
}
