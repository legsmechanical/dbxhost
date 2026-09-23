/* tests/js/test_phrases_model.mjs — the phrase library's model (ui_phrases.mjs).
 *
 * Library files in and out, the style filter, the time scale, the key mapping
 * (the JS twin of Transpose's remap), drum voices and where each lands by
 * default, and the exact engine payloads.
 */
import {
    parseLibrary, mergeLibraries, styleList, filterPhrases, decodePhrase, pitchInC, remapPitch,
    timing, melodicNotes, drumVoices, defaultAssign, drumLaneNotes, melodicImportVal,
    melodicAudclipVal, laneImportVal, laneAudclipVal, rollOf, PB_TIME_DEFAULT, PB_MAX_VOICES, defaultNoteAssign, drumAsMelodicNotes, lanesAudclipVal, lanesImportVal, styleGroups,
} from '../../ui/ui_phrases.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assertEq(a, b, m) { if (!eq(a, b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

const lib = (cat, phrases) => JSON.stringify({ v: 1, cat, phrases });

step('a library file is read; bad records are skipped, names upper-cased and cut to 14', () => {
    assert(parseLibrary('not json') === null, 'bad JSON');
    assert(parseLibrary(JSON.stringify({ v: 2, cat: 'hat', phrases: [] })) === null, 'wrong version');
    assert(parseLibrary(lib('banjo', [])) === null, 'unknown category');
    const d = parseLibrary(lib('hat', [
        { id: 'a', name: 'house hats long name', g: 'house', bars: 1, n: '0 100 12' },
        { id: 'b', name: 'no notes', n: '' },
        { name: 'no id', n: '0 1 1' },
    ]));
    assertEq(d.phrases.map(p => [p.id, p.name, p.g]), [['a', 'HOUSE HATS LON', 'HOUSE']], 'records');
});

step('shipped phrases come first; a repeated id from a later source is dropped', () => {
    const a = parseLibrary(lib('hat', [{ id: 'x', name: 'A', n: '0 1 1' }, { id: 'y', name: 'B', n: '0 1 1' }]));
    const b = parseLibrary(lib('hat', [{ id: 'y', name: 'MINE', n: '0 1 1' }, { id: 'z', name: 'C', n: '0 1 1' }]));
    assertEq(mergeLibraries([a, null, b]).map(p => p.name), ['A', 'B', 'C'], 'merge');
});

step('styles: ALL, the genre tags sorted, BASIC for the untagged; the filter follows', () => {
    const ps = parseLibrary(lib('bass', [
        { id: '1', name: 'X', g: 'TECHNO', n: '0 0 0 0 1 1' }, { id: '2', name: 'Y', g: '', n: '0 0 0 0 1 1' },
        { id: '3', name: 'Z', g: 'ACID', n: '0 0 0 0 1 1' }])).phrases;
    assertEq(styleList(ps), ['ALL', 'ACID', 'TECHNO', 'BASIC'], 'styles');
    assertEq(filterPhrases(ps, 'ALL').length, 3, 'all');
    assertEq(filterPhrases(ps, 'BASIC').map(p => p.id), ['2'], 'basic');
    assertEq(filterPhrases(ps, 'ACID').map(p => p.id), ['3'], 'tag');
    assert(!styleList(ps.slice(0, 1)).includes('BASIC'), 'BASIC only when something is untagged');
});

step('the picker list: every phrase, grouped by style (tags, then BASIC); starts mark each group', () => {
    const ps = parseLibrary(lib('bass', [
        { id: '1', name: 'A', g: 'TECHNO', n: '0 0 0 0 1 1' }, { id: '2', name: 'B', g: '', n: '0 0 0 0 1 1' },
        { id: '3', name: 'C', g: 'ACID', n: '0 0 0 0 1 1' }, { id: '4', name: 'D', g: 'TECHNO', n: '0 0 0 0 1 1' },
        { id: '5', name: 'E', g: 'ACID', n: '0 0 0 0 1 1' }])).phrases;
    const g = styleGroups(ps);
    assertEq(g.list.map(p => p.id), ['3', '5', '1', '4', '2'], 'order');
    assertEq(g.styles, ['ACID', 'TECHNO', 'BASIC'], 'styles');
    assertEq(g.starts, [0, 2, 4], 'starts');
});

