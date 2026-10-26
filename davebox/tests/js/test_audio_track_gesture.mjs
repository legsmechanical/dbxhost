import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_audio_track_gesture.mjs — AUDIO through the REAL gestures,
 * with the screen checked (ui_audio, ui_audio_editor, ui_audio_chooser).
 *
 * Josh, 2026-10-27: "audio should be an instrument rather than type" · "it
 * shouldn't have a track type. just like conductor doesn't" · "inst ... would
 * take you an editor with all the audio settings (mode, slicing, etc) while
 * clip bank would have all the sequence settings" · "no repeat groove" · clip
 * bank mirrors ALL LANES · NOTE FX / DELAY in drum form · ALL SLICES "set all".
 *
 *   - Audio is a row of the Instmt/Dest picker; picking it converts (the
 *     engine key), the track keeps a Schwung slot, its instrument goes; an
 *     instrument-less track with notes asks first (Q2), No keeps it;
 *   - the walk: CONFIG door, MACROS, AUTOMATION door, STEP, CLIP, NOTE FX,
 *     DELAY, MIX — no RPT GROOVE / LIVE ARP / PADMODE / HARMONY / SEQ ARP;
 *   - the bank map: the AUDIO pad opens the AUDIO editor; MIDI FX dark;
 *   - the AUDIO editor: on screen; the jog turns pages; knobs write (Start in
 *     frames); touch + click opens the chooser (the knob is let go);
 *     SLICE n edits the last pad tapped; ALL SLICES sets every slice;
 *   - the chop design (Josh, 2026-10-27): SLICING = Even · Lazy› · Manual› ·
 *     Edit›; Even turns live; the waveform editor moves a slice's start / end
 *     by a pixel, zooms, adds a marker at the cursor, Delete + pad removes
 *     one, locks them while Even is on; Lazy lights only the next pad, taps
 *     cut, Back asks "Keep N new chops?"; Manual asks before replacing;
 *     Start / End's touch + click opens the range editor;
 *   - Slice mode: pads 36 + slice, none past the count; the CLIP bank reads
 *     Res Strch Shift Quant Crop InQnt Dir and K4 is NOTE FX Quantize;
 *   - Loop mode: pads jump (press + release), steps do nothing, the CLIP bank
 *     is Revrs Nudge JmpQ; NOTE FX takes no pitch knob;
 *   - the step editor's K1 reads "Slice n";
 *   - leaving Audio asks (Q3), Yes converts back;
 *   - Purge samples removes only what nothing uses.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const PEAKS = Array.from({ length: 128 }, (_, i) => ((i * 7) % 100).toString(16).padStart(2, '0').repeat(2)).join('');
/* "state err mode even hand jump rstart rend pitch gain frames rate ch revrs nudge jmpq n|name" */
const INFO = (mode, n, even) => '2 0 ' + mode + ' ' + (even === undefined ? n : even) + ' ' + (even === 0 ? n : 1) +
    ' 16 0 96000 0 0 96000 48000 2 0 0 0 ' + n + '|Break Phenom 84 bpm.wav';
const MARKS8 = Array.from({ length: 8 }, (_, k) => (k * 12000) + ' ' + ((k + 1) * 12000)).join(' ');
const GET = { 't4_au_dir': '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples',
              't4_au_info_0': INFO(1, 8), 't4_pad_mode': '3',
              't4_au_peaks_0': PEAKS, 't4_au_pos': '1 24000 2', 't4_au_lazy': '0 0 0',
              't4_au_marks_0': MARKS8,
              't4_au_sl_0_0': '0 12000 0 0 0 0 0 0 0', 't4_au_sl_0_2': '24000 36000 0 0 -3 0 0 0 0',
              't4_au_all_0': '0 x 0 0 0 0' };
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
const SHADOW = [];
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, k, v) => { SHADOW.push([slot, String(k), String(v)]); return 1; };
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
const E = await import('../../ui/ui_audio_editor.mjs');
const CH = await import('../../ui/ui_audio_chooser.mjs');
const P = await import('../../ui/ui_pure.mjs');
const D = await import('../../ui/ui_dialogs.mjs');
const DM = await import('../../ui/ui_drummodel.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
globalThis.__ED = await import('../../ui/ui_editops.mjs');
const os = await import('os');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0;
S.touchHoldMs = 0;     /* knob-touch releases delivered at once (ui_touch_hold) */

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const queued = (k) => S.pendingDefaultSetParams.filter((e) => e.key === k).map((e) => String(e.val));
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]).concat(queued(k));
const sentLike = (re) => sets.filter((x) => re.test(x[0])).concat(S.pendingDefaultSetParams.filter((e) => re.test(e.key)).map((e) => [e.key, String(e.val)]));
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
const touchClick = (k) => { note(k, 127); click(); note(k, 0); };
const frame = (draw) => { globalThis.clear_screen(); draw(); return FB.slice(); };
const same  = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const inked = (f) => f.some((v) => v);
const shown = () => frame(() => render.drawUI());
const reset = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; };

