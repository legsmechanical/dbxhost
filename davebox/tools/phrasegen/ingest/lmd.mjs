/* Lakh MIDI Dataset (Colin Raffel, 2016), LMD-matched — CC BY 4.0. Drum
 * lanes only: research/lmd/analysis/out/ingest_candidates.json lists loops
 * that repeat for several bars with real velocity movement; each row gives
 * the loop's hit pattern per bar ("x...x.o." on 16ths, o = open hat) and the
 * velocities of its hits. Song names stay in the research; none ship. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'research', 'lmd', 'analysis', 'out', 'ingest_candidates.json');
export const ATTRIB = 'Lakh MIDI Dataset (Colin Raffel, 2016), CC BY 4.0';
const TAG = { newwave: 'NEW WAVE', postpunk: 'POST PUNK', synthpop: 'SYNTHPOP', italo: 'ITALO', ebm: 'EBM' };
const LANE_CAT = { kick: 'kick', snare: 'snare', hat: 'hat', perc: 'perc', cymb: 'cymb', tom: 'tom' };

export function ingest(cat, opts) {
    const o = opts || {};
    const rows = JSON.parse(readFileSync(FILE, 'utf8')).filter(r => LANE_CAT[r.lane] === cat)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const out = [];
    for (const r of rows) {
        if (o.count && out.length >= o.count) break;
        const notes = [];
        r.bars.forEach(([pat, vels], b) => {
            let k = 0;
            for (let s = 0; s < pat.length && s < 16; s++) {
                const c = pat[s];
                if (c === '.') continue;
                const v = Math.max(1, Math.min(127, vels[k++] ?? 100));
                const open = c === 'o';
                const n = { t: b * 384 + s * 24, v, g: open ? 26 : 6 };
                if (cat === 'hat') n.p = open ? 46 : 42;
                notes.push(n);
            }
        });
        if (notes.length < 3) continue;
        const multi = cat === 'hat' && notes.some(n => n.p === 46);
        if (cat === 'hat' && !multi) notes.forEach(n => { delete n.p; });
        out.push({ notes, g: TAG[r.genre] || '', bars: r.bars.length,
                   pads: multi ? [42, 46] : null, src: 'lib:lmd:' + r.md5 + ':' + r.start_bar,
                   lic: 'CC-BY-4.0', attrib: ATTRIB });
    }
    return out;
}