step('octave: melodic phrases and drum-as-notes shift by whole octaves', () => {
    const p = parseLibrary(lib('bass', [{ id: 'b', name: 'B', mode: 'min', n: '0 0 0 0 100 24' }])).phrases[0];
    assertEq(melodicNotes(p, PB_TIME_DEFAULT, 0, 1, 2)[0].p, 60, 'up two');
    assertEq(melodicNotes(p, PB_TIME_DEFAULT, 0, 1, -3)[0].p, 0, 'down three');
    const d = parseLibrary(lib('hat', [{ id: 'h', name: 'H', n: '0 90 12' }])).phrases[0];
    assertEq(drumAsMelodicNotes(d, PB_TIME_DEFAULT, drumVoices(d), [42], -1)[0].p, 30, 'drum notes too');
});

step('a melodic note in C: anchor, degree in its mode, octave, chromatic offset', () => {
    assertEq(pitchInC('bass', 'min', { deg: 0, oct: 0, acc: 0 }), 36, 'bass root');
    assertEq(pitchInC('lead', 'min', { deg: 2, oct: 0, acc: 0 }), 75, 'minor third on the lead');
    assertEq(pitchInC('lead', 'maj', { deg: 2, oct: 0, acc: 0 }), 76, 'major third');
    assertEq(pitchInC('chord', 'maj', { deg: 7, oct: -1, acc: 1 }), 61, 'degree 7 wraps an octave; acc');
    assertEq(pitchInC('guitar', 'min', { deg: 0, oct: 0, acc: 0 }), 48, 'guitar anchor');
});

step('the key mapping keeps the degree across 7-note scales and snaps otherwise', () => {
    assertEq(remapPitch(64, 0, 0, 2, 1), 65, 'E in C major -> F in D minor (the third)');
    assertEq(remapPitch(60, 0, 1, 9, 1), 57, 'C minor -> A minor goes DOWN (shortest way)');
    assertEq(remapPitch(63, 0, 1, 0, 0), 64, 'Eb in C minor -> E in C major');
    assertEq(remapPitch(62, 0, 0, 0, 10), 63, 'D into C minor pentatonic snaps up to Eb');
    assertEq(remapPitch(61, 0, 0, 0, 0), 62, 'an off-scale note snaps (up first), as Transpose does');
    assertEq(remapPitch(2, 0, 0, 11, 0), 1, 'low notes: shift down one semitone for B major');
});

step('time scale: the phrase keeps its step layout, and length follows', () => {
    const one = { bars: 1 }, two = { bars: 2 };
    assertEq(timing(one, PB_TIME_DEFAULT), { f: 1, ticks: 384, res: 1, tps: 24, lengthSteps: 16 }, 'x1');
    assertEq(timing(two, 6), { f: 8, ticks: 6144, res: 4, tps: 192, lengthSteps: 32 }, 'x8');
    assertEq(timing(one, 0), { f: 1 / 8, ticks: 48, res: 0, tps: 12, lengthSteps: 4 }, '/8 bottoms out at the finest grid');
    assertEq(timing(one, 4).tps, 48, 'x2');
});

