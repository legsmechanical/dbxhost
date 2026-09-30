/* tests/js/test_midi_notes.mjs — ui_midi_notes.mjs: what a MIDI part becomes
 * in a clip (the window, the stretch, the pitch, the drum lanes, the payloads).
 * Pure: no host. */
import {
    foldToScale, mapPitch, planNotes, maxBarsAt, gridFor, drumVoices, defaultAssign,
    drumLaneNotes, melodicImportVal, melodicAudclipVal, lanesAudclipVal, lanesImportVal,
    STRETCH_STEPS, MN_MAX_SOUNDS, voiceName,
} from '../../ui/ui_midi_notes.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const MAJOR = 0, PENT_MAJ = 9;
const part = (notes, endTick) => ({ notes, endTick: endTick ?? Math.max(...notes.map(n => n.t + n.g)) });

step('fold: an in-scale note stays; C# in C major goes UP to D (a tie goes up, as xpose_snap)', () => {
    eq(foldToScale(60, 0, MAJOR), 60, 'C');
    eq(foldToScale(61, 0, MAJOR), 62, 'C#');
    eq(foldToScale(66, 0, MAJOR), 67, 'F# (tie between F and G)');
});
step('fold: the root is the KEY — C# is in D major', () => {
    eq(foldToScale(61, 2, MAJOR), 61, 'C# in D major');
    eq(foldToScale(63, 2, MAJOR), 64, 'D# in D major → E');
});
step('fold: a 5-note scale folds to its nearest note, not its degree', () => {
    eq(foldToScale(65, 0, PENT_MAJ), 64, 'F → E in C major pentatonic (E is 1 away, G 2)');
});
step('Oct and Semi move the note BEFORE the fold', () => {
    eq(mapPitch(60, { oct: -1, semi: 0, scaleOn: true, key: 0, scale: MAJOR }), 48, 'oct -1');
    eq(mapPitch(60, { oct: 0, semi: 1, scaleOn: true, key: 0, scale: MAJOR }), 62, 'semi +1 → C# → folds to D');
    eq(mapPitch(60, { oct: 0, semi: 1, scaleOn: false, key: 0, scale: MAJOR }), 61, 'Scale off: as written');
    eq(mapPitch(127, { oct: 3, semi: 0, scaleOn: false }), 127, 'clamped at the top');
});

step('the window: notes before Start and past the end are counted, the rest land re-timed', () => {
    const p = part([{ t: 0, g: 96, p: 60, v: 100 }, { t: 384, g: 96, p: 62, v: 100 }, { t: 800, g: 96, p: 64, v: 100 }], 1152);
    const r = planNotes(p, { startBar: 2, bars: 1, tps: 24, pitch: (x) => x });
    eq(r.notes.map(n => [n.t, n.p]), [[0, 62]], 'landed');
    eq([r.before, r.cut], [1, 1], 'before / cut');
    eq(r.lengthSteps, 16, 'one bar at 1/16');
});
step('stretch x2: ticks and gates double, the clip is twice as long', () => {
    const p = part([{ t: 96, g: 48, p: 60, v: 100 }], 384);
    const r = planNotes(p, { startBar: 1, bars: 1, tps: 48, f: 2, pitch: (x) => x });
    eq(r.notes.map(n => [n.t, n.g]), [[192, 96]], 'note');
    eq([r.span, r.lengthSteps], [768, 16], 'span / steps at 1/8');
});
step('stretch /2 halves; a gate never goes below 1 tick', () => {
    const p = part([{ t: 96, g: 1, p: 60, v: 100 }], 384);
    const r = planNotes(p, { startBar: 1, bars: 1, tps: 12, f: 0.5, pitch: (x) => x });
    eq(r.notes.map(n => [n.t, n.g]), [[48, 1]], 'note');
});
step('two notes that fold together become one', () => {
    const p = part([{ t: 0, g: 96, p: 61, v: 100 }, { t: 0, g: 96, p: 62, v: 90 }], 384);
    const r = planNotes(p, { startBar: 1, bars: 1, tps: 24, pitch: (x) => foldToScale(x, 0, MAJOR) });
    eq(r.notes.length, 1, 'deduped after the fold');
});
step('the 256-step cap follows the stretch: x8 on a 1/16 grid holds 2 bars', () => {
    eq(maxBarsAt(24, null, 1), 16, 'x1');
    eq(maxBarsAt(24, null, 8), 2, 'x8');
    const r = planNotes(part([{ t: 0, g: 96, p: 60, v: 100 }], 384 * 8), { startBar: 1, bars: 8, tps: 24, f: 8, pitch: (x) => x });
    eq([r.bars, r.lengthSteps], [2, 256], 'bars clamped');
});
step('the grid a part starts on moves with the stretch', () => {
    const p = part([{ t: 0, g: 96, p: 60, v: 100 }], 384 * 4);
    eq(gridFor(p, null, 1), 1, '1/16 at x1');
    eq(gridFor(p, null, 2), 2, '1/8 at x2');
    eq(gridFor(p, null, 1 / 8), 0, 'clamped at 1/32');
    eq(STRETCH_STEPS.map(s => s.label).join(' '), '/8 /4 /2 x1 x2 x4 x8', 'labels');
});

