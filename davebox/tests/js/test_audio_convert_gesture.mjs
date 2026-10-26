/* tests/js/test_audio_convert_gesture.mjs — Mode -> Audio on a track that
 * plays an instrument OFFERS to resample its clips first (ui_audio_convert).
 *
 * Josh, 2026-10-26: "changing an instrument track to audio asks whether you
 * want to resample the clips there and loads the resulting clips in the
 * corresponding slots as audio clips" · "Instrument before effects." · "It
 * becomes a Loop-mode audio clip, and its notes are replaced".
 *
 *   - the question reaches the screen; Back cancels (nothing sent);
 *   - No: the plain conversion (no takes);
 *   - Yes: each clip with notes is recorded ALONE, one after another, before
 *     its FX (src 2) into the project's samples/; then the track converts and
 *     each clip, one per tick, wipes its notes and loads its take;
 *   - Back while recording cancels everything: the takes made are removed and
 *     nothing converts.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const DIR = '/data/UserData/daveboxSA/projects/x/dAVEBOx/samples';
const GET = { 't4_au_dir': DIR, 'resample_bars_t4_c0': '1', 'resample_bars_t4_c2': '2', 't4_au_on': '1', 'resample_err': '0' };
let SAMPLING = false;
globalThis.host_preview_play = () => {}; globalThis.host_preview_stop = () => {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_module_get_param = (k) => (GET[k] !== undefined ? GET[k] : '');
globalThis.host_module_get_params = () => '';
globalThis.host_sampler_is_recording = () => SAMPLING;
globalThis.shadow_get_param = (slot, key) => (slot === 4 && /synth/.test(key) ? 'braids' : '');
globalThis.shadow_set_param = () => 1;
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = _px;
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const D = await import('../../ui/ui_dialogs.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0; S.touchHoldMs = 0; S.currentSetName = 'My Song'; S.bpmMirror = 120;
S.clipNonEmpty[4][0] = true; S.clipNonEmpty[4][2] = true;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const queued = (k) => S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val));
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]).concat(queued(k));
const click = () => { cc(3, 127); cc(3, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const frame = (draw) => { globalThis.clear_screen(); draw(); return FB.slice(); };
const inked = (f) => f.some((v) => v);
const reset = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; };
const os = await import('os');
const P0 = DIR + '/My Song 5A 1bar 120bpm.wav', P2 = DIR + '/My Song 5C 2bar 120bpm.wav';

step('⭐⭐ Mode -> Audio on an instrument track with clips ASKS, on screen; Back cancels', () => {
    reset();
    D.requestTrackModeChange(4, 3);
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'resample', 'no resample question');
    const f = frame(() => render.drawUI());
    const own = frame(() => D.drawConvertToDrumConfirm());
    assert(inked(own) && f.every((v, i) => v === own[i]), 'the question is not what the screen shows');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    ticks(2);
    assert(!S.confirmConvertToDrum && !S.confirmConvertAudio, 'Back did not close it');
    assert(sent('t4_convert_to_drum').length === 0 && sent('resample_clip').length === 0, 'Back converted / recorded');
});

step('⭐ an instrument-less track is not asked (nothing to record)', () => {
    S.clipNonEmpty[3][0] = true;
    D.requestTrackModeChange(3, 3);
    assert(S.confirmConvertAudio !== 'resample', 'a track with no instrument was offered a resample');
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'audio', 'its notes-to-lanes confirm is gone');
    D.closeConvertConfirm(); S.clipNonEmpty[3][0] = false;
});

step('⭐⭐ Yes: clip A recorded alone, before its FX, into the project', () => {
    reset();
    D.requestTrackModeChange(4, 3);
    assert(S.confirmConvertToDrumSel === 0, 'the question does not open on Yes');
    click();
    ticks(2);
    assert(S.auConvert && S.auConvert.list.length === 2, 'takes: ' + JSON.stringify(S.auConvert));
    assert(S.resampleTake && S.resampleTake.convert, 'the surface is not held');
    assert(sent('resample_clip').join() === '4 0 1 0 0 2 |' + P0, 'first take: ' + sent('resample_clip'));
});

step('⭐⭐ ...then clip C, then the conversion, then each clip takes its recording', () => {
    S.resampleState = 1; ticks(1);
    S.resampleState = 3; S.resampleFrames = 88200; S.resampleDone = 1000; ticks(1);
    S.resampleState = 4; SAMPLING = true; ticks(1);
    assert(sent('transport').indexOf('stop') >= 0, 'no stop at the end of the take');
    globalThis.__stubStat = { [P0]: { mode: 0o100644, size: 9 } };
    SAMPLING = false; ticks(1);
    assert(sent('resample_clear').length >= 1 && S.auConvert.i === 1, 'did not move on');
    reset();
    S.resampleState = 0; ticks(1);
    assert(sent('resample_clip').join() === '4 2 2 0 0 2 |' + P2, 'second take: ' + sent('resample_clip'));
    S.resampleState = 3; ticks(1);
    S.resampleState = 4; globalThis.__stubStat[P2] = { mode: 0o100644, size: 9 }; ticks(2);
    assert(!S.auConvert && !S.resampleTake, 'the takes did not end');
    ticks(8);
    assert(sent('t4_convert_to_drum').length === 1 && sent('t4_au_on').join() === '1', 'not converted');
    assert(sent('t4_au_wipe').join() === '0,2', 'wipes: ' + sent('t4_au_wipe'));
    assert(sent('t4_au_pick').join() === '0|' + P0 + ',2|' + P2, 'picks: ' + sent('t4_au_pick'));
    globalThis.__stubStat = null;
});

step('⭐⭐ Back while recording cancels everything: takes removed, nothing converts', () => {
    S.trackAudio[4] = 0; S.trackPadMode[4] = 0; S.resampleState = 0;
    reset();
    D.requestTrackModeChange(4, 3);
    click();
    ticks(2);
    assert(S.auConvert, 'did not start');
    S.resampleState = 3; ticks(1);
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(sent('transport').indexOf('stop') >= 0, 'Back did not stop the take');
    const removed = [];
    globalThis.__stubStdWritten = { [P0]: 'x' };
    S.resampleState = 5; ticks(2);
    assert(!S.auConvert && !S.resampleTake, 'the conversion did not end');
    assert(!(P0 in globalThis.__stubStdWritten), 'the take was not removed');
    reset(); ticks(4);
    assert(sent('t4_convert_to_drum').length === 0 && sent('t4_au_on').length === 0, 'it converted anyway');
});

if (failed) { console.error('FAIL: test_audio_convert_gesture'); process.exit(1); }
console.log('PASS: test_audio_convert_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
