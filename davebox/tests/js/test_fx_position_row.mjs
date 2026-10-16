/* tests/js/test_fx_position_row.mjs — a MIDI FX module's Position: Post / Pre.
 *
 * Josh, 2026-10-14: every MIDI FX MODULE can sit Pre (what you play goes
 * through it and its output is what is recorded; playback skips it) or Post
 * (today's). The row replaced "Notes to Seq" on the module's own Module page.
 * This drives the REAL editor: open the MIDI FX block, walk to the Module
 * page, click the row, and read what reached the engine and the slot:
 *   - offered for EVERY MIDI FX module (the host cannot tell a transform from
 *     a generator), reading Post;
 *   - a click → Pre: the engine's tN_fxpre, the slot's midi_fx_host_route,
 *     and a save; a second click → Post (tN_fxpost; the slot still hands back);
 *   - a project still carrying the old "Notes to Seq" key opens as Pre, once,
 *     and the key is cleared;
 *   - the row reads a mirror: nothing is read from the device while idle;
 *   - the instrument's own Module page has no such row.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const HIER = JSON.stringify({ levels: { root: {
    name: 'Gen', params: [{ key: 'swing', name: 'Swing', type: 'int', min: 0, max: 100 }], knobs: ['swing'] } } });
const CP = JSON.stringify([{ key: 'swing', name: 'Swing', type: 'int', min: 0, max: 100, step: 1 }]);
const ASSIGN = {
    'synth:module': 'trksynth', 'synth:ui_hierarchy': HIER, 'synth:chain_params': CP, 'synth:swing': '0',
    'midi_fx1:module': 'patgen', 'midi_fx1:ui_hierarchy': HIER, 'midi_fx1:chain_params': CP, 'midi_fx1:swing': '0',
};
const sets = [];
let saves = 0;
globalThis.shadow_get_param = (slot, key) => (key in ASSIGN ? ASSIGN[key] : '');
globalThis.shadow_set_param = (slot, key, val) => { ASSIGN[key] = String(val); sets.push([slot, key, String(val)]); return 1; };
globalThis.shadow_save_state_now = () => { saves++; return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['fill_rect', 'draw_rect', 'stipple_rect', 'set_pixel', 'clear_screen', 'print', 'pixel_print', 'flush_display'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;
/* ⚠ Shift UP: the JS test build defaults it to HELD, and then every click on
 * the grid opens the section picker instead. */
