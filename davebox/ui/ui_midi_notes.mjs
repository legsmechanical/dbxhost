/* ui_midi_notes.mjs — what a MIDI file's part becomes in a clip: pure, no
 * host calls.
 *
 * The MIDI browser (ui_midi_import.mjs) parses a file with ui_midifile.mjs,
 * then decides everything it writes or previews here, so it can be tested
 * without a host:
 *
 *   window     Start / Bars, in the FILE's bars (the brackets on the lane)
 *   stretch    /8 … x8: ticks and gates scaled; the clip's length follows
 *   pitch      Oct and Semi first, then — Scale on — each note folded into
 *              the project's scale (nearest scale note; a tie goes UP, as
 *              xpose_snap in dsp/seq8_tonality.c does for Transpose)
 *   drums      the part's sounds (most-hit first), where each lands (the Map:
 *              GM, Move's kit layout, or none), and each lane's hits
 *   payloads   the engine's tN_cC_import / tN_lanes_import / tN_audclip values —
 *              a melodic load replaces the clip; a drum load replaces only the
 *              lanes a sound goes to (Josh, 2026-09-29), the others keep theirs
 *
 * Ticks are 96 per quarter note — the clip's own tick and the parser's.
 * (Moved here from the phrase library's model, ui_phrases.mjs, when the two
 * browsers became one, 2026-09-29.)
 */
import { SCALE_INTERVALS } from './ui_pure.mjs';
import { TPS_VALUES } from './ui_constants.mjs';

export const MN_MAX_STEPS = 256;           /* SEQ_STEPS */
export const MN_MAX_NOTES = 512;           /* MAX_NOTES_PER_CLIP, per clip or drum lane */
export const MN_MAX_PAYLOAD = 2048;        /* one payload, every lane included */
export const MN_MAX_SOUNDS = 8;            /* drum sounds placed: the in-time preview's lane limit (AUD_MAX_LANES) */
export const MN_LANES = 32;

/* K4 Stretch. ASCII labels: the device fonts have no × or ÷. */
export const STRETCH_STEPS = [
    { label: '/8', f: 1 / 8 }, { label: '/4', f: 1 / 4 }, { label: '/2', f: 1 / 2 },
    { label: 'x1', f: 1 }, { label: 'x2', f: 2 }, { label: 'x4', f: 4 }, { label: 'x8', f: 8 },
];
export const STRETCH_DEFAULT = 3;
export const OCT_MIN = -3, OCT_MAX = 3;
export const SEMI_MIN = -11, SEMI_MAX = 11;     /* ±12 is an octave: that is Oct's job */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* ---- pitch ---- */

function inScale(pitch, root, scale) {
    const pc = (((pitch - root) % 12) + 12) % 12;
    return (SCALE_INTERVALS[scale] || SCALE_INTERVALS[0]).includes(pc);
}
/* The nearest pitch in the scale; a tie goes UP (xpose_snap's order). `root`
 * is the key's pitch class 0-11, `scale` an index into SCALE_INTERVALS. */
export function foldToScale(pitch, root, scale) {
    for (let d = 0; d <= 12; d++) {
        if (pitch + d <= 127 && inScale(pitch + d, root, scale)) return pitch + d;
        if (pitch - d >= 0 && inScale(pitch - d, root, scale)) return pitch - d;
    }
    return clamp(pitch, 0, 127);
}
/* A file's pitch as it lands: Oct and Semi, then the fold. */
export function mapPitch(p, o) {
    const q = clamp(p + 12 * (o.oct | 0) + (o.semi | 0), 0, 127);
    return o.scaleOn ? foldToScale(q, o.key | 0, o.scale | 0) : q;
}

/* ---- the window and the stretch ---- */

export function barTicks(timeSig) {
    const ts = timeSig || { num: 4, den: 4 };
    return Math.max(1, Math.round(ts.num * 96 * 4 / ts.den));
}
export function partBarsOf(part, timeSig) {
    return Math.max(1, Math.ceil((part ? part.endTick : 0) / barTicks(timeSig)));
}
/* Longest window, in file bars, a clip at this grid holds at this stretch. */
export function maxBarsAt(tps, timeSig, f) {
    return Math.max(1, Math.floor(MN_MAX_STEPS * tps / (barTicks(timeSig) * (f || 1))));
}
/* The grid a part starts on: the finest (1/16 at the finest) that holds the
 * whole part unstretched, moved with the stretch so the step layout survives
 * (x2 → a grid twice as coarse). */
