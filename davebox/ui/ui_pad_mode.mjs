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
import { chordLayoutOn, setChordLayout, chordEditSlot, chordSlotCells,
    chordBankCells, chordBankKnob } from './ui_chord_pads.mjs';
import { setCustomLayout } from './ui_custom_chords.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';

function pos(v, lo, hi) { return hi > lo ? ((v | 0) - lo) / (hi - lo) : 0; }
const signed = (v) => (v > 0 ? '+' + v : String(v | 0));
const BLANK = { kind: 'blank', label: '' };

export const PM_SCALE = 0, PM_CHROM = 1, PM_PIANO = 2, PM_CHORD = 3, PM_CUSTOM = 4;
export const PAD_MODE_NAMES = ['Scale', 'Chrom', 'Piano', 'Chord', 'Custom'];

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

/* Scale and Chrom share the split and each half's octave (Josh, 2026-10-22:
 * shared); each keeps its own start, since Scale counts it in scale steps
 * (it stays in key) and Chrom in semitones. Half A is the left (Vertical) or
 * top (Horizontal) half; with no split, A is the whole grid. */
export const SPLIT_NONE = 0, SPLIT_VERT = 1, SPLIT_HORZ = 2;
export const SPLIT_NAMES = ['None', 'Vert', 'Horz'];
export const ZONE_OCT_MIN = -4, ZONE_OCT_MAX = 4;
export const SEMI_MIN = -12, SEMI_MAX = 12;       /* Chrom, semitones */
export const STEP_MIN = -7, STEP_MAX = 7;         /* Scale, scale steps */

/* Piano: the Instrument, the top and bottom halves' shifts, and the Bass
 * neck's own (Josh, 2026-10-22: Bass takes one Oct / Semi). */
export const INSTR_PIANO = 0, INSTR_BASS = 1;
export const INSTR_NAMES = ['Piano', 'Bass'];

export function defaultPadModeCfg() {
    return { grid: { split: SPLIT_NONE, octA: 0, octB: 0, stepA: 0, stepB: 0, semiA: 0, semiB: 0 },
             piano: { instr: INSTR_PIANO, octT: 0, semiT: 0, octB: 0, semiB: 0, bassOct: 0, bassSemi: 0 } };
}

export function padModeCfg(t) {
    if (!S.padModeCfg[t]) S.padModeCfg[t] = defaultPadModeCfg();
    return S.padModeCfg[t];
}

const SEMI_PAIR = (label, name, oct, semi) => [
    { kind: 'valsq', label: 'Oct' + label, name: 'Octave' + name, text: signed(oct), ringNorm: pos(oct, ZONE_OCT_MIN, ZONE_OCT_MAX) },
    { kind: 'valsq', label: 'Semi' + label, name: 'Semitone' + name, text: signed(semi), ringNorm: pos(semi, SEMI_MIN, SEMI_MAX) },
];

/* Piano: Instrument, then Oct / Semi for the top and the bottom halves — or,
 * for Bass, one Oct / Semi for the whole neck. */
function pianoCells(t) {
    const p = padModeCfg(t).piano;
    const head = [{ kind: 'enumsq', label: 'Instr', name: 'Instrument', text: INSTR_NAMES[p.instr],
                    options: INSTR_NAMES, sel: p.instr }];
    if (p.instr === INSTR_BASS) return head.concat(SEMI_PAIR('', '', p.bassOct, p.bassSemi), [BLANK, BLANK]);
    return head.concat(SEMI_PAIR('T', ' Top', p.octT, p.semiT), SEMI_PAIR('B', ' Bottom', p.octB, p.semiB));
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
        case 1: o(bass ? 'bassOct' : 'octT'); break;
        case 2: st(bass ? 'bassSemi' : 'semiT'); break;
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
    if (split === SPLIT_HORZ) return [{ c0: 0, r0: 2, w: 8, h: 2 }, { c0: 0, r0: 0, w: 8, h: 2 }];
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
            octT: n(p.octT, ZONE_OCT_MIN, ZONE_OCT_MAX), semiT: n(p.semiT, SEMI_MIN, SEMI_MAX),
            octB: n(p.octB, ZONE_OCT_MIN, ZONE_OCT_MAX), semiB: n(p.semiB, SEMI_MIN, SEMI_MAX),
            bassOct: n(p.bassOct, ZONE_OCT_MIN, ZONE_OCT_MAX), bassSemi: n(p.bassSemi, SEMI_MIN, SEMI_MAX) };
        S.padModeCfg[t] = c;
    }
}

/* ---- the bank ------------------------------------------------------------ */

function modeCell(t) {
    const m = padModeOf(t);
    const opts = padModesFor(t).map((v) => PAD_MODE_NAMES[v]);
    return { kind: 'enumsq', label: 'Mode', name: 'Pad Mode', text: PAD_MODE_NAMES[m],
             options: opts, sel: Math.max(0, padModesFor(t).indexOf(m)) };
}


/* Scale / Chrom: Split, then each half's octave and start. With no split the
 * first pair is the whole grid's and the second is empty. */
function gridCells(t) {
    const g = padModeCfg(t).grid;
    const chrom = padModeOf(t) === PM_CHROM;
    const split = g.split !== SPLIT_NONE;
    const sk = chrom ? 'semi' : 'step', lo = chrom ? SEMI_MIN : STEP_MIN, hi = chrom ? SEMI_MAX : STEP_MAX;
    const sl = chrom ? 'Semi' : 'Step';
    const half = (z) => [
        { kind: 'valsq', label: 'Oct' + (split ? z : ''), name: 'Octave' + (split ? ' ' + z : ''),
          text: signed(g['oct' + z]), ringNorm: pos(g['oct' + z], ZONE_OCT_MIN, ZONE_OCT_MAX) },
        { kind: 'valsq', label: sl + (split ? z : ''), name: (chrom ? 'Semitone' : 'Scale Step') + (split ? ' ' + z : ''),
          text: signed(g[sk + z]), ringNorm: pos(g[sk + z], lo, hi) },
    ];
    return [{ kind: 'enumsq', label: 'Split', name: 'Split', text: SPLIT_NAMES[g.split],
              options: SPLIT_NAMES, sel: g.split }]
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
        : m === PM_PIANO ? pianoCells(t) : [];
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
    if (m === PM_SCALE || m === PM_CHROM || m === PM_PIANO) return knob === 1;   /* Split, Instrument */
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
    return false;
}

/* The knob rings ride the cells on screen: the held slot's card, or the
 * bank's own page. */
registerRingCells(BANK_PADMODE, () => {
    const t = S.activeTrack;
    if ((S.trackPadMode[t] | 0) !== PAD_MODE_MELODIC_SCALE) return null;
    const k = chordLayoutOn(t) ? chordEditSlot() : -1;
    return k >= 0 ? chordSlotCells(t, k).cells : padModeBankCells(t);
});
