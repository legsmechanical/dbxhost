/* ui_phrases.mjs — the phrase library's model: pure, no host calls.
 *
 * A library file is one category (`<cat>.json`), written by
 * tools/phrasegen (lib/phrase.mjs holds the encoding; this file only reads it):
 *
 *   {"v":1,"cat":"hat","phrases":[{id,name,g,bars,feel,mode,src,lic,n,pads?,layers?}]}
 *
 *   drum     n = "t v g;…"        one pad
 *            n = "t v g p;…"      several instruments; `pads` lists their
 *                                 pitches by hit count, `layers` maps a pitch
 *                                 that doubles another to the one it doubles
 *   melodic  n = "t deg oct acc v g;…"   degree in the phrase's mode (maj/min),
 *                                        octaves from the category's anchor, a
 *                                        chromatic offset for notes outside it
 *
 * Ticks are 96 per quarter note — the clip's own tick. Melodic phrases are
 * stored in C and land in the project's key and scale the way Transpose moves
 * a clip (dsp/seq8_tonality.c xpose_remap_pitch: degree kept when both scales
 * have seven notes, snapped to the scale otherwise).
 *
 * The screen (ui_phrase_browser.mjs) owns reading files, knobs and the engine
 * writes; everything it decides with is here, so it can be tested without a
 * host.
 */
import { SCALE_INTERVALS } from './ui_pure.mjs';
import { TPS_VALUES } from './ui_constants.mjs';

export const PB_PPQN = 96;
export const PB_BAR = PB_PPQN * 4;

export const PB_DRUM_CATS = ['kick', 'snare', 'hat', 'cymb', 'tom', 'perc'];
export const PB_MELODIC_CATS = ['bass', 'chord', 'arp', 'lead', 'pad', 'fx',
                                'seq', 'sfx', 'keys', 'guitar', 'orch', 'ethnic'];
/* The MIDI note of each melodic category's C — fixed per category (Josh,
 * 2026-09-23). */
export const PB_ANCHOR = { bass: 36, chord: 60, arp: 60, pad: 60, lead: 72, fx: 60,
                           seq: 60, sfx: 60, keys: 60, guitar: 48, orch: 60, ethnic: 60 };
export const PB_CAT_LABEL = { kick: 'KICK', snare: 'SNARE', hat: 'HAT', cymb: 'CYMBAL', tom: 'TOM',
    perc: 'PERC', bass: 'BASS', chord: 'CHORD', arp: 'ARP', lead: 'LEAD', pad: 'PAD', fx: 'SYNTH FX',
    seq: 'SEQUENCE', sfx: 'SOUND FX', keys: 'KEYS', guitar: 'GUITAR', orch: 'ORCH', ethnic: 'ETHNIC' };

export const isPbDrumCat = (c) => PB_DRUM_CATS.includes(c);

/* K3 Time: a phrase at ×2 takes twice as long, at ÷2 half. */
export const PB_TIMES = [
    { label: '÷8', f: 1 / 8 }, { label: '÷4', f: 1 / 4 }, { label: '÷2', f: 1 / 2 },
    { label: '×1', f: 1 }, { label: '×2', f: 2 }, { label: '×4', f: 4 }, { label: '×8', f: 8 },
];
export const PB_TIME_DEFAULT = 3;

/* K2 Style: ALL, then each genre name tag, then BASIC for the untagged. */
export const PB_STYLE_ALL = 'ALL';
export const PB_STYLE_BASIC = 'BASIC';

/* How many instruments of one drum phrase the browser places (more are
 * dropped, and counted). */
export const PB_MAX_VOICES = 6;
export const PB_MAX_NOTES = 512;          /* MAX_NOTES_PER_CLIP, per clip or lane */
const MAX_STEPS = 256;

const MODE_SCALE = { maj: 0, min: 1 };

/* ---- the library ---- */

/* One file's text → its phrases, or null when it is not a library file.
 * A record without a usable id, name or note string is skipped. */
export function parseLibrary(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return null; }
    if (!doc || doc.v !== 1 || typeof doc.cat !== 'string' || !Array.isArray(doc.phrases)) return null;
    const cat = doc.cat;
    if (!isPbDrumCat(cat) && !(cat in PB_ANCHOR)) return null;
    const phrases = [];
    for (const p of doc.phrases) {
        if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.n !== 'string' || !p.n) continue;
        phrases.push({
            id: p.id, name: p.name.slice(0, 14).toUpperCase(), cat,
            g: typeof p.g === 'string' ? p.g.toUpperCase() : '',
            bars: Math.max(1, Math.min(16, p.bars | 0 || 1)),
            feel: typeof p.feel === 'string' ? p.feel : 'straight',
            mode: p.mode === 'maj' ? 'maj' : 'min',
            pads: Array.isArray(p.pads) ? p.pads.filter(x => Number.isInteger(x) && x >= 0 && x < 128) : null,
            layers: (p.layers && typeof p.layers === 'object') ? p.layers : null,
            n: p.n,
        });
    }
    return { cat, phrases };
}

