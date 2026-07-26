/* Off-device smoke test for the pure layers (discovery -> descriptors -> render
 * cells). Stubs the engine globals, so it needs no Move and no shadow_ui.
 *
 *   node lab/test/discover.test.mjs
 *
 * This is the first-line check the module-hosting pipeline gets. It cannot
 * catch host-integration bugs (param round-trips, timing, LEDs) — those still
 * need the device.
 */

/* ---- stub engine ------------------------------------------------------- */

const FIXTURES = {};

globalThis.shadow_get_param = (slot, key) => {
    const store = FIXTURES[slot];
    if (!store) return null;
    return store[key] !== undefined ? store[key] : null;
};
globalThis.shadow_set_param = (slot, key, val) => {
    FIXTURES[slot] = FIXTURES[slot] || {};
    FIXTURES[slot][key] = String(val);
    return true;
};
globalThis.shadow_get_slots = () => [];
globalThis.shadow_get_ui_slot = () => 0;
globalThis.host_read_file = () => null;
globalThis.os = { readdir: () => [[], 0] };

const { discover, shortLabel, deriveSections, activeSection } =
    await import('../ui_discover.mjs');
const { toRenderCell, parseValue, stepValue, commitString, formatValue } =
    await import('../ui_cells.mjs');

/* ---- tiny assert harness ---- */

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; }
    else { fail++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}
function ok(cond, label) {
    if (cond) pass++; else { fail++; console.log(`FAIL ${label}`); }
}

/* ---- fixture: a module exercising every mapping branch ---- */

const CHAIN_PARAMS = [
    { key: 'cutoff',   name: 'Filter Cutoff', type: 'float', min: 20, max: 18000, step: 10 },
    { key: 'pan',      name: 'Pan',           type: 'float', min: -1, max: 1, step: 0.01 },
    { key: 'sync',     name: 'Osc Sync',      type: 'enum',  options: ['Off', 'On'] },
    { key: 'wave',     name: 'Waveform',      type: 'enum',  options: ['Saw', 'Square', 'Tri', 'Sine'] },
    { key: 'divis',    name: 'Delay Time',    type: 'enum',  options: ['1/4', '1/8', '1/16', '1/8t'] },
    { key: 'dir',      name: 'Direction',     type: 'enum',  options: ['Fwd', 'Bwd', 'PPf'] },
    { key: 'voices',   name: 'Voice Count',   type: 'int',   min: 1, max: 8 },
    { key: 'octave',   name: 'Octave',        type: 'int',   min: -2, max: 2 },
    { key: 'mystery',  name: 'Mystery Knob',  type: 'float' },
    { key: 'sample',   name: 'Sample',        type: 'filepath', root: '/data/UserData', filter: ['.wav'] },
    { key: 'ui_page',  name: 'internal',      type: 'int',   min: 0, max: 3 },
];

FIXTURES[0] = {
    'synth_module': 'testsynth',
    'synth:chain_params': JSON.stringify(CHAIN_PARAMS),
    'synth:ui_hierarchy': JSON.stringify({
        levels: {
            root: {
                knobs: ['cutoff', 'pan', 'sync', 'wave', 'divis', 'dir', 'voices', 'octave'],
                params: [{ level: 'extra', label: 'More' }],
            },
            extra: { name: 'Extra', knobs: ['mystery', 'sample'] },
        },
    }),
};

/* ---- discovery ---- */

const res = discover(0, 'synth');
eq(res.source, 'hierarchy', 'uses the hierarchy path when one is published');
eq(res.banks.length, 2, 'root knobs + one sub-level = 2 banks');
eq(res.banks[0].name, 'Main', 'root bank is named Main');
eq(res.banks[1].name, 'Extra', 'sub-level bank takes the level name');
eq(res.paramCount, 10, 'every published knob became a param');

const main = res.banks[0].cells;
const byKey = {};
for (const b of res.banks) for (const c of b.cells) if (c.key) byKey[c.key] = c;

eq(main.length, 8, 'banks are padded to 8 cells');

