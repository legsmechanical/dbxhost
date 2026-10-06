/* tests/js/test_discover_keeps_cell_flags.mjs — A MODULE'S CELL FLAGS SURVIVE
 * DISCOVERY, ON EVERY PATH.
 *
 * chain_params lets a module say three things about a parameter that change
 * how its cell behaves:
 *   live_preview   — a file param auditions as you scroll the browser
 *   browser_hooks  — the browser calls the module's own preview hooks
 *   reload_level   — writing it changes WHICH params exist: re-discover
 * makeCell reads all three. But two of the three paths that feed it built
 * their own `meta` object by hand and left these out — the hierarchy path
 * (cellFor) and the menu path (menuCell) — so only kit-adopted cells kept
 * them. A sample browser got no audition, and a selector that swaps the whole
 * knob set never re-discovered. The existing test called makeCell directly,
 * so it could not see it. This one goes through discover() and menuCell. */

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const HOOKS = { preview: 'preview_sample', stop: 'preview_stop' };
const CHAIN_PARAMS = [
    { key: 'sample', name: 'Sample', type: 'filepath', root: '/data/UserData/samples', filter: '.wav',
      live_preview: true, browser_hooks: HOOKS },
    { key: 'algo', name: 'Algorithm', type: 'enum', options: ['Hall', 'Plate', 'Spring'], reload_level: true },
    { key: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, step: 0.01 },
];
const HIERARCHY = { levels: { root: { label: 'Root', knobs: ['sample', 'algo', 'mix'],
                                      params: ['sample', 'algo', 'mix'] } } };
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify(CHAIN_PARAMS);
    if (key === 'synth:ui_hierarchy') return JSON.stringify(HIERARCHY);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.host_module_get_param = () => ''; globalThis.host_module_set_param = () => {};
globalThis.host_read_file = () => ''; globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true; globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true; globalThis.host_system_cmd = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

async function main() {
const { discover, menuCell } = await import('../../ui/ui_discover.mjs');

const res = discover(0, 'synth');
const cells = [];
for (const b of (res.banks || [])) for (const c of (b.cells || [])) if (c && c.key) cells.push(c);
const byKey = (k) => cells.find((c) => c.key === k);

step('rig: discovery walked the hierarchy and produced the three cells', () => {
    assert(byKey('sample') && byKey('algo') && byKey('mix'),
           'cells found: ' + JSON.stringify(cells.map((c) => c.key)) + ' diag ' + JSON.stringify(res.diag || null));
});

step('hierarchy path: a file cell keeps its audition flag and browser hooks', () => {
    const c = byKey('sample');
    assert(c.kind === 'file', 'rig: sample is not a file cell');
    assert(c.filePreview === true, 'live_preview was dropped (filePreview = ' + c.filePreview + ')');
    assert(c.fileHooks && c.fileHooks.preview === 'preview_sample', 'browser_hooks were dropped');
});

step('hierarchy path: a selector keeps its re-discover flag', () => {
    assert(byKey('algo').reload === true, 'reload_level was dropped');
    assert(byKey('mix').reload !== true, 'control: a plain param is not a reload cell');
});

step('menu path: the same three flags', () => {
    const cpMap = {}; for (const cp of CHAIN_PARAMS) cpMap[cp.key] = cp;
    const f = menuCell('sample', HIERARCHY.levels, 'root', cpMap);
    assert(f.filePreview === true, 'menu: live_preview was dropped');
    assert(f.fileHooks && f.fileHooks.stop === 'preview_stop', 'menu: browser_hooks were dropped');
    assert(menuCell('algo', HIERARCHY.levels, 'root', cpMap).reload === true, 'menu: reload_level was dropped');
});

process.exit(failed);
}
main().catch((e) => { bad('unhandled', e); process.exit(1); });
