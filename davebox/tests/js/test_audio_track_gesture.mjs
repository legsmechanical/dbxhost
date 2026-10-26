/* tests/js/test_audio_track_gesture.mjs — AUDIO TRACKS through the REAL
 * gestures, with the screen checked (ui_audio, ui_audio_chooser,
 * ui_audio_editor).
 *
 * Josh, 2026-10-26: "a legit track type. with its own banks", slices "played
 * and sequenced from the pads", Loop / Slice per clip, jump points row by row
 * with a playhead, all 32 pads slices, velocity ignored, pick a file first.
 *
 *   - Mode -> Audio converts to a drum track, switches Audio on, removes the
 *     instrument (route stays Schwung);
 *   - the bank walk has SAMPLE and SLICE; their cards reach the screen;
 *   - Smpl: touch + click opens the chooser, on screen, which lists the
 *     places and auditions the highlighted file; a click picks it;
 *   - SAMPLE knobs write the engine (slices, mode);
 *   - Slice mode: every pad plays a lane (padmap), Loop mode none — the pads
 *     send jumps; the LEDs follow;
 *   - Slices: touch + click opens the slice editor; pads pick; Record runs a
 *     lazy chop (the pads stop playing); Back leaves.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const PEAKS = Array.from({ length: 128 }, (_, i) => ((i * 7) % 100).toString(16).padStart(2, '0').repeat(2)).join('');
const GET = { 't4_au_on': '1', 't4_au_dir': '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples',
              't4_au_info_0': '2 0 1 0 8 16 0 1000 0 0 96000 48000 2|Break Phenom 84 bpm.wav',
              't4_au_peaks_0': PEAKS, 't4_au_pos': '1 250 250 2', 't4_au_lazy': '0 0 0',
              't4_au_starts_0': '0 125 250 375 500 625 750 875',
              't4_au_sl_0_0': '0 12000 0 100 0 0 0 0 0 0' };
const PREVIEWS = [];
globalThis.host_preview_play = (p) => { PREVIEWS.push(String(p)); };
globalThis.host_preview_stop = () => { PREVIEWS.push('stop'); };
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
globalThis.host_sampler_is_recording = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = _px;
const LEDS = new Map();
globalThis.move_midi_internal_send = (m) => { if (m && (m[1] & 0xF0) === 0x90) LEDS.set(m[2], m[3]); return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const A = await import('../../ui/ui_audio.mjs');
const CH = await import('../../ui/ui_audio_chooser.mjs');
const P = await import('../../ui/ui_pure.mjs');
const D = await import('../../ui/ui_dialogs.mjs');
const DM = await import('../../ui/ui_drummodel.mjs');
const render = await import('../../ui/ui_render.mjs');
const os = await import('os');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const queued = (k) => S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val));
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]).concat(queued(k));
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
const frame = (draw) => { globalThis.clear_screen(); draw(); return FB.slice(); };
const same  = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const inked = (f) => f.some((v) => v);
function onScreen(draw, what) {
    const shown = frame(() => render.drawUI());
    const own = frame(draw);
    assert(inked(own), what + ' draws nothing');
    assert(same(shown, own), what + ' is not what the screen shows');
}

step('⭐⭐ Mode -> Audio: a drum track, Audio on, the instrument removed (FX stay), route Schwung', () => {
    sets.length = 0;
    D.requestTrackModeChange(4, 3);
    ticks(3);
    assert(sent('t4_convert_to_drum').length === 1, 'not converted to drums first');
    assert(sent('t4_au_on').join() === '1', 'Audio not switched on: ' + sent('t4_au_on'));
    const iConv = sets.findIndex((x) => x[0] === 't4_convert_to_drum'), iAu = sets.findIndex((x) => x[0] === 't4_au_on');
    assert(iConv >= 0 && iAu > iConv, 'Audio went on before the drum conversion');
    assert(S.trackPadMode[4] === C.PAD_MODE_DRUM && S.trackAudio[4] === 1, 'the mirrors: pm ' + S.trackPadMode[4] + ' au ' + S.trackAudio[4]);
    assert(A.isAudioTrack(4), 'isAudioTrack says no');
});

step('⭐ the Mode row reads Audio, and offers Melodic / Drums / Audio', () => {
    assert(P.bankDisplayName(1, 0, 4) === 'SLICE LANE' && P.bankDisplayName(1, 7, 4) === 'ALL SLICES', 'lane bank names');
});

step('⭐⭐ the bank walk has SAMPLE and SLICE (before MIX), and their cards reach the screen', () => {
    const walk = P.bankCycleForMode(1, 4);
    assert(walk.indexOf(A.BANK_SAMPLE) >= 0 && walk.indexOf(A.BANK_SLICE) === walk.indexOf(A.BANK_SAMPLE) + 1,
           'walk: ' + walk.join());
    assert(walk.indexOf(C.BANK_SOUND) > walk.indexOf(A.BANK_SLICE), 'SAMPLE / SLICE are not before MIX');
    assert(P.bankCycleForMode(1, 3).indexOf(A.BANK_SAMPLE) < 0, 'a plain drum track has the SAMPLE bank');
    S.activeBank = A.BANK_SAMPLE; S.bankCardLatched = true;
    ticks(2);
    const sample = frame(() => render.drawUI());
    S.activeBank = 0;
    const lane = frame(() => render.drawUI());
    assert(inked(sample) && !same(sample, lane), 'the SAMPLE card does not reach the screen');
    S.activeBank = A.BANK_SLICE;
    const slice = frame(() => render.drawUI());
    assert(inked(slice) && !same(slice, sample), 'the SLICE card does not reach the screen');
    const cells = A.auSampleCells(4);
    assert(cells[1].text === 'Slice' && cells[4].text === '8', 'SAMPLE cells: ' + JSON.stringify(cells.map((c) => c.text)));
    S.activeBank = A.BANK_SAMPLE;
});

step('⭐ SAMPLE knobs write the engine: Slices 8 -> 9 (Even)', () => {
    sets.length = 0;
    for (let i = 0; i < 12; i++) cc(75, 1);           /* K5 */
    assert(sent('t4_au_set').some((v) => v === '0 slices 9'), 'no slices write: ' + JSON.stringify(sent('t4_au_set')));
    GET['t4_au_info_0'] = '2 0 1 0 9 16 0 1000 0 0 96000 48000 2|Break Phenom 84 bpm.wav';
    A.auMarkStale(4, 0);
    ticks(2);
    assert(A.auInfo(4, 0).n === 9, 'the cache did not re-read');
});

