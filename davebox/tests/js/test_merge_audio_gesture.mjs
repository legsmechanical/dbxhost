/* tests/js/test_merge_audio_gesture.mjs — LIVE MERGE on Audio tracks records
 * their SOUND (Josh, 2026-11-02: "live merge for audio tracks should be
 * audio, not sequences (so live recording the track), pre fx.").
 *
 * Driven through the REAL Rec press and the REAL tick / poll:
 *   - Rec at the merge notice sends each Audio track's file (the project's
 *     samples folder, the tempo in the name) BEFORE merge_arm; a MIDI track
 *     gets none; Track View: only its track;
 *   - at the bar line the UI does not stop the transport while the engine is
 *     still taking the last frames (CONTROL: with no Audio track it does);
 *   - placed: each track whose take has sound starts its picked clip over and
 *     picks the file, one undo step each; a silent take's file is removed;
 *     the card says so, not "Printed to clip";
 *   - cancelled: every file removed, nothing picked;
 *   - a failed take: the card says the audio was not recorded. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'print', 'clear_screen',
    'fill_rect', 'draw_rect', 'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'move_midi_internal_send', 'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
    'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'pixel_print', 'move_midi_external_send'])
    globalThis[fn] = () => 0;
globalThis.shadow_save_state_now = () => 1;
globalThis.shadow_set_param = () => 1;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };

const UUID = 'merge-audio-uuid', DIR = '/p/Samples';
let MERGE = '0', PLAYING = '0', AUDIO = '0 0 0 -1';
const snapshot = () => { const v = new Array(64).fill('0'); v[0] = PLAYING; v[55] = MERGE; return v.join(' '); };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return UUID;
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return snapshot();
    if (k === 't3_au_dir' || k === 't5_au_dir') return DIR;
    if (k === 'merge_audio') return AUDIO;
    if (k === 'merge_post_mask') return '0';
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, POLL_INTERVAL, PAD_MODE_AUDIO } = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID; S.activeTrack = 0; S.sessionView = true; S.playing = false;
S.currentSetName = 'My Song'; S.bpmMirror = 120;
for (let t = 0; t < 8; t++) S.trackPadMode[t] = 0;
S.trackPadMode[3] = PAD_MODE_AUDIO; S.trackPadMode[5] = PAD_MODE_AUDIO;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
const poll = () => ticks(POLL_INTERVAL * 3);
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1])
    .concat(S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val)));
/* the files on disk: the std stub's written map, which os.stat and os.remove read */
const files = () => Object.keys(globalThis.__stubStdWritten || {}).filter((p) => p.startsWith(DIR)).sort();
const write = (...ps) => { globalThis.__stubStdWritten = globalThis.__stubStdWritten || {}; for (const p of ps) globalThis.__stubStdWritten[p] = 'RIFF'; };
const T4 = DIR + '/My Song T4 merge 120bpm.wav', T6 = DIR + '/My Song T6 merge 120bpm.wav';
const card = () => (S.actionPopupLines || []).join(' ');
poll();

let AUDIO_TRACKS = [3, 5];
/* Rec at the notice; `solo` -1 = Session View */
function arm(solo) {
    /* the track types, as the poll's config reads would leave them */
    for (let t = 0; t < 8; t++) S.trackPadMode[t] = AUDIO_TRACKS.indexOf(t) >= 0 ? PAD_MODE_AUDIO : 0;
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    globalThis.__stubStdWritten = {};                   /* no take of an earlier step in the way */
    S.mergeCountingIn = false;                          /* the poll's count-in edge, which this stub does not model */
    S.mergeNoticePending = true; S.mergeNoticeSingleTrack = solo; S.sessionView = solo < 0;
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0);
}
/* the engine's merge goes CAPTURING -> CAPTURED, still taking the last frames */
function captured() {
    PLAYING = '1'; MERGE = '2'; AUDIO = '3 40 0 -1'; poll();
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    AUDIO = '4 40 0 -1'; MERGE = '4'; poll();
}

