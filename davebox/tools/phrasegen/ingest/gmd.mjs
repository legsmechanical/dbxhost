/* Groove MIDI Dataset (Magenta, Google LLC) — CC BY 4.0, so its bars may ship
 * with attribution (research/SOURCES.md; the LICENSE file in the download).
 *
 * Real drummers, full kits. This cuts one instrument ROLE out of a style's
 * beat files, one bar at a time: onsets snapped to the 16th grid, velocities
 * kept exactly as played (they are the point — "velocity dynamics are key").
 * The dataset lives in cache/groove (gitignored); ingest refuses to run
 * without its LICENSE file present. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smfParse } from '../../../ui/ui_midifile.mjs';
import { makeRng } from '../lib/rng.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cache', 'groove');
export const ATTRIB = 'Groove MIDI Dataset (Magenta, Google LLC), CC BY 4.0';
/* GMD's e-kit mapping (dataset README): each role's pitches, and the one
 * pitch each is stored as. Hats keep closed / pedal / open apart (up to three
 * sounds); every other role is one sound. */
const ROLE = {
    hat:   { map: { 42: 42, 22: 42, 44: 44, 46: 46, 26: 46 }, open: [46], multi: true },
    kick:  { map: { 36: -1 } },
    snare: { map: { 38: -1, 40: -1, 37: -1 } },
    tom:   { map: { 43: -1, 58: -1, 47: -1, 45: -1, 50: -1, 48: -1 } },
    cymb:  { map: { 51: -1, 59: -1, 53: -1 } },
};
/* GMD style folder → public tag */
export const STYLE_TAG = { rock: 'ROCK', punk: 'PUNK', funk: 'FUNK', soul: 'SOUL', hiphop: 'HIPHOP',
                           pop: 'POP', 'dance/disco': 'DISCO', 'dance/breakbeat': 'BREAKS' };

/* opts: { style, count } → candidates of one bar, 16th grid, velocities as played. */
export function ingest(cat, opts) {
    if (!existsSync(join(ROOT, 'LICENSE'))) throw new Error('GMD not in cache/groove (or its LICENSE is missing)');
    const role = ROLE[cat];
    if (!role) return [];
    const { style, count } = opts;
    const rows = readFileSync(join(ROOT, 'info.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
    const files = rows.filter(r => (r[3] === style || r[3].startsWith(style + '/')) && r[5] === 'beat' && r[6] === '4-4')
        .map(r => r[7]).sort();
    const out = [], seen = new Set();
    const rng = makeRng('gmd.' + cat + '.' + style);
    for (const f of files) {
        const res = smfParse(new Uint8Array(readFileSync(join(ROOT, f))));
        if (res.error) continue;
        const notes = res.parts.flatMap(p => p.notes).filter(n => n.p in role.map);
        const lastBar = Math.floor(Math.max(0, ...notes.map(n => n.t)) / 384);
        for (let k = 0; k < 3 && out.length < count * 3; k++) {
            const b = 1 + Math.floor(rng.next() * Math.max(1, lastBar - 2));
            const inBar = notes.filter(n => n.t >= b * 384 - 12 && n.t < (b + 1) * 384 - 12);
            const bySlot = new Map();
            for (const n of inBar) {
                const slot = Math.max(0, Math.min(15, Math.round((n.t - b * 384) / 24)));
                const p = role.map[n.p];
                const key = slot * 128 + (p < 0 ? 0 : p);
                const prev = bySlot.get(key);
                if (!prev || n.v > prev.v)
                    bySlot.set(key, Object.assign({ t: slot * 24, v: n.v, g: role.open && role.open.includes(p) ? 26 : 6 }, p >= 0 ? { p } : {}));
            }
            const hits = [...bySlot.values()].sort((a, c) => a.t - c.t || (a.p || 0) - (c.p || 0));
            if (hits.length < 4) continue;
            const fp = hits.map(h => h.t + ':' + (h.p || 0) + ':' + Math.round(h.v / 16)).join(',');
            if (seen.has(fp)) continue;
            seen.add(fp);
            out.push({ notes: hits, src: 'lib:gmd:' + f + ':' + b });
        }
    }
    const step = Math.max(1, Math.floor(out.length / count));
    return out.filter((_, i) => i % step === 0).slice(0, count).map(o => {
        const sounds = [...new Set(o.notes.map(n => n.p).filter(p => p != null))];
        const notes = sounds.length > 1 ? o.notes : o.notes.map(n => { const c = Object.assign({}, n); delete c.p; return c; });
        const hits = new Map(); for (const n of notes) if (n.p != null) hits.set(n.p, (hits.get(n.p) || 0) + 1);
        return { notes, g: STYLE_TAG[style] || '', bars: 1, desc: 'LIVE',
                 pads: sounds.length > 1 ? [...hits.keys()].sort((a, b) => hits.get(b) - hits.get(a) || a - b) : null,
                 src: o.src, lic: 'CC-BY-4.0', attrib: ATTRIB };
    });
}
