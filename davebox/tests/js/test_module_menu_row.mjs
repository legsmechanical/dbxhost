/* tests/js/test_module_menu_row.mjs — THE MODULE MENU ROW (plan 6c3).
 *
 * Josh, 2026-09-11 ("let's go with your recommendation"): dAVEBOx has the
 * module's parameter-tree list (VIEW_MENU) but no door to it in normal use — it
 * lost its door when the editor moved to the grid. Ruled: a "Module Menu" ROW on
 * the Module page, not upstream's global Param View setting.
 *
 * Performs the gesture on the real editor: walk the jog to the Module page,
 * click in, click Module Menu — the list is up. Descend into a sub-level; Back
 * climbs it; Back at the top lands on the GRID page you left (not the old
 * preset hub, which is where the menu's own Back used to go). CONTROL: a module
 * with no hierarchy tree is not offered the row. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — hoist the awaits');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
function assert(c, m) { if (!c) throw new Error(m); }

const HIER = JSON.stringify({
    levels: {
        root: {
            name: 'RRVerb',
            params: [
                { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20 },
                { key: 'mix', name: 'Mix', type: 'float', min: 0, max: 1 },
                { level: 'adv', label: 'Advanced' },
            ],
            knobs: ['room_size', 'mix'],
        },
        adv: { name: 'Advanced', params: [{ key: 'damp', name: 'Damp', type: 'float', min: 0, max: 1 }] },
    },
});
const ASSIGN = {
    'master_fx:fx1:module': 'rrverb',
    'master_fx:fx1:chain_params': JSON.stringify([
        { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 },
        { key: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'damp', name: 'Damp', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
    'master_fx:fx1:room_size': '4.0',
    'master_fx:fx1:mix': '0.35',
    'master_fx:fx1:damp': '0.5',
    'master_fx:fx1:ui_hierarchy': HIER,
};
globalThis.shadow_get_param = (slot, key) => ASSIGN[key] || '';
globalThis.shadow_set_param = (slot, key, val) => { ASSIGN[key] = String(val); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* ⚠ Shift UP. The JS test build defaults this to HELD (build.mjs), and with
 * Shift held every click on the grid opens the section picker instead. */
globalThis.shadow_get_shift_held = () => 0;
/* ⚠ TRIPWIRE: the entry wrapper swallows exceptions into the jserr log. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const VIEW_EDIT = 1, VIEW_MENU = 6;          /* ui_sound.mjs's view enum */
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const pp    = () => snd.soundPPForTest();
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);

function enterMasterFxBlock() {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = 2;
    snd.soundEnter(2, 2);
    ticks(3);
    snd.soundEnterBuses();
    click(); ticks(3);             /* into the bus (MASTER FX) */
    if (!snd.soundIsGlobal()) throw new Error('rig: not in a global bus context');
    click(); ticks(6);             /* open the FX 1 block: discovery + the planner */
    if (!pp().on) throw new Error('rig: the grid did not take the screen');
}
/* Page forward until `name`; returns the page. */
function walkTo(name) {
    for (let guard = 0; guard < 40; guard++) {
        const p = pp().page;
        if (p && p.name === name) return p;
        const before = p && p.name;
        jog(1); ticks(2);
        if ((pp().page && pp().page.name) === before) break;
    }
    throw new Error('never reached the "' + name + '" page');
}

step('⭐ the Module page offers "Module Menu" first, above Swap and Remove', () => {
    enterMasterFxBlock();
    const p = walkTo('Module');
    const labels = (p.entries || []).map(e => e.label);
    assert(labels[0] === 'Module Menu' && labels.indexOf('Swap Module') === 1 &&
           labels.indexOf('Remove Module') === 2, 'Module page rows: ' + JSON.stringify(labels));
});

step('⭐⭐ THE GESTURE: click into the page, click Module Menu — the module\'s own tree is on screen', () => {
    click(); ticks(1);                            /* enter the page (it is a door) */
    click(); ticks(3);                            /* the row under the cursor: Module Menu */
    assert(snd.soundViewForTest() === VIEW_MENU, 'view is ' + snd.soundViewForTest() + ', not the menu');
    const m = snd.soundMenuForTest();
    const labels = m.rows.map(r => r.label);
    assert(m.key === 'root' && m.depth === 0, 'not at the root: ' + JSON.stringify(m));
    assert(labels.indexOf('Advanced') >= 0 && labels.indexOf('Room Size') >= 0,
           'the rows are not the module\'s root level: ' + JSON.stringify(labels));
    assert(!pp().on, 'the grid still holds the screen');
});

step('Back climbs the tree one level before it leaves it', () => {
    const rows = snd.soundMenuForTest().rows;
    const adv = rows.findIndex(r => r.label === 'Advanced');
    for (let g = 0; g < 10 && snd.soundMenuForTest().idx < adv; g++) { jog(1); ticks(1); }
    assert(snd.soundMenuForTest().idx === adv, 'rig: could not reach the Advanced row');
    click(); ticks(3);                            /* into Advanced */
    let m = snd.soundMenuForTest();
    assert(m.key === 'adv' && m.depth === 1, 'did not descend: ' + JSON.stringify(m));
    back(); ticks(3);
    m = snd.soundMenuForTest();
    assert(snd.soundViewForTest() === VIEW_MENU && m.key === 'root' && m.depth === 0,
           'Back from a sub-level left the menu instead of climbing it: view ' +
           snd.soundViewForTest() + ' ' + JSON.stringify(m));
});

step('⭐⭐ Back at the TOP lands on the GRID, on the Module page you left — not the preset hub', () => {
    back(); ticks(4);
    assert(snd.soundViewForTest() === VIEW_EDIT, 'view is ' + snd.soundViewForTest() + ', not the editor');
    assert(pp().on, 'the grid did not come back');
    assert(pp().page && pp().page.name === 'Module', 'landed on "' + (pp().page && pp().page.name) + '"');
});

step('CONTROL: a module with NO hierarchy tree is not offered the row', () => {
    ASSIGN['master_fx:fx1:module'] = 'flatfx';
    delete ASSIGN['master_fx:fx1:ui_hierarchy'];
    snd.soundQueueDiscoverForTest(6);
    ticks(10);
    assert(snd.soundModuleIdForTest() === 'flatfx', 'rig: discovery did not re-run');
    const p = walkTo('Module');
    const labels = (p.entries || []).map(e => e.label);
    assert(labels.indexOf('Module Menu') < 0, 'a row that would only answer NO MENU: ' + JSON.stringify(labels));
    assert(labels.indexOf('Swap Module') >= 0, 'rig: the Module page is not the one we expect');
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
if (!failed) console.log('test_module_menu_row: all ok');
process.exit(failed);
}
main();
