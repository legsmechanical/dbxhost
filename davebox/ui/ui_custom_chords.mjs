/* ui_custom_chords.mjs — the melodic Custom layout on the pads.
 *
 * The bottom row is eight chords the user builds; the other three rows are
 * the Scale layout, starting again from the root on row 2. A chord is the
 * actual notes tapped — nothing follows the key.
 *
 *   hold a chord pad + tap a scale pad   add / remove that note (six at most)
 *   hold notes + tap an EMPTY chord pad  the pad takes the held notes
 *   (both also take keys on an external keyboard, played or held)
 *   Copy + chord pad, + another          copy it there (Shift + Copy: move it)
 *   hold a chord pad + Octave up/down    move that chord an octave
 *   Octave up/down                       move the region last touched: the
 *                                        chord row and the scale rows each
 *                                        have their own octave
 *   Delete + chord pad                   clear the chord
 *
 * ⭑ The audio engine plays the chords, as on the Chord layout: each chord pad
 * carries its notes in the pad map ("p+p+p"), and a held chord that is edited
 * is re-voiced in place (tN_chord_revoice). The held-chord books are shared
 * with ui_chord_pads.mjs.
 *
 * ⚠ The engine cannot start notes on a pad that pressed silent, nor re-voice
 * a pad to nothing. So an EMPTY chord stays silent while it is being filled
 * (each tapped pad sounds itself), and a chord emptied while it sounds rings
 * until its pad is let go.
 */

import { S } from './ui_state.mjs';
import { PAD_MODE_MELODIC_SCALE } from './ui_constants.mjs';
import { SCALE_INTERVALS } from './ui_pure.mjs';
import { chordLayoutOn, resetChordTransient, bookHeldChord, heldChordOf,
    revoiceHeldTo } from './ui_chord_pads.mjs';

export const CUSTOM_SLOTS = 8;
export const CUSTOM_CHORD_MAX = 6;      /* the engine's notes-per-pad limit */
export const OCT_LIMIT = 4;

/* ---- state ------------------------------------------------------------ */

export function ensureCustomState(t) {
    if (!Array.isArray(S.customChords[t]))
        S.customChords[t] = Array.from({ length: CUSTOM_SLOTS }, () => []);
}

/* Is track t's pad surface the Custom layout right now? */
export function customLayoutOn(t) {
    return !!S.padLayoutCustom[t] && (S.trackPadMode[t] | 0) === PAD_MODE_MELODIC_SCALE &&
        !chordLayoutOn(t);
}

/* Does track t's layout have chord pads (the Chord layout or this one)? Such
 * a pad map is checked by its checksum — one pad proves nothing. */
export function chordPadsOn(t) { return chordLayoutOn(t) || customLayoutOn(t); }

export function setCustomLayout(t, on) {
    const was = !!S.padLayoutCustom[t];
    S.padLayoutCustom[t] = !!on;
    if (on) ensureCustomState(t);
    if (was !== !!on) {
        S.customOctRegion[t] = 0;
        if (t === S.activeTrack) resetChordTransient();
    }
    S.screenDirty = true;
}

/* ---- the pad map ------------------------------------------------------ */

function chordOct(t) { return (S.customChordOctave[t] | 0) * 12; }

/* Chord k as it sounds: its notes moved by the chord row's octave, those
 * that leave 0..127 dropped. */
export function customChordPitches(t, k) {
    const ch = Array.isArray(S.customChords[t]) ? S.customChords[t][k] : null;
    if (!ch) return [];
    const sh = chordOct(t);
    return ch.map((p) => p + sh).filter((p) => p >= 0 && p <= 127);
}

/* The octave shift the pushed pad map adds to pad i. On this layout the
 * chord row carries its own octave inside its notes. */
export function padOctShift(t, i) {
    if (i < 8 && customLayoutOn(t)) return 0;
    return (S.trackOctave[t] | 0) * 12;
}

/* Fill S.padNoteMap / S.padChordMap for a Custom-layout track. Called from
 * computePadNoteMap with the key/scale it is laying out for. */
