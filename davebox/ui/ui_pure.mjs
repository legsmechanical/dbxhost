/* ui_pure.mjs
 * Pure(-read) helpers extracted from ui.js (Phase 1 of the modularity refactor).
 *
 * PURITY CONTRACT (enforced by review + tests/js/test_pure.mjs):
 *   - These helpers may READ shared state `S` and module constants, but must
 *     NEVER write `S` (no `S.x = ...`, no mutation of S-owned arrays/sets) and
 *     NEVER call host APIs (`host_*`, `setLED`, `move_midi_*`, `shadow_*`).
 *   - Because they touch nothing host-side, the node-based tests/js harness can
 *     import this module directly (via ui_state.mjs, which imports only
 *     ui_constants.mjs).
 * Helpers that write S or call host APIs stay in ui.js until later phases.
 */

import { S } from './ui_state.mjs';
import { PAD_MODE_DRUM, PAD_MODE_CONDUCT, NUM_STEPS, BANKS,
    BANK_RESPONDER, BANK_OCTAVE, BANK_WHEN, BANK_SOUND, BANK_STEP, BANK_MACROS, BANK_AUTOMATION,
    BANK_CHORD, BANK_CONFIG, isSoundBank } from './ui_constants.mjs';

/* Live pad note input — isomorphic 4ths diatonic layout.
 * EXPORTED for ui.js's computePadNoteMap (impure, moves in Phase 5) — do not
 * un-export as an "unused externally" cleanup while that consumer remains. */
export const SCALE_INTERVALS = [
    [0, 2, 4, 5, 7, 9, 11],        /*  0 Major           */
    [0, 2, 3, 5, 7, 8, 10],        /*  1 Minor           */
    [0, 2, 3, 5, 7, 9, 10],        /*  2 Dorian          */
    [0, 1, 3, 5, 7, 8, 10],        /*  3 Phrygian        */
    [0, 2, 4, 6, 7, 9, 11],        /*  4 Lydian          */
    [0, 2, 4, 5, 7, 9, 10],        /*  5 Mixolydian      */
    [0, 1, 3, 5, 6, 8, 10],        /*  6 Locrian         */
    [0, 2, 3, 5, 7, 8, 11],        /*  7 Harmonic Minor  */
    [0, 2, 3, 5, 7, 9, 11],        /*  8 Melodic Minor   */
    [0, 2, 4, 7, 9],               /*  9 Pentatonic Major*/
    [0, 3, 5, 7, 10],              /* 10 Pentatonic Minor*/
    [0, 3, 5, 6, 7, 10],           /* 11 Blues           */
    [0, 2, 4, 6, 8, 10],           /* 12 Whole Tone      */
    [0, 2, 3, 5, 6, 8, 9, 11],     /* 13 Diminished      */
];

/* The drum and Conductor walks live in bankCategoriesForMode, like the
 * melodic one. (⚠ Bank 6, the old AUTO, left every walk 2026-09-03.) */

/* THE name of a bank on a given track — one source for the card header, the
 * bank picker, and anything else that shows a bank to the user.
 *
 * ⚠⚠ The aliases used to live inline in the render's drum branch, so nothing
 * else could see them: the picker listed CLIP and LIVE ARP for banks that the
 * header called DRUM LANE and REPEAT GROOVE. Josh, on device: "the picker names
 * don't match bank names for drum tracks."
 *
 * A drum track renames three banks — the same index means a different thing
 * there. A Conductor prefixes every bank with C- and calls bank 0 CONDUCT. A
 * MIDI track renames nothing: MIDI is a ROUTE, not a pad mode, so it reads as
 * melodic (verified, not assumed — no route-keyed naming exists).
 *
 * ⚠ STATIC: the blinking variants (the drum ALL/blank on ALL LANES, the
 * Conductor C- blink) are the HEADER's animation, applied on top. A list of
 * names must not blink. */
/* The Conductor's banks carry no "C-" prefix and three of them have their own
 * names (Josh, 2026-09-26: "get rid of conductor track "C-" append at front in
 * heading and overlay"; CLIP "rename conduct", ON/OFF "RENAME RESPONDER",
 * TIMING "RENAME WHEN"). */
