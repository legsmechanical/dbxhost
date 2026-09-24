/* feel — swing, micro-timing and ghost notes, per style and role, laid over a
 * phrase that was made (or recorded) on a straight 16th grid.
 *
 * The numbers are research/refs/beats/groove/<style>.json (method in its
 * README), with the style-hallmark priors (lib/priors.mjs) filling what the
 * MIDI cannot show: most of it was typed in on a grid, so its swing share is a
 * lower bound and some styles that plainly swing measure straight.
 *
 * The swung grid is the measurer's own (beats_measure.py grid_pts): within a
 * beat the four 16th slots sit at 0, s8·r16, s8, s8 + (4 − s8)·r16 sixteenths,
 * s8 = 4·r8 — r8 / r16 being the long note's share of an 8th / 16th pair
 * (0.50 straight, 0.67 triplet). A note keeps the step it was written on:
 * stepOnGrid() on the phrase's own grid gives it back, which verification and
 * the duplicate check rely on, so every offset is clamped inside its slot.
 *
 * Only a QUANTISED phrase is given a feel. A recorded one keeps its own.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BAR } from './phrase.mjs';
import { RESEARCH_DIR } from './paths.mjs';
import { STYLE_FILES, FLAVOUR_NAME } from './style_plan.mjs';
import { hallmarkFeel } from './priors.mjs';
import { hashString } from './rng.mjs';

const BEAT = BAR / 4, STEP = BAR / 16;
const GROOVE_DIR = join(RESEARCH_DIR, 'refs', 'beats', 'groove');
/* test hooks (verify_feel.mjs --mutate): every random is still drawn, then overridden */
const MUTATE = process.env.PHRASEGEN_MUTATE || '';

/* ---- the grid ---- */

/* the four slot positions inside a beat, in ticks */
export function gridTicks(r8, r16) {
    const s8 = 4 * r8;
    return [0, s8 * r16 * STEP, s8 * STEP, (s8 + (4 - s8) * r16) * STEP];
}
export const STRAIGHT = gridTicks(0.5, 0.5);
export function tickOfStep(step, grid) { return Math.floor(step / 4) * BEAT + grid[step % 4]; }
/* straight tick → swung tick, piecewise linear between the slots (note ends move with their notes) */
export function warp(t, grid) {
    const beat = Math.floor(t / BEAT), f = t - beat * BEAT;
    const pts = [...grid, BEAT], k = Math.min(3, Math.floor(f / STEP));
    return beat * BEAT + pts[k] + (pts[k + 1] - pts[k]) * (f - k * STEP) / STEP;
}
/* a tick → the 16th step (0–15 within its bar) it was written on, on a grid */
export function stepOnGrid(t, grid) {
    const inBar = ((t % BAR) + BAR) % BAR, beat = Math.floor(inBar / BEAT), f = inBar - beat * BEAT;
    const pts = [...grid, BEAT];
    let k = 0;
    for (let i = 1; i < 5; i++) if (Math.abs(f - pts[i]) < Math.abs(f - pts[k])) k = i;
    return (beat * 4 + k) % 16;
}
/* how far a note on `slot` may move and stay nearest its own slot */
function slotRoom(grid, slot) {
    const pts = [grid[3] - BEAT, ...grid, BEAT];
    return Math.max(0, Math.min(pts[slot + 1] - pts[slot], pts[slot + 2] - pts[slot + 1]) / 2 - 1);
}
/* every onset within a tick of the straight grid */
export function isQuantised(notes) { return notes.every(n => { const r = ((n.t % STEP) + STEP) % STEP; return r <= 1 || r >= STEP - 1; }); }

/* The measurer's fit (beats_measure.py swing_fit): the (r8, r16) whose grid
 * sits nearest the onsets, with a small pull toward straight. A dimension with
 * too few onsets on its moving slot is reported straight. → { r8, r16, resid } */
