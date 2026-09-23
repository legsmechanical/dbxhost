/* ui_chord.mjs — the held-note / chord indicator on the melodic Track View.
 *
 * While notes are held on the active track (pads or external MIDI), the info
 * row shows them in brackets between the octave and the key/scale: one note
 * as its name and octave ("[F#2]"), several as the chord they spell ("[CMIN7]",
 * "[C/E]"). Nothing is shown once every note is released.
 *
 * Octaves follow Move's own convention (middle C, note 60, is C3), the same
 * one the drum Track View's "Pad:" readout uses.
 *
 * ⚠ The overview face is CAPS ONLY, so minor cannot be spelled "m" — it would
 * read as "M", major. Qualities are spelled out: MIN, MAJ7, DIM, AUG, SUS.
 */

import { S } from './ui_state.mjs';
import { extHeldNotes } from './ui_record.mjs';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'D\u266d', 'D', 'E\u266d', 'E', 'F', 'G\u266d', 'G', 'A\u266d', 'A', 'B\u266d', 'B'];

/* Each scale's parent major tonic lies this many semitones BELOW its own
 * tonic (SCALE_DISPLAY order): minor is the 6th mode, so 9, and so on. Whole-tone and diminished
 * have no key signature: null, and they spell with sharps. */
const PARENT_OFFSET = [0, 9, 2, 4, 5, 7, 11, 9, 9, 0, 9, 9, null, null];
/* Parent majors written with flats: F, B♭, E♭, A♭, D♭ (G♭/F# stays sharp). */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1]);

/* Does the key the pads are set to spell with flats? */
export function keyUsesFlats(key, scale) {
    const off = PARENT_OFFSET[scale];
    if (off == null) return false;
    return FLAT_MAJORS.has(((key - off) % 12 + 12) % 12);
}

/* Pitch-class sets from the root, most common first. An inverted chord is
 * matched by trying every held pitch class as the root. */
const CHORDS = [
    [[0, 4, 7], ''],
    [[0, 3, 7], 'MIN'],
    [[0, 4, 7, 10], '7'],
    [[0, 4, 7, 11], 'MAJ7'],
    [[0, 3, 7, 10], 'MIN7'],
    [[0, 7], '5'],
    [[0, 2, 7], 'SUS2'],
    [[0, 5, 7], 'SUS4'],
    [[0, 3, 6], 'DIM'],
    [[0, 4, 8], 'AUG'],
    [[0, 3, 6, 10], 'MIN7(\u266d5)'],
    [[0, 3, 6, 9], 'DIM7'],
    [[0, 3, 7, 11], 'MIN(MAJ7)'],
    [[0, 4, 7, 9], '6'],
    [[0, 3, 7, 9], 'MIN6'],
    [[0, 5, 7, 10], '7SUS4'],
    [[0, 2, 4, 7], 'ADD9'],
    [[0, 2, 3, 7], 'MIN(ADD9)'],
    [[0, 2, 4, 7, 10], '9'],
    [[0, 2, 4, 7, 11], 'MAJ9'],
    [[0, 2, 3, 7, 10], 'MIN9'],
    [[0, 4, 10], '7'],          /* no fifth — how a 7th is usually voiced */
    [[0, 4, 11], 'MAJ7'],
    [[0, 3, 10], 'MIN7'],
    [[0, 4, 8, 10], 'AUG7'],
    /* Shells as pads voice them. Without its third a chord is neither major
     * nor minor: it takes the common shorthand plus a raised dot at the top
     * right (SHELL_MARK), so "A♭MAJ7˙" never quite claims a C that isn't held. */
    [[0, 7, 10], '7', true],
    [[0, 7, 11], 'MAJ7', true],
    [[0, 2, 4], 'ADD9'],        /* no fifth — dropped as freely as in a 7th */
    [[0, 2, 3], 'MIN(ADD9)'],
];
const BY_KEY = new Map(CHORDS.map(([iv, q]) => [iv.join(','), q]));
const SHELL = new Set(CHORDS.filter((c) => c[2]).map(([iv]) => iv.join(',')));
/* Josh, 2026-09-22: "use the common shorthand but with a little dot/asterisk
 * in the top right corner to indicate it's non-standard". */
export const SHELL_MARK = '\u02d9';

export function noteLabel(n, flats) { return (flats ? FLATS : SHARPS)[n % 12] + (Math.floor(n / 12) - 2); }