step('⭐ Audio is a row of the Instmt/Dest picker, beside Conductor', () => {
    const rows = C.instrPickerRows(S.trackRoute, 4, [], S.trackChannel);
    const ci = rows.findIndex((r) => r.v === C.INSTR_CONDUCT), ai = rows.findIndex((r) => r.v === C.INSTR_AUDIO);
    assert(ai === ci + 1 && rows[ai].label === 'Audio', 'rows: ' + rows.map((r) => r.label || '---').join('|'));
});

step('⭐⭐ an instrument-less track with notes ASKS first (Q2); No keeps it as it was', () => {
    reset();
    S.clipNonEmpty[4][0] = true;
    snd.requestInstrChange(4, C.INSTR_AUDIO);
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'audio', 'no confirm');
    const f = shown();
    const own = frame(() => D.drawConvertToDrumConfirm());
    assert(inked(own) && same(f, own), 'the question is not what the screen shows');
    click();                                           /* opens on No */
    ticks(2);
    assert(!S.confirmConvertToDrum && sent('t4_convert_to_audio').length === 0 && S.trackPadMode[4] === 0, 'No converted');
});

step('⭐⭐ Yes: the engine converts, the slot keeps Schwung with no instrument, the mirrors follow', () => {
    reset();
    snd.requestInstrChange(4, C.INSTR_AUDIO);
    jog(-1); click();
    ticks(3);
    assert(sent('t4_convert_to_audio').length === 1, 'no convert');
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO && A.isAudioTrack(4), 'pad mode ' + S.trackPadMode[4]);
    assert(S.trackRoute[4] === 0, 'the route moved: ' + S.trackRoute[4]);
    assert(A.auInfo(4, 0).name === 'Break Phenom 84 bpm.wav', 'the clips were not read');
    S.clipNonEmpty[4][0] = false;
});

step('⭐⭐ the walk: no RPT GROOVE, LIVE ARP, PADMODE, HARMONY or SEQ ARP; MIX last', () => {
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_MACROS, C.BANK_STEP, 0, 1, 3, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_AUDIO, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0) === null, 'the MIDI FX pad is lit (Q4)');
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 7, 0).comp === 'fx1', 'FX 1 is dark');
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[2].cells[3] && map[2].cells[3].name === 'AUDIO', 'the instrument pad is not AUDIO');
});

const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const back = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
const shiftClick = () => { cc(HC.MoveShift, 127); click(); cc(HC.MoveShift, 0); };

step('⭐⭐ the bank map\'s AUDIO pad opens the AUDIO editor, ON SCREEN: CLIP is the clip\'s sound', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    const rest = shown();
    mapPad(2, 3);
    assert(S.auPanel && S.auPanel.t === 4 && S.auPanel.page === 0 && !S.auEditor, 'the AUDIO editor did not open');
    const f = shown();
    assert(inked(f) && !same(f, rest), 'the AUDIO editor is not on screen');
    /* ...and it owns the whole screen: drawn over a full one (the sound menu
     * it opens from), nothing of that is left (found on the device). */
    FB.fill(1); render.drawUI(); const over = FB.slice();
    assert(same(over, f), 'the AUDIO editor leaves what was under it on screen');
    /* Josh, 2026-10-28: ALL SLICES "merge with "clip""; Start / End "can go
     * since they're on wav"; "change "chop" to ">Seq"" */
    const cells = A.auPanelCells(S.auPanel);
    assert(cells.map((c) => c.label).join() === 'Mode,Pitch,Gain,Revrs,Attk,Decay,Play,>Seq', 'CLIP (Slice): ' + cells.map((c) => c.label));
});

step('⭐ the jog turns its pages: CLIP, SLICE n (no SLICING, no ALL SLICES)', () => {
    const titles = [];
    for (let i = 0; i < 3; i++) { titles.push(A.auPanelTitle(S.auPanel)); jog(1); }
    assert(titles.join('|') === 'CLIP|SLICE 1/8|SLICE 1/8', 'pages: ' + titles.join('|'));
    for (let i = 0; i < 3; i++) jog(-1);
    assert(S.auPanel.page === 0, 'back to CLIP');
});

