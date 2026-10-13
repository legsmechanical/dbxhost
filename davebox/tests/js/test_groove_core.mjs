/* tests/js/test_groove_core.mjs — notes → groove table, and reading groove
 * files (ui_groove_core.mjs).
 *
 * Every fixture is written by hand here — an XML groove in the shape Live
 * writes, the same gzipped by node, and a binary one built record by record.
 * Nothing in this file comes from a real groove file.
 */
import zlib from 'node:zlib';
import {
    grooveTableFromNotes, grooveMessages, grooveToJson, grooveFromJson, grooveCleanName,
    inflateRaw, gunzip, agrParse, isGrooveFileName, grooveBaseName, grooveGuessBase, GROOVE_FINE,
} from '../../ui/ui_groove_core.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assertEq(a, b, m) { if (!eq(a, b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
const bytesOf = (s) => Uint8Array.from([...s].map(c => c.charCodeAt(0)));

/* ---- notes → table ---- */

step('each slot takes the nearest note within half a slot: its distance and its velocity', () => {
    /* one bar of 1/16 at base 24: slot 0 on the grid, slot 1 three ticks late,
     * slot 2 two and a half ticks early, slot 3 empty */
    const t = grooveTableFromNotes([{ tick: 0, vel: 100 }, { tick: 27, vel: 80 }, { tick: 45.5, vel: 60 }], 24, 96);
    assertEq([t.base, t.n], [24, 4], 'shape');
    assertEq(t.off, [0, 3 * GROOVE_FINE, -2.5 * GROOVE_FINE, 0], 'offsets, in 1/16 ticks');
    assertEq(t.vel, [100, 80, 60, 0], 'velocities; 0 where the template has no note');
});

step('the loop wraps: a note just before the end belongs to the first slot', () => {
    const t = grooveTableFromNotes([{ tick: 93, vel: 90 }], 24, 96);
    assertEq(t.off, [-3 * GROOVE_FINE, 0, 0, 0], 'early for slot 0');
    assertEq(t.vel, [90, 0, 0, 0], 'velocity on slot 0');
});

step('a note exactly half way between two grid lines belongs to the EARLIER one, as its late note', () => {
    const t = grooveTableFromNotes([{ tick: 12, vel: 70 }], 24, 96);
    assertEq(t.off, [12 * GROOVE_FINE, 0, 0, 0], 'slot 0, half a slot late');
    assertEq(t.vel, [70, 0, 0, 0], 'and nowhere else: one note never fills two slots');
});

/* ⭐ THE HARD SWING. A 74% swing of 1/16ths puts every off-beat note 11.5 to
 * 12 ticks late — half a slot, as near the next line as its own. Matching the
 * nearest note to each line gave those notes away (the first cut of this made
 * a table with three late slots in two bars out of exactly this). In order,
 * every off-beat line gets its note. */
step('⭐ a hard swing: every off-beat slot is late, none is lost to the next line', () => {
    const notes = [];
    for (let beat = 0; beat < 4; beat++)
        notes.push({ tick: beat * 96 + 0.01, vel: 127 }, { tick: beat * 96 + 36.01, vel: 100 },
                   { tick: beat * 96 + 48, vel: 127 }, { tick: beat * 96 + 84, vel: 100 });
    const t = grooveTableFromNotes(notes, 24, 384);
    assertEq(t.n, 16, 'sixteen slots');
    assertEq(t.off.map(o => Math.round(o / GROOVE_FINE)), [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], 'every other slot twelve ticks late');
    assertEq(t.vel, [127, 100, 127, 100, 127, 100, 127, 100, 127, 100, 127, 100, 127, 100, 127, 100], 'each with its own velocity');
});

