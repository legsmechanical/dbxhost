/* tests/js/test_midifile_write.mjs — writing a clip as a Standard MIDI File
 * (smfWrite in ui_midifile.mjs, for Export Clip to MIDI).
 *
 * Read back two ways: through this repo's own reader (smfParse — the MIDI
 * browser re-imports these files), and byte by byte where the reader does not
 * look (the end-of-track that holds a silent last bar, the tempo bytes). */
import { smfWrite, smfParse, smfLegalize, SMF_PPQN } from '../../ui/ui_midifile.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

/* The track's events as [absTick, bytes…] — an independent walk of the bytes. */
function events(b) {
    const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    let i = 22, t = 0; const end = 22 + u32(18), out = [];
    while (i < end) {
        let d = 0, c; do { c = b[i++]; d = (d << 7) | (c & 0x7f); } while (c & 0x80);
        t += d;
        const s = b[i];
        if (s === 0xff) { const ty = b[i + 1], len = b[i + 2]; out.push([t, 0xff, ty, ...b.slice(i + 3, i + 3 + len)]); i += 3 + len; }
        else { out.push([t, ...b.slice(i, i + 3)]); i += 3; }
    }
    return out;
}

step('the header: format 0, one track, 96 ticks per quarter', () => {
    const b = smfWrite({ notes: [] });
    assert(String.fromCharCode(...b.slice(0, 4)) === 'MThd' && b[9] === 0 && b[11] === 1, 'header ' + J([...b.slice(0, 14)]));
    assert(((b[12] << 8) | b[13]) === SMF_PPQN && SMF_PPQN === 96, 'division');
});

step('round trip through the reader: notes, tempo, time signature, name', () => {
    const notes = [{ tick: 0, pitch: 60, vel: 100, gate: 48 }, { tick: 96, pitch: 64, vel: 80, gate: 24 },
                   { tick: 96, pitch: 67, vel: 80, gate: 24 }, { tick: 190, pitch: 72, vel: 127, gate: 6 }];
    const r = smfParse(smfWrite({ name: 'Proj A1', bpm: 97.5, timeSig: { num: 3, den: 4 }, channel: 0, notes, lengthTicks: 288 }));
    assert(!r.error && r.format === 0 && r.parts.length === 1, J(r));
    const p = r.parts[0];
    assert(p.name === 'Proj A1' && !p.drum, 'part ' + p.name);
    assert(J(p.notes) === J([{ t: 0, g: 48, p: 60, v: 100 }, { t: 96, g: 24, p: 64, v: 80 }, { t: 96, g: 24, p: 67, v: 80 }, { t: 190, g: 6, p: 72, v: 127 }]),
           'notes ' + J(p.notes));
    assert(r.bpm === 97.5 && J(r.timeSig) === J({ num: 3, den: 4 }), 'bpm ' + r.bpm + ' ts ' + J(r.timeSig));
});

step('a drum clip is written on channel 10, and reads back as drums', () => {
    const r = smfParse(smfWrite({ channel: 9, notes: [{ tick: 0, pitch: 36, vel: 100, gate: 12 }] }));
    assert(r.parts[0].drum && J(r.parts[0].channels) === J([9]), J(r.parts[0]));
});

step('the end-of-track holds the clip length, silent last bar included', () => {
    const ev = events(smfWrite({ notes: [{ tick: 0, pitch: 60, vel: 100, gate: 24 }], lengthTicks: 4 * 384 }));
    const eot = ev[ev.length - 1];
    assert(eot[1] === 0xff && eot[2] === 0x2f && eot[0] === 1536, 'eot ' + J(eot));
});

step('a note ending past the clip length moves the end, never cuts the note', () => {
    const ev = events(smfWrite({ notes: [{ tick: 300, pitch: 60, vel: 100, gate: 200 }], lengthTicks: 384 }));
    assert(ev[ev.length - 1][0] === 500, 'eot ' + J(ev[ev.length - 1]));
});