export function fillCustomPadMap(t, key, scale) {
    ensureCustomState(t);
    for (let k = 0; k < CUSTOM_SLOTS; k++) {
        const ps = customChordPitches(t, k);
        S.padNoteMap[k] = ps.length ? ps[0] : 0xFF;
        S.padChordMap[k] = ps.length > 1 ? ps : null;
    }
    const root = (S.padOctave[t] | 0) * 12 + key;
    const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS[0];
    const n = intervals.length;
    /* PADMODE Scale Step: where the scale rows start, in scale notes (they
     * stay in key, as the Scale layout's Step does). */
    const c = S.padModeCfg[t];
    const start = (c && c.custom) ? (c.custom.scaleStep | 0) : 0;
    for (let i = 8; i < 32; i++) {
        const deg = (i % 8) + (Math.floor(i / 8) - 1) * 3 + start;
        const p = root + Math.floor(deg / n) * 12 + intervals[((deg % n) + n) % n];
        S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
        S.padChordMap[i] = null;
    }
}

/* ---- presses ---------------------------------------------------------- */

/* The chord the taps and the octave buttons edit: the most recently pressed
 * chord pad still held on track t; -1 when none. */
export function customEditTarget(t) {
    if (t !== S.activeTrack || !customLayoutOn(t)) return -1;
    /* PADMODE Hold: Play (Josh, 2026-10-22) — a held chord pad just plays,
     * so the scale rows above can be played with it without editing it. */
    if (customPlayMode(t)) return -1;
    return customHeldPad(t);
}

/* Is track t's Custom layout in Play (holding a chord never edits it)? */
export function customPlayMode(t) {
    const c = S.padModeCfg[t];
    return !!(c && c.custom && c.custom.play);
}

/* The most recently pressed chord pad still held on track t (whatever Hold
 * is set to); -1 when none. The assign card edits this one. */
export function customHeldPad(t) {
    if (t !== S.activeTrack || !customLayoutOn(t)) return -1;
    for (let i = S.chordHeldSlots.length - 1; i >= 0; i--) {
        const k = S.chordHeldSlots[i];
        const h = heldChordOf(k);
        if (h && h.custom && h.t === t) return k;
    }
    return -1;
}

/* A chord pad went down. Returns the pitches it sounds (none when empty). */
export function customChordPress(t, k) {
    ensureCustomState(t);
    const pitches = customChordPitches(t, k);
    bookHeldChord(t, k, pitches);
    S.customOctRegion[t] = 1;
    return pitches;
}

/* A scale pad went down with nothing held: the octave buttons follow it. */
export function customScalePress(t) { S.customOctRegion[t] = 0; }

/* The chord changed while its pad is held: re-voice it where the engine can
 * (the pad is sounding, and still has a note to sound). */
export function revoiceIfSounding(t, k) {
    const h = heldChordOf(k);
    const after = customChordPitches(t, k);
    if (!h || !h.pitches.length || !after.length) return null;
    return revoiceHeldTo(t, k, after);
}

function edited() {
    S.pendingPadNoteMapRecompute = true;
    S.chordDirty = true;
    S.screenDirty = true;
}

/* Add `heard` (a pitch as a tapped pad sounds it) to chord k, or remove it
 * if it is there. Returns { ok, why, rv }: why is 'full' or 'range' when
 * refused; rv a re-voice record for the JS books, or null. */
export function customChordToggle(t, k, heard) {
    ensureCustomState(t);
    const stored = heard - chordOct(t);
    if (stored < 0 || stored > 127) return { ok: false, why: 'range', rv: null };
    const ch = S.customChords[t][k];
    const at = ch.indexOf(stored);
    if (at >= 0) ch.splice(at, 1);
    else {
        if (ch.length >= CUSTOM_CHORD_MAX) return { ok: false, why: 'full', rv: null };
        ch.push(stored);
        ch.sort((a, b) => a - b);
    }
    edited();
    return { ok: true, why: null, rv: revoiceIfSounding(t, k) };
}

/* Move chord k an octave (dir = +1 / -1). Refused when a note would leave
 * 0..127, stored or as heard. */
export function customChordTranspose(t, k, dir) {
    ensureCustomState(t);
    const ch = S.customChords[t][k];
    const d = dir > 0 ? 12 : -12, sh = chordOct(t);
    if (!ch.length) return { ok: false, why: 'empty', rv: null };
    for (const p of ch) {
        if (p + d < 0 || p + d > 127 || p + d + sh < 0 || p + d + sh > 127)
            return { ok: false, why: 'range', rv: null };
    }
    S.customChords[t][k] = ch.map((p) => p + d);
    edited();
    return { ok: true, why: null, rv: revoiceIfSounding(t, k) };
}

