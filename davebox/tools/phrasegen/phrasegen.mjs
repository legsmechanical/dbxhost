#!/usr/bin/env node
/* phrasegen — builds dAVEBOx's phrase library (davebox/phrases/<cat>.json).
 *
 *   node tools/phrasegen/phrasegen.mjs gen    <cat…>   candidates → cache/candidates/<cat>.json
 *   node tools/phrasegen/phrasegen.mjs render <cat…>   .mid + .wav per candidate → out/<cat>/
 *   node tools/phrasegen/phrasegen.mjs build           candidates ∩ curation.json → phrases/
 *   node tools/phrasegen/phrasegen.mjs check           build in memory, diff against phrases/ (CI)
 *
 * Candidates come from two places: generator RULES (rules/<cat>.mjs, one
 * function per genre, written from research/<genre>.md) and INGESTED open
 * libraries (ingest/<source>.mjs; licence checked against LICENCE_ALLOW).
 * Everything is seeded, so the same inputs build the same library.
 *
 * Genre is only a NAME tag (Josh, 2026-09-23): categories are instruments.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeNotes, decodeNotes, fingerprint, isDrumCat, pitchInC, BAR } from './lib/phrase.mjs';
import { writeSmf } from './lib/smf.mjs';
import { renderWav } from './lib/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'cache');
const OUT = join(HERE, 'out');
const LIB_DIR = join(HERE, '..', '..', 'phrases');
const CURATION = join(HERE, 'curation.json');
export const MAX_BARS = 4;
export const MAX_DRUM_SOUNDS = 3;
export const MULTI_SOUND_CATS = ['hat', 'perc'];
export const LICENCE_ALLOW = ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0', 'PD', 'dAVEBOx'];

/* Default audition tempo per genre tag (the research notes' typical tempo). */
const GENRE_BPM = { HOUSE: 124, FUNK: 100, DNB: 172, TECHNO: 130, DISCO: 118, ROCK: 120, '': 120 };
const DRUM_PITCH = { kick: 36, snare: 38, hat: 42, tom: 45, perc: 56 };

async function loadRules(cat) {
    const f = join(HERE, 'rules', cat + '.mjs');
    if (!existsSync(f)) throw new Error('no rules for ' + cat);
    return (await import(f)).default;
}

/* rules: { genres: [{ tag, count, feel, bars, mode?, make(rng, i) -> notes, name(i) }] } */
async function gen(cats) {
    const { makeRng } = await import('./lib/rng.mjs');
    mkdirSync(join(CACHE, 'candidates'), { recursive: true });
    for (const cat of cats) {
        const rules = await loadRules(cat);
        const seen = new Set(), out = [];
        for (const g of rules.genres) {
            let made = 0, tries = 0;
            while (made < g.count && tries++ < g.count * 40) {
                const fam = (g.tag || 'basic') + (g.family ? '-' + g.family : '');
                const id = cat + '.' + fam.toLowerCase().replace(/\s+/g, '') + '.' + String(tries).padStart(3, '0');
                const rng = makeRng(id);
                const notes = g.make(rng, made);
                if (!notes || !notes.length) continue;
                if (rules.accept && !rules.accept(notes, g)) continue;
                const fp = fingerprint(cat, notes);
                if (seen.has(fp)) continue;
                seen.add(fp);
                made++;
                out.push({ id, name: g.name(made), cat, g: g.tag || '', bars: g.bars || 1, feel: g.feel || 'straight',
                           mode: isDrumCat(cat) ? '' : (g.mode || 'min'), src: 'gen:' + id, lic: 'dAVEBOx',
                           n: encodeNotes(cat, notes) });
            }
            if (made < g.count) console.warn(`  ${cat}/${g.tag || 'basic'} ${g.family || ''}: only ${made} of ${g.count} distinct candidates`);
        }
        /* ingested phrases (open libraries, licence carried per phrase) */
        for (const ing of (rules.ingest || [])) {
            const { ingestGmd } = await import('./ingest/gmd.mjs');
            for (const p of ingestGmd(cat, ing.style, ing.count, ing.tag, ing.name)) {
                const fp = fingerprint(cat, p.notes);
                if (seen.has(fp)) continue;
                seen.add(fp);
                out.push({ id: p.id, name: p.name, cat, g: p.g, bars: p.bars, feel: p.feel, mode: '',
                           src: p.src, lic: p.lic, attrib: p.attrib, n: encodeNotes(cat, p.notes) });
            }
        }
        writeFileSync(join(CACHE, 'candidates', cat + '.json'), JSON.stringify(out, null, 0));
        console.log(`${cat}: ${out.length} candidates`);
    }
}

