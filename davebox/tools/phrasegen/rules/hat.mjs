/* HAT — a single hi-hat lane: rhythm, velocity and note length.
 *
 * Every number here comes from research/{house,funk,dnb,basics}.md (their
 * source tags in brackets). Open vs closed hat on ONE lane is modelled as note
 * length: long gate = "open" (research/house.md, a stated limitation — it only
 * survives if the pad's sound responds to note length).
 */
import { tickOf, isBeat, isOff8, isOff16, velIn, clampVel, swingDelay, BAR } from '../lib/grid.mjs';

const CLOSED = [4, 8];                        /* gate ticks (house.md / funk.md proposal) */
const g = (rng, [lo, hi]) => rng.int(lo, hi);

/* hits: [{ bar, step, v, gate, shift? }] → notes */
function toNotes(hits, swing) {
    return hits.map(h => ({ t: tickOf(h.bar, h.step, swing) + (h.shift || 0), v: clampVel(h.v), g: h.gate }))
        .sort((a, b) => a.t - b.t);
}
/* Bar 2 = bar 1 with its LAST BEAT (steps 13-16) rewritten by `vary` — the
 * idiomatic two-bar move in all three genres. */
function twoBar(bar1, vary) {
    const b2 = bar1.filter(h => h.step < 13).map(h => Object.assign({}, h, { bar: 1 }));
    return bar1.concat(b2, vary().map(h => Object.assign({}, h, { bar: 1 })));
}

/* ---------------- HOUSE (research/house.md) ---------------- */
function houseOff(rng, { beats, full16 }) {
    const swing = rng.int(0, 5);                                   /* 50–60 % [S8] */
    const bar = [];
    for (let s = 1; s <= 16; s++) {
        if (isOff8(s)) bar.push({ bar: 0, step: s, v: velIn(rng, [95, 115]), gate: g(rng, [16, 22]) });   /* off-beat, "open" */
        else if (isBeat(s) && (full16 || rng.chance(beats))) bar.push({ bar: 0, step: s, v: velIn(rng, [55, 80]), gate: g(rng, CLOSED) });
        else if (isOff16(s)) {
            const p = full16 ? 1 : (s === 8 ? 0.4 : 0.15);        /* step 8 "before the third beat" [S7] */
            if (rng.chance(p)) bar.push({ bar: 0, step: s, v: velIn(rng, full16 ? [40, 60] : [35, 60]), gate: g(rng, CLOSED) });
        }
    }
    return { bar, swing };
}
function houseVary(rng) {
    const r = rng.next();
    if (r < 0.4) return [{ step: 15, v: velIn(rng, [100, 115]), gate: 20 }, { step: 16, v: velIn(rng, [50, 65]), gate: 5 }];
    if (r < 0.7) return [13, 14, 15, 16].map((s, i) => ({ step: s, v: 50 + i * 15 + rng.int(-4, 4), gate: s === 15 ? 18 : 5 }));   /* rising run */
    return [{ step: 13, v: velIn(rng, [60, 75]), gate: 6 }, { step: 15, v: velIn(rng, [100, 115]), gate: 20 }];
}

