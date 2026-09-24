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
                           jazz: 'JAZZ', 'jazz/swing': 'SWING', latin: 'LATIN', 'latin/brazilian-samba': 'SAMBA',
                           afrobeat: 'AFROBEAT', neworleans: 'NEW ORLEANS', blues: 'BLUES',
                           pop: 'POP', 'dance/disco': 'DISCO', 'dance/breakbeat': 'BREAKS' };

/* A whole kit, each instrument at one General MIDI pitch (GMD's e-kit notes
 * folded): kick 36, snare 38, rim 37, clap 39, hats 42 / 44 / 46, toms 43 / 45
 * / 48, crash 49, ride 51. */
const KIT = { 36: 36, 38: 38, 40: 38, 37: 37, 39: 39, 42: 42, 22: 42, 44: 44, 46: 46, 26: 46,
              43: 43, 58: 43, 47: 45, 45: 45, 50: 48, 48: 48, 49: 49, 55: 49, 57: 49, 52: 49, 51: 51, 59: 51, 53: 51 };
/* One bar of the whole kit as the drummer played it — timing kept (rounded to
 * the clip's tick), not snapped, so swing and shuffle survive; the rarest
 * sounds dropped past `max`. */
function beatBars(style, count, max) {
    const rows = readFileSync(join(ROOT, 'info.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
    const files = rows.filter(r => (r[3] === style || r[3].startsWith(style + '/')) && r[5] === 'beat' && r[6] === '4-4')
        .map(r => r[7]).sort();
    const out = [], seen = new Set(), rng = makeRng('gmd.beat.' + style);
    for (const f of files) {
        const res = smfParse(new Uint8Array(readFileSync(join(ROOT, f))));
        if (res.error) continue;
        const notes = res.parts.flatMap(p => p.notes).filter(n => n.p in KIT);
        const lastBar = Math.floor(Math.max(0, ...notes.map(n => n.t)) / 384);
        for (let k = 0; k < 3 && out.length < count * 3; k++) {
            const b = 1 + Math.floor(rng.next() * Math.max(1, lastBar - 2));
            const inBar = notes.filter(n => n.t >= b * 384 - 8 && n.t < (b + 1) * 384 - 8);
            const hits = [];
            for (const n of inBar) {
                const p = KIT[n.p], t = Math.max(0, Math.min(383, n.t - b * 384));
                const dup = hits.find(h => h.p === p && Math.abs(h.t - t) < 6);
                if (dup) { if (n.v > dup.v) dup.v = n.v; continue; }
                hits.push({ t, v: n.v, g: p === 46 ? 26 : 6, p });
            }
            const count_ = new Map(); for (const h of hits) count_.set(h.p, (count_.get(h.p) || 0) + 1);
            const keep = new Set([...count_.keys()].sort((a, c) => count_.get(c) - count_.get(a)).slice(0, max));
            const kit = hits.filter(h => keep.has(h.p)).sort((a, c) => a.t - c.t || a.p - c.p);
            if (kit.length < 6) continue;
            const fp = kit.map(h => Math.round(h.t / 12) + ':' + h.p).join(',');
            if (seen.has(fp)) continue;
            seen.add(fp);
            out.push({ notes: kit, src: 'lib:gmd:' + f + ':' + b,
                       pads: [...count_.keys()].filter(p => keep.has(p)).sort((a, c) => count_.get(c) - count_.get(a) || a - c) });
        }
    }
    const step = Math.max(1, Math.floor(out.length / count));
    return out.filter((_, i) => i % step === 0).slice(0, count);
}

/* opts: { style, count } → candidates of one bar, 16th grid, velocities as played. */
export function ingest(cat, opts) {
    if (cat === 'beat') {
        if (!existsSync(join(ROOT, 'LICENSE'))) throw new Error('GMD not in cache/groove (or its LICENSE is missing)');
        return beatBars(opts.style, opts.count, 8).map(o => ({ notes: o.notes, g: STYLE_TAG[opts.style] || '', bars: 1,
            desc: 'LIVE', pads: o.pads, src: o.src, lic: 'CC-BY-4.0', attrib: ATTRIB }));
    }
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
