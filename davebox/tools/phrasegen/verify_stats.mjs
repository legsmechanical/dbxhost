#!/usr/bin/env node
/* verify_stats — do the generated melodic phrases match the statistics they
 * were drawn from? For every style (and named style) and every melodic type:
 *
 *   density   onsets per bar inside the measured quartiles (±40 % slack)
 *   rhythm    the GENERATOR's per-step onset profile, over 300 simulated
 *             phrases, correlates with the measured one (r ≥ 0.8); the shipped
 *             phrases' own profile is judged too once they carry 150+ onsets
 *             (r ≥ 0.5) — a handful of phrases is too few to show a shape
 *   mode      minor share within 0.25 of the measured share
 *   pitch     pitch-class distribution close to the measured degree shares
 *             (total variation ≤ 0.45): the generator's over 300 simulated
 *             phrases, and the shipped phrases' once they carry 150+ notes
 *
 *   node tools/phrasegen/verify_stats.mjs [cat…]   → exit 1 on any failure
 *
 * A group with fewer than 4 phrases is reported, not judged. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeNotes, MODES, BAR } from './lib/phrase.mjs';
import { profile, PART_OF, loadStyle, genPhrase, genDrum } from './lib/stats_gen.mjs';
import { makeRng } from './lib/rng.mjs';
import { STYLE_FILES, FLAVOUR_NAME, drumCountFor } from './lib/style_plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const cats = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PART_OF);
const PC_OF = { '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5, '#4': 6, '5': 7, 'b6': 8, '6': 9, 'b7': 10, '7': 11 };
const nameToGroup = new Map();
for (const [file, tag] of Object.entries(STYLE_FILES)) nameToGroup.set(tag || 'BASIC', [file, null]);
for (const [k, n] of Object.entries(FLAVOUR_NAME)) nameToGroup.set(n, [null, k]);

function corr(a, b) {
    const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 1;
}

let fails = 0, judged = 0, small = 0;
const lines = [];
for (const cat of cats) {
    const f = join(HERE, 'cache', 'candidates', cat + '.json');
    if (!existsSync(f)) continue;
    const gen = JSON.parse(readFileSync(f, 'utf8')).filter(p => String(p.src).startsWith('gen:') && !/\.\d{3}$/.test(p.id) || /\.g\d{3}$/.test(p.id));
    const groups = new Map();
    for (const p of gen) {
        const key = (p.name || '').replace(/ \d+$/, '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }
    for (const [key, list] of groups) {
        const g = nameToGroup.get(key);
        if (!g) continue;
        let [file, fk] = g;
        if (!file) file = Object.keys(STYLE_FILES).find(fl => { const s = loadStyle(fl); return s && s.flavours && s.flavours[fk]; });
        const prof = profile(file, fk);
        const P = prof && prof.part(PART_OF[cat]);
        if (!P) continue;
        if (list.length < 4) { small++; continue; }
        judged++;
        /* measure */
        const steps = new Array(16).fill(0);
        let onsetsPerBar = [], minor = 0;
        const pcs = new Array(12).fill(0);
        for (const p of list) {
            const ns = decodeNotes(cat, p.n);
            const on = [...new Set(ns.map(n => n.t))];
            onsetsPerBar.push(on.length / p.bars);
            /* each distinct bar rhythm once: a repeated bar is not new evidence */
            const barsSeen = new Set();
            for (let b = 0; b < p.bars; b++) {
                const r = on.filter(t => t >= b * BAR && t < (b + 1) * BAR).map(t => Math.round((t % BAR) / (BAR / 16)) % 16);
                const k = r.join(',');
                if (barsSeen.has(k)) continue;
                barsSeen.add(k);
                for (const st of r) steps[st]++;
            }
            if (p.mode === 'min') minor++;
            for (const n of ns) { const iv = MODES[p.mode]; const pc = ((iv[((n.deg % 7) + 7) % 7] + (n.acc || 0)) % 12 + 12) % 12; pcs[pc]++; }
        }
        const why = [];
        const dens = onsetsPerBar.reduce((a, b) => a + b, 0) / onsetsPerBar.length;
        const q = P.density_per_bar;
        if (cat !== 'arp' && q && (dens < q[0] * 0.6 || dens > q[2] * 1.4)) why.push(`density ${dens.toFixed(1)} vs ${q.join('–')}`);
        /* the rhythm shape is judged only on enough onsets to mean something */
        const onsets = steps.reduce((a, b) => a + b, 0);
        if (cat !== 'arp' && P.step_onset_prob && onsets >= 150) { const r = corr(steps, P.step_onset_prob); if (r < 0.5) why.push(`rhythm r=${r.toFixed(2)} (${onsets} onsets)`); }
        if (cat !== 'arp' && P.step_onset_prob) {
            const sim = new Array(16).fill(0);
            for (let i = 0; i < 300; i++) {
                const r = genPhrase(cat, prof, makeRng('verify.' + cat + '.' + key + '.' + i));
                if (r) for (const t of new Set(r.notes.map(n => n.t))) sim[Math.round((t % BAR) / (BAR / 16)) % 16]++;
            }
            const r = corr(sim, P.step_onset_prob);
            if (r < 0.8) why.push(`generator rhythm r=${r.toFixed(2)} over 300`);
        }
        const ms = minor / list.length;
        if (Math.abs(ms - prof.minor) > 0.25 && list.length >= 8) why.push(`minor ${ms.toFixed(2)} vs ${prof.minor.toFixed(2)}`);
        /* pitch classes against the measured degree shares, per the phrases' own modes */
        const ref = new Array(12).fill(0);
        const mw = { maj: 1 - ms, min: ms };
        for (const m of ['maj', 'min']) { const ds = P.degree_share && P.degree_share[m]; if (ds) for (const k in ds) if (k in PC_OF) ref[PC_OF[k]] += ds[k] * mw[m]; }
        const tvOf = (h) => { const tr = ref.reduce((a, b) => a + b, 0), tg = h.reduce((a, b) => a + b, 0);
            if (!tr || !tg) return 0; let tv = 0; for (let i = 0; i < 12; i++) tv += Math.abs(ref[i] / tr - h[i] / tg); return tv / 2; };
        if (pcs.reduce((a, b) => a + b, 0) >= 150) { const tv = tvOf(pcs); if (tv > 0.45) why.push(`pitch TV ${tv.toFixed(2)}`); }
        {
            const sim = new Array(12).fill(0);
            for (let i = 0; i < 300; i++) {
                const r = genPhrase(cat, prof, makeRng('verify-pc.' + cat + '.' + key + '.' + i));
                if (r) for (const n of r.notes) { const iv = MODES[r.mode]; sim[((iv[((n.deg % 7) + 7) % 7] + (n.acc || 0)) % 12 + 12) % 12]++; }
            }
            const tv = tvOf(sim);
            if (tv > 0.45) why.push(`generator pitch TV ${tv.toFixed(2)} over 300`);
        }
        if (why.length) { fails++; lines.push(`FAIL ${cat} ${key} (${list.length}): ${why.join('; ')}`); }
    }
}
/* drums: the generator's per-step profile for each style's drum types */
for (const [file, tag] of Object.entries(STYLE_FILES)) {
    const prof = profile(file, null);
    const D = prof && prof.drums();
    if (!D) continue;
    for (const cat of ['kick', 'snare', 'hat', 'perc', 'cymb']) {
        const P = D[cat];
        if (!P || !P.step_onset_prob || !drumCountFor(cat, prof, 0, false, file)) continue;   /* only what is generated */
        judged++;
        const sim = new Array(16).fill(0);
        for (let i = 0; i < 300; i++) {
            const r = genDrum(cat, prof, makeRng('verify-d.' + cat + '.' + file + '.' + i));
            if (r) for (const n of r.notes) sim[Math.round((n.t % BAR) / (BAR / 16)) % 16]++;
        }
        const r = corr(sim, P.step_onset_prob);
        if (r < 0.8) { fails++; lines.push(`FAIL drum ${cat} ${tag || 'BASIC'}: generator rhythm r=${r.toFixed(2)} over 300`); }
    }
}
console.log(lines.join('\n'));
console.log(`verify_stats: ${judged} groups judged, ${fails} failed, ${small} too small to judge`);
process.exit(fails ? 1 : 0);
