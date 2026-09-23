/* tests/js/test_midifile_parse.mjs — Standard MIDI File reading (ui_midifile.mjs).
 *
 * Every file here is built byte by byte, so each case says exactly what is in
 * it: formats 0/1/2, running status, note-on velocity 0 as a release, a pitch
 * struck twice before its release, notes left open at the end, PPQ and SMPTE
 * divisions, the RIFF wrapper, and the events that must be skipped (notes
 * only — no controller, bend, aftertouch or program change comes out).
 */
import {
    smfParse, planImport, maxBarsFor, barTicksOf, partBars, isMidiFileName,
    SMF_MAX_BYTES,
} from '../../ui/ui_midifile.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assertEq(a, b, m) { if (!eq(a, b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

/* ---- a tiny SMF writer ---- */
function vlq(n) {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
}
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n) => [(n >> 8) & 255, n & 255];
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
function chunk(id, body) { return [...ascii(id), ...be32(body.length), ...body]; }
function header(format, ntrks, div) { return chunk('MThd', [...be16(format), ...be16(ntrks), ...be16(div)]); }
/* events: [delta, ...bytes]; an end-of-track is appended unless noEot. */
function track(events, noEot) {
    const body = [];
    for (const [dt, ...bytes] of events) body.push(...vlq(dt), ...bytes);
    if (!noEot) body.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', body);
}
const file = (...parts) => Uint8Array.from(parts.flat());
const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
const name = (s) => meta(0x03, ascii(s));

step('format 0 with two channels gives one part per channel', () => {
    const f = file(header(0, 1, 96), track([
        [0, 0x90, 60, 100], [0, 0x91, 40, 90],
        [96, 0x80, 60, 0], [0, 0x81, 40, 0],
    ]));
    const r = smfParse(f);
    assertEq(r.format, 0, 'format');
    assertEq(r.parts.map(p => p.name), ['Ch 1', 'Ch 2'], 'names');
    assertEq(r.parts[0].notes, [{ t: 0, g: 96, p: 60, v: 100 }], 'ch1 notes');
    assertEq(r.parts[1].notes, [{ t: 0, g: 96, p: 40, v: 90 }], 'ch2 notes');
});

step('format 0 with ONE channel keeps the file\'s track name', () => {
    const f = file(header(0, 1, 96), track([[0, ...name('Groove')], [0, 0x99, 36, 100], [24, 0x89, 36, 0]]));
    assertEq(smfParse(f).parts.map(p => p.name), ['Groove'], 'name');
});

step('format 1: the notes-less tempo track is not offered; names come from the file', () => {
    const f = file(header(1, 3, 480),
        track([[0, ...meta(0x51, [0x07, 0xa1, 0x20])], [0, ...meta(0x58, [3, 2, 24, 8])]]),
        track([[0, ...name('Right Hand')], [0, 0x90, 72, 80], [480, 0x80, 72, 0]]),
        track([[0, 0x90, 48, 70], [960, 0x80, 48, 0]]));
    const r = smfParse(f);
    assertEq(r.parts.map(p => p.name), ['Right Hand', 'Track 3'], 'parts');
    assertEq(r.bpm, 120, 'tempo 500000us = 120');
    assertEq(r.timeSig, { num: 3, den: 4 }, 'time signature');
    assertEq(r.parts[0].notes, [{ t: 0, g: 96, p: 72, v: 80 }], 'PPQ 480 -> 96');
    assertEq(r.parts[1].notes[0].g, 192, 'two beats');
});

step('running status carries note events without repeating the status byte', () => {
    const f = file(header(0, 1, 96), track([
        [0, 0x90, 60, 100], [0, 64, 100], [0, 67, 100],
        [48, 60, 0], [0, 64, 0], [0, 67, 0],
    ]));
    const r = smfParse(f);
    assertEq(r.parts[0].notes.map(n => [n.p, n.g]), [[60, 48], [64, 48], [67, 48]], 'chord via running status');
});

step('note-on velocity 0 releases; the same pitch struck twice ends the first at the second', () => {
    const f = file(header(0, 1, 96), track([
        [0, 0x90, 60, 100], [24, 0x90, 60, 90], [24, 0x90, 60, 0],
    ]));
    const r = smfParse(f);
    assertEq(r.parts[0].notes, [{ t: 0, g: 24, p: 60, v: 100 }, { t: 24, g: 24, p: 60, v: 90 }], 'two notes');
});

step('a note never released closes at the end of the track, with a warning', () => {
    const f = file(header(0, 1, 96), track([[0, 0x90, 60, 100], [192, ...meta(0x01, ascii('x'))]]));
    const r = smfParse(f);
    assertEq(r.parts[0].notes, [{ t: 0, g: 192, p: 60, v: 100 }], 'closed at EOT');
    assert(r.warnings.includes('HELD NOTES'), 'warned: ' + r.warnings);
});