const CONDUCT_NAMES = { 0: 'CLIP', [BANK_RESPONDER]: 'ON/OFF', [BANK_WHEN]: 'TIMING' };
export function bankDisplayName(padMode, bank) {
    const base = (BANKS[bank] && BANKS[bank].name) || '?';
    if (padMode === PAD_MODE_CONDUCT) return CONDUCT_NAMES[bank] || base;
    if (padMode === PAD_MODE_DRUM) {
        if (bank === 0) return 'DRUM LANE';
        if (bank === 5) return 'RPT GROOVE';
        if (bank === 7) return 'ALL LANES';
    }
    return base;
}

/* The banks a track can reach on the jog, in jog order — the SAME strip the
 * unshifted turn walks, so the bank picker (Shift+jog) is a VIEW of the
 * existing navigation rather than a second model of it. Every walk starts on
 * CONFIG; melodic and drum end on MIX, which a Conductor does not have.
 *
 * ⚠ Pure: takes the pad MODE, not a track index, so ui_render and ui_input_cc
 * can both call it without either importing the other. */
export function bankCycleForMode(padMode, t) {
    /* THE WALK: the track's banks minus the DOORS (below). */
    return bankListForMode(padMode, t).filter((b) => !bankIsDoor(padMode, b));
}

/* THE TRACK'S BANKS, in their full order — every bank this track has, the
 * doors included. The bank pad map, a pick's commit and a sound bank's
 * permission to open read this; only the jog's turn reads the walk. */
export function bankListForMode(padMode, t) {
    const out = [];
    for (const g of bankCategoriesForMode(padMode, t)) for (const b of g.banks) out.push(b);
    return out;
}

/* DOORS (Josh, 2026-10-03: "let's also hide config and automation from the
 * bank list. i think we may not need them with this new shortcut system.
 * same with live arp."): banks you reach by a shortcut or the bank pad map,
 * never by turning the jog. They stay on the map. LIVE ARP came back as an
 * ordinary bank on 2026-10-04 (Josh: "put the live arp back as a bank that
 * can stay on the knobs after the page closes like all the other banks"). */
const BANK_WALK_DOORS = {
    melodic: [BANK_CONFIG, BANK_AUTOMATION],
    drum:    [BANK_CONFIG, BANK_AUTOMATION],
    conduct: [BANK_CONFIG],
};
export function bankIsDoor(padMode, bank) {
    return BANK_WALK_DOORS[bankMapFamily(padMode)].indexOf(bank) >= 0;
}

/* The walk's categories, for the bank column: the doors left out of each
 * group, a group left empty dropped. Labels stay — a category that COULD
 * hold several banks keeps its label with one (Josh, 2026-09-26). */
export function bankWalkCategoriesForMode(padMode, t) {
    const out = [];
    for (const g of bankCategoriesForMode(padMode, t)) {
        const banks = g.banks.filter((b) => !bankIsDoor(padMode, b));
        if (banks.length) out.push(Object.assign({}, g, { banks }));
    }
    return out;
}

/* A sound bank (MIX, MACROS, CONFIG) this track HAS — so its screen may open.
 * (The track's list, not the walk: CONFIG is a door but its screen opens.) A
 * Conductor has CONFIG but neither MIX nor MACROS, and a stale record of
 * those must never open a screen it has no row for. */
export function soundBankOnTrack(padMode, bank, t) {
    return isSoundBank(bank) && bankListForMode(padMode, t).indexOf(bank) >= 0;
}

/* Every walk, in CATEGORIES (Josh, 2026-09-26): what comes in, what controls
 * it, the sequence, the note FX in signal order, then the mix. The bank
 * navigation overlay draws each category that CAN hold several banks as a
 * labelled group — IN keeps its label with only LIVE ARP (CHORD joins it on a
 * Chord-layout track), and the drum IN with only RPT GROOVE ("keep in
 * category even though there's only 1 bank"). A category of one (`label`
 * null) is a plain row. `depth` 1 nests the group under the row above it: the
 * drum FX apply to the selected DRUM LANE ("need to have this indented under
 * drum lane since they apply per-lane").
 * Bank 0 stays each track's start and Back bank (BANK_DEFAULT); only the walk
 * moved. */