export function fitGrid(ticks, minEv = 4) {
    const f = ticks.map(t => (((t % BEAT) + BEAT) % BEAT) / STEP);
    const RG = []; for (let r = 50; r <= 75; r++) RG.push(r / 100);
    let best = [9, 0.5, 0.5];
    for (const r8 of RG) for (const r16 of RG) {
        const s8 = 4 * r8, g = [0, s8 * r16, s8, s8 + (4 - s8) * r16, 4];
        if (g[3] > 3.5) continue;
        let c = 0;
        for (const x of f) { let d = 9; for (const p of g) d = Math.min(d, Math.abs(x - p)); c += Math.min(d, 0.5); }
        c = c / Math.max(1, f.length) + 0.05 * (Math.abs(r8 - 0.5) + Math.abs(r16 - 0.5));
        if (c < best[0] - 1e-12) best = [c, r8, r16];
    }
    let [, r8, r16] = best;
    const g = [0, 4 * r8 * r16, 4 * r8, 4 * r8 + (4 - 4 * r8) * r16, 4];
    let n8 = 0, n16 = 0; const ds = [];
    for (const x of f) {
        let k = 0; for (let i = 1; i < 5; i++) if (Math.abs(x - g[i]) < Math.abs(x - g[k])) k = i;
        const d = Math.abs(x - g[k]); ds.push(d);
        if (d < 0.3) { if (k === 2) n8++; if (k === 1 || k === 3) n16++; }
    }
    if (n8 < minEv) r8 = 0.5;
    if (n16 < minEv) r16 = 0.5;
    ds.sort((a, b) => a - b);
    return { r8, r16, resid: ds.length ? ds[ds.length >> 1] : 0 };
}
export const feelTag = (r8, r16) => r8 >= 0.54 ? (r8 >= 0.62 ? 'shuffle' : 'swing8') : r16 >= 0.54 ? 'swing16' : 'straight';

/* ---- where the numbers come from ---- */

