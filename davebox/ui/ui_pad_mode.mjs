/* ui_pad_mode.mjs — the PADMODE bank: a melodic track's pad mode and its
 * settings, per track.
 *
 * Josh, 2026-10-22: "Change "chord" bank to "PadMode" bank and make it
 * available for every track type in melodic mode. The idea is to allow
 * per-track pad mode settings." K1 is always Mode; the other knobs are the
 * mode's own. Each mode keeps its settings while another is chosen.
 *
 * ⭑ setPadMode is the ONE writer of a track's mode: the bank's K1 and
 * Shift + Step 8 both go through it. The mode itself is still stored as the
 * four layout flags (padLayoutChromatic / Piano / Chord / Custom), which the
 * sidecar has saved since they were added; this file keeps them exclusive.
 */

import { S } from './ui_state.mjs';
import { PAD_MODE_MELODIC_SCALE, PAD_MODE_CONDUCT, BANK_PADMODE } from './ui_constants.mjs';
import { registerRingCells } from './ui_knob_leds.mjs';
import { triggerFire, triggerPhase } from './ui_trigger.mjs';
import { chordLayoutOn, setChordLayout, chordEditSlot, chordSlotCells,
    chordBankCells, chordBankKnob, resetChordBank } from './ui_chord_pads.mjs';
import { setCustomLayout, customLayoutOn, customHeldPad, customChordGet, customChordSet,
    customChordPitches, OCT_LIMIT, CUSTOM_CHORD_MAX } from './ui_custom_chords.mjs';
import { chordLabel, keyUsesFlats } from './ui_chord.mjs';
import { markJsUndo } from './ui_state.mjs';
import { DEFAULT_TRACK_OCTAVE } from './ui_constants.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';

function pos(v, lo, hi) { return hi > lo ? ((v | 0) - lo) / (hi - lo) : 0; }
const signed = (v) => (v > 0 ? '+' + v : String(v | 0));
const BLANK = { kind: 'blank', label: '' };

export const PM_SCALE = 0, PM_CHROM = 1, PM_PIANO = 2, PM_CHORD = 3, PM_CUSTOM = 4;
export const PAD_MODE_NAMES = ['Scale', 'Chrom', 'Piano', 'Chord', 'Custom'];
/* What the value box shows: it fits 24 px on one line, and CHROM (25 px) and
 * CUSTOM wrapped into "CHR / OM", "CUS / TOM" on the device. The option list
 * keeps the full names. */
const PAD_MODE_SQ = ['Scale', 'Chrm', 'Piano', 'Chord', 'Cust'];
const PAD_MODE_FULL = ['Scale', 'Chromatic', 'Piano', 'Chord', 'Custom'];

/* What track t's pads are in now. A Conductor has Scale and Chrom only. */
export function padModeOf(t) {
    const melodic = (S.trackPadMode[t] | 0) === PAD_MODE_MELODIC_SCALE;
    if (melodic && S.padLayoutCustom[t]) return PM_CUSTOM;
    if (melodic && S.padLayoutChord[t]) return PM_CHORD;
    if (melodic && S.padLayoutPiano[t]) return PM_PIANO;
    return S.padLayoutChromatic[t] ? PM_CHROM : PM_SCALE;
}

/* The modes track t can be put in. */
export function padModesFor(t) {
    return (S.trackPadMode[t] | 0) === PAD_MODE_CONDUCT ? [PM_SCALE, PM_CHROM]
        : [PM_SCALE, PM_CHROM, PM_PIANO, PM_CHORD, PM_CUSTOM];
}


/* Put track t's pads in mode m. Landing on Chord raises its explainer and
 * lands on this bank (setChordLayout). Returns true when the mode changed. */
export function setPadMode(t, m) {
    if (padModesFor(t).indexOf(m) < 0) m = PM_SCALE;
    if (padModeOf(t) === m) return false;
    setCustomLayout(t, m === PM_CUSTOM);
    setChordLayout(t, m === PM_CHORD);
    S.padLayoutChromatic[t] = m === PM_CHROM;
    S.padLayoutPiano[t] = m === PM_PIANO;
    S.chordDirty = true;      /* the layout flags ride the same sidecar save */
    computePadNoteMap();
    S.screenDirty = true;
    return true;
}

/* ---- per-mode settings ----------------------------------------------------- */

/* Scale and Chrom share the split and each zone's octave (Josh, 2026-10-22:
 * shared); each keeps its own Transpose, since Scale counts it in scale steps
 * (it stays in key) and Chrom in semitones. Zone A is the left (Vertical) or
 * bottom (Horizontal) half, B the right or top (Josh: "A is always
 * bottom/left. B is top/right"); with no split, A is the whole grid. */
