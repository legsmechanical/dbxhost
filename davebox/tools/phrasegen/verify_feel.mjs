#!/usr/bin/env node
/* verify_feel — does the feel layer (lib/feel.mjs) give each style the groove
 * its numbers describe? Per style and named style, over 300 phrases run through
 * applyFeel() (the generator level, as verify_stats does for rhythm):
 *
 *   F1 swing    share of phrases swung within ±0.03 of the style's share and
 *               half the amounts either side of its median (±4 %, over 4000
 *               draws); and a
 *               swung hat line fitted back (fitGrid) gives the ratio it was
 *               given (±0.02) — the notes really sit on the swung grid
 *   F2 timing   where a role's measured pushes and drags vary by step, the
 *               generated mean offset per step correlates (r ≥ 0.6), and the
 *               spread around it is 0.5–2× the measured jitter
 *   F3 ghosts   ghost share of the snare within ±0.05 of the style's
 *   F5 tight    share of phrases played machine-tight per role within ±0.08
 *   F4 steps    every grooved note still sits nearest the step it was written
 *               on (its part's grid), so nothing reads as a different rhythm —
 *               over the generator's hat lines, and over the candidates
 *
 *   node tools/phrasegen/verify_feel.mjs              → exit 1 on any failure
 *   node tools/phrasegen/verify_feel.mjs --selftest   → each mutation must fail its check
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodeNotes, BAR } from './lib/phrase.mjs';
import { feelRng as makeRng, drawGrid, feelProfile, applyFeel, fitGrid, gridTicks, stepOnGrid, tickOfStep, STRAIGHT, styleOfName } from './lib/feel.mjs';
import { STYLE_FILES, FLAVOUR_NAME } from './lib/style_plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const N = 300, N1 = 4000;

if (process.argv.includes('--selftest')) {
    /* each mutation, and the check that must catch it */
    const cases = [['noswing', 'F1'], ['nooffsets', 'F2'], ['jitter4x', 'F2'], ['noghosts', 'F3'], ['noclamp', 'F4'], ['allhuman', 'F5']];
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

const groups = [];
for (const [file, tag] of Object.entries(STYLE_FILES)) {
    groups.push([file, null, tag || 'BASIC']);
    for (const [k, name] of Object.entries(FLAVOUR_NAME)) { const [f, fk] = styleOfName(name); if (f === file && fk === k) groups.push([file, k, name]); }
}
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 0; };
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
const fails = [];
let judged = 0;
const fail = (check, what) => fails.push(`FAIL ${check} ${what}`);

/* straight test lines: 16th hats, backbeat snare with 8ths kick */
const HATS = Array.from({ length: 32 }, (_, i) => ({ t: i * 24, v: 90, g: 6 }));
const SNARE = [4, 12, 20, 28].map(s => ({ t: s * 24, v: 110, g: 6 }));
const KICK = [0, 6, 8, 10, 16, 22, 24, 26].map(s => ({ t: s * 24, v: 110, g: 6 }));