step('later than half a slot is still its own line\'s, up to a whole slot', () => {
    /* an 1/8 swing read on a 1/8 grid at 74%: 23 ticks late in a 48-tick slot,
     * and a 1/16 line whose note is 20 ticks late in a 24-tick slot */
    assertEq(grooveTableFromNotes([{ tick: 0, vel: 90 }, { tick: 71, vel: 90 }], 48, 96).off, [0, 23 * GROOVE_FINE], '23 late');
    assertEq(grooveTableFromNotes([{ tick: 0, vel: 90 }, { tick: 44, vel: 80 }, { tick: 48, vel: 90 }], 24, 96).off,
             [0, 20 * GROOVE_FINE, 0, 0], '20 late, with the next line taken by its own note');
});

step('two notes for one line: the nearer has it and the other finds the line it can; chords are one note', () => {
    let t = grooveTableFromNotes([{ tick: 2, vel: 99 }, { tick: 5, vel: 50 }], 24, 96);
    assertEq([t.off[0], t.vel[0]], [2 * GROOVE_FINE, 99], 'the nearer has line 0');
    assertEq(t.vel[1], 0, 'and the other is not pushed 19 ticks early onto line 1');
    t = grooveTableFromNotes([{ tick: 24, vel: 50 }, { tick: 24.5, vel: 99 }], 24, 96);
    assertEq([t.off[1], t.vel[1]], [24 * GROOVE_FINE - 24 * GROOVE_FINE, 99], 'struck together: one note, the louder');
});

step('a silent note is no note; the slot count follows the length, capped at 128', () => {
    assertEq(grooveTableFromNotes([{ tick: 0, vel: 0 }], 24, 96).vel, [0, 0, 0, 0], 'velocity 0 is not a template note');
    assertEq(grooveTableFromNotes([], 24, 24 * 500).n, 128, 'capped');
    assertEq(grooveTableFromNotes([], 24, 1).n, 1, 'never zero');
    assertEq(grooveTableFromNotes([], 32, 96).n, 3, 'a triplet grid: three slots a beat');
});

step('a template longer than 128 slots is cut at the end of the table, not folded over itself', () => {
    /* 16 bars of 1/16ths: straight for the first 8, every note 6 ticks late after */
    const notes = [];
    for (let i = 0; i < 256; i++) notes.push({ tick: i * 24 + (i >= 128 ? 6 : 0), vel: i >= 128 ? 40 : 100 });
    const t = grooveTableFromNotes(notes, 24, 256 * 24);
    assertEq(t.n, 128, 'capped at 128 slots');
    assert(t.off.every(o => o === 0) && t.vel.every(v => v === 100), 'the second half leaked into the first: '
        + JSON.stringify([t.off.filter(o => o).length, t.vel.filter(v => v !== 100).length]));
});

/* ---- the pieces sent to the engine ---- */

step('a table is sent as begin, eight slots a piece under their own keys, commit', () => {
    const g = { name: 'My "Groove"', base: 24, n: 10, timing: 90, velocity: 40,
                off: [0, 1, 2, 3, 4, 5, 6, 7, -8, 9], vel: [10, 11, 12, 13, 14, 15, 16, 17, 18, 0] };
    const m = grooveMessages(g);
    assertEq(m.map(x => x[0]), ['groove_begin', 'groove_slots_0', 'groove_slots_8', 'groove_commit'], 'keys, in order');
    assertEq(m[0][1], '24 10 90 0 0 40 My _Groove_', 'begin: base n timing quantize random velocity name');
    assertEq(m[1][1], '0 10 1 11 2 12 3 13 4 14 5 15 6 16 7 17', 'first eight, offset then velocity');
    assertEq(m[2][1], '-8 18 9 0', 'the rest');
    assert(new Set(m.map(x => x[0])).size === m.length, 'two pieces share a key: the transport would keep only the last');
    const big = grooveMessages({ name: 'x', base: 24, n: 128, off: new Array(128).fill(-32767), vel: new Array(128).fill(127) });
    assert(big.every(x => x[1].length < 250), 'a piece is too long for one write: ' + Math.max(...big.map(x => x[1].length)));
});

/* ---- on disk ---- */