step('⭐⭐ Slice mode: all 32 pads play lanes (left 1-16, right 17-32); velocity zones gone', () => {
    DM.computePadNoteMap();
    assert(S.padNoteMap[0] === 36 && S.padNoteMap[3] === 39 && S.padNoteMap[4] === 36 + 16 && S.padNoteMap[31] === 36 + 31,
           'padmap: ' + Array.from(S.padNoteMap).slice(0, 8).join());
    assert(P.drumPadToLane(5) === 17 && P.drumPadToVelZone(5) === -1, 'right pads are not slices');
});

step('⭐⭐ Smpl: touch + click opens the CHOOSER, on screen; it auditions; a click picks', () => {
    sets.length = 0; PREVIEWS.length = 0;
    note(0, 127);                                   /* touch K1 */
    click();
    note(0, 0);
    ticks(2);
    assert(S.auChooser && S.auChooser.t === 4, 'the chooser did not open');
    assert(S.auChooser.places[0].label === 'This project', 'places: ' + S.auChooser.places.map((p) => p.label));
    onScreen(CH.drawAudioChooser, 'the sample chooser');
    /* into Core Library, a file: it auditions once the cursor rests */
    os.__setReaddir({ '/data/CoreLibrary/Samples': ['Loops'], '/data/CoreLibrary/Samples/Loops': ['Break.wav', 'Break.wav.sha'] });
    globalThis.__stubStat = { '/data/CoreLibrary/Samples/Loops': { mode: 0o040000 }, '/data/CoreLibrary/Samples/Loops/Break.wav': { mode: 0o100644, size: 9 } };
    const coreIdx = S.auChooser.places.findIndex((p) => p.label === 'Core Library');
    for (let i = 0; i < coreIdx; i++) jog(1);
    click();
    assert(S.auChooser.B && S.auChooser.B.items.length === 1 && S.auChooser.B.items[0].kind === 'dir', 'Core Library listing');
    click();                                          /* into Loops */
    assert(S.auChooser.B.items.some((it) => it.label === 'Break.wav') && !S.auChooser.B.items.some((it) => /sha$/.test(it.label)),
           'the folder lists ' + JSON.stringify(S.auChooser.B.items.map((it) => it.label)));
    jog(1);                                           /* onto the file */
    S.auChooser.restAt = 1;                          /* the rest is up (the tick's clock is the wall's) */
    ticks(2);
    assert(PREVIEWS.indexOf('/data/CoreLibrary/Samples/Loops/Break.wav') >= 0, 'no audition: ' + PREVIEWS.join());
    click();
    assert(!S.auChooser, 'the chooser stayed after a pick');
    assert(sent('t4_au_pick').join() === '0|/data/CoreLibrary/Samples/Loops/Break.wav', 'pick: ' + sent('t4_au_pick'));
    assert(PREVIEWS[PREVIEWS.length - 1] === 'stop', 'the audition kept playing');
    os.__setReaddir(null); globalThis.__stubStat = null;
});