step('controllers, bend, aftertouch, program change and sysex are skipped and counted, never notes', () => {
    const f = file(header(0, 1, 96), track([
        [0, 0xc0, 5], [0, 0xb0, 7, 100], [0, 0xe0, 0, 64], [0, 0xd0, 30], [0, 0xa0, 60, 20],
        [0, 0xf0, 3, 1, 2, 0xf7],
        [0, 0x90, 60, 100], [96, 0x80, 60, 0],
    ]));
    const r = smfParse(f);
    assertEq(r.ignored, { cc: 1, pb: 1, at: 2, pc: 1, sysex: 1 }, 'counts');
    assertEq(r.parts.length, 1, 'one part');
    assertEq(r.parts[0].notes.length, 1, 'only the note');
});

step('format 2 patterns are each a part', () => {
    const f = file(header(2, 2, 96),
        track([[0, 0x90, 36, 100], [24, 0x80, 36, 0]]),
        track([[0, 0x90, 38, 100], [24, 0x80, 38, 0]]));
    const r = smfParse(f);
    assertEq(r.parts.map(p => p.name), ['Pattern 1', 'Pattern 2'], 'patterns');
});

step('SMPTE division converts through the file tempo', () => {
    /* 25 fps x 40 ticks/frame = 1000 ticks/s; 120 bpm → 1 beat = 500 ticks. */
    const f = file(header(0, 1, ((256 - 25) << 8) | 40), track([
        [0, ...meta(0x51, [0x07, 0xa1, 0x20])], [0, 0x90, 60, 100], [500, 0x80, 60, 0],
    ]));
    const r = smfParse(f);
    assertEq(r.parts[0].notes[0].g, 96, 'one beat');
    assert(r.warnings.includes('SMPTE TIME'), 'warned');
});

step('a RIFF RMID wrapper is opened', () => {
    const smf = file(header(0, 1, 96), track([[0, 0x90, 60, 100], [96, 0x80, 60, 0]]));
    const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const data = [...ascii('data'), ...le32(smf.length), ...smf];
    const f = Uint8Array.from([...ascii('RIFF'), ...le32(4 + data.length), ...ascii('RMID'), ...data]);
    assertEq(smfParse(f).parts[0].notes.length, 1, 'note found');
});

step('damaged and foreign input reports, never throws', () => {
    assertEq(smfParse(new Uint8Array(0)).error, 'EMPTY FILE', 'empty');
    assertEq(smfParse(Uint8Array.from(ascii('hello world, not midi'))).error, 'NOT A MIDI FILE', 'foreign');
    assertEq(smfParse(new Uint8Array(SMF_MAX_BYTES + 1)).error, 'FILE TOO BIG', 'size cap');
    const whole = file(header(0, 1, 96), track([[0, 0x90, 60, 100], [96, 0x80, 60, 0], [0, 0x90, 62, 100], [96, 0x80, 62, 0]]));
    const cut = whole.slice(0, whole.length - 9);
    const r = smfParse(cut);
    assert(!r.error, 'still a result');
    assert(r.warnings.includes('TRUNCATED'), 'warned: ' + r.warnings);
    assert(r.parts[0].notes.length >= 1, 'first note kept');
    /* data byte with no running status */
    const bad = smfParse(file(header(0, 1, 96), track([[0, 60, 100]])));
    assert(bad.warnings.includes('DAMAGED') || bad.error, 'damaged');
});

step('duplicate names get their channel as a qualifier', () => {
    const f = file(header(1, 2, 96),
        track([[0, ...name('Piano')], [0, 0x90, 60, 100], [96, 0x80, 60, 0]]),
        track([[0, ...name('Piano')], [0, 0x93, 48, 100], [96, 0x83, 48, 0]]));
    const r = smfParse(f);
    assertEq(r.parts.map(p => p.qual), ['Ch 1', 'Ch 4'], 'quals');
});

step('channel 10 parts are flagged as drums', () => {
    const f = file(header(0, 1, 96), track([[0, 0x99, 36, 100], [24, 0x89, 36, 0], [0, 0x90, 60, 1], [24, 0x80, 60, 0]]));
    const r = smfParse(f);
    assertEq(r.parts.map(p => [p.name, p.drum]), [['Ch 1', false], ['Ch 10', true]], 'drum flag');
});

step('file names: MIDI extensions only', () => {
    assert(isMidiFileName('Song.MID') && isMidiFileName('a.midi') && isMidiFileName('x.kar') && isMidiFileName('y.rmi'), 'accepted');
    assert(!isMidiFileName('a.wav') && !isMidiFileName('mid') && !isMidiFileName(''), 'refused');
});

