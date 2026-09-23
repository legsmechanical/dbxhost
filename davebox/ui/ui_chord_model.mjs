/* ui_chord_model.mjs — the melodic Chord layout's music, as pure functions.
 *
 * The surface (bottom row first):
 *   row 1  pads 0-7    eight chord SLOTS (default I ii iii IV V vi vii I↑)
 *   row 2  pads 8-15   held MODIFIERS: 7 9 SUS2 SUS4 ADD9 5 INV- INV+
 *   row 3  pads 16-23  STRUM: the last chord's notes, rising
 *   row 4  pads 24-31  the SCALE, rising
 *
 * Everything stays in key. A slot stores scale POSITIONS (a degree, a stack,
 * an inversion…), never notes, so a key or scale change re-fits the whole
 * palette. Chords are stacked from every other scale note, which works for any
 * scale — pentatonic and blues give open, suspended colours, still in key.
 *
 * No state here: callers pass the key, scale, slot and settings in.
 */

import { SCALE_INTERVALS } from './ui_pure.mjs';
import { chordLabel, keyUsesFlats } from './ui_chord.mjs';

export const NUM_SLOTS = 8;
export const PAD_CHORD_MAX = 6;          /* the engine's per-pad limit */

/* Slot K2 "Stack" values. */
export const STACKS = ['TRIAD', '7', '9', 'SUS2', 'SUS4', '7SUS4', 'ADD9', '5'];
const STACK_FLAGS = [
    {}, { seven: 1 }, { nine: 1 }, { sus2: 1 }, { sus4: 1 }, { sus4: 1, seven: 1 },
    { add9: 1 }, { five: 1 },
];
/* Row-2 pads, left to right. 6 and 7 are the inversion buttons. */
export const MODS = ['7', '9', 'SUS2', 'SUS4', 'ADD9', '5', 'INV-', 'INV+'];
const MOD_FLAGS = [{ seven: 1 }, { nine: 1 }, { sus2: 1 }, { sus4: 1 }, { add9: 1 }, { five: 1 }];
export const MOD_INV_DOWN = 6;
export const MOD_INV_UP = 7;

export const BASS_TONES = ['OFF', 'ROOT', '3RD', '5TH'];
export const SPREADS = ['CLOSE', 'OPEN'];
export const INV_MIN = -4, INV_MAX = 4;
export const OCT_MIN = -2, OCT_MAX = 2;

