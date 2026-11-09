/* knobs.mjs — what the knobs do on a Track / Session view screen whose knob
 * page the OLED is not showing (ui_render.mjs hudDescribeKnobs records it into
 * the frame's knobs layer, display muted). Only a page of knob cells counts:
 * a card with no knobs on it (the Sound gateway, STEP with nothing held)
 * leaves the overview without a strip, as the knobs do nothing there. */
import { describeLayer } from './layer.mjs';
import { knobMetaFor } from './knobmeta.mjs';
export const knobs = {
    key: 'knobs',
    collect: (frame, doc) => {
        if (!frame.knobs || !frame.knobs.length) return null;
        const d = describeLayer(frame.knobs);
        if (!d.knobs || !d.knobs.some((c) => c && c.kind !== 'blank')) return null;
        /* a bank page's range / default / scope, as knobmeta gives a drawn one */
        const meta = frame.knobsScreen === 'track.bank' ? knobMetaFor(d.knobs, doc && doc.where) : null;
        return { screen: frame.knobsScreen || undefined, header: d.header || undefined, knobs: d.knobs,
                 touched: typeof d.touched === 'number' ? d.touched : -1, meta: meta || undefined };
    },
};