/* Several sources of one category (the shipped library, then the user's own
 * folder) → one list, shipped first. A later id already seen is dropped. */
export function mergeLibraries(docs) {
    const seen = new Set(), out = [];
    for (const d of docs) {
        if (!d) continue;
        for (const p of d.phrases) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            out.push(p);
        }
    }
    return out;
}

export function styleList(phrases) {
    const tags = new Set();
    let basic = false;
    for (const p of phrases) { if (p.g) tags.add(p.g); else basic = true; }
    const out = [PB_STYLE_ALL, ...[...tags].sort()];
    if (basic) out.push(PB_STYLE_BASIC);
    return out;
}

export function filterPhrases(phrases, style) {
    if (!style || style === PB_STYLE_ALL) return phrases;
    if (style === PB_STYLE_BASIC) return phrases.filter(p => !p.g);
    return phrases.filter(p => p.g === style);
}

/* ---- notes ---- */

export function decodePhrase(p) {
    const drum = isPbDrumCat(p.cat);
    const out = [];
    for (const r of String(p.n || '').split(';')) {
        if (!r) continue;
        const a = r.split(' ').map(Number);
        if (a.some(x => !Number.isFinite(x))) continue;
        if (drum) out.push({ t: a[0], v: a[1], g: a[2], p: a.length > 3 ? a[3] : -1 });
        else out.push({ t: a[0], deg: a[1], oct: a[2], acc: a[3], v: a[4], g: a[5] });
    }
    return out;
}