export function bankCategoriesForMode(padMode, t) {
    if (padMode === PAD_MODE_CONDUCT) return [
        { label: null,   banks: [BANK_CONFIG] },
        { label: null,   banks: [0] },
        { label: null,   banks: [BANK_STEP] },
        { label: null,   banks: [1] },
        { label: 'RSPD', banks: [BANK_RESPONDER, BANK_OCTAVE, BANK_WHEN] },
    ];
    if (padMode === PAD_MODE_DRUM) return [
        { label: null,   banks: [BANK_CONFIG] },
        { label: 'IN',   banks: [5] },
        { label: 'CTRL', banks: [BANK_MACROS, BANK_AUTOMATION] },
        { label: 'SEQ',  banks: [BANK_STEP, 7, 0] },
        { label: 'FX',   banks: [1, 3], depth: 1 },
        { label: null,   banks: [BANK_SOUND] },
    ];
    const _t = t === undefined ? S.activeTrack : t;
    const chord = !!(S.padLayoutChord && S.padLayoutChord[_t]);
    return [
        { label: null,   banks: [BANK_CONFIG] },
        { label: 'IN',   banks: (chord ? [BANK_CHORD] : []).concat([5]) },
        { label: 'CTRL', banks: [BANK_MACROS, BANK_AUTOMATION] },
        { label: 'SEQ',  banks: [BANK_STEP, 0] },
        { label: 'FX',   banks: [1, 2, 3, 4] },
        { label: null,   banks: [BANK_SOUND] },
    ];
}

/* THE BANK PAD MAP (Josh, 2026-10-02): hold the jog and the LEFT 4x4 pads are
 * the track's banks — a column per category, banks top to bottom, one pad per
 * bank. "Rows corresponding to categories" became columns on the previews;
 * the right 4x4 is dark and dead while the map is up.
 *
 * ⭑ Membership comes from the WALK (bankCycleForMode), so a bank the track
 * does not have (CHORD outside the Chord layout) simply leaves its pad dark.
 * Only the POSITION is a table — fixed, so nothing shifts when a bank comes or
 * goes, and the same job sits on the same pad on every track type (DRUM LANE
 * where CLIP is, RPT GROOVE where LIVE ARP is). The Shift + top-row bank jump
 * was retired (2026-08-25) partly because its pad maps were kept in lockstep
 * with the walks BY HAND; test_bank_pad_map_table pins this one to the walk.
 * Positions are [column, row], row 0 = the TOP pad row. */
const BANK_MAP_POS = {
    melodic: { [BANK_CHORD]: [0, 0], 5: [0, 1], [BANK_CONFIG]: [0, 3],
               [BANK_MACROS]: [1, 0], [BANK_AUTOMATION]: [1, 1], [BANK_SOUND]: [1, 3],
               [BANK_STEP]: [2, 0], 0: [2, 1],
               1: [3, 0], 2: [3, 1], 3: [3, 2], 4: [3, 3] },
    drum:    { 5: [0, 1], [BANK_CONFIG]: [0, 3],
               [BANK_MACROS]: [1, 0], [BANK_AUTOMATION]: [1, 1], [BANK_SOUND]: [1, 3],
               [BANK_STEP]: [2, 0], 0: [2, 1], 7: [2, 2],
               1: [3, 0], 3: [3, 2] },
    conduct: { [BANK_CONFIG]: [0, 3],
               [BANK_RESPONDER]: [1, 0], [BANK_OCTAVE]: [1, 1], [BANK_WHEN]: [1, 2],
               0: [2, 0], [BANK_STEP]: [2, 1],
               1: [3, 0] },
};
const BANK_MAP_LABELS = {
    melodic: ['IN', 'CTRL', 'SEQ', 'FX'],
    drum:    ['IN', 'CTRL', 'SEQ', 'FX'],
    conduct: [null, 'RSPD', 'SEQ', 'FX'],
};
/* ACTION pads: not banks — a tap goes somewhere (Josh, 2026-10-04: "add an
 * "inst" pad to the right of the mix pad - also red. jumps directly to
 * track's instrument (just like shift+hold note/session)"). A Conductor has
 * no MIX and no instrument. */
const BANK_MAP_ACTIONS = {
    melodic: { inst: [2, 3] },
    drum:    { inst: [2, 3] },
    conduct: {},
};
const BANK_MAP_ACTION_NAMES = { inst: 'INST' };
/* AUTOMATION has no space to wrap at and is wider than a cell. */
const BANK_MAP_SHORT = { [BANK_AUTOMATION]: 'AUTO' };

