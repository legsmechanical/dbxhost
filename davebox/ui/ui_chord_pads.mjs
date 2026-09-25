/* ui_chord_pads.mjs — the melodic Chord layout on the pads.
 *
 * The music lives in ui_chord_model.mjs (pure); this file is the surface:
 * the pad map it bakes, what a press does, the held modifiers, the pad LEDs,
 * the slot card and CHORD bank knobs, and what is saved.
 *
 * ⭑ The audio engine plays the chords. Each slot pad carries its chord in the
 * pad map ("p+p+p", see computePadNoteMap), so a press sounds on the audio
 * thread with pad latency, exactly like a single note. JS only keeps its own
 * books (held notes for the screen, recording, the strum row) and re-bakes
 * the map when something changes what a pad would play.
 *
 * A held modifier changes the map for the NEXT slot press; a modifier or an
 * Inv- / Inv+ tap while a slot is held re-voices the sounding chord in place
 * (tN_chord_revoice). Josh accepted that a modifier pressed within one audio
 * buffer of the slot may still play the plain chord.
 */

import { S } from './ui_state.mjs';
import { PAD_MODE_MELODIC_SCALE, BANK_CHORD, isSoundBank } from './ui_constants.mjs';
import { triggerFire, triggerPhase } from './ui_trigger.mjs';
import { registerRingCells } from './ui_knob_leds.mjs';
import {
    NUM_SLOTS, STACKS, SPREADS, BASS_TONES, MOD_INV_DOWN, MOD_INV_UP,
    INV_MIN, INV_MAX, OCT_MIN, OCT_MAX,
    defaultPalette, defaultChordSettings, slotChord, strumRow, scaleRow, numeral,
    slotFunction, invLabel, degreeSemis, anchorChord, SMOOTH_MODES, SMOOTH_ANCHOR,
} from './ui_chord_model.mjs';

export const ROW_SLOTS = 0, ROW_MODS = 1, ROW_STRUM = 2, ROW_SCALE = 3;

/* ---- state ------------------------------------------------------------ */

export function ensureChordState(t) {
    if (!Array.isArray(S.chordPalette[t])) S.chordPalette[t] = defaultPalette();
    if (!S.chordSettings[t]) S.chordSettings[t] = defaultChordSettings();
}

/* Is track t's pad surface the Chord layout right now? */
export function chordLayoutOn(t) {
    return !!S.padLayoutChord[t] && (S.trackPadMode[t] | 0) === PAD_MODE_MELODIC_SCALE;
}

/* Turn the Chord layout on or off for track t. Landing on it raises the
 * explainer (Josh: "Every time you switch to chord. Should have an OK to
 * dismiss so you can take time to read it"). */
export function setChordLayout(t, on) {
    const was = !!S.padLayoutChord[t];
    S.padLayoutChord[t] = !!on;
    if (on) ensureChordState(t);
    if (t === S.activeTrack) resetChordTransient();
    if (on && !was) {
        S.chordPopupOpen = true;
        /* Landing on the layout lands on its bank (Josh, 2026-09-23) — from
         * anywhere, the Sound menu included: the menu never owns the bank
         * (2026-09-24). A resting MACROS / SOUND+CFG mode closes on the next tick. */
        S.trackActiveBank[t] = BANK_CHORD;
        if (t === S.activeTrack) S.activeBank = BANK_CHORD;
    }
    /* Leaving the layout leaves its bank too. */
    if (!on && S.trackActiveBank[t] === BANK_CHORD) S.trackActiveBank[t] = 0;
    if (!on && t === S.activeTrack && S.activeBank === BANK_CHORD) S.activeBank = 0;
    S.screenDirty = true;
}

/* OK on the explainer. The pads come back through the tick's mute-edge push. */
export function closeChordPopup() {
    S.chordPopupOpen = false;
    S.screenDirty = true;
}

/* The modifiers and the slot card belong to the ACTIVE track's surface; a
 * track switch or a layout change drops them. Held chords are NOT dropped:
 * their pads are still down, and each release must still clear its notes
 * from the books (the engine ends the voices itself on the switch). */
