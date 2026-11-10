/* layer.mjs — turn one recorded layer (the primitive calls of a frame's body,
 * or of its overlay) into its description: header, knobs, list, prompt, …
 *
 * One DESCRIBER per primitive kind, each a tiny function that folds its call
 * into the layer's description. Adding a primitive = adding one entry here;
 * nothing else changes. The LAST call of a kind wins where a screen draws a
 * thing twice (a bank page drawing its cells, then an overlay of them). */

const MAX_OPTIONS = 64;
const MAX_ROWS = 48;
const r3 = (x) => Math.round(x * 1000) / 1000;   /* a fill needs no more, and the document stays small */

/* A knob cell as the browser needs it — the descriptor's data fields only
 * (ui_movy.mjs's cell descriptor), never its callbacks or animation state. */
export function cellOut(c) {
    if (!c) return null;
    const o = { kind: c.kind || 'blank', label: c.label || '', text: c.text == null ? '' : String(c.text) };
    if (c.name) o.name = c.name;
    if (typeof c.norm === 'number') o.norm = r3(c.norm);
    if (typeof c.signed === 'number') o.signed = r3(c.signed);
    if (Array.isArray(c.options) && c.options.length <= MAX_OPTIONS) { o.options = c.options.map(String); o.sel = c.sel == null ? -1 : c.sel; }
    if (c.auto) o.auto = c.auto;
    if (c.lock) o.lock = true;
    if (c.opens) o.opens = true;
    if (c.sq) o.sq = c.sq;
    if (c.ghost != null) o.ghost = c.ghost;
    if (c.meta) o.meta = c.meta;
    if (c.key) o.key = c.key;
    return o;
}
const span = (s) => s ? { start: s.start | 0, count: s.count == null ? null : s.count | 0 } : undefined;
const rowOut = (r) => typeof r === 'string' ? { label: r } : r ? {
    label: r.label == null ? '' : String(r.label),
    value: r.value == null ? undefined : String(r.value),
    qual: r.qual || undefined, mark: r.mark || undefined,
    chevron: r.chevron ? true : undefined, editing: r.editing ? true : undefined, hdr: r.hdr ? true : undefined,
    divider: r.divider ? true : undefined,
    /* a NOTE row: centred, not a choice (a Move instrument another track plays) */
    note: r.note != null ? String(r.note) : undefined,
} : { label: '' };
/* A list as the browser needs it: a WINDOW of rows around the selection
 * (`first` is the window's offset, `total` the whole length; the page scrolls
 * by them). Never the whole list — a document over the host's 16 KB is
 * refused, and the Screen view would stay on the last screen it got. */
export const listOut = (rows, sel, kind) => ({
    kind, total: rows ? rows.length : 0, sel: sel == null ? -1 : sel,
    rows: (rows || []).slice(Math.max(0, (sel | 0) - MAX_ROWS / 2), Math.max(0, (sel | 0) - MAX_ROWS / 2) + MAX_ROWS).map(rowOut),
    first: Math.max(0, (sel | 0) - MAX_ROWS / 2),
});

