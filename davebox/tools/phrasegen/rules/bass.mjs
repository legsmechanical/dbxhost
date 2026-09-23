/* BASS — monophonic lines, stored as scale degrees relative to C so they land
 * in the project's key. Rules from research/{house,funk,dnb,basics}.md.
 *
 * Degrees are in the phrase's mode: 'min' (natural minor: R 2 b3 4 5 b6 b7) or
 * 'maj' (R 2 3 4 5 6 7; b7 is deg 6 with acc -1). The category anchor is C2
 * (36); DnB subs sit an octave below it.
 */
import { tickOf, isBeat, isOff8, isOff16, velIn, clampVel, BAR, STEP } from '../lib/grid.mjs';

/* degree names → { deg, acc } in each mode */
const MIN = { R: [0, 0], 2: [1, 0], b3: [2, 0], 4: [3, 0], 5: [4, 0], b6: [5, 0], b7: [6, 0], 6: [5, 1], b2: [1, -1] };
const MAJ = { R: [0, 0], 2: [1, 0], 3: [2, 0], 4: [3, 0], 5: [4, 0], 6: [5, 0], b7: [6, -1], b3: [2, -1], '#5': [4, 1] };
const note = (mode, name, oct, t, v, gate) => {
    const [deg, acc] = (mode === 'maj' ? MAJ : MIN)[name];
    return { t, deg, oct, acc, v: clampVel(v), g: Math.max(1, gate) };
};
/* Monophony: every note ends before the next starts (basics.md B-5). */
function mono(notes, loopTicks) {
    notes.sort((a, b) => a.t - b.t);
    for (let i = 0; i < notes.length; i++) {
        const next = i + 1 < notes.length ? notes[i + 1].t : loopTicks + notes[0].t;
        notes[i].g = Math.max(1, Math.min(notes[i].g, next - notes[i].t - 1));
    }
    return notes;
}
const pickW = (rng, pairs) => rng.weighted(pairs);

/* ---------------- HOUSE ---------------- */
/* corpus pitch distribution (D2): root 45 %, b7 10, 4 7, b3 6, 5 6, b6 6, 2 5 */
const HOUSE_PITCH = [['R', 45], ['b7', 10], ['4', 7], ['b3', 6], ['5', 6], ['b6', 6], ['2', 5]];
const HOUSE_P = [.93, .12, .36, .24, .65, .15, .50, .20, .74, .18, .49, .20, .78, .18, .56, .10];
const HOUSE_LEN = [[1, 25], [2, 50], [3, 15], [4, 8]];            /* steps (D2) */

function houseGroove(rng, bars) {
    const one = [];
    let prev = 'R';
    for (let s = 1; s <= 16; s++) {
        if (s === 1 ? !rng.chance(0.93) : !rng.chance(HOUSE_P[s - 1] * (isOff16(s) ? 0.8 : 1))) continue;
        const name = s === 1 ? 'R' : (rng.chance(0.26) ? prev : pickW(rng, HOUSE_PITCH));   /* repeats 26 % */
        const oct = rng.chance(0.04) ? 1 : 0;
        prev = name;
        one.push({ s, name, oct, v: isBeat(s) ? rng.int(95, 112) : rng.int(82, 100), len: pickW(rng, HOUSE_LEN) });
    }
    if (one.length < 3) return null;
    return shape('min', one, bars, rng, (rng2) => {                /* bar 2 changes only the last beat */
        const r = rng2.next();
        if (r < 0.5) return [{ s: 13, name: 'b7', oct: 0, v: 100, len: 1 }, { s: 15, name: 'R', oct: 1, v: 96, len: 1 }];
        return [{ s: 14, name: 'b3', oct: 0, v: 90, len: 1 }, { s: 15, name: '4', oct: 0, v: 94, len: 1 }];
    });
}
function houseOffbeat(rng, octaves) {
    const one = [];
    for (let s = 3; s <= 16; s += 4)
        one.push({ s, name: 'R', oct: octaves && (s === 7 || s === 15) ? 1 : 0, v: rng.int(95, 110), len: rng.chance(0.5) ? 1 : 2 });
    return shape('min', one, 1, rng);
}
function houseAcid(rng) {                                          /* H6-style 16-step, accents */
    const grid = [1, 3, 4, 6, 8, 9, 12, 14, 15];
    const names = ['R', 'R', 'R', 'b3', 'b7', '5', '4'];
    const one = grid.filter(() => rng.chance(0.85)).map(s => ({
        s, name: s === 1 ? 'R' : rng.pick(names), oct: rng.chance(0.25) ? 1 : 0,
        v: rng.chance(0.3) ? rng.int(112, 124) : rng.int(78, 92), len: 1 }));
    return shape('min', one, 1, rng);
}