export const SPLIT_NONE = 0, SPLIT_VERT = 1, SPLIT_HORZ = 2;
export const SPLIT_NAMES = ['None', 'Vert', 'Horz'];
/* The option list has room for whole words (Josh, 2026-10-22: "pickers can
 * use the full value name"); the value box keeps the short ones. */
const SPLIT_FULL = ['None', 'Vertical', 'Horizontal'];
export const ZONE_OCT_MIN = -4, ZONE_OCT_MAX = 4;
export const SEMI_MIN = -12, SEMI_MAX = 12;       /* Chrom, semitones */
export const STEP_MIN = -7, STEP_MAX = 7;         /* Scale, scale steps */

/* Piano: the Instrument, the top and bottom halves' shifts, and the Bass
 * neck's own (Josh, 2026-10-22: Bass takes one Oct / Semi). */
export const INSTR_PIANO = 0, INSTR_BASS = 1;
export const INSTR_NAMES = ['Piano', 'Bass'];

export function defaultPadModeCfg() {
    return { grid: { split: SPLIT_NONE, octA: 0, octB: 0, stepA: 0, stepB: 0, semiA: 0, semiB: 0 },
             piano: { instr: INSTR_PIANO, octA: 0, semiA: 0, octB: 0, semiB: 0, bassOct: 0, bassSemi: 0 },
             custom: { play: 0, scaleStep: 0, build: new Array(8).fill(null) } };
}

export function padModeCfg(t) {
    if (!S.padModeCfg[t]) S.padModeCfg[t] = defaultPadModeCfg();
    return S.padModeCfg[t];
}

/* A zone's two knobs (Josh, 2026-10-22: the zones are A and B everywhere — A
 * bottom / left, B top / right — and "Transpose" rather than Semi). `z` is
 * 'A' / 'B', or '' when there is one zone. */
const ZONE_PAIR = (z, oct, tr, trLo, trHi, trName) => [
    { kind: 'valsq', label: 'Oct' + (z ? ' ' + z : ''), name: 'Octave' + (z ? ' ' + z : ''),
      text: signed(oct), ringNorm: pos(oct, ZONE_OCT_MIN, ZONE_OCT_MAX) },
    { kind: 'valsq', label: 'Trans' + (z ? ' ' + z : ''), name: (trName || 'Transpose') + (z ? ' ' + z : ''),
      text: signed(tr), ringNorm: pos(tr, trLo, trHi) },
];

/* Piano: Instrument, then Oct / Transpose for zone A (the bottom octave) and
 * zone B (the top) — or, for Bass, one pair for the whole neck. */
function pianoCells(t) {
    const p = padModeCfg(t).piano;
    const head = [{ kind: 'enumsq', label: 'Instr', name: 'Instrument', text: INSTR_NAMES[p.instr],
                    options: INSTR_NAMES, sel: p.instr }];
    if (p.instr === INSTR_BASS) return head.concat(ZONE_PAIR('', p.bassOct, p.bassSemi, SEMI_MIN, SEMI_MAX), [BLANK, BLANK]);
    return head.concat(ZONE_PAIR('A', p.octA, p.semiA, SEMI_MIN, SEMI_MAX), ZONE_PAIR('B', p.octB, p.semiB, SEMI_MIN, SEMI_MAX));
}

function pianoKnob(t, cell, steps) {
    const p = padModeCfg(t).piano;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const before = JSON.stringify(p);
    const bass = p.instr === INSTR_BASS;
    const o = (k) => { p[k] = clamp(p[k] + steps, ZONE_OCT_MIN, ZONE_OCT_MAX); };
    const st = (k) => { p[k] = clamp(p[k] + steps, SEMI_MIN, SEMI_MAX); };
    switch (cell) {
        case 0: p.instr = clamp(p.instr + steps, 0, INSTR_NAMES.length - 1); break;
        case 1: o(bass ? 'bassOct' : 'octA'); break;
        case 2: st(bass ? 'bassSemi' : 'semiA'); break;
        case 3: if (bass) return false; o('octB'); break;
        case 4: if (bass) return false; st('semiB'); break;
        default: return false;
    }
    if (JSON.stringify(p) === before) return false;
    S.chordDirty = true;
    S.chordPadmapNow = true;
    S.screenDirty = true;
    return true;
}

/* The two halves of the 8x4 grid for a split: each is { c0, r0, w, h } in
 * pad columns / rows (row 0 = the bottom row), A first. No split: one half. */
