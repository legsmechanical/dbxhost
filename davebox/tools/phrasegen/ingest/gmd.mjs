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
/* GMD's e-kit mapping (dataset README): pitches per role, and which are "open". */
const ROLE = {
    hat:   { pitches: [42, 22, 44, 46, 26], open: [46, 26] },
    kick:  { pitches: [36] },
    snare: { pitches: [38, 40, 37] },
    tom:   { pitches: [43, 58, 47, 45, 50, 48] },
};

export function ingestGmd(cat, style, count, tag, namePrefix) {
    if (!existsSync(join(ROOT, 'LICENSE'))) throw new Error('GMD not in cache/groove (or its LICENSE is missing)');
    const role = ROLE[cat];
    if (!role) return [];
    const rows = readFileSync(join(ROOT, 'info.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
    const files = rows.filter(r => r[3].startsWith(style + '/') && r[5] === 'beat' && r[6] === '4-4').map(r => r[7]).sort();
    const out = [], seen = new Set();
    const rng = makeRng('gmd.' + cat + '.' + style);
    for (const f of files) {
        const res = smfParse(new Uint8Array(readFileSync(join(ROOT, f))));
        if (res.error) continue;
        const notes = res.parts.flatMap(p => p.notes).filter(n => role.pitches.includes(n.p));
        const lastBar = Math.floor(Math.max(0, ...notes.map(n => n.t)) / 384);
        /* a few bars from the body of each file, never the first */
        for (let k = 0; k < 3 && out.length < count * 3; k++) {
            const b = 1 + Math.floor(rng.next() * Math.max(1, lastBar - 2));
            const inBar = notes.filter(n => n.t >= b * 384 - 12 && n.t < (b + 1) * 384 - 12);
            const bySlot = new Map();
            for (const n of inBar) {
                const slot = Math.max(0, Math.min(15, Math.round((n.t - b * 384) / 24)));
                const prev = bySlot.get(slot);
                if (!prev || n.v > prev.v) bySlot.set(slot, { t: slot * 24, v: n.v, g: role.open && role.open.includes(n.p) ? 26 : 6 });
            }
            const hits = [...bySlot.values()].sort((a, c) => a.t - c.t);
            if (hits.length < 5) continue;
            const fp = hits.map(h => h.t + ':' + Math.round(h.v / 16)).join(',');
            if (seen.has(fp)) continue;
            seen.add(fp);
            out.push({ notes: hits, src: 'lib:gmd:' + f + ':' + b });
        }
    }
    /* spread the picks across the files rather than the first few */
    const step = Math.max(1, Math.floor(out.length / count));
    return out.filter((_, i) => i % step === 0).slice(0, count).map((o, i) => ({
        id: cat + '.' + tag.toLowerCase() + '-live.' + String(i + 1).padStart(3, '0'),
        name: namePrefix + ' ' + (i + 1), g: tag, bars: 1, feel: 'straight', notes: o.notes,
        src: o.src, lic: 'CC-BY-4.0', attrib: ATTRIB,
    }));
}