step('⭐⭐ CLIP knobs: Pitch / Gain for the clip, Revrs..Play for every slice (`--` where they differ), >Seq', () => {
    GET['t4_au_all_0'] = '0 0 0 x 0 0';                 /* the slices' attacks differ */
    A.auMarkStale(4, 0); ticks(2);
    assert(A.auPanelCells(S.auPanel)[4].text === '--', 'Attk: ' + A.auPanelCells(S.auPanel)[4].text);
    reset();
    cc(72, 1);                                          /* K2 Pitch */
    assert(sent('t4_au_set_pitch').join() === '0 1', 'pitch: ' + JSON.stringify(sent('t4_au_set_pitch')));
    cc(75, 1);                                          /* K5 Attk: every slice */
    assert(sent('t4_au_all_atk').length === 1, 'Attk did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    touchClick(7);                                      /* K8 >Seq */
    assert(sent('t4_au_chop').join() === '0' && S.knobTouched === -1, '>Seq: ' + JSON.stringify(sentLike(/_au_/)));
    S.actionPopupEndTick = 0;                           /* its popup (wall-clock timed) is not under test */
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_all_0'] = '0 x 0 0 0 0';
    A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ SLICE n edits the last pad tapped', () => {
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);
    assert(A.auSelSlice(4) === 2, 'the pad did not pick slice 3');
    jog(1);
    ticks(2);
    assert(A.auPanelTitle(S.auPanel) === 'SLICE 3/8', A.auPanelTitle(S.auPanel));
    assert(A.auPanelCells(S.auPanel).map((c) => c.label).join() === 'Pitch,Gain,Revrs,Attk,Decay,Play,,', 'SLICE: sound only');
    assert(A.auPanelCells(S.auPanel)[1].text === '-3 dB', 'slice 3 gain: ' + A.auPanelCells(S.auPanel)[1].text);
    reset();
    for (let i = 0; i < 3; i++) cc(72, 1);             /* K2 Gain */
    assert(sent('t4_au_slice_gain').some((v) => /^0 2 -2$/.test(v)), 'slice gain: ' + JSON.stringify(sent('t4_au_slice_gain')));
    jog(-1);
    back();
    assert(!S.auPanel, 'Back did not close the AUDIO editor');
});

step('⭐⭐ the map\'s WAVE pad opens WAVE (Slice: the chop editor); Even on locks the markers', () => {
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[2].cells[2] && map[2].cells[2].name === 'WAVE', 'no WAVE pad under CLIP');
    mapPad(2, 2);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.auPanel && S.auPanel.wave, 'WAVE did not open');
    ticks(2);
    assert(inked(shown()), 'WAVE draws nothing');
    reset();
    jog(1); click(); cc(71, 1);
    assert(sentLike(/mark_add|slice_start/).length === 0, 'a marker moved while Even was on');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back did not leave WAVE');
});