export function gridZones(split) {
    if (split === SPLIT_VERT) return [{ c0: 0, r0: 0, w: 4, h: 4 }, { c0: 4, r0: 0, w: 4, h: 4 }];
    if (split === SPLIT_HORZ) return [{ c0: 0, r0: 0, w: 8, h: 2 }, { c0: 0, r0: 2, w: 8, h: 2 }];
    return [{ c0: 0, r0: 0, w: 8, h: 4 }];
}

/* Fill S.padNoteMap for the Scale / Chrom layouts, half by half. Each half is
 * its own grid from `root`: Scale rows climb three scale notes, Chrom rows
 * carry on from the end of the row below (so a 4-wide half climbs by 4). */
export function fillGridPadMap(t, root, intervals, chromatic) {
    /* A Conductor's pads are a transpose surface with no PADMODE bank: one
     * plain grid, whatever the track had while it was melodic. */
    const g = (S.trackPadMode[t] | 0) === PAD_MODE_CONDUCT ? defaultPadModeCfg().grid : padModeCfg(t).grid;
    const n = intervals.length;
    gridZones(g.split).forEach((z, zi) => {
        const oct = (zi ? g.octB : g.octA) | 0;
        const start = chromatic ? ((zi ? g.semiB : g.semiA) | 0) : ((zi ? g.stepB : g.stepA) | 0);
        for (let r = 0; r < z.h; r++) {
            for (let c = 0; c < z.w; c++) {
                const i = (z.r0 + r) * 8 + z.c0 + c;
                let p;
                if (chromatic) {
                    p = root + oct * 12 + start + c + r * z.w;
                } else {
                    const deg = c + r * 3 + start;
                    p = root + oct * 12 + Math.floor(deg / n) * 12 + intervals[((deg % n) + n) % n];
                }
                S.padNoteMap[i] = (p < 0 || p > 127) ? 0xFF : p;
            }
        }
    });
}

/* Is pad i in zone B of a split Scale / Chrom grid? Zone B's pads invert the
 * colours (Josh, 2026-10-22: "have A remain the same and B invert the color
 * scheme (so white is root and track color is other notes)"). */
export function padInZoneB(t, i) {
    if ((S.trackPadMode[t] | 0) !== PAD_MODE_MELODIC_SCALE) return false;
    const m = padModeOf(t);
    if (m !== PM_SCALE && m !== PM_CHROM) return false;
    const g = padModeCfg(t).grid;
    if (g.split === SPLIT_NONE) return false;
    const z = gridZones(g.split)[1], c = i % 8, r = Math.floor(i / 8);
    return c >= z.c0 && c < z.c0 + z.w && r >= z.r0 && r < z.r0 + z.h;
}

/* The sidecar's `pmd`: per track, null or the settings record. */
export function padModeSidecar() {
    return S.padModeCfg.map((c) => (c ? JSON.parse(JSON.stringify(c)) : null));
}

export function restorePadModeSidecar(pmd) {
    const n = (x, lo, hi) => (typeof x === 'number' && x >= lo && x <= hi) ? (x | 0) : 0;
    for (let t = 0; t < 8; t++) {
        const e = Array.isArray(pmd) ? pmd[t] : null;
        if (!e || typeof e !== 'object') { S.padModeCfg[t] = null; continue; }
        const c = defaultPadModeCfg(), g = e.grid || {};
        c.grid = { split: n(g.split, 0, 2),
            octA: n(g.octA, ZONE_OCT_MIN, ZONE_OCT_MAX), octB: n(g.octB, ZONE_OCT_MIN, ZONE_OCT_MAX),
            stepA: n(g.stepA, STEP_MIN, STEP_MAX), stepB: n(g.stepB, STEP_MIN, STEP_MAX),
            semiA: n(g.semiA, SEMI_MIN, SEMI_MAX), semiB: n(g.semiB, SEMI_MIN, SEMI_MAX) };
        const p = e.piano || {};
        c.piano = { instr: n(p.instr, 0, INSTR_NAMES.length - 1),
            octA: n(p.octA, ZONE_OCT_MIN, ZONE_OCT_MAX), semiA: n(p.semiA, SEMI_MIN, SEMI_MAX),
            octB: n(p.octB, ZONE_OCT_MIN, ZONE_OCT_MAX), semiB: n(p.semiB, SEMI_MIN, SEMI_MAX),
            bassOct: n(p.bassOct, ZONE_OCT_MIN, ZONE_OCT_MAX), bassSemi: n(p.bassSemi, SEMI_MIN, SEMI_MAX) };
        const u = e.custom || {};
        c.custom = { play: n(u.play, 0, 1), scaleStep: n(u.scaleStep, STEP_MIN, STEP_MAX),
            build: Array.from({ length: 8 }, (_, k) => cleanBuild(Array.isArray(u.build) ? u.build[k] : null)) };
        S.padModeCfg[t] = c;
    }
}

