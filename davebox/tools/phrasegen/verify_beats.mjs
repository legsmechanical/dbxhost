#!/usr/bin/env node
/* verify_beats — do layered beats (lib/beat_layer.mjs) play together the way
 * each style's drums do? Per style, over 200 beats assembled from the style's
 * own lanes (cache/candidates, as gen builds them):
 *
 *   B1 pairs     where a pair of drums lands together or apart per step
 *                (P(B on a step | A on it), research/refs/beats/stats joint.pairs,
 *                steps with 5+ songs and 10+ generated hits): r ≥ 0.6 pooled
 *                over the pairs
 *   B2 families  kick + backbeat families: total variation from the measured
 *                bar shares ≤ 0.35
 *   B3 scorer    real Groove MIDI kits score above the same kits with the
 *                snare moved two steps in ≥ 65 % of cases — the score sees
 *                drums off their style's steps
 *   B4 levels    each drum's median level against the kick within ±12 of
 *                velocity.<role>.rel_to_kick
 *   B6 density   median hits per bar inside the measured groove-bar band
 * and on the candidates:
 *   N1 spread    no style above 12 % of all beats; every style with lanes has 5+
 *
 *   node tools/phrasegen/verify_beats.mjs [--selftest]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodeNotes } from './lib/phrase.mjs';
import { feelRng, DRUM_ROLE } from './lib/feel.mjs';
import { laneOf, assembleBeat, renderBeat, poolsFor, beatStats, scorePattern, kickFam, bbFam, LANE_CATS, patternOf } from './lib/beat_layer.mjs';
import { laneMaker } from './lib/drum_gen.mjs';
import { STYLE_FILES } from './lib/style_plan.mjs';
import { publicTag } from './lib/genres.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAND = join(HERE, 'cache', 'candidates');
const N = 200;

if (process.argv.includes('--selftest')) {
    const cases = [['shufflelanes', 'B2'], ['scorezero', 'B3'], ['flatvel', 'B4']];
    let bad = 0;
    for (const [m, check] of cases) {
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: Object.assign({}, process.env, { PHRASEGEN_MUTATE: m }), encoding: 'utf8' });
        const caught = r.status === 1 && new RegExp('^FAIL ' + check + ' ', 'm').test(r.stdout);
        console.log(`${caught ? 'caught  ' : 'MISSED  '} ${m} → ${check}`);
        if (!caught) bad++;
    }
    const clean = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: Object.assign({}, process.env, { PHRASEGEN_MUTATE: '' }), encoding: 'utf8' });
    console.log(`${clean.status === 0 ? 'clean   ' : 'DIRTY   '} no mutation → pass`);
    process.exit(bad || clean.status !== 0 ? 1 : 0);
}

const fails = [];
const fail = (c, w) => fails.push(`FAIL ${c} ${w}`);
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 0; };
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

/* the lanes, as gen pools them */
const byStyle = new Map();
for (const c of LANE_CATS) {
    const f = join(CAND, c + '.json');
    if (!existsSync(f)) { console.log(`FAIL setup: ${c} candidates missing — run gen first`); process.exit(1); }
    for (const p of JSON.parse(readFileSync(f, 'utf8'))) {
        if (!/^(gen|lib|own):/.test(String(p.src))) continue;
        const ln = laneOf(p); if (!ln) continue;
        const k = p.style || p.g || '';
        if (!byStyle.has(k)) byStyle.set(k, {});
        (byStyle.get(k)[c] = byStyle.get(k)[c] || []).push(ln);
    }
}
const PAIRS = [['kick', 'snare'], ['kick', 'chh'], ['snare', 'chh'], ['kick', 'ohh'], ['chh', 'ohh'], ['kick', 'clap']];
let judged = 0;
for (const tag of Object.values(STYLE_FILES)) {
    const name = tag || 'BASIC';
    const S = beatStats(tag), pools = poolsFor(tag, byStyle, null);
    pools.make = laneMaker(tag);
    if (!S || (!pools.kick.length && !pools.snare.length)) continue;
    const beats = [];
    for (let i = 0; i < N * 3 && beats.length < N; i++) {
        const rng = feelRng('vb.' + name + '.' + i);
        const b = assembleBeat(tag, pools, rng, new Map());
        if (b) beats.push({ b, r: renderBeat(tag, b, rng) });
    }
    if (beats.length < 40) continue;
    judged++;
    /* B1: per-step conditionals */
    const meas = [], got = [];
    for (const [a, bR] of PAIRS) {
        const P = S.joint.pairs[a + '|' + bR];
        if (!P) continue;
        const given = P['P_' + bR + '_given_' + a], ns = P['n_songs_' + a];
        const aN = new Array(16).fill(0), both = new Array(16).fill(0);
        for (const { b } of beats) {
            const A = b.pat.get(a), B = b.pat.get(bR);
            if (!A) continue;
            for (const gs of A) { aN[gs % 16]++; if (B && B.has(gs)) both[gs % 16]++; }
        }
        for (let s = 0; s < 16; s++) if (given[s] != null && ns[s] >= 5 && aN[s] >= 10) { meas.push(given[s]); got.push(both[s] / aN[s]); }
    }
    if (meas.length >= 8) { const r = corr(meas, got); if (r < 0.6) fail('B1', `${name}: pair conditionals r=${r.toFixed(2)} (${meas.length} steps)`); }
    /* B2: core families */
    const fam = new Map();
    /* bar 1: later bars may end in a fill, which the measured groove bars leave out */
    for (const { b } of beats) for (let bar = 0; bar < 1; bar++) {
        const K = new Set([...(b.pat.get('kick') || [])].filter(g => Math.floor(g / 16) === bar).map(g => g % 16));
        const B = new Set(['snare', 'clap', 'rim'].flatMap(r => [...(b.pat.get(r) || [])]).filter(g => Math.floor(g / 16) === bar).map(g => g % 16));
        const k = kickFam(K) + ' + ' + bbFam(B);
        fam.set(k, (fam.get(k) || 0) + 1);
    }
    const tot = [...fam.values()].reduce((a, b) => a + b, 0);
    const want = new Map(S.families.core.map(f => [f.family, f.bar_share]));
    const wt = [...want.values()].reduce((a, b) => a + b, 0);
    let tv = 0; const keys = new Set([...fam.keys(), ...want.keys()]);
    for (const k of keys) tv += Math.abs((fam.get(k) || 0) / tot - (want.get(k) || 0) / wt);
    tv /= 2;
    if (tv > 0.35) fail('B2', `${name}: core families TV ${tv.toFixed(2)}`);
    /* B4: levels */
    const rel = new Map();
    for (const { r } of beats) {
        const kicks = r.notes.filter(n => n.p === 36 && !n.ghost).map(n => n.v);
        if (!kicks.length) continue;
        const km = median(kicks);
        const by = new Map();
        for (const n of r.notes) { const ro = DRUM_ROLE[n.p]; if (!ro || ro === 'kick' || n.ghost) continue; if (!by.has(ro)) by.set(ro, []); by.get(ro).push(n.v); }
        for (const [ro, vs] of by) { if (!rel.has(ro)) rel.set(ro, []); rel.get(ro).push(median(vs) - km); }
    }
    for (const [ro, ds] of rel) {
        const w = S.velocity && S.velocity[ro] && S.velocity[ro].rel_to_kick;
        if (typeof w !== 'number' || ds.length < 20) continue;
        if (Math.abs(median(ds) - w) > 12) fail('B4', `${name} ${ro}: ${median(ds).toFixed(0)} vs kick, measured ${w}`);
    }
    /* B6: density */
    const q = S.fills && S.fills.hits_per_groove_bar;
    if (Array.isArray(q)) {
        const h = median(beats.map(({ b }) => [...b.pat.values()].reduce((a, s) => a + s.size, 0) / b.L));
        if (h < q[0] * 0.6 || h > q[2] * 1.4) fail('B6', `${name}: ${h.toFixed(1)} hits/bar vs ${q.join('–')}`);
    }
}
/* B3: the scorer prefers real kits to the same kits with the snare moved
 * two steps (a positive control: re-pairing a kit with another same-style
 * kit's drums is NOT distinguishable, measured 50 %, so that is no test) */
{
    const f = join(CAND, 'beat.json');
    const kits = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).filter(p => String(p.src).startsWith('lib:gmd')) : [];
    let wins = 0, n = 0;
    for (const p of kits) {
        const S = beatStats(p.style || p.g);
        if (!S) continue;
        const parts = { kick: [], snare: [], hat: [] };
        for (const x of decodeNotes('beat', p.n)) { const r = DRUM_ROLE[x.p]; const c = r === 'kick' ? 'kick' : ['snare', 'clap', 'rim'].includes(r) ? 'snare' : ['chh', 'ohh', 'phh'].includes(r) ? 'hat' : null; if (c) parts[c].push(x); }
        if (!parts.kick.length || !parts.snare.length || !parts.hat.length) continue;
        const L = p.bars, lane = (c) => laneOf({ id: p.id + c, cat: c, bars: L, n: parts[c].map(x => [x.t, x.v, x.g, x.p].join(' ')).join(';') });
        const k = lane('kick'), sn = lane('snare'), h = lane('hat');
        if (!k || !sn || !h) continue;
        const moved = Object.assign({}, sn, { hits: sn.hits.map(x => Object.assign({}, x, { gs: x.gs + 2 })) });
        n++;
        if (scorePattern(patternOf([k, sn, h], L), L, S) > scorePattern(patternOf([k, moved, h], L), L, S)) wins++;
    }
    if (n < 30) fail('B3', `only ${n} real kits to judge the scorer on`);
    else if (wins / n < 0.65) fail('B3', `real kits beat their snare moved two steps in only ${(wins / n * 100).toFixed(0)} % of ${n}`);
    else console.log(`B3: real kits beat their snare moved two steps in ${(wins / n * 100).toFixed(0)} % of ${n}`);
}
/* N1 on the candidates */
{
    const f = join(CAND, 'beat.json');
    const list = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
    const by = new Map(); for (const p of list) by.set(p.g || 'BASIC', (by.get(p.g || 'BASIC') || 0) + 1);
    for (const [g, c] of by) if (c / list.length > 0.12) fail('N1', `${g}: ${(c / list.length * 100).toFixed(1)} % of ${list.length} beats`);
    for (const tag of new Set(Object.values(STYLE_FILES).map(t => publicTag(t) || 'BASIC'))) if ((by.get(tag) || 0) < 5) fail('N1', `${tag}: ${by.get(tag) || 0} beats`);
}
console.log(fails.join('\n'));
console.log(`verify_beats: ${judged} styles judged, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
