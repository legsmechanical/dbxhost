
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_session_shift_loop.mjs — SHIFT + LOOP IN SESSION VIEW IS ONLY THE LATCH TOGGLE.
 *
 * The press toggled Perf Latch and returned; the RELEASE fell into the
 * Performance Mode hold-release with the time of the last plain Loop press,
 * so it read as a long hold: it cleared the held modifiers, re-sent them and
 * stopped a running loop. The Track View gesture had a test; this had none. */

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

S.clockFollowTicks = true; S.tickCount = 5000;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = true; S.activeTrack = 2;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const LOOP = 58, SHIFT = 49;

step('Shift + Loop toggles the latch and leaves a running loop and its modifiers alone', () => {
    S.perfViewLocked = false; S.perfLatchMode = false;
    S.perfStack = [{ idx: 0, ticks: 48 }]; S.perfStickyLengths = new Set(); S.perfHoldPadHeld = false;
    S.perfModsHeld = 5; S.loopPressTick = 0;          /* the last plain press was long ago */
    cc(SHIFT, 127);
    sets.length = 0;
    cc(LOOP, 127); cc(LOOP, 0);
    cc(SHIFT, 0);
    if (S.perfLatchMode !== true) throw new Error('the latch did not toggle');
    if (S.perfModsHeld !== 5) throw new Error('held modifiers were dropped: ' + S.perfModsHeld);
    if (S.perfStack.length !== 1) throw new Error('the loop stack was cleared');
    const bad = sets.filter(([k]) => k === 'looper_stop' || k === 'perf_mods' || k === 'looper_arm');
    if (bad.length) throw new Error('the release wrote ' + JSON.stringify(bad));
});

step('control: a plain long hold of Loop still ends Performance Mode on release', () => {
    S.perfStack = [{ idx: 0, ticks: 48 }]; S.perfModsHeld = 5; S.perfViewLocked = false;
    sets.length = 0;
    cc(LOOP, 127);
    S.tickCount += 200;                               /* well past a tap */
    cc(LOOP, 0);
    if (!sets.some(([k]) => k === 'looper_stop')) throw new Error('the loop was not stopped');
    if (S.perfModsHeld !== 0) throw new Error('held modifiers survived');
});

process.exit(failed);
}
main();