/* The label for a set of held pitches, without brackets; '' for none.
 * Unnamed combinations fall back to their note names, lowest first.
 * `flats` spells note names with ♭ instead of #. `rootHint` (a pitch class)
 * is the root when the caller KNOWS it — a Chord-layout slot built on A reads
 * "AMIN7/C", not the equally true "C6" — used whenever it names the set. */
export function chordLabel(pitches, flats, rootHint) {
    const NAMES = flats ? FLATS : SHARPS;
    const ps = [...new Set(pitches)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
    if (ps.length === 0) return '';
    const pcs = [...new Set(ps.map((n) => n % 12))];
    if (pcs.length === 1) return noteLabel(ps[0], flats);       /* one note, or octaves of it */
    const bass = ps[0] % 12;
    /* Root position first, then each other pitch class as the root (slash). */
    let roots = [bass, ...pcs.filter((pc) => pc !== bass).sort((a, b) => a - b)];
    if (rootHint != null && pcs.indexOf(rootHint) >= 0) {
        const key = pcs.map((pc) => (pc - rootHint + 12) % 12).sort((a, b) => a - b).join(',');
        if (BY_KEY.has(key)) roots = [rootHint];
    }
    let best = null;
    for (const r of roots) {
        const key = pcs.map((pc) => (pc - r + 12) % 12).sort((a, b) => a - b).join(',');
        if (!BY_KEY.has(key)) continue;
        const rank = CHORDS.findIndex(([iv]) => iv.join(',') === key);
        const q = BY_KEY.get(key) + (SHELL.has(key) ? SHELL_MARK : '');
        if (r === bass) { best = { r, q }; break; }
        if (!best || rank < best.rank) best = { r, q, rank };
    }
    if (best) return NAMES[best.r] + best.q + (best.r === bass ? '' : '/' + NAMES[bass]);
    return noteNames(ps, flats);
}

/* The held notes by name, lowest first, each pitch class once. */
export function noteNames(pitches, flats) {
    const NAMES = flats ? FLATS : SHARPS;
    return [...pitches].sort((a, b) => a - b).map((n) => NAMES[n % 12])
        .filter((s, i, a) => a.indexOf(s) === i).join(' ');
}

/* The key's own root, spelled the way its chords are — so "[B♭MIN]" never sits
 * beside "A# MINOR". */
export function keyRootName(key, scale, plain) {
    const n = (keyUsesFlats(key, scale) ? FLATS : SHARPS)[((key | 0) % 12 + 12) % 12];
    /* `plain`: for the stock host font (menus, dialogs), which has lowercase
     * but no ♭ glyph — "Bb", the ordinary typed spelling. */
    return plain ? n.replace('\u266d', 'b') : n;
}

/* Shorten a label to fit `maxW` (measured by `widthOf`) without changing what
 * it says: a chord first loses its slash bass (still the right chord), then
 * becomes its `notes`; a note list loses its highest notes, marked "+". Never a cut mid-name —
 * "C#MIN7(" or a missing "/G#" reads as a different chord. */
export function fitHeldLabel(label, maxW, widthOf, notes) {
    if (widthOf(label) <= maxW) return label;
    if (label.indexOf(' ') < 0) {
        const slash = label.indexOf('/');
        if (slash > 0 && widthOf(label.slice(0, slash)) <= maxW) return label.slice(0, slash);
        /* Never just the root: "[A♭]" reads as a major triad. The notes, then. */
        if (!notes) return label;
        if (widthOf(notes) <= maxW) return notes;
        label = notes;
    }
    const ns = label.split(' ');
    while (ns.length > 1 && widthOf(ns.join(' ') + ' +') > maxW) ns.pop();
    return ns.join(' ') + ' +';
}

/* The pitches being played INTO track t right now: pads and external MIDI.
 * Sequencer echoes returning on the MIDI input (a Move-routed track) are not
 * input and are left out. */
export function heldInputNotes(t) {
    const out = [];
    if (t === S.activeTrack) for (const p of S.liveActiveNotes) out.push(p);
    for (const [p, info] of extHeldNotes) if (info.track === t && !info.echo) out.push(p);
    return out;
}

/* Changes whenever the indicator's text would; tick() redraws on a change. */
let _lastSig = '';
export function heldIndicatorChanged() {
    const sig = S.activeTrack + ':' + heldInputNotes(S.activeTrack).sort((a, b) => a - b).join(',');
    if (sig === _lastSig) return false;
    _lastSig = sig;
    return true;
}