/* ---- Custom ------------------------------------------------------------------ */

/* Hold (Assign / Play), the chord row's octave, the pads' octave and
 * Transpose (in scale notes). The two octaves are the ones the Octave buttons
 * move (customChordOctave, trackOctave) — Octave both, Shift + Octave the pads
 * — shown here as views, so knobs and buttons agree. */
const HOLD_NAMES = ['Assign', 'Play'];
const HOLD_SQ = ['Asgn', 'Play'];      /* ASSIGN wrapped into "ASS / IGN" */
function customCells(t) {
    const u = padModeCfg(t).custom;
    const sco = (S.trackOctave[t] | 0) - DEFAULT_TRACK_OCTAVE, cho = S.customChordOctave[t] | 0;
    return [
        { kind: 'enumsq', label: 'Hold', name: 'Chord Hold', text: HOLD_NAMES[u.play ? 1 : 0], sq: HOLD_SQ[u.play ? 1 : 0], options: HOLD_NAMES, sel: u.play ? 1 : 0 },
        { kind: 'valsq', label: 'Chd Oct', name: 'Chord Octave', text: signed(cho), ringNorm: pos(cho, -OCT_LIMIT, OCT_LIMIT) },
        { kind: 'valsq', label: 'Pad Oct', name: 'Pad Octave', text: signed(sco), ringNorm: pos(sco, -4 - DEFAULT_TRACK_OCTAVE, 4 - DEFAULT_TRACK_OCTAVE) },
        { kind: 'valsq', label: 'Trans', name: 'Pad Transpose (scale)', text: signed(u.scaleStep), ringNorm: pos(u.scaleStep, STEP_MIN, STEP_MAX) },
    ];
}

function customKnob(t, cell, steps) {
    const u = padModeCfg(t).custom;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    switch (cell) {
        case 0: { const v = steps > 0 ? 1 : 0; if (v === (u.play | 0)) return false; u.play = v; break; }
        case 1: { const v = clamp((S.customChordOctave[t] | 0) + steps, -OCT_LIMIT, OCT_LIMIT);
                  if (v === (S.customChordOctave[t] | 0)) return false; S.customChordOctave[t] = v; break; }
        case 2: { const v = clamp((S.trackOctave[t] | 0) + steps, -4, 4); if (v === (S.trackOctave[t] | 0)) return false;
                  S.trackOctave[t] = v; break; }
        case 3: { const v = clamp((u.scaleStep | 0) + steps, STEP_MIN, STEP_MAX); if (v === (u.scaleStep | 0)) return false;
                  u.scaleStep = v; break; }
        default: return false;
    }
    S.chordDirty = true;
    S.chordPadmapNow = true;
    S.screenDirty = true;
    return true;
}

/* The assign card: hold a Custom chord pad on this bank and build the chord
 * by name, as the Chord layout's slot card does (Josh, 2026-10-22). A turn
 * REPLACES the pad's notes (his ruling: "Replace, undoable"); one Undo per
 * hold brings back what the pad held before. */
export const QUALS = [
    ['Maj', [0, 4, 7]], ['Min', [0, 3, 7]], ['Dim', [0, 3, 6]], ['Aug', [0, 4, 8]],
    ['Sus2', [0, 2, 7]], ['Sus4', [0, 5, 7]], ['7', [0, 4, 7, 10]], ['Maj7', [0, 4, 7, 11]],
    ['Min7', [0, 3, 7, 10]], ['m7b5', [0, 3, 6, 10]], ['Dim7', [0, 3, 6, 9]], ['6', [0, 4, 7, 9]],
    ['Min6', [0, 3, 7, 9]], ['Add9', [0, 4, 7, 14]], ['9', [0, 4, 7, 10, 14]], ['Maj9', [0, 4, 7, 11, 14]],
    ['Min9', [0, 3, 7, 10, 14]], ['7sus4', [0, 5, 7, 10]], ['5', [0, 7]],
];
const QUAL_FULL = ['Major', 'Minor', 'Diminished', 'Augmented', 'Sus2', 'Sus4', 'Dominant 7', 'Major 7',
    'Minor 7', 'Half-dim 7 (m7b5)', 'Diminished 7', 'Major 6', 'Minor 6', 'Add 9', 'Dominant 9', 'Major 9',
    'Minor 9', '7 Sus4', 'Power (5)'];
