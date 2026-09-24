/* beat_layer — whole-kit beats built by LAYERING single-drum phrases of one
 * style: a kick, a backbeat (snare / clap / rim), hats, and sometimes a ride
 * or percussion, picked so they sit together the way that style's drums do.
 *
 * "The way they sit together" is research/refs/beats/stats/<style>.json:
 * for each pair of drums and each of the 16 steps, how likely B plays when A
 * does and when A doesn't (joint.pairs), and how many hits a groove bar holds
 * (fills.hits_per_groove_bar). A combination is scored by how likely its
 * pattern is under those numbers; the best of a sample is kept when it beats
 * what a random pairing of the same pool scores. Levels are set relative to
 * the kick as measured (velocity.<role>.rel_to_kick), and the whole kit plays
 * on ONE grid: a lane recorded with its own timing sets it, the rest follow.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BAR, decodeNotes } from './phrase.mjs';
import { RESEARCH_DIR } from './paths.mjs';
import { STYLE_FILES } from './style_plan.mjs';
import { styleOfName, feelProfile, applyFeel, drawGrid, fitGrid, isQuantised, stepOnGrid, gridTicks, feelRng, DRUM_ROLE } from './feel.mjs';

const STATS = join(RESEARCH_DIR, 'refs', 'beats', 'stats');
const MUTATE = process.env.PHRASEGEN_MUTATE || '';
export const LANE_CATS = ['kick', 'snare', 'hat', 'cymb', 'perc'];
const DEFAULT_PITCH = { kick: 36, snare: 38, hat: 42, cymb: 51, tom: 45 };
/* a one-pad percussion lane plays the style's commonest hand percussion */
const PERC_PITCH = { tamb: 54, shaker: 70, cowbell: 56, conga_bongo: 63, timbale: 65, clave_block: 75 };
const PAIR_ROLES = new Set(['kick', 'snare', 'clap', 'rim', 'chh', 'phh', 'ohh', 'ride']);
const MIN_PAIR_SONGS = 5, MIN_FLAVOUR_SONGS = 8;

const statsCache = new Map();
/* the joint numbers for a style name: its flavour's when it has the songs, else its style's */
export function beatStats(styleName) {
    const [file, fk] = styleOfName(styleName || '');
    const key = file + '|' + (fk || '');
    if (!statsCache.has(key)) {
        const f = join(STATS, file + '.json');
        const base = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
        const fl = fk && base && base.flavours ? base.flavours[fk] : null;
        statsCache.set(key, fl && (fl.songs || 0) >= MIN_FLAVOUR_SONGS && fl.joint ? fl : base);
    }
    return statsCache.get(key);
}

/* ---- lanes ---- */

/* A candidate → { id, cat, bars, timed, grid, hits: [{ gs (global step), v, g, p, t }] }.
 * `gs` is the step each note was written on: from the phrase's record when it
 * was grooved, the straight grid when quantised, and the phrase's own fitted
 * grid when it was recorded. */
export function laneOf(p) {
    const notes = decodeNotes(p.cat, p.n);
    if (!notes.length || ![1, 2, 4].includes(p.bars)) return null;
    const pitch = (n) => n.p ?? DEFAULT_PITCH[p.cat] ?? null;
    let gsOf, timed = false, grid = null;
    if (p.sk) { const sk = p.sk.split(' ').map(Number); gsOf = (n, i) => sk[i]; grid = p.grv; }
    else if (isQuantised(notes)) gsOf = (n) => Math.round(n.t / 24);
    else {
        timed = true;
        const f = fitGrid(notes.map(n => n.t));
        grid = { r8: f.r8, r16: f.r16 };
        const G = gridTicks(f.r8, f.r16);
        gsOf = (n) => { let b = Math.floor(n.t / BAR); const s = stepOnGrid(n.t, G); if (s === 0 && n.t % BAR > BAR / 2) b++; return b * 16 + s; };
    }
    const hits = notes.map((n, i) => ({ gs: gsOf(n, i), v: n.v, g: n.g, p: pitch(n), t: n.t }));
    return { id: p.id, cat: p.cat, bars: p.bars, timed, grid, hits, src: p.src };
}

/* the pattern a set of lanes plays over L bars: role → Set of global steps */
function patternOf(lanes, L) {
    const pat = new Map();
    for (const ln of lanes) for (const h of ln.hits) {
        const role = DRUM_ROLE[h.p];
        if (!role) continue;
        for (let rep = 0; rep < L / ln.bars; rep++) {
            if (!pat.has(role)) pat.set(role, new Set());
            pat.get(role).add(((h.gs % (ln.bars * 16)) + 16 * ln.bars) % (16 * ln.bars) + rep * ln.bars * 16);
        }
    }
    return pat;
}