function bankMapFamily(padMode) {
    return padMode === PAD_MODE_CONDUCT ? 'conduct' : padMode === PAD_MODE_DRUM ? 'drum' : 'melodic';
}

/* The map for one track: 4 columns of { label, cells: [{ bank, name } | null x4] };
 * an action pad is { bank: null, action, name }.
 * A walk bank with no position is left off (the table test makes that a failure). */
export function bankPadMapForMode(padMode, t) {
    const fam = bankMapFamily(padMode), pos = BANK_MAP_POS[fam];
    const cols = BANK_MAP_LABELS[fam].map((label) => ({ label, cells: [null, null, null, null] }));
    for (const b of bankListForMode(padMode, t)) {
        const p = pos[b];
        if (!p || cols[p[0]].cells[p[1]]) continue;
        cols[p[0]].cells[p[1]] = { bank: b, name: BANK_MAP_SHORT[b] || bankDisplayName(padMode, b) };
    }
    const acts = BANK_MAP_ACTIONS[fam];
    for (const a in acts) {
        const p = acts[a];
        if (!cols[p[0]].cells[p[1]]) cols[p[0]].cells[p[1]] = { bank: null, action: a, name: BANK_MAP_ACTION_NAMES[a] };
    }
    return cols;
}

/* The action under a map pad ('inst'), or null. */
export function bankPadMapActionAt(padMode, col, row) {
    const acts = BANK_MAP_ACTIONS[bankMapFamily(padMode)];
    for (const a in acts) if (acts[a][0] === col && acts[a][1] === row) return a;
    return null;
}

/* The bank under a map pad, or null (dark pad, right half). */
export function bankPadMapCellAt(padMode, t, col, row) {
    if (col < 0 || col > 3 || row < 0 || row > 3) return null;
    const c = bankPadMapForMode(padMode, t)[col].cells[row];
    return c ? c.bank : null;
}

/* Session View's map: the mixer modes down column 0 (SESS_KNOB_MODES indices
 * 0..3), and the effect buses in
 * column 1, each beside its level (Josh: "Send a and b [should be] aligned
 * with their counterparts on the mixer row"). Bus ids are FX_BUSES ids. */
export const SESS_PAD_MAP = {
    mixer: { label: 'MIXER', modes: [0, 1, 2, 3] },
    fx:    { label: 'FX', buses: ['master', null, 'sendA', 'sendB'],
             names: ['MASTER', null, 'SEND A', 'SEND B'] },
};

/* Pad note for a map cell: pads run bottom-to-top 68-75 / 76-83 / 84-91 /
 * 92-99, so the TOP row (row 0) is 92. */
export function bankMapPadForCell(col, row) { return 92 - row * 8 + col; }
/* The map's TRACK pads (Josh, 2026-10-08: "pad map track switch shortcuts [on]
 * the right 4x4 grid ... top row is [tracks] 1-4, next row is 5-8"): the track
 * a cell selects, or -1. The lower two rows of that grid stay dark. */
export function bankMapTrackForCell(col, row) {
    return (col >= 4 && col <= 7 && (row === 0 || row === 1)) ? row * 4 + (col - 4) : -1;
}
export function bankMapCellForPad(note) {
    const i = note - 68;
    if (i < 0 || i > 31) return null;
    return { col: i % 8, row: 3 - (i >> 3) };
}

/* Bank position in the jog-cycle order, for the header position strip. Melodic
 * banks cycle 0..6 linearly; drum banks cycle in BANK_CYCLE_DRUM order;
 * conductor banks cycle in CONDUCT_BANK_CYCLE order. Returns {idx, count} for
 * the active track's chain — mirrors the jog nav in _onCC_jog. */
export function bankCyclePos() {
    /* ONE source: the same walk the jog uses. idx = the bank's position in it,
     * count = its length (SOUND + CONFIG is a stop like any other, and its own
     * screen draws that segment active). A bank not on this track's walk
     * reads as position 0 — there is nothing truer to say. */
    const cyc = bankCycleForMode(S.trackPadMode[S.activeTrack]);
    const i = cyc.indexOf(S.activeBank);
    return { idx: i < 0 ? 0 : i, count: cyc.length };
}

/* Step-edit pitch nudge: move note up/down to next in-scale pitch.
 * When scale-aware is off, shifts by exactly 1 semitone per dir. */