export function resetChordTransient() {
    S.chordMods = [];
    S.chordHeldSlots = [];
    S.chordRevoice = 0;
    S.chordCardSlot = -1;
    modsDown.clear();
}

/* A load or a new project: nothing is held any more. */
export function clearHeldChords() { heldChords.clear(); }

/* Is pad `pad` a held chord slot (on any track, in any layout)? Its release
 * goes through chordSlotRelease whatever the surface is now. */
export function chordPadHeld(pad) { return heldChords.has(pad); }

/* ---- the pad map ------------------------------------------------------ */

function settingsOf(t) { ensureChordState(t); return S.chordSettings[t]; }

function stackMods() { return S.chordMods.filter((m) => m < MOD_INV_DOWN); }
function heldInvDelta() {
    let d = 0;
    for (const m of S.chordMods) { if (m === MOD_INV_UP) d++; else if (m === MOD_INV_DOWN) d--; }
    return d;
}

function ctxFor(t, key, scale) {
    return { key, scale, root: (S.padOctave[t] | 0) * 12 + key };
}

/* The chord Smooth: Anchor keeps every slot near (null unless that mode). */
function anchorFor(t, c) {
    const set = S.chordSettings[t];
    if (!set || set.smooth !== SMOOTH_ANCHOR) return null;
    const k = Math.max(0, Math.min(NUM_SLOTS - 1, set.anchor | 0));
    return anchorChord(Object.assign({}, c, { slot: S.chordPalette[t][k], settings: set }));
}

/* The chord the strum row plays: the last one played or selected, rebuilt
 * from its slot so a key change carries it along. Before any: the I chord. */
export function strumChord(t, key, scale) {
    const c = ctxFor(t, key, scale);
    const last = S.chordLast[t];
    const pal = S.chordPalette[t];
    const slot = last && pal[last.slot] ? pal[last.slot] : pal[0];
    const mods = last ? (last.mods || []).concat(t === S.activeTrack && settingsOf(t).select ? stackMods() : []) : [];
    return slotChord(Object.assign({}, c, { slot, mods, invDelta: last ? last.inv | 0 : 0,
        settings: Object.assign({}, settingsOf(t), { smooth: 0 }) }));
}

/* Fill S.padNoteMap / S.padChordMap for a Chord-layout track. Called from
 * computePadNoteMap with the key/scale it is laying out for. Silent pads
 * (modifiers, and the slots in Select mode) are 0xFF: the engine skips them
 * and JS handles the press. */
export function fillChordPadMap(t, key, scale) {
    ensureChordState(t);
    const set = S.chordSettings[t];
    const c = ctxFor(t, key, scale);
    const active = t === S.activeTrack;
    const mods = active ? stackMods() : [];
    const inv = active ? heldInvDelta() : 0;
    const prev = S.chordLast[t] && S.chordLast[t].notes;
    const anchor = anchorFor(t, c);
    for (let i = 0; i < 32; i++) { S.padNoteMap[i] = 0xFF; S.padChordMap[i] = null; }
    if (!set.select) {
        for (let k = 0; k < NUM_SLOTS; k++) {
            const ch = slotChord(Object.assign({}, c, { slot: S.chordPalette[t][k], mods, invDelta: inv,
                settings: set, prev, anchor }));
            if (!ch.notes.length) continue;
            S.padNoteMap[k] = ch.notes[0];
            S.padChordMap[k] = ch.notes.length > 1 ? ch.notes : null;
        }
    }
    const strum = strumRow(strumChord(t, key, scale).notes, c.root + 12 * (set.strum | 0));
    const sc = scaleRow(scale, c.root + 12 * (1 + (set.strum | 0)));
    for (let k = 0; k < 8; k++) {
        S.padNoteMap[16 + k] = strum[k];
        S.padNoteMap[24 + k] = sc[k];
    }
}

/* Pad i's padmap token: its note, or its chord as "p+p+p", shifted by the
 * track octave. A chord drops notes the shift takes out of range rather than
 * piling them onto 0 or 127. */