const SPREADS = ['Close', 'Open'];
const BASSES = ['Off', 'Root', '3rd', '5th'];
const NOTE_SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_FL = ['C', 'D\u266d', 'D', 'E\u266d', 'E', 'F', 'G\u266d', 'G', 'A\u266d', 'A', 'B\u266d', 'B'];
const CARD_OCT = 3;

function cleanBuild(b) {
    if (!b || typeof b !== 'object' || !b.rec || !Array.isArray(b.notes)) return null;
    const r = b.rec, n = (x, lo, hi) => (typeof x === 'number' && x >= lo && x <= hi) ? (x | 0) : 0;
    return { rec: { root: n(r.root, 0, 11), qual: n(r.qual, 0, QUALS.length - 1), inv: n(r.inv, -4, 4),
                    spread: n(r.spread, 0, 1), bass: n(r.bass, 0, 3), oct: n(r.oct, -CARD_OCT, CARD_OCT) },
             notes: b.notes.filter((x) => typeof x === 'number').map((x) => x | 0) };
}

/* Where a card chord's root sits at Oct 0: the scale rows' register at the
 * default octave, so a built chord lands among the notes it is played with. */
function cardBase(t) { return ((S.padOctave[t] | 0) + DEFAULT_TRACK_OCTAVE) * 12; }

/* The notes (as stored) a card record spells. */
export function buildCardChord(t, rec) {
    const iv = QUALS[rec.qual][1];
    const base = cardBase(t) + rec.root + rec.oct * 12;
    let ns = iv.map((i) => base + i).sort((a, b) => a - b);
    const size = ns.length;
    const inv = Math.max(-(size - 1), Math.min(size - 1, rec.inv | 0));
    for (let i = 0; i < inv; i++) { ns[0] += 12; ns.sort((a, b) => a - b); }
    for (let i = 0; i > inv; i--) { ns[ns.length - 1] -= 12; ns.sort((a, b) => a - b); }
    if (rec.spread && ns.length >= 3) { ns[1] += 12; ns.sort((a, b) => a - b); }
    if (rec.bass) {
        /* Root, 3rd or 5th of the chord (its 1st, 2nd or 3rd tone), below it. */
        const tone = iv[Math.min(rec.bass - 1, iv.length - 1)];
        let b = base + (tone % 12);
        while (b >= ns[0]) b -= 12;
        ns.unshift(b);
    }
    ns = ns.filter((p, i, a) => p >= 0 && p <= 127 && a.indexOf(p) === i);
    return ns.slice(0, CUSTOM_CHORD_MAX);
}

/* The card record for chord k: the one it was built with, while its notes
 * are still those; otherwise the chord its notes spell (his ruling: the card
 * starts from the chord it recognises); an empty pad starts on the key. */
function cardRecordFor(t, k) {
    const u = padModeCfg(t).custom;
    const notes = customChordGet(t, k);
    const b = u.build[k];
    if (b && JSON.stringify(b.notes) === JSON.stringify(notes)) return Object.assign({}, b.rec);
    const rec = { root: (S.padKey | 0) % 12, qual: 0, inv: 0, spread: 0, bass: 0, oct: 0 };
    if (!notes.length) return rec;
    const pcs = [...new Set(notes.map((p) => p % 12))];
    const bassPc = notes[0] % 12;
    for (const r of [bassPc].concat(pcs.filter((p) => p !== bassPc))) {
        const key = pcs.map((pc) => (pc - r + 12) % 12).sort((a, b) => a - b).join(',');
        const q = QUALS.findIndex(([, iv]) => [...new Set(iv.map((i) => i % 12))].sort((a, b) => a - b).join(',') === key);
        if (q < 0) continue;
        rec.root = r; rec.qual = q;
        const ivs = QUALS[q][1].map((i) => i % 12);
        rec.inv = Math.max(0, ivs.indexOf((bassPc - r + 12) % 12));
        break;
    }
    if (rec.qual === 0 && pcs.length && !QUALS[0][1].every((i) => pcs.indexOf((rec.root + i) % 12) >= 0)) rec.root = bassPc;
    /* The octave that puts the rebuilt chord's lowest note nearest the old one. */
    rec.oct = 0;
    const low = buildCardChord(t, rec)[0];
    rec.oct = Math.max(-CARD_OCT, Math.min(CARD_OCT, Math.round((notes[0] - low) / 12)));
    return rec;
}