step('a groove survives its own file, and a damaged file is refused', () => {
    const g = { name: 'Lazy', base: 24, n: 2, timing: 80, quantize: 5, random: 10, velocity: 20, off: [0, -40], vel: [0, 90] };
    assertEq(grooveFromJson(grooveToJson(g)), g, 'round trip');
    assert(grooveFromJson('{').error, 'broken JSON');
    assert(grooveFromJson('{"base":24,"n":3,"off":[0],"vel":[0]}').error, 'a slot count that does not match');
    assert(grooveFromJson('{"base":0,"n":1,"off":[0],"vel":[0]}').error, 'a zero slot length');
    assertEq(grooveFromJson('{"base":24,"n":1,"off":["x"],"vel":[999],"timing":"lots"}'),
             { name: 'Groove', base: 24, n: 1, timing: 100, quantize: 0, random: 0, velocity: 0, off: [0], vel: [127] },
             'nonsense values are clamped, not trusted');
});

step('names: only what the project file can hold between quotes', () => {
    assertEq(grooveCleanName('  Swing "16" {x}  '), 'Swing _16_ _x_', 'quotes and braces go');
    assertEq(grooveCleanName(''), 'Groove', 'never empty');
    assert(grooveCleanName('a'.repeat(60)).length <= 23, 'cut to the engine\'s length');
    assert(isGrooveFileName('Foo.AGR') && !isGrooveFileName('foo.mid'), 'file names');
    assertEq([grooveBaseName(24), grooveBaseName(32)], ['1/16', '1/8T'], 'slot names');
});

/* ---- inflate ---- */

step('inflate reads what zlib writes: stored, fixed and dynamic blocks', () => {
    const text = bytesOf('abcabcabcabc groove groove groove ' + 'xyz'.repeat(400) + [...Array(300).keys()].join(','));
    for (const level of [0, 1, 9]) {
        const got = inflateRaw(new Uint8Array(zlib.deflateRawSync(text, { level })));
        assert(got && eq([...got], [...text]), 'level ' + level + ' did not round-trip');
    }
    const fixed = inflateRaw(new Uint8Array(zlib.deflateRawSync(bytesOf('aaa'), { strategy: zlib.constants.Z_FIXED })));
    assert(fixed && eq([...fixed], [...bytesOf('aaa')]), 'a fixed-Huffman block');
    const gz = gunzip(new Uint8Array(zlib.gzipSync(text)));
    assert(gz && eq([...gz], [...text]), 'gzip wrapper');
});

step('inflate refuses damage and a bomb rather than throwing or growing', () => {
    const d = new Uint8Array(zlib.deflateRawSync(bytesOf('hello hello hello hello')));
    assert(inflateRaw(d.subarray(0, d.length - 3)) === null, 'a cut stream');
    assert(inflateRaw(Uint8Array.from([0x07, 0xff, 0xff])) === null, 'a reserved block type');
    const bomb = new Uint8Array(zlib.deflateRawSync(new Uint8Array(200000)));
    assert(inflateRaw(bomb, 1000) === null, 'output past the cap');
    assert(gunzip(Uint8Array.from([1, 2, 3])) === null, 'not gzip');
});

/* ---- .agr ---- */

/* A groove file in the shape Live writes: the clip's notes, then — AFTER the
 * clip — the grid and the four amounts. The clip carries a VelocityAmount of
 * its own, which is not the groove's. */
