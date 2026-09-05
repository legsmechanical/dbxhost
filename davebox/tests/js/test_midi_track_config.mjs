/* tests/js/test_midi_track_config.mjs — item 14 (Josh, 2026-09-05): "Midi
 * channel sound menu needs all relevant params exposed (anything from the other
 * track type sound menus that would also apply to midi tracks)."
 *
 * A MIDI-routed track's sound menu used to be its destination row alone. It now
 * carries the CONFIG door, and the config screen offers every davebox-side
 * track setting that is a property of the note stream — all but the Looper,
 * which records an instrument the track does not have. NONE stays collapsed;
 * a Schwung track's menu is untouched. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const sound = await import('../../ui/ui_sound.mjs');

function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) { for (let i = 0; i < n; i++) globalThis.tick(); }
function kinds() { return sound.soundPickStateForTest().kinds; }
/* Enter sound mode on a track the way the tick does for its route, then read
 * the menu. soundEnter is the Schwung/EXT flavour (a MIDI track has no bus). */
function menuFor(t) { sound.soundExit(); sound.soundEnter(t, t); ticks(2); return kinds(); }
function configRowsFor(t) {
    menuFor(t);
    sound.soundQueueActionForTest({ t: 'slotcfg', which: 'config' });
    ticks(2);
    return sound.soundSlotRowsForTest();
}

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
});
step('CONTROL: a Schwung track\'s menu still has its blocks, levels and doors', () => {
    B.applyInstrChoice(0, C.INSTR_SCHWUNG);
    const k = menuFor(0);
    if (k[0] !== 'trackto') throw new Error('first row ' + k[0]);
    if (!k.includes('block') || !k.includes('buslevel')) throw new Error('Schwung menu lost rows: ' + k.join(','));
});
step('a MIDI-routed track\'s menu is its destination + the CONFIG door, nothing else', () => {
    B.applyInstrChoice(1, C.INSTR_MIDI_CH + 4);
    if (S.trackRoute[1] !== 2) throw new Error('route=' + S.trackRoute[1]);
    S.activeTrack = 1;
    const k = menuFor(1);
    if (k.join(',') !== 'trackto,config') throw new Error('rows: ' + k.join(','));
});
step('a NONE track stays collapsed to the row that picks an instrument', () => {
    B.applyInstrChoice(2, C.INSTR_NONE);
    S.activeTrack = 2;
    const k = menuFor(2);
    if (k.join(',') !== 'trackto') throw new Error('rows: ' + k.join(','));
});
step('the MIDI track\'s CONFIG screen: mode, layout, transpose, velin, afttch — and NO looper', () => {
    S.activeTrack = 1;
    const keys = configRowsFor(1);
    for (const want of ['mode', 'layout', 'transpose', 'velin', 'afttch'])
        if (!keys.includes(want)) throw new Error('missing ' + want + ' in ' + keys.join(','));
    if (keys.includes('looper')) throw new Error('Looper offered to a MIDI track: ' + keys.join(','));
    if (sound.soundPickStateForTest().view === 0) throw new Error('the config door did not open');
});
step('CONTROL: the same screen on a Schwung track still has the Looper', () => {
    S.activeTrack = 0;
    const keys = configRowsFor(0);
    if (!keys.includes('looper')) throw new Error('Schwung track lost its Looper: ' + keys.join(','));
});
step('the config screen SURVIVES the tick on a MIDI track (no follow kicks it out)', () => {
    S.activeTrack = 1;
    configRowsFor(1);
    const v0 = sound.soundPickStateForTest().view;
    ticks(30);
    const v1 = sound.soundPickStateForTest().view;
    if (v1 !== v0) throw new Error('view changed under the tick: ' + v0 + ' -> ' + v1);
    if (!sound.soundSlotRowsForTest().includes('transpose')) throw new Error('rows lost under the tick');
});

if (failed) process.exit(1);
}
main().catch((e) => { bad('main', e); process.exit(1); });
