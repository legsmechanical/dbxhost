/* Lakh MIDI Dataset (Colin Raffel, 2016), LMD-matched — CC BY 4.0. Drum
 * lanes only: research/lmd/analysis/out/ingest_candidates.json lists loops
 * that repeat for several bars with real velocity movement; each row gives
 * the loop's hit pattern per bar ("x...x.o." on 16ths, o = open hat) and the
 * velocities of its hits. Song names stay in the research; none ship. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { smfParse } from '../../../ui/ui_midifile.mjs';

/* The LMD-matched files (downloaded for the research; not in the repo). The
 * loops are re-read from them so the drummer's (or programmer's) timing and
 * swing survive — the research pattern strings are on a straight grid. */
const LMD_DIR = process.env.PHRASEGEN_LMD_DIR || join(homedir(), 'phrasegen-cache', 'lmd', 'lmd_matched');
const LANE_PITCH = { kick: [35, 36], snare: [37, 38, 39, 40], hat: [42, 44, 46, 22, 26], perc: [39, 54, 56, 58, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 73, 74, 75, 76, 77, 78, 79, 80, 81],
                     cymb: [49, 51, 52, 53, 55, 57, 59], tom: [41, 43, 45, 47, 48, 50] };
const HAT_P = { 42: 42, 22: 42, 44: 44, 46: 46, 26: 46 };

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'research', 'lmd', 'analysis', 'out', 'ingest_candidates.json');
export const ATTRIB = 'Lakh MIDI Dataset (Colin Raffel, 2016), CC BY 4.0';
const TAG = { newwave: 'NEW WAVE', postpunk: 'POST PUNK', synthpop: 'SYNTHPOP', italo: 'ITALO', ebm: 'EBM' };
const LANE_CAT = { kick: 'kick', snare: 'snare', hat: 'hat', perc: 'perc', cymb: 'cymb', tom: 'tom' };

export function ingest(cat, opts) {
    const o = opts || {};
    if (!existsSync(LMD_DIR) && process.env.PHRASEGEN_ALLOW_MISSING !== '1')
        throw new Error('LMD files not found at ' + LMD_DIR + ' (set PHRASEGEN_LMD_DIR, or PHRASEGEN_ALLOW_MISSING=1)');
    const rows = JSON.parse(readFileSync(FILE, 'utf8')).filter(r => LANE_CAT[r.lane] === cat)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const out = [];
    let mismatched = 0;
    for (const r of rows) {
        if (o.count && out.length >= o.count) break;
        const t = r.tid;
        const f = join(LMD_DIR, t[2], t[3], t[4], t, r.md5 + '.mid');
        if (!existsSync(f)) { mismatched++; continue; }
        const res = smfParse(new Uint8Array(readFileSync(f)));
        if (res.error) { mismatched++; continue; }
        const pitches = new Set(LANE_PITCH[r.lane] || []);
        const bars = r.bars.length, from = r.start_bar * 384, to = from + bars * 384;
        const drums = res.parts.filter(p => p.drum || p.channel === 9);
        const src = (drums.length ? drums : res.parts).flatMap(p => p.notes);
        const notes = [];
        for (const n of src) {
            if (!pitches.has(n.p) || n.t < from - 8 || n.t >= to - 8) continue;
            const tt = Math.max(0, n.t - from);
            const note = { t: tt, v: Math.max(1, Math.min(127, n.v)), g: 6 };
            if (cat === 'hat') { note.p = HAT_P[n.p] || 42; if (note.p === 46) note.g = 26; }
            const dup = notes.find(x => (x.p ?? 0) === (note.p ?? 0) && Math.abs(x.t - tt) < 6);
            if (dup) { if (note.v > dup.v) dup.v = note.v; continue; }
            notes.push(note);
        }
        notes.sort((a, b) => a.t - b.t);
        /* the file's bars must be the loop the research found: same hits on
         * the 16th grid (their exact timing is what we keep) */
        const grid = new Set(notes.map(n => Math.round(n.t / 24)));
        let want = 0, hit = 0;
        r.bars.forEach(([pat], b) => { for (let s = 0; s < 16; s++) if (pat[s] !== '.') { want++; if (grid.has(b * 16 + s)) hit++; } });
        if (!want || hit / want < 0.9 || notes.length > want * 1.5) { mismatched++; continue; }
        const multi = cat === 'hat' && notes.some(n => n.p !== 42) && new Set(notes.map(n => n.p)).size > 1;
        if (cat === 'hat' && !multi) notes.forEach(n => { delete n.p; });
        out.push({ notes, g: TAG[r.genre] || '', bars,
                   pads: multi ? [...new Set(notes.map(n => n.p))] : null, src: 'lib:lmd:' + r.md5 + ':' + r.start_bar,
                   lic: 'CC-BY-4.0', attrib: ATTRIB });
    }
    if (mismatched) console.log(`  lmd ${cat}: ${mismatched} loops skipped (file missing, or its bars did not match the research's loop)`);
    return out;
}