/* The pad the card is for: a held Custom chord pad, on this bank. */
export function customCardSlot() {
    const t = S.activeTrack;
    if (S.activeBank !== BANK_PADMODE || !customLayoutOn(t)) return -1;
    return customHeldPad(t);
}

let _card = null;            /* { t, k, was, rec } — the hold being edited */
function cardSession(t, k) {
    if (!_card || _card.t !== t || _card.k !== k) _card = { t, k, was: customChordGet(t, k), rec: cardRecordFor(t, k) };
    return _card;
}
/* A different hold starts a fresh card (and a fresh Undo). */
export function customCardEnd() { _card = null; }

export function customCardCells(t, k) {
    const c = cardSession(t, k);
    const r = c.rec;
    const names = keyUsesFlats(S.padKey | 0, S.padScale | 0) ? NOTE_FL : NOTE_SH;
    const heard = customChordPitches(t, k);
    return {
        title: heard.length ? chordLabel(heard, keyUsesFlats(S.padKey | 0, S.padScale | 0), r.root) : 'EMPTY',
        cells: [
            { kind: 'valsq', label: 'Root', name: 'Root', text: names[r.root], ringNorm: pos(r.root, 0, 11) },
            { kind: 'enumsq', label: 'Stack', name: 'Stack', text: QUALS[r.qual][0], options: QUAL_FULL, sel: r.qual },
            BLANK,
            { kind: 'valsq', label: 'Inv', name: 'Inversion', text: signed(r.inv), ringNorm: pos(r.inv, -4, 4) },
            { kind: 'enumsq', label: 'Sprd', name: 'Spread', text: SPREADS[r.spread], options: SPREADS, sel: r.spread },
            { kind: 'enumsq', label: 'Bass', name: 'Bass', text: BASSES[r.bass], options: BASSES, sel: r.bass },
            { kind: 'valsq', label: 'Oct', name: 'Octave', text: signed(r.oct), ringNorm: pos(r.oct, -CARD_OCT, CARD_OCT) },
            /* Reset, as on the Chord card: touch K8 and click the jog. */
            { kind: 'action', oneWay: true, label: 'Reset', name: 'Reset chord', text: '->', ringBound: true, opens: true,
              btnPhase: triggerPhase('customReset', S.knobTouched === 7) },
        ],
    };
}

/* One knob step on the card. Writes the chord and books the Undo; returns
 * the stored notes before and after (the caller re-voices a sounding pad),
 * or null when nothing changed. */
export function customCardKnob(t, k, knob, steps) {
    const c = cardSession(t, k);
    const r = c.rec;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const before = JSON.stringify(r);
    switch (knob) {
        case 0: r.root = ((r.root + steps) % 12 + 12) % 12; break;
        case 1: r.qual = clamp(r.qual + steps, 0, QUALS.length - 1); break;
        case 3: r.inv = clamp(r.inv + steps, -4, 4); break;
        case 4: r.spread = clamp(r.spread + steps, 0, 1); break;
        case 5: r.bass = clamp(r.bass + steps, 0, 3); break;
        case 6: r.oct = clamp(r.oct + steps, -CARD_OCT, CARD_OCT); break;
        default: return null;
    }
    const prev = customChordGet(t, k);
    if (JSON.stringify(r) === before && prev.length) return null;
    const notes = buildCardChord(t, r);
    customChordSet(t, k, notes);
    padModeCfg(t).custom.build[k] = { rec: Object.assign({}, r), notes: customChordGet(t, k) };
    const was = c.was, now = customChordGet(t, k);
    markJsUndo('chord', function () { customChordSet(t, k, was); }, function () { customChordSet(t, k, now); });
    S.chordDirty = true;
    return { prev, now };
}

/* K8 on the card: the pad goes back to empty (a Custom chord has no other
 * default). One Undo with the rest of the hold brings it back. */
export function customCardReset(t, k) {
    const c = cardSession(t, k);
    customChordSet(t, k, []);
    padModeCfg(t).custom.build[k] = null;
    c.rec = cardRecordFor(t, k);
    const was = c.was;
    markJsUndo('chord', function () { customChordSet(t, k, was); }, function () { customChordSet(t, k, []); });
    triggerFire('customReset');
    S.chordDirty = true;
    S.screenDirty = true;
}

/* ---- Shift + Octave ---------------------------------------------------------
 * Josh, 2026-10-22: "a shift+octave up/down gesture that transposes just the
 * B split or the non-chord pads in chord and custom chord. that way you can
 * change octaves in different zones with a single gesture." Plain Octave
 * moves the whole surface. Returns the notice [title, value] when the press
 * was taken, or null where there is no zone B (no split, Bass, a drum or a
 * Conductor track) — the caller then moves the whole surface. */
