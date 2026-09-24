#!/usr/bin/env node
/* phrasegen — builds dAVEBOx's phrase library (davebox/phrases/<cat>.json).
 *
 *   node tools/phrasegen/phrasegen.mjs gen    <cat…>   candidates → cache/candidates/<cat>.json
 *   node tools/phrasegen/phrasegen.mjs render <cat…>   .mid + .wav per candidate → out/<cat>/
 *   node tools/phrasegen/phrasegen.mjs pack            candidates − curation.json drops → phrases/*.pack
 *   node tools/phrasegen/phrasegen.mjs check           pack in memory, compare with phrases/
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
import { encodeNotes, decodeNotes, fingerprint, isDrumCat, pitchInC, BAR, trimLeading, drumSounds, collapseRepeats, coarseKey } from './lib/phrase.mjs';
import { TAG_BPM, isTag, publicTag } from './lib/genres.mjs';
import { profile, loadStyle, genPhrase, genDrum, loadGate, tooClose, PART_OF } from './lib/stats_gen.mjs';
import { STYLE_FILES, FLAVOUR_NAME, PER_STYLE, PER_BASICS, PER_FLAVOUR, flavourUsable, countFor, drumCountFor } from './lib/style_plan.mjs';
import { writeSmf } from './lib/smf.mjs';
import { createHash } from 'node:crypto';
import { packChunk } from '../../ui/ui_phrase_pack.mjs';
import { renderWav } from './lib/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, 'cache');
const OUT = join(HERE, 'out');
const LIB_DIR = join(HERE, '..', '..', 'phrases');
const CURATION = join(HERE, 'curation.json');
/* An optional private source outside the repo: <dir>/tools/phrasegen-source.mjs
 * exporting ingest(cat, opts). Absent = skipped, with a warning. */
const PRIVATE_DIR = process.env.PHRASEGEN_PRIVATE_DIR || '';
const KEY_FILE = process.env.PHRASEGEN_KEY_FILE || (PRIVATE_DIR ? join(PRIVATE_DIR, 'keys', 'phrases.key') : '');
export const MAX_BARS = 4;
export const MAX_DRUM_SOUNDS = 3;
export const MULTI_SOUND_CATS = ['hat', 'perc', 'beat'];
/* a full beat: up to 8 sounds (the in-time preview's lane limit) */
export const BEAT_MAX_SOUNDS = 8;
export const LICENCE_ALLOW = ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0', 'PD', 'dAVEBOx'];

const GENRE_BPM = TAG_BPM;
const DRUM_PITCH = { kick: 36, snare: 38, hat: 42, cymb: 51, tom: 45, perc: 56 };
const VOICE = { kick: 'kick', snare: 'snare', hat: 'hat', cymb: 'hat', tom: 'tom', perc: 'perc' };

