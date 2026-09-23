#!/usr/bin/env node
/* verify — measures generated candidates against research/verify.md.
 *
 *   node tools/phrasegen/verify.mjs [cat…]
 *
 * Each check is a target from the research (tagged there M = measured, G =
 * guides, P = proposal). A family passes only if its batch meets its own
 * genre's targets — and, per verify.md's cross-genre test, the report also
 * shows how each batch scores on the OTHER genres' key checks, so one generic
 * pattern wearing three labels would show up as three identical rows.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeNotes } from './lib/phrase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STEP = 24, BAR = 384;
const stepOf = (t) => Math.round((t % BAR) / STEP) % 16 + 1;           /* nearest grid step */
const rawStep = (t) => Math.floor((t % BAR) / STEP) + 1;
const isBeat = (s) => (s - 1) % 4 === 0, isOff8 = (s) => (s - 3) % 4 === 0, isOff16 = (s) => s % 2 === 0;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = (a) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0;
    for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
    return n / Math.sqrt(dx * dy || 1); };

function bars(p) {                         /* per-bar lists of { s, v, g, t, deg, oct, acc } */
    const notes = decodeNotes(p.cat, p.n), out = [];
    for (let b = 0; b < p.bars; b++) out.push(notes.filter(n => Math.floor(n.t / BAR) === b).map(n => Object.assign({ s: rawStep(n.t), sn: stepOf(n.t) }, n)));
    return out;
}
function profile(list) {
    const cnt = new Array(16).fill(0); let nb = 0;
    for (const p of list) for (const b of bars(p)) { nb++; const seen = new Set(b.map(n => n.s)); for (const s of seen) cnt[s - 1]++; }
    return cnt.map(c => c / Math.max(1, nb));
}
function swingOf(p) {                      /* mean offset of even-step hits from the grid */
    const d = decodeNotes(p.cat, p.n).filter(n => isOff16(rawStep(n.t))).map(n => (n.t % BAR) % STEP);
    return d.length ? mean(d) : 0;
}
/* LHL syncopation, simplified: an onset on a weak step followed by silence on
 * the next stronger step (research/analysis/lhl.py is the reference). */
const LEVEL = [0, 4, 3, 4, 2, 4, 3, 4, 1, 4, 3, 4, 2, 4, 3, 4];
function lhl(barNotes) {
    const on = new Set(barNotes.map(n => n.sn - 1)); let s = 0;
    for (let i = 0; i < 16; i++) if (on.has(i)) {
        for (let j = i + 1; j <= 16; j++) { const k = j % 16; if (LEVEL[k] < LEVEL[i]) { if (!on.has(k)) s += LEVEL[i] - LEVEL[k]; break; } }
    }
    return s;
}

const FUNK_HAT = [.79, .21, .70, .32, .85, .21, .76, .35, .81, .23, .73, .28, .85, .21, .66, .21];
const HOUSE_BASS = [.93, .12, .36, .24, .65, .15, .50, .20, .74, .18, .49, .20, .78, .18, .56, .10];

