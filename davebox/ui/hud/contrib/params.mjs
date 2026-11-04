/* params.mjs — the module editor's page (sound mode's parameter pages), which
 * the host library draws, not the kit: described from the library's own view
 * model (controller.describePage, through soundParamPageModel), never from a
 * second reading of the module's metadata.
 *
 * It fills the same keys the kit describers do — header, knobs, touched, page —
 * plus `viz`: the widget groups the library resolved (envelope, filter, LFO,
 * EQ, sample, …), each with the knob slots its roles sit on. */
import { soundParamPageModel } from '../../ui_sound.mjs';

const WIDGET_KIND = { enum: 'enumsq', bignum: 'valsq', opaque: 'opaque', button: 'pill' };

function cellOf(c) {
    if (!c) return null;
    let kind = WIDGET_KIND[c.widget] || 'arc';
    const o = { kind, key: c.key, label: c.label || '', name: c.name || c.key, text: c.value == null ? '' : String(c.value) };
    if (kind === 'arc') {
        const bip = typeof c.min === 'number' && typeof c.max === 'number' && c.min < 0 && c.max > 0;
        if (bip && typeof c.normalized === 'number') { o.kind = 'arcbip'; o.signed = Math.round((c.normalized * 2 - 1) * 1000) / 1000; }
        else if (typeof c.normalized === 'number') o.norm = Math.round(c.normalized * 1000) / 1000;
    }
    if (Array.isArray(c.options) && c.options.length <= 64) { o.options = c.options.map(String); o.sel = c.enumIndex; }
    if (c.locked) o.lock = true;
    if (c.modulated) o.auto = 'mod';
    o.meta = { min: c.min, max: c.max, def: c.default, unit: c.unit || undefined };
    return o;
}

export const params = {
    key: 'body',
    collect: (frame, doc) => {
        if (!doc.where || doc.where.screen !== 'sound.params') return doc.body || null;
        const vm = soundParamPageModel();
        if (!vm) return doc.body || null;
        const body = Object.assign({}, doc.body || {});
        const cells = (vm.cells || []).slice(0, 8).map(cellOf);
        while (cells.length < 8) cells.push(null);
        body.knobs = cells;
        const t = (vm.cells || []).findIndex((c) => c && c.touched);
        body.touched = t;
        body.header = Object.assign({}, body.header || {}, { text: vm.header ? vm.header.left : '', right: vm.header ? vm.header.right : undefined });
        if (t >= 0 && vm.cells[t]) body.header.touchedName = vm.cells[t].name;
        /* groups here are page KINDS / levels — only worth showing as tabs when they name levels */
        if (vm.bank && vm.bank.count > 1) body.page = { idx: vm.bank.index, count: vm.bank.count };
        if (Array.isArray(vm.viz) && vm.viz.length)
            body.viz = vm.viz.map((g) => ({ kind: g.kind, roles: g.roles || {}, slotStart: g.slotStart | 0, slotSpan: g.slotSpan | 0 }));
        if (vm.unresolved) body.unresolved = true;
        body.primary = 'knobs';
        return body;
    },
};