/* 32-bit FNV-1a, hex — stable ids for ingested phrases. */
function fnv8(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

async function loadSource(name) {
    if (name === 'own') {
        if (!PRIVATE_DIR) return null;
        const f = join(PRIVATE_DIR, 'tools', 'phrasegen-source.mjs');
        return existsSync(f) ? (await import(f)).ingest : null;
    }
    return (await import('./ingest/' + name + '.mjs')).ingest;
}

/* The library's rules, for every candidate from every source: no empty
 * leading bar, 1–MAX_BARS bars, drum sound limits, and — for drums other
 * than kicks — at least two velocity levels. Returns the fixed-up candidate
 * or null. */
function admit(cat, c) {
    const t0 = trimLeading(c.notes, c.bars || 1);
    const tl = collapseRepeats(t0.notes, t0.bars);
    const bars = tl.bars;
    if (!(bars >= 1 && bars <= MAX_BARS) || !tl.notes.length) return null;
    if (isDrumCat(cat)) {
        const cap = cat === 'beat' ? BEAT_MAX_SOUNDS : MULTI_SOUND_CATS.includes(cat) ? MAX_DRUM_SOUNDS : 1;
        if (drumSounds(tl.notes) > cap) return null;
        /* a beat is a kit: a kick or a snare, and at least two sounds */
        if (cat === 'beat' && (drumSounds(tl.notes) < 2 || !tl.notes.some(n => n.p === 36 || n.p === 38))) return null;
        /* too basic to be useful: a single hit (a cymbal crash excepted) */
        if (cat !== 'cymb' && tl.notes.length < 2) return null;
        if (cat !== 'kick' && new Set(tl.notes.map(n => Math.round(n.v / 8))).size < 2) return null;
    }
    return Object.assign({}, c, { notes: tl.notes, bars });
}

async function loadRules(cat) {
    const f = join(HERE, 'rules', cat + '.mjs');
    if (!existsSync(f)) throw new Error('no rules for ' + cat);
    return (await import(f)).default;
}

/* rules: { genres: [{ tag, count, feel, bars, mode?, make(rng, i) -> notes, name(i) }] } */
/* Names: "<STYLE> <nn>" per style in list order ("BASIC" for none) — the
 * phrase's own style, which may be narrower than the tag it is filed under
 * ("GOTH 04" in NEW WAVE) — with the source's descriptor when it fits in 14
 * characters ("FUNK LIVE 03"). Generated phrases keep their rules' names. */
function nameAll(list) {
    const n = new Map();
    for (const p of list) {
        if (p.name) continue;
        const tag = p.style || p.g || 'BASIC', key = tag + '|' + (p.desc || '');
        n.set(key, (n.get(key) || 0) + 1);
        const num = String(n.get(key)).padStart(2, '0');
        const withDesc = p.desc ? tag + ' ' + p.desc + ' ' + num : '';
        p.name = (withDesc && withDesc.length <= 14) ? withDesc : (tag + ' ' + num).slice(0, 14);
    }
}

async function gen(cats) {
    const { makeRng } = await import('./lib/rng.mjs');
    mkdirSync(join(CACHE, 'candidates'), { recursive: true });
    for (const cat of cats) {
        const rules = await loadRules(cat);
        const seen = new Set(), out = [];
        for (const g of (rules.genres || [])) {
            let made = 0, tries = 0;
            while (made < g.count && tries++ < g.count * 40) {
                const fam = (g.tag || 'basic') + (g.family ? '-' + g.family : '');
                const id = cat + '.' + fam.toLowerCase().replace(/\s+/g, '') + '.' + String(tries).padStart(3, '0');
                const rng = makeRng(id);
                const made0 = g.make(rng, made);
                if (!made0 || !made0.length) continue;
                const ad = admit(cat, { notes: made0, bars: g.bars || 1 });
                if (!ad) continue;
                const notes = ad.notes;
                if (rules.accept && !rules.accept(notes, g)) continue;
                const fp = coarseKey(cat, notes, ad.bars);
                if (seen.has(fp)) continue;
                seen.add(fp);
                made++;
                out.push({ id, name: g.name(made), cat, g: g.tag || '', bars: ad.bars, feel: g.feel || 'straight',
                           mode: isDrumCat(cat) ? '' : (g.mode || 'min'), src: 'gen:' + id, lic: 'dAVEBOx',
                           n: encodeNotes(cat, notes) });
            }
            if (made < g.count) console.warn(`  ${cat}/${g.tag || 'basic'} ${g.family || ''}: only ${made} of ${g.count} distinct candidates`);
        }
        /* ingested phrases (licence carried per phrase) */
        for (const ing of (rules.ingest || [])) {
            const fn = await loadSource(ing.source || 'gmd');
            if (!fn) {
                /* A skipped source writes a smaller library that looks complete:
                 * refuse, unless the skip is deliberate. */
                if (process.env.PHRASEGEN_ALLOW_MISSING !== '1')
                    throw new Error(`${cat}: source ${ing.source} not available (set PHRASEGEN_PRIVATE_DIR, or PHRASEGEN_ALLOW_MISSING=1 to build without it)`);
                console.warn(`  ${cat}: source ${ing.source} not available — SKIPPED (PHRASEGEN_ALLOW_MISSING=1)`);
                continue;
            }
            for (const raw of fn(cat, ing)) {
                const p = admit(cat, raw);
                if (!p) continue;
                const fp = coarseKey(cat, p.notes, p.bars);
                if (seen.has(fp)) continue;
                seen.add(fp);
                /* filed under the public tag, named for its own style */
                const tag = isTag(publicTag(p.g)) ? publicTag(p.g) : '';
                const style = tag ? p.g : '';
                out.push({ id: cat + '.' + (style || 'basic').toLowerCase().replace(/\s+/g, '') + '.' + fnv8(p.bars + '|' + (p.pads || []).join(',') + '|' + encodeNotes(cat, p.notes)),
                           name: '', style, desc: p.desc || '', cat, g: tag, bars: p.bars, feel: p.feel || 'straight', mode: '',
                           src: p.src, lic: p.lic, attrib: p.attrib, pads: p.pads || undefined, n: encodeNotes(cat, p.notes) });
            }
        }
        /* generated from the measured statistics of every style and named style */
        if (rules.stats) {
            const drum = isDrumCat(cat);
            /* real phrases per style already in (ingested above): generated drums
             * only top a style up */
            const real = new Map();
            for (const p of out) real.set(p.g || '', (real.get(p.g || '') || 0) + 1);
            const gate = drum ? null : loadGate(PRIVATE_DIR ? join(PRIVATE_DIR, 'reference', 'fingerprints.json') : '');
            if (!drum && !gate && process.env.PHRASEGEN_ALLOW_MISSING !== '1')
                throw new Error(`${cat}: similarity gate not available (set PHRASEGEN_PRIVATE_DIR, or PHRASEGEN_ALLOW_MISSING=1)`);
            let refused = 0;
            for (const [file, tag] of Object.entries(STYLE_FILES)) {
                const st = loadStyle(file);
                if (!st) continue;
                const groups = [[null, tag, file === 'basics' ? PER_BASICS : PER_STYLE]];
                for (const [fk, f] of Object.entries(st.flavours || {}))
                    if (flavourUsable(f) && FLAVOUR_NAME[fk]) groups.push([fk, FLAVOUR_NAME[fk], PER_FLAVOUR]);
                for (const [fk, style, base] of groups) {
                    const prof = profile(file, fk);
                    if (!prof) continue;
                    const part = drum ? null : prof.part(PART_OF[cat]);
                    const pub = style ? publicTag(style) : '';
                    const want = drum ? drumCountFor(cat, prof, real.get(pub) || 0, !!fk, file) : countFor(base, cat, part, prof, file, fk);
                    let made = 0, tries = 0;
                    while (made < want && tries++ < want * 30) {
                        const id = cat + '.' + (style || 'basic').toLowerCase().replace(/\s+/g, '') + '.g' + String(tries).padStart(3, '0');
                        /* major / minor in the measured proportion across the group */
                        const r = drum ? genDrum(cat, prof, makeRng(id)) : genPhrase(cat, prof, makeRng(id), (made + 0.5) / want < prof.minor ? 'min' : 'maj');
                        if (!r) continue;
                        const ad = admit(cat, { notes: r.notes, bars: r.bars });
                        if (!ad || ad.notes.length < (cat === 'fx' || cat === 'pad' ? 1 : 2)) continue;
                        if (!drum && tooClose(gate, cat, ad.notes, ad.bars)) { refused++; continue; }
                        const fp = coarseKey(cat, ad.notes, ad.bars);
                        if (seen.has(fp)) continue;
                        seen.add(fp);
                        made++;
                        out.push({ id, name: '', style: style && isTag(publicTag(style)) ? style : '', desc: '', cat,
                                   g: style ? publicTag(style) : '', bars: ad.bars, feel: 'straight', mode: drum ? '' : r.mode,
                                   ...(r.pads ? { pads: r.pads } : {}),
                                   src: 'gen:' + id, lic: 'dAVEBOx', n: encodeNotes(cat, ad.notes) });
                    }
                }
            }
            if (refused) console.log(`  ${cat}: ${refused} too close to the reference collection — refused`);
        }
        nameAll(out);
        writeFileSync(join(CACHE, 'candidates', cat + '.json'), JSON.stringify(out, null, 0));
        console.log(`${cat}: ${out.length} candidates`);
    }
}

function eventsOf(p) {
    const notes = decodeNotes(p.cat, p.n);
    if (isDrumCat(p.cat)) return notes.map(n => ({ t: n.t, v: n.v, g: n.g, p: n.p ?? DRUM_PITCH[p.cat], voice: VOICE[p.cat] }));
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

/* ---- packs ----
 * The library ships as two packs (ui/ui_phrase_pack.mjs): phrases.pack, whose
 * chunks are encrypted with the key in KEY_FILE, and phrases-open.pack, plain.
 * A phrase goes to the open pack when its licence is in OPEN_LICENCES. Only the
 * fields the browser reads ship. Nonces derive from each chunk's text, so the
 * same candidates always build the same bytes. */
const OPEN_LICENCES = ['CC-BY-4.0', 'CC0-1.0', 'PD'];
const SHIP_FIELDS = ['id', 'name', 'g', 'bars', 'feel', 'mode', 'pads', 'layers', 'n'];
/* fields left out when they hold the reader's default (ui_phrases parseLibrary) */
const SHIP_DEFAULTS = { bars: 1, feel: 'straight', mode: 'min' };
export const PACK_ROUNDS = 8;
function packs() {
    const cur = existsSync(CURATION) ? JSON.parse(readFileSync(CURATION, 'utf8')) : {};
    const drop = new Set(cur.drop || []);
    const files = existsSync(join(CACHE, 'candidates')) ? readdirSync(join(CACHE, 'candidates')).sort() : [];
    const key = KEY_FILE && existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : '';
    if (!key) throw new Error('no pack key (PHRASEGEN_KEY_FILE, or PHRASEGEN_PRIVATE_DIR/keys/phrases.key)');
    const enc = {}, open = {};
    let bad = 0, n = 0;
    for (const f of files) {
        const cat = f.replace(/\.json$/, '');
        const list = JSON.parse(readFileSync(join(CACHE, 'candidates', f), 'utf8')).filter(p => !drop.has(p.id));
        const split = { enc: [], open: [] };
        for (const p of list) {
            if (!LICENCE_ALLOW.includes(p.lic)) { console.error(`REFUSED ${p.id}: licence ${p.lic}`); bad++; continue; }
            if (!(p.bars >= 1 && p.bars <= MAX_BARS)) { console.error(`REFUSED ${p.id}: ${p.bars} bars`); bad++; continue; }
            if (!(p.name && p.name.length <= 14 && p.name === p.name.toUpperCase())) { console.error(`REFUSED ${p.id}: name "${p.name}"`); bad++; continue; }
            const ship = {};
            for (const k of SHIP_FIELDS) if (p[k] != null && p[k] !== '' && SHIP_DEFAULTS[k] !== p[k]) ship[k] = p[k];
            if (ship.layers && !Object.keys(ship.layers).length) delete ship.layers;
            (OPEN_LICENCES.includes(p.lic) ? split.open : split.enc).push(ship);
            n++;
        }
        if (split.open.length) open[cat] = JSON.stringify({ v: 1, cat, phrases: split.open });
        if (split.enc.length) {
            const text = JSON.stringify({ v: 1, cat, phrases: split.enc });
            const nonce = createHash('sha256').update(cat + '\n' + text).digest('hex').slice(0, 24);
            enc[cat] = packChunk(text, key, nonce, PACK_ROUNDS);
        }
    }
    return { bad, n, enc: JSON.stringify({ v: 1, enc: true, r: PACK_ROUNDS, chunks: enc }) + '\n',
             open: JSON.stringify({ v: 1, enc: false, chunks: open }) + '\n' };
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'gen') await gen(args);
else if (cmd === 'render') render(args);
else if (cmd === 'pack') {
    const r = packs();
    mkdirSync(LIB_DIR, { recursive: true });
    writeFileSync(join(LIB_DIR, 'phrases.pack'), r.enc);
    writeFileSync(join(LIB_DIR, 'phrases-open.pack'), r.open);
    console.log(`packed ${r.n} phrases → ${LIB_DIR}`);
    process.exit(r.bad ? 1 : 0);
}
else if (cmd === 'check') {
    const r = packs();
    const same = (f, t) => existsSync(join(LIB_DIR, f)) && readFileSync(join(LIB_DIR, f), 'utf8') === t;
    const ok = same('phrases.pack', r.enc) && same('phrases-open.pack', r.open);
    console.log(ok ? 'phrases: up to date' : 'phrases: OUT OF DATE — run phrasegen pack');
    process.exit(ok && !r.bad ? 0 : 1);
}
else { console.error('usage: phrasegen gen|render|pack|check <cat…>'); process.exit(2); }