export function scaleNudgeNote(note, dir, key, scale) {
    if (!S.scaleAware) return Math.max(0, Math.min(127, note + dir));
    const ivls = SCALE_INTERVALS[scale];
    let candidate = note + dir;
    while (candidate >= 0 && candidate <= 127) {
        const pc = ((candidate - key) % 12 + 12) % 12;
        if (ivls.indexOf(pc) >= 0) return candidate;
        candidate += dir;
    }
    return Math.max(0, Math.min(127, note + dir));
}

export function _clipIsEmpty(t, c) {
    return (S.trackPadMode[t] === PAD_MODE_DRUM)
        ? !S.drumClipNonEmpty[t][c]
        : !S.clipNonEmpty[t][c];
}

export function clipHasContent(t, c) {
    const s = S.clipSteps[t][c];
    for (let i = 0; i < NUM_STEPS; i++) if (s[i]) return true;
    return false;
}

/** Convert a padIdx (0-31) to drum lane index for the current lane page, or -1 if right half. */
export function drumPadToLane(padIdx) {
    const col = padIdx % 8;
    if (col >= 4) return -1;
    const row = Math.floor(padIdx / 8);
    return S.drumLanePage[S.activeTrack] * 16 + row * 4 + col;
}

/** Convert a padIdx (0-31) to velocity zone 0-15, or -1 if left half. */
export function drumPadToVelZone(padIdx) {
    const col = padIdx % 8;
    if (col < 4) return -1;
    const row = Math.floor(padIdx / 8);
    return row * 4 + (col - 4);
}

/** Map velocity zone 0-15 to a MIDI velocity (8…127). */
export function drumVelZoneToVelocity(zone) {
    return Math.round((zone + 1) * 127 / 16);
}

/** The velocity zone 0-15 whose pad plays nearest to a MIDI velocity — the
 *  inverse of drumVelZoneToVelocity, clamped for velocities below zone 0's. */
export function drumVelocityToZone(vel) {
    return Math.max(0, Math.min(15, Math.round((vel | 0) * 16 / 127) - 1));
}

export function effectiveVelocity(rawVel) { return rawVel; }

/* Step-entry velocity. Single source of truth used by every step-write site.
 *
 * Drum context (allowZone=true, used at drum step-tap sites and the drum
 * vel-pad-while-step-held site): drum vel zones ALWAYS win over VelIn.
 *   active vel-pad press now (liveVel >= 0)  →  zone velocity
 *   sticky vel-zone armed                    →  sticky zone velocity
 *   VelIn engaged                            →  VelIn value
 *   otherwise                                →  100
 *
 * Melodic context (allowZone=false): VelIn wins over pad press.
 *   VelIn engaged                            →  VelIn value
 *   live pad press now (liveVel >= 0)        →  pad press velocity
 *   otherwise                                →  100
 */
export function stepEntryVelocity(t, liveVel, allowZone) {
    if (allowZone) {
        if (liveVel >= 0) return liveVel;
        if (S.drumVelZoneArmed && S.drumVelZoneArmed[t])
            return drumVelZoneToVelocity(S.drumLastVelZone[t]);
        const tvo = S.trackVelOverride[t];
        if (tvo > 0) return tvo;
        return 100;
    }
    const tvo = S.trackVelOverride[t];
    if (tvo > 0) return tvo;
    if (liveVel >= 0) return liveVel;
    return 100;
}

/* ---- Arp step velocity (absolute 0..127; 0 = step off) ---- */

/* Canonical coarse velocities the PAD rows write (index = level 1..4). */
export const ARP_VEL_CANON = [0, 32, 64, 96, 127];

/* Thru sentinel: step passes the incoming velocity through (the default). */
export const VEL_THRU = 255;

/* Quantize an absolute step velocity to its 4-band display level for the pad
 * grid: 0 -> 0 (off), 1-32 -> 1, 33-64 -> 2, 65-96 -> 3, 97-127 -> 4;
 * Thru (255) displays as full level 4.
 * The canonical pad values land exactly on their own band. */
export function arpVelLevel(v) {
    v = v | 0;
    if (v <= 0) return 0;
    if (v >= 128) return 4;
    return Math.min(4, 1 + (((v - 1) * 4) >> 7));
}
