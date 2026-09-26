/* tests/js/test_module_page_buses.mjs — BUSES on dAVEBOx's own Module page
 * (Josh, 2026-09-26: "Just another way in to the same interface as the buses
 * item on sound menu").
 *
 * Performs the gesture on the real editor of a TRACK synth that splits its
 * voices: walk to the Module page, click in, click Buses — the bus list is on
 * screen, the SAME screen the Sound menu's Buses row opens; a bus opens; Back
 * climbs out of it, and Back at the list lands on the Module page. CONTROL: a
 * synth that declares no voices gets no row.
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
FILES[MB + 'emptyfx/module.json'] = '{"id":"emptyfx"}';
FILES[MB + 'emptyfx/help.json']   = '{"title":"Empty","children":[]}';   /* parses, has no topics */
const SG = '/data/UserData/schwung/modules/sound_generators/';
FILES[SG + 'trksynth/module.json'] = '{"id":"trksynth"}';
FILES[SG + 'trksynth/help.json']   = JSON.stringify({ title: 'TrkSynth', children: [{ title: 'Overview', lines: ['A synth.'] }] });
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

const VIEW_EDIT = 1, VIEW_MODBUS = 30, VIEW_MODBUS_GROUP = 31;   /* ui_sound.mjs's view enum */
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const pp    = () => snd.soundPPForTest();
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
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
const labelsOf = () => ((pp().page && pp().page.entries) || []).map(e => e.label);
const screen = () => { printCalls = []; snd.soundRender(); return printCalls.map(c => c.text); };

const VOICES = JSON.stringify([{ id: 'bd', label: 'Kick' }, { id: 'sd', label: 'Snare' }]);
const CONFIG = JSON.stringify({
    buses: [{ present: 1, name: 'Drums', orphans: 0, voices: ['bd'], sends: [0, 0], fx: [] }],
    main_sends: [0, 0],
});
function openTrackEditor(splits) {
    snd.soundExit(); ticks(2);
    ASSIGN['synth:module'] = 'trksynth';
    ASSIGN['synth:ui_hierarchy'] = HIER;
    ASSIGN['synth:chain_params'] = ASSIGN['master_fx:fx1:chain_params'];
    ASSIGN['synth:split_voices'] = splits ? VOICES : '';
    ASSIGN['buses:config'] = CONFIG;
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = 1;
    snd.soundEnter(1, 1); ticks(4);
    for (let g = 0; snd.soundViewForTest() !== VIEW_EDIT; g++) {
        assert(g < 8, 'rig: never reached the module editor, view ' + snd.soundViewForTest());
        click(); ticks(4);
    }
    ticks(10);
    walkTo('Module');
}

step('⭐ a synth that splits its voices: the Module page offers Buses, before Swap Module', () => {
    openTrackEditor(true);
    const l = labelsOf();
    assert(l.includes('Buses'), 'no Buses row: ' + JSON.stringify(l));
    assert(l.indexOf('Buses') === l.indexOf('Swap Module') - 1, 'Buses not just above Swap Module: ' + JSON.stringify(l));
});
step('⭐⭐ THE GESTURE: click in, jog to Buses, click — the bus list is on screen', () => {
    click(); ticks(1);
    const at = labelsOf().indexOf('Buses');
    for (let i = 0; i < at; i++) { jog(1); ticks(1); }
    click(); ticks(3);
    assert(snd.soundViewForTest() === VIEW_MODBUS, 'view is ' + snd.soundViewForTest());
    const t = screen();
    assert(t.some((s) => s.indexOf('Drums') >= 0), 'the bus list is not drawn: ' + JSON.stringify(t));
});
step('a bus opens from there, and Back climbs back to the list', () => {
    click(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_MODBUS_GROUP, 'the bus did not open, view ' + snd.soundViewForTest());
    back(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_MODBUS, 'Back from a bus left the list, view ' + snd.soundViewForTest());
});
step('⭐ Back at the bus list lands on the Module page, not the Sound menu', () => {
    back(); ticks(2);
    assert(snd.soundViewForTest() === VIEW_EDIT && pp().on && pp().page && pp().page.name === 'Module',
           'view ' + snd.soundViewForTest() + ' page ' + (pp().page && pp().page.name));
});
step('⚠ CONTROL: a synth that declares NO voices gets no Buses row; Swap is still there', () => {
    openTrackEditor(false);
    const l = labelsOf();
    assert(!l.includes('Buses') && l.includes('Swap Module'), 'rows: ' + JSON.stringify(l));
    assert(swallowed === null, 'an exception was swallowed: ' + swallowed);
});

if (failed) { console.log('FAIL: module page buses'); process.exit(1); }
console.log('PASS: Buses opens from the Module page and backs into it');
}
main().catch(e => { console.error(e); process.exit(1); });