export function shiftOctaveZoneB(t, dir) {
    if ((S.trackPadMode[t] | 0) !== PAD_MODE_MELODIC_SCALE) return null;
    const m = padModeOf(t), d = dir > 0 ? 1 : -1;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let label, v;
    if (m === PM_SCALE || m === PM_CHROM) {
        const g = padModeCfg(t).grid;
        if (g.split === SPLIT_NONE) return null;
        g.octB = clamp(g.octB + d, ZONE_OCT_MIN, ZONE_OCT_MAX); v = g.octB; label = 'OCTAVE B';
    } else if (m === PM_PIANO) {
        const p = padModeCfg(t).piano;
        if (p.instr === INSTR_BASS) return null;
        p.octB = clamp(p.octB + d, ZONE_OCT_MIN, ZONE_OCT_MAX); v = p.octB; label = 'OCTAVE B';
    } else if (m === PM_CHORD) {
        chordBankKnob(t, 5, d);                       /* Pad Oct (the strum + scale rows) */
        v = S.chordSettings[t].strum | 0; label = 'PAD OCTAVE';
    } else {
        S.trackOctave[t] = clamp((S.trackOctave[t] | 0) + d, -4, 4);    /* Custom: the pads */
        v = (S.trackOctave[t] | 0) - DEFAULT_TRACK_OCTAVE; label = 'PAD OCTAVE';
    }
    S.chordDirty = true;
    S.screenDirty = true;
    return [label, signed(v)];
}

/* ---- the bank ------------------------------------------------------------ */

function modeCell(t) {
    const m = padModeOf(t);
    const opts = padModesFor(t).map((v) => PAD_MODE_FULL[v]);
    return { kind: 'enumsq', label: 'Mode', name: 'Pad Mode', text: PAD_MODE_NAMES[m], sq: PAD_MODE_SQ[m],
             options: opts, sel: Math.max(0, padModesFor(t).indexOf(m)) };
}


/* Scale / Chrom: Split, then each half's octave and start. With no split the
 * first pair is the whole grid's and the second is empty. */
function gridCells(t) {
    const g = padModeCfg(t).grid;
    const chrom = padModeOf(t) === PM_CHROM;
    const split = g.split !== SPLIT_NONE;
    const sk = chrom ? 'semi' : 'step', lo = chrom ? SEMI_MIN : STEP_MIN, hi = chrom ? SEMI_MAX : STEP_MAX;
    /* Scale's Transpose counts scale notes; the header says so. */
    const half = (z) => ZONE_PAIR(split ? z : '', g['oct' + z], g[sk + z], lo, hi, chrom ? 'Transpose' : 'Transpose (scale)');
    return [{ kind: 'enumsq', label: 'Split', name: 'Split', text: SPLIT_NAMES[g.split],
              options: SPLIT_FULL, sel: g.split }]
        .concat(half('A'), split ? half('B') : [BLANK, BLANK]);
}

function gridKnob(t, cell, steps) {
    const g = padModeCfg(t).grid;
    const chrom = padModeOf(t) === PM_CHROM;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const before = JSON.stringify(g);
    const sk = chrom ? 'semi' : 'step', lo = chrom ? SEMI_MIN : STEP_MIN, hi = chrom ? SEMI_MAX : STEP_MAX;
    switch (cell) {
        case 0: g.split = clamp(g.split + steps, 0, SPLIT_NAMES.length - 1); break;
        case 1: g.octA = clamp(g.octA + steps, ZONE_OCT_MIN, ZONE_OCT_MAX); break;
        case 2: g[sk + 'A'] = clamp(g[sk + 'A'] + steps, lo, hi); break;
        case 3: if (g.split === SPLIT_NONE) return false;
                g.octB = clamp(g.octB + steps, ZONE_OCT_MIN, ZONE_OCT_MAX); break;
        case 4: if (g.split === SPLIT_NONE) return false;
                g[sk + 'B'] = clamp(g[sk + 'B'] + steps, lo, hi); break;
        default: return false;
    }
    if (JSON.stringify(g) === before) return false;
    S.chordDirty = true;
    S.chordPadmapNow = true;
    S.screenDirty = true;
    return true;
}

/* The eight cells of the bank's own page (nothing held). */
export function padModeBankCells(t) {
    const m = padModeOf(t);
    const rest = m === PM_CHORD ? chordBankCells(t)
        : (m === PM_SCALE || m === PM_CHROM) ? gridCells(t)
        : m === PM_PIANO ? pianoCells(t)
        : m === PM_CUSTOM ? customCells(t) : [];
    const cells = [modeCell(t)].concat(rest);
    while (cells.length < 8) cells.push(BLANK);
    return cells.slice(0, 8);
}