/* The phrase's pitch in C (its own mode), before the project's key. */
export function pitchInC(cat, mode, n) {
    const iv = SCALE_INTERVALS[MODE_SCALE[mode] ?? 1];
    const d = ((n.deg % 7) + 7) % 7, extra = Math.floor(n.deg / 7);
    return (PB_ANCHOR[cat] ?? 60) + 12 * ((n.oct || 0) + extra) + iv[d] + (n.acc || 0);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function inScale(pitch, root, scale) {
    const pc = (((pitch - root) % 12) + 12) % 12;
    return (SCALE_INTERVALS[scale] || SCALE_INTERVALS[0]).includes(pc);
}
function snap(pitch, root, scale) {
    for (let d = 0; d <= 12; d++) {
        if (pitch + d <= 127 && inScale(pitch + d, root, scale)) return pitch + d;
        if (pitch - d >= 0 && inScale(pitch - d, root, scale)) return pitch - d;
    }
    return clamp(pitch, 0, 127);
}
/* JS twin of xpose_remap_pitch (dsp/seq8_tonality.c). */
export function remapPitch(p, oldK, oldS, newK, newS) {
    let kd = (newK - oldK) % 12; if (kd < 0) kd += 12; if (kd > 6) kd -= 12;
    const p1 = p + kd;
    const oldIv = SCALE_INTERVALS[oldS] || SCALE_INTERVALS[0];
    const newIv = SCALE_INTERVALS[newS] || SCALE_INTERVALS[0];
    const rel = p1 - newK;
    let oct = Math.trunc(rel / 12), within = rel % 12;
    if (within < 0) { within += 12; oct--; }
    const deg = oldIv.indexOf(within);
    if (deg < 0 || oldIv.length !== newIv.length) return clamp(snap(p1, newK, newS), 0, 127);
    return clamp(newK + oct * 12 + newIv[deg], 0, 127);
}

/* Grid and length at a time scale: the phrase keeps its step layout (a ×2
 * phrase has steps twice as long), within the clip's resolutions and 256
 * steps. */
export function timing(p, timeIdx) {
    const f = (PB_TIMES[timeIdx] || PB_TIMES[PB_TIME_DEFAULT]).f;
    const ticks = Math.max(1, Math.round(p.bars * PB_BAR * f));
    let res = 0;
    const want = 24 * f;
    for (let i = 0; i < TPS_VALUES.length; i++) if (TPS_VALUES[i] <= want) res = i;
    while (res < TPS_VALUES.length - 1 && Math.ceil(ticks / TPS_VALUES[res]) > MAX_STEPS) res++;
    const tps = TPS_VALUES[res];
    return { f, ticks, res, tps, lengthSteps: Math.max(1, Math.min(MAX_STEPS, Math.ceil(ticks / tps))) };
}

function scaleNote(t, g, f, ticks) {
    const st = Math.round(t * f);
    return { t: st, g: Math.max(1, Math.min(Math.round(g * f), ticks - st)) };
}

/* Melodic: [{t, p, v, g}] in the project's key/scale at a time scale. */
export function melodicNotes(p, timeIdx, key, scale) {
    const tm = timing(p, timeIdx);
    const out = [], seen = new Set();
    for (const n of decodePhrase(p)) {
        const { t, g } = scaleNote(n.t, n.g, tm.f, tm.ticks);
        if (t < 0 || t >= tm.ticks) continue;
        /* The degree moves with the key; the chromatic offset rides on top, so
         * a passing note stays a passing note instead of snapping into scale. */
        const dia = clamp(pitchInC(p.cat, p.mode, Object.assign({}, n, { acc: 0 })), 0, 127);
        const pitch = clamp(remapPitch(dia, 0, MODE_SCALE[p.mode] ?? 1, key | 0, scale | 0) + (n.acc || 0), 0, 127);
        const k = t * 128 + pitch;
        if (seen.has(k)) continue;
        seen.add(k);
        if (out.length >= PB_MAX_NOTES) break;
        out.push({ t, p: pitch, v: clamp(n.v | 0, 1, 127), g });
    }
    return out;
}

/* ---- drum voices ---- */

/* A drum phrase's instruments, most-hit first: [{pitch, hits, layerOf}].
 * A one-pad phrase has one voice with pitch -1. */
export function drumVoices(p) {
    const notes = decodePhrase(p);
    const hits = new Map();
    for (const n of notes) hits.set(n.p, (hits.get(n.p) || 0) + 1);
    const order = (p.pads && p.pads.length) ? p.pads.filter(x => hits.has(x)) : [];
    for (const k of [...hits.keys()].sort((a, b) => hits.get(b) - hits.get(a) || a - b))
        if (!order.includes(k)) order.push(k);
    const layers = p.layers || {};
    return order.map(pitch => {
        const base = layers[String(pitch)];
        return { pitch, hits: hits.get(pitch), layerOf: (base != null && order.includes(base) && base !== pitch) ? base : null };
    });
}

/* Where each voice goes by default. `lanePitches` is the 32 lanes' notes,
 * `laneUsed[l]` whether lane l has notes in the destination clip, `openLane`
 * the lane the browser was opened on. Order of preference per voice:
 * a layer → its base's lane; the first voice → the lane opened on; the lane
 * already playing that pitch; the next empty lane after the one opened on;
 * else the next lane not yet taken (which will be replaced). */
export function defaultAssign(voices, lanePitches, laneUsed, openLane) {
    const n = 32, taken = new Set(), out = [];
    const byPitch = new Map();
    for (let i = 0; i < voices.length && i < PB_MAX_VOICES; i++) {
        const v = voices[i];
        let lane = -1;
        if (v.layerOf != null && byPitch.has(v.layerOf)) lane = byPitch.get(v.layerOf);
        else if (i === 0) lane = openLane;
        else {
            const m = (lanePitches || []).findIndex((pp, l) => pp === v.pitch && !taken.has(l));
            if (m >= 0) lane = m;
            for (let k = 1; lane < 0 && k < n; k++) {
                const l = (openLane + k) % n;
                if (!taken.has(l) && !(laneUsed && laneUsed[l])) lane = l;
            }
            for (let k = 1; lane < 0 && k < n; k++) {
                const l = (openLane + k) % n;
                if (!taken.has(l)) lane = l;
            }
        }
        taken.add(lane);
        byPitch.set(v.pitch, lane);
        out.push(lane);
    }
    return out;
}

/* Drum notes per lane at a time scale: Map(lane → [{t, v, g}]). `assign[i]`
 * is voice i's lane; voices past the assignment are left out. Two voices on
 * one lane that strike on the same tick make one hit, the louder. */
export function drumLaneNotes(p, timeIdx, voices, assign) {
    const tm = timing(p, timeIdx);
    const laneOf = new Map();
    voices.forEach((v, i) => { if (i < assign.length && assign[i] >= 0) laneOf.set(v.pitch, assign[i]); });
    const per = new Map();
    for (const n of decodePhrase(p)) {
        const lane = laneOf.get(n.p);
        if (lane == null) continue;
        const { t, g } = scaleNote(n.t, n.g, tm.f, tm.ticks);
        if (t < 0 || t >= tm.ticks) continue;
        if (!per.has(lane)) per.set(lane, new Map());
        const m = per.get(lane), cur = m.get(t);
        const v = clamp(n.v | 0, 1, 127);
        if (!cur || v > cur.v) m.set(t, { t, v, g });
    }
    const out = new Map();
    for (const [lane, m] of per)
        out.set(lane, [...m.values()].sort((a, b) => a.t - b.t).slice(0, PB_MAX_NOTES));
    return out;
}

/* A drum phrase on a MELODIC track: each instrument plays a note, chosen by
 * tapping a pad (Josh, 2026-09-23: "this note from the sequence goes on this
 * drum track pad (or melodic track NOTE)"). The default note is the
 * instrument's own drum pitch — a one-pad phrase uses its category's. */
export const PB_DRUM_NOTE = { kick: 36, snare: 38, hat: 42, cymb: 49, tom: 45, perc: 56 };
export function defaultNoteAssign(voices, cat) {
    return voices.slice(0, PB_MAX_VOICES).map(v => v.pitch >= 0 ? v.pitch : (PB_DRUM_NOTE[cat] ?? 36));
}
/* [{t, p, v, g}]: voice i plays note noteAssign[i]; two voices on one note
 * that strike on the same tick make one hit, the louder. */
export function drumAsMelodicNotes(p, timeIdx, voices, noteAssign) {
    const tm = timing(p, timeIdx);
    const noteOf = new Map();
    voices.forEach((v, i) => { if (i < noteAssign.length && noteAssign[i] >= 0) noteOf.set(v.pitch, clamp(noteAssign[i], 0, 127)); });
    const m = new Map();
    for (const n of decodePhrase(p)) {
        const pitch = noteOf.get(n.p);
        if (pitch == null) continue;
        const { t, g } = scaleNote(n.t, n.g, tm.f, tm.ticks);
        if (t < 0 || t >= tm.ticks) continue;
        const k = t * 128 + pitch, cur = m.get(k), v = clamp(n.v | 0, 1, 127);
        if (!cur || v > cur.v) m.set(k, { t, p: pitch, v, g });
    }
    return [...m.values()].sort((a, b) => a.t - b.t || a.p - b.p).slice(0, PB_MAX_NOTES);
}

/* ---- engine payloads ---- */

/* tN_cC_import / tN_audclip (lane -1) for a melodic phrase. */
export function melodicImportVal(tm, notes, replacing) {
    return (replacing ? 1 : 0) + ' ' + tm.res + ' ' + tm.lengthSteps + '|' +
        notes.map(n => 'a ' + n.t + ' ' + n.p + ' ' + n.v + ' ' + n.g).join(';');
}
export function melodicAudclipVal(tm, notes) {
    return tm.res + ' ' + tm.lengthSteps + ' -1|' +
        notes.map(n => 'a ' + n.t + ' ' + n.p + ' ' + n.v + ' ' + n.g).join(';');
}
/* tN_lL_import / tN_audclip (one lane) for one lane's notes. */
export function laneImportVal(tm, notes, replacing) {
    return (replacing ? 1 : 0) + ' ' + tm.res + ' ' + tm.lengthSteps + '|' +
        notes.map(n => 'a ' + n.t + ' ' + n.v + ' ' + n.g).join(';');
}
export function laneAudclipVal(tm, lane, notes) {
    return tm.res + ' ' + tm.lengthSteps + ' ' + lane + '|' +
        notes.map(n => 'a ' + n.t + ' ' + n.v + ' ' + n.g).join(';');
}

/* Several lanes: tN_audclip (lane -2) and tN_lanes_import. `laneNotes` is
 * drumLaneNotes' Map(lane → notes); lanes in ascending order. */
function lanesBody(laneNotes) {
    return [...laneNotes.keys()].sort((a, b) => a - b).map(l =>
        'L' + l + (laneNotes.get(l).length ? ';' : '') +
        laneNotes.get(l).map(n => 'a ' + n.t + ' ' + n.v + ' ' + n.g).join(';')).join(';');
}
export function lanesAudclipVal(tm, laneNotes) {
    return tm.res + ' ' + tm.lengthSteps + ' -2|' + lanesBody(laneNotes);
}
export function lanesImportVal(tm, laneNotes, replacing) {
    return (replacing ? 1 : 0) + ' ' + tm.res + ' ' + tm.lengthSteps + '|' + lanesBody(laneNotes);
}

/* ---- the roll ---- */

/* Rows for the screen's note roll: melodic → one row per distinct pitch,
 * low at the bottom; drum → one row per voice. [{t, g, row}] plus rows. */
export function rollOf(p, timeIdx, key, scale) {
    const tm = timing(p, timeIdx);
    if (isPbDrumCat(p.cat)) {
        const voices = drumVoices(p);
        const idx = new Map(voices.map((v, i) => [v.pitch, i]));
        const notes = decodePhrase(p).map(n => {
            const s = scaleNote(n.t, n.g, tm.f, tm.ticks);
            return { t: s.t, g: s.g, row: idx.get(n.p), v: n.v };
        });
        return { ticks: tm.ticks, rows: voices.length, notes };
    }
    const ns = melodicNotes(p, timeIdx, key, scale);
    const pitches = [...new Set(ns.map(n => n.p))].sort((a, b) => b - a);
    const row = new Map(pitches.map((pp, i) => [pp, i]));
    return { ticks: tm.ticks, rows: pitches.length, notes: ns.map(n => ({ t: n.t, g: n.g, row: row.get(n.p), v: n.v })) };
}