/* Mean log-likelihood of the pattern under the style's per-step pair
 * conditionals: each drum on the steps it plays beside the others. (Measured:
 * it prefers a real kit to the same kit with its snare moved two steps 3 in 4
 * times; it does NOT prefer a real kit to its drums re-paired with another
 * kit's of the same style — same-style parts combine as plausibly as a real
 * drummer's, which is what layering relies on.) */
export function scorePattern(pat, L, S) {
    if (MUTATE === 'scorezero') return 0;
    const pairs = S && S.joint && S.joint.pairs;
    if (!pairs) return 0;
    let sum = 0, n = 0;
    const roles = [...pat.keys()].filter(r => PAIR_ROLES.has(r));
    for (const a of roles) for (const b of roles) {
        if (a === b) continue;
        const P = pairs[a + '|' + b] || pairs[b + '|' + a];
        if (!P) continue;
        const given = P['P_' + b + '_given_' + a], givenNo = P['P_' + b + '_given_no_' + a], ns = P['n_songs_' + a];
        if (!given || !givenNo) continue;
        for (let gs = 0; gs < L * 16; gs++) {
            const s = gs % 16;
            const aOn = pat.get(a).has(gs), bOn = pat.get(b).has(gs);
            const pr = aOn ? given[s] : givenNo[s];
            if (pr == null || (aOn && ns && ns[s] < MIN_PAIR_SONGS)) continue;
            const q = Math.max(0.02, Math.min(0.98, pr));
            sum += Math.log(bOn ? q : 1 - q); n++;
        }
    }
    return n ? sum / n : 0;
}
function hitsPerBar(pat, L) { let n = 0; for (const s of pat.values()) n += s.size; return n / L; }
function densityOk(pat, L, S) {
    const q = S && S.fills && S.fills.hits_per_groove_bar;
    if (!Array.isArray(q)) return true;
    const h = hitsPerBar(pat, L);
    return h >= q[0] * 0.6 && h <= q[2] * 1.4;
}

/* ---- assembly ---- */

function presence(S, roles) { let p = 0; for (const r of roles) p = Math.max(p, (S && S.roles && S.roles[r] && S.roles[r].presence) || 0); return p; }
function pickW(rng, pairs) {
    let tot = 0; for (const [, w] of pairs) tot += Math.max(0, w);
    let r = rng.next() * tot;
    for (const [v, w] of pairs) { r -= Math.max(0, w); if (r <= 0) return v; }
    return pairs.length ? pairs[pairs.length - 1][0] : null;
}

/* ---- families: the measurer's labels (beats_measure.py kick_fam / bb_fam /
 * tk_fam), on one bar's steps 0–15 ---- */