export const DESCRIBE = {
    KitHeader:        (d, p) => { d.header = Object.assign(d.header || {}, { text: p.text, invert: p.invert || undefined, wordmark: p.wordmark || undefined }); },
    KitMarkHeader:    (d, p) => { d.header = Object.assign(d.header || {}, { text: p.text }); },
    KitBankHeader:    (d, p) => { d.header = Object.assign(d.header || {}, { text: p.name, glyph: p.glyph || undefined, right: p.right || undefined }); },
    KitTouchedHeader: (d, p) => { d.header = Object.assign(d.header || {}, { touchedName: p.name }); },
    KitHeaderParamPages: (d, p) => { d.header = Object.assign(d.header || {}, { text: p.left, right: p.right || undefined }); },
    KitPageBar:       (d, p) => { d.page = { idx: p.idx, count: p.count, groups: p.groups || undefined }; },
    KitCrumbs:        (d, p) => { d.crumbs = (p.parts || []).map(String); },
    KitCells:         (d, p) => {
        d.knobs = (p.cells || []).slice(0, 8).map(cellOut);
        while (d.knobs.length < 8) d.knobs.push(null);
        d.touched = p.touched == null ? -1 : p.touched;
        const sp = {};
        if (p.env) sp.env = span(p.env);
        if (p.filt) sp.filt = span(p.filt);
        if (p.eq) sp.eq = span(p.eq);
        if (p.samp) sp.samp = span(p.samp);
        if (Object.keys(sp).length) d.spans = sp;
    },
    KitBankPage:      (d, p) => { if (!d.knobs) DESCRIBE.KitCells(d, { cells: p.cells, touched: p.opts && p.opts.touched }); },
    KitEnumOverlay:   (d, p) => { const c = p.cells && p.cells[p.touched]; if (c) d.overlay = { kind: 'enum', knob: p.touched, options: (c.options || []).map(String), sel: c.sel }; },
    KitValueOverlay:  (d, p) => { const c = p.cells && p.cells[p.idx]; if (c) d.overlay = { kind: 'value', knob: p.idx, cell: cellOut(c) }; },
    /* an enum's choices, the bank picker: a list, in the card it pops up in */
    KitListOverlay:   (d, p) => { d.list = listOut((p.options || []).map(String), p.sel, 'list'); },
    KitList:          (d, p) => { d.list = listOut(p.rows, p.sel, 'list'); },
    KitStackedList:   (d, p) => { d.list = Object.assign(listOut(p.rows, p.sel, 'stacked'), { depth: p.depth }); },
    KitSectionPicker: (d, p) => { d.list = listOut((p.sections || []).map((x) => typeof x === 'string' ? x : (x && (x.label || x.name)) || ''), p.active, 'sections'); },
    KitBankMap:       (d, p) => { d.bankMap = { cols: p.cols, cur: p.cur, joins: p.joins || undefined }; },
    KitPrompt:        (d, p) => { d.prompt = Object.assign(d.prompt || {}, { title: p.title, lines: (p.lines || []).map(String) }); if (p.hints) d.hints = p.hints.filter(Boolean); },
    PromptLines:      (d, p) => { d.prompt = Object.assign(d.prompt || {}, { lines: (p.lines || []).filter((l) => l != null && l !== '').map(String) }); },
    Buttons:          (d, p) => { d.prompt = Object.assign(d.prompt || {}, { buttons: p.labels.map(String), sel: p.sel }); },
    KitHintRow:       (d, p) => { d.hints = (p.hints || []).filter(Boolean).map((h) => [String(h[0]), String(h[1] == null ? '' : h[1])]); },
    KitBigValue:      (d, p) => { d.big = { text: String(p.num), unit: p.unit || undefined, prev: p.prev || undefined, next: p.next || undefined }; },
    LevelCard:        (d, p) => { d.big = { text: String(p.text), frac: typeof p.frac === 'number' ? r3(p.frac) : undefined }; },
    HudCard:          (d, p) => { d.card = { title: p.title, value: p.value == null ? '' : String(p.value) }; },
    NoticeCard:       (d, p) => { d.notice = { lines: (p.lines || []).map(String), highlight: p.highlight == null ? -1 : p.highlight | 0 }; },
    KitChip:          (d, p) => { (d.chips = d.chips || []).push({ label: String(p.label), on: !!p.on }); },
    /* the overview family's hand-drawn parts (ui_render.mjs) */
    Info:             (d, p) => { d.info = Object.assign(d.info || {}, { left: p.left || '', underline: p.underline || undefined, held: p.held || undefined, tag: p.tag || undefined }); },
    Info2:            (d, p) => { d.info = Object.assign(d.info || {}, { right: p.right || '', arrows: p.arrows || undefined, follow: p.follow || undefined }); },
    Tracks:           (d, p) => { d.tracks = p.rows; },
    Picture:          (d, p) => { d.picture = { kind: p.kind || 'image', caption: p.caption || undefined, sub: p.sub || undefined, knobs: p.knobs === 'live' || p.knobs === 'shown' ? p.knobs : undefined }; },
    NoteBox:          (d, p) => { d.noteBox = { name: String(p.name || ''), sub: p.sub == null ? '' : String(p.sub), hi: !!p.hi }; },
    Mods:             (d, p) => { d.mods = { names: (p.names || []).map(String), popup: p.popup ? String(p.popup) : undefined }; },
    StepStrip:        (d, p) => { d.stepStrip = { len: p.len | 0, on: (p.on || []).join('') }; },
    Wave:             (d, p) => { d.wave = p; },
    Curve:            (d, p) => { d.curve = p; },
    /* the AUTOMATION screen's lanes, for the Screen view (ui_automation_bank hudLanesTap) */
    Lanes:            (d, p) => { d.lanes = p; },
    Keyboard:         (d, p) => { if (p) d.keyboard = p; },
    Lfo:              (d, p) => { d.lfo = { shape: String(p.shape), bipolar: !!p.bipolar, phase: +p.phase || 0, retrigger: !!p.retrigger, cycles: p.cycles | 0 }; },
    Readout:          (d, p) => { (d.readouts = d.readouts || []).push({ text: String(p.text), on: p.on || undefined, pos: p.pos || 'left' }); },
    Message:          (d, p) => { d.message = { big: p.big || '', lines: (p.lines || []).map(String), wordmark: p.wordmark || undefined }; },
    Bars:             (d, p) => { d.bars = { values: p.values, len: p.len, touched: p.touched, mode: p.mode, min: p.min, max: p.max }; },
    Position:         (d, p) => { d.position = { pages: p.pages, view: p.view, play: p.play, step: p.step, len: p.len, left: p.left || undefined, right: p.right || undefined }; },
};