globalThis.shadow_get_shift_held = () => 0;
/* ⚠ TRIPWIRE: the entry wrapper swallows exceptions into the jserr log. */
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
const FILES = {};
const MF = '/data/UserData/schwung/modules/midi_fx/';
const SG = '/data/UserData/schwung/modules/sound_generators/';
FILES[MF + 'patgen/module.json']   = JSON.stringify({ id: 'patgen', capabilities: { component_type: 'midi_fx', pre_capable: true } });
FILES[MF + 'plainfx/module.json']  = JSON.stringify({ id: 'plainfx', capabilities: { component_type: 'midi_fx' } });
/* a synth that (wrongly) declares it must still get no row: it is not a MIDI effect */
FILES[SG + 'trksynth/module.json'] = JSON.stringify({ id: 'trksynth', capabilities: { pre_capable: true } });
for (const fn of ['host_ensure_dir', 'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 ? '' : 0);
globalThis.host_read_file = (p) => FILES[p] || '';
/* the engine's writes, in order (tN_fxpre / tN_fxpost) */
const dsp = [];
globalThis.host_module_set_param = (k, v) => { dsp.push([k, String(v)]); };
globalThis.host_file_exists = (p) => p in FILES;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const VIEW_EDIT = 1;
const T = 1;
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const pp    = () => snd.soundPPForTest();
const click = () => { cc(3, 127); cc(3, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const rows  = () => ((pp().page && pp().page.entries) || []);
const labels = () => rows().map((e) => e.label);
const rowOf = (label) => rows().find((e) => e.label === label) || null;

/* Open the block that holds component `comp` on track T, to its editor. */
function openBlock(comp) {
    snd.soundExit(); ticks(2);
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = T;
    snd.soundEnter(T, T); ticks(4);
    {
        /* The instrument is its own row (its door); a block is the row that
         * names its component. */
        const st = snd.soundPickStateForTest();
        const at = comp === 'synth' ? st.kinds.indexOf('trackto') : st.comps.indexOf(comp);
        if (at < 0) throw new Error('rig: no ' + comp + ' row on the sound menu: ' + JSON.stringify(st));
        snd.soundPickRowSetForTest(at);
    }
    for (let g = 0; snd.soundViewForTest() !== VIEW_EDIT; g++) {
        if (g >= 8) throw new Error('rig: never reached the module editor, view ' + snd.soundViewForTest());
        click(); ticks(4);
    }
    ticks(10);
    if (!pp().on) throw new Error('rig: the grid did not take the screen');
    if (snd.soundCompForTest() !== comp) throw new Error('rig: opened ' + snd.soundCompForTest() + ', wanted ' + comp);
}
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
/* Click the Module-page row called `label`, by the real gesture. */
function clickRow(label) {
    click(); ticks(1);                               /* into the page (a door) */
    const at = labels().indexOf(label);
    if (at < 0) throw new Error('no "' + label + '" row: ' + JSON.stringify(labels()));
    for (let i = 0; i < at; i++) { jog(1); ticks(1); }
    click(); ticks(3);
}

const fxpreW = () => dsp.filter(([k]) => k === 't' + T + '_fxpre').map(([, v]) => v);
const routeW = () => sets.filter((x) => x[1] === 'midi_fx_host_route' && x[0] === T).map((x) => x[2]);

step('⭐⭐ a MIDI FX module\'s Module page offers Position, reading Post, above Swap Module', () => {
    openBlock('midi_fx1');
    walkTo('Module');
    const l = labels();
    assert(l.includes('Position'), 'rows: ' + JSON.stringify(l));
    assert(!l.includes('Notes to Seq'), 'the retired row is back: ' + JSON.stringify(l));
    assert(l.indexOf('Position') < l.indexOf('Swap Module'), 'the row sits below the destructive ones: ' + JSON.stringify(l));
    assert(rowOf('Position').value === 'Post', 'reads ' + rowOf('Position').value);
});

step('⭐⭐ THE GESTURE: click it — Pre: the engine and the slot are told, and it is saved', () => {
    sets.length = 0; dsp.length = 0; saves = 0;
    clickRow('Position');
    assert(swallowed === null, 'a handler threw: ' + swallowed);
    assert(fxpreW().join() === '1', 'engine writes: ' + JSON.stringify(dsp));
    assert(routeW().join() === '1', 'the slot was not told to hand its output back: ' + JSON.stringify(sets));
    assert(GS.trackFxPre[T] === 1, 'the mirror did not follow');
    assert(saves >= 1, 'the setting was not saved — it would revert on the next launch');
    assert(snd.soundViewForTest() === VIEW_EDIT && pp().on, 'the click left the editor, view ' + snd.soundViewForTest());
    assert(rowOf('Position') && rowOf('Position').value === 'Pre', 'the row reads ' + JSON.stringify(rowOf('Position')));
});

step('⭐ a second click puts it back to Post — the module still runs first, so the slot still hands back', () => {
    sets.length = 0; dsp.length = 0;
    click(); ticks(3);                               /* the cursor is still on the row */
    const fxpostW = dsp.filter(([k]) => k === 't' + T + '_fxpost').map(([, v]) => v);
    assert(fxpreW().join() === '0' && fxpostW.join() === '1' && routeW().join() === '1', 'writes: ' + JSON.stringify([dsp, sets]));
    assert(rowOf('Position').value === 'Post', 'reads ' + rowOf('Position').value);
});

step('⭐ EVERY module gets it — one that declares nothing too', () => {
    ASSIGN['midi_fx1:module'] = 'plainfx';
    openBlock('midi_fx1');
    walkTo('Module');
    assert(labels().includes('Position'), 'rows: ' + JSON.stringify(labels()));
    assert(snd.soundFxPositionForTest().offered, 'not offered');
    ASSIGN['midi_fx1:module'] = 'patgen';
});

step('⭐ an OLD project\'s "Notes to Seq" opens as Pre, once, and the old key is cleared', () => {
    GS.trackFxPre[T] = 0;
    ASSIGN.midi_fx_to_host = '1';
    sets.length = 0; dsp.length = 0;
    openBlock('midi_fx1');
    walkTo('Module');
    assert(rowOf('Position').value === 'Pre', 'reads ' + rowOf('Position').value);
    assert(fxpreW().includes('1') && routeW().includes('1'), 'not migrated: ' + JSON.stringify([dsp, sets]));
    assert(ASSIGN.midi_fx_to_host === '0', 'the old key was left on (its recorder would run as well)');
});

step('⭐ the row reads a mirror: nothing is read from the device while the page is redrawn', () => {
    let reads = 0;
    const was = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (slot, key) => { if (/fxpre|midi_fx_to_host|host_route/.test(key)) reads++; return was(slot, key); };
    try { for (let i = 0; i < 20; i++) { snd.soundRender(); ticks(1); } } finally { globalThis.shadow_get_param = was; }
    assert(reads === 0, 'the row read the device ' + reads + ' times while idle');
});

step('CONTROL: the track\'s INSTRUMENT gets no Position row', () => {
    openBlock('synth');
    walkTo('Module');
    assert(!labels().includes('Position'), 'rows: ' + JSON.stringify(labels()));
});

if (swallowed !== null) { console.error('FAIL: a handler threw: ' + swallowed); failed = 1; }
if (failed) { console.log('FAIL: MIDI FX Position row'); process.exit(1); }
console.log('PASS: every MIDI FX module offers Position; Pre/Post reach the engine and the slot, save, and migrate');
}
main().catch((e) => { console.error(e); process.exit(1); });