export function padToken(i, octShift) {
    const ch = S.padChordMap[i];
    if (ch && ch.length > 1) {
        const ps = ch.map((p) => p + octShift).filter((p) => p >= 0 && p <= 127);
        if (ps.length) return ps.join('+');
        return '255';
    }
    const p = S.padNoteMap[i];
    return p === 0xFF ? '255' : String(Math.max(0, Math.min(127, p + octShift)));
}

/* What pad i sounds when pressed, as the engine will play it. */
export function padPitches(i, octShift) {
    const tok = padToken(i, octShift);
    if (tok === '255') return [];
    return tok.split('+').map(Number);
}

/* ---- presses ------------------------------------------------------------ */

/* pad index → { pitches, numeral, name } for each slot pad held in Play. */
const heldChords = new Map();

export function chordRowOf(padIdx) { return Math.floor(padIdx / 8); }

function octShiftOf(t) { return (S.trackOctave[t] | 0) * 12; }

function effKeyScale() {
    const key = S.xposePrevKey !== null ? S.xposePrevKey : S.padKey;
    const scale = S.xposePrevScale !== null ? S.xposePrevScale : S.padScale;
    return { key, scale };
}

function chordFor(t, k, extraInv, baseInv) {
    const { key, scale } = effKeyScale();
    const c = ctxFor(t, key, scale);
    return slotChord(Object.assign({}, c, { slot: S.chordPalette[t][k], mods: stackMods(),
        invDelta: (baseInv === undefined ? heldInvDelta() : baseInv) + (extraInv | 0), settings: settingsOf(t),
        prev: S.chordLast[t] && S.chordLast[t].notes, anchor: anchorFor(t, c) }));
}

/* A slot pad went down. Returns the pitches it sounds (empty in Select, where
 * a slot only chooses what the strum row plays). */
export function chordSlotPress(t, k) {
    const set = settingsOf(t);
    const sh = octShiftOf(t);
    let pitches = [];
    let ch;
    if (set.select) {
        ch = chordFor(t, k, 0);
    } else {
        pitches = padPitches(k, sh);
        ch = chordFor(t, k, 0);
        heldChords.set(k, { t, pitches: pitches.slice(), ever: pitches.slice(), baseInv: heldInvDelta(),
                            numeral: ch.numeral, name: ch.name, plain: ch.plain });
    }
    S.chordRevoice = 0;
    S.chordHeldSlots = S.chordHeldSlots.filter((x) => x !== k).concat([k]);
    S.chordLast[t] = { slot: k, mods: stackMods(), inv: heldInvDelta(), notes: ch.notes,
                       numeral: ch.numeral, name: ch.name, plain: ch.plain };
    /* The strum row now follows this chord (and Smooth re-voices the rest):
     * re-bake on the next tick, clear of this press's own traffic. */
    S.pendingPadNoteMapRecompute = true;
    S.screenDirty = true;
    return pitches;
}

/* A slot pad came up. Returns every pitch it was booked with during the
 * hold — not just the last voicing: a re-voice the engine never received
 * (one set_param per audio buffer survives) must not leave its notes in the
 * books. Clearing a note that is not sounding costs nothing. */
export function chordSlotRelease(t, k) {
    const h = heldChords.get(k);
    heldChords.delete(k);
    S.chordHeldSlots = S.chordHeldSlots.filter((x) => x !== k);
    if (!S.chordHeldSlots.length) { S.chordRevoice = 0; S.chordCardSlot = -1; }
    S.screenDirty = true;
    return h ? h.ever : [];
}

/* Is pitch p held by a chord pad other than `exceptPad`? */
export function chordPitchHeld(p, exceptPad) {
    for (const [pad, h] of heldChords) if (pad !== exceptPad && h.pitches.indexOf(p) >= 0) return true;
    return false;
}

/* Re-voice the most recently held slot to what it would play now. Returns
 * { pad, before, after } for the JS books, or null when nothing is held. */