step('drum sounds: most-hit first, a tie to the lower note', () => {
    const notes = [42, 42, 42, 36, 36, 38, 38].map((p, i) => ({ t: i * 24, g: 12, p, v: 100 }));
    eq(drumVoices(notes).map(v => v.pitch), [42, 36, 38], 'order');
});
const LANES = Array.from({ length: 32 }, (_, l) => 36 + l);
step('Map GM: each sound to the lane playing its own note', () => {
    const v = [{ pitch: 42 }, { pitch: 36 }, { pitch: 38 }];
    eq(defaultAssign(v, LANES, 'gm', 0), [6, 0, 2], 'lanes');
});
step('Map Move: toms fold, percussion lands on 50 / 48 / 51', () => {
    const v = [{ pitch: 41 }, { pitch: 60 }];
    eq(defaultAssign(v, LANES, 'move', 0), [7, 14], 'lo tom → 43 (lane 7), bongo → 50 (lane 14)');
});
step('Map Off: the first sound on the lane opened on, the rest after it; at most 8 sounds', () => {
    const v = Array.from({ length: 10 }, (_, i) => ({ pitch: 100 + i }));
    const a = defaultAssign(v, LANES, 'off', 5);
    eq(a, [5, 6, 7, 8, 9, 10, 11, 12], 'lanes');
    eq(a.length, MN_MAX_SOUNDS, 'capped');
});
step('lane hits: a shared tick keeps the louder; an unplaced sound is left out', () => {
    const notes = [{ t: 0, g: 12, p: 36, v: 80 }, { t: 0, g: 12, p: 35, v: 120 }, { t: 24, g: 12, p: 99, v: 100 }];
    const voices = [{ pitch: 36 }, { pitch: 35 }, { pitch: 99 }];
    const m = drumLaneNotes(notes, voices, [0, 0, -1]);
    eq([...m.keys()], [0], 'lanes');
    eq(m.get(0), [{ t: 0, v: 120, g: 12 }], 'the louder hit');
});

step('payloads: melodic import and in-time preview', () => {
    const notes = [{ t: 0, g: 24, p: 60, v: 100 }];
    eq(melodicImportVal(1, 16, notes, true), '1 1 16|a 0 60 100 24', 'import');
    eq(melodicAudclipVal(1, 16, notes), '1 16 -1|a 0 60 100 24', 'audclip');
});
step('payloads: a drum load names only the lanes a sound goes to (the others keep their notes)', () => {
    const m = new Map([[5, [{ t: 24, v: 90, g: 12 }]], [2, [{ t: 0, v: 100, g: 12 }]]]);
    eq(lanesImportVal(1, 16, m, true), '1 1 16|L2;a 0 100 12;L5;a 24 90 12', 'import');
    eq(lanesAudclipVal(1, 16, m), '1 16 -2|L2;a 0 100 12;L5;a 24 90 12', 'preview');
});
step('sound names: GM, else the note number', () => {
    eq([voiceName(36), voiceName(42), voiceName(100)], ['KICK', 'HAT', 'N100'], 'names');
});

process.exit(failed);
