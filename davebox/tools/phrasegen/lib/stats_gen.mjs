/* stats_gen — melodic phrases generated from a style's measured statistics
 * (research/refs/stats/<style>.json; research/refs/README.md for how they were
 * measured). Nothing here copies a note from any reference song: every choice
 * is drawn from distributions — chord loops by how often they occur, onsets by
 * per-step probability, pitches by degree / interval shares, lengths and
 * velocities by their quartiles and accent profiles.
 *
 * A generated phrase is { notes: [{t, deg, oct, acc, v, g}], bars, mode } in the
 * library's melodic encoding (lib/phrase.mjs): relative to C in its own mode,
 * octaves from the category's anchor.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, ANCHOR, BAR } from './phrase.mjs';

const STATS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'research', 'refs', 'stats');
const STEP = BAR / 16;

/* category → the measured part it follows */
export const PART_OF = { bass: 'bass', chord: 'chord', pad: 'pad', keys: 'keys', guitar: 'guitar',
                         lead: 'lead', arp: 'arp', seq: 'seq', fx: 'fx' };

/* ---- loading ---- */

const cache = new Map();
export function loadStyle(file) {
    if (!cache.has(file)) {
        const f = join(STATS_DIR, file + '.json');
        cache.set(file, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
    }
    return cache.get(file);
}
/* A generation profile: a style's numbers, or a flavour's laid over its
 * parent's (a part, harmony or share the flavour lacks comes from the parent). */
export function profile(styleFile, flavour) {
    const base = loadStyle(styleFile), basics = loadStyle('basics');
    if (!base) return null;
    const f = flavour && base.flavours ? base.flavours[flavour] : null;
    const t = f && f.targets ? f.targets : null;
    const part = (name) => {
        const fp = t && t.parts && t.parts[name];
        if (fp && fp.density_per_bar && (fp.songs || 0) >= 4) return fp;
        const bp = base.parts && base.parts[name];
        if (bp && bp.density_per_bar) return bp;
        return basics && basics.parts ? basics.parts[name] : null;
    };
    /* chord loops: the flavour's own when it has them, then the chord sheets' */
    const loops = { maj: [], min: [] };
    const addNgrams = (ng, w) => {
        if (!ng) return;
        for (const m of ['maj', 'min']) for (const e of (ng[m] || [])) loops[m].push([e.loop, (e.songs_share || 0.05) * w]);
    };
    addNgrams(f && f.progression_ngrams, 1.0);
    if (f && f.chord_sheets && f.chord_sheets.loops)
        for (const [s, w] of f.chord_sheets.loops) { const [loop, m] = s.split('|').map(x => x.trim()); if (loops[m]) loops[m].push([loop, w * 0.8]); }
    if (!loops.maj.length || !loops.min.length) addNgrams(base.harmony && base.harmony.progression_ngrams, 0.6);
    if (!loops.maj.length) loops.maj.push(['I IV', 1], ['I V vi IV', 1], ['I IV V IV', 0.5]);
    if (!loops.min.length) loops.min.push(['i VI VII', 1], ['i iv', 1], ['i VII', 0.6]);
    const minor = (t && typeof t.minor_share === 'number') ? t.minor_share : (base.minor_share ?? 0.4);
    const change = (t && t.harmony && t.harmony.change_per_bar) || (base.harmony && base.harmony.change_per_bar) || [0.8, 1, 1.3];
    return { part, loops, minor, change };
}

/* ---- sampling helpers ---- */

function pickW(rng, pairs) {
    let tot = 0; for (const [, w] of pairs) tot += Math.max(0, w);
    let r = rng.next() * tot;
    for (const [v, w] of pairs) { r -= Math.max(0, w); if (r <= 0) return v; }
    return pairs[pairs.length - 1][0];
}
/* a value from quartiles [q1, med, q3] (triangular-ish) */
function fromQ(rng, q, lo, hi) {
    if (!Array.isArray(q)) return (lo + hi) / 2;
    const [a, m, b] = q, u = rng.next();
    const v = u < 0.5 ? a + (m - a) * Math.sqrt(u * 2) : m + (b - m) * Math.sqrt((u - 0.5) * 2);
    return Math.max(lo, Math.min(hi, v));
}
function gauss(rng) { return (rng.next() + rng.next() + rng.next() - 1.5) * 1.15; }

const PC_OF = { '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5, '#4': 6, '5': 7, 'b6': 8, '6': 9, 'b7': 10, '7': 11 };
function pcWeights(P, mode) {
    const w = new Array(12).fill(0.01);
    const ds = P && P.degree_share && P.degree_share[mode];
    if (ds) { for (const k in ds) if (k in PC_OF) w[PC_OF[k]] += ds[k]; }
    else { for (const pc of MODES[mode]) w[pc] += 0.1; }
    return w;
}

/* ---- harmony ---- */

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
/* "bVII" / "iv" / "V7" → { root (semitones above the tonic, in the mode), minor, dim } */
export function parseRoman(tok, mode) {
    const m = /^([b#]?)([ivIV]+)(.*)$/.exec(tok);
    if (!m) return null;
    const n = ROMAN[m[2].toLowerCase()];
    if (!n) return null;
    const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    const root = MODES[mode][n - 1] + acc;
    const lower = m[2] === m[2].toLowerCase();
    const dim = /°|dim|o$/.test(m[3]);
    return { root: ((root % 12) + 12) % 12, minor: lower, dim };
}
function chordTones(ch) { return [ch.root, ch.root + (ch.minor ? 3 : 4), ch.root + (ch.dim ? 6 : 7)]; }

function pickLoop(rng, prof, mode) {
    for (let i = 0; i < 8; i++) {
        const s = pickW(rng, prof.loops[mode]);
        const chords = String(s).split(/\s+/).map(t => parseRoman(t, mode)).filter(Boolean);
        if (chords.length) return chords;
    }
    return [parseRoman(mode === 'min' ? 'i' : 'I', mode)];
}

/* ---- encoding: semitones above C → {deg, oct, acc} in the mode ---- */
export function encodePitch(semi, mode) {
    const oct = Math.floor(semi / 12), pc = semi - 12 * oct, sc = MODES[mode];
    let d = sc.indexOf(pc);
    if (d >= 0) return { deg: d, oct, acc: 0 };
    d = sc.indexOf(pc - 1); if (d >= 0) return { deg: d, oct, acc: 1 };
    d = sc.indexOf(pc + 1); if (d >= 0) return { deg: d, oct, acc: -1 };
    return { deg: 0, oct, acc: pc };
}
function inScale(semi, mode) { return MODES[mode].includes(((semi % 12) + 12) % 12); }
function snapScale(semi, mode) { for (let d = 0; d < 6; d++) { if (inScale(semi + d, mode)) return semi + d; if (inScale(semi - d, mode)) return semi - d; } return semi; }

/* ---- rhythm ---- */

/* One bar's onsets: each step drawn on its own, with the measured per-step
 * probability scaled so the expected count is `want` — dense bars keep the
 * style's shape instead of flattening towards every step. */
function barSteps(rng, P, want) {
    const p = (P && P.step_onset_prob) || new Array(16).fill(0.25);
    let lo = 0, hi = 64;
    for (let it = 0; it < 30; it++) {
        const k = (lo + hi) / 2;
        const sum = p.reduce((a, x) => a + Math.min(1, x * k), 0);
        if (sum < want) lo = k; else hi = k;
    }
    const k = (lo + hi) / 2, out = [];
    for (let st = 0; st < 16; st++) if (rng.next() < Math.min(1, p[st] * k)) out.push(st);
    if (!out.length) out.push(p.indexOf(Math.max(...p)));
    return out;
}
function velAt(rng, P, step, flat) {
    const v = P && P.vel ? P.vel : { mean: 96, sd: 10, accent: new Array(16).fill(0) };
    if (flat) return Math.round(Math.max(40, Math.min(127, v.mean)));
    const a = v.accent ? v.accent[step] || 0 : 0;
    return Math.round(Math.max(30, Math.min(127, v.mean + a + gauss(rng) * (v.sd || 8) * 0.6)));
}

/* ---- the phrase ---- */

/* → { notes, bars, mode } or null. `forceMode` lets the caller spread
 * major / minor across a style's phrases in the measured proportion. */
export function genPhrase(cat, prof, rng, forceMode) {
    const P = prof.part(PART_OF[cat]);
    if (!P) return null;
    const mode = forceMode || (rng.next() < prof.minor ? 'min' : 'maj');
    /* length: rhythm that repeats every bar → mostly 1-bar phrases; the rest 2
     * (and a few 4) — starter phrases, never longer than the library allows */
    const lr = P.loop_share_rhythm || { '1': 0.4 };
    const bars = pickW(rng, [[1, 0.35 + (lr['1'] || 0) * 0.6], [2, 0.5], [4, 0.12]]);
    const loop = pickLoop(rng, prof, mode);
    const cpb = cat === 'pad' ? (loop.length > bars ? Math.min(2, Math.ceil(loop.length / bars)) : 1)
                              : (fromQ(rng, prof.change, 0.5, 2) > 1.3 || loop.length > bars * 1 ? Math.min(2, Math.max(1, Math.ceil(loop.length / bars))) : 1);
    const slotLen = BAR / cpb;
    const chordAt = (t) => loop[Math.floor(t / slotLen) % loop.length];
    const flat = rng.next() < ((P.vel && P.vel.flat_share) || 0);
    const pcw = pcWeights(P, mode);
    /* how much the part plays outside the scale (jazz walks chromatically) */
    const chromatic = pcw.reduce((a, w, pc) => a + (MODES[mode].includes(pc) ? 0 : w), 0) / pcw.reduce((a, w) => a + w, 0);
    const anchor = ANCHOR[cat] ?? 60;
    const reg = P.register ? P.register[1] : anchor + 4;
    const center = Math.round((reg - anchor) / 12) * 12;        /* octave the part lives in, relative to the anchor */
    const len16 = P.len16 || [1, 2, 3];
    const iv = P.interval_share || { '0': 0.3, '2': 0.2, '-2': 0.2 };
    const repeatP = iv['0'] || 0.2;
    const octP = (iv['12'] || 0) + (iv['-12'] || 0);

    /* onsets: one rhythm per bar, the first bar's repeated as often as measured */
    const rhythms = [];
    const repeatBar = Math.min(0.92, 0.45 + (lr['1'] || 0));
    for (let b = 0; b < bars; b++) {
        if (b > 0 && rng.next() < repeatBar) { rhythms.push(rhythms[b % (b >= 2 && bars === 4 && rng.next() < 0.5 ? 2 : 1)] || rhythms[0]); continue; }
        let want = Math.round(fromQ(rng, P.density_per_bar, 1, 16));
        if (cat === 'arp') {
            const rates = P.arp && P.arp.rate16 ? Object.entries(P.arp.rate16).map(([k, w]) => [Number(k), w]) : [[1, 1], [2, 1]];
            const r = Math.max(1, Math.round(pickW(rng, rates)));
            rhythms.push(Array.from({ length: Math.floor(16 / r) }, (_, i) => i * r));
            continue;
        }
        if (cat === 'pad') want = Math.min(want, 2);
        rhythms.push(barSteps(rng, P, Math.max(1, want)));
    }
    const onsets = [];
    rhythms.forEach((r, b) => r.forEach(s => onsets.push(b * BAR + s * STEP)));
    const total = bars * BAR;
    const gapAfter = (i) => (i + 1 < onsets.length ? onsets[i + 1] : total) - onsets[i];

    const notes = [];
    const push = (t, semi, v, g) => notes.push(Object.assign({ t, v, g: Math.max(6, Math.round(g)) }, encodePitch(semi, mode)));

    if (cat === 'bass' || cat === 'seq' || cat === 'lead' || cat === 'fx') {
        let prev = null;
        /* seq: one riff, moved to each chord's root */
        const riff = [];
        onsets.forEach((t, i) => {
            const ch = chordAt(t), step = (t % BAR) / STEP;
            const tones = chordTones(ch);
            let semi;
            if (cat === 'bass') {
                const newChord = i === 0 || chordAt(onsets[i - 1]) !== ch;
                const nextCh = i + 1 < onsets.length ? chordAt(onsets[i + 1]) : loop[0];
                if (!newChord && nextCh !== ch && rng.next() < chromatic * 3) semi = nextCh.root + (rng.next() < 0.5 ? 1 : -1);   /* approach note */
                else if (!newChord && prev != null && rng.next() < repeatP) semi = prev;
                else if (newChord || rng.next() < 0.55) semi = ch.root;
                else semi = pickW(rng, [[ch.root, 3 * (1 + pcw[ch.root % 12])], [tones[2], 1.5 * (1 + pcw[tones[2] % 12])],
                                         [tones[1], 0.7], [snapScale(ch.root + 2, mode), pcw[(ch.root + 2) % 12] * 2],
                                         [snapScale(ch.root - 2, mode), pcw[(ch.root + 10) % 12] * 2]]);
                if (semi === prev) { /* a repeat keeps its octave */ }
                else {
                    /* keep the line around the part's register (pitch classes
                     * above G sit below the root), octave jumps as measured */
                    const pc = ((semi % 12) + 12) % 12;
                    semi = center + (pc > 7 ? pc - 12 : pc) + (rng.next() < octP ? 12 : 0);
                }
            } else if (cat === 'seq') {
                const pos = (t % BAR) / BAR;
                const k = riff.findIndex(x => Math.abs(x.pos - pos) < 1e-6);
                if (k >= 0 && t >= BAR) semi = riff[k].rel + ch.root;
                else {
                    const rel = prev == null || rng.next() > repeatP ? pickW(rng, [[0, 3], [tones[2] - ch.root, 1.5], [12, 1], [tones[1] - ch.root, 1], [-5, 0.4]]) : riff.length ? riff[riff.length - 1].rel : 0;
                    riff.push({ pos, rel });
                    semi = rel + ch.root;
                }
                semi += center;
            } else if (cat === 'lead') {
                if (prev == null) semi = center + pickW(rng, tones.map((x, j) => [x, j === 0 ? 2 : 1]));
                else {
                    const ints = Object.entries(iv).map(([k, w]) => [Number(k), w]).filter(([k]) => Math.abs(k) <= 9);
                    semi = snapScale(prev + pickW(rng, ints), mode);
                    if (step % 4 === 0 && rng.next() < 0.6) {           /* strong steps lean on chord tones */
                        const near = tones.flatMap(x => [x - 12, x, x + 12]).map(x => x + center);
                        semi = near.reduce((a, b) => Math.abs(b - semi) < Math.abs(a - semi) ? b : a);
                    }
                    semi = Math.max(center - 7, Math.min(center + 19, semi));
                }
            } else {                                                     /* fx: sparse chord tones, wide register */
                semi = center + pickW(rng, tones.map(x => [x, 1]).concat([[tones[0] + 12, 0.6], [tones[0] - 12, 0.4]]));
            }
            prev = semi;
            const len = fromQ(rng, len16, 0.5, 16) * STEP;
            push(t, semi, velAt(rng, P, step, flat), Math.min(len, gapAfter(i) - (cat === 'fx' ? 0 : 1)));
        });
    } else if (cat === 'arp') {
        const shapes = P.arp && P.arp.shape ? Object.entries(P.arp.shape) : [['up', 1], ['updown', 1]];
        const shape = pickW(rng, shapes);
        const span = Math.max(1, Math.round(fromQ(rng, P.arp && P.arp.oct_span, 0.5, 2)));
        let idx = 0;
        onsets.forEach((t, i) => {
            const ch = chordAt(t), tones = chordTones(ch);
            const seq = [];
            for (let o = 0; o < span; o++) for (const x of tones) seq.push(x + 12 * o);
            let k;
            if (shape === 'up') k = idx % seq.length;
            else if (shape === 'down') k = seq.length - 1 - (idx % seq.length);
            else if (shape === 'updown') { const n = seq.length * 2 - 2 || 1; const p = idx % n; k = p < seq.length ? p : n - p; }
            else if (shape === 'static') k = 0;
            else k = Math.floor(rng.next() * seq.length);
            idx++;
            const step = (t % BAR) / STEP;
            push(t, center + seq[k], velAt(rng, P, step, flat), Math.min(fromQ(rng, len16, 0.5, 4) * STEP, gapAfter(i) - 1));
        });
    } else {                                                             /* chord, pad, keys, guitar: voiced chords */
        const poly = P.poly || {};
        const voices = Math.max(2, Math.min(4, Math.round(fromQ(rng, poly.voices, 2, 4))));
        const pow = cat === 'guitar' && poly.quality && rng.next() < (poly.quality.pow || 0);
        const inv = poly.inversion_share ? poly.inversion_share[1] : 0.3;
        onsets.forEach((t, i) => {
            const ch = chordAt(t), tones = chordTones(ch);
            let stack = pow ? [ch.root, ch.root + 7, ch.root + 12].slice(0, Math.max(2, voices))
                            : [...tones, ch.root + 12, tones[1] + 12].slice(0, voices);
            if (!pow && rng.next() < inv) stack = stack.slice(1).concat([stack[0] + 12]);
            const step = (t % BAR) / STEP;
            const v = velAt(rng, P, step, flat);
            const len = cat === 'pad' ? gapAfter(i) : Math.min(fromQ(rng, len16, 0.5, 16) * STEP, gapAfter(i));
            for (const x of stack) push(t, center + x, Math.max(1, v - (x === stack[0] ? 0 : 4)), len);
        });
    }
    return notes.length ? { notes, bars, mode } : null;
}

/* ---- the similarity gate ----
 * A generated melodic phrase is refused when it sits too close to a phrase in
 * a reference collection (fingerprints, optional): the same degree sequence,
 * or a bar with the same onsets and at most one degree different. */
export function loadGate(file) {
    if (!file || !existsSync(file)) return null;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const byCat = new Map();
    for (const p of doc.phrases || []) {
        if (!p.deg) continue;
        if (!byCat.has(p.cat)) byCat.set(p.cat, { seqs: new Set(), bars: [] });
        const e = byCat.get(p.cat), degs = p.deg.split(' ');
        e.seqs.add(p.deg);
        let k = 0;
        for (const on of p.on || []) {
            const steps = on ? on.split(' ').map(x => x.split(':')[0]) : [];
            e.bars.push({ steps: steps.join(' '), degs: degs.slice(k, k + steps.length) });
            k += steps.length;
        }
    }
    return byCat;
}
function degToken(n) { return String(n.deg + 7 * (n.oct || 0)) + (n.acc > 0 ? '#' : n.acc < 0 ? 'b' : ''); }
export function tooClose(gate, cat, notes, bars) {
    const e = gate && gate.get(cat);
    if (!e) return false;
    const sorted = notes.slice().sort((a, b) => a.t - b.t);
    if (e.seqs.has(sorted.map(degToken).join(' '))) return true;
    for (let b = 0; b < bars; b++) {
        const inBar = sorted.filter(n => n.t >= b * BAR && n.t < (b + 1) * BAR);
        if (inBar.length < 4) continue;
        const steps = inBar.map(n => Math.round((n.t - b * BAR) / STEP)).join(' ');
        const degs = inBar.map(degToken);
        for (const r of e.bars) {
            if (r.steps !== steps) continue;
            let diff = 0;
            for (let i = 0; i < degs.length && diff <= 1; i++) if (degs[i] !== r.degs[i]) diff++;
            if (diff <= 1) return true;
        }
    }
    return false;
}