step('a note struck again as it ends: the note-off comes first, two notes read back', () => {
    const b = smfWrite({ notes: [{ tick: 24, pitch: 60, vel: 90, gate: 24 }, { tick: 0, pitch: 60, vel: 100, gate: 24 }] });
    const at24 = events(b).filter(e => e[0] === 24 && e[1] !== 0xff).map(e => e[1] & 0xf0);
    assert(J(at24) === J([0x80, 0x90]), 'order at 24: ' + J(at24));
    assert(smfParse(b).parts[0].notes.length === 2, 'read back ' + J(smfParse(b).parts[0].notes));
});

step('tempo and time-signature bytes', () => {
    const ev = events(smfWrite({ bpm: 120, timeSig: { num: 6, den: 8 } }));
    const tempo = ev.find(e => e[2] === 0x51), sig = ev.find(e => e[2] === 0x58);
    assert(J(tempo.slice(3)) === J([0x07, 0xa1, 0x20]), 'tempo ' + J(tempo));
    assert(J(sig.slice(3)) === J([6, 3, 24, 8]), 'sig ' + J(sig));
});

step('out-of-range input is clamped, never written as a broken byte', () => {
    const r = smfParse(smfWrite({ channel: 99, notes: [{ tick: -5, pitch: 200, vel: 0, gate: 0 }] }));
    const n = r.parts[0].notes[0];
    assert(n.t === 0 && n.p === 127 && n.v === 1 && n.g === 1 && J(r.parts[0].channels) === J([15]), J(r.parts[0]));
});

step('a name keeps to printable ASCII', () => {
    const r = smfParse(smfWrite({ name: 'Café\u0001A', notes: [{ tick: 0, pitch: 60, vel: 100, gate: 1 }] }));
    assert(r.parts[0].name === 'Caf??A', 'name ' + r.parts[0].name);
});

step('a long clip: delta times past one byte, and many notes', () => {
    const notes = Array.from({ length: 600 }, (_, i) => ({ tick: i * 97, pitch: 36 + (i % 40), vel: 1 + (i % 127), gate: 50 }));
    const r = smfParse(smfWrite({ notes, lengthTicks: 600 * 97 }));
    assert(r.parts[0].notes.length === 600 && r.parts[0].notes[599].t === 599 * 97, 'n ' + r.parts[0].notes.length);
});

step('smfLegalize: one note per pitch per onset, the first kept', () => {
    const r = smfLegalize([{ tick: 0, pitch: 60, vel: 100, gate: 24 }, { tick: 0, pitch: 60, vel: 50, gate: 48 }], 384);
    assert(J(r) === J([{ tick: 0, pitch: 60, vel: 100, gate: 24 }]), J(r));
});
step('smfLegalize: a held note ends where the next of its pitch begins; other pitches untouched', () => {
    const r = smfLegalize([{ tick: 0, pitch: 60, vel: 100, gate: 200 }, { tick: 96, pitch: 60, vel: 90, gate: 24 },
                           { tick: 0, pitch: 64, vel: 80, gate: 200 }], 384);
    assert(J(r) === J([{ tick: 0, pitch: 60, vel: 100, gate: 96 }, { tick: 0, pitch: 64, vel: 80, gate: 200 },
                       { tick: 96, pitch: 60, vel: 90, gate: 24 }]), J(r));
    assert(smfParse(smfWrite({ notes: r })).parts[0].notes.length === 3, 'three notes read back');
});
step('smfLegalize: nothing runs past the clip end, and a note at or past it is dropped', () => {
    const r = smfLegalize([{ tick: 300, pitch: 60, vel: 100, gate: 200 }, { tick: 384, pitch: 62, vel: 100, gate: 10 }], 384);
    assert(J(r) === J([{ tick: 300, pitch: 60, vel: 100, gate: 84 }]), J(r));
});

if (failed) { console.log('FAIL: test_midifile_write'); process.exit(1); }
console.log('PASS: test_midifile_write');