/* ---------------- FUNK ---------------- */
/* the kick it locks to (GMD funk, D1) — step 1 forced ("the one") */
const FUNK_KICK = [.82, .03, .30, .44, .09, .22, .10, .35, .33, .14, .48, .21, .08, .15, .13, .08];
function funkLine(rng, bars, mode) {
    const pool = mode === 'maj' ? [['R', 30], ['3', 10], ['5', 18], ['b7', 18], ['6', 6]] : [['R', 32], ['b3', 12], ['4', 10], ['5', 18], ['b7', 18]];
    const one = [];
    for (let s = 1; s <= 16; s++) {
        const p = s === 1 ? 1 : Math.min(0.9, FUNK_KICK[s - 1] * 1.4 + (isOff16(s) ? 0.05 : 0));
        if (!rng.chance(p)) continue;
        const pop = s !== 1 && rng.chance(0.18);                     /* octave pops */
        one.push({ s, name: s === 1 ? 'R' : (pop ? 'R' : pickW(rng, pool)), oct: pop ? 1 : 0,
                   v: s === 1 ? rng.int(108, 120) : rng.int(90, 110), gate: rng.int(12, 20) });
    }
    /* ghost notes just before some real notes (funk.md: 10–35 % of notes) */
    const ghosts = [];
    for (const n of one) {
        if (n.s > 1 && !one.some(o => o.s === n.s - 1) && rng.chance(0.3))
            ghosts.push({ s: n.s - 1, name: n.name, oct: n.oct, v: rng.int(25, 42), gate: rng.int(4, 8) });
    }
    const all = one.concat(ghosts);
    if (all.length < 4) return null;
    return shape(mode, all, bars, rng, (rng2) => {
        if (rng2.chance(0.6))                                            /* chromatic walk-up 5 #5 6 b7 (F6) */
            return mode === 'maj'
                ? [{ s: 13, name: '5', oct: 0, v: 100, gate: 14 }, { s: 14, name: '#5', oct: 0, v: 96, gate: 14 }, { s: 15, name: '6', oct: 0, v: 98, gate: 14 }, { s: 16, name: 'b7', oct: 0, v: 102, gate: 14 }]
                : [{ s: 13, name: '4', oct: 0, v: 100, gate: 14 }, { s: 15, name: '5', oct: 0, v: 102, gate: 14 }, { s: 16, name: 'b7', oct: 0, v: 96, gate: 10 }];
        return [{ s: 13, name: '5', oct: 0, v: 104, gate: 16 }];           /* end on the 5th */
    });
}

/* ---------------- DNB (guide rules; sub one octave down) ---------------- */
function dnbSub(rng, kind) {
    const alt = () => rng.pick(['b6', 'b7', '4', '5', 'b3']);
    const L = (steps) => steps * STEP - 4;
    let n;
    if (kind === 'PEDAL') n = [{ b: 0, s: 1, name: 'R', len: 10 }, { b: 0, s: 11, name: 'R', len: 6 }, { b: 1, s: 1, name: 'R', len: 10 }, { b: 1, s: 11, name: rng.chance(0.5) ? 'R' : alt(), len: 6 }];
    else if (kind === 'REESE') { const a = alt(), b2 = alt(); n = [{ b: 0, s: 1, name: 'R', len: 16 }, { b: 1, s: 1, name: a, len: 8 }, { b: 1, s: 9, name: b2 === a ? 'R' : b2, len: 8 }]; }
    else if (kind === 'MOVE') n = [{ b: 0, s: 1, name: 'R', len: 10 }, { b: 0, s: 11, name: alt(), len: 3 }, { b: 0, s: 14, name: 'R', len: 3 }, { b: 1, s: 1, name: 'R', len: 10 }, { b: 1, s: 11, name: alt(), len: 6 }];
    else n = [{ b: 0, s: 1, name: 'R', len: 10 }, { b: 0, s: 11, name: 'R', len: 2 }, { b: 0, s: 13, name: 'b3', len: 4 }, { b: 1, s: 1, name: 'R', len: 10 }, { b: 1, s: 11, name: alt(), len: 6 }];
    return mono(n.map(x => note('min', x.name, -1, tickOf(x.b, x.s), rng.int(96, 112), L(x.len))), 2 * BAR);
}

