
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_step_velocity_floor.mjs — THE STEP VELOCITY KNOB STOPS AT 1.
 *
 * The knob clamped to 0 and sent it; the engine floors a step velocity at 1.
 * So the screen read 0 for a step that still played at 1, and the first
 * detent back up appeared to do nothing. Melodic (K4) and drum (K2). */

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
const C = await import('../../ui/ui_constants.mjs');

S.clockFollowTicks = true; S.tickCount = 5000;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const knob = (k, d) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71 + k, d > 0 ? d : 128 + d]));
const velWrites = () => sets.filter(([k]) => /_step_\d+_vel$/.test(k));

for (const [name, mode, k] of [['melodic (K4)', C.PAD_MODE_MELODIC_SCALE ?? 0, 3], ['drum lane (K2)', C.PAD_MODE_DRUM, 1]]) {
    step(name + ': turning down from 3 stops at 1, on screen and on the wire', () => {
        S.activeTrack = 2; S.trackPadMode[2] = mode;
        S.heldStep = 4; S.heldStepNotes = [60]; S.stepEditVel = 3; S.stepReveal = true;
        sets.length = 0;
        for (let i = 0; i < 12; i++) knob(k, -1);
        const w = velWrites();
        if (!w.length) throw new Error('rig: the knob wrote no step velocity (sets: ' + JSON.stringify(sets.slice(0, 4)) + ')');
        const low = Math.min(...w.map(([, v]) => parseInt(v, 10)));
        if (low < 1) throw new Error('wrote velocity ' + low);
        if (S.stepEditVel !== 1) throw new Error('the screen value is ' + S.stepEditVel);
        S.heldStep = -1;
    });
}

process.exit(failed);
}
main();