function xmlGroove(o) {
    const notes = (o.notes || []).map(n =>
        `<MidiNoteEvent Time="${n[0]}" Duration="0.1" Velocity="${n[1]}" OffVelocity="64" IsEnabled="${n[2] === false ? 'false' : 'true'}" />`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="12.0">
  <Groove>
    <Name Value="${o.name || 'Test Groove'}" />
    <Clip><Value><MidiClip Id="0">
      <Loop><LoopStart Value="0" /><LoopEnd Value="${o.loopEnd}" /></Loop>
      <VelocityAmount Value="0.99" />
      <Notes><KeyTracks><KeyTrack Id="0"><Notes>
        ${notes}
      </Notes><MidiKey Value="60" /></KeyTrack></KeyTracks></Notes>
    </MidiClip></Value></Clip>
    <Grid Value="${o.grid}" />
    <QuantizationAmount Value="${o.q}" />
    <TimingAmount Value="${o.t}" />
    <RandomAmount Value="${o.r}" />
    <VelocityAmount Value="${o.v}" />
  </Groove>
</Ableton>`;
}

step('.agr as XML: grid, length, notes and the four amounts', () => {
    const g = agrParse(bytesOf(xmlGroove({ name: 'Shuffle {A}', loopEnd: 1, grid: 3, q: 10, t: 80, r: 5, v: 25,
        notes: [[0, 100], [0.28125, 70], [0.5, 90], [0.75, 60, false]] })));
    assert(!g.error, 'refused: ' + g.error);
    assertEq([g.base, g.n], [24, 4], 'Grid 3 is 1/16; one beat is four slots');
    assertEq(g.off, [0, 3 * GROOVE_FINE, 0, 0], '0.28125 beats is 27 ticks: three late');
    assertEq(g.vel, [100, 70, 90, 0], 'a disabled note is no note');
    assertEq([g.timing, g.quantize, g.random, g.velocity], [80, 10, 5, 25], 'the GROOVE\'s amounts, not the clip\'s');
    assertEq(g.name, 'Shuffle _A_', 'name, cleaned');
});

step('.agr amounts written 0..1 are read as percentages too', () => {
    const g = agrParse(bytesOf(xmlGroove({ loopEnd: 1, grid: 1, q: 0, t: 0.5, r: 0.25, v: 1, notes: [[0, 100]] })));
    assertEq([g.base, g.timing, g.random, g.velocity], [48, 50, 25, 100], 'Grid 1 is 1/8; fractions scaled');
});

step('.agr gzip-wrapped reads the same as plain', () => {
    const xml = xmlGroove({ loopEnd: 2, grid: 3, q: 0, t: 100, r: 0, v: 0, notes: [[0, 100], [1.26, 80]] });
    const plain = agrParse(bytesOf(xml));
    const zipped = agrParse(new Uint8Array(zlib.gzipSync(bytesOf(xml))));
    assert(!plain.error && plain.n === 8, 'plain: ' + JSON.stringify(plain));
    assertEq(zipped, plain, 'gzip');
});

/* The binary container, as far as this reader cares: some header, then note
 * records of 25 bytes — time and duration as doubles, velocity and one more
 * float, an enabled byte — little-endian. */
function binGroove(notes, lead) {
    const head = [0xab, 0x1e, 0x56, 0x78, 1, 0, 0, 0, 0, 0, 0, 0, ...(lead || [3, 0, 0, 0, 71, 0, 114, 0])];
    const buf = new Uint8Array(head.length + notes.length * 25 + 9);
    buf.set(head);
    const dv = new DataView(buf.buffer);
    notes.forEach((n, i) => {
        const p = head.length + i * 25;
        dv.setFloat64(p, n[0], true); dv.setFloat64(p + 8, 0.25, true);
        dv.setFloat32(p + 16, n[1], true); dv.setFloat32(p + 20, 64, true);
        buf[p + 24] = n[2] === false ? 0 : 1;
    });
    return buf;
}

step('.agr binary: the notes are found, the grid and length worked out from them', () => {
    const g = agrParse(binGroove([[0, 100], [0.28125, 70], [0.5, 90], [0.78, 60], [1, 100], [1.25, 80], [1.5, 90], [1.75, 70]]));
    assert(!g.error, 'refused: ' + g.error);
    assertEq([g.base, g.n], [24, 8], 'eight notes over two beats: 1/16, two beats');
    assertEq(g.off[1], 3 * GROOVE_FINE, 'the second note is three ticks late');
    assertEq(g.vel.slice(0, 4), [100, 70, 90, 60], 'velocities');
    assertEq([g.timing, g.quantize, g.random, g.velocity], [100, 0, 0, 0], 'amounts are not read: Timing 100, the rest 0');
    assert(g.guessed === true, 'a binary groove says its grid was worked out');
});

step('.agr binary with a coarser pattern gets a coarser grid; disabled notes are dropped', () => {
    const g = agrParse(binGroove([[0, 100], [0.52, 70], [1, 90], [1.25, 60, false], [1.5, 80]]));
    assertEq([g.base, g.n], [48, 4], '1/8, two beats');
    assertEq(g.vel, [100, 70, 90, 80], 'the disabled note left no mark');
});

step('⭐ a MIDI file names no grid: it is worked out from the notes — 1/16s, swung 1/8s, triplets', () => {
    const at = (ts) => ts.map(t => ({ tick: t, vel: 100 }));
    const bar = 384;
    const six = []; for (let i = 0; i < 16; i++) six.push(i * 24 + (i % 2 ? 3 : 0));
    assert(grooveGuessBase(at(six), bar, 6) === 24, '1/16s read as ' + grooveGuessBase(at(six), bar, 6));
    const eig = []; for (let i = 0; i < 8; i++) eig.push(i * 48 + (i % 2 ? 9 : 0));
    assert(grooveGuessBase(at(eig), bar, 6) === 48, 'swung 1/8s read as ' + grooveGuessBase(at(eig), bar, 6));
    const tri = []; for (let i = 0; i < 12; i++) tri.push(i * 32);
    assert(grooveGuessBase(at(tri), bar, 6) === 32, '1/8 triplets read as ' + grooveGuessBase(at(tri), bar, 6));
    const q = [0, 96, 192, 288];
    assert(grooveGuessBase(at(q), bar, 6) === 96, '1/4s read as ' + grooveGuessBase(at(q), bar, 6));
    const t32 = []; for (let i = 0; i < 32; i++) t32.push(i * 12);
    assert(grooveGuessBase(at(t32), bar, 6) === 12, '1/32s read as ' + grooveGuessBase(at(t32), bar, 6));
    /* the swung 1/8s land in their own slots, nine ticks late */
    const g = grooveTableFromNotes(at(eig), 48, bar);
    assert(g.n === 8 && g.off[1] === 9 * 16 && g.off[0] === 0, 'the 1/8 table: ' + JSON.stringify(g.off));
});

step('⚠ a chord, a flam or two drums on one beat are ONE hit — they do not force a finer grid', () => {
    const eig = []; for (let i = 0; i < 8; i++) eig.push({ tick: i * 48, vel: 100 });
    const flam = eig.concat([{ tick: 0, vel: 90 }, { tick: 98, vel: 60 }, { tick: 196, vel: 60 }]);
    assert(grooveGuessBase(flam, 384, 6) === 48, 'with the flams folded: ' + grooveGuessBase(flam, 384, 6));
    assert(grooveGuessBase(flam, 384, 0) === 12, 'CONTROL — unfolded they force the finest: ' + grooveGuessBase(flam, 384, 0));
});

step('what is not a groove is refused with a reason, never thrown', () => {
    assert(agrParse(new Uint8Array(0)).error === 'NOT A GROOVE FILE', 'empty');
    assert(agrParse(bytesOf('MThd....header....')).error === 'NOT A GROOVE FILE', 'a MIDI file');
    assert(agrParse(bytesOf('<?xml version="1.0"?><Ableton><LiveSet/></Ableton>')).error === 'NOT A GROOVE FILE', 'another Ableton file');
    assert(agrParse(bytesOf(xmlGroove({ loopEnd: 1, grid: 3, q: 0, t: 1, r: 0, v: 0, notes: [] }))).error === 'NO NOTES', 'no notes');
    assert(agrParse(Uint8Array.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).error, 'broken gzip');
    assert(agrParse(Uint8Array.from([0xab, 0x1e, 0x56, 0x78, ...new Array(200).fill(0)])).error, 'binary with no notes');
    assert(agrParse(null).error, 'nothing at all');
});

if (failed) { console.error('FAIL: test_groove_core.mjs'); process.exit(1); }
console.log('PASS: test_groove_core.mjs');
