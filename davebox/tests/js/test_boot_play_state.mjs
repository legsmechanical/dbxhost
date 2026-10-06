
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_boot_play_state.mjs — A STOPPED ENGINE BOOTS STOPPED.
 *
 * init() set S.playing from "did the engine answer", not from what it
 * answered: `playing` reads '0' or '1', and both are non-null. So every boot
 * onto a live, stopped engine started the UI "playing" until the first poll —
 * a fake stop edge (a save, a record disarm) and a green Play light. */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const sets = [];
const leds = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); };
let metroBeat = 0;
let playing = '0';
globalThis.host_module_get_param = (k) => (k === 'playing' ? playing : '');
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {};
globalThis.move_midi_external_send = () => {};
/* ⚠ BOTH channels: davebox paints some surfaces through set_led and others as
 * raw CC through move_midi_internal_send. A rig that watches one of them
 * reports "nothing painted" for a screen that is painting. */
globalThis.set_led = (cc, v) => { leds.push([cc, v]); };
/* ⚠ THE PACKET SHAPE: input_filter.setLED sends [CIN, status, note, colour] —
 * FOUR bytes with a USB-MIDI cable-index byte first, and the step buttons are
 * NOTES (0x09/NoteOn 16..31), not CCs. A stub matching a 3-byte CC message
 * captures nothing and the rig reports "no LEDs painted" for a screen that is
 * painting every tick. ⭑ setLED also CACHES: an unchanged colour sends
 * nothing, which is exactly what makes a FLASH observable — it only appears
 * when the colour actually changes. */
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4) leds.push([a[2], a[3]]);
    return true; };
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

globalThis.shadow_get_ui_flags = () => 0; globalThis.flush_display = () => {};
globalThis.host_register_primary = () => true; globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {}; globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.shadow_save_state_now = () => true;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');

step('a live engine that is stopped boots with S.playing false', () => {
    playing = '0'; S.playing = true;
    globalThis.init();
    if (S.playing !== false) throw new Error('S.playing = ' + S.playing);
});

step('control: a live engine that is playing boots with S.playing true', () => {
    playing = '1'; S.playing = false;
    globalThis.init();
    if (S.playing !== true) throw new Error('S.playing = ' + S.playing);
});

step('no engine answer boots stopped', () => {
    playing = null; S.playing = true;
    globalThis.init();
    if (S.playing !== false) throw new Error('S.playing = ' + S.playing);
});

process.exit(failed);
}
main();
