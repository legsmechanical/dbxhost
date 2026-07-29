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

const { discover, shortLabel, deriveSections, activeSection, filterVizFor,
        modeIdFor, findFilterModeCell, findPresetSpec, menuRows, levelCommits,
        adoptKitStructure, childSpec, childParamKey, buildLevelPages,
        modeKeys, modeRows, disambiguateLabels } =
    await import('../../ui/ui_discover.mjs');
const { toRenderCell, parseValue, stepValue, commitString, formatValue } =
    await import('../../ui/ui_cells.mjs');

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

/* Render cells are UPPERCASE — the header font has true lowercase glyphs only
 * for 'd'/'t', so mixed-case names would render as "EdIt"/"FILtER". */
eq(toRenderCell(byKey.wave, 2).text, 'TRI', 'enum shows its option NAME as the value');
eq(toRenderCell(byKey.wave, 2).options, ['SAW', 'SQUARE', 'TRI', 'SINE'],
   'render-side options are uppercased for the picker overlay');
eq(byKey.wave.options, ['Saw', 'Square', 'Tri', 'Sine'],
   'the MODEL keeps original case — parseValue matches DSP-reported names against it');
eq(parseValue(byKey.wave, 'Tri'), 2, 'name resolution still works after the render uppercase');
eq(toRenderCell(byKey.wave, 2).sel, 2,      'enum reports the selected index for the picker');
eq(toRenderCell(byKey.octave, 2).text, '+2', 'oct shows a signed read-out');
eq(toRenderCell(byKey.cutoff, null).text, '--', 'an unread value shows as --');

/* bipolar centring: pan at 0 in a -1..1 range must read dead centre */
eq(toRenderCell(byKey.pan, 0).signed, 0, 'bip centres on the range midpoint');
eq(toRenderCell(byKey.pan, 1).signed, 1, 'bip reaches +1 at the top of the range');

/* the touched header needs the FULL name, the strip needs the short one */
eq(toRenderCell(byKey.cutoff, 100).name, 'FILTER CUTOFF', 'render cell carries the full name');
eq(toRenderCell(byKey.cutoff, 100).label, 'CTFF', 'render cell carries the short label');
eq(byKey.cutoff.label, 'Filter Cutoff', 'the model keeps the original-case name');

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


/* ---- envelope detection -------------------------------------------------
 * Hera's root is preset/volume/cutoff/resonance/attack/decay/sustain/release,
 * so its A/D/S/R lands in cells 4-7 — the whole second row. */

