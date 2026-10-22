import './_bulk_get_stub.mjs';
/* tests/js/test_drum_lane_select_one_read.mjs — pressing a drum lane pad reads
 * the lane on ONE round trip.
 *
 * Measured on the device 2026-10-22: a press that changed lanes read eight lane
 * keys one at a time, ~3 ms each — 23 ms with the JS thread blocked before the
 * press finished. The sound never waited (the engine plays pads itself); the
 * lights, the screen and the next input did.
 *
 * Performs the GESTURE through the whole UI (ui.js + onMidiMessageInternal), and
 * checks the lane's values ARRIVE as well as how many trips they took — a press
 * that read nothing at all would also make zero single reads.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

/* Lane 5 of track 0, as the engine would answer it. */
const LANE = {
    t0_l5_steps: '1000100010001000' + '0'.repeat(240),
    t0_l5_length: '32',
    t0_l5_loop_start: '16',
    t0_l5_tps: '12',
    t0_l5_pfx_snapshot: '50 3 0 1 2 3 4 5 6 7 1',
    t0_l5_playback_dir: '2',
    t0_l5_playback_audio_reverse: '1',
    t0_l5_repeat_state: '170 ' + '90 '.repeat(8) + '0 '.repeat(9) + '4',
};
const singles = [];      /* lane keys read one at a time */
let bulks = 0;
let counting = false;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
const answer = (k) => (LANE[k] !== undefined ? LANE[k] : '');
globalThis.host_module_get_param = (k) => { if (counting && /^t0_l5_/.test(k)) singles.push(k); return answer(k); };
const bulkStub = globalThis.host_module_get_params;
globalThis.host_module_get_params = (blob) => {
    if (counting) bulks++;
    const was = counting; counting = false;      /* the stub resolves through the single read */
    try { return bulkStub(blob); } finally { counting = was; }
};
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM, TRACK_PAD_BASE } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.playing = false; S.activeBank = 0;
S.trackPadMode[0] = PAD_MODE_DRUM; S.activeDrumLane[0] = 0; S.drumPerformMode[0] = 0;
S.drumLanePage[0] = 0; S.drumStepPage[0] = 0;

const note = (st, n, v) => globalThis.onMidiMessageInternal(new Uint8Array([st, n, v]));
/* Lane 5 = row 1, column 1 of the left 4x4. */
const LANE5_PAD = TRACK_PAD_BASE + 1 * 8 + 1;

step('pressing lane 5\'s pad selects it and its values ARRIVE (control: the read happened)', () => {
    counting = true;
    try { note(0x90, LANE5_PAD, 100); } finally { counting = false; }
    note(0x80, LANE5_PAD, 0);
    assert(S.activeDrumLane[0] === 5, 'active lane ' + S.activeDrumLane[0]);
    assert(S.drumLaneSteps[0][5][4] === '1' && S.drumLaneSteps[0][5][1] === '0', 'steps not read');
    assert(S.drumLaneLength[0] === 32, 'length ' + S.drumLaneLength[0]);
    assert(S.drumLaneLoopStart[0] === 16, 'loop start ' + S.drumLaneLoopStart[0]);
    assert(S.drumLaneTPS[0] === 12, 'tps ' + S.drumLaneTPS[0]);
    assert(S.bankParams[0][1][0] === 50, 'pfx snapshot gate ' + S.bankParams[0][1][0]);
    assert(S.drumLanePlaybackDir[0][5] === 2, 'direction ' + S.drumLanePlaybackDir[0][5]);
    assert(S.drumLanePlaybackAudioReverse[0][5] === 1, 'reverse');
    assert(S.drumRepeatGate[0][5] === 170 && S.drumRepeatGateLen[0][5] === 4, 'repeat state ' + S.drumRepeatGate[0][5]);
});

step('⭐ ...on ONE round trip: one bulk read, no lane key read on its own', () => {
    assert(singles.length === 0, 'read one at a time: ' + JSON.stringify(singles));
    assert(bulks === 1, bulks + ' bulk reads');
});

if (failed) { console.error('FAIL: test_drum_lane_select_one_read'); process.exit(1); }
console.log('PASS: test_drum_lane_select_one_read');
}
main().catch((e) => { console.error(e); process.exit(1); });