/* Is knob `knob` (0-7) on this bank a toggle-like pick that wants the
 * deliberate divisor? */
export function padModeKnobDeliberate(t, knob) {
    if (knob === 0) return true;
    const m = padModeOf(t);
    if (m === PM_CHORD) return knob === 7;               /* Slots */
    if (m === PM_SCALE || m === PM_CHROM || m === PM_PIANO || m === PM_CUSTOM) return knob === 1;   /* Split, Instrument, Hold */
    return false;
}

/* One knob step on the bank's own page. Returns true when something changed. */
export function padModeBankKnob(t, knob, steps) {
    if (knob === 0) {
        const list = padModesFor(t);
        const i = Math.max(0, list.indexOf(padModeOf(t)));
        const j = Math.max(0, Math.min(list.length - 1, i + (steps > 0 ? 1 : -1)));
        return setPadMode(t, list[j]);
    }
    const m = padModeOf(t);
    if (m === PM_CHORD) return chordBankKnob(t, knob - 1, steps);
    if (m === PM_SCALE || m === PM_CHROM) return gridKnob(t, knob - 1, steps);
    if (m === PM_PIANO) return pianoKnob(t, knob - 1, steps);
    if (m === PM_CUSTOM) return customKnob(t, knob - 1, steps);
    return false;
}

/* Delete + jog click on the bank (Josh, 2026-10-23: "it should reset the
 * current banks params"): the current mode's settings back to their
 * defaults. Mode and Piano's Instrument stay — they pick the layout, as the
 * Conductor's ON/OFF does — and Custom's chords stay (Delete + pad clears one).
 * One Undo brings every value back. Returns the popup's name. */
export function resetPadModeBank(t) {
    const snap = () => ({
        cfg: JSON.stringify(padModeCfg(t)),
        chord: JSON.stringify(S.chordSettings[t] || null),
        pal: JSON.stringify(S.chordPalette[t] || null),
        last: JSON.stringify(S.chordLast[t] || null),
        cho: S.customChordOctave[t] | 0,
        oct: S.trackOctave[t] | 0,
    });
    const apply = (v) => {
        S.padModeCfg[t] = JSON.parse(v.cfg);
        const ch = JSON.parse(v.chord), pal = JSON.parse(v.pal), last = JSON.parse(v.last);
        S.chordSettings[t] = ch || undefined;
        S.chordPalette[t] = pal || undefined;
        S.chordLast[t] = last || undefined;
        S.customChordOctave[t] = v.cho;
        S.trackOctave[t] = v.oct;
        S.chordDirty = true;
        S.chordPadmapNow = true;
        S.screenDirty = true;
    };
    const was = snap();
    const m = padModeOf(t), c = padModeCfg(t);
    if (m === PM_SCALE || m === PM_CHROM) {
        /* The split and both octaves are shared by the two; the Transpose is
         * this mode's own (the other keeps its). */
        const g = c.grid, sk = m === PM_CHROM ? 'semi' : 'step';
        g.split = SPLIT_NONE; g.octA = 0; g.octB = 0; g[sk + 'A'] = 0; g[sk + 'B'] = 0;
    } else if (m === PM_PIANO) {
        const p = c.piano;
        p.octA = 0; p.semiA = 0; p.octB = 0; p.semiB = 0; p.bassOct = 0; p.bassSemi = 0;
    } else if (m === PM_CHORD) {
        resetChordBank(t);
    } else if (m === PM_CUSTOM) {
        c.custom.play = 0; c.custom.scaleStep = 0;
        S.customChordOctave[t] = 0;
        S.trackOctave[t] = DEFAULT_TRACK_OCTAVE;
    }
    const now = snap();
    if (JSON.stringify(now) !== JSON.stringify(was)) {
        apply(now);
        markJsUndo('padmode', function () { apply(was); }, function () { apply(now); });
    }
    return 'PAD MODE';
}

/* The knob rings ride the cells on screen: the held slot's card, or the
 * bank's own page. */
registerRingCells(BANK_PADMODE, () => {
    const t = S.activeTrack;
    if ((S.trackPadMode[t] | 0) !== PAD_MODE_MELODIC_SCALE) return null;
    const k = chordLayoutOn(t) ? chordEditSlot() : -1;
    if (k >= 0) return chordSlotCells(t, k).cells;
    const ck = customCardSlot();
    return ck >= 0 ? customCardCells(t, ck).cells : padModeBankCells(t);
});