const push = (extra) => [...extra].some(i => i % 2) ? '+16th pushes' : '+8th pushes';
const has = (S, ...xs) => xs.every(x => S.has(x));
const minus = (S, ...xs) => new Set([...S].filter(x => !xs.includes(x)));
export function kickFam(K) {
    if (!K.size) return 'no kick';
    if (has(K, 0, 4, 8, 12)) return 'four-on-the-floor';
    const on1 = K.has(0), on3 = K.has(8);
    if (on1 && on3) {
        if (K.has(4) || K.has(12)) return 'kick 1+9 +a beat';
        return K.size === 2 ? 'kick 1+9' : 'kick 1+9 ' + push(minus(K, 0, 8));
    }
    if (on1) {
        if (K.size === 1) return 'kick 1 only';
        if (K.size === 2 && K.has(10)) return 'two-step 1·11';
        if (has(K, 0, 10, 11)) return 'broken 1·11·12';
        if (K.has(10)) return 'two-step 1·11 ' + push(minus(K, 0, 10));
        return 'kick 1 ' + push(minus(K, 0)) + ', no 9';
    }
    if (on3) return 'drop: kick 9, not 1';
    if (has(K, 4, 12)) return 'drop (slow count): kick 5+13, not 1/9';
    return 'kick off the beats';
}
export function bbFam(B) {
    if (!B.size) return 'no snare';
    if (has(B, 0, 4, 8, 12)) return 'snare every beat';
    const b2 = B.has(4), b3 = B.has(8), b4 = B.has(12);
    if (b2 && b4) return 'backbeat 5·13';
    if (b3 && !b2 && !b4) return 'half-time 9';
    if (b4 && !b2) return 'snare 13 only';
    if (b2 && !b4) return 'snare 5 only';
    return 'snare off the beats';
}
export function tkFam(T) {
    const n = T.size;
    if (!n) return 'no hats';
    if (n >= 12) return '16ths';
    const off = [2, 6, 10, 14].filter(x => T.has(x)).length, on = [0, 4, 8, 12].filter(x => T.has(x)).length;
    const ev = [...T].filter(x => x % 2 === 0).length;
    if (off >= 3 && on <= 1 && n <= 5) return 'offbeat 8ths';
    if (ev >= 7 && n <= 9) return '8ths';
    if (on >= 3 && n <= 5) return 'quarters';
    if (n <= 5) return 'sparse';
    return 'busy (8ths+16ths)';
}
/* a core family's name → [kick family, backbeat family] */
const SPECIAL_CORE = {
    'one-drop, fast count (kick + snare/rim on 9, no kick on 1)': ['drop: kick 9, not 1', 'half-time 9'],
    'one-drop, slow count (kick + snare/rim on 5·13, no kick on 1/9)': ['drop (slow count): kick 5+13, not 1/9', 'backbeat 5·13'],
    'steppers (four-on-the-floor + snare/rim on 9)': ['four-on-the-floor', 'half-time 9'],
};
function coreParts(core) {
    if (SPECIAL_CORE[core]) return SPECIAL_CORE[core];
    const i = core.lastIndexOf(' + ');
    return i < 0 ? null : [core.slice(0, i), core.slice(i + 3)];
}
/* a lane's first bar, as the measurer labels it */
export function laneFamily(ln) {
    const bar1 = (pred) => new Set(ln.hits.filter(h => h.gs >= 0 && h.gs < 16 && pred(DRUM_ROLE[h.p])).map(h => h.gs));
    if (ln.cat === 'kick') return kickFam(bar1(() => true));
    if (ln.cat === 'snare') return bbFam(bar1(() => true));
    if (ln.cat === 'hat') {
        /* the measurer's timekeeper: closed + open hats, pedal only when there are none */
        const c = bar1(r => r === 'chh' || r === 'ohh');
        return tkFam(c.size ? c : bar1(r => r === 'phh'));
    }
    if (ln.cat === 'cymb') return tkFam(bar1(r => r === 'ride'));
    return null;
}
const famOf = (ln) => ln.fam !== undefined ? ln.fam : (ln.fam = laneFamily(ln));
const listOf = (x) => Array.isArray(x) ? x.map(f => [f.family, f.bar_share]) : Object.entries(x || {});

/* The lanes a beat of this style has, from its measured families: a core
 * (kick family + backbeat family) and a timekeeper (family + voice), each
 * drawn as often as the style's bars show it; percussion by presence. Lanes
 * are filtered to the drawn families. → { cat: [lane] } or null */
function drawShape(S, rng, pools) {
    const F = S && S.families;
    if (!F) return null;
    const uC = rng.next(), uT = rng.next(), uV = rng.next(), uP = rng.next();
    const pick = (list, u) => { let tot = 0; for (const [, w] of list) tot += w; let r = u * tot; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list.length ? list[list.length - 1][0] : null; };
    const core = pick(listOf(F.core), uC), parts = core && coreParts(core);
    if (!parts) return null;
    const [kf, bf] = parts;
    const tf = pick(listOf(F.timekeeper), uT), tv = pick(listOf(F.timekeeper_voice), uV);
    const want = {};
    /* a family the pool has no lane for is drawn fresh (pools.make), so the
     * beats follow the style's families rather than whatever lanes exist */
    const lanesIn = (cat, fam) => {
        const have = pools[cat].filter(l => famOf(l) === fam);
        if (have.length >= 2 || !pools.make) return have;
        const made = [];
        for (let i = 0; i < 3; i++) { const l = pools.make(cat, fam, rng); if (l && famOf(l) === fam) made.push(l); }
        return have.concat(made);
    };
    if (MUTATE === 'shufflelanes') {
        for (const c of ['kick', 'snare', 'hat']) if (pools[c].length) want[c] = pools[c];
    } else {
        if (kf !== 'no kick') want.kick = lanesIn('kick', kf);
        if (bf !== 'no snare') want.snare = lanesIn('snare', bf);
        if (tf && tf !== 'no hats') want[tv === 'ride' ? 'cymb' : 'hat'] = lanesIn(tv === 'ride' ? 'cymb' : 'hat', tf);
    }
    if (!want.kick && !want.snare) return null;
    if (Object.values(want).some(l => !l.length)) return null;
    if (pools.perc.length && uP < presence(S, ['tamb', 'shaker', 'cowbell', 'conga_bongo', 'timbale', 'clave_block'])) want.perc = pools.perc;
    return want;
}

/* one beat from `pools` ({ cat: [lane] }) for a style, or null.
 * → { lanes, L, pat, score, floor } */