function eventsOf(p) {
    const notes = decodeNotes(p.cat, p.n);
    if (isDrumCat(p.cat)) return notes.map(n => ({ t: n.t, v: n.v, g: n.g, p: DRUM_PITCH[p.cat], voice: p.cat }));
    return notes.map(n => ({ t: n.t, v: n.v, g: n.g, p: pitchInC(p.cat, p.mode, n), voice: 'bass' }));
}

function render(cats) {
    for (const cat of cats) {
        const list = JSON.parse(readFileSync(join(CACHE, 'candidates', cat + '.json'), 'utf8'));
        const dir = join(OUT, cat); mkdirSync(dir, { recursive: true });
        for (const p of list) {
            const ev = eventsOf(p), bpm = GENRE_BPM[p.g] || 120;
            writeFileSync(join(dir, p.id + '.mid'), writeSmf({ bpm, loops: 4, loopTicks: p.bars * BAR,
                tracks: [{ name: p.name, ch: isDrumCat(cat) ? 9 : 0, notes: ev }] }));
            writeFileSync(join(dir, p.id + '.wav'), renderWav({ events: ev, bars: p.bars, bpm, loops: 2 }));
        }
        console.log(`${cat}: rendered ${list.length} to ${dir}`);
    }
}

function build(write) {
    const cur = existsSync(CURATION) ? JSON.parse(readFileSync(CURATION, 'utf8')) : {};
    const files = existsSync(join(CACHE, 'candidates')) ? readdirSync(join(CACHE, 'candidates')) : [];
    let bad = 0;
    const result = {};
    for (const f of files) {
        const cat = f.replace(/\.json$/, '');
        const list = JSON.parse(readFileSync(join(CACHE, 'candidates', f), 'utf8'));
        const keep = [];
        for (const p of list) {
            const c = cur[p.id];
            if (!c || c.keep !== true) continue;
            if (!LICENCE_ALLOW.includes(p.lic)) { console.error(`REFUSED ${p.id}: licence ${p.lic}`); bad++; continue; }
            /* Nothing longer than 4 bars ships (Josh, 2026-09-23). */
            if (!(p.bars >= 1 && p.bars <= MAX_BARS)) { console.error(`REFUSED ${p.id}: ${p.bars} bars (max ${MAX_BARS})`); bad++; continue; }
            /* Drum phrases: at most 3 sounds, and only hats and percussion may
             * have more than one (Josh, 2026-09-23). */
            if (isDrumCat(cat)) {
                const sounds = new Set(decodeNotes(cat, p.n).map(x => x.p ?? -1)).size;
                const cap = MULTI_SOUND_CATS.includes(cat) ? MAX_DRUM_SOUNDS : 1;
                if (sounds > cap) { console.error(`REFUSED ${p.id}: ${sounds} sounds (max ${cap} for ${cat})`); bad++; continue; }
            }
            keep.push(Object.assign({}, p, c.name ? { name: c.name } : {}));
        }
        if (!keep.length) continue;
        result[cat] = JSON.stringify({ v: 1, cat, phrases: keep.map(({ cat: _c, ...rest }) => rest) }) + '\n';
    }
    if (write) {
        mkdirSync(LIB_DIR, { recursive: true });
        for (const [cat, body] of Object.entries(result)) writeFileSync(join(LIB_DIR, cat + '.json'), body);
    }
    return { result, bad };
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'gen') await gen(args);
else if (cmd === 'render') render(args);
else if (cmd === 'build') { const r = build(true); console.log(Object.keys(r.result).map(c => c).join(', ') || 'nothing kept'); process.exit(r.bad ? 1 : 0); }
else { console.error('usage: phrasegen gen|render|build <cat…>'); process.exit(2); }