step('⭐⭐ WAVE in Slice mode: pads pick, K1/K3 move by a pixel, K2 zooms, click adds, Delete + pad removes', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave', 'no editor');
    note(C.TRACK_PAD_BASE + 9, 100); note(C.TRACK_PAD_BASE + 9, 0);   /* row 2, col 2: slice 6 */
    assert(A.auSelSlice(4) === 5 && ed.cur === 60000, 'the pad did not pick slice 6: ' + A.auSelSlice(4) + ' ' + ed.cur);
    reset();
    note(0, 127); cc(71, 1); note(0, 0);
    assert(sent('t4_au_slice_start').join() === '0 5 60750', 'K1: one pixel (750 frames): ' + JSON.stringify(sent('t4_au_slice_start')));
    assert(A.auMarks(4, 0)[4][1] === 60750, 'the slice before did not follow its home end');
    reset();
    for (let z = 0; z < 6; z++) cc(72, 1);          /* K2: zoom in, on the start (last touched) */
    assert(ed.B - ed.A === 25166 && Math.abs((ed.A + ed.B) / 2 - 60750) <= 1, 'zoom is not centred on the start: ' + ed.A + '..' + ed.B);
    cc(73, 1);                                       /* K3: the end, one pixel (197) */
    assert(sent('t4_au_slice_end').join() === '0 5 72197', 'K3: ' + JSON.stringify(sent('t4_au_slice_end')));
    const mid = () => (ed.A + ed.B) / 2;
    assert(Math.abs(mid() - 72197) <= 1, 'the end is not in the middle while K3 turns: ' + ed.A + '..' + ed.B);
    note(0, 127); note(0, 0);                        /* touch K1: jump to the start */
    assert(Math.abs(mid() - 60750) <= 1, 'touching K1 did not jump to the start: ' + ed.A + '..' + ed.B);
    note(9, 127); note(9, 0);                        /* touch the jog: jump to the cursor */
    assert(Math.abs(mid() - 60000) <= 1, 'touching the jog did not jump to the cursor: ' + ed.A + '..' + ed.B);
    note(2, 127); note(2, 0);                        /* touch K3: back to the end */
    assert(Math.abs(mid() - 72197) <= 1, 'touching K3 did not jump to the end: ' + ed.A + '..' + ed.B);
    assert(ed.last === 'end', 'K3 is not the last touched');
    cc(73, 127);                                     /* back to home: sent as 0 */
    assert(sent('t4_au_slice_end').pop() === '0 5 0', 'home: ' + JSON.stringify(sent('t4_au_slice_end')));
    cc(73, 127);                                     /* sticks at home a few detents */
    assert(sent('t4_au_slice_end').length === 2, 'the end left home at once');
    reset();
    jog(3);
    assert(ed.cur === 60000 + 3 * 197 && ed.last === 'jog', 'jog: ' + ed.cur);   /* the cursor stays where the pad put it */
    click();
    assert(sent('t4_au_mark_add').join() === '0 ' + ed.cur, 'click: ' + JSON.stringify(sent('t4_au_mark_add')));
    assert(A.auInfo(4, 0).n === 9 && A.auMarks(4, 0).length === 9, 'the marker is not on screen');
    reset();
    cc(HC.MoveDelete, 127);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);   /* slice 1: stays */
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);   /* slice 3 */
    cc(HC.MoveDelete, 0);
    assert(sent('t4_au_mark_del').join() === '0 2', 'Delete + pad: ' + JSON.stringify(sent('t4_au_mark_del')));
    assert(inked(shown()), 'the editor draws nothing');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ scrolling a zoomed waveform never stretches the overview (Josh: "the whole screen turns white")', () => {
    /* zoomed in, the new window's read pending: the overview stretched fills every column */
    const A0 = 40000, B0 = 41280;                    /* 10 frames a pixel */
    const cols = A.auWaveColumns(4, 0, 128, A0, B0);
    assert(cols && cols.every((v) => v === 0), 'a pending deep window drew the stretched overview: ' + cols.slice(0, 8));
    /* the read lands: a ramp, column k = k/127 */
    const ramp = Array.from({ length: 128 }, (_, k) => '00' + k.toString(16).padStart(2, '0')).join('');
    GET['t4_au_wave_0_' + A0 + '_' + B0] = ramp;
    ticks(1);
    const got = A.auWaveColumns(4, 0, 128, A0, B0);
    assert(Math.abs(got[64] - 64 / 127) < 1e-6, 'the read did not draw: ' + got[64]);
    /* scrolled 32 pixels on, before ITS read: the last one, shifted */
    const sc = A.auWaveColumns(4, 0, 128, A0 + 320, B0 + 320);
    assert(Math.abs(sc[0] - 32 / 127) < 1e-6 && Math.abs(sc[95] - 127 / 127) < 1e-6 && sc[127] === 0,
           'a scroll did not reuse the last read: ' + [sc[0], sc[95], sc[127]].join());
    delete GET['t4_au_wave_0_' + A0 + '_' + B0];
});