function revoiceHeld(t) {
    const k = S.chordHeldSlots[S.chordHeldSlots.length - 1];
    if (k === undefined) return null;
    const h = heldChords.get(k);
    if (!h || h.t !== t) return null;
    /* The walk starts from the inversion the chord was PRESSED with — an Inv
     * pad held then, and let go since, still counts. */
    const ch = chordFor(t, k, S.chordRevoice, h.baseInv);
    const sh = octShiftOf(t);
    const after = ch.notes.map((p) => p + sh).filter((p) => p >= 0 && p <= 127);
    if (!after.length) return null;
    host_module_set_param('t' + t + '_chord_revoice', k + ' ' + after.join('+'));
    const before = h.pitches;
    const ever = h.ever.concat(after.filter((p) => h.ever.indexOf(p) < 0));
    heldChords.set(k, Object.assign({}, h, { pitches: after, ever, numeral: ch.numeral, name: ch.name, plain: ch.plain }));
    S.chordLast[t] = Object.assign({}, S.chordLast[t] || {}, { slot: k, mods: stackMods(),
        inv: h.baseInv + S.chordRevoice, notes: ch.notes, numeral: ch.numeral, name: ch.name, plain: ch.plain });
    return { pad: k, before, after };
}

/* Row-2 pads physically down (0..7), for the LEDs. */
const modsDown = new Set();
export function chordModDown(m) { return modsDown.has(m); }

/* A row-2 pad went down (m = 0..7). Returns a re-voice record or null.
 * A stack modifier is HELD: it shapes the next slot press, or the held chord
 * while it is down. Inv-/+ with no chord held is held too (that press's
 * inversion); tapped while a chord is held it WALKS that chord one step, and
 * each tap walks further. In Select it walks the strum row's chord. */
export function chordModPress(t, m) {
    const set = settingsOf(t);
    modsDown.add(m);
    let rv = null;
    const isInv = m === MOD_INV_DOWN || m === MOD_INV_UP;
    const d = m === MOD_INV_UP ? 1 : -1;
    if (isInv && !set.select && S.chordHeldSlots.length) {
        S.chordRevoice += d;
        rv = revoiceHeld(t);
    } else if (isInv && set.select) {
        if (S.chordLast[t]) S.chordLast[t] = Object.assign({}, S.chordLast[t], { inv: (S.chordLast[t].inv | 0) + d });
    } else {
        if (S.chordMods.indexOf(m) < 0) S.chordMods = S.chordMods.concat([m]);
        if (!isInv && !set.select && S.chordHeldSlots.length) rv = revoiceHeld(t);
    }
    /* The slots' own chords follow the held modifiers. Pushed right away —
     * the next slot press must find the modified chord in the engine. With
     * a re-voice already sent, wait a tick (one set_param per audio buffer
     * survives). */
    if (rv) S.pendingPadNoteMapRecompute = true;
    else S.chordPadmapNow = true;
    S.screenDirty = true;
    return rv;
}

export function chordModRelease(t, m) {
    const set = settingsOf(t);
    modsDown.delete(m);
    const was = S.chordMods.indexOf(m) >= 0;
    S.chordMods = S.chordMods.filter((x) => x !== m);
    let rv = null;
    if (was && !set.select && S.chordHeldSlots.length && m !== MOD_INV_DOWN && m !== MOD_INV_UP)
        rv = revoiceHeld(t);          /* a held stack let go: the chord goes back */
    if (rv) S.pendingPadNoteMapRecompute = true;
    else S.chordPadmapNow = true;
    S.screenDirty = true;
    return rv;
}

/* ---- the screen ---------------------------------------------------------- */

/* The indicator text while the Chord layout is up: "vi · AMIN7" for a held
 * slot (or, in Select with nothing sounding, the selected chord); null to
 * fall back to naming the held notes. */
export function chordIndicator(t, anySounding) {
    if (!chordLayoutOn(t)) return null;
    const k = S.chordHeldSlots[S.chordHeldSlots.length - 1];
    const h = k !== undefined ? heldChords.get(k) : null;
    if (h && h.t === t) return h.numeral + ' · ' + h.name;
    const set = settingsOf(t);
    if (set.select && !anySounding && S.chordLast[t]) {
        const { key, scale } = effKeyScale();
        const ch = strumChord(t, key, scale);
        return numeral(scale, S.chordPalette[t][S.chordLast[t].slot].deg) + ' · ' + ch.name;
    }
    return null;
}