for (const [file, fk, name] of groups) {
    const prof = feelProfile(file, fk);
    judged++;
    /* F1: the draw (many, it is cheap), then the notes (a swung hat line fits back) */
    let swung = 0; const am8 = [], am16 = [], fitErr = [];
    for (let i = 0; i < N1; i++) {
        const g = drawGrid(prof, makeRng('vf1g.' + name + '.' + i));
        if (g.r8 >= 0.54) { swung++; am8.push(g.r8); } else if (g.r16 >= 0.54) { swung++; am16.push(g.r16); }
    }
    const share = swung / N1, want = prof.swing.share;
    if (Math.abs(share - want) > 0.03) fail('F1', `${name}: swung ${share.toFixed(3)} vs ${want.toFixed(3)}`);
    for (const [am, q, what] of [[am8, prof.swing.amount8, '8th'], [am16, prof.swing.amount16, '16th']]) {
        if (am.length < 100) continue;
        const expect = Math.min(0.75, Math.max(0.54, q[1]));
        /* the measured median splits the draws in two (a spread whose median
         * is also its quartile piles draws onto that value, so count sides) */
        const below = am.filter(x => x < expect - 0.005).length / am.length, above = am.filter(x => x > expect + 0.005).length / am.length;
        if (below > 0.54 || above > 0.54) fail('F1', `${name}: ${what} amounts ${(below * 100).toFixed(0)} % below / ${(above * 100).toFixed(0)} % above the median ${expect}`);
    }
    let offStep = 0;
    for (let i = 0; i < N; i++) {
        const r = applyFeel('hat', HATS, 2, prof, makeRng('vf1.' + name + '.' + i));
        /* F4 at the generator: each note nearest the step it was written on */
        const G = r.parts.chh && r.parts.chh.swings ? gridTicks(r.grv.r8, r.grv.r16) : STRAIGHT;
        /* (a downbeat played early sits at the end of the bar before: same step) */
        for (const n of r.notes) if (stepOnGrid(n.t, G) !== n._s % 16 || Math.abs(n.t - (Math.floor(n._s / 16) * BAR + tickOfStep(n._s % 16, G))) > 24) offStep++;
        if (!(r.grv.r8 >= 0.54 || r.grv.r16 >= 0.54) || !(r.parts.chh && r.parts.chh.swings && !r.parts.chh.human)) continue;
        const f = fitGrid(r.notes.map(n => n.t));
        fitErr.push(Math.abs(Math.max(f.r8, f.r16) - Math.max(r.grv.r8, r.grv.r16)));
    }
    if (offStep) fail('F4', `${name}: ${offStep} generated notes left their written step`);
    if (fitErr.length && median(fitErr) > 0.02) fail('F1', `${name}: fitted ratio off by ${median(fitErr).toFixed(3)}`);
    /* F2 + F5, per role */
    for (const [cat, line, role] of [['snare', SNARE, 'snare'], ['hat', HATS, 'chh'], ['kick', KICK, 'kick']]) {
        const R = prof.roles(role);
        const sum = new Array(16).fill(0), cnt = new Array(16).fill(0), dev = [];
        let human = 0;
        const offs = [];
        for (let i = 0; i < N; i++) {
            const r = applyFeel(cat, line, 2, prof, makeRng('vf2.' + name + '.' + role + '.' + i), { r8: 0.5, r16: 0.5 });
            const P = r.parts[role];
            if (!P) continue;
            if (!P.human) continue;
            human++;
            for (const n of r.notes) if (!n.ghost) { const s = n._s % 16; const o = n.t - n._s * 24; sum[s] += o; cnt[s]++; offs.push([s, o]); }
        }
        const hs = human / N;
        if (Math.abs(hs - (1 - R.tight)) > 0.08) fail('F5', `${name} ${role}: human ${hs.toFixed(2)} vs ${(1 - R.tight).toFixed(2)}`);
        const steps = [...new Set(line.map(n => (n.t / 24) % 16))];
        const meas = steps.map(s => R.offMean[s]), got = steps.map(s => cnt[s] ? sum[s] / cnt[s] : 0);
        const varied = meas.filter(x => Math.abs(x) >= 0.5).length >= 3 && Math.max(...meas) - Math.min(...meas) >= 1;
        if (varied && human >= 30) { const r = corr(meas, got); if (r < 0.6) fail('F2', `${name} ${role}: step offsets r=${r.toFixed(2)}`); }
        if (human >= 30) {
            const mean = new Array(16).fill(0); steps.forEach((s, i) => { mean[s] = got[i]; });
            const rms = Math.sqrt(offs.reduce((a, [s, o]) => a + (o - mean[s]) ** 2, 0) / Math.max(1, offs.length));
            const want = median(steps.map(s => R.offSd[s]));
            if (want >= 0.5 && (rms < want * 0.5 || rms > want * 2 + 0.5)) fail('F2', `${name} ${role}: jitter ${rms.toFixed(2)} vs ${want.toFixed(2)}`);
        }
    }
    /* F3 */
    const R = prof.roles('snare');
    if (R.ghostShare >= 0.03 && R.ghostByStep) {
        let g = 0, all = 0;
        for (let i = 0; i < N; i++) {
            const r = applyFeel('snare', SNARE, 2, prof, makeRng('vf3.' + name + '.' + i));
            for (const n of r.notes) { all++; if (n.ghost) g++; }
        }
        const want = Math.min(0.4, R.ghostShare);
        if (Math.abs(g / all - want) > 0.05) fail('F3', `${name}: ghost share ${(g / all).toFixed(3)} vs ${want.toFixed(3)}`);
    }
}

/* F4 on the candidates */
const CAND = join(HERE, 'cache', 'candidates');
let checked = 0, wrong = 0; const eg = [];
for (const f of existsSync(CAND) ? readdirSync(CAND) : []) {
    for (const p of JSON.parse(readFileSync(join(CAND, f), 'utf8'))) {
        if (!p.sk) continue;
        const ns = decodeNotes(p.cat, p.n), sk = p.sk.split(' ').map(Number), G = gridTicks(p.grv.r8, p.grv.r16);
        checked++;
        const ok = sk.length === ns.length && ns.every((n, i) => stepOnGrid(n.t, G) === sk[i] % 16 || stepOnGrid(n.t, STRAIGHT) === sk[i] % 16)
            && ns.every((n, i) => Math.floor(n.t / BAR) === Math.floor(sk[i] / 16) || Math.abs(n.t - sk[i] * 24) <= 12);
        if (!ok) { wrong++; if (eg.length < 3) eg.push(p.id); }
    }
}
if (!checked) fail('F4', 'no grooved candidates found — run gen first');
if (wrong) fail('F4', `${wrong} of ${checked} grooved phrases have notes off their written step, e.g. ${eg.join(' ')}`);

console.log(fails.join('\n'));
console.log(`verify_feel: ${judged} styles judged, ${checked} grooved candidates checked, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