/* ---- kind mapping ---- */

eq(byKey.cutoff.kind, 'uni',   'positive float range -> uni (arc knob)');
eq(byKey.pan.kind,    'bip',   'range straddling zero -> bip (centre-tick arc)');
eq(byKey.sync.kind,   'tog',   '2-option enum -> tog (bar)');
eq(byKey.wave.kind,   'enumc', 'named enum -> enumc (framed square)');
eq(byKey.divis.kind,  'len',   'fraction options -> len (stacked fraction)');
eq(byKey.dir.kind,    'dir',   'direction options -> dir (arrows)');
eq(byKey.voices.kind, 'count', 'small positive int span -> count (big read-out)');
eq(byKey.octave.kind, 'oct',   'small signed int span -> oct (signed read-out)');
eq(byKey.sample.kind, 'file',  'filepath -> file');
ok(byKey.mystery.guessed === true, 'param with no range is flagged as guessed');

/* ---- sensitivity classes ---- */

eq(byKey.cutoff.sens, 2,  'continuous cells get the fast class');
eq(byKey.wave.sens,   6,  'multi-option enums get pick travel');
eq(byKey.voices.sens, 6,  'counts get pick travel');
eq(byKey.sync.sens,   12, '2-option toggles need deliberate travel');

/* ---- short labels ---- */

eq(shortLabel('Filter Cutoff'), 'Ctff', 'multi-word: last word, devowelled');
eq(shortLabel('Pan'), 'Pan', 'short names pass through');
eq(shortLabel('Osc 2'), 'Osc2', 'a trailing index is kept, not dropped');
ok(shortLabel('Voice Count').length <= 4, 'abbreviations fit the 4-char strip');

/* ---- render cells ---- */

eq(toRenderCell(byKey.cutoff, 9010).kind,  'arc',    'uni renders as arc');
eq(toRenderCell(byKey.pan, 0).kind,        'arcbip', 'bip renders as arcbip');
eq(toRenderCell(byKey.sync, 1).kind,       'hbar',   'tog renders as hbar');
eq(toRenderCell(byKey.wave, 2).kind,       'enumsq', 'enumc renders as enumsq');
eq(toRenderCell(byKey.divis, 1).kind,      'frac',   'len renders as frac');
eq(toRenderCell(byKey.dir, 1).kind,        'dirsq',  'dir renders as dirsq');
eq(toRenderCell(byKey.voices, 4).kind,     'valsq',  'count renders as valsq');

eq(toRenderCell(byKey.wave, 2).text, 'Tri', 'enum shows its option NAME as the value');
eq(toRenderCell(byKey.wave, 2).sel, 2,      'enum reports the selected index for the picker');
eq(toRenderCell(byKey.octave, 2).text, '+2', 'oct shows a signed read-out');
eq(toRenderCell(byKey.cutoff, null).text, '--', 'an unread value shows as --');

/* bipolar centring: pan at 0 in a -1..1 range must read dead centre */
eq(toRenderCell(byKey.pan, 0).signed, 0, 'bip centres on the range midpoint');
eq(toRenderCell(byKey.pan, 1).signed, 1, 'bip reaches +1 at the top of the range');

/* the touched header needs the FULL name, the strip needs the short one */
eq(toRenderCell(byKey.cutoff, 100).name, 'Filter Cutoff', 'render cell carries the full name');
eq(toRenderCell(byKey.cutoff, 100).label, 'Ctff', 'render cell carries the short label');

/* count cells synthesize a browsable option list for the picker overlay */
eq(toRenderCell(byKey.voices, 3).options, ['1','2','3','4','5','6','7','8'],
   'count cells expose their range as pickable options');
eq(toRenderCell(byKey.voices, 3).sel, 2, 'count selection is an index into that list');

/* ---- value round-trips ---- */

eq(parseValue(byKey.wave, 'Tri'), 2, 'enum read back by NAME resolves to its index');
eq(parseValue(byKey.wave, '2'), 2,   'enum read back by INDEX also works');
eq(parseValue(byKey.cutoff, '440.5'), 440.5, 'floats parse');
eq(parseValue(byKey.cutoff, ''), null, 'empty reads as unset, not 0');
eq(commitString(byKey.wave, 2), '2', 'enums commit by index, never by name');