step('⭐⭐ Shift + click: the picker — Load sample / Chop sample › Lazy · Manual · Even (Josh)', () => {
    mapPad(2, 2);
    reset();
    shiftClick();
    const ed = S.auEditor;
    assert(ed.pick && ed.pick.level === 1, 'Shift + click did not open the picker');
    assert(E.auPickRows(ed).map((r) => r.label).join() === 'Load sample,Chop sample', 'level 1: ' + E.auPickRows(ed).map((r) => r.label));
    assert(inked(shown()), 'the picker draws nothing');
    assert(sentLike(/mark_add/).length === 0, 'Shift + click also added a marker');
    jog(1); click();
    assert(ed.pick.level === 2 && E.auPickRows(ed).map((r) => r.label).join() === 'Lazy,Manual,Even', 'level 2: ' + E.auPickRows(ed).map((r) => r.label));
    back();
    assert(ed.pick && ed.pick.level === 1, 'Back did not go up a level');
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the picker (WAVE stays)');
    /* Even: click edits the count, the jog turns it, a click sets it */
    shiftClick(); jog(1); click(); jog(1); jog(1); click();
    assert(ed.pick.editEven && ed.pick.even === 8, 'Even did not start editing at 8');
    /* live: each detent slices the clip, and the pads show the count (Josh) */
    const setP = globalThis.host_module_set_param;
    globalThis.host_module_set_param = (k, v) => {     /* the engine applies Even, as the real one does */
        setP(k, v);
        if (String(k) === 't4_au_set_even') { const e = parseInt(String(v).split(' ')[1], 10); GET['t4_au_info_0'] = e ? INFO(1, e, e) : INFO(1, 1, 0); }
    };
    const litPads = () => { ticks(2); return Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0).filter((v) => v).length; };
    jog(-1);
    assert(sent('t4_au_set_even').pop() === '0 7' && A.auInfo(4, 0).n === 7 && litPads() === 7,
           'Even 7 is not live on the pads: ' + JSON.stringify(sent('t4_au_set_even')) + ' lit ' + litPads());
    jog(1); jog(1); jog(1);
    assert(sent('t4_au_set_even').pop() === '0 10' && litPads() === 10, 'Even 10 is not live on the pads: lit ' + litPads());
    back();                                          /* the clip had Even Off: Back puts that back */
    assert(sent('t4_au_set_even').pop() === '0 0' && !ed.pick.editEven, 'Back did not put Even Off back: ' + JSON.stringify(sent('t4_au_set_even')));
    click();                                         /* edit again (from Off: 8), turn to 7, click keeps it */
    assert(ed.pick.editEven, 'not editing');
    jog(-1); click();
    assert(sent('t4_au_set_even').pop() === '0 7' && !ed.pick, 'Even 7 not kept');
    globalThis.host_module_set_param = setP;
    /* Manual asks before it replaces the 8 chops made by hand */
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    reset();
    shiftClick(); jog(1); click(); jog(1); click();
    assert(ed.ask && ed.ask.kind === 'replace', 'Manual did not ask');
    click();                                         /* opens on No */
    assert(!ed.ask && sent('t4_au_manual').length === 0 && S.auEditor === ed, 'No replaced (or left WAVE)');
    shiftClick(); jog(1); click(); jog(1); click(); jog(1); click();   /* clockwise: toward Yes */
    assert(sent('t4_au_manual').join() === '0' && S.auEditor === ed && ed.mode === 'wave', 'Yes did not replace');
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Load sample: the chooser opens over WAVE, auditions, a click picks and lands back on WAVE', () => {
    mapPad(2, 2);
    reset(); PREVIEWS.length = 0;
    shiftClick(); click();                           /* Load sample */
    ticks(2);
    assert(S.auChooser && S.auChooser.t === 4, 'the chooser did not open');
    assert(S.auChooser.places[0].label === 'This project', 'places: ' + S.auChooser.places.map((p) => p.label));
    const f = shown();
    const own = frame(() => CH.drawAudioChooser());
    assert(inked(own) && same(f, own), 'the chooser is not what the screen shows');
    os.__setReaddir({ '/data/CoreLibrary/Samples': ['Loops'], '/data/CoreLibrary/Samples/Loops': ['Break.wav'] });
    globalThis.__stubStat = { '/data/CoreLibrary/Samples/Loops': { mode: 0o040000 }, '/data/CoreLibrary/Samples/Loops/Break.wav': { mode: 0o100644, size: 9 } };
    const coreIdx = S.auChooser.places.findIndex((p) => p.label === 'Core Library');
    for (let i = 0; i < coreIdx; i++) jog(1);
    click(); click();
    jog(1);
    S.auChooser.restAt = 1;
    ticks(2);
    assert(PREVIEWS.indexOf('/data/CoreLibrary/Samples/Loops/Break.wav') >= 0, 'no audition: ' + PREVIEWS.join());
    click();
    assert(!S.auChooser && S.auEditor && S.auEditor.mode === 'wave', 'the chooser did not close back onto WAVE');
    assert(sent('t4_au_pick').join() === '0|/data/CoreLibrary/Samples/Loops/Break.wav', 'pick: ' + sent('t4_au_pick'));
    os.__setReaddir(null); globalThis.__stubStat = null;
    back();
    GET['t4_au_info_0'] = INFO(1, 8);
    A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ WAVE with no sample: the click corners, CLICK TO LOAD SAMPLE; a click opens the chooser', () => {
    GET['t4_au_info_0'] = '0 0 1 8 1 16 0 0 0 0 0 0 0 0 0 0 8|';
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    assert(E.auWaveSub(S.auEditor) === 'empty', 'not the empty view: ' + E.auWaveSub(S.auEditor));
    assert(inked(shown()), 'the empty view draws nothing');
    click(); ticks(2);
    assert(S.auChooser && S.auChooser.t === 4, 'a click did not open the chooser');
    back(); ticks(2);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ WAVE in Loop mode: K1 Start · K2 Zoom · K3 End · K4 Pitch · K5 Gain', () => {
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    assert(E.auWaveSub(S.auEditor) === 'loop', 'not the loop view');
    reset();
    cc(71, 1);
    assert(sent('t4_au_set_start').join() === '0 750', 'K1 Start: ' + JSON.stringify(sent('t4_au_set_start')));
    cc(74, 1);
    assert(sent('t4_au_set_pitch').join() === '0 1', 'K4 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')));
    cc(75, 127);
    assert(sent('t4_au_set_gain').join() === '0 -1', 'K5 Gain: ' + JSON.stringify(sent('t4_au_set_gain')));
    assert(inked(shown()), 'the loop view draws nothing');
    back();
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Lazy (from the picker): the next pad white, taps cut, Back asks "Keep N new chops?", Yes stays on WAVE', () => {
    mapPad(2, 2);
    reset();
    shiftClick(); jog(1); click(); click();          /* Chop sample > Lazy */
    ticks(1);
    assert(S.auEditor && S.auEditor.mode === 'lazy' && sent('t4_au_lazy').join() === '0 1', 'Lazy did not arm');
    DM.computePadNoteMap();
    assert(S.padNoteMap[0] === 0xFF, 'the pads still play slices during a chop');
    GET['t4_au_lazy'] = '1 0 0';
    ticks(4);
    const lit = () => Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const white = () => lit().filter((i) => LEDS.get(C.TRACK_PAD_BASE + i) === HC.White);
    assert(lit().join() === '0' && white().join() === '0', 'before the first tap, pad 1 alone, white: ' + lit().join());
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);
    assert(sent('t4_au_lazy_tap').length === 0, 'an unlit pad cut');
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    assert(sent('t4_au_lazy_tap').length === 1, 'pad 1 did not start it');
    GET['t4_au_lazy'] = '2 1 4000';
    ticks(4);
    /* the chopped slice stays lit (populated), the next one is white */
    assert(lit().join() === '0,1' && white().join() === '1', 'after a tap: lit ' + lit().join() + ', white ' + white().join());
    note(C.TRACK_PAD_BASE + 1, 100); note(C.TRACK_PAD_BASE + 1, 0);
    assert(sent('t4_au_lazy_tap').length === 2, 'the lit pad did not cut');
    GET['t4_au_lazy'] = '2 2 9000';
    ticks(4);
    back();
    assert(sent('t4_au_lazy').pop() === '0 0' && S.auEditor.ask && S.auEditor.ask.kind === 'keep', 'Back did not ask');
    GET['t4_au_lazy'] = '3 2 9000';
    ticks(4);
    const f = shown();
    const own = frame(() => D.drawAudioAsk('LAZY CHOP', ['Keep 2 new chops?'], 0));
    assert(inked(own) && same(f, own), 'the question is not on screen');
    click();                                         /* opens on Yes */
    assert(sent('t4_au_lazy_keep').join() === '1' && S.auEditor && S.auEditor.mode === 'wave', 'Yes did not keep and stay on WAVE');
    GET['t4_au_lazy'] = '0 0 0';
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Slice mode: pads are 36 + slice, none past the count; the CLIP bank mirrors ALL LANES', () => {
    ticks(2);
    DM.computePadNoteMap();
    assert(S.padNoteMap[0] === 36 && S.padNoteMap[3] === 39 && S.padNoteMap[7] === 0xFF && S.padNoteMap[8] === 40,
           'padmap: ' + Array.from(S.padNoteMap).slice(0, 12).join());
    /* ...and what reaches the engine takes no track octave: a slice has no
     * pitch (Josh, device: the pads went silent with the octave at +1) */
    S.trackOctave[4] = 1;
    const was = S.dspInboundEnabled;
    S.dspInboundEnabled = true;                        /* the engine plays the pads (as on the device) */
    reset();
    DM.computePadNoteMap();
    const pm = sent('t4_padmap').pop() || '';
    assert(pm.split(' ').slice(0, 4).join() === '36,37,38,39', 'the pushed padmap took the octave: ' + pm.slice(0, 40));
    /* ...nor does a held step + pad: the step gets the slice tapped */
    reset();
    note(16 + 2, 100);
    ticks(25);
    note(C.TRACK_PAD_BASE + 1, 100); note(C.TRACK_PAD_BASE + 1, 0);
    note(16 + 2, 0);
    ticks(3);
    const st = sentLike(/_step_2_/).map((x) => x[1]).join('|');
    assert(/37/.test(st) && !/49/.test(st), 'a held step took the octave: ' + JSON.stringify(sentLike(/_step_2_/)));
    S.dspInboundEnabled = was;
    S.trackOctave[4] = 0;
    S.activeBank = 0; S.bankCardLatched = true;
    ticks(1);
    const f = shown();
    assert(inked(f), 'the CLIP card draws nothing');
    reset();
    for (let i = 0; i < 30; i++) cc(74, 1);            /* K4 = NOTE FX Quantize */
    assert(sentLike(/quantize/).length > 0, 'K4 is not Quantize: ' + JSON.stringify(sets.concat(S.pendingDefaultSetParams.map((e) => [e.key, e.val]))));
    reset();
    for (let i = 0; i < 12; i++) cc(78, 1);            /* K8: free */
    assert(sets.length === 0 && S.pendingDefaultSetParams.length === 0, 'K8 wrote ' + JSON.stringify(sets));
});

