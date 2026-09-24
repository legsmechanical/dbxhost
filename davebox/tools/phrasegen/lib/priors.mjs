/* priors — what a style is known to do, from the style-hallmark research
 * (<private>/research/hallmarks/<slug>.json: musicology, producer and
 * drummer guides, open corpora). Used where the measured MIDI is silent or
 * misleading: most of it was typed in on a grid, so it understates swing.
 *
 * This is the one file that knows the hallmark field names; the rest of the
 * generator sees hallmarkFeel()'s normalised shape:
 *   { swing: { dist[q1, med, q3] (per-phrase ratio, straight included), type8 } | null,
 *     quantisation: 'machine-tight' | 'human' | null, ghosts: {role: share},
 *     confidence: 'high'|'medium'|'low', measureUntrusted }
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVATE_DIR } from './paths.mjs';

/* Styles whose measured swing failed its known-positive check
 * (research/refs/beats/groove/README.md): the prior wins outright. */
export const MEASURE_UNTRUSTED = new Set(['boombap', 'garage', 'dnb', 'jungle', 'lofi']);

/* Until the hallmark files exist: the failed rows' known feels (reasoned from
 * research/drums/hiphop.md and garage.md — MPC 16th swing ~57–64 %, 2-step
 * garage's swung 16ths; DnB near straight). Superseded by a hallmark file. */
const INTERIM = {
    boombap: { swing: { dist: [0.54, 0.6, 0.64], type8: 0 }, quantisation: 'human' },
    lofi: { swing: { dist: [0.55, 0.61, 0.66], type8: 0 }, quantisation: 'human' },
    garage: { swing: { dist: [0.57, 0.62, 0.66], type8: 0 }, quantisation: null },
    dnb: { swing: { dist: [0.5, 0.5, 0.56], type8: 0 }, quantisation: null },
    jungle: { swing: { dist: [0.5, 0.52, 0.58], type8: 0 }, quantisation: 'human' },
};

const cache = new Map();
function loadHallmark(slug) {
    if (!slug || !PRIVATE_DIR) return null;
    if (!cache.has(slug)) {
        const f = join(PRIVATE_DIR, 'research', 'hallmarks', slug + '.json');
        let doc = null;
        try { doc = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (e) { doc = null; }
        cache.set(slug, doc);
    }
    return cache.get(slug);
}
/* The prior's swing as a DISTRIBUTION of per-phrase ratios (its quartiles,
 * straight ones included): a style's groove is a range, and the share of
 * phrases that swing at all follows from where 0.54 falls in it. */
function normalise(h) {
    const m = h.meter || {}, s = m.swing || {}, conf = (h.confidence && (h.confidence.meter || h.confidence.overall)) || 'low';
    const dist = Array.isArray(s.ratio) && s.ratio.length === 3 && s.ratio.every(x => typeof x === 'number') ? s.ratio : null;
    const sub = String(s.subdivision || '').toLowerCase();
    const swing = dist ? { dist, type8: /16/.test(sub) ? 0 : /8/.test(sub) ? 1 : null } : null;
    const q = String(m.quantisation || '').toLowerCase();
    const quantisation = /unquantis|never grid|loose|human|live|played/.test(q) ? 'human'
        : /machine|grid-tight|sequencer|quantis|programmed|tight/.test(q) ? 'machine-tight' : null;
    return { swing, quantisation, ghosts: {}, confidence: conf };
}
export function hallmarkFeel(file, flavour) {
    const slugs = flavour ? [flavour] : [file];
    for (const slug of slugs) {
        const h = loadHallmark(slug);
        if (h) return Object.assign(normalise(h), { measureUntrusted: MEASURE_UNTRUSTED.has(slug) });
        if (INTERIM[slug]) return Object.assign({ ghosts: {}, confidence: 'high', measureUntrusted: MEASURE_UNTRUSTED.has(slug) }, INTERIM[slug]);
    }
    return null;
}