/* The slot being edited by the knobs: the held slot, if any. */
export function chordEditSlot() {
    if (!chordLayoutOn(S.activeTrack)) return -1;
    const k = S.chordHeldSlots[S.chordHeldSlots.length - 1];
    return k === undefined ? -1 : k;
}

/* Cells for the slot card (hold a slot + knobs). */
export function chordSlotCells(t, k) {
    ensureChordState(t);
    const s = S.chordPalette[t][k];
    const { key, scale } = effKeyScale();
    const ch = chordFor(t, k, 0);
    const size = ch.notes.length - (s.bass || settingsOf(t).bass ? 1 : 0);
    return {
        title: numeral(scale, s.deg) + ' · ' + ch.name,
        /* ringNorm: where each knob sits, for its LED ring (4 white / 4 amber
         * like every bank). */
        cells: [
            { kind: 'valsq', label: 'Root', name: 'Root', text: numeral(scale, s.deg), ringNorm: pos(s.deg, -7, 14) },
            { kind: 'valsq', label: 'Stack', name: 'Stack', text: STACKS[s.stack] || '--', ringNorm: pos(s.stack, 0, STACKS.length - 1) },
            { kind: 'blank', label: '' },
            { kind: 'valsq', label: 'Inv', name: 'Inversion', text: invLabel(s.inv, size), ringNorm: pos(s.inv, INV_MIN, INV_MAX) },
            { kind: 'valsq', label: 'Sprd', name: 'Spread', text: SPREADS[s.spread] || '--', ringNorm: pos(s.spread, 0, 1) },
            { kind: 'valsq', label: 'Bass', name: 'Bass', text: BASS_TONES[s.bass] || '--', ringNorm: pos(s.bass, 0, 3) },
            { kind: 'valsq', label: 'Oct', name: 'Octave', text: s.oct > 0 ? '+' + s.oct : String(s.oct), ringNorm: pos(s.oct, OCT_MIN, OCT_MAX) },
            /* A trigger, as on stock pages: touch K8 and click the jog. */
            /* `opens`: stock's corner brackets — "this one is a click". */
            { kind: 'action', oneWay: true, label: 'Reset', name: 'Reset slot', text: '->', ringBound: true, opens: true,
              btnPhase: triggerPhase('chordReset', S.knobTouched === 7) },
        ],
        plain: ch.plain,
    };
}

/* K8 on the held slot's card: touch it and click the jog (the stock trigger
 * gesture). Puts the slot back to its default chord; the press flashes. */
export function chordSlotReset(t, k) {
    ensureChordState(t);
    Object.assign(S.chordPalette[t][k], { deg: k, stack: 0, inv: 0, spread: 0, bass: 0, oct: 0 });
    triggerFire('chordReset');
    if (!settingsOf(t).select && heldChords.has(k)) S.chordPendingRevoice = revoiceHeld(t);
    S.pendingPadNoteMapRecompute = true;
    S.chordDirty = true;
    S.screenDirty = true;
}

/* One knob step on the held slot's card. Returns true when it changed. */
export function chordSlotKnob(t, k, knob, steps) {
    ensureChordState(t);
    const s = S.chordPalette[t][k];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const before = JSON.stringify(s);
    switch (knob) {
        case 0: s.deg = clamp(s.deg + steps, -7, 14); break;
        case 1: s.stack = clamp(s.stack + steps, 0, STACKS.length - 1); break;
        case 3: s.inv = clamp(s.inv + steps, INV_MIN, INV_MAX); break;
        case 4: s.spread = clamp(s.spread + steps, 0, SPREADS.length - 1); break;
        case 5: s.bass = clamp(s.bass + steps, 0, BASS_TONES.length - 1); break;
        case 6: s.oct = clamp(s.oct + steps, OCT_MIN, OCT_MAX); break;
        default: return false;           /* K8 Reset is a click, not a turn */
    }
    if (JSON.stringify(s) === before) return false;
    /* The held chord sounds the edit; the map carries it to the next press. */
    if (!settingsOf(t).select && heldChords.has(k)) S.chordPendingRevoice = revoiceHeld(t);
    S.pendingPadNoteMapRecompute = true;
    S.chordDirty = true;
    S.screenDirty = true;
    return true;
}