export function defaultSlot(i) {
    return { deg: i, stack: 0, inv: 0, spread: 0, bass: 0, oct: 0 };
}
export function defaultPalette() {
    const p = [];
    for (let i = 0; i < NUM_SLOTS; i++) p.push(defaultSlot(i));
    return p;
}
/* The CHORD bank's per-track settings. */
export function defaultChordSettings() {
    return { voicing: 0, smooth: 0, bass: 0, bassOct: 1, strum: 0, select: 0 };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function intervalsOf(scale) { return SCALE_INTERVALS[scale] || SCALE_INTERVALS[0]; }

/* Semitones above the tonic of scale degree d (any integer, any octave). */
export function degreeSemis(scale, d) {
    const iv = intervalsOf(scale), n = iv.length;
    const o = Math.floor(d / n);
    return o * 12 + iv[((d % n) + n) % n];
}

/* The flags a slot's stack and the held modifiers ask for, combined:
 * 7 + SUS4 = 7SUS4, 9 implies the 7th, and so on. */
export function stackFlags(stack, mods) {
    const f = Object.assign({}, STACK_FLAGS[stack | 0] || {});
    if (mods) for (const m of mods) Object.assign(f, MOD_FLAGS[m] || {});
    if (f.nine) f.seven = 1;
    return f;
}

/* Build the chord for degree `deg` with flags `f`, in scale steps above the
 * degree. A flag with no in-key form on this degree (SUS4 on the IV of a
 * major key is a tritone, not a fourth) is dropped and reported in
 * `plain`, so the screen can say the plain chord is what played. */
function stackOffsets(scale, deg, f) {
    const plain = [];
    const semi = (k) => degreeSemis(scale, deg + k) - degreeSemis(scale, deg);
    let third = 2;
    if (f.sus2) { if (semi(1) === 2) third = 1; else plain.push('SUS2'); }
    if (f.sus4 && third === 2) { if (semi(3) === 5) third = 3; else plain.push('SUS4'); }
    let offs = [0, third, 4];
    if (f.five) {
        if (semi(4) === 7) offs = [0, 4]; else plain.push('5');
    }
    if (f.seven) offs.push(6);
    if (f.nine || f.add9) offs.push(8);
    return { offs, plain };
}

function sortNum(a) { return a.slice().sort((x, y) => x - y); }

/* Walk a voicing: +k lifts the lowest note an octave k times, -k drops the
 * highest. This is the Orchid-style "one note at a time" inversion. */
export function invert(notes, k) {
    let ns = sortNum(notes);
    if (ns.length < 2) return ns;
    for (let i = 0; i < k; i++) { ns[0] += 12; ns = sortNum(ns); }
    for (let i = 0; i < -k; i++) { ns[ns.length - 1] -= 12; ns = sortNum(ns); }
    return ns;
}

/* OPEN: every second note from the bottom goes up an octave (C E G → C G E'). */
export function openSpread(notes) {
    const ns = sortNum(notes);
    return sortNum(ns.map((p, i) => (i % 2 === 1 ? p + 12 : p)));
}

/* Nearest voicing of `notes` to `prev` (smooth voice leading): try every
 * inversion within an octave either way, keep the one whose notes sit closest
 * to the previous chord's. Ties go to the smaller move. */
export function smoothTo(notes, prev) {
    if (!prev || !prev.length || notes.length < 2) return sortNum(notes);
    let best = null;
    const n = notes.length;
    for (let k = -n; k <= n; k++) {
        const v = invert(notes, k);
        let cost = 0;
        for (const p of v) {
            let d = 1e9;
            for (const q of prev) d = Math.min(d, Math.abs(p - q));
            cost += d;
        }
        if (!best || cost < best.cost || (cost === best.cost && Math.abs(k) < Math.abs(best.k)))
            best = { cost, k, v };
    }
    return best.v;
}

/* Roman numeral for scale degree `deg`, cased by the scale's own triad
 * there: upper = major third, lower = minor, ° diminished, + augmented. */
export function numeral(scale, deg) {
    const iv = intervalsOf(scale), n = iv.length;
    const d = ((deg % n) + n) % n;
    const r = ROMAN[d] || String(d + 1);
    const third = degreeSemis(scale, deg + 2) - degreeSemis(scale, deg);
    const fifth = degreeSemis(scale, deg + 4) - degreeSemis(scale, deg);
    if (third <= 3) return r.toLowerCase() + (fifth === 6 ? '\u00b0' : '');
    return r + (fifth === 8 ? '+' : '');
}

/* Harmonic function for the slot colour: 0 tonic (I iii vi), 1 subdominant
 * (ii IV), 2 dominant (V vii). Scales without seven notes use the same
 * positions. */
export function slotFunction(deg) {
    const d = ((deg % 7) + 7) % 7;
    return [0, 1, 0, 1, 2, 0, 2][d];
}

/* The notes a slot plays.
 *   o.key, o.scale   the track's key and scale
 *   o.root           MIDI note of the tonic the slots start from
 *   o.slot           { deg, stack, inv, spread, bass, oct }
 *   o.mods           held row-2 modifiers (indices), optional
 *   o.invDelta       extra inversion steps (Inv-/+), optional
 *   o.settings       the CHORD bank settings
 *   o.prev           the last chord's notes, for Smooth
 * Returns { notes, name, numeral, plain } — `notes` ascending, at most
 * PAD_CHORD_MAX, all within 0..127 (anything outside is dropped). */
export function slotChord(o) {
    const slot = o.slot || defaultSlot(0);
    const set = o.settings || defaultChordSettings();
    const f = stackFlags(slot.stack, o.mods);
    const { offs, plain } = stackOffsets(o.scale, slot.deg, f);
    let notes = offs.map((k) => o.root + degreeSemis(o.scale, slot.deg + k));
    if (set.smooth && o.prev && o.prev.length) {
        notes = smoothTo(notes, o.prev);
        notes = invert(notes, o.invDelta | 0);
    } else {
        notes = invert(notes, (slot.inv | 0) + (set.voicing | 0) + (o.invDelta | 0));
    }
    if (slot.spread) notes = openSpread(notes);
    notes = notes.map((p) => p + 12 * (slot.oct | 0));
    /* Bass: the slot's own choice, else the bank's Bass (the root). */
    const tone = slot.bass ? slot.bass : (set.bass ? 1 : 0);
    if (tone) {
        const toneDeg = slot.deg + (tone === 1 ? 0 : tone === 2 ? offs[1] : 4);
        const pc = ((o.root + degreeSemis(o.scale, toneDeg)) % 12 + 12) % 12;
        const low = notes[0];
        let b = low - (((low - pc) % 12 + 12) % 12 || 12);
        b -= 12 * Math.max(0, (set.bassOct | 0) - 1);
        notes = [b].concat(notes);
    }
    notes = sortNum(notes.filter((p) => p >= 0 && p <= 127)).slice(0, PAD_CHORD_MAX);
    const flats = keyUsesFlats(o.key, o.scale);
    const rootPc = ((o.root + degreeSemis(o.scale, slot.deg)) % 12 + 12) % 12;
    return { notes, name: chordLabel(notes, flats, rootPc), numeral: numeral(o.scale, slot.deg), plain };
}

/* Row 3: the chord's own notes (without an added bass), rising from `base`. */
export function strumRow(chordNotes, base) {
    const pcs = [...new Set(chordNotes.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b);
    const out = [];
    if (!pcs.length) return [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    let p = base;
    while (out.length < 8 && p <= 127) {
        if (pcs.indexOf(((p % 12) + 12) % 12) >= 0) out.push(p);
        p++;
    }
    while (out.length < 8) out.push(0xFF);
    return out;
}

/* Row 4: eight scale notes rising from the tonic at `root`. */
export function scaleRow(scale, root) {
    const out = [];
    for (let i = 0; i < 8; i++) {
        const p = root + degreeSemis(scale, i);
        out.push(p >= 0 && p <= 127 ? p : 0xFF);
    }
    return out;
}

/* The slot-card's inversion label: which chord tone is in the bass, and
 * +8/-8 when the walk has moved the chord a whole octave. */
export function invLabel(inv, size) {
    const n = Math.max(1, size | 0);
    const i = inv | 0;
    const tone = ((i % n) + n) % n;
    const oct = Math.floor(i / n);
    const names = ['ROOT', '1ST', '2ND', '3RD', '4TH', '5TH'];
    return (names[tone] || String(tone)) + (oct > 0 ? ' +8' : oct < 0 ? ' -8' : '');
}
