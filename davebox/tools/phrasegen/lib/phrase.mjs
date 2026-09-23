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
export const DRUM_CATS = ['kick', 'snare', 'hat', 'cymb', 'tom', 'perc'];
/* The shipped library uses the first six; the owner's private set also uses
 * the RM1x's own categories (seq, sfx, keys, guitar, orch, ethnic). */
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