/* ---- the CHORD bank ------------------------------------------------------ */

function pos(v, lo, hi) { return hi > lo ? ((v | 0) - lo) / (hi - lo) : 0; }

/* The knob rings on the CHORD bank ride its cells — the held slot's page or
 * the bank's own, whichever is on screen. */
registerRingCells(BANK_CHORD, () => {
    const t = S.activeTrack;
    if (!chordLayoutOn(t)) return null;
    const k = chordEditSlot();
    return k >= 0 ? chordSlotCells(t, k).cells : chordBankCells(t);
});

const ON_OFF = ['Off', 'On'];
/* The anchor's name on the bank: its slot's numeral ("I", "vi"). */
function anchorLabel(t, k) {
    const { scale } = effKeyScale();
    return numeral(scale, S.chordPalette[t][k].deg);
}

export function chordBankCells(t) {
    const s = settingsOf(t);
    return [
        { kind: 'valsq', label: 'Voice', name: 'Voicing', text: s.voicing > 0 ? '+' + s.voicing : String(s.voicing),
          ringNorm: pos(s.voicing, INV_MIN, INV_MAX) },
        { kind: 'enumsq', label: 'Smoth', name: 'Smooth', text: SMOOTH_MODES[s.smooth | 0] || 'Off',
          options: SMOOTH_MODES, sel: s.smooth | 0 },
        { kind: 'pill', label: 'Bass', name: 'Bass', text: ON_OFF[s.bass ? 1 : 0], norm: s.bass ? 1 : 0 },
        { kind: 'valsq', label: 'BsOct', name: 'Bass Octave', text: '-' + (s.bassOct | 0), ringNorm: pos(s.bassOct, 1, 2) },
        { kind: 'valsq', label: 'Strum', name: 'Strum Octave', text: s.strum > 0 ? '+' + s.strum : String(s.strum),
          ringNorm: pos(s.strum, -1, 2) },
        /* Anchor exists only in Smooth: Anchor (Josh, 2026-09-23) — otherwise
         * the knob is empty, and its ring dark. */
        s.smooth === SMOOTH_ANCHOR
            ? { kind: 'valsq', label: 'Anchr', name: 'Anchor', text: anchorLabel(t, s.anchor | 0),
                ringNorm: pos(s.anchor, 0, NUM_SLOTS - 1) }
            : { kind: 'blank', label: '' },
        { kind: 'enumsq', label: 'Slots', name: 'Slots', text: s.select ? 'Select' : 'Play',
          options: ['Play', 'Select'], sel: s.select ? 1 : 0 },
        { kind: 'blank', label: '' },
    ];
}

export function chordBankKnob(t, knob, steps) {
    const s = settingsOf(t);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const before = JSON.stringify(s);
    switch (knob) {
        case 0: s.voicing = clamp(s.voicing + steps, INV_MIN, INV_MAX); break;
        case 1: s.smooth = clamp(s.smooth + steps, 0, SMOOTH_MODES.length - 1); break;
        case 5: if (s.smooth !== SMOOTH_ANCHOR) return false;
                s.anchor = clamp((s.anchor | 0) + steps, 0, NUM_SLOTS - 1); break;
        case 2: s.bass = steps > 0 ? 1 : 0; break;
        case 3: s.bassOct = clamp(s.bassOct + steps, 1, 2); break;
        case 4: s.strum = clamp(s.strum + steps, -1, 2); break;
        case 6: s.select = steps > 0 ? 1 : 0; break;
        default: return false;
    }
    if (JSON.stringify(s) === before) return false;
    if (t === S.activeTrack) { S.chordHeldSlots = []; heldChords.clear(); }
    S.chordPadmapNow = true;
    S.chordDirty = true;
    S.screenDirty = true;
    return true;
}