/* ---------------- FUNK (research/funk.md, GMD funk D1) ---------------- */
const FUNK_P   = [.79, .21, .70, .32, .85, .21, .76, .35, .81, .23, .73, .28, .85, .21, .66, .21];
const FUNK_VEL = [69, 36, 63, 36, 85, 40, 59, 47, 68, 39, 76, 40, 75, 42, 70, 48];
function funkSwing(rng) { return rng.chance(0.7) ? rng.int(0, 2) : rng.int(4, 10); }   /* bimodal (D1) */
function funkGroove(rng) {
    const swing = funkSwing(rng);
    const bar = [];
    let open = 0;
    for (let s = 1; s <= 16; s++) {
        /* 8ths are the skeleton (P .66–.85); nudge them up so every bar still reads as funk */
        const p = isOff16(s) ? FUNK_P[s - 1] : Math.min(0.95, FUNK_P[s - 1] + 0.1);
        if (!rng.chance(p)) continue;
        const isOpen = !open && ((s === 11 && rng.chance(0.35)) || ((s === 13 || s === 15) && rng.chance(0.1)));
        if (isOpen) open++;
        bar.push({ bar: 0, step: s, v: isOpen ? Math.max(82, FUNK_VEL[s - 1] + 10) : FUNK_VEL[s - 1] + rng.int(-8, 8),
                   gate: isOpen ? g(rng, [20, 40]) : g(rng, CLOSED) });
    }
    return { bar, swing };
}
function funk16(rng) {                               /* "two-handed sixteenth notes" [S12] */
    const swing = funkSwing(rng);
    const bar = [];
    for (let s = 1; s <= 16; s++)
        bar.push({ bar: 0, step: s, v: FUNK_VEL[s - 1] + (isOff16(s) ? rng.int(-6, 2) : rng.int(-4, 6)), gate: g(rng, CLOSED) });
    if (rng.chance(0.5)) { const o = bar[10]; o.gate = g(rng, [20, 36]); o.v = Math.max(o.v, 84); }   /* open on 11 */
    return { bar, swing };
}
function funkVary(rng) {
    const r = rng.next();
    if (r < 0.45) return [{ step: 13, v: 75 + rng.int(-5, 5), gate: 6 }, { step: 15, v: 88, gate: g(rng, [20, 36]) }];   /* open on 15 */
    if (r < 0.75) return [{ step: 13, v: 75 + rng.int(-5, 5), gate: 6 }, { step: 14, v: 42, gate: 5 }, { step: 15, v: 70, gate: 6 }, { step: 16, v: 48, gate: 5 }];
    return [{ step: 13, v: 78, gate: 6 }];           /* thinned: room for a fill */
}

/* ---------------- DNB (research/dnb.md — guide rules, lowest confidence) ---------------- */
function dnbTwoStep(rng, sparse) {
    const swing = rng.int(0, 4);
    const bars = [];
    for (let b = 0; b < 2; b++) {
        for (let s = 1; s <= 16; s++) {
            if (!isOff16(s)) {
                if (sparse && !isOff8(s)) continue;                 /* liquid: off-beats ticking [S31] */
                const open = b === 1 && s === 11 && rng.chance(0.5);          /* Amen: open on "and of 3", last bar [S17] */
                bars.push({ bar: b, step: s, v: velIn(rng, open ? [95, 110] : [80, 100]), gate: open ? g(rng, [24, 36]) : g(rng, CLOSED) });
                continue;
            }
            const p = (s === 8 || s === 10) ? 0.7 : (s === 6 || s === 14) ? 0.35 : s === 16 ? (b === 1 ? 0.7 : 0.35) : 0.08;
            if (sparse ? rng.chance(p * 0.4) : rng.chance(p))
                bars.push({ bar: b, step: s, v: velIn(rng, s === 16 ? [40, 60] : [45, 75]), gate: g(rng, CLOSED) });
        }
    }
    if (!sparse && rng.chance(0.35))                                   /* a short 32nd roll at the phrase end */
        bars.push({ bar: 1, step: 16, v: 55, gate: 4, shift: 12 });
    return { bar: bars, swing, bars: 2 };
}

