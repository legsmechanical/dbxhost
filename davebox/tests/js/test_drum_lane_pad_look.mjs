import './_bulk_get_stub.mjs';
/* tests/js/test_drum_lane_pad_look.mjs — the DRUM LANE bank wears its own pad
 * look so it cannot be taken for ALL LANES (Josh, 2026-10-08): the kit goes
 * grey, only the selected lane keeps the track's colour, and the velocity pads
 * take the dim track colour so the two halves still read apart.
 *
 * Runs the whole UI (ui.js + tick) and reads the pads back out of the LED
 * packets the painter sends. Lane 0 and 1 have hits, lane 2 has hits and is
 * muted, lane 3 is empty; velocity zone 12 is the last played.
 * CONTROL: ALL LANES (bank 7) keeps the look every bank had before.
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
globalThis.host_module_set_param = () => {};
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
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM, TRACK_PAD_BASE, TRACK_COLORS, TRACK_DIM_COLORS } = await import('../../ui/ui_constants.mjs');
const { White, LightGrey, DarkGrey } = await import('/data/UserData/schwung/shared/constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
S.trackPadMode[0] = PAD_MODE_DRUM; S.activeDrumLane[0] = 0; S.drumPerformMode[0] = 0;
S.drumStepPage[0] = 0; S.drumLastVelZone[0] = 12;
S.drumLaneHasNotes[0][0] = true; S.drumLaneHasNotes[0][1] = true; S.drumLaneHasNotes[0][2] = true;
S.drumLaneMute[0] = 1 << 2;                       /* lane 2: hits, muted */

const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const lanePad = (lane) => leds[TRACK_PAD_BASE + Math.floor(lane / 4) * 8 + (lane % 4)];
const zonePad = (zone) => leds[TRACK_PAD_BASE + Math.floor(zone / 4) * 8 + 4 + (zone % 4)];
const tc = TRACK_COLORS[0], td = TRACK_DIM_COLORS[0];
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[0] = b; ticks(3); };
const is = (got, want, what) => assert(got === want, what + ': got ' + got + ', want ' + want);

step('CONTROL: on ALL LANES the selected lane is White, hits wear the track colour, velocity is grey', () => {
    S.activeDrumLane[0] = 0; toBank(7);
    is(lanePad(0), White, 'selected lane');
    is(lanePad(1), tc, 'a lane with hits');
    is(lanePad(3), td, 'an empty lane');
    is(lanePad(2), 0, 'a muted lane');
    is(zonePad(12), White, 'the last velocity');
    is(zonePad(0), DarkGrey, 'another velocity pad');
});
step('⭐ DRUM LANE: the kit is grey and only the selected lane keeps the track colour', () => {
    toBank(0);
    is(lanePad(0), tc, 'selected lane');
    is(lanePad(1), LightGrey, 'a lane with hits');
    is(lanePad(3), DarkGrey, 'an empty lane');
    is(lanePad(2), 0, 'a muted lane stays off');
});
step('⭐ DRUM LANE: the velocity pads take the dim track colour, the last velocity stays White', () => {
    is(zonePad(12), White, 'the last velocity');
    for (let z = 0; z < 16; z++) if (z !== 12) is(zonePad(z), td, 'velocity pad ' + z);
});
step('DRUM LANE: an EMPTY selected lane is the dim track colour, still the only coloured lane', () => {
    S.activeDrumLane[0] = 3; ticks(3);
    is(lanePad(3), td, 'selected empty lane');
    is(lanePad(0), LightGrey, 'the lane that was selected');
    S.activeDrumLane[0] = 0; ticks(3);
});
step('DRUM LANE while playing: the same look (hits do not dim to the track colour)', () => {
    S.playing = true; ticks(3);
    is(lanePad(0), tc, 'selected lane'); is(lanePad(1), LightGrey, 'a lane with hits');
    S.playing = false; ticks(3);
});
step('DRUM LANE: Note Repeat on the right half is untouched', () => {
    S.drumPerformMode[0] = 1; ticks(3);
    is(zonePad(0), DarkGrey, 'a rate pad');
    S.drumPerformMode[0] = 0; ticks(3);
});
step('back on ALL LANES: the old look returns', () => {
    toBank(7);
    is(lanePad(0), White, 'selected lane'); is(lanePad(1), tc, 'a lane with hits'); is(zonePad(0), DarkGrey, 'a velocity pad');
});
}
main().then(() => process.exit(failed), (e) => { console.error(e); process.exit(1); });