export function gridFor(part, timeSig, f) {
    const need = partBarsOf(part, timeSig);
    let g = TPS_VALUES.length - 1;
    for (let i = 1; i < TPS_VALUES.length; i++) if (maxBarsAt(TPS_VALUES[i], timeSig, 1) >= need) { g = i; break; }
    return clamp(g + Math.round(Math.log2(f || 1)), 0, TPS_VALUES.length - 1);
}

/* What lands: the window [Start, Start+Bars) of the part, stretched by f,
 * pitch-mapped when `pitch` is given (a melodic track). startBar is 1-based.
 * `before` / `cut` = notes outside the window; `overCap` = notes past the
 * clip's limit. Notes: [{t, g, p, v}] in clip ticks, sorted. */
export function planNotes(part, o) {
    const barT = barTicks(o.timeSig);
    const f = o.f || 1;
    const tps = o.tps || 24;
    const maxBars = maxBarsAt(tps, o.timeSig, f);
    const bars = clamp(o.bars | 0 || 1, 1, maxBars);
    const from = (Math.max(1, o.startBar | 0 || 1) - 1) * barT;
    const to = from + bars * barT;
    const span = Math.max(1, Math.round(bars * barT * f));
    const res = { notes: [], bars, maxBars, barTicks: barT, from, to, span,
                  lengthSteps: Math.min(MN_MAX_STEPS, Math.max(1, Math.ceil(span / tps))),
                  before: 0, cut: 0, shortened: 0, overCap: 0 };
    const seen = new Set();
    const melodic = !!o.pitch;
    for (const n of (part ? part.notes : [])) {
        if (n.t < from) { res.before++; continue; }
        if (n.t >= to) { res.cut++; continue; }
        const t = Math.round((n.t - from) * f);
        if (t >= span) { res.cut++; continue; }
        const p = melodic ? o.pitch(n.p) : n.p;
        const k = t * 128 + p;
        if (seen.has(k)) continue;
        if ((melodic && res.notes.length >= MN_MAX_NOTES) || res.notes.length >= MN_MAX_PAYLOAD) { res.overCap++; continue; }
        let g = Math.max(1, Math.round(n.g * f));
        if (t + g > span) { g = Math.max(1, span - t); res.shortened++; }
        seen.add(k);
        res.notes.push({ t, g, p, v: clamp(n.v | 0, 1, 127) });
    }
    res.notes.sort((a, b) => a.t - b.t || a.p - b.p);
    return res;
}

/* ---- drums ---- */

/* The sounds of a part (its pitches), most-hit first; a tie, the lower pitch. */
export function drumVoices(notes) {
    const hits = new Map();
    for (const n of notes) hits.set(n.p, (hits.get(n.p) || 0) + 1);
    return [...hits.keys()].sort((a, b) => hits.get(b) - hits.get(a) || a - b)
        .map(pitch => ({ pitch, hits: hits.get(pitch) }));
}

/* Where a sound's note lands in a mapping (K5 Map):
 *   'gm'    General MIDI — the sound's own note
 *   'move'  Move's factory-kit layout (measured over its 77 kits, 2026-09-24):
 *           GM on 36-47 and 49 (toms folded to 43 / 45 / 47), and the
 *           percussion GM puts above 51 on Move's percussion pads 50 / 48 / 51
 *   'off'   none — the sounds fill lanes from the one the browser opened on */
export const MAP_MODES = ['off', 'gm', 'move'];
const MOVE_MAP = { 35: 36, 36: 36, 37: 37, 38: 38, 40: 40, 39: 39, 42: 42, 22: 42, 44: 44, 46: 46, 26: 46,
                   41: 43, 43: 43, 45: 45, 47: 45, 48: 47, 50: 47, 49: 49, 52: 49, 55: 49, 57: 49, 51: 51, 53: 51, 59: 51 };
const MOVE_PERC = [50, 48, 51];
function mappedNotes(voices, mode) {
    let perc = 0;
    return voices.map(v => {
        if (mode === 'gm') return v.pitch;
        if (mode !== 'move') return null;
        if (v.pitch in MOVE_MAP) return MOVE_MAP[v.pitch];
        return MOVE_PERC[perc++ % MOVE_PERC.length];
    });
}

/* Each sound's lane (or -1): the lane already playing its mapped note; else
 * the lane playing the sound's own note; else the first sound takes the lane
 * the browser was opened on and the rest the next free lanes after it. A lane
 * a sound lands on is replaced by the load; the rest keep their notes. At
 * most MN_MAX_SOUNDS. */