/* clamping, never wrapping */
eq(stepValue(byKey.voices, 8, 1), 8,  'discrete cells clamp at the top');
eq(stepValue(byKey.voices, 1, -1), 1, 'discrete cells clamp at the bottom');
eq(stepValue(byKey.octave, 0, 1), 1,  'a step moves exactly one grid position');

/* formatValue is a DISPLAY function — it always returns a string. */
eq(formatValue(byKey.cutoff, 9000.4), '9000', 'wide ranges format as integers');
eq(formatValue(byKey.pan, 0.256), '0.26', 'narrow ranges keep 2 decimals');

/* ---- fallback path: chain_params with no hierarchy ---- */

FIXTURES[1] = {
    'synth_module': 'nohier',
    'synth:chain_params': JSON.stringify(CHAIN_PARAMS),
};
const fb = discover(1, 'synth');
eq(fb.source, 'chain_params', 'falls back to chain_params order');
eq(fb.hierReason, 'none-published', 'a genuine no-hierarchy module says so');
ok(fb.cpLen > 0, 'reports the chain_params blob size');
eq(fb.hLen, 0, 'reports a zero-length hierarchy when none was published');
ok(fb.banks.length >= 2, 'fallback chunks params into pages of 8');
let hasUiPage = false;
for (const b of fb.banks) for (const c of b.cells) if (c.key === 'ui_page') hasUiPage = true;
ok(!hasUiPage, 'ui_* keys are internal state and stay out of the pages');

/* ---- level-graph walk ---------------------------------------------------
 * Each case here is a real module shape that broke the earlier one-level walk.
 * Provenance of the rules: schwung-movy src/model/hierarchy-walk.ts. */

function walkFixture(slot, levels, params) {
    FIXTURES[slot] = {
        'synth_module': 'walktest',
        'synth:chain_params': JSON.stringify(params || CHAIN_PARAMS),
        'synth:ui_hierarchy': JSON.stringify({ levels }),
    };
    return discover(slot, 'synth');
}

const P = (n) => Array.from({ length: n }, (_, i) => ({
    key: 'k' + i, name: 'Knob ' + i, type: 'float', min: 0, max: 1, step: 0.01,
}));

/* dexed: `children` edge, serialised as the literal string "None" when absent */
const dx = walkFixture(10, {
    root: { knobs: ['k0', 'k1'], children: 'ops', params: [] },
    ops:  { name: 'Operators', knobs: ['k2', 'k3'], children: 'None',
            params: [{ level: 'op1', label: 'Op 1' }] },
    op1:  { knobs: ['k4', 'k5'], children: 'None' },
}, P(6));
eq(dx.source, 'hierarchy', 'a children-edge module uses the hierarchy path');
eq(dx.paramCount, 6, 'children edges are followed — no knobs are lost');
ok(dx.banks.length >= 3, 'root + children level + nested nav level all render');
ok(!dx.banks.some(b => b.name === 'None'), 'the "None" sentinel is never treated as a level');

/* nesting deeper than one level (dexed Operators -> Op N -> Envelope) */
const deep = walkFixture(11, {
    root: { knobs: ['k0'], params: [{ level: 'a', label: 'A' }] },
    a:    { name: 'A', knobs: ['k1'], params: [{ level: 'b', label: 'B' }] },
    b:    { name: 'B', knobs: ['k2'], params: [{ level: 'c', label: 'C' }] },
    c:    { name: 'C', knobs: ['k3'] },
}, P(4));
eq(deep.paramCount, 4, 'the walk descends past one level');
ok(deep.banks.some(b => b.name.indexOf('/') !== -1), 'nested pages carry a parent prefix');