const grooveCache = new Map();
function loadGroove(file) {
    if (!grooveCache.has(file)) {
        const f = join(GROOVE_DIR, file + '.json');
        grooveCache.set(file, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
    }
    return grooveCache.get(file);
}
/* A style NAME ("HOUSE", "GOTH", "BOOM BAP", "") → [style file, flavour key | null] */
export function styleOfName(name) {
    for (const [file, tag] of Object.entries(STYLE_FILES)) if (tag === (name || '')) return [file, null];
    const fk = Object.keys(FLAVOUR_NAME).find(k => FLAVOUR_NAME[k] === name);
    if (fk) for (const file of Object.keys(STYLE_FILES)) { const g = loadGroove(file); if (g && g.flavours && g.flavours[fk]) return [file, fk]; }
    return ['basics', null];
}

/* the groove role a note plays */
const DRUM_ROLE = { 35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 40: 'snare', 39: 'clap', 42: 'chh', 44: 'phh', 46: 'ohh',
    49: 'crash', 57: 'crash', 51: 'ride', 59: 'ride', 53: 'ride', 41: 'toms', 43: 'toms', 45: 'toms', 47: 'toms', 48: 'toms', 50: 'toms' };
const CAT_ROLE = { kick: 'kick', snare: 'snare', hat: 'chh', cymb: 'ride', tom: 'toms', perc: 'perc',
    bass: 'bass', chord: 'chords', pad: 'chords', keys: 'keys', guitar: 'guitar', lead: 'lead', fx: 'lead', arp: 'arp', seq: 'seq' };
export function roleOf(cat, n) { return (n && n.p != null && DRUM_ROLE[n.p]) || (cat === 'beat' && n && n.p != null ? 'perc' : CAT_ROLE[cat] || 'perc'); }
/* the swing group a role belongs to (groove.swing.by_role / melodic_swing.by_role) */
const SWING_GROUP = { chh: 'hats', phh: 'hats', ohh: 'hats', ride: 'ride', crash: 'ride', snare: 'snare', clap: 'snare', rim: 'snare',
    kick: 'kick', toms: 'kick', perc: 'perc' };
const MELODIC = new Set(['bass', 'chords', 'keys', 'guitar', 'lead', 'arp', 'seq']);
const groupOf = (role) => MELODIC.has(role) ? role : SWING_GROUP[role] || 'perc';

/* A measurement is thin, and yields, below these. */
const MIN_SWING_SONGS = 12, MIN_FLAVOUR_DRUM_SONGS = 8, MIN_STEP_SONGS = 5, MIN_GHOST_SONGS = 10;

/* The style's feel as the generator uses it:
 *   swing: { share, type8 (share of swung phrases that swing 8ths), amount8[q], amount16[q] }
 *   roles(role) → { tight, offMean[16], offSd[16], ghostShare, ghostByStep[16], participate }
 * Precedence: a confident hallmark prior on swing (the MIDI's share is a lower
 * bound) → the measured flavour (when it has the songs) → the measured style →
 * basics. */
const profCache = new Map();
export function feelProfile(file, flavour) {
    const key = file + '|' + (flavour || '');
    if (profCache.has(key)) return profCache.get(key);
    const base = loadGroove(file) || loadGroove('basics'), basics = loadGroove('basics');
    const fl = flavour && base && base.flavours ? base.flavours[flavour] : null;
    const flOk = fl && (fl.drum_songs || 0) >= MIN_FLAVOUR_DRUM_SONGS;
    const blocks = [flOk ? fl : null, base, basics].filter(Boolean);

    /* swing: first block with enough songs */
    let sw = null;
    for (const b of blocks) if (b.swing && (b.swing.songs || 0) >= MIN_SWING_SONGS && b.swing.share != null) { sw = b.swing; break; }
    const t8 = sw && sw.type ? (sw.type['8th'] || 0) : 0.5;
    const swing = { share: sw ? sw.share : 0.15, type8: t8,
                    amount8: (sw && sw.amount_8th) || [0.6, 0.64, 0.67], amount16: (sw && sw.amount_16th) || [0.55, 0.58, 0.64],
                    byRole: {}, from: 'measured' };
    for (const b of blocks.slice().reverse()) {
        if (b.swing && b.swing.by_role) Object.assign(swing.byRole, b.swing.by_role);
        if (b.melodic_swing && b.melodic_swing.by_role) Object.assign(swing.byRole, b.melodic_swing.by_role);
    }
    let quantisation = null;
    const pri = hallmarkFeel(file, flavour);
    if (pri) {
        if (pri.swing) {
            const s = pri.swing, conf = pri.confidence;
            const trusted = sw && !pri.measureUntrusted;
            if (s.share != null) {
                if (conf === 'high' || !trusted) swing.share = trusted ? Math.max(swing.share, s.share) : s.share;
                else if (conf === 'medium') swing.share = (swing.share + Math.max(swing.share, s.share)) / 2;
            }
            if (s.type8 != null && (conf === 'high' || !trusted)) swing.type8 = s.type8;
            if (s.ratio && (conf === 'high' || !trusted)) { if (swing.type8 >= 0.5) swing.amount8 = s.ratio; else swing.amount16 = s.ratio; }
            swing.from = 'prior:' + conf;
        }
        quantisation = pri.quantisation || null;
    }
    swing.share = Math.min(0.9, swing.share);

    const roleCache = new Map();
    const roles = (role) => {
        if (roleCache.has(role)) return roleCache.get(role);
        let R = null, Rb = null;
        for (const b of blocks) if (b.roles && b.roles[role] && (b.roles[role].songs || 0) >= MIN_SWING_SONGS) { R = b.roles[role]; break; }
        for (const b of blocks) if (b.roles && b.roles[role] && (b.roles[role].ghost_songs || 0) >= MIN_GHOST_SONGS) { Rb = b.roles[role]; break; }
        const minSongs = R === (fl && fl.roles && fl.roles[role]) ? MIN_STEP_SONGS : 8;
        const offMean = new Array(16).fill(0), offSd = new Array(16).fill(0);
        const fallbackSd = R && R.spread_humanised ? R.spread_humanised[1] : 1;
        for (let s = 0; s < 16; s++) {
            const ok = R && R.offset_mean && R.offset_mean[s] != null && (R.n_songs ? R.n_songs[s] >= minSongs : true);
            offMean[s] = ok && Math.abs(R.offset_mean[s]) <= 8 ? R.offset_mean[s] : 0;
            offSd[s] = R && R.offset_sd && R.offset_sd[s] != null ? R.offset_sd[s] : fallbackSd;
        }
        let q = R && R.quantised_share != null ? R.quantised_share : 0.6;
        if (quantisation === 'machine-tight') q = Math.max(q, 0.9);
        else if (quantisation === 'human' || quantisation === 'loose') q = Math.min(q, 0.2);
        let ghostShare = Rb ? Rb.ghost_share || 0 : 0;
        if (pri && pri.ghosts && pri.ghosts[role] != null) ghostShare = Math.max(ghostShare, pri.ghosts[role]);
        const group = groupOf(role);
        const br = swing.byRole[group];
        const out = { tight: q, offMean, offSd, ghostShare, ghostByStep: Rb ? Rb.ghost_by_step || null : null,
                      participate: br && br.swung_in_swung_songs != null ? br.swung_in_swung_songs : 0.8 };
        roleCache.set(role, out);
        return out;
    };
    const p = { file, flavour, swing, roles };
    profCache.set(key, p);
    return p;
}

/* ---- laying a feel over a phrase ---- */

/* The feel's own random stream for a phrase: mulberry32 over the phrase's
 * hashed seed. Not the generator's xorshift (lib/rng.mjs), whose neighbouring
 * draws are correlated enough to skew a conditioned draw — the swing amount
 * drawn after the swing decision came out low. */
export function feelRng(seed) {
    let a = hashString(seed);
    const next = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { next };
}

/* A value from a style's spread, not just its middle: quartiles [q1, med, q3]
 * read as a distribution whose tails reach one inter-quartile half beyond q1
 * and q3 — a style's groove is a range, and every phrase takes its own place
 * in it. */
function fromSpread(rng, q, lo, hi) {
    if (!Array.isArray(q)) return (lo + hi) / 2;
    const [a, m, b] = q, u = rng.next();
    const xs = [a - (m - a), a, m, b, b + (b - m)], k = Math.min(3, Math.floor(u * 4));
    return Math.max(lo, Math.min(hi, xs[k] + (xs[k + 1] - xs[k]) * (u * 4 - k)));
}
/* ≈ a standard normal (sum of three uniforms has SD 0.5) */
function gauss(rng) { return (rng.next() + rng.next() + rng.next() - 1.5) * 2; }
const GHOST_ROLES = new Set(['snare', 'clap', 'rim', 'kick']);

/* A grid for a style: swung or straight by the style's share, 8ths or 16ths
 * by its type, the amount from its quartiles. Draws the same randoms whatever
 * the outcome. → { r8, r16 } */
export function drawGrid(prof, rng) {
    const u1 = rng.next(), u2 = rng.next(), a8 = fromSpread(rng, prof.swing.amount8, 0.54, 0.75), a16 = fromSpread(rng, prof.swing.amount16, 0.54, 0.75);
    if (MUTATE === 'noswing' || u1 >= prof.swing.share) return { r8: 0.5, r16: 0.5 };
    if (MUTATE === 'bothswing75') return { r8: 0.75, r16: 0.75 };
    return u2 < prof.swing.type8 ? { r8: a8, r16: 0.5 } : { r8: 0.5, r16: a16 };
}

/* notes → { notes, feel, grv: { r8, r16 } }, the notes on the grid with the
 * role's timing and ghosts. `grid` forces one (a beat's lanes share theirs).
 * Repeated bars stay identical: the timing is one bar's template, drawn once. */
export function applyFeel(cat, notes, bars, prof, rng, grid) {
    const g = grid || drawGrid(prof, rng);
    const G = gridTicks(g.r8, g.r16);
    const swung = g.r8 >= 0.54 || g.r16 >= 0.54;
    /* per role: tight or human, whether it swings with the rest, and its bar template */
    const tmpl = new Map(), groupSwings = new Map();
    /* how far this phrase leans into its style's pushes and drags: one player
     * sits further back than another */
    const lean = 0.5 + rng.next();
    const templateOf = (role) => {
        if (tmpl.has(role)) return tmpl.get(role);
        const R = prof.roles(role);
        const uT = rng.next();
        const human = MUTATE === 'allhuman' ? true : uT >= R.tight;
        /* whether a part swings with the rest is decided per swing group (a hat
         * pattern's closed and open hats swing together) */
        const grp = groupOf(role);
        if (!groupSwings.has(grp)) groupSwings.set(grp, rng.next() < R.participate);
        const swings = swung && groupSwings.get(grp);
        const off = new Array(16).fill(0);
        for (let s = 0; s < 16; s++) {
            const z = gauss(rng);
            if (!human || MUTATE === 'nooffsets') continue;
            off[s] = R.offMean[s] * lean + z * R.offSd[s] * (MUTATE === 'jitter4x' ? 4 : 1) + (MUTATE === 'noclamp' ? 30 : 0);
        }
        const t = { R, human, grid: swings ? G : STRAIGHT, off };
        tmpl.set(role, t);
        return t;
    };
    const out = [];
    for (const n of notes) {
        const role = roleOf(cat, n), T = templateOf(role);
        const gs = Math.round(n.t / STEP), step = gs % 16, bar = Math.floor(gs / 16);
        const room = MUTATE === 'noclamp' ? 99 : slotRoom(T.grid, step % 4);
        const d = Math.max(-room, Math.min(room, T.off[step]));
        const t0 = bar * BAR + tickOfStep(step, T.grid);
        let t = Math.round(t0 + d);
        if (t < 0) t = 0;
        if (t > bars * BAR - 1) t = bars * BAR - 1;
        const end = warp(n.t + (n.g || 1), T.grid) + d;
        out.push(Object.assign({}, n, { t, g: Math.max(1, Math.round(end - t)), _s: gs }));
    }
    /* ghosts: snare-family and kick, where the style puts them, as often as it does */
    const byRole = new Map();
    for (const n of out) { const r = roleOf(cat, n); if (!byRole.has(r)) byRole.set(r, []); byRole.get(r).push(n); }
    for (const [role, list] of byRole) {
        const T = templateOf(role), R = T.R;
        const uN = rng.next();
        if (!GHOST_ROLES.has(role) || MUTATE === 'noghosts' || !R.ghostShare || !R.ghostByStep) continue;
        const barsWith = new Set(list.map(n => Math.floor(n.t / BAR)));
        /* one bar's ghosts, repeated like the rest: counted per bar */
        const gs = Math.min(0.4, R.ghostShare), want = (list.length / barsWith.size) * gs / (1 - gs);
        let k = Math.floor(want) + (uN < want - Math.floor(want) ? 1 : 0);
        if (!k) continue;
        const med = list.map(n => n.v).sort((a, b) => a - b)[list.length >> 1];
        const tmplBar = new Map();
        const used = new Set(list.filter(n => n.t < BAR).map(n => stepOnGrid(n.t, T.grid)));
        const w = R.ghostByStep.map((x, s) => used.has(s) || x == null ? 0 : x);
        while (k-- > 0) {
            const tot = w.reduce((a, b) => a + b, 0);
            if (!(tot > 0)) break;
            let r = rng.next() * tot, s = 0;
            for (; s < 16; s++) { r -= w[s]; if (r <= 0) break; }
            s = Math.min(15, s); w[s] = 0;
            tmplBar.set(s, Math.max(1, Math.round(med * (0.3 + rng.next() * 0.2))));
        }
        for (const b of barsWith) for (const [s, v] of tmplBar) {
            const room = slotRoom(T.grid, s % 4);
            const t = b * BAR + tickOfStep(s, T.grid) + Math.round(Math.max(-room, Math.min(room, T.off[s])));
            if (t < 0 || t >= bars * BAR) continue;
            if (out.some(n => roleOf(cat, n) === role && Math.abs(n.t - t) < 6)) continue;
            const src = list[0];
            out.push(Object.assign({}, src, { t, v, g: Math.min(src.g || 6, 12), _s: b * 16 + s, ghost: 1 }));
        }
    }
    out.sort((a, b) => a.t - b.t);
    const parts = {};
    for (const [role, T] of tmpl) parts[role] = { human: T.human, swings: T.grid !== STRAIGHT, off: T.off };
    return { notes: out, grv: { r8: g.r8, r16: g.r16 }, feel: feelTag(g.r8, g.r16), parts };
}
