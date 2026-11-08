/* knobmeta.mjs — what the OLED cannot fit about each knob of a Track View bank:
 * its full name, range, default and scope (track / clip / action), from the
 * BANKS table. Attached only where the cell IS that table's knob (its label
 * is the entry's abbreviation): a page that swaps a knob for an alternate
 * (Shift layers, drum layouts) keeps the swapped cell un-annotated rather
 * than lying about it. The value shown is still the cell's own text.
 *
 * Also marks whether a knob sits at its default — the Screen view's "set" dot. */
import { S } from '../../ui_state.mjs';
import { BANKS } from '../../ui_constants.mjs';
/* the annotation for a Track View bank page's eight cells, or null */
export function knobMetaFor(knobs, where) {
    if (!knobs || !where) return null;
    const bank = BANKS[where.bank];
    if (!bank || !bank.knobs) return null;
    const t = where.track, vals = (S.bankParams[t] && S.bankParams[t][where.bank]) || [];
    let any = false;
    const out = knobs.map((cell, k) => {
        const e = bank.knobs[k];
        if (!cell || !e || !e.abbrev || e.scope === 'stub' || e.scope === 'action' || cell.label !== e.abbrev) return null;
        any = true;
        const v = vals[k];
        return { full: e.full, min: e.min, max: e.max, def: e.def, scope: e.scope,
                 isDefault: typeof v === 'number' ? v === e.def : undefined };
    });
    return any ? out : null;
}
export const knobmeta = {
    key: 'knobMeta',
    collect: (frame, doc) => {
        const b = doc && doc.body;
        if (!b || !b.knobs || !doc.where || doc.where.screen !== 'track.bank') return null;
        return knobMetaFor(b.knobs, doc.where);
    },
};