/* a `children` level that re-lists root's knobs must not render twice */
const dup = walkFixture(12, {
    root: { knobs: ['k0', 'k1'], children: 'mirror' },
    mirror: { name: 'Mirror', knobs: ['k0', 'k1'] },
}, P(2));
eq(dup.banks.length, 1, 'a children level duplicating root knobs is deduped away');

/* orphan levels — reached by no edge at all (minijv performance/part pages) */
const orph = walkFixture(13, {
    root:  { knobs: ['k0'] },
    lost:  { name: 'Performance', knobs: ['k1', 'k2'] },
}, P(3));
eq(orph.paramCount, 3, 'levels no edge reaches are swept in, not dropped');
ok(orph.banks.some(b => b.name === 'Performance'), 'the orphan page keeps its name');

/* a module whose knobs live ONLY behind edges must not fall back */
const noRootKnobs = walkFixture(14, {
    root: { params: [{ level: 'sub', label: 'Sub' }] },
    sub:  { name: 'Sub', knobs: ['k0', 'k1'] },
}, P(2));
eq(noRootKnobs.source, 'hierarchy', 'an empty root does NOT force the chain_params fallback');
eq(noRootKnobs.paramCount, 2, 'knobs behind the edge are found');

/* the nav entry pointing AT a level names it, beating the level's own label */
const naming = walkFixture(15, {
    root: { knobs: ['k0'], params: [{ level: 'x', label: 'Nav Name' }] },
    x:    { label: 'Own Label', knobs: ['k1'] },
}, P(2));
ok(naming.banks.some(b => b.name === 'Nav Name'), 'nav-entry label wins over the level label');

/* cycles must terminate */
const cyc = walkFixture(16, {
    root: { knobs: ['k0'], params: [{ level: 'a', label: 'A' }] },
    a:    { name: 'A', knobs: ['k1'], params: [{ level: 'root', label: 'back' }] },
}, P(2));
eq(cyc.paramCount, 2, 'a cyclic hierarchy terminates and renders each level once');

/* ---- section derivation (SHIFT picker) ----------------------------------
 * The whole point: a module with dozens of banks must be crossable in a few
 * coarse jumps. Sections come from the walk's "<parent>/<level>" naming. */

const minijvish = [
    { name: 'Main' },
    { name: 'Tone 1/Wave' }, { name: 'Tone 1/Pitch' }, { name: 'Tone 1/Filter' },
    { name: 'Tone 2/Wave' }, { name: 'Tone 2/Pitch' },
    { name: 'Performance' },
];
const secs = deriveSections(minijvish);
eq(secs.map(s => s.name), ['Main', 'Tone 1', 'Tone 2', 'Performance'],
   '7 banks collapse to 4 sections by parent prefix');
eq(secs.map(s => s.bank), [0, 1, 4, 6], 'each section jumps to its FIRST bank');

eq(activeSection(secs, 0), 0, 'bank 0 is in the first section');
eq(activeSection(secs, 3), 1, 'a bank mid-section reports that section');
eq(activeSection(secs, 4), 2, 'the boundary bank starts the next section');
eq(activeSection(secs, 6), 3, 'the last bank maps to the last section');

/* multi-page levels ("Filter 1".."Filter 3") are ONE section, not three */
eq(deriveSections([{ name: 'Osc 1' }, { name: 'Osc 2' }, { name: 'Osc 3' }]).length, 1,
   'a level split across pages stays a single section');

/* a flat module gets one section per bank — picker still works, just 1:1 */
eq(deriveSections([{ name: 'A' }, { name: 'B' }]).map(s => s.name), ['A', 'B'],
   'unprefixed banks are their own sections');
eq(deriveSections([]).length, 0, 'no banks yields no sections');

/* real shapes from the device sweep */
const dexSecs = deriveSections(discover(10, 'synth').banks);
ok(dexSecs.length >= 1 && dexSecs.length <= discover(10, 'synth').banks.length,
   'derived sections never outnumber banks');

/* ---- empty module ---- */

FIXTURES[2] = { 'synth_module': '' };
const empty = discover(2, 'synth');
eq(empty.banks.length, 0, 'a module publishing nothing yields no banks');

/* ---- report ---- */

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