/* A layer's recorded calls → its description, or null when nothing of it was
 * described. A kind with no describer is counted, so a primitive added to the
 * kit without one shows up instead of vanishing. */
/* Which part of a screen is its MAIN content when it drew more than one (a
 * MIDI import list over a bank page it also drew): the one drawn LAST, as on
 * the OLED, where the later drawing is the one on top. */
const FAMILY = {
    KitCells: 'knobs', KitBankPage: 'knobs', KitList: 'list', KitStackedList: 'list', KitSectionPicker: 'list',
    KitPrompt: 'prompt', PromptLines: 'prompt', Buttons: 'prompt', Tracks: 'tracks', Bars: 'bars', KitBankMap: 'bankmap',
    KitListOverlay: 'list', Lanes: 'lanes',
    Mods: 'mods', Wave: 'wave', Keyboard: 'keyboard', Message: 'message', Picture: 'picture', KitBigValue: 'big', LevelCard: 'big', HudCard: 'card', NoticeCard: 'notice',
};
/* A POP-UP is drawn over a page the OLED keeps visible behind it (Josh,
 * 2026-11-09: "if something presents as a pop-up or overlay on the oled, it
 * should generally present as such on the virtual screen"): a picker over its
 * dimmed page, a level card punched into whatever is up. Once a page has been
 * drawn, a pop-up kind — or a `Backdrop`, the dimming a picker draws first —
 * starts the layer's `popup`: what follows is described into it, and the page
 * stays the screen. The screen's chrome (header, crumbs, footer) stays the
 * page's wherever it was drawn: it frames the screen, not the box. */
const POPUP = new Set(['Backdrop', 'KitListOverlay', 'LevelCard', 'HudCard', 'NoticeCard']);
const CHROME = new Set(['KitHeader', 'KitMarkHeader', 'KitBankHeader', 'KitTouchedHeader', 'KitHeaderParamPages',
                        'KitCrumbs', 'KitHintRow', 'KitPageBar']);
export function describeLayer(calls) {
    if (!calls || !calls.length) return null;
    const d = {};
    let pop = null;
    for (const [kind, p] of calls) {
        if (!pop && POPUP.has(kind) && d.primary) pop = {};
        if (kind === 'Backdrop') continue;
        const t = pop && !CHROME.has(kind) ? pop : d;
        const fn = DESCRIBE[kind];
        if (fn) fn(t, p || {});
        else (t.undescribed = t.undescribed || []).push(kind);
        if (FAMILY[kind]) t.primary = FAMILY[kind];
    }
    if (pop && Object.keys(pop).length) d.popup = pop;
    return Object.keys(d).length ? d : null;
}
