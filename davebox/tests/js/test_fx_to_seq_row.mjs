/* tests/js/test_fx_to_seq_row.mjs — NOTES TO SEQ on a MIDI effect's Module page.
 *
 * A MIDI effect that generates notes (a drum pattern from the clock, an
 * arpeggio) plays them on its instrument only. Its Module page carries a row,
 * "Notes to Seq", that also sends them to the sequencer, so Record and Capture
 * take them. It is offered only where it means something: a track's MIDI FX
 * block holding a module that declares `capabilities.pre_capable`.
 *
 * Performs the gesture on the real editor: open the track's MIDI FX block,
 * walk to the Module page, click in, land on the row, click. Asserts what is
 * on the page, what is written to the instrument (`midi_fx_to_host`), and
 * that the project is saved. CONTROLS: a MIDI effect that does not declare it,
 * and the track's instrument, get no row.
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
        /* The instrument is the menu's first row (its door); a block is the
         * row that names its component. */
        const st = snd.soundPickStateForTest();
        const at = comp === 'synth' ? 0 : st.comps.indexOf(comp);
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

step('⭐⭐ a generating MIDI effect: its Module page offers Notes to Seq, reading Off, above Swap Module', () => {
    openBlock('midi_fx1');
    walkTo('Module');
    const l = labels();
    assert(l.includes('Notes to Seq'), 'rows: ' + JSON.stringify(l));
    assert(l.indexOf('Notes to Seq') < l.indexOf('Swap Module'), 'the row sits below the destructive ones: ' + JSON.stringify(l));
    assert(rowOf('Notes to Seq').value === 'Off', 'reads ' + rowOf('Notes to Seq').value);
    assert(!snd.soundFxToSeqForTest().on, 'the cached value is on');
});

step('⭐⭐ THE GESTURE: click the row — it reads On, the instrument is told, and the project is saved', () => {
    sets.length = 0; saves = 0;
    clickRow('Notes to Seq');
    assert(swallowed === null, 'a handler threw: ' + swallowed);
    const w = sets.filter((x) => x[1] === 'midi_fx_to_host');
    assert(w.length === 1 && w[0][0] === T && w[0][2] === '1', 'writes: ' + JSON.stringify(sets));
    assert(saves >= 1, 'the setting was not saved — it would revert on the next launch');
    assert(snd.soundViewForTest() === VIEW_EDIT && pp().on, 'the click left the editor, view ' + snd.soundViewForTest());
    assert(rowOf('Notes to Seq') && rowOf('Notes to Seq').value === 'On', 'the row still reads ' + JSON.stringify(rowOf('Notes to Seq')));
});

step('⭐ a second click turns it off again', () => {
    sets.length = 0;
    click(); ticks(3);                               /* the cursor is still on the row */
    const w = sets.filter((x) => x[1] === 'midi_fx_to_host');
    assert(w.length === 1 && w[0][2] === '0', 'writes: ' + JSON.stringify(sets));
    assert(rowOf('Notes to Seq').value === 'Off', 'reads ' + rowOf('Notes to Seq').value);
});

step('⭐ reopening the effect reads what the instrument holds (one read, at discovery)', () => {
    ASSIGN.midi_fx_to_host = '1';
    openBlock('midi_fx1');
    walkTo('Module');
    assert(rowOf('Notes to Seq').value === 'On', 'reads ' + rowOf('Notes to Seq').value);
    /* ...and nothing reads the device while the page is merely redrawn */
    let reads = 0;
    const was = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (slot, key) => { if (key === 'midi_fx_to_host') reads++; return was(slot, key); };
    try { for (let i = 0; i < 20; i++) { snd.soundRender(); ticks(1); } } finally { globalThis.shadow_get_param = was; }
    assert(reads === 0, 'the row read the device ' + reads + ' times while idle');
    ASSIGN.midi_fx_to_host = '0';
});

step('CONTROL: a MIDI effect that does not declare it gets no row — and the page still works', () => {
    ASSIGN['midi_fx1:module'] = 'plainfx';
    openBlock('midi_fx1');
    walkTo('Module');
    assert(!labels().includes('Notes to Seq'), 'rows: ' + JSON.stringify(labels()));
    assert(labels().includes('Swap Module'), 'the Module page lost its rows: ' + JSON.stringify(labels()));
    assert(!snd.soundFxToSeqForTest().offered, 'offered for a module without pre_capable');
    ASSIGN['midi_fx1:module'] = 'patgen';
});

step('CONTROL: the track\'s INSTRUMENT gets no row, whatever its module.json says', () => {
    openBlock('synth');
    walkTo('Module');
    assert(!labels().includes('Notes to Seq'), 'rows: ' + JSON.stringify(labels()));
});

if (swallowed !== null) { console.error('FAIL: a handler threw: ' + swallowed); failed = 1; }
if (failed) { console.log('FAIL: notes to seq row'); process.exit(1); }
console.log('PASS: Notes to Seq is offered on a generating MIDI effect, flips, writes, saves, and reads back');
}
main().catch((e) => { console.error(e); process.exit(1); });