step('melodic notes land in key, scaled in time, gates never past the end', () => {
    const p = parseLibrary(lib('bass', [{ id: 'b', name: 'B', mode: 'min', bars: 1,
        n: '0 0 0 0 100 48;192 2 0 0 90 400;192 2 0 0 90 10' }])).phrases[0];
    assertEq(melodicNotes(p, PB_TIME_DEFAULT, 0, 1), [{ t: 0, p: 36, v: 100, g: 48 }, { t: 192, p: 39, v: 90, g: 192 }],
        'C minor; the doubled note once; long gate cut to the end');
    assertEq(melodicNotes(p, 4, 2, 1).map(n => [n.t, n.p, n.g]), [[0, 38, 96], [384, 41, 384]], 'x2 in D minor');
    const chrom = parseLibrary(lib('bass', [{ id: 'c', name: 'C', mode: 'min', n: '0 3 0 1 100 24' }])).phrases[0];
    assertEq(melodicNotes(chrom, PB_TIME_DEFAULT, 0, 1)[0].p, 42, 'the b5 passing note survives in C minor');
    assertEq(melodicNotes(chrom, PB_TIME_DEFAULT, 9, 1)[0].p, 39, 'and moves with the key (A minor: Eb)');
});

step('drum voices: pads order, layers only when their base is in the phrase', () => {
    const p = parseLibrary(lib('snare', [{ id: 's', name: 'S', bars: 1, pads: [38, 39, 82],
        layers: { 39: 38, 82: 99 }, n: '0 100 12 38;0 90 12 39;96 80 12 38;96 70 12 82;192 60 12 38' }])).phrases[0];
    assertEq(drumVoices(p), [{ pitch: 38, hits: 3, layerOf: null }, { pitch: 39, hits: 1, layerOf: 38 },
        { pitch: 82, hits: 1, layerOf: null }], 'voices');
    const one = parseLibrary(lib('kick', [{ id: 'k', name: 'K', n: '0 100 12;96 90 12' }])).phrases[0];
    assertEq(drumVoices(one), [{ pitch: -1, hits: 2, layerOf: null }], 'one-pad phrase');
});

step('default pads: layer with its base, first on the lane opened, pitch match, next empty, then any', () => {
    const lanePitches = Array.from({ length: 32 }, (_, l) => 36 + l);
    const used = new Array(32).fill(false); used[5] = true; used[6] = true;
    const voices = [{ pitch: 38, layerOf: null }, { pitch: 39, layerOf: 38 }, { pitch: 42, layerOf: null },
                    { pitch: 100, layerOf: null }];
    assertEq(defaultAssign(voices, lanePitches, used, 4), [4, 4, 6, 7], 'openLane 4');
    /* lane 6 plays 42 already, so it is chosen even though it has notes; the
     * stranger goes to the first EMPTY lane after 4 (5 is used, 6 taken) */
    const full = new Array(32).fill(true);
    assertEq(defaultAssign([{ pitch: 1 }, { pitch: 2 }], lanePitches, full, 31), [31, 0], 'all full: next lane, wrapping');
    const many = Array.from({ length: 9 }, (_, i) => ({ pitch: 200 + i, layerOf: null }));
    assertEq(defaultAssign(many, lanePitches, used, 0).length, PB_MAX_VOICES, 'voices capped');
});

step('drum lane notes: two voices on one lane strike once, the louder wins', () => {
    const p = parseLibrary(lib('snare', [{ id: 's', name: 'S', bars: 1, pads: [38, 39],
        n: '0 80 12 38;0 110 20 39;96 70 12 38' }])).phrases[0];
    const v = drumVoices(p);
    const m = drumLaneNotes(p, PB_TIME_DEFAULT, v, [3, 3]);
    assertEq([...m.keys()], [3], 'one lane');
    assertEq(m.get(3), [{ t: 0, v: 110, g: 20 }, { t: 96, v: 70, g: 12 }], 'merged');
    const split = drumLaneNotes(p, PB_TIME_DEFAULT, v, [3, 9]);
    assertEq(split.get(9), [{ t: 0, v: 110, g: 20 }], 'split');
    assertEq(drumLaneNotes(p, PB_TIME_DEFAULT, v, [3]).get(3).length, 2, 'unassigned voice left out');
    const rev = parseLibrary(lib('snare', [{ id: 'r', name: 'R', bars: 1, pads: [38, 39],
        n: '0 110 12 38;0 60 12 39' }])).phrases[0];
    assertEq(drumLaneNotes(rev, PB_TIME_DEFAULT, drumVoices(rev), [2, 2]).get(2)[0].v, 110, 'the louder wins when it comes first too');
});