/* Empty chord k. Returns the notes it held (for undo), or null when it was
 * already empty. */
export function customChordClear(t, k) {
    ensureCustomState(t);
    const was = S.customChords[t][k];
    if (!was.length) return null;
    S.customChords[t][k] = [];
    edited();
    return was.slice();
}

/* Make chord k exactly `notes` (as stored): undo of a clear, a paste. */
export function customChordSet(t, k, notes) {
    ensureCustomState(t);
    S.customChords[t][k] = cleanChord(notes);
    edited();
}

/* Chord k as stored (a copy), for copy / undo. */
export function customChordGet(t, k) {
    ensureCustomState(t);
    return S.customChords[t][k].slice();
}

/* Notes held on the scale rows go into chord k (pitches as heard). The
 * lowest six are kept; a note the chord row's octave puts out of range is
 * left out. Returns how many were stored. */
export function customChordFromHeard(t, k, heard) {
    const sh = chordOct(t);
    const stored = cleanChord(heard.map((p) => p - sh));
    customChordSet(t, k, stored);
    return stored.length;
}

/* The chord row's octave, one step (dir = +1 / -1). Returns the new value. */
export function customChordOctaveStep(t, dir) {
    const v = Math.max(-OCT_LIMIT, Math.min(OCT_LIMIT, (S.customChordOctave[t] | 0) + (dir > 0 ? 1 : -1)));
    if (v !== (S.customChordOctave[t] | 0)) { S.customChordOctave[t] = v; S.chordDirty = true; }
    S.screenDirty = true;
    return v;
}

/* ---- LEDs ------------------------------------------------------------- */

/* The colour for pad i, or null to let the caller's scale colouring stand.
 * `heard` is the pitch a scale pad sounds (-1 when silent); `c` =
 * { White, Off, chord }. */
export function customPadColor(t, i, heard, c) {
    if (i < 8) {
        const h = heldChordOf(i);
        if (h && h.custom && h.t === t) return c.White;
        /* The chord waiting to be pasted, while Copy is held. */
        const src = S.copySrc;
        if (S.copyHeld && src && (src.kind === 'custom_chord' || src.kind === 'cut_custom_chord') &&
                src.track === t && src.slot === i) return c.White;
        /* A colour of their own: the note pads use the track's for the root. */
        const ps = customChordPitches(t, i);
        return ps.length ? c.chord : c.Off;
    }
    /* While a chord is held, its notes show on the scale rows — as a held
     * step's do. */
    const k = customEditTarget(t);
    if (k >= 0 && heard >= 0 && customChordPitches(t, k).indexOf(heard) >= 0) return c.White;
    return null;
}

/* ---- saved state ------------------------------------------------------ */

function cleanChord(a) {
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const v of a) {
        if (typeof v !== 'number' || v !== Math.floor(v) || v < 0 || v > 127) continue;
        if (out.indexOf(v) < 0) out.push(v);
    }
    out.sort((x, y) => x - y);
    return out.slice(0, CUSTOM_CHORD_MAX);
}

/* The sidecar's fields: `pcus` (which tracks are on the layout), `cch` (per
 * track, null or eight note lists) and `cco` (the chord row's octave). */
export function customSidecar() {
    return {
        pcus: S.padLayoutCustom.map((b) => (b ? 1 : 0)),
        cch: S.customChords.map((c) => (Array.isArray(c) ? c.map((n) => n.slice()) : null)),
        cco: S.customChordOctave.map((v) => v | 0),
    };
}

/* Every field is assigned, present or not: nothing of the project open
 * before survives. */
export function restoreCustomSidecar(us) {
    const u = us || {};
    for (let t = 0; t < 8; t++) {
        S.padLayoutCustom[t] = Array.isArray(u.pcus) ? !!u.pcus[t] : false;
        const e = Array.isArray(u.cch) ? u.cch[t] : null;
        S.customChords[t] = Array.isArray(e)
            ? Array.from({ length: CUSTOM_SLOTS }, (_, k) => cleanChord(e[k])) : null;
        const o = Array.isArray(u.cco) ? u.cco[t] : 0;
        S.customChordOctave[t] = (typeof o === 'number' && o === Math.floor(o) && o >= -OCT_LIMIT && o <= OCT_LIMIT) ? o : 0;
        S.customOctRegion[t] = 0;
    }
}