export function defaultAssign(voices, lanePitches, mode, openLane) {
    const pitches = lanePitches || [];
    const taken = new Set(), out = [];
    const want = mappedNotes(voices, mode);
    for (let i = 0; i < voices.length && i < MN_MAX_SOUNDS; i++) {
        const free = (l) => !taken.has(l);
        let lane = want[i] != null ? pitches.findIndex((pp, l) => pp === want[i] && free(l)) : -1;
        if (lane < 0) lane = pitches.findIndex((pp, l) => pp === voices[i].pitch && free(l));
        if (lane < 0 && free(openLane)) lane = openLane;
        for (let k = 1; lane < 0 && k < MN_LANES; k++) if (free((openLane + k) % MN_LANES)) lane = (openLane + k) % MN_LANES;
        if (lane >= 0) taken.add(lane);
        out.push(lane);
    }
    return out;
}

/* Each lane's hits: Map(lane → [{t, v, g}]). `assign[i]` is sound i's lane;
 * sounds not placed are left out. Two sounds on one lane that strike on the
 * same tick make one hit, the louder. */
export function drumLaneNotes(notes, voices, assign) {
    const laneOf = new Map();
    voices.forEach((v, i) => { if (i < assign.length && assign[i] >= 0) laneOf.set(v.pitch, assign[i]); });
    const per = new Map();
    for (const n of notes) {
        const lane = laneOf.get(n.p);
        if (lane == null) continue;
        if (!per.has(lane)) per.set(lane, new Map());
        const m = per.get(lane), cur = m.get(n.t);
        if (!cur || n.v > cur.v) m.set(n.t, { t: n.t, v: n.v, g: n.g });
    }
    const out = new Map();
    for (const [lane, m] of per)
        out.set(lane, [...m.values()].sort((a, b) => a.t - b.t).slice(0, MN_MAX_NOTES));
    return out;
}

/* ---- engine payloads ---- */

const mNotes = (notes) => notes.map(n => 'a ' + n.t + ' ' + n.p + ' ' + n.v + ' ' + n.g).join(';');
/* tN_cC_import "<flags> <res> <len>|a t p v g;…" — flags bit0 = replace. */
export function melodicImportVal(res, len, notes, replacing) {
    return (replacing ? 1 : 0) + ' ' + res + ' ' + len + '|' + mNotes(notes);
}
/* tN_audclip "<res> <len> -1|…" — the in-time preview of a melodic clip. */
export function melodicAudclipVal(res, len, notes) {
    return res + ' ' + len + ' -1|' + mNotes(notes);
}
function lanesBody(laneNotes) {
    return [...laneNotes.keys()].sort((a, b) => a - b).map(l =>
        'L' + l + (laneNotes.get(l).length ? ';' : '') +
        laneNotes.get(l).map(n => 'a ' + n.t + ' ' + n.v + ' ' + n.g).join(';')).join(';');
}
/* tN_audclip "<res> <len> -2|L3;a t v g;…;L7;…" — several lanes, in time. */
export function lanesAudclipVal(res, len, laneNotes) {
    return res + ' ' + len + ' -2|' + lanesBody(laneNotes);
}
/* tN_lanes_import "<flags> <res> <len>|L3;…;L7;…" — one undo unit; only the
 * lanes named change (flags bit0 wipes each first). */
export function lanesImportVal(res, len, laneNotes, replacing) {
    return (replacing ? 1 : 0) + ' ' + res + ' ' + len + '|' + lanesBody(laneNotes);
}

/* ---- names ---- */

const VOICE_NAME = { 35: 'KICK', 36: 'KICK', 37: 'RIM', 38: 'SNARE', 39: 'CLAP', 40: 'SNARE', 41: 'LO TOM',
    42: 'HAT', 43: 'LO TOM', 44: 'PEDAL', 45: 'MID TOM', 46: 'OPEN', 47: 'MID TOM', 48: 'HI TOM', 49: 'CRASH',
    50: 'TOM', 51: 'RIDE', 52: 'CHINA', 53: 'BELL', 54: 'TAMB', 55: 'SPLSH', 56: 'COWBL', 57: 'CRASH',
    59: 'RIDE', 60: 'BONGO', 61: 'BONGO', 62: 'CONGA', 63: 'CONGA', 64: 'CONGA', 69: 'CABAS',
    70: 'SHAKR', 75: 'CLAVE', 76: 'BLOCK', 77: 'BLOCK' };
/* A drum sound's name: its General MIDI name, else its note number. */
export function voiceName(pitch) { return VOICE_NAME[pitch] || ('N' + pitch); }