step('a drum phrase on a melodic track: each instrument plays its tapped note', () => {
    const p = parseLibrary(lib('hat', [{ id: 'h', name: 'H', bars: 1, pads: [42, 46],
        n: '0 90 12 42;0 70 12 46;48 80 24 46' }])).phrases[0];
    const v = drumVoices(p);
    assertEq(defaultNoteAssign(v, 'hat'), [42, 46], 'own pitches by default');
    assertEq(defaultNoteAssign(drumVoices({ cat: 'kick', n: '0 100 12' }), 'kick'), [36], 'one-pad: the category note');
    assertEq(drumAsMelodicNotes(p, PB_TIME_DEFAULT, v, [60, 64]),
        [{ t: 0, p: 60, v: 90, g: 12 }, { t: 0, p: 64, v: 70, g: 12 }, { t: 48, p: 64, v: 80, g: 24 }], 'retapped');
    assertEq(drumAsMelodicNotes(p, PB_TIME_DEFAULT, v, [60, 60]).map(n => [n.t, n.v]), [[0, 90], [48, 80]], 'same note: louder wins');
});

step('engine payloads are the keys\' exact grammar', () => {
    const tm = { res: 1, lengthSteps: 16 };
    const mn = [{ t: 0, p: 36, v: 100, g: 48 }, { t: 96, p: 39, v: 90, g: 24 }];
    assertEq(melodicImportVal(tm, mn, true), '1 1 16|a 0 36 100 48;a 96 39 90 24', 'import');
    assertEq(melodicImportVal(tm, mn, false).slice(0, 2), '0 ', 'import into empty');
    assertEq(melodicAudclipVal(tm, mn), '1 16 -1|a 0 36 100 48;a 96 39 90 24', 'audclip');
    const dn = [{ t: 0, v: 110, g: 20 }];
    assertEq(laneImportVal(tm, dn, false), '0 1 16|a 0 110 20', 'lane import');
    assertEq(laneAudclipVal(tm, 7, dn), '1 16 7|a 0 110 20', 'lane audclip');
    const lanes = new Map([[9, [{ t: 48, v: 70, g: 6 }]], [2, [{ t: 0, v: 110, g: 20 }, { t: 96, v: 90, g: 6 }]]]);
    assertEq(lanesAudclipVal(tm, lanes), '1 16 -2|L2;a 0 110 20;a 96 90 6;L9;a 48 70 6', 'several lanes, ascending');
    assertEq(lanesImportVal(tm, lanes, true), '1 1 16|L2;a 0 110 20;a 96 90 6;L9;a 48 70 6', 'lanes import');
});

step('the roll: melodic rows high to low, drum rows by voice', () => {
    const p = parseLibrary(lib('bass', [{ id: 'b', name: 'B', n: '0 0 0 0 100 48;96 4 0 0 90 48' }])).phrases[0];
    const r = rollOf(p, PB_TIME_DEFAULT, 0, 1);
    assertEq([r.ticks, r.rows, r.notes.map(n => n.row)], [384, 2, [1, 0]], 'melodic');
    const d = parseLibrary(lib('hat', [{ id: 'h', name: 'H', pads: [42, 46], n: '0 90 12 42;48 90 12 46' }])).phrases[0];
    assertEq(rollOf(d, PB_TIME_DEFAULT, 0, 0).notes.map(n => n.row), [0, 1], 'drum');
    assertEq(decodePhrase({ cat: 'hat', n: '0 1 2;x y z;' }).length, 1, 'a broken record is skipped');
});

if (failed) { console.error('FAIL: phrases model'); process.exit(1); }
console.log('PASS: phrases model');
