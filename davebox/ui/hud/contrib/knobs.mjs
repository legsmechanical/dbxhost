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
        /* the page's hint row too: a touched knob's footer says what a click
         * does (CLK CROP, CLK ASSIGN) — the overview's own hints cannot */
        /* the page mark the OLED's header carries ("1/2" on MIX, "2/4" on a
         * Session EQ band, a module's param pages): a page bar's own, else the
         * header's trailing n/m — the knob strip has no header of its own */
        let page;
        if (d.page && d.page.count > 1) page = (d.page.idx + 1) + '/' + d.page.count;
        else { const m = d.header && /(?:^|\s)(\d+\/\d+)\s*$/.exec(String(d.header.right || '')); if (m) page = m[1]; }
        return { screen: frame.knobsScreen || undefined, header: d.header || undefined, knobs: d.knobs, page,
                 touched: typeof d.touched === 'number' ? d.touched : -1, meta: meta || undefined,
                 hints: d.hints && d.hints.length ? d.hints : undefined,
                 /* a picker the page opened (an enum's choices): over the overview, as over the page */
                 popup: d.popup || undefined };
    },
};
