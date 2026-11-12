/* tests/js/test_audio_rec_gesture.mjs — Rec on an Audio track records the
 * Move's INPUT into its clip (ui_audio_rec; the engine seq8_audio_rec.c).
 *
 * Driven through the REAL Rec press and the REAL tick / poll:
 *   - stopped: Rec arms the take (the file in the project's samples folder,
 *     named for the set, the clip and the tempo) and THEN the count-in, which
 *     is MIDI's; no note recording is armed;
 *   - after the count-in the heading says REC; Rec again asks the engine to
 *     stop (the bar, or a layer's punch-out), not MIDI's disarm;
 *   - done: when the host has written the file it lands — one undo unit, the
 *     clip marked loading; the card says RECORDED;
 *   - playing: Rec arms with no count-in; the heading blinks WAIT;
 *   - cancelled (silent): the file is removed, the card says why;
 *   - speakers on, no cable: the feedback question first; Back arms nothing;
 *   - a Slicer: Rec stays MIDI's (its chops). */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

/* the OLED: 128x64, what the draw calls leave */
const FB = new Uint8Array(128 * 64);
const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => FB.fill(0);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { px(x, y + j, c); px(x + w - 1, y + j, c); } };
for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'host_write_file',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'move_midi_internal_send', 'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
    'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_external_send'])
    globalThis[fn] = () => 0;
let drawn = [];
globalThis.print = (x, y, s, c) => { drawn.push(String(s)); for (let i = 0; i < String(s).length; i++) px(x + i * 6, y + 3, c === undefined ? 1 : c); };
globalThis.pixel_print = (x, y, s) => { drawn.push(String(s)); };
globalThis.shadow_save_state_now = () => 1;
globalThis.shadow_set_param = () => 1;
globalThis.host_read_file = () => '';
globalThis.host_ui_publish = () => false;
globalThis.host_file_exists = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
let SAMPLING = false, SPEAKER = false, LINE = false;
globalThis.host_sampler_is_recording = () => SAMPLING;
globalThis.host_speaker_active = () => SPEAKER;
globalThis.host_line_in_connected = () => LINE;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };

const UUID = 'audio-rec-uuid', DIR = '/p/Samples';
let PLAYING = '0', REC = '0 0 0 0 0 0 0 0';
const snapshot = () => { const v = new Array(64).fill('0'); v[0] = PLAYING; return v.join(' '); };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return UUID;
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return snapshot();
    if (/^t\d_au_dir$/.test(k)) return DIR;
    if (k === 't0_au_rec') return REC;
    return '';
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, POLL_INTERVAL, PAD_MODE_AUDIO, PAD_MODE_SLICER } = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const { drawUI } = await import('../../ui/ui_render.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.pendingSetLoad = false; S.pendingDspSync = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.currentSetUuid = UUID; S.activeTrack = 2; S.sessionView = false; S.playing = false;
S.currentSetName = 'My Song'; S.bpmMirror = 120;
for (let t = 0; t < 8; t++) S.trackPadMode[t] = 0;
S.trackPadMode[2] = PAD_MODE_AUDIO;
S.trackActiveClip[2] = 1;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };
const poll = () => { const t0 = Date.now(); ticks(POLL_INTERVAL * 3); while (Date.now() - t0 < 70) {} ticks(2); };
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const rec = () => { cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); };
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1])
    .concat(S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val)));
const files = () => Object.keys(globalThis.__stubStdWritten || {}).filter((p) => p.startsWith(DIR)).sort();
const write = (p) => { globalThis.__stubStdWritten = globalThis.__stubStdWritten || {}; globalThis.__stubStdWritten[p] = 'RIFF'; };
const card = () => (S.actionPopupLines || []).join(' ');
const screen = () => { drawn = []; FB.fill(0); drawUI(); return drawn.join(' | '); };
/* the heading row (the top 8 lines): how many pixels it lights */
const headingInk = () => { screen(); let n = 0; for (let i = 0; i < 128 * 8; i++) n += FB[i]; return n; };
const headingCols = () => { screen(); let r = 0; for (let x = 127; x >= 0; x--) { for (let y = 0; y < 8; y++) if (FB[y * 128 + x]) return x; } return r; };
const await_fg = await import('/data/UserData/schwung/shared/feedback_gate.mjs');
const PATH = DIR + '/My Song 3B rec 120bpm.wav';
const clear = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; };
poll();

step('⭐⭐ stopped: Rec arms the take (its file), then MIDI\'s count-in — no note take', () => {
    clear(); globalThis.__stubStdWritten = {};
    rec();
    assert(sent('t2_au_rec_arm').join() === '1 0 |' + PATH, 'arm: ' + JSON.stringify(sent('t2_au_rec_arm')));
    assert(sent('record_count_in').join() === '2', 'count-in: ' + sent('record_count_in'));
    const q = sets.map((x) => x[0]).concat(S.pendingDefaultSetParams.map((e) => e.key));
    assert(q.indexOf('t2_au_rec_arm') < q.indexOf('record_count_in'), 'the count-in went before the arm: ' + q.join(','));
    assert(!sent('t2_recording').length, 'a note take was armed');
    assert(S.recordCountingIn && S.auRec, 'no count-in / take state');
});

