/* tests/js/test_module_help_row.mjs — MODULE HELP on dAVEBOx's own Module page
 * (upstream #372, ported for dAVEBOx; Josh 2026-09-22: "yep").
 *
 * Performs the gesture on the real editor: walk to the Module page, click in,
 * click Module Help — the module's topics are on screen; open a topic — its
 * text is on screen; a nested topic opens a second list; Back climbs, and Back
 * at the topic list lands on the Module page. CONTROLS: a module with no help
 * file, and one with a broken help file, get no row — and the page still works.
 */

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
    /* Non-empty state, or saveUserPreset bails with 'NO STATE' before ever
     * touching S.presetRec — needed for the My Presets save-flow step below. */
    'master_fx:fx1:state': '{"room_size":4,"mix":0.35}',
};
globalThis.shadow_get_param = (slot, key) => ASSIGN[key] || '';
globalThis.shadow_set_param = (slot, key, val) => { ASSIGN[key] = String(val); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.clear_screen = () => {};
/* Recorded, not a no-op — the My Presets row-overlap regression test below
 * needs to see where every print() lands. */
let printCalls = [];
globalThis.print = (x, y, text) => { printCalls.push({ x, y, text: String(text) }); };
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
const FILES = {};
const MB = '/data/UserData/schwung/modules/audio_fx/';
const HELP = { title: 'RRVerb', children: [
    { title: 'Overview', lines: ['A small reverb.', 'Room sets the size.', 'Mix blends wet', 'and dry.', 'Damp darkens', 'the tail.', 'Last line here.'] },
    { title: 'Advanced', children: [ { title: 'Damping', lines: ['Damp is a one-pole', 'filter in the loop.'] } ] },
] };
FILES[MB + 'rrverb/module.json'] = '{"id":"rrverb"}';
FILES[MB + 'rrverb/help.json']   = JSON.stringify(HELP);
FILES[MB + 'flatfx/module.json'] = '{"id":"flatfx"}';            /* no help.json */
FILES[MB + 'badfx/module.json']  = '{"id":"badfx"}';
FILES[MB + 'badfx/help.json']    = '{ this is not json';
for (const fn of ['host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.host_read_file = (p) => FILES[p] || '';
globalThis.host_file_exists = (p) => p in FILES;

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
/* Page backward until `name` — 'My Presets' sits one page before the trailing
 * 'Module' page, which has no wraparound past it, so getting there from
 * 'Module' means going back rather than forward. */
function walkBackTo(name) {
    for (let guard = 0; guard < 40; guard++) {
        const p = pp().page;
        if (p && p.name === name) return p;
        const before = p && p.name;
        jog(-1); ticks(2);
        if ((pp().page && pp().page.name) === before) break;
    }
    throw new Error('never reached the "' + name + '" page going backward');
}


const VIEW_HELP = 34;
const labelsOf = () => ((pp().page && pp().page.entries) || []).map(e => e.label);
const screen = () => { printCalls = []; snd.soundRender(); return printCalls.map(c => c.text); };
function reenter(moduleId) {
    snd.soundExit(); ticks(2);
    ASSIGN['master_fx:fx1:module'] = moduleId;
    enterMasterFxBlock();
}

step('⭐ the Module page offers Module Help between Module Menu and Swap Module', () => {
    enterMasterFxBlock();
    walkTo('Module');
    const l = labelsOf();
    assert(JSON.stringify(l) === JSON.stringify(['Module Menu', 'Module Help', 'Swap Module', 'Remove Module']),
           'rows: ' + JSON.stringify(l));
});
step('⭐⭐ THE GESTURE: click in, jog to Module Help, click — the topics are on screen', () => {
    click(); ticks(1);                 /* into the page (a door) */
    jog(1); ticks(1);                  /* Module Menu -> Module Help */
    click(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_HELP, 'view is ' + snd.soundViewForTest());
    const t = screen();
    assert(t.includes('Overview') && t.includes('Advanced'), 'topics not drawn: ' + JSON.stringify(t));
});
step('clicking a topic shows its text, as written (mixed case)', () => {
    click(); ticks(1);
    const t = screen();
    assert(t.includes('A small reverb.'), 'text not drawn: ' + JSON.stringify(t));
});
step('the jog scrolls the text; it stops at the end', () => {
    for (let i = 0; i < 10; i++) { jog(1); ticks(1); }
    const t = screen();
    assert(t.includes('Last line here.') && !t.includes('A small reverb.'), 'not scrolled to the end: ' + JSON.stringify(t));
});
step('⚠ a text line gets the full width: it starts 1px from the edge, not the list\'s 3px', () => {
    const c = (printCalls.find(x => x.text === 'Last line here.') || {});
    assert(c.x === 1, 'text line x = ' + c.x);
});
step('the knobs do nothing on the help screen', () => {
    const before = JSON.stringify(ASSIGN);
    cc(71, 1); cc(72, 1); ticks(1);
    assert(JSON.stringify(ASSIGN) === before && snd.soundViewForTest() === VIEW_HELP, 'a knob changed something');
});
step('Back from the text returns to the topic list', () => {
    back(); ticks(1);
    const t = screen();
    assert(snd.soundViewForTest() === VIEW_HELP && t.includes('Overview'), 'not on the list: ' + JSON.stringify(t));
});
step('a nested topic opens a second list; Back climbs out of it', () => {
    jog(1); ticks(1); click(); ticks(1);          /* Advanced */
    let t = screen();
    assert(t.includes('Damping'), 'nested list not drawn: ' + JSON.stringify(t));
    click(); ticks(1);
    t = screen();
    assert(t.includes('Damp is a one-pole'), 'nested text not drawn: ' + JSON.stringify(t));
    back(); ticks(1); back(); ticks(1);
    assert(screen().includes('Overview'), 'did not climb to the top list');
});
step('⭐ Back at the topic list lands on the Module page, not out of the editor', () => {
    back(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_EDIT && pp().on && pp().page && pp().page.name === 'Module',
           'view ' + snd.soundViewForTest() + ' page ' + (pp().page && pp().page.name));
});
step('⚠ CONTROL: a module with NO help file gets no Module Help row; Swap is still there', () => {
    reenter('flatfx');
    walkTo('Module');
    const l = labelsOf();
    assert(!l.includes('Module Help') && l.includes('Swap Module'), 'rows: ' + JSON.stringify(l));
});
step('⚠ CONTROL: a BROKEN help file means no row, and nothing thrown', () => {
    reenter('badfx');
    walkTo('Module');
    const l = labelsOf();
    assert(!l.includes('Module Help') && l.includes('Swap Module'), 'rows: ' + JSON.stringify(l));
    assert(swallowed === null, 'an exception was swallowed: ' + swallowed);
});

if (failed) { console.log('FAIL: module help'); process.exit(1); }
console.log('PASS: Module Help opens from the Module page, reads, scrolls, climbs back');
}
main().catch(e => { console.error(e); process.exit(1); });
