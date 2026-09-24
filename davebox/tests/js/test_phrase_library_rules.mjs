/* tests/js/test_phrase_library_rules.mjs — the SHIPPED phrase packs obey the
 * library's rules.
 *
 * Every phrase in phrases/phrases-open.pack, and in phrases/phrases.pack when
 * the build key is present (PHRASE_KEY_FILE or ~/.davebox/phrase.key): a known
 * category; 1–4 bars; no empty leading bar; a public style tag; a unique id and
 * a unique upper-case name of 14 characters or fewer; drums at most three
 * sounds, more than one only for hats and percussion. Plus: the pack files name
 * nothing but the phrases, and the credits ship beside them.
 * Without the key the encrypted pack is NOT checked, and this says so.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parsePack, packCats, packCategory } from '../../ui/ui_phrase_pack.mjs';
import { parseLibrary, decodePhrase, isPbDrumCat, PB_DRUM_CATS, PB_MELODIC_CATS } from '../../ui/ui_phrases.mjs';
import { TAGS } from '../../tools/phrasegen/lib/genres.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }

const DIR = join(process.cwd(), 'phrases');
const keyFile = process.env.PHRASE_KEY_FILE || join(homedir(), '.davebox', 'phrase.key');
const KEY = existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '';
const FORBIDDEN = /yamaha|rm1x|rs7000|ymh|psyc|\bown:|lib:|src|lic/i;

const sources = [['phrases-open.pack', '']];
if (KEY) sources.push(['phrases.pack', KEY]);
else console.log('  NOTE — phrases.pack NOT checked: no key (set PHRASE_KEY_FILE or ~/.davebox/phrase.key)');

const all = [];
step('the packs and the credits are there, and the pack files carry nothing but phrases', () => {
    for (const f of ['phrases-open.pack', 'phrases.pack', 'CREDITS.md']) assert(existsSync(join(DIR, f)), f + ' missing');
    const open = readFileSync(join(DIR, 'phrases-open.pack'), 'utf8');
    assert(!FORBIDDEN.test(open), 'the open pack names a source or licence field: ' + (open.match(FORBIDDEN) || [])[0]);
    const credits = readFileSync(join(DIR, 'CREDITS.md'), 'utf8');
    assert(/Groove MIDI Dataset/.test(credits) && /Lakh MIDI Dataset/.test(credits) && /creativecommons\.org\/licenses\/by\/4\.0/.test(credits),
           'the credits do not name both datasets and the licence');
});

for (const [file, key] of sources) {
    step(file + ': every category decodes', () => {
        const pack = parsePack(readFileSync(join(DIR, file), 'utf8'));
        assert(pack, 'not a pack');
        for (const cat of packCats(pack)) {
            assert(PB_DRUM_CATS.includes(cat) || PB_MELODIC_CATS.includes(cat), 'unknown category ' + cat);
            const text = packCategory(pack, cat, key);
            assert(text, cat + ' did not decode');
            assert(!FORBIDDEN.test(text), cat + ' names a source or licence field: ' + (text.match(FORBIDDEN) || [])[0]);
            const doc = parseLibrary(text);
            assert(doc && doc.cat === cat, cat + ' is not a library');
            const raw = JSON.parse(text).phrases;
            assert(raw.length === doc.phrases.length, cat + ': ' + (raw.length - doc.phrases.length) + ' records unreadable');
            for (const p of raw) all.push(Object.assign({ cat, file }, p));
        }
    });
}

step('every phrase obeys the library rules', () => {
    assert(all.length > 0, 'no phrases checked');
    const ids = new Set(), names = new Map(), bad = [];
    for (const p of all) {
        const why = [];
        if (ids.has(p.id)) why.push('duplicate id');
        ids.add(p.id);
        const nk = p.cat + '|' + p.name;
        if (names.has(nk)) why.push('duplicate name in ' + p.cat);
        names.set(nk, 1);
        if (!(typeof p.name === 'string' && p.name.length >= 1 && p.name.length <= 14 && p.name === p.name.toUpperCase())) why.push('name');
        if (!TAGS.includes(p.g || '')) why.push('style ' + p.g);
        if (!(p.bars >= 1 && p.bars <= 4)) why.push('bars ' + p.bars);
        const notes = decodePhrase({ cat: p.cat, n: p.n });
        if (!notes.length) why.push('no notes');
        else if (Math.min(...notes.map(n => n.t)) >= 384) why.push('empty leading bar');
        if (isPbDrumCat(p.cat)) {
            const sounds = new Set(notes.map(n => n.p)).size;
            const cap = (p.cat === 'hat' || p.cat === 'perc') ? 3 : 1;
            if (sounds > cap) why.push(sounds + ' sounds');
        }
        if (why.length) bad.push(p.file + ' ' + p.cat + ' ' + p.id + ': ' + why.join(', '));
    }
    assert(!bad.length, bad.length + ' phrases break the rules, e.g.\n    ' + bad.slice(0, 8).join('\n    '));
    console.log(`         (${all.length} phrases checked)`);
});

if (failed) { console.error('FAIL: phrase library rules'); process.exit(1); }
console.log('PASS: phrase library rules');
