
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_tap_tempo.mjs — TAP TEMPO FINISHES ITS TAP.
 *
 * registerTapTempo named a local `nowMs` (wall time, for the intervals) over
 * the imported clock function of the same name, then called it for the pad
 * flash: a call on a number. Every tap threw after the BPM write, so the pad
 * never flashed and the screen never redrew. Nothing called the function in a
 * test. */

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
globalThis.host_module_get_param = (k) => (String(k).indexOf('metro_beat_count') >= 0 ? String(metroBeat) : '');
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

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { registerTapTempo } = await import('../../ui/ui_record.mjs');

S.clockFollowTicks = true; S.tickCount = 1000;
S.tapTempoTapTimes = []; S.tapTempoFlashPad = -1; S.tapTempoFlashTick = -1;

step('a tap completes: the pad flash is armed and the screen redraws', () => {
    S.screenDirty = false;
    registerTapTempo(92);
    if (S.tapTempoFlashPad !== 92) throw new Error('flash pad = ' + S.tapTempoFlashPad);
    if (!(S.tapTempoFlashTick >= 0)) throw new Error('flash time = ' + S.tapTempoFlashTick);
    if (!S.screenDirty) throw new Error('the screen was not marked for redraw');
});

step('the flash time is on the UI clock the LED painter compares against', () => {
    /* ui_leds: S.clockMs - S.tapTempoFlashTick < TAP_TEMPO_FLASH_MS. Wall time
     * here would never (or always) satisfy it. */
    if (Math.abs(S.tapTempoFlashTick - S.tickCount * 10.6) > 50)
        throw new Error('flash time ' + S.tapTempoFlashTick + ' is not the UI clock (' + (S.tickCount * 10.6) + ')');
});

step('two taps half a second apart set 120 BPM', () => {
    const real = Date.now; let t = 5000000;
    Date.now = () => t;
    try {
        S.tapTempoTapTimes = [];
        sets.length = 0;
        registerTapTempo(92); t += 500; registerTapTempo(92);
    } finally { Date.now = real; }
    if (S.tapTempoBpm !== 120) throw new Error('bpm = ' + S.tapTempoBpm);
    if (!sets.some(([k, v]) => k === 'bpm' && v === '120')) throw new Error('bpm was not written');
});

process.exit(failed);
}
main();