/* ---------------- BASICS (exact archetypes) ---------------- */
function basic(rng, kind) {
    const hum = () => rng.int(-4, 4);
    const out = [];
    for (let s = 1; s <= 16; s++) {
        const t = tickOf(0, s), eighth = !isOff16(s);
        switch (kind) {
        case 'ROOT 8THS': if (eighth) out.push(note('min', 'R', 0, t, (isBeat(s) ? 100 : 88) + hum(), 42)); break;
        case 'ROOT 4THS': if (isBeat(s)) out.push(note('min', 'R', 0, t, 100 + hum(), 86)); break;
        case 'OCTAVES': if (eighth) out.push(note('min', 'R', isOff8(s) ? 1 : 0, t, (isBeat(s) ? 100 : 92) + hum(), 22)); break;
        case 'ROOT FIFTH': if (s === 1 || s === 9) out.push(note('min', s === 1 ? 'R' : '5', 0, t, 100 + hum(), 170)); break;
        case 'OFFBEAT': if (isOff8(s)) out.push(note('min', 'R', 0, t, 100 + hum(), 22)); break;
        case 'SHUFFLE':
            if (isBeat(s)) out.push(note('min', 'R', 0, t, 100 + hum(), 56));
            if (isOff8(s)) out.push(note('min', 'R', 1, t + 16, 86 + hum(), 28));   /* off-beat at tick 64 (2:1) */
            break;
        }
    }
    return mono(out, BAR);
}

/* One bar of cells (steps) → notes; optionally two bars with bar 2's last
 * beat rewritten. `len` is in steps, `gate` in ticks. */
function shape(mode, cells, bars, rng, vary) {
    const mk = (c, b) => note(mode, c.name, c.oct || 0, tickOf(b, c.s), c.v, c.gate != null ? c.gate : c.len * STEP - 4);
    let notes = cells.map(c => mk(c, 0));
    if (bars === 2) {
        notes = notes.concat(cells.filter(c => c.s < 13).map(c => mk(c, 1)));
        if (vary) notes = notes.concat(vary(rng).map(c => mk(c, 1)));
    }
    return mono(notes, bars * BAR);
}

const fam = (tag, family, count, bars, mode, make, namer) => ({ tag, family, count, bars, mode, feel: 'straight', make, name: namer });

export default {
    genres: [
        fam('HOUSE', 'GROOVE', 5, 1, 'min', (rng) => houseGroove(rng, 1), (i) => 'HOUSE ' + i),
        fam('HOUSE', 'GROOVE2', 3, 2, 'min', (rng) => houseGroove(rng, 2), (i) => 'HOUSE TURN ' + i),
        fam('HOUSE', 'OFF', 2, 1, 'min', (rng) => houseOffbeat(rng, false), (i) => 'HOUSE OFF ' + i),
        fam('HOUSE', 'OFFOCT', 2, 1, 'min', (rng) => houseOffbeat(rng, true), (i) => 'HOUSE OFF OCT ' + i),
        fam('HOUSE', 'ACID', 3, 1, 'min', houseAcid, (i) => 'HOUSE ACID ' + i),
        fam('FUNK', 'DORIAN', 4, 1, 'min', (rng) => funkLine(rng, 1, 'min'), (i) => 'FUNK ' + i),
        fam('FUNK', 'DOM7', 3, 1, 'maj', (rng) => funkLine(rng, 1, 'maj'), (i) => 'FUNK DOM ' + i),
        fam('FUNK', 'TURN', 3, 2, 'maj', (rng) => funkLine(rng, 2, 'maj'), (i) => 'FUNK TURN ' + i),
        fam('DNB', 'PEDAL', 2, 2, 'min', (rng) => dnbSub(rng, 'PEDAL'), (i) => 'DNB SUB ' + i),
        fam('DNB', 'REESE', 2, 2, 'min', (rng) => dnbSub(rng, 'REESE'), (i) => 'DNB REESE ' + i),
        fam('DNB', 'MOVE', 2, 2, 'min', (rng) => dnbSub(rng, 'MOVE'), (i) => 'DNB MOVE ' + i),
        fam('DNB', 'TAIL', 1, 2, 'min', (rng) => dnbSub(rng, 'TAIL'), (i) => 'DNB TAIL ' + i),
        ...['ROOT 8THS', 'ROOT 4THS', 'OCTAVES', 'ROOT FIFTH', 'OFFBEAT', 'SHUFFLE'].map(k =>
            Object.assign(fam('', k.replace(/\s/g, ''), 1, 1, 'min', (rng) => basic(rng, k), () => k), k === 'SHUFFLE' ? { feel: 'shuffle' } : {})),
    ],
};
