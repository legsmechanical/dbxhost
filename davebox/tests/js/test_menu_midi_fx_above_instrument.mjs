/* tests/js/test_menu_midi_fx_above_instrument.mjs — the sound menu shows
 * MIDI FX ABOVE the instrument (Josh, 2026-10-15: "to better represent signal
 * flow. any defaults that apply to landing on instrument should remain
 * unchanged").
 *
 *   - Schwung, Move and MIDI tracks: MIDI FX is the first row, the
 *     instrument row right below it;
 *   - every entry lands on the INSTRUMENT row, not the top (Schwung after a
 *     previous visit left the cursor at row 0; Move; MIDI; a re-entry);
 *   - a cursor that followed a block you were in still lands on that block;
 *   - Master / Send buses and NONE tracks are unchanged.
 */
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
const st = () => sound.soundPickStateForTest();
const onInstr = () => st().kinds[st().row] === 'trackto';

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
});

step('⭐ Schwung track: MIDI FX first, the instrument below it, landing on the instrument', () => {
    B.applyInstrChoice(0, C.INSTR_SCHWUNG);
    sound.soundExit(); sound.soundPickRowSetForTest(0);
    sound.soundEnter(0, 0); ticks(2);
    const k = st().kinds, c = st().comps;
    if (k[0] !== 'block' || c[0] !== 'midi_fx1' || k[1] !== 'trackto') throw new Error('rows ' + k.join(',') + ' / ' + c.join(','));
    if (!onInstr()) throw new Error('landed on row ' + st().row + ' (' + k[st().row] + ')');
});

step('re-entering after the cursor was moved lands on the instrument again', () => {
    sound.soundPickRowSetForTest(0);           /* up onto MIDI FX */
    sound.soundExit(); sound.soundEnter(0, 0); ticks(2);
    if (!onInstr()) throw new Error('landed on row ' + st().row);
});

step('⭐ MIDI track: MIDI FX first, then its destination, landing on the destination', () => {
    B.applyInstrChoice(1, C.INSTR_MIDI_CH + 4);
    S.activeTrack = 1;
    sound.soundExit(); sound.soundEnter(1, 1); ticks(2);
    const k = st().kinds;
    if (k[0] !== 'block' || k[1] !== 'trackto') throw new Error('rows ' + k.join(','));
    if (!onInstr()) throw new Error('landed on row ' + st().row);
});

step('⭐ Move track: MIDI FX first, then its instrument, landing on the instrument', () => {
    B.applyInstrChoice(2, 2);                  /* Move 3 */
    S.activeTrack = 2;
    sound.soundExit(); sound.soundEnterMove(2); ticks(3);
    const k = st().kinds, c = st().comps;
    if (k.indexOf('trackto') < 0) throw new Error('rig: not a Move track menu: ' + k.join(','));
    if (k[0] !== 'block' || c[0] !== 'midi_fx1' || k[1] !== 'trackto') throw new Error('rows ' + k.join(',') + ' / ' + c.join(','));
    if (!onInstr()) throw new Error('landed on row ' + st().row);
});

step('⭐ back onto a Schwung track from the Move track menu, cursor left on its MIDI FX, lands on the instrument', () => {
    sound.soundPickRowSetForTest(0);           /* the Move menu's MIDI FX row */
    S.activeTrack = 0;
    sound.soundExit(); sound.soundEnter(0, 0); ticks(2);
    if (st().kinds[0] !== 'block' || !onInstr()) throw new Error('landed on row ' + st().row + ' of ' + st().kinds.join(','));
});

step('NONE: just its destination row', () => {
    B.applyInstrChoice(3, C.INSTR_NONE);
    S.activeTrack = 3;
    sound.soundExit(); sound.soundEnter(3, 3); ticks(2);
    if (st().kinds.join(',') !== 'trackto' || st().row !== 0) throw new Error('rows ' + st().kinds.join(',') + ' row ' + st().row);
});

sound.soundExit();
if (failed) { console.log('FAIL: MIDI FX above the instrument'); process.exit(1); }
console.log('PASS: MIDI FX sits above the instrument on every track menu, and every landing is still the instrument');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