export function assembleBeat(styleName, pools, rng, used, opts = {}) {
    const S = beatStats(styleName);
    if (!S) return null;
    const shape = drawShape(S, rng, pools);
    if (!shape) return null;
    const cats = Object.keys(shape);
    const K = opts.k || 24;
    const pickLane = (cat, avoidUsed) => {
        const list = shape[cat];
        const fresh = avoidUsed ? list.filter(l => (used.get(l.id) || 0) < 2) : list;
        const from = fresh.length ? fresh : list;
        return from[Math.floor(rng.next() * from.length)];
    };
    const combo = (avoidUsed) => {
        const lanes = cats.map(c => pickLane(c, avoidUsed));
        if (lanes.filter(l => l.timed).length > 1) {
            const g = lanes.filter(l => l.timed).map(l => l.grid);
            if (g.some(x => Math.abs(x.r8 - g[0].r8) > 0.04 || Math.abs(x.r16 - g[0].r16) > 0.04)) return null;
        }
        const L = Math.max(...lanes.map(l => l.bars));
        if (lanes.some(l => L % l.bars)) return null;
        const pat = patternOf(lanes, L);
        if (MUTATE !== 'shufflelanes' && !densityOk(pat, L, S)) return null;
        return { lanes, L, pat, score: scorePattern(pat, L, S) };
    };
    /* the floor: what the same shape scores when its lanes are paired at random */
    const rand = [];
    for (let i = 0; i < K; i++) { const c = combo(false); if (c) rand.push(c.score); }
    if (!rand.length) return null;
    rand.sort((a, b) => a - b);
    const floor = rand[Math.floor(rand.length * 0.6)];
    let best = null;
    for (let i = 0; i < K; i++) { const c = combo(true); if (c && (!best || c.score > best.score)) best = c; }
    if (!best || (rand.length >= 4 && best.score < floor)) return null;
    return Object.assign(best, { floor, S });
}

/* The assembled lanes as one kit: levels set against the kick, one grid, the
 * style's feel over whatever was on the straight grid. → { notes, bars, grid, feel } */
export function renderBeat(styleName, beat, rng) {
    const { lanes, L, S } = beat;
    const V = (S && S.velocity) || {};
    const kickMean = (V.kick && V.kick.mean && V.kick.mean[1]) || 110;
    const straight = [], timed = [];
    const percPitch = pickW(rng, Object.entries(PERC_PITCH).map(([r, p]) => [p, (S.roles && S.roles[r] && S.roles[r].presence) || 0.01]));
    for (const ln of lanes) {
        /* each drum of a lane moved to its measured level against the kick,
         * keeping its own accents */
        const pitchOf = (h) => h.p ?? (ln.cat === 'perc' ? percPitch : DEFAULT_PITCH[ln.cat]);
        const shiftOf = new Map();
        for (const p of new Set(ln.hits.map(pitchOf))) {
            const hs = ln.hits.filter(h => pitchOf(h) === p), mean = hs.reduce((a, h) => a + h.v, 0) / hs.length;
            const role = DRUM_ROLE[p] || 'perc';
            const rel = role === 'kick' ? 0 : V[role] && typeof V[role].rel_to_kick === 'number' ? V[role].rel_to_kick : -20;
            shiftOf.set(p, MUTATE === 'flatvel' ? 0 : kickMean + rel - mean);
        }
        for (let rep = 0; rep < L / ln.bars; rep++) for (const h of ln.hits) {
            const p = pitchOf(h);
            const v = Math.max(1, Math.min(127, Math.round(h.v + shiftOf.get(p))));
            if (ln.timed) timed.push({ t: h.t + rep * ln.bars * BAR, v, g: h.g, p });
            else straight.push({ t: (h.gs + rep * ln.bars * 16) * 24, v, g: h.g, p, _s: h.gs + rep * ln.bars * 16 });
        }
    }
    const [file, fk] = styleOfName(styleName || '');
    const prof = feelProfile(file, fk);
    const tl = lanes.find(l => l.timed);
    const grid = MUTATE === 'noreconcile' ? drawGrid(prof, rng) : tl ? tl.grid : (lanes.find(l => l.grid && (l.grid.r8 >= 0.54 || l.grid.r16 >= 0.54)) || {}).grid || drawGrid(prof, rng);
    const r = applyFeel('beat', straight, L, prof, rng, grid);
    const notes = r.notes.concat(timed).sort((a, b) => a.t - b.t);
    return { notes, bars: L, grid, feel: r.feel };
}

/* the pools for a style name: its own lanes, topped up from its parent style's
 * where a named style has fewer than three of a kind */
export function poolsFor(styleName, byStyle, parentName) {
    const own = byStyle.get(styleName) || {}, par = parentName != null ? byStyle.get(parentName) || {} : {};
    const out = {};
    for (const c of LANE_CATS) {
        const a = own[c] || [];
        out[c] = a.length >= 3 || parentName == null ? a.slice() : a.concat(par[c] || []);
    }
    return out;
}
export { patternOf };