/* ---------------- BASICS (research/basics.md — exact archetypes) ---------------- */
function basic(rng, kind) {
    const hum = () => rng.int(-4, 4);
    const bar = [];
    let swing = 0;
    for (let s = 1; s <= 16; s++) {
        const beat = isBeat(s), off = isOff8(s), six = isOff16(s);
        switch (kind) {
        case '8THS': if (!six) bar.push({ step: s, v: (beat ? 82 : 67) + hum(), gate: 6 }); break;
        case '16THS': bar.push({ step: s, v: (beat ? 88 : off ? 68 : 45) + hum(), gate: 5 }); break;
        case 'QUARTERS': if (beat) bar.push({ step: s, v: 88 + hum(), gate: 6 }); break;
        case 'OFFBEAT': if (off) bar.push({ step: s, v: 100 + hum(), gate: 20 }); break;
        case '8THS OPEN': if (!six) bar.push({ step: s, v: off ? 105 + hum() : 68 + hum(), gate: off ? 20 : 5 }); break;
        case 'SHUFFLE 8':                              /* off-beat 8th at tick 64 of the beat (2:1) [S14] */
            if (beat) bar.push({ step: s, v: 88 + hum(), gate: 8 });
            if (off) bar.push({ step: s, v: 62 + hum(), gate: 6, shift: 16 });
            break;
        case 'SWING 16': swing = 6; bar.push({ step: s, v: (beat ? 88 : off ? 68 : 45) + hum(), gate: 5 }); break;
        case 'GALLOP': if ((s - 1) % 4 !== 1) bar.push({ step: s, v: beat ? 90 + hum() : 50 + rng.int(0, 15), gate: 5 }); break;
        }
    }
    return { bar: bar.map(h => Object.assign({ bar: 0 }, h)), swing };
}

const fam = (tag, family, count, bars, feel, build, namer) => ({
    tag, family, count, bars, feel,
    make: (rng) => {
        const r = build(rng);
        const hits = r.bars === 2 || bars === 2 ? (r.bars === 2 ? r.bar : twoBar(r.bar, () => r.vary(rng))) : r.bar;
        return toNotes(hits, r.swing);
    },
    name: namer,
});

export default {
    /* real drummers: funk hat bars from the Groove MIDI Dataset (CC BY 4.0) */
    ingest: [{ style: 'funk', count: 6, tag: 'FUNK', name: 'FUNK LIVE' }],
    genres: [
        /* HOUSE */
        fam('HOUSE', 'OFF', 5, 1, 'straight', (rng) => houseOff(rng, { beats: 0.5 }), (i) => 'HOUSE OFF ' + i),
        fam('HOUSE', 'OFF2', 4, 2, 'straight', (rng) => Object.assign(houseOff(rng, { beats: 0.6 }), { vary: houseVary }), (i) => 'HOUSE LIFT ' + i),
        fam('HOUSE', '16S', 4, 1, 'swing16', (rng) => { const r = houseOff(rng, { full16: true }); r.swing = rng.int(3, 5); return r; }, (i) => 'HOUSE 16S ' + i),
        /* FUNK */
        fam('FUNK', 'GROOVE', 6, 1, 'straight', funkGroove, (i) => 'FUNK ' + i),
        fam('FUNK', 'GROOVE2', 4, 2, 'straight', (rng) => Object.assign(funkGroove(rng), { vary: funkVary }), (i) => 'FUNK TURN ' + i),
        fam('FUNK', '16S', 4, 1, 'straight', funk16, (i) => 'FUNK 16S ' + i),
        /* DNB */
        fam('DNB', '2STEP', 5, 2, 'swing16', (rng) => dnbTwoStep(rng, false), (i) => 'DNB 2STEP ' + i),
        fam('DNB', 'LIQUID', 3, 2, 'straight', (rng) => dnbTwoStep(rng, true), (i) => 'DNB LIQUID ' + i),
        /* BASICS — one of each archetype */
        ...['8THS', '16THS', 'QUARTERS', 'OFFBEAT', '8THS OPEN', 'SHUFFLE 8', 'SWING 16', 'GALLOP'].map(k =>
            fam('', k.replace(/\s/g, ''), 1, 1, k.startsWith('SHUFFLE') ? 'shuffle' : k.startsWith('SWING') ? 'swing16' : 'straight',
                (rng) => basic(rng, k), () => k)),
    ],
    /* no two hits closer than 1/32 on one lane; keep velocity spread ("dynamics are key") */
    accept(notes, fam) {
        for (let i = 1; i < notes.length; i++) if (notes[i].t - notes[i - 1].t < 12) return false;
        if (!fam.tag) return true;
        const vs = notes.map(n => n.v);
        return Math.max(...vs) - Math.min(...vs) >= 25;
    },
};