/* ---- LEDs ---------------------------------------------------------------- */

/* The colour for pad i, or null to let the caller's scale colouring stand.
 * `c` = { White, DarkGrey, LightGrey, Off, track, trackDim, fn: [tonic,
 * subdominant, dominant] }. */
export function chordPadColor(t, i, sounding, c) {
    const row = chordRowOf(i);
    const set = settingsOf(t);
    if (row === ROW_SLOTS) {
        const held = S.chordHeldSlots.indexOf(i) >= 0;
        const sel = set.select && S.chordLast[t] && S.chordLast[t].slot === i;
        if (held || sel) return c.White;
        return c.fn[slotFunction(S.chordPalette[t][i].deg)];
    }
    if (row === ROW_MODS) {
        if (modsDown.has(i - 8)) return c.White;
        return (i - 8) >= MOD_INV_DOWN ? c.LightGrey : c.DarkGrey;
    }
    const p = S.padNoteMap[i];
    if (p === 0xFF) return c.Off;
    if (sounding) return c.White;
    if (row === ROW_STRUM) {
        const { key, scale } = effKeyScale();
        const last = S.chordLast[t];
        const slotDeg = S.chordPalette[t][last ? last.slot : 0].deg;
        const chordRootPc = ((ctxFor(t, key, scale).root + degreeSemis(scale, slotDeg)) % 12 + 12) % 12;
        return (p % 12) === chordRootPc ? c.track : c.trackDim;
    }
    return null;
}

/* ---- saved state ----------------------------------------------------------- */

/* The sidecar's `chd`: per track, null or { p: [[deg,stack,inv,spread,bass,oct]×8], s: {...} }.
 * Only tracks that have ever been on the Chord layout carry one. */
export function chordSidecar() {
    const out = [];
    for (let t = 0; t < 8; t++) {
        if (!Array.isArray(S.chordPalette[t])) { out.push(null); continue; }
        out.push({
            p: S.chordPalette[t].map((s) => [s.deg, s.stack, s.inv, s.spread, s.bass, s.oct]),
            s: Object.assign({}, S.chordSettings[t] || defaultChordSettings()),
        });
    }
    return out;
}

export function restoreChordSidecar(chd) {
    for (let t = 0; t < 8; t++) {
        const e = Array.isArray(chd) ? chd[t] : null;
        if (!e || !Array.isArray(e.p)) { S.chordPalette[t] = undefined; S.chordSettings[t] = undefined; continue; }
        const pal = defaultPalette();
        for (let k = 0; k < pal.length && k < e.p.length; k++) {
            const a = e.p[k];
            if (!Array.isArray(a)) continue;
            const n = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi) ? (v | 0) : d;
            pal[k] = { deg: n(a[0], -7, 14, k), stack: n(a[1], 0, STACKS.length - 1, 0),
                       inv: n(a[2], INV_MIN, INV_MAX, 0), spread: n(a[3], 0, 1, 0),
                       bass: n(a[4], 0, 3, 0), oct: n(a[5], OCT_MIN, OCT_MAX, 0) };
        }
        S.chordPalette[t] = pal;
        /* Settings are clamped like the palette: an out-of-range value would
         * blank rows or pick a slot that does not exist. */
        const d = defaultChordSettings(), v = e.s || {};
        const n = (x, lo, hi, def) => (typeof x === 'number' && x >= lo && x <= hi) ? (x | 0) : def;
        S.chordSettings[t] = {
            voicing: n(v.voicing, INV_MIN, INV_MAX, d.voicing), smooth: n(v.smooth, 0, SMOOTH_MODES.length - 1, d.smooth),
            anchor: n(v.anchor, 0, NUM_SLOTS - 1, d.anchor), bass: n(v.bass, 0, 1, d.bass),
            bassOct: n(v.bassOct, 1, 2, d.bassOct), strum: n(v.strum, -1, 2, d.strum), select: n(v.select, 0, 1, d.select),
        };
    }
}
