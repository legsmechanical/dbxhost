import './_bulk_get_stub.mjs';
/* tests/js/test_ext_midi_through_fx_on_move.mjs — a keyboard on a MOVE track
 * that plays through its MIDI FX (Josh, 2026-10-14: "external midi in bypasses
 * the midi fx").
 *
 * Move normally plays a Move track's keyboard itself, so the effect never saw
 * it. With the track's MIDI FX on (S.trackFxSlot), the host must hold its NOTES
 * back from Move (remap value 0x80 | channel) and the engine must PLAY them
 * ("eon"/"eoff", through the effect) instead of only capturing them. Its CC,
 * pressure and bend stay Move's: Move echoes those, so the engine must never
 * send them. Runs the whole UI through onMidiMessageExternal and the tick.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let STEP_VEL = '40';
const leds = {};                     /* note -> colour, NoteOn only */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => (/^t0_l0_step_\d+_vel$/.test(k) ? STEP_VEL : /_step_\d+_/.test(k) ? '0' : '');
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
const remap = {};                    /* in_ch -> value, as the host's table */
globalThis.host_ext_midi_remap_clear = () => { for (const k of Object.keys(remap)) delete remap[k]; };
globalThis.host_ext_midi_remap_set = (i, v) => { remap[i] = v; };
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
S.trackPadMode[1] = 0; S.activeTrack = 1; S.midiInChannel = 0;
const ext = (st, n, v) => globalThis.onMidiMessageExternal(new Uint8Array([st, n, v]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const live = (t) => sets.filter(([k]) => k === 't' + t + '_live_notes').map(([, v]) => v).join(' | ');
const is = (got, want, what) => assert(got === want, what + ': got "' + got + '", want "' + want + '"');

S.trackRoute[1] = 1; S.trackChannel[1] = 3;          /* Move instrument on channel 3 -> index 2 */
step('CONTROL: effect off — the remap passes notes to Move, the engine only captures', () => {
    S.trackFxSlot[1] = 0; ticks(2);
    assert(remap[0] === 2 && remap[2] === undefined, 'remap: ' + JSON.stringify(remap));
    sets.length = 0;
    ext(0x92, 60, 100); ticks(1); ext(0x82, 60, 0); ticks(1);
    is(live(1), 'con 60 100 | coff 60', 'capture only');
});
step('⭐⭐ effect on — the host holds the notes back from Move, on every channel incl. the track\'s own', () => {
    S.trackFxSlot[1] = 1; ticks(2);
    for (let i = 0; i < 16; i++) assert(remap[i] === (0x80 | 2), 'channel ' + i + ': ' + remap[i]);
});
step('⭐⭐ ...and the engine PLAYS the keyboard (through the effect), not just captures it', () => {
    sets.length = 0;
    ext(0x92, 60, 100); ticks(1); ext(0x82, 60, 0); ticks(1);
    is(live(1), 'eon 60 100 | eoff 60', 'played');
});
step('⭐ CC / bend never go through the engine (Move echoes them: no cascade)', () => {
    sets.length = 0;
    ext(0xB2, 1, 64); ext(0xE2, 0, 70); ticks(1);
    is(live(1), '', 'continuous controllers');
});
step('⭐ a note held across switching the effect OFF still closes in the engine', () => {
    sets.length = 0;
    ext(0x92, 64, 90); ticks(1);
    S.trackFxSlot[1] = 0;
    ext(0x82, 64, 0); ticks(1);
    is(live(1), 'eon 64 90 | eoff 64', 'held across the switch');
});
step('⭐ a note held across a TRACK switch is closed in the engine (its off will be filtered out)', () => {
    S.trackFxSlot[1] = 1; ticks(2); sets.length = 0;
    ext(0x92, 67, 90); ticks(1);
    S.activeTrack = 2; S.trackRoute[2] = 0; ticks(2);
    assert(/eoff 67/.test(live(1)), 'not closed: "' + live(1) + '"');
    S.activeTrack = 1;
});
step('a drum Move track with its effect on: the hit is played too', () => {
    S.trackPadMode[1] = PAD_MODE_DRUM; S.trackFxSlot[1] = 1; ticks(2); sets.length = 0;
    ext(0x92, 36, 110); ticks(1); ext(0x82, 36, 0); ticks(1);
    is(live(1), 'eon 36 110 | eoff 36', 'drum hit');
    S.trackPadMode[1] = 0;
});
if (failed) { console.log('FAIL: external MIDI through MIDI FX on a Move track'); process.exit(1); }
console.log('PASS: external MIDI through MIDI FX on a Move track');
process.exit(0);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