step('⭐⭐ after the count-in the heading says REC; Rec again asks the engine to stop', () => {
    PLAYING = '1'; S.playing = true; S.recordCountingIn = false;
    const save = S.auRec; S.auRec = null;
    const plain = headingInk();                        /* CONTROL: the same screen with no take */
    S.auRec = save;
    REC = '2 2 1 44100 0 900 0 0'; poll();
    assert(!S.recordArmed, 'the note take is still armed after the count-in');
    const inked = headingInk();
    assert(plain > 0 && Math.abs(inked - plain) > 20, 'the heading did not gain the REC tag: ' + plain + ' -> ' + inked);
    clear(); rec();
    assert(sent('t2_au_rec_stop').length === 1, 'Rec again did not ask the engine: ' + JSON.stringify(sets));
    assert(!sent('t2_recording').length && !sent('record_count_in_cancel').length, 'MIDI\'s disarm ran');
});

step('⭐⭐ done: the written file lands — one undo unit, the clip loading, RECORDED', () => {
    REC = '4 2 1 176400 176400 900 0 768';
    SAMPLING = true; clear(); poll();
    assert(!sent('t2_au_rec_land').length, 'landed while the host was still writing');
    SAMPLING = false; write(PATH); poll();
    assert(sent('t2_au_rec_land').join() === '1', 'land: ' + JSON.stringify(sent('t2_au_rec_land')));
    assert(S.auInfo[2][1].state === 1, 'the clip is not marked loading');
    assert(/RECORDED/.test(card()) && /3B/.test(card()), 'card: ' + card());
    assert(!S.auRec, 'the take state stayed');
    REC = '0 2 1 0 0 0 0 0';
});

step('⭐ playing: Rec arms with no count-in; the heading blinks WAIT', () => {
    S.playing = true; PLAYING = '1'; S.trackClipPlaying[2] = true; S.trackQueuedClip[2] = -1;
    clear(); globalThis.__stubStdWritten = {};
    rec();
    assert(sent('t2_au_rec_arm').length === 1 && !sent('record_count_in').length, 'arm / count-in: ' + JSON.stringify(sets));
    REC = '1 2 1 0 0 0 0 0'; poll();
    const save = S.auRec; S.auRec = null;
    const plain = headingInk();
    S.auRec = save;
    let most = 0, least = 1e9;
    for (const ms of [0, 440, 880, 1320]) { S.clockMs = ms; const n = headingInk(); most = Math.max(most, n); least = Math.min(least, n); }
    assert(Math.abs(most - least) > 20 && (Math.abs(most - plain) <= 2 || Math.abs(least - plain) <= 2), 'the heading does not blink a WAIT tag: plain ' + plain + ', ' + least + '..' + most);
});

step('⭐ cancelled (silent): the file is removed, the card says why', () => {
    assert(S.auRec, 'rig: no take armed');
    write(S.auRec.path);
    REC = '5 2 1 0 0 0 6 0'; poll();
    assert(!S.auRec && files().length === 0, 'left: ' + JSON.stringify(files()));
    assert(/No input heard/.test(card()), 'card: ' + card());
    REC = '0 2 1 0 0 0 0 0';
});

step('⭐ speakers on, no cable: the feedback question first; Back arms nothing', () => {
    SPEAKER = true; LINE = false; clear();
    rec();
    assert(!sent('t2_au_rec_arm').length, 'armed before the question');
    assert(await_fg.feedbackGateActive(), 'the question is not up');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!sent('t2_au_rec_arm').length && !S.auRec && !await_fg.feedbackGateActive(), 'Back armed the take, or left the question up');
    rec();
    cc(3, 127); cc(3, 0);                               /* jog click: Yes */
    assert(sent('t2_au_rec_arm').length === 1, 'Yes did not arm');
    SPEAKER = false;
    REC = '5 2 1 0 0 0 0 0'; poll();
    REC = '0 2 1 0 0 0 0 0';
});

step('CONTROL: a Slicer keeps Rec for its chops', () => {
    S.trackPadMode[2] = PAD_MODE_SLICER; S.auRec = null; clear();
    rec();
    assert(!sent('t2_au_rec_arm').length, 'a Slicer armed an input take');
    assert(sent('t2_recording').join() === '1', 'the Slicer\'s note take did not arm: ' + JSON.stringify(sets));
});

if (failed) { console.error('FAIL: test_audio_rec_gesture'); process.exit(1); }
console.log('PASS: test_audio_rec_gesture');
process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