const CHECKS = {
    hat: {
        HOUSE: [
            ['H-hat-1 off-8ths always', (L) => Math.min(...[3, 7, 11, 15].map(s => profile(L)[s - 1])), (v) => v >= 0.95],
            ['H-hat-2 off-8th vel − beat vel', (L) => mean(L.flatMap(bars).map(b => mean(b.filter(n => isOff8(n.s)).map(n => n.v)) - mean(b.filter(n => isBeat(n.s)).map(n => n.v))).filter(x => !isNaN(x))), (v) => v >= 10],
            ['H-hat-3 swing ticks', (L) => median(L.map(swingOf)), (v) => v >= 0 && v <= 6],
        ],
        FUNK: [
            ['F-hat-1 profile r vs GMD funk', (L) => pearson(profile(L), FUNK_HAT), (v) => v >= 0.8],
            ['F-hat-2 share on 16th offbeats', (L) => { const a = L.flatMap(p => decodeNotes(p.cat, p.n)); return a.filter(n => isOff16(rawStep(n.t))).length / a.length; }, (v) => v >= 0.15 && v <= 0.35],
            ['F-hat-3 16th vel ÷ beat vel', (L) => { const a = L.flatMap(bars).flat(); return mean(a.filter(n => isOff16(n.s)).map(n => n.v)) / mean(a.filter(n => isBeat(n.s)).map(n => n.v)); }, (v) => v >= 0.45 && v <= 0.70],
        ],
        DNB: [
            /* the sparse "liquid" variant has its own target: off-8ths ≥ 0.9 (verify.md D-hat-1) */
            ['D-hat-1 8th skeleton (non-liquid)', (L) => mean([1, 3, 5, 7, 9, 11, 13, 15].map(s => profile(L.filter(p => !/liquid/.test(p.id)))[s - 1])), (v) => v >= 0.9],
            ['D-hat-1b liquid ticks off-8ths', (L) => Math.min(...[3, 7, 11, 15].map(s => profile(L.filter(p => /liquid/.test(p.id)))[s - 1])), (v) => v >= 0.9],
            ['D-hat-2 ghosts on 6/8/10/14/16', (L) => { const a = L.flatMap(bars).flat().filter(n => isOff16(n.s)); return a.filter(n => [6, 8, 10, 14, 16].includes(n.s)).length / Math.max(1, a.length); }, (v) => v >= 0.6],
            ['D-hat-3 ghost vel ÷ 8th vel', (L) => { const a = L.flatMap(bars).flat(); return mean(a.filter(n => isOff16(n.s)).map(n => n.v)) / mean(a.filter(n => !isOff16(n.s)).map(n => n.v)); }, (v) => v >= 0.5 && v <= 0.9],
        ],
    },
    bass: {
        HOUSE: [
            ['H-bass-1 profile r vs corpus (GROOVE only)', (L) => pearson(profile(L.filter(p => /GROOVE/.test(p.id.toUpperCase()))), HOUSE_BASS), (v) => v >= 0.7],
            ['H-bass-2 share on 16th offbeats', (L) => { const a = L.flatMap(bars).flat(); return a.filter(n => isOff16(n.sn)).length / a.length; }, (v) => v <= 0.30],
            ['H-bass-4 median length (ticks)', (L) => median(L.flatMap(p => decodeNotes(p.cat, p.n)).map(n => n.g)), (v) => v >= 20 && v <= 48],
            ['H-bass-7 LHL median (GROOVE)', (L) => median(L.filter(p => /GROOVE/.test(p.id.toUpperCase())).flatMap(bars).map(lhl)), (v) => v <= 3],
        ],
        FUNK: [
            ['F-bass-1 step 1 (or 16 before)', (L) => mean(L.flatMap(bars).map(b => b.some(n => n.s === 1) ? 1 : 0)), (v) => v >= 0.9],
            ['F-bass-2 LHL median', (L) => median(L.flatMap(bars).map(lhl)), (v) => v >= 3 && v <= 7],
            ['F-bass-3 ghost share', (L) => { const a = L.flatMap(p => decodeNotes(p.cat, p.n)); return a.filter(n => n.v <= 45).length / a.length; }, (v) => v >= 0.10 && v <= 0.35],
            ['F-bass-4 gate ÷ gap (non-ghost)', (L) => median(L.flatMap(p => { const a = decodeNotes(p.cat, p.n); return a.map((n, i) => i + 1 < a.length && n.v > 45 ? n.g / (a[i + 1].t - n.t) : NaN).filter(x => !isNaN(x)); })), (v) => v <= 0.6],
        ],
        DNB: [
            ['D-bass-1 onsets per bar', (L) => median(L.flatMap(bars).map(b => b.length)), (v) => v >= 1 && v <= 3],
            ['D-bass-2 median length (steps)', (L) => median(L.flatMap(p => decodeNotes(p.cat, p.n)).map(n => n.g / STEP)), (v) => v >= 4],
            ['D-bass-3 onsets on kick steps 1/11', (L) => { const a = L.flatMap(bars).flat(); return a.filter(n => n.s === 1 || n.s === 11).length / a.length; }, (v) => v >= 0.5],
            ['D-bass-5 no four-on-the-floor bar', (L) => L.flatMap(bars).filter(b => [1, 5, 9, 13].every(s => b.some(n => n.s === s))).length, (v) => v === 0],
        ],
    },
};

const cats = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHECKS);
let fails = 0;
for (const cat of cats) {
    const all = JSON.parse(readFileSync(join(HERE, 'cache', 'candidates', cat + '.json'), 'utf8'));
    const byGenre = {};
    for (const p of all) (byGenre[p.g || 'BASIC'] = byGenre[p.g || 'BASIC'] || []).push(p);
    console.log(`\n== ${cat.toUpperCase()}`);
    for (const [genre, checks] of Object.entries(CHECKS[cat] || {})) {
        for (const [batchGenre, list] of Object.entries(byGenre)) {
            if (batchGenre === 'BASIC') continue;
            const own = batchGenre === genre;
            const res = checks.map(([name, fn, ok]) => { const v = fn(list); return { name, v, pass: ok(v) }; });
            const passed = res.filter(r => r.pass).length;
            if (own) {
                for (const r of res) { console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${genre} ${r.name}: ${Number.isFinite(r.v) ? r.v.toFixed(2) : r.v}`); if (!r.pass) fails++; }
            } else {
                console.log(`       cross: ${batchGenre} batch passes ${passed}/${res.length} of ${genre}'s checks${passed > res.length - 2 ? '  ⚠ too similar' : ''}`);
            }
        }
    }
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall own-genre checks pass');
process.exit(fails ? 1 : 0);