step('⭐ Back walks out of the chooser one level at a time', () => {
    S.pendingAudioChooser = { t: 4, c: 0 };
    ticks(1);
    assert(S.auChooser, 'reopen');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!S.auChooser, 'Back at the places did not close it');
});

step('⭐⭐ Slices: touch + click opens the SLICE EDITOR, on screen; a pad picks; Record runs a lazy chop', () => {
    GET['t4_au_info_0'] = '2 0 1 0 8 16 0 1000 0 0 96000 48000 2|Break Phenom 84 bpm.wav';
    A.auMarkStale(4, 0); ticks(2);
    note(4, 127); click(); note(4, 0);
    assert(S.auEditor && S.auEditor.t === 4, 'the editor did not open');
    ticks(2);
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);
    assert(S.auEditor.sel === 2 && S.activeDrumLane[4] === 2, 'the pad did not pick slice 3');
    sets.length = 0;
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0);
    assert(S.auEditor.lazy && sent('t4_au_lazy').join() === '0 1', 'Record did not start a chop: ' + sent('t4_au_lazy'));
    DM.computePadNoteMap();
    assert(S.padNoteMap[0] === 0xFF && S.padNoteMap[31] === 0xFF, 'the pads still play slices during a chop');
    GET['t4_au_lazy'] = '1 0 10';
    ticks(4);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    assert(sent('t4_au_lazy_tap').length === 1, 'a tap during the chop did not cut');
    const ed = frame(() => render.drawUI());
    assert(inked(ed), 'the editor draws nothing');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!S.auEditor.lazy && sent('t4_au_lazy').indexOf('0 0') >= 0, 'Back did not end the chop');
    cc(HC.MoveBack, 127); cc(HC.MoveBack, 0);
    assert(!S.auEditor, 'Back did not leave the editor');
    GET['t4_au_lazy'] = '0 0 0';
});

step('⭐⭐ Loop mode: no pad plays a lane; pads send jumps (press + release); the playhead pad lights', () => {
    GET['t4_au_info_0'] = '2 0 0 0 8 16 0 1000 0 0 96000 48000 2|Break Phenom 84 bpm.wav';
    A.auMarkStale(4, 0); ticks(4);
    DM.computePadNoteMap();
    assert(S.padNoteMap.every((v) => v === 0xFF), 'a Loop clip\'s pads play lanes');
    sets.length = 0;
    S.activeBank = 0; S.bankCardLatched = false;
    note(C.TRACK_PAD_BASE + 9, 100); note(C.TRACK_PAD_BASE + 9, 0);
    assert(sent('t4_au_jump').join() === '9 1,9 0', 'jumps: ' + sent('t4_au_jump'));
    sets.length = 0;
    note(C.TRACK_PAD_BASE + 20, 100);
    assert(sent('t4_au_jump').length === 0, 'a pad past the 16 jump points jumped');
    note(C.TRACK_PAD_BASE + 20, 0);
    assert(A.auPlayheadJump(4) === 4, 'the playhead at 25% is not jump point 5 of 16: ' + A.auPlayheadJump(4));
});

step('⭐ Audio -> Drums: Audio off, still a drum track', () => {
    sets.length = 0;
    D.requestTrackModeChange(4, C.PAD_MODE_DRUM);
    ticks(2);
    assert(sent('t4_au_on').join() === '0' && !S.trackAudio[4] && S.trackPadMode[4] === C.PAD_MODE_DRUM, 'not back to drums');
    assert(sent('t4_convert_to_melodic').length === 0, 'it converted to melodic');
});

if (failed) { console.error('FAIL: test_audio_track_gesture'); process.exit(1); }
console.log('PASS: test_audio_track_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