/* ---- the window ---- */
const part = (notes) => ({ notes, endTick: Math.max(0, ...notes.map(n => n.t + n.g)) });
const bar = 384;

step('bar arithmetic follows the time signature and the clip step cap', () => {
    assertEq(barTicksOf({ num: 4, den: 4 }), 384, '4/4');
    assertEq(barTicksOf({ num: 6, den: 8 }), 288, '6/8');
    assertEq(maxBarsFor(24, { num: 4, den: 4 }), 16, '1/16 grid: 16 bars');
    assertEq(maxBarsFor(12, { num: 4, den: 4 }), 8, '1/32 grid: 8 bars');
    assertEq(maxBarsFor(48, { num: 4, den: 4 }), 32, '1/8 grid: 32 bars');
    assertEq(maxBarsFor(96, { num: 4, den: 4 }), 64, '1/4 grid: 64 bars');
    assertEq(maxBarsFor(24, { num: 3, den: 4 }), 21, '3/4 at 1/16: 21 bars');
    assertEq(partBars(part([{ t: 5 * bar, g: 10, p: 60, v: 1 }]), null), 6, 'spans into bar 6');
});

step('the window: before the start is left out, past the end is CUT, a crossing note is shortened', () => {
    const p = part([
        { t: 0, g: 96, p: 60, v: 100 },               /* bar 1: before start */
        { t: 2 * bar, g: 96, p: 62, v: 100 },         /* bar 3: lands at 0 */
        { t: 4 * bar - 48, g: 96, p: 64, v: 100 },    /* crosses the end */
        { t: 4 * bar, g: 96, p: 65, v: 100 },         /* bar 5: cut */
        { t: 9 * bar, g: 96, p: 67, v: 100 },         /* cut */
    ]);
    const r = planImport(p, { startBar: 3, bars: 2, tps: 24 });
    assertEq(r.notes.map(n => [n.t, n.g, n.p]), [[0, 96, 62], [2 * bar - 48, 48, 64]], 'landed');
    assertEq([r.before, r.cut, r.shortened], [1, 2, 1], 'counts');
    assertEq(r.lengthSteps, 32, '2 bars of 1/16');
});

step('length is capped by what the grid can hold', () => {
    const r = planImport(part([{ t: 0, g: 1, p: 60, v: 1 }]), { startBar: 1, bars: 99, tps: 24 });
    assertEq([r.bars, r.lengthSteps, r.maxBars], [16, 256, 16], 'capped to 16 bars');
});

step('a melodic clip keeps the first 512 notes; the rest are counted', () => {
    const notes = [];
    for (let i = 0; i < 600; i++) notes.push({ t: i * 6, g: 6, p: 60 + (i % 12), v: 100 });
    const r = planImport(part(notes), { startBar: 1, bars: 16, tps: 24 });
    assertEq([r.notes.length, r.overCap], [512, 88], 'cap');
});

step('drum destination: notes land by pad pitch; pitches no pad plays are counted', () => {
    const laneNotes = Array.from({ length: 32 }, (_, l) => 36 + l);
    const r = planImport(part([
        { t: 0, g: 24, p: 36, v: 100 }, { t: 96, g: 24, p: 38, v: 100 }, { t: 192, g: 24, p: 20, v: 100 },
    ]), { startBar: 1, bars: 1, tps: 24, laneNotes });
    assertEq(r.notes.map(n => [n.p, n.lane]), [[36, 0], [38, 2]], 'lanes');
    assertEq(r.noPad, 1, 'no pad');
});

step('the same pitch at the same tick lands once', () => {
    const r = planImport(part([{ t: 0, g: 24, p: 60, v: 100 }, { t: 0, g: 48, p: 60, v: 90 }]), { startBar: 1, bars: 1, tps: 24 });
    assertEq(r.notes.length, 1, 'deduped');
});

step('a full-size file parses in well under a tick budget', () => {
    const ev = [];
    for (let i = 0; ev.length * 4 < SMF_MAX_BYTES - 64; i++) ev.push([12, 0x90, 40 + (i % 40), 100], [12, 0x80, 40 + (i % 40), 0]);
    const f = file(header(0, 1, 96), track(ev));
    assert(f.length <= SMF_MAX_BYTES, 'fixture within cap: ' + f.length);
    const t0 = process.hrtime.bigint();
    const r = smfParse(f);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(!r.error && r.parts[0].noteCount === 4096, 'parsed, capped per part: ' + (r.parts[0] && r.parts[0].noteCount));
    assert(r.warnings.includes('NOTES OVER LIMIT'), 'over-limit warned');
    console.log(`       (${f.length} bytes in ${ms.toFixed(1)} ms on this machine)`);
});

if (failed) { console.error('test_midifile_parse: FAIL'); process.exit(1); }
console.log('test_midifile_parse: PASS');
