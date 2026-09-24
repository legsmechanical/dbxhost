/* The phrase record and its compact note encoding — the on-disk form the
 * module reads (davebox/phrases/<cat>.json).
 *
 *   drum     n = "t v g;t v g;…"             one lane: tick, velocity, gate
 *            n = "t v g p;…"                  several instruments (hats closed/
 *                                              pedal/open, a crash in a hat
 *                                              phrase…): p is the note's own
 *                                              pitch; `pads` lists them by hit
 *                                              count, and the browser assigns
 *                                              each to a pad
 *   melodic  n = "t deg oct acc v g;…"       degree in the phrase's own mode
 *
 * Ticks are 96 per quarter note (PPQN). A melodic note is stored relative to
 * C in its mode (maj/min): `deg` 0..6, `oct` octaves from the category's
 * anchor, `acc` a chromatic offset for notes outside the mode. */
export const PPQN = 96;
export const BAR = PPQN * 4;
export const MODES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
export const DRUM_CATS = ['beat', 'kick', 'snare', 'hat', 'cymb', 'tom', 'perc'];
/* The shipped library uses the first six; a user's own library may also use
 * seq, sfx, keys, guitar, orch and ethnic. */
export const MELODIC_CATS = ['bass', 'chord', 'arp', 'lead', 'pad', 'fx', 'seq', 'sfx', 'keys', 'guitar', 'orch', 'ethnic'];
/* Where each melodic category sits (MIDI note of its C): fixed per category
 * (Josh, 2026-09-23). */
/* fx: stabs, drones and one-note hits — anchored with chords and pads. */
export const ANCHOR = { bass: 36, chord: 60, arp: 60, pad: 60, lead: 72, fx: 60,
                         seq: 60, sfx: 60, keys: 60, guitar: 48, orch: 60, ethnic: 60 };

export const isDrumCat = (c) => DRUM_CATS.includes(c);

export function encodeNotes(cat, notes) {
    const drum = isDrumCat(cat);
    return notes.slice().sort((a, b) => a.t - b.t || (a.deg || 0) - (b.deg || 0))
        .map(n => drum ? (n.p != null ? [n.t, n.v, n.g, n.p] : [n.t, n.v, n.g]).join(' ')
                       : [n.t, n.deg, n.oct || 0, n.acc || 0, n.v, n.g].join(' '))
        .join(';');
}
export function decodeNotes(cat, s) {
    const drum = isDrumCat(cat);
    return String(s || '').split(';').filter(Boolean).map(r => {
        const a = r.split(' ').map(Number);
        return drum ? (a.length > 3 ? { t: a[0], v: a[1], g: a[2], p: a[3] } : { t: a[0], v: a[1], g: a[2] })
                    : { t: a[0], deg: a[1], oct: a[2], acc: a[3], v: a[4], g: a[5] };
    });
}
/* A melodic note as a pitch IN C (for rendering candidates and for the
 * module's own mapping when the project is in C major / minor). */
export function pitchInC(cat, mode, n) {
    const iv = MODES[mode] || MODES.maj;
    const d = ((n.deg % 7) + 7) % 7, extra = Math.floor(n.deg / 7);
    return ANCHOR[cat] + 12 * ((n.oct || 0) + extra) + iv[d] + (n.acc || 0);
}
/* Rhythm fingerprint for dedupe: onsets + coarse velocity buckets (+ degrees). */
export function fingerprint(cat, notes) {
    return notes.map(n => n.t + ':' + Math.round(n.v / 16) + (isDrumCat(cat) ? '' : ':' + n.deg + '.' + (n.oct || 0) + '.' + (n.acc || 0)))
        .sort().join(',');
}

/* A phrase never starts with an empty bar: move the notes so the first bar
 * with a note is bar 1, and shorten the phrase to match. → { notes, bars } */
export function trimLeading(notes, bars) {
    if (!notes.length) return { notes, bars };
    const first = Math.floor(Math.min(...notes.map(n => n.t)) / BAR);
    if (first <= 0) return { notes, bars };
    /* Trimming a 4-bar phrase to 3 would loop out of step with 4/4: rotate it
     * instead — start on the first bar with notes and carry the empty bar
     * round to the end, so the loop keeps its length. */
    if (bars - first === 3)
        return { notes: notes.map(n => Object.assign({}, n, { t: ((n.t - first * BAR) + bars * BAR) % (bars * BAR) }))
                              .sort((a, b) => a.t - b.t), bars };
    return { notes: notes.map(n => Object.assign({}, n, { t: n.t - first * BAR })), bars: Math.max(1, bars - first) };
}
/* How many distinct sounds a drum phrase uses (a one-pad phrase: 1). */
export function drumSounds(notes) { return new Set(notes.map(n => n.p ?? -1)).size; }

/* A phrase whose bars all repeat is that one bar (and a 4-bar phrase whose
 * halves repeat is 2 bars) — so a loop and its own 1-bar version are one
 * phrase. → { notes, bars } */
export function collapseRepeats(notes, bars) {
    const barKey = (b, len) => notes.filter(n => n.t >= b * BAR && n.t < (b + len) * BAR)
        .map(n => (n.t - b * BAR) + ':' + n.v + ':' + (n.p ?? '') + ':' + n.g).join(',');
    for (const len of [1, 2]) {
        if (bars <= len || bars % len) continue;
        const first = barKey(0, len);
        let same = true;
        for (let b = len; b < bars && same; b += len) same = barKey(b, len) === first;
        if (same) return { notes: notes.filter(n => n.t < len * BAR), bars: len };
    }
    return { notes, bars };
}
/* Near-duplicate key: 16th-grid onsets, four velocity levels, and the sound
 * (drums) or degree (melodic). Two phrases with one key are one phrase. */
export function coarseKey(cat, notes, bars) {
    const lvl = (v) => v <= 48 ? 0 : v <= 80 ? 1 : v <= 108 ? 2 : 3;
    return bars + '|' + notes.map(n => Math.round(n.t / 24) + ':' + lvl(n.v) + ':' +
        (isDrumCat(cat) ? (n.p ?? '') : n.deg + '.' + (n.oct || 0) + '.' + (n.acc || 0))).sort().join(',');
}
