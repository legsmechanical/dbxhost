/* priors — what a style is known to do, from the style-hallmark research
 * (<private>/research/hallmarks/<slug>.json: musicology, producer and
 * drummer guides, open corpora). Used where the measured MIDI is silent or
 * misleading: most of it was typed in on a grid, so it understates swing.
 *
 * This is the one file that knows the hallmark field names; the rest of the
 * generator sees hallmarkFeel()'s normalised shape:
 *   { swing: { share, type8, ratio[q] } | null, quantisation, ghosts: {role: share},
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
    boombap: { swing: { share: 0.7, type8: 0, ratio: [0.56, 0.6, 0.64] }, quantisation: 'human' },
    lofi: { swing: { share: 0.7, type8: 0, ratio: [0.56, 0.61, 0.66] }, quantisation: 'human' },
    garage: { swing: { share: 0.75, type8: 0, ratio: [0.57, 0.62, 0.66] }, quantisation: null },
    dnb: { swing: { share: 0.1, type8: 0, ratio: [0.54, 0.56, 0.58] }, quantisation: null },
    jungle: { swing: { share: 0.15, type8: 0, ratio: [0.54, 0.57, 0.6] }, quantisation: 'human' },
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
const SHARE_OF = { high: 0.85, medium: 0.6, low: 0.4 };
function normalise(h) {
    const m = h.meter || {}, s = m.swing || {}, conf = (h.confidence && (h.confidence.meter || h.confidence.overall)) || 'low';
    const feel = String(m.feel || '').toLowerCase();
    const ratio = Array.isArray(s.ratio) && s.ratio.length === 3 ? s.ratio : null;
    let swing = null;
    if (/straight/.test(feel) && !(ratio && ratio[1] >= 0.54)) swing = { share: 0, type8: null, ratio: null };
    else if (/swing|shuffle|swung/.test(feel) || (ratio && ratio[1] >= 0.54)) {
        const sub = String(s.subdivision || '').toLowerCase();
        swing = { share: typeof s.share === 'number' ? s.share : (/mixed|some|often/.test(feel) ? SHARE_OF[conf] * 0.6 : SHARE_OF[conf] || 0.4),
                  type8: /16/.test(sub) ? 0 : /8/.test(sub) || /shuffle/.test(feel) ? 1 : null, ratio };
    }
    const q = String(m.quantisation || '').toLowerCase();
    const quantisation = /machine|tight|quantis/.test(q) ? 'machine-tight' : /loose|human|live|played/.test(q) ? 'human' : null;
    const ghosts = {};
    const gn = h.drums && h.drums.ghost_share;
    if (gn && typeof gn === 'object') for (const [r, v] of Object.entries(gn)) if (typeof v === 'number') ghosts[r] = v;
    return { swing, quantisation, ghosts, confidence: conf };
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