step('⭐⭐ Session View: Rec at the notice sends each Audio track its file, before merge_arm', () => {
    arm(-1);
    const q = S.pendingDefaultSetParams.map((e) => e.key + '=' + e.val);
    assert(sent('merge_stem').join('|') === '3 |' + T4 + '|5 |' + T6, 'files: ' + JSON.stringify(sent('merge_stem')));
    assert(q.indexOf('merge_arm=1') > q.indexOf('merge_stem=5 |' + T6), 'merge_arm went first: ' + q.join(', '));
});

step('⭐⭐ at the bar line the UI leaves the transport to the engine while the take is written', () => {
    captured();
    assert(sent('transport').length === 0, 'the UI stopped the transport under the take: ' + sent('transport'));
});

step('⭐⭐ placed: the track with sound loads into the picked clip (reset, then pick, one undo); the silent one is removed', () => {
    AUDIO = '5 40 8 2'; PLAYING = '0';                         /* t3 had sound, t5 none; row 2 */
    S.pendingMergePlacement = false; S.mergePlacing = true;
    write(T4, T6);
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    MERGE = '0'; poll(); ticks(10);
    assert(sent('t3_au_undo').join() === '2', 'no undo step for the clip: ' + sent('t3_au_undo'));
    assert(sent('t3_c2_hard_reset').join() === 'j', 'the clip did not start over: ' + sent('t3_c2_hard_reset'));
    assert(sent('t3_au_pick_join').join() === '2|' + T4, 'the take was not picked: ' + sent('t3_au_pick_join'));
    const order = sets.map((x) => x[0]);
    assert(order.indexOf('t3_c2_hard_reset') < order.indexOf('t3_au_pick_join'), 'picked before the reset: ' + order.join(','));
    assert(!sent('t5_au_pick_join').length && !sent('t5_c2_hard_reset').length, 'the silent track was touched');
    assert(files().join() === T4, 'on disk: ' + JSON.stringify(files()));
    assert(/Audio recorded to clip/.test(card()) && !/Printed/.test(card()), 'card: ' + card());
});

step('cancelled: every file removed, nothing picked', () => {
    arm(-1);
    assert(sent('merge_stem').length === 2, 'rig: the merge did not arm: ' + sent('merge_stem'));
    captured();
    AUDIO = '0 0 0 -1'; S.mergePlacing = false;                 /* merge_cancel: the engine let the take go */
    write(T4, T6);
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    MERGE = '0'; PLAYING = '0'; poll(); ticks(10);
    assert(files().length === 0, 'left on disk: ' + JSON.stringify(files()));
    assert(!sent('t3_au_pick_join').length && !sent('t5_au_pick_join').length, 'a cancelled take was picked');
});

step('Track View: only its own track records', () => {
    arm(3);
    assert(sent('merge_stem').join('|') === '3 |' + T4, 'files: ' + JSON.stringify(sent('merge_stem')));
    assert(sent('merge_arm').join() === 't3', 'arm: ' + sent('merge_arm'));
    MERGE = '2'; PLAYING = '1'; poll();
    AUDIO = '6 8 0 -1'; MERGE = '0'; PLAYING = '0'; poll(); ticks(10);
    assert(/Audio not recorded/.test(card()), 'a failed take says nothing: ' + card());
});

step('CONTROL: a merge with no Audio track stops the transport itself at the bar line', () => {
    AUDIO_TRACKS = [];
    arm(-1);
    assert(sent('merge_stem').length === 0, 'files for MIDI tracks: ' + sent('merge_stem'));
    PLAYING = '1'; MERGE = '2'; AUDIO = '0 0 0 -1'; poll();
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    MERGE = '4'; poll();
    assert(sent('transport').join() === 'stop', 'the UI did not stop the transport: ' + sent('transport'));
    MERGE = '0'; PLAYING = '0'; poll();
});

if (failed) { console.error('FAIL: test_merge_audio_gesture'); process.exit(1); }
console.log('PASS: test_merge_audio_gesture');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
