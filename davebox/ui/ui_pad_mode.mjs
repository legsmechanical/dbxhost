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

/* ---- the bank ------------------------------------------------------------ */

const BLANK = { kind: 'blank', label: '' };

function modeCell(t) {
    const m = padModeOf(t);
    const opts = padModesFor(t).map((v) => PAD_MODE_NAMES[v]);
    return { kind: 'enumsq', label: 'Mode', name: 'Pad Mode', text: PAD_MODE_NAMES[m],
             options: opts, sel: Math.max(0, padModesFor(t).indexOf(m)) };
}

/* The eight cells of the bank's own page (nothing held). */
export function padModeBankCells(t) {
    const m = padModeOf(t);
    const rest = m === PM_CHORD ? chordBankCells(t) : [];
    const cells = [modeCell(t)].concat(rest);
    while (cells.length < 8) cells.push(BLANK);
    return cells.slice(0, 8);
}

/* Is knob `knob` (0-7) on this bank a toggle-like pick that wants the
 * deliberate divisor? */
export function padModeKnobDeliberate(t, knob) {
    if (knob === 0) return true;
    if (padModeOf(t) === PM_CHORD) return knob === 7;    /* Slots */
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
    if (padModeOf(t) === PM_CHORD) return chordBankKnob(t, knob - 1, steps);
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