const heraish = [
    { key: 'preset', name: 'Preset', type: 'int', min: 0, max: 99 },
    { key: 'volume', name: 'Volume', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'vcf_cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'vcf_resonance', name: 'Resonance', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'decay', name: 'Decay', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'sustain', name: 'Sustain', type: 'float', min: 0, max: 1, step: 0.02 },
    { key: 'release', name: 'Release', type: 'float', min: 0, max: 1, step: 0.02 },
];
const hera = walkFixture(20, {
    root: { name: 'Hera', knobs: heraish.map(p => p.key) },
}, heraish);

eq(hera.envCount, 1, 'hera publishes one detectable envelope');
eq(hera.banks[0].env, { start: 4, count: 4, roles: 'adsr' },
   'A/D/S/R in cells 4-7 is a full ADSR on the second row');

/* a lone Attack is just a knob, not an envelope */
const lone = walkFixture(21, {
    root: { knobs: ['attack', 'volume'] },
}, [{ key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1 },
    { key: 'volume', name: 'Volume', type: 'float', min: 0, max: 1 }]);
eq(lone.envCount, 0, 'a single stage is not an envelope');

/* AD (two stages) is a valid partial envelope */
const ad = walkFixture(22, {
    root: { knobs: ['attack', 'decay', 'volume'] },
}, [{ key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1 },
    { key: 'decay', name: 'Decay', type: 'float', min: 0, max: 1 },
    { key: 'volume', name: 'Volume', type: 'float', min: 0, max: 1 }]);
eq(ad.banks[0].env, { start: 0, count: 2, roles: 'ad' }, 'AD is a valid partial envelope');

/* an ENUM named like a stage must not be swallowed into the graphic */
const enumStage = walkFixture(23, {
    root: { knobs: ['attack', 'decay_mode'] },
}, [{ key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1 },
    { key: 'decay_mode', name: 'Decay Mode', type: 'enum', options: ['Exp', 'Lin'] }]);
eq(enumStage.envCount, 0, 'a "Decay Mode" enum is not an envelope stage');

/* a run straddling the row split is rejected — the graphic spans one row */
const straddle = walkFixture(24, {
    root: { knobs: ['a1', 'b1', 'c1', 'attack', 'decay', 'sustain', 'release', 'z1'] },
}, [{ key: 'a1', name: 'A1', type: 'float', min: 0, max: 1 },
    { key: 'b1', name: 'B1', type: 'float', min: 0, max: 1 },
    { key: 'c1', name: 'C1', type: 'float', min: 0, max: 1 },
    { key: 'attack', name: 'Attack', type: 'float', min: 0, max: 1 },
    { key: 'decay', name: 'Decay', type: 'float', min: 0, max: 1 },
    { key: 'sustain', name: 'Sustain', type: 'float', min: 0, max: 1 },
    { key: 'release', name: 'Release', type: 'float', min: 0, max: 1 },
    { key: 'z1', name: 'Z1', type: 'float', min: 0, max: 1 }]);
ok(!straddle.banks[0].env || straddle.banks[0].env.start >= 4,
   'a run crossing the row split is not drawn as one graphic');


/* ---- filter-curve detection --------------------------------------------- */

const FP = (arr) => arr.map(p => Object.assign(
    { type: 'float', min: 0, max: 1, step: 0.02 }, p));

/* Hera: vcf_cutoff + vcf_resonance adjacent in cells 2-3 */
const filt = walkFixture(30, {
    root: { knobs: ['volume', 'vcf_cutoff', 'vcf_resonance', 'env'] },
}, FP([{ key: 'volume', name: 'Volume' }, { key: 'vcf_cutoff', name: 'Cutoff' },
       { key: 'vcf_resonance', name: 'Resonance' }, { key: 'env', name: 'Env' }]));
eq(filt.filtCount, 1, 'adjacent cutoff+resonance is detected as a filter');
eq(filt.banks[0].filt.start, 1, 'the curve starts on the CUTOFF cell');
eq(filt.banks[0].filt.cutoffKey, 'vcf_cutoff', 'cutoff key captured');
eq(filt.banks[0].filt.resoKey, 'vcf_resonance', 'resonance key captured');

/* cutoff must LEAD — reversed order is not a filter span */
const rev = walkFixture(31, {
    root: { knobs: ['vcf_resonance', 'vcf_cutoff'] },
}, FP([{ key: 'vcf_resonance', name: 'Resonance' }, { key: 'vcf_cutoff', name: 'Cutoff' }]));
eq(rev.filtCount, 0, 'resonance before cutoff is not drawn as a curve');

/* a lone cutoff stays a knob — the bump would never move */
const lonecut = walkFixture(32, {
    root: { knobs: ['cutoff', 'volume'] },
}, FP([{ key: 'cutoff', name: 'Cutoff' }, { key: 'volume', name: 'Volume' }]));
eq(lonecut.filtCount, 0, 'cutoff without resonance is not a filter curve');

/* mode enum resolves to a curve id from its CURRENT option */
const modal = walkFixture(33, {
    root: { knobs: ['cutoff', 'resonance', 'filter_mode'] },
}, [ ...FP([{ key: 'cutoff', name: 'Cutoff' }, { key: 'resonance', name: 'Resonance' }]),
     { key: 'filter_mode', name: 'Filter Mode', type: 'enum',
       options: ['Low Pass', 'High Pass', 'Band Pass'] } ]);
const vizHp = filterVizFor(modal.banks[0], { cutoff: 0.5, resonance: 0.2, filter_mode: 1 });
eq(vizHp.mode, 'hp', 'the mode enum\'s current option picks the curve shape');
const vizBp = filterVizFor(modal.banks[0], { cutoff: 0.5, resonance: 0.2, filter_mode: 2 });
eq(vizBp.mode, 'bp', 'changing the mode enum changes the curve');
eq(Math.round(vizHp.cutoffNorm * 100), 50, 'cutoff normalises for the renderer');

/* no mode enum -> lp, never a wrong-but-confident shape */
eq(filterVizFor(filt.banks[0], { vcf_cutoff: 1, vcf_resonance: 0 }).mode, 'lp',
   'a module with no mode enum defaults to low-pass');

/* filter and envelope must not claim the same cells */
const clash = walkFixture(34, {
    root: { knobs: ['attack', 'decay', 'sustain', 'release'] },
}, FP([{ key: 'attack', name: 'Attack' }, { key: 'decay', name: 'Decay' },
       { key: 'sustain', name: 'Sustain' }, { key: 'release', name: 'Release' }]));
eq(clash.envCount, 1, 'the envelope still wins its cells');
eq(clash.filtCount, 0, 'no filter is claimed over envelope cells');


/* ---- filter MODEL mapping ------------------------------------------------
 * noisemaker's real option list. \b..\b alone does NOT match "HP24" — there
 * is no word boundary between letters and digits — so every sloped high/band
 * pass silently drew a low-pass until \d* was added. */

eq(modeIdFor('LP24'), 'lp', 'LP24 -> low pass (slope in the same token)');
eq(modeIdFor('LP6'), 'lp', 'LP6 -> low pass');
eq(modeIdFor('HP24'), 'hp', 'HP24 -> HIGH pass, not the lp default');
eq(modeIdFor('BP24'), 'bp', 'BP24 -> BAND pass, not the lp default');
eq(modeIdFor('Notch'), 'notch', 'Notch -> notch');
eq(modeIdFor('SV-LP'), 'lp', 'SV-LP -> low pass');
eq(modeIdFor('SV-HP'), 'hp', 'SV-HP -> high pass');
eq(modeIdFor('SV-BP'), 'bp', 'SV-BP -> band pass');
eq(modeIdFor('Moog'), 'lp', 'a named ladder model is a low pass, not a fallback');
eq(modeIdFor('Moog2'), 'lp', 'Moog2 -> low pass');
eq(modeIdFor('Wobble'), 'lp', 'an unrecognised model falls back to lp');
eq(modeIdFor('Low Pass'), 'lp', 'spelled-out names still work');
eq(modeIdFor('High Pass'), 'hp', 'spelled-out high pass');

/* the model enum is found MODULE-WIDE, not just on the bank drawing the curve */
const NM_OPTS = ['LP24','LP18','LP12','LP6','HP24','BP24','Notch',
                 'SV-LP','SV-HP','SV-BP','Moog','Moog2'];
const nm = walkFixture(40, {
    root:   { knobs: ['wave', 'tune2', 'cutoff', 'resonance'] },
    filter: { name: 'Filter', knobs: ['filter_type', 'cutoff', 'resonance', 'keyfollow'] },
}, [ { key: 'wave', name: 'Wave', type: 'float', min: 0, max: 1 },
     { key: 'tune2', name: 'Tune 2', type: 'float', min: 0, max: 1 },
     { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
     { key: 'resonance', name: 'Resonance', type: 'float', min: 0, max: 1 },
     { key: 'keyfollow', name: 'Key Follow', type: 'float', min: 0, max: 1 },
     { key: 'filter_type', name: 'Filter Type', type: 'enum', options: NM_OPTS } ]);

eq(nm.filtCount, 2, 'cutoff/resonance on both pages each draw a curve');
const modeCell = findFilterModeCell(nm.banks);
eq(modeCell.key, 'filter_type', 'the model enum is found module-wide');

/* the ROOT page has no filter_type of its own, yet must still draw HP24 */
const rootBank = nm.banks.find(b => b.cells.some(c => c && c.key === 'wave'));
const vizRoot = filterVizFor(rootBank, { cutoff: 0.5, resonance: 0.3, filter_type: 4 });
eq(vizRoot.mode, 'hp', 'a page without the model enum still draws the real model');
const vizRootBp = filterVizFor(rootBank, { cutoff: 0.5, resonance: 0.3, filter_type: 5 });
eq(vizRootBp.mode, 'bp', 'and follows it when the model changes');

/* ---- baked-preset spec (list_param/count_param/name_param levels) ----
 * The keys are module-chosen, NOT fixed: obxd uses preset/preset_count, while
 * po32-drum uses kit/kit_count/kit_name. Anything that hardcodes "preset"
 * silently fails on the drum module, so pin the generic read. */

eq(findPresetSpec(null), null, 'no hierarchy = no baked bank');
eq(findPresetSpec({ root: { knobs: ['cutoff'] } }), null,
   'a level without list_param/count_param is not a preset bank');
eq(findPresetSpec({ root: { list_param: 'preset' } }), null,
   'list_param ALONE is not enough — count_param is what makes it browsable');
eq(findPresetSpec({
       root: { list_param: 'preset', count_param: 'preset_count',
               name_param: 'preset_name' } }),
   { listKey: 'preset', countKey: 'preset_count', nameKey: 'preset_name' },
   'obxd/noisemaker shape');
eq(findPresetSpec({
       root: { list_param: 'kit', count_param: 'kit_count', name_param: 'kit_name' } }),
   { listKey: 'kit', countKey: 'kit_count', nameKey: 'kit_name' },
   'po32-drum names its bank "kit" — keys must not be hardcoded');
eq(findPresetSpec({ root: { list_param: 'preset', count_param: 'preset_count' } }),
   { listKey: 'preset', countKey: 'preset_count', nameKey: 'preset_name' },
   'name_param defaults to preset_name, matching shadow_ui.js');
eq(findPresetSpec({
       root: { knobs: ['cutoff'] },
       banks: { list_param: 'preset', count_param: 'preset_count' } }),
   { listKey: 'preset', countKey: 'preset_count', nameKey: 'preset_name' },
   'the bank need not be on root — every level is scanned');

/* ---- module menu rows ----
 * The menu exists because the knob pages are a lossy projection: they read
 * knobs[] only, so a param declared but never knob-mapped is invisible there.
 * These pin that the menu reads params[] instead, and that it skips the preset
 * level (sound mode has its own picker; shadow_ui skips it too). */

const MLV = {
    root: {
        name: 'Root',
        knobs: ['cutoff'],
        params: [
            { key: 'cutoff', name: 'Cutoff' },
            { key: 'hidden_thing', name: 'Hidden' },   /* NOT in knobs[] */
            { level: 'adv', label: 'Advanced' },
            { level: 'presets', label: 'Presets' },
        ],
    },
    adv: { name: 'Advanced', params: [{ key: 'drive', name: 'Drive' }] },
    presets: { name: 'Presets', list_param: 'preset', count_param: 'preset_count' },
};

const mr = menuRows(MLV, 'root', { cutoff: { name: 'Cutoff' } });
eq(mr.map(r => r.kind), ['param', 'param', 'level'],
   'preset level is skipped; params and nav links both appear');
eq(mr.map(r => r.label), ['Cutoff', 'Hidden', 'Advanced'],
   'a param absent from knobs[] IS in the menu — the whole point of having one');
eq(menuRows(MLV, 'adv', {}).map(r => r.key), ['drive'], 'sub-level rows');
eq(menuRows(MLV, 'nope', {}), [], 'unknown level = no rows, not a throw');
eq(menuRows(null, 'root', {}), [], 'no hierarchy = no rows');

/* dexed serialises an absent children list as the literal string "None" */
eq(menuRows({ a: { params: [], children: 'None' } }, 'a', {}), [],
   '"None" children is absent, not a level named None');
eq(menuRows({ a: { params: [], children: ['b'] }, b: { name: 'B' } }, 'a', {})
       .map(r => r.label),
   ['B'], 'children edges become rows too (dexed operators are only reachable that way)');

/* nusaw ships `children` as a bare STRING and an EMPTY params[] — its whole
 * menu hangs off that one edge. Reading only the array form reported
 * "NO PARAMS" for a module with eight knobs' worth of them (device, 07-28). */
eq(menuRows({ a: { params: [], children: 'main', knobs: ['cutoff'] },
              main: { name: 'Main' } }, 'a', {}).map(r => r.label),
   ['Main'], 'a string children edge is a level row, not nothing');
eq(menuRows({ a: { params: [], children: [{ level: 'b' }] }, b: { name: 'B' } }, 'a', {})
       .map(r => r.level),
   ['b'], 'children entries may be {level} objects as well as strings');
eq(menuRows({ a: { params: [], children: 'ghost' } }, 'a', {}), [],
   'a children edge naming a level that does not exist is dropped, not a throw');

/* surge advertises `{"level":"mod_0","label":"Mod Slot 1"}` .. mod_5 and defines
 * none of them. A row that opens on "NO PARAMS" reads as a broken menu, so an
 * undefined target is dropped the same way a bad children edge is. */
eq(menuRows({ a: { params: [{ level: 'mod_0', label: 'Mod Slot 1' },
                            { key: 'cutoff' }] } }, 'a', {}).map(r => r.key || r.level),
   ['cutoff'], 'a nav row pointing at an undefined level is dropped');

/* ---- canvaskit structure adoption ----
 * A kit module publishes the layout its author designed. Adoption must keep
 * their bank ORDER, their fitted labels, and their sections — and must return
 * null (never a half-built layout) when the structure is unusable, because the
 * caller's fallback is the derived walk. */

const KIT = {
    banks: [
        { label: 'Osc 1', knobs: [
            { key: 'osc1_saw', label: 'Saw', kind: 'enum', min: 0, max: 1, step: 1, options: ['Off', 'On'] },
            { key: 'osc1_pitch', label: 'Ptch', kind: 'unipolar', min: 0, max: 100, step: 1 },
        ] },
        { label: 'Amp Env', env: true, knobs: [
            { key: 'attack',  label: 'A', kind: 'fader', min: 0, max: 100, step: 1 },
            { key: 'decay',   label: 'D', kind: 'fader', min: 0, max: 100, step: 1 },
            { key: 'sustain', label: 'S', kind: 'fader', min: 0, max: 100, step: 1 },
            { key: 'release', label: 'R', kind: 'fader', min: 0, max: 100, step: 1 },
        ] },
        { label: 'Global', knobs: [
            { key: 'octave', label: 'Oct', kind: 'octave', min: -2, max: 2, step: 1 },
            { key: 'voice_count', label: 'Vcs', kind: 'count', min: 1, max: 8, step: 1 },
        ] },
    ],
    sections: [{ name: 'OSC', bank: 0 }, { name: 'ENV', bank: 1 }],
};

const kitAd = adoptKitStructure(KIT);
eq(kitAd.banks.map(b => b.name), ['Osc 1', 'Amp Env', 'Global'], 'author bank ORDER is kept');
eq(kitAd.banks[0].cells.length, 8, 'banks are padded to 8 cells like every other path');
eq(kitAd.banks[0].cells[0].kind, 'tog', 'a 2-option kit enum reads as a toggle');
eq(kitAd.banks[0].cells[1].kind, 'uni', 'unipolar -> uni');
eq(kitAd.banks[2].cells[0].kind, 'oct', 'octave -> oct');
eq(kitAd.banks[2].cells[1].kind, 'count', 'count -> count');
eq(kitAd.banks[1].cells[0].kind, 'uni', 'fader -> uni (we have no separate fader widget)');
eq(kitAd.banks[0].cells[1].short, 'Ptch',
   'kit labels are already <=4 chars — re-shortening would mangle them');
eq(!!kitAd.banks[1].env, true, 'an ADSR bank still gets its envelope graphic');
eq(kitAd.sections, [{ name: 'OSC', bank: 0 }, { name: 'ENV', bank: 1 }], 'author sections kept');

eq(adoptKitStructure(null), null, 'no structure = null, so the caller falls back');
eq(adoptKitStructure({ banks: [] }), null, 'empty banks = null');
eq(adoptKitStructure({ banks: [{ label: 'X', knobs: [] }] }), null,
   'a bank with no real cells is not a layout');
eq(adoptKitStructure({ banks: KIT.banks, sections: [{ name: 'Bad', bank: 99 }] }).sections, null,
   'out-of-range sections are dropped rather than pointing at a missing bank');

/* ---- committing dynamic lists ----
 * obxd's banks and minijv's "Save to Slot" are the SAME shape in the data
 * (items_param + select_param). Only the wording says one of them overwrites a
 * user patch, so that wording is what gates the confirm. Real shapes, verified
 * against the modules' own hierarchies on 2026-07-29. */
ok(levelCommits({ label: 'Save to Slot', items_param: 'save_patch_slot_list',
                  select_param: 'do_save_to_slot' }, 'save_slot'),
   'minijv save-to-slot is a COMMIT');
ok(!levelCommits({ name: 'Banks', label: 'Select Bank', items_param: 'fxb_bank_list',
                   select_param: 'bank_index' }, 'banks'),
   'obxd bank pick is NOT a commit — it must stay one click');
ok(!levelCommits({ label: 'Jump to Expansion', items_param: 'expansion_list',
                   select_param: 'jump_to_expansion' }, 'expansions'),
   'minijv expansion JUMP is not a commit');
ok(!levelCommits({ label: 'Load Expansion', items_param: 'expansion_list',
                   select_param: 'load_expansion' }, 'load_expansion'),
   'loading is not overwriting');
ok(levelCommits({ label: 'Slots', select_param: 'write_patch' }, 'x'),
   'the select_param counts too, not just the label');
ok(!levelCommits(null, 'x'), 'a missing level is not a commit');

/* ---- repeated elements (child_prefix) ----
 * minijv's `part_selector`, copied verbatim from the device dump on 2026-07-29:
 * one set of params standing for 8 multitimbral parts, where the REAL key for
 * part i is `sram_part_<i>_<key>`. Reading these fields is the whole feature —
 * without it every read and write here addresses `partlevel`, which minijv does
 * not have, and the menu silently does nothing. */
const PARTS = {
    root: { name: 'Mini-JV', params: [{ level: 'part_selector', label: 'Edit Parts' }] },
    part_selector: {
        label: 'Parts', child_prefix: 'sram_part_', child_count: 8, child_label: 'Part',
        knobs: ['partlevel', 'partpan'],
        params: ['patchbank', 'partlevel'],
    },
};

eq(childSpec(PARTS.part_selector), { prefix: 'sram_part_', count: 8, label: 'Part' },
   'minijv part_selector is a repeated element');
eq(childSpec(PARTS.root), null, 'a plain level has no children');
eq(childSpec({ child_prefix: 'x_', child_count: 0 }), null,
   'a zero count is not a repeated element');
eq(childSpec({ child_count: 8 }), null, 'a count without a prefix is not one either');
eq(childSpec({ child_prefix: 'x_', child_count: 2 }).label, 'Item',
   'child_label defaults rather than printing "undefined 1"');

eq(childParamKey(PARTS.part_selector, 3, 'partlevel'), 'sram_part_3_partlevel',
   'the address carries the element index');
eq(childParamKey(PARTS.part_selector, -1, 'partlevel'), 'partlevel',
   'no element chosen = the bare key');
eq(childParamKey(PARTS.root, 3, 'cutoff'), 'cutoff',
   'a level without children ignores the index');

/* No element chosen yet: the level asks WHICH, exactly as the host does. */
eq(menuRows(PARTS, 'part_selector', {}, -1).map(r => r.kind + ':' + r.label),
   ['child:Part 1', 'child:Part 2', 'child:Part 3', 'child:Part 4',
    'child:Part 5', 'child:Part 6', 'child:Part 7', 'child:Part 8'],
   'a repeated level opens on a selector, not on unqualified params');
eq(menuRows(PARTS, 'part_selector', {}, undefined).length, 8,
   'an absent child index reads as "none chosen", not as element 0');

/* Element chosen: same rows as any level, but addressed. `key` stays bare
 * because chain_params publishes it that way — only `pkey` takes the prefix. */
const pr = menuRows(PARTS, 'part_selector', { partlevel: { name: 'Level' } }, 2);
eq(pr.map(r => r.key), ['patchbank', 'partlevel'], 'metadata keys stay bare');
eq(pr.map(r => r.pkey), ['sram_part_2_patchbank', 'sram_part_2_partlevel'],
   'engine addresses carry the element');
eq(pr[1].label, 'Level', 'chain_params still names the param by its BARE key');

/* Knob pages are flat, so a repeated level becomes one page per element. */
const pp = buildLevelPages(PARTS, 'root');
eq(pp.length, 8, 'eight parts, eight pages');
eq(pp[0].name, 'Part 1', 'pages are named by the element, not the level');
eq(pp[7].entries.map(e => e.pkey), ['sram_part_7_partlevel', 'sram_part_7_partpan'],
   'the last page addresses the last element');
eq(pp[3].entries.map(e => e.key), ['partlevel', 'partpan'],
   'page entries keep the bare metadata key too');

/* ---- modes ----
 * minijv's real top level, from the device dump: `modes:['patch','performance']`
 * + `mode_param:'mode'` and NO `root`. Falling back to "first declared level"
 * landed the menu on `patch` and left the ENTIRE performance tree — 8 parts,
 * expansion loader, octave transpose — with no door (Josh, on device, 07-29). */
const MODED = {
    modes: ['patch', 'performance'],
    mode_param: 'mode',
    levels: {
        patch: { list_param: 'preset', count_param: 'preset_count',
                 children: 'patch_main', params: [] },
        patch_main: { label: 'Patch', params: [{ key: 'macro_cutoff', label: 'Cutoff' }] },
        performance: { list_param: 'performance', count_param: 'num_performances',
                       children: 'perf_main', params: [] },
        perf_main: { label: 'Performance',
                     params: [{ level: 'part_selector', label: 'Edit Parts' },
                              { key: 'octave_transpose', label: 'Octave' }] },
        part_selector: { label: 'Parts', child_prefix: 'sram_part_', child_count: 8,
                         child_label: 'Part', params: ['partlevel'] },
    },
};

eq(modeKeys(MODED, MODED.levels), ['patch', 'performance'], 'both modes are real levels');
eq(modeKeys({ modes: ['patch', 'ghost'] }, MODED.levels), ['patch'],
   'a mode naming a level that does not exist is dropped');
eq(modeKeys({}, MODED.levels), null, 'no modes = null, so the caller uses root');
eq(modeKeys({ modes: [] }, MODED.levels), null, 'an empty modes list is not a mode hierarchy');

const mr2 = modeRows(MODED.modes, MODED.levels);
eq(mr2.map(r => r.label), ['Patch', 'Performance'],
   'modes are named by the level they front, not by the raw key');
eq(mr2.map(r => r.index), [0, 1],
   'the index is the DECLARED position — that is what mode_param takes');
eq(mr2.map(r => r.level), ['patch_main', 'perf_main'],
   'a browser-only mode level is resolved past — no dead one-row screen');
eq(mr2.every(r => r.kind === 'mode'), true, 'every row is a mode row');

/* A mode level with params of its own must NOT be skipped. */
eq(modeRows(['m'], { m: { params: [{ key: 'x' }], children: 'sub' }, sub: {} })[0].level, 'm',
   'a mode level that owns params keeps its own screen');
eq(modeRows(['m'], { m: { params: [], children: ['a', 'b'] }, a: {}, b: {} })[0].level, 'm',
   'two children is a real choice — do not resolve past it');

/* The performance tree is reachable end to end once the mode row exists. */
eq(menuRows(MODED.levels, 'perf_main', {}).map(r => r.label),
   ['Edit Parts', 'Octave'], 'the performance screen the mode row now opens');
eq(menuRows(MODED.levels, 'part_selector', {}, -1).length, 8,
   'and Edit Parts still lands on the 8-part selector');

/* ---- label disambiguation ----
 * Real names from the device dump. shortLabel keeps the last word, which is the
 * identifying noun until two params on a level share it — then the word it drops
 * is the one that told them apart. 28% of rendered pages fleet-wide had a
 * duplicate label before this (Josh reported it as "gain" in ott-x).
 *
 * Shape chosen 2026-07-29: digits trail, single characters trail, multi-character
 * qualifiers lead. Scope is one LEVEL across its pages. */
function shorts(names, keys) {
    const cells = names.map((n, i) => ({ key: (keys && keys[i]) || ('k' + i),
                                         label: n, short: shortLabel(n) }));
    disambiguateLabels(cells);
    return cells.map(c => c.short.toUpperCase());
}

eq(shorts(['In Gain', 'Out Gain']), ['IGAN', 'OGAN'],
   'ott-x: a multi-character qualifier LEADS');
eq(shorts(['Low Gain', 'Mid Gain', 'Hi Gain']), ['LGAN', 'MGAN', 'HGAN'],
   'ott-x advanced: three-way, still one character each');
eq(shorts(['HPF Cut', 'HPF Peak', 'HPF MG', 'HPF EG',
           'LPF Cut', 'LPF Peak', 'LPF MG', 'LPF EG']),
   ['HCUT', 'HPEK', 'HMG', 'HEG', 'LCUT', 'LPEK', 'LMG', 'LEG'],
   'aphex filter page: eight cells, four collisions, all resolved');
eq(shorts(['E1 Atk', 'E1 Rel', 'E2 Atk', 'E2 Dcy', 'E2 Sus', 'E2 Rel']),
   ['ATK1', 'REL1', 'ATK2', 'DCY', 'SUS', 'REL2'],
   'digits TRAIL (keeps the Osc 2 -> OSC2 convention); non-colliding names untouched');
eq(shorts(['A Sample', 'A Length', 'B Sample', 'B Length']),
   ['SMPA', 'LNGA', 'SMPB', 'LNGB'], 'a SINGLE-character qualifier trails');
eq(shorts(['Lvl Morph LFO Rate', 'Pan Morph LFO Rate']), ['LRAT', 'PRAT'],
   'the shared run can be several words long');

/* The distinction is not always in the name. */
eq(shorts(['On', 'On', 'On', 'On'],
          ['lane1_enabled', 'lane2_enabled', 'lane3_enabled', 'lane4_enabled']),
   ['ON1', 'ON2', 'ON3', 'ON4'],
   'eucalypso ships four params literally named "On" — fall back to the KEY');
eq(shorts(['Osc1 Freq', 'Osc2 Freq']), ['FRQ1', 'FRQ2'],
   'a digit in the qualifier trails, and the noun keeps its budget');
eq(shorts(['Env->Pitch1', 'Env->Pitch2']), ['PTC1', 'PTC2'],
   'denis: the digit sits INSIDE the noun and is stripped before it is appended');

/* Cases the linguistic rules cannot reach, so the backstop must. */
eq(shorts(['Min Velocity', 'Max Velocity']), ['MIVL', 'MAVL'],
   'both start M, so the qualifier WIDENS rather than giving up');
eq(shorts(['Asgn1 Amt', 'LFO1 Asgn Amt']), ['AAMT', 'LAMT'],
   'osirus: both qualifiers reduce to digit 1, so the digit shape is skipped');
const rnd = shorts(['Patch', 'Rnd Patch', 'Rnd Pitch']);
eq(rnd.length, new Set(rnd).size,
   'signal: Patch/Pitch differ only in a devowelled vowel — the backstop guarantees it');

/* Non-colliding labels must be left completely alone. */
eq(shorts(['Filter Cutoff', 'Resonance', 'Osc 2']), ['CTFF', 'RSNN', 'OSC2'],
   'no collision, no change');

/* fitWord spends the whole budget instead of stripping every vowel. */
eq(shortLabel('Gain', 3), 'Gan', 'drops only as many vowels as it must');
eq(shortLabel('Peak', 3), 'Pek', 'and always from the right');
eq(shortLabel('Attack'), 'Attc', 'never drops the LEADING character');

/* ---- report ---- */

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