step('⭐ NOTE FX takes no pitch knob (Oct, Offset, Random)', () => {
    S.activeBank = 1;
    reset();
    for (let i = 0; i < 12; i++) { cc(71, 1); cc(72, 1); cc(78, 1); }
    assert(sentLike(/noteFX_octave|noteFX_offset|noteFX_random/).length === 0, 'a pitch knob wrote');
    S.activeBank = 0;
});

step('⭐ the step editor\'s K1 reads "Slice n"', () => {
    S.heldStep = 0; S.heldStepNotes = [38]; S.activeBank = C.BANK_STEP;
    const cells = render.heldStepCells();
    assert(cells[0].label === 'Slice' && cells[0].bigText === 'Slice 3', 'K1: ' + JSON.stringify(cells[0]));
    S.heldStep = -1; S.heldStepNotes = []; S.activeBank = 0;
});

step('⭐⭐ Loop mode: pads jump (press + release), steps do nothing, the CLIP bank is Revrs Nudge JmpQ', () => {
    GET['t4_au_info_0'] = INFO(0, 8);
    A.auMarkStale(4, 0); ticks(4);
    DM.computePadNoteMap();
    assert(S.padNoteMap.every((v) => v === 0xFF), 'a Loop clip\'s pads play');
    reset();
    S.bankCardLatched = false;
    note(C.TRACK_PAD_BASE + 9, 100); note(C.TRACK_PAD_BASE + 9, 0);
    assert(sent('t4_au_jump').join() === '9' && sent('t4_au_jump_off').join() === '9', 'jumps');
    reset();
    note(16, 100); note(16, 0);
    ticks(2);
    assert(sentLike(/_step_/).length === 0, 'a step press edited a Loop clip: ' + JSON.stringify(sentLike(/_step_/)));
    const cells = A.auLoopBankCells(4);
    assert(cells.slice(0, 3).map((c) => c.label).join() === 'Revrs,Nudge,JmpQ', 'loop bank: ' + cells.map((c) => c.label));
    S.bankCardLatched = true;
    reset();
    for (let i = 0; i < 25; i++) cc(71, 1);
    assert(sent('t4_au_set_revrs').join() === '0 1', 'K1 is not Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    S.bankCardLatched = false;
});

step('⭐ an Audio clip pastes onto an Audio track only; the copy carries its sample', () => {
    const ED = globalThis.__ED;
    reset();
    assert(ED.copyClip(4, 0, 1, 0) === false && sent('clip_copy').length === 0, 'an Audio clip pasted onto a melodic track');
    assert(ED.copyClip(1, 0, 4, 3) === false && sent('clip_copy').length === 0, 'a melodic clip pasted onto an Audio track');
    ED.copyClip(4, 0, 4, 5);
    assert(sent('clip_copy').join() === '4 0 4 5', 'Audio -> Audio did not paste');
    assert(A.auInfo(4, 5).name === 'Break Phenom 84 bpm.wav' && S.clipNonEmpty[4][5] === S.clipNonEmpty[4][0], 'the copy did not carry the sample');
});

step('⭐⭐ leaving Audio asks (Q3); Yes converts back and forgets the samples', () => {
    S.clipNonEmpty[4][0] = true;
    reset();
    for (let k = 0; k < 8; k++) note(k, 0);        /* the knobs turned above are let go */
    openTrackConfigViaMap();
    ticks(6);
    const st = snd.soundPickStateForTest();
    assert(st.kinds[st.row] === 'trackto', 'the menu did not land on Instmt/Dest: ' + st.kinds[st.row]);
    assert(st.kinds.indexOf('block') < 0 || !st.comps.some((c) => /^midi_fx/.test(c || '')), 'an Audio track offers MIDI FX');
    cc(HC.MoveShift, 127); cc(3, 127); cc(3, 0); cc(HC.MoveShift, 0);
    ticks(4);
    const p = snd.soundEnumPickForTest();
    assert(p, 'Shift + click did not open the picker');
    const want = p.options.indexOf('None');
    let guard = 0;
    while (snd.soundEnumPickForTest().sel !== want && guard++ < 60) cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    cc(3, 127); cc(3, 0);
    ticks(1);
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'leave', 'leaving Audio did not ask');
    assert(inked(shown()), 'the question is not on screen');
    GET['t4_pad_mode'] = '0';                        /* what the engine answers once converted */
    const dlg = frame(() => D.drawConvertToDrumConfirm());
    S.confirmConvertToDrumSel = 0; cc(3, 127); cc(3, 0);
    ticks(4);
    /* the screen the TICK left (no drawUI of our own): not the question */
    assert(!same(FB.slice(), dlg), 'the answered question stayed on screen (found on the device)');
    assert(sent('t4_convert_to_melodic').length === 1, 'no conversion: ' + JSON.stringify(sentLike(/convert/)));
    assert(S.trackPadMode[4] === 0 && !A.isAudioTrack(4), 'still Audio');
    assert(!S.auInfo[4][0], 'the samples were not forgotten');
    snd.soundExit(); ticks(2);
});

