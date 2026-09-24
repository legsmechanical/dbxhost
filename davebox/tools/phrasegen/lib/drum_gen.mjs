/* drum_gen — single-drum phrases drawn PATTERN FIRST.
 *
 * Drawing each of the 16 steps on its own reproduces a style's per-step
 * shares but not its patterns: four kicks that each land on a downbeat 90 %
 * of the time make four-on-the-floor only 66 % of the time, and the rest are
 * shapes the style never plays. So a phrase first draws its FAMILY — the
 * measurer's own labels (research/refs/beats/stats/<style>.json families:
 * "four-on-the-floor", "kick 1+9 +8th pushes", "backbeat 5·13", "8ths", "ohh
 * offbeats" …) at the share of the style's bars that play it — then its steps
 * from the per-step shares, kept only when they make that family.
 *
 * → { notes, bars, pads } in genDrum's shape, or null (the caller falls back).
 */
import { BAR, encodeNotes } from './phrase.mjs';
import { beatStats, kickFam, bbFam, tkFam, laneOf } from './beat_layer.mjs';

const STEP = BAR / 16;
const listOf = (x) => Array.isArray(x) ? x.map(f => [f.family, f.bar_share]) : Object.entries(x || {});
function pick(rng, list) {
    let tot = 0; for (const [, w] of list) tot += Math.max(0, w);
    let r = rng.next() * tot;
    for (const [v, w] of list) { r -= Math.max(0, w); if (r <= 0) return v; }
    return list.length ? list[list.length - 1][0] : null;
}
function fromQ(rng, q, lo, hi) {
    if (!Array.isArray(q)) return (lo + hi) / 2;
    const [a, m, b] = q, u = rng.next();
    const v = u < 0.5 ? a + (m - a) * Math.sqrt(u * 2) : m + (b - m) * Math.sqrt((u - 0.5) * 2);
    return Math.max(lo, Math.min(hi, v));
}
function gauss(rng) { return (rng.next() + rng.next() + rng.next() - 1.5) * 2; }

export function ohFam(O) {
    if (!O.size) return null;
    const off = [2, 6, 10, 14].filter(x => O.has(x)).length;
    if (off >= 2) return 'ohh offbeats';
    if ([...O].every(x => x === 14 || x === 15)) return 'ohh at 15/16';
    if (off) return 'ohh one offbeat';
    if ([0, 4, 8, 12].some(x => O.has(x))) return 'ohh on beats';
    return 'ohh 16th offbeats';
}
/* steps a family cannot be without (the rest are drawn) */
function required(kind, fam) {
    if (kind === 'kick') {
        if (fam === 'four-on-the-floor') return [0, 4, 8, 12];
        if (fam.startsWith('kick 1+9')) return fam.endsWith('+a beat') ? [0, 8, 4] : [0, 8];
        if (fam.startsWith('two-step')) return [0, 10];
        if (fam.startsWith('broken')) return [0, 10, 11];
        if (fam.startsWith('kick 1')) return [0];
        if (fam.startsWith('drop: kick 9')) return [8];
        if (fam.startsWith('drop (slow')) return [4, 12];
        return [];
    }
    if (kind === 'snare') return { 'backbeat 5·13': [4, 12], 'snare every beat': [0, 4, 8, 12], 'half-time 9': [8],
                                   'snare 13 only': [12], 'snare 5 only': [4] }[fam] || [];
    if (kind === 'hat') return { quarters: [0, 4, 8, 12], 'offbeat 8ths': [2, 6, 10, 14], '8ths': [0, 2, 4, 6, 8, 10, 12, 14] }[fam] || [];
    return [];
}
/* how many hits a timekeeper family holds (tkFam's own bounds) */
const SIZE = { '16ths': [12, 16], '8ths': [7, 9], quarters: [3, 5], sparse: [1, 5], 'offbeat 8ths': [3, 5], 'busy (8ths+16ths)': [6, 11] };
/* a bar's steps in family `fam`: the required steps plus draws by per-step
 * share, the count from the role's hits per bar; kept when the family matches */
function barIn(rng, kind, fam, famFn, P, hpb) {
    const req = required(kind, fam);
    for (let tries = 0; tries < 300; tries++) {
        const [lo, hi] = kind === 'hat' ? (SIZE[fam] || [1, 16]) : [1, 16];
        const n = Math.max(req.length, lo, Math.min(hi, Math.round(fromQ(rng, hpb, 1, 16)) + (tries > 150 ? Math.round(gauss(rng)) : 0)));
        const set = new Set(req);
        const w = P.map((x, s) => set.has(s) ? 0 : Math.max(0.002, x || 0));
        while (set.size < n) {
            const tot = w.reduce((a, b) => a + b, 0);
            if (!(tot > 0)) break;
            let r = rng.next() * tot, s = 0;
            for (; s < 15; s++) { r -= w[s]; if (r <= 0) break; }
            set.add(s); w[s] = 0;
        }
        if (famFn(set) === fam) return set;
    }
    return null;
}

const KIND = { kick: 'kick', snare: 'snare', hat: 'hat', cymb: 'ride' };
const VOICE_PITCH = { clap: 39, rim: 37 };

/* one phrase of `cat` in a style (by name), or null when the style has no
 * family numbers for it. `forceFam` asks for one family (a beat that needs it). */