step('⭐⭐ Purge samples: removes what no clip and no saved state uses — only that', () => {
    const dir = GET['t4_au_dir'];
    GET['t0_au_dir'] = dir;
    GET['au_used'] = 'Break Phenom 84 bpm.wav\n';
    const stateDir = dir.replace(/\/samples$/, '');
    os.__setReaddir({ [stateDir]: ['seq8sa-state.json', 'seq8sa-snap-1.json', 'samples'],
                      [dir]: ['Break Phenom 84 bpm.wav', 'old.wav', 'snap "q".wav'] });
    globalThis.__stubStat = { [dir + '/old.wav']: { mode: 0o100644, size: 2097152 },
                              [dir + '/snap "q".wav']: { mode: 0o100644, size: 9 },
                              [dir + '/Break Phenom 84 bpm.wav']: { mode: 0o100644, size: 9 } };
    const files = { [stateDir + '/seq8sa-snap-1.json']: '{"v":36,"t4c3_au2":"0 8 1 16 0 0 0 0 0 0 0|snap \\"q\\".wav"}' };
    const prevRead = globalThis.host_read_file;
    globalThis.host_read_file = (p) => files[p] || '';
    const p = CH.auPurgeScan();
    assert(p.files.length === 1 && p.files[0] === dir + '/old.wav' && p.bytes === 2097152, 'purge: ' + JSON.stringify(p.files));
    S.globalMenuOpen = true; S.confirmPurge = p; S.confirmPurgeSel = 0;
    assert(inked(shown()), 'the purge confirm draws nothing');
    const prevW = globalThis.__stubStdWritten;
    globalThis.__stubStdWritten = { [dir + '/old.wav']: 'x', [dir + '/Break Phenom 84 bpm.wav']: 'y' };
    click();
    assert(!S.confirmPurge, 'the confirm stayed');
    assert(!(dir + '/old.wav' in globalThis.__stubStdWritten) && (dir + '/Break Phenom 84 bpm.wav' in globalThis.__stubStdWritten),
           'removed the wrong files');
    assert(S.menuInfoLines[0] === 'Removed 1 sample', 'no result: ' + JSON.stringify(S.menuInfoLines));
    globalThis.__stubStdWritten = prevW;
    S.menuInfoLines = []; S.globalMenuOpen = false;
    globalThis.host_read_file = prevRead;
    os.__setReaddir(null); globalThis.__stubStat = null;
});

if (failed) { console.error('FAIL: test_audio_track_gesture'); process.exit(1); }
console.log('PASS: test_audio_track_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