export function genDrumFamily(cat, styleName, rng, forceFam) {
    const S = beatStats(styleName);
    const kind = KIND[cat];
    if (!S || !S.families || !kind) return null;
    const F = S.families, R = S.roles || {};
    let famList, famFn, role, pitch = null;
    if (cat === 'kick') { famList = listOf(F.kick).filter(([f]) => f !== 'no kick'); famFn = kickFam; role = 'kick'; }
    else if (cat === 'snare') {
        famList = listOf(F.backbeat).filter(([f]) => f !== 'no snare'); famFn = bbFam;
        const voice = pick(rng, listOf(F.backbeat_voice).map(([v, w]) => [v.split('+')[0], w]));
        role = voice === 'clap' || voice === 'rim' ? voice : 'snare';
        pitch = VOICE_PITCH[role] || null;
    } else if (cat === 'hat') {
        famList = listOf(F.timekeeper).filter(([f]) => f !== 'no hats'); famFn = tkFam;
        role = pick(rng, listOf(F.timekeeper_voice).filter(([v]) => v === 'chh' || v === 'phh'));
    } else { famList = listOf(F.timekeeper).filter(([f]) => f !== 'no hats'); famFn = tkFam; role = 'ride'; pitch = 51; }
    const Rr = R[role] || R[kind];
    const P = Rr && (Rr.P_when_used || Rr.P);
    if (!famList.length || !P || !Rr.hits_per_bar) return null;
    const fam0 = pick(rng, famList), fam = forceFam || fam0;
    const kindOf = cat === 'cymb' ? 'hat' : cat;     /* a ride keeps time like hats */
    const bar1 = barIn(rng, kindOf, fam, famFn, P, Rr.hits_per_bar);
    if (!bar1) return null;
    /* a second bar when the style's 2-bar grooves change: the same family
     * redrawn, or the first bar with a fill at its end */
    const V = S.variation && S.variation.two_bar;
    const two = rng.next() < ((V && V.share_second_bar_differs) || 0.25);
    let bar2 = null;
    if (two) {
        if (rng.next() < 0.6) bar2 = barIn(rng, kindOf, fam, famFn, P, Rr.hits_per_bar);
        else if (cat === 'snare' || cat === 'kick') bar2 = new Set([...bar1].filter(s => s < 12).concat([12, 13, 14, 15].filter(s => rng.next() < 0.5)));
    }
    const bars = bar2 && [...bar2].join() !== [...bar1].join() ? 2 : 1;
    /* open hats: their own family, never on a closed hat's step */
    const O = [];
    if (cat === 'hat') {
        const of = pick(rng, listOf(F.open_hat));
        if (of && of !== 'no ohh' && R.ohh && R.ohh.P_when_used) {
            for (let t = 0; t < 200; t++) {
                const n = Math.max(1, Math.round(fromQ(rng, R.ohh.hits_per_bar, 1, 4)));
                const set = new Set();
                const w = R.ohh.P_when_used.map(x => Math.max(0.002, x || 0));
                while (set.size < n) { const tot = w.reduce((a, b) => a + b, 0); let r = rng.next() * tot, s = 0; for (; s < 15; s++) { r -= w[s]; if (r <= 0) break; } set.add(s); w[s] = 0; }
                if (ohFam(set) === of) { O.push(...set); break; }
            }
        }
    }
    /* levels: the role's median and its per-step accents */
    const vel = S.velocity && (S.velocity[role] || S.velocity[kind]);
    const mean = vel && vel.mean ? vel.mean[1] : 100, iqr = vel && vel.mean ? (vel.mean[2] - vel.mean[0]) : 16;
    const acc = (vel && vel.accent) || [];
    const notes = [];
    for (let b = 0; b < bars; b++) for (const s of [...(b ? bar2 : bar1)].sort((x, y) => x - y)) {
        const open = O.includes(s);
        const v = Math.round(Math.max(1, Math.min(127, mean + (acc[s] || 0) + gauss(rng) * iqr / 4)));
        const n = { t: b * BAR + s * STEP, v, g: open ? 26 : 6 };
        if (cat === 'hat') n.p = open ? 46 : role === 'phh' ? 44 : 42;
        else if (pitch) n.p = pitch;
        notes.push(n);
    }
    /* open hats on steps the closed pattern left free */
    if (cat === 'hat') for (let b = 0; b < bars; b++) for (const s of O)
        if (!(b ? bar2 : bar1).has(s)) notes.push({ t: b * BAR + s * STEP, v: Math.round(Math.max(1, Math.min(127, mean + (acc[s] || 0)))), g: 26, p: 46 });
    notes.sort((a, b) => a.t - b.t);
    const sounds = new Set(notes.map(n => n.p));
    if (cat === 'hat' && sounds.size === 1 && notes[0].p === 42) notes.forEach(n => { delete n.p; });
    return { notes, bars, fam, pads: cat === 'hat' && sounds.size > 1 ? [...sounds] : null };
}

/* A beat's source of fresh lanes: one phrase of `cat` in family `fam`, as a
 * lane (lib/beat_layer.mjs laneOf), for a family the style's pool lacks. */
export function laneMaker(style) {
    let k = 0;
    return (cat, fam, rng) => {
        const r = genDrumFamily(cat, style, rng, fam);
        return r ? laneOf({ id: 'mk:' + (style || 'basic') + ':' + cat + ':' + (k++), cat, bars: r.bars, src: 'gen:', n: encodeNotes(cat, r.notes) }) : null;
    };
}
