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
 *     MIX — no RPT GROOVE / LIVE ARP / PADMODE / HARMONY / SEQ ARP / DELAY;
 *     a Loop clip drops STEP and NOTE FX (no sequence);
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
 *   - the pads are the chops in time order, 8 a row from the bottom-left;
 *   - Slice mode: pads 36 + chop, none past the count; the CLIP bank reads
 *     Res Strch Shift Mode Crop InQnt Dir >Seq;
 *   - Loop mode: pad taps and steps do nothing, the pads show the loop as a
 *     progress bar; the CLIP bank is Nudge (K3) and Mode (K4); WAVE edits the
 *     chops too; NOTE FX takes no pitch knob;
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
/* ...with the fields after n: detune sync reach bpm10 hits sens trans slen (the sample at 84 BPM) */
const INFO24 = (mode, n, even, hits, sens, trans) => INFO(mode, n, even).replace('|', ' 0 0 96000 840 ' + hits + ' ' + sens + ' ' + trans + ' 0|');
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
const CCLEDS = new Map();
globalThis.move_midi_internal_send = (m) => {
    if (m && (m[1] & 0xF0) === 0x90) LEDS.set(m[2], m[3]);
    if (m && (m[1] & 0xF0) === 0xB0) CCLEDS.set(m[2], m[3]);   /* knob rings: CC 71-78 */
    return true;
};
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
globalThis.__kc = (await import('../../ui/ui_movy.mjs')).kitCellsForTest;
globalThis.__ring = (await import('../../ui/ui_knob_leds.mjs')).screenRingCells;
globalThis.__tc = (await import('../../ui/ui_leds.mjs')).trackColor;
const _kitText = [];
(await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => _kitText.push(String(x)));
globalThis.__texts = (fn) => { _kitText.length = 0; fn(); return _kitText.slice(); };
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

step('⭐⭐ the walk: IN (PAD MODE, LIVE ARP), no RPT GROOVE, HARMONY, SEQ ARP or DELAY; MIX last', () => {
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_CHORD, 5, C.BANK_MACROS, C.BANK_STEP, 0, 1, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_AUDIO, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0) === null, 'the MIDI FX pad is lit (Q4)');
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 7, 0).comp === 'fx1', 'FX 1 is dark');
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    /* SAMPLE and SLICES are the sample's editors; there is no sound bank
     * (Josh, 2026-10-30: "putting the params on track overview is a mistake") */
    assert(map[2].cells[2] && map[2].cells[2].action === 'slices' && map[2].cells[2].name === 'SLICES',
           'the SLICES door is not under CLIP: ' + JSON.stringify(map[2].cells[2]));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave' && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE door');
    assert(!map.some((c) => c.cells.some((x) => x && x.bank === C.BANK_AUDIO)), 'a pad opens the old sound bank');
    /* DELAY left Audio tracks (Josh, 2026-10-28: "let's get rid of delay") */
    assert(!map[3].cells[2], 'the DELAY pad is lit: ' + JSON.stringify(map[3].cells[2]));
});

const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const back = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
const shiftClick = () => { cc(HC.MoveShift, 127); click(); cc(HC.MoveShift, 0); };
/* SLICES' page 2: SLICE n, ALL SLICES with Shift held */
const ED = () => ({ t: 4, page: S.shiftHeld ? 0 : 1 });
const toSlicesP2 = () => { mapPad(2, 2); jog(1); ticks(1); };
const leave = () => { for (let n = 0; S.auEditor && n < 6; n++) { back(); ticks(1); } };

step('⭐⭐ no sound bank: Back from SAMPLE or SLICES returns to the bank that was showing (Josh, 2026-10-30: "just fall back to the last regular knob bank")', () => {
    S.activeBank = 1; S.bankCardLatched = false;
    for (const [r, name] of [[2, 'SLICES'], [3, 'SAMPLE']]) {
        mapPad(2, r);
        assert(S.auEditor && S.auEditor.ed === name.toLowerCase(), 'the ' + name + ' door did not open ' + name);
        back(); ticks(2);
        assert(!S.auEditor && !S.auPanel && S.activeBank === 1, 'Back from ' + name + ' did not return to the bank that was showing: ' + S.activeBank);
    }
    /* (the walk itself has no sound bank: the first step's walk list) */
    S.activeBank = 0; ticks(2);
});

step('⭐⭐ the instrument door on an Audio track is WAVE, the sample\'s editor: the map\'s instrument pad (Josh: "does it make sense ... be the wave editor?" · "make sense")', () => {
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 1).label === 'SAMPLE', 'the instrument pad is not labelled SAMPLE');
    S.activeBank = 0; S.bankCardLatched = false;
    cc(3, 127); note(P.bankMapPadForCell(6, 1), 100); note(P.bankMapPadForCell(6, 1), 0); cc(3, 0); ticks(3);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.activeBank === 0, 'the instrument pad did not open WAVE: ' + JSON.stringify({ ed: !!S.auEditor, b: S.activeBank }));
    back(); ticks(2);
    assert(!S.auEditor && !S.auPanel && S.activeBank === 0, 'Back did not leave WAVE for the bank it was on');
});

step('⭐ Pitch reads as a number and steps a semitone per detent run (Josh: "doesn\'t read out any values and is very touchy")', () => {
    toSlicesP2();
    S.shiftHeld = true;                              /* ALL SLICES */
    const cell = () => A.auPanelCells(ED())[4];
    assert(cell().kind === 'valsq' && cell().text === '+0', 'ALL SLICES Pitch: ' + JSON.stringify(cell()));
    reset();
    note(4, 127);
    for (let i = 0; i < 30; i++) cc(75, 1);         /* K5 Pitch: 30 encoder ticks */
    const n = sent('t4_au_all_pitch').length;
    assert(n >= 1 && n <= 3, '30 ticks moved Pitch ' + n + ' semitones: ' + JSON.stringify(sent('t4_au_all_pitch')));
    assert(cell().text === '+' + n, 'the cell does not read the new pitch: ' + cell().text);
    const tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('+' + n) >= 0, 'the touched Pitch does not read out: ' + JSON.stringify(tx));
    for (let i = 0; i < 30; i++) cc(75, 127);       /* back down */
    note(4, 0);
    S.shiftHeld = false;
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    /* SLICE n's Pitch too */
    assert(A.auPanelTitle(ED()).indexOf('SLICE') === 0, 'not on SLICE n: ' + A.auPanelTitle(ED()));
    const sc = A.auPanelCells(ED())[4];
    assert(sc.label === 'Pitch' && sc.kind === 'valsq' && /^[+-]\d+$/.test(sc.text), 'SLICE Pitch: ' + JSON.stringify(sc));
    reset();
    for (let i = 0; i < 30; i++) cc(75, 1);
    const m = sent('t4_au_slice_pitch').length;
    assert(m >= 1 && m <= 3, '30 ticks moved the slice pitch ' + m + ' semitones');
    leave();
});

step('⭐ SLICES page 2 is SLICE n, ALL SLICES with Shift held', () => {
    toSlicesP2();
    assert(A.auPanelTitle(ED()) === 'SLICE 1/8', 'page 2: ' + A.auPanelTitle(ED()));
    S.shiftHeld = true;
    assert(A.auPanelTitle(ED()) === 'ALL SLICES', 'Shift: ' + A.auPanelTitle(ED()));
    S.shiftHeld = false;
    leave();
});

step('⭐⭐ ALL SLICES knobs set every slice\'s own value, Pitch to Play (`--` where they differ); SAMPLE\'s are the base (Josh: "all slice params ... should set them all directly")', () => {
    toSlicesP2();
    S.shiftHeld = true;
    GET['t4_au_all_0'] = '0 0 0 x 0 0';                 /* the slices' attacks differ */
    A.auMarkStale(4, 0); ticks(2);
    assert(A.auPanelCells(ED())[0].text === '--', 'Attk: ' + A.auPanelCells(ED())[0].text);
    reset();
    for (let i = 0; i < 10; i++) cc(75, 1);             /* K5 Pitch: one detent run (KNOB_PICK) */
    assert(sent('t4_au_all_pitch').join() === '0 1', 'pitch: ' + JSON.stringify(sentLike(/_au_/)));
    cc(76, 1); cc(76, 1);                               /* K6 Detune: cents */
    assert(sent('t4_au_all_detune').join() === '0 1,0 2', 'detune: ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auPanelCells(ED())[5].label === 'Detune' && A.auPanelCells(ED())[5].kind === 'arcbip' &&
           A.auPanelCells(ED())[5].text === '+2' && A.auPanelCells(ED())[5].signed === 2 / 50,
           'the Detune cell: ' + JSON.stringify(A.auPanelCells(ED())[5]));
    cc(74, 1);                                          /* K4 Gain */
    assert(sent('t4_au_all_gain').join() === '0 1', 'gain: ' + JSON.stringify(sentLike(/_au_/)));
    assert(!sentLike(/_au_set_(pitch|detune|gain)$/).length, 'ALL SLICES moved the clip\'s base: ' + JSON.stringify(sentLike(/_au_set_/)));
    cc(71, 1);                                          /* K1 Attk: every slice */
    assert(sent('t4_au_all_atk').length === 1, 'Attk did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    touchClick(2);                                      /* K3 is blank: a click does nothing */
    assert(!sent('t4_au_chop').length, 'K3 + click sequences from SLICES');
    S.shiftHeld = false;
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_all_0'] = '0 x 0 0 0 0';
    A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ SLICE n edits the last pad tapped', () => {
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);
    assert(A.auSelSlice(4) === 2, 'the pad did not pick slice 3');
    toSlicesP2();
    ticks(2);
    assert(A.auPanelTitle(ED()) === 'SLICE 3/8', A.auPanelTitle(ED()));
    assert(A.auPanelCells(ED()).map((c) => c.label).join() === 'Attk,Decay,,Gain,Pitch,Detune,Revrs,Play', 'SLICE: sound only');
    assert(A.auPanelCells(ED())[3].text === '-3 dB', 'slice 3 gain: ' + A.auPanelCells(ED())[3].text);
    reset();
    for (let i = 0; i < 3; i++) cc(74, 1);             /* K4 Gain */
    assert(sent('t4_au_slice_gain').some((v) => /^0 2 -2$/.test(v)), 'slice gain: ' + JSON.stringify(sent('t4_au_slice_gain')));
    cc(76, 127);                                        /* K6 Detune */
    assert(sent('t4_au_slice_detune').join() === '0 2 -1', 'slice detune: ' + JSON.stringify(sent('t4_au_slice_detune')));
    leave();
});

step('⭐ Decay: shortest at the bottom of the dial, Full at the top (Josh: "it should be max at max when it\'s turned all the way up")', () => {
    toSlicesP2();
    const last = () => { const v = sent('t4_au_slice_dec'); return v.length ? v[v.length - 1].split(' ')[2] : null; };
    reset();
    cc(72, 127);                                     /* K2 down from Full */
    assert(last() === '5000', 'down from Full did not land on 5000 ms: ' + last());
    for (let i = 0; i < 300; i++) cc(72, 127);       /* all the way down */
    assert(last() === '5' && !sent('t4_au_slice_dec').some((v) => / 0$/.test(v)),
           'all the way down is not the shortest decay: ' + last());
    assert(A.auPanelCells(ED())[1].text === '5ms' && A.auPanelCells(ED())[1].norm < 0.01, 'the bottom: ' + JSON.stringify(A.auPanelCells(ED())[1]));
    for (let i = 0; i < 400; i++) cc(72, 1);         /* all the way up */
    assert(last() === '0' && A.auPanelCells(ED())[1].text === 'Full' && A.auPanelCells(ED())[1].norm === 1,
           'all the way up is not Full: ' + last());
    leave();
    S.activeBank = 0;
});

step('⭐⭐ >Seq is on the CLIP bank in Slice mode: touch K8 + click (Josh: ">seq in the clip BANK")', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    assert(!S.auPanel, 'the AUDIO editor is still open');
    note(7, 127); ticks(1); shown();                    /* the touch brings the bank card up */
    const kc = globalThis.__kc();
    assert(kc.cells[7] && kc.cells[7].label === '>Seq', 'CLIP bank K8: ' + JSON.stringify(kc.cells.map((c) => c && c.label)));
    reset();
    click(); note(7, 0);
    /* a clip whose length was never set grows to the sample's Bars (Josh: "in adaptive mode, it'd put the whole sequence on") */
    assert(sent('t4_au_chop').join() === '0 1' && S.knobTouched === -1, '>Seq: ' + JSON.stringify(sentLike(/_au_/)));
    S.actionPopupEndTick = 0;                           /* its popup (wall-clock timed) is not under test */
    ticks(2);
    /* a set length stays: the chops past it wait out of bounds */
    S.clipLengthManuallySet[4][0] = true;
    reset();
    note(7, 127); ticks(1); click(); note(7, 0);
    assert(sent('t4_au_chop').join() === '0 0', '>Seq on a set length: ' + JSON.stringify(sentLike(/_au_/)));
    S.clipLengthManuallySet[4][0] = false;
    S.actionPopupEndTick = 0;
    ticks(2);
});

step('⭐⭐ the map\'s SAMPLE pad opens SAMPLE; a click there loads a sample — chopping is SLICES\' alone (Josh, 2026-10-30: "chopping should only be on slices")', () => {
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[2].cells[3] && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE pad on the instrument slot');
    mapPad(2, 3);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.auPanel && S.auPanel.wave, 'WAVE did not open');
    ticks(2);
    assert(inked(shown()), 'WAVE draws nothing');
    reset();
    const ed = S.auEditor;
    /* the jog turns SAMPLE's pages (Josh, 2026-10-29: "the waveform on page 1
     * and the params on page 2"): over to Sync / Revrs / Orig and back */
    jog(1); ticks(1);
    let ptx = globalThis.__texts(() => shown());
    assert(ed.page === 1 && ptx.indexOf('2/2') >= 0 && ptx.indexOf('ORIG') >= 0, 'the jog did not turn to page 2: ' + JSON.stringify(ptx));
    jog(-1); ticks(1);
    ptx = globalThis.__texts(() => shown());
    assert(ed.page === 0 && ptx.indexOf('1/2') >= 0, 'the jog did not turn back to page 1: ' + JSON.stringify(ptx));
    click(); ticks(2);
    assert(S.auChooser && !ed.pick && S.auEditor === ed, 'a click did not open the sample chooser: ' + JSON.stringify({ ch: !!S.auChooser, pick: ed.pick }));
    assert(!sentLike(/_au_(mark_add|set_even)/).length, 'a click on SAMPLE edited the chops: ' + JSON.stringify(sentLike(/_au_/)));
    back(); ticks(2);
    assert(!S.auChooser && S.auEditor === ed, 'Back did not close the chooser onto SAMPLE');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back did not leave WAVE');
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ WAVE in Slice mode edits the CLIP: K1 / K3 its Start / End, no cursor, no Delete + pad; a pad goes to its chop at the zoom it has (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3);
    ticks(2);
    const ed = S.auEditor;
    reset();
    cc(71, 1);
    assert(sent('t4_au_set_start').join() === '0 750' && !sent('t4_au_slice_start').length,
           'K1 is not the clip\'s Start: ' + JSON.stringify(sentLike(/_au_/)));
    const cur0 = ed.cur;
    jog(2);
    assert(ed.cur === cur0 && ed.page === 1, 'the jog moved a cursor on WAVE (it turns the page): ' + ed.cur);
    jog(-2);
    cc(HC.MoveDelete, 127); note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0); cc(HC.MoveDelete, 0);
    assert(!sent('t4_au_mark_del').length, 'Delete + pad removed a chop on WAVE');
    /* zoomed in, a pad goes to its chop's start and the zoom stays (Josh,
     * 2026-10-28: "zoom persists through selection by pads (which should snap
     * to slice start") */
    for (let z = 0; z < 6; z++) cc(72, 1);
    const span = ed.B - ed.A;
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);
    assert(A.auSelSlice(4) === 5 && ed.B - ed.A === span && Math.abs((ed.A + ed.B) / 2 - 60000) <= 1,
           'pad 6 did not go to its chop at the same zoom: ' + ed.A + '..' + ed.B + ' (span ' + span + ')');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Manual (SLICES › click › Manual): the chops as they are; pads pick, K1/K3 move by a pixel, K2 zooms, click adds, Delete + pad removes, Delete + click clears', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);                                       /* SLICES: chopping lives only here */
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave' && ed.ed === 'slices', 'no SLICES editor');
    reset();
    click(); jog(1); jog(1); jog(1); click();           /* the chop types, one row a detent */
    /* no question on the way in (Josh: "edit existing chips with a "clear all" option") */
    assert(ed.mode === 'chop' && ed.chop.kind === 'manual' && !ed.ask && !sent('t4_au_manual').length,
           'Manual did not open on the chops as they are: ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ask: ed.ask }));
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);   /* the timeline: pad 6 is chop 6 */
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
    const tx = globalThis.__texts(() => assert(inked(shown()), 'the editor draws nothing'));
    assert(['CLK', 'ADD', 'DEL+CLK', 'CLEAR'].every((h) => tx.indexOf(h) >= 0), 'Manual hints: ' + JSON.stringify(tx));
    /* Delete + click: "Clear all chops?" — No keeps them, Yes leaves one */
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    assert(ed.ask && ed.ask.kind === 'clear', 'Delete + click did not ask');
    const f = shown();
    assert(same(f, frame(() => D.drawAudioAsk('MANUAL', ['Clear all chops?', 'One slice, Start to End.'], 1))), 'the question is not on screen');
    click();                                         /* opens on No */
    assert(!ed.ask && !sent('t4_au_manual').length && ed.mode === 'chop', 'No cleared, or left Manual');
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0); jog(1); click();
    assert(sent('t4_au_manual').join() === '0' && A.auInfo(4, 0).n === 1 && ed.mode === 'chop', 'Yes did not clear to one slice');
    back();
    assert(S.auEditor === ed && ed.mode === 'wave' && !ed.ask, 'Back from Manual did not return to WAVE');
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

step('⭐⭐ the map opens from WAVE (hold the jog); a pick leaves it for that bank (Josh)', () => {
    for (const [col, row, name] of [[2, 3, 'SAMPLE']]) {
        mapPad(col, row);
        assert(S.auPanel, name + ' did not open');
        S.activeBank = 1;                                /* somewhere else, so the pick is visible */
        cc(3, 127);                                      /* hold the jog */
        if (name === 'SAMPLE') {
            assert(S.jogDeferred && !S.bankMapUp, 'the press over ' + name + ' was not held back');
            S.jogPressMs = S.clockMs - C.JOG_HOLD_MAP_MS - 50;   /* ...held past the threshold (this rig's clock) */
            ticks(2);
        } else {
            /* Josh, 2026-10-28: "there's a delay when entering pad map from
             * "audio" editor, but it's not necessary" */
            assert(!S.jogDeferred && S.bankMapUp, 'the press over the AUDIO editor did not show the map at once');
        }
        assert(S.bankMapUp, 'holding the jog over ' + name + ' did not bring up the map');
        /* ...lit where you are: that screen's own pad (Josh: "pad map should show when you're in audio/wave") */
        ticks(2);
        assert(LEDS.get(P.bankMapPadForCell(col, row)) === HC.White, 'the map does not light ' + name + '\'s pad: ' + LEDS.get(P.bankMapPadForCell(col, row)));
        /* ...and the map on the SCREEN says so too (Josh: "the pad map doesn't
         * indicate that you're on wave or audio - still shows last bank") */
        const cur = render.bankMapItems().cur;
        assert(cur && cur.c === col && cur.r === row, 'the screen map marks ' + JSON.stringify(cur) + ', not ' + name);
        /* the other one of AUDIO / WAVE is the track's colour, as AUDIO is (Josh: "wave map pad should be track color just like audio") */
        const other = name === 'SAMPLE' ? [2, 2] : [2, 3];
        assert(LEDS.get(P.bankMapPadForCell(other[0], other[1])) === globalThis.__tc(4),
               'the other Audio pad is not the track colour: ' + LEDS.get(P.bankMapPadForCell(other[0], other[1])) + ' vs ' + globalThis.__tc(4));
        const whites = Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i)).filter((v) => v === HC.White).length;
        assert(whites === 1, 'the map lights ' + whites + ' pads white over ' + name + ' (the bank under it too?)');
        note(P.bankMapPadForCell(2, 1), 100); note(P.bankMapPadForCell(2, 1), 0);   /* CLIP */
        cc(3, 0); ticks(3);
        assert(!S.auPanel && !S.auEditor && S.activeBank === 0, 'the pick did not leave ' + name + ' for CLIP: bank ' + S.activeBank);
    }
    /* ...and a short click is still the screen's: SLICES opens its chop types */
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    reset();
    click(); ticks(2);
    assert(S.auEditor.pick && !S.bankMapUp, 'a short click did not reach SLICES: ' + JSON.stringify(S.auEditor.pick));
    back(); back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Shift shortcuts work over WAVE and its chooser: a step or the jog leaves the screen and runs (Josh: "shift shortcuts don\'t seem to work")', () => {
    /* Shift + Step 2: Project Settings */
    mapPad(2, 3);
    assert(S.auEditor, 'WAVE did not open');
    cc(HC.MoveShift, 127); note(17, 100); note(17, 0); cc(HC.MoveShift, 0); ticks(3);
    assert(!S.auEditor && !S.auPanel, 'Shift + Step 2 did not leave WAVE');
    assert(S.globalMenuOpen, 'Shift + Step 2 did not open Project Settings over WAVE');
    back(); ticks(2);
    assert(!S.globalMenuOpen, 'Back did not close Project Settings');
    /* Shift + jog: the track */
    mapPad(2, 3);
    const was = S.activeTrack;
    cc(HC.MoveShift, 127); jog(1); cc(HC.MoveShift, 0); ticks(3);
    assert(!S.auEditor && S.activeTrack !== was, 'Shift + jog did not leave WAVE for the next track: ' + S.activeTrack);
    cc(HC.MoveShift, 127); jog(-1); cc(HC.MoveShift, 0); ticks(3);
    assert(S.activeTrack === was, 'Shift + jog did not come back');
    /* Shift + click is still SAMPLE's own (it loads, as a click does) */
    mapPad(2, 3);
    shiftClick(); ticks(2);
    assert(S.auEditor && S.auChooser, 'Shift + click left SAMPLE instead of opening the chooser');
    back(); ticks(2);
    assert(S.auEditor && !S.auChooser, 'Back did not close the chooser onto SAMPLE');
    back(); ticks(2);
    assert(!S.auEditor, 'WAVE did not close');
});

step('⭐⭐ WAVE: SLICE n/n or LOOP up top; Start / End light while touched or turned; ZOOM + / - / ZOOM between them (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);   /* a hand set of 8 */
    mapPad(2, 3);
    ticks(2);
    const px = (f, x, y) => f[y * 128 + x];
    let f, tx = globalThis.__texts(() => { f = shown(); });
    /* a click loads (chopping is SLICES' alone), the jog turns the page; SAMPLE
     * page 1 of 2 under the sample's name (SLICE n/N is SLICES') */
    assert(['CLK', 'LOAD', 'JOG', 'PAGE'].every((h) => tx.indexOf(h) >= 0), 'Slice hints: ' + JSON.stringify(tx));
    assert(tx.indexOf('1/2') >= 0 && tx.some((x) => /^BREAK PHENOM/.test(x)), 'the header: ' + JSON.stringify(tx.slice(0, 6)));
    assert(!px(f, 2, 9) && !px(f, 3, 15), 'Start is lit with no knob in hand');
    note(0, 127); f = shown();
    assert(px(f, 2, 9) && px(f, 2, 15), 'touching K1 did not light Start');
    note(0, 0); f = shown();
    assert(!px(f, 2, 9), 'letting go of K1 left Start lit');
    cc(73, 1); f = shown();                          /* K3 turned, no touch */
    const rx = 124 - 2;                              /* the end strip runs to x 124 */
    assert(S.knobTouched === 2 && px(f, rx, 9), 'turning K3 did not light End');
    S.knobTurnedTick[2] = S.clockMs - 1000; ticks(1); f = shown();
    assert(S.knobTouched === -1 && !px(f, rx, 9), 'End stayed lit after the turn');
    tx = globalThis.__texts(() => { cc(72, 1); shown(); });
    assert(tx.indexOf('ZOOM +') >= 0, 'zooming in: ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { cc(72, 127); shown(); });
    assert(tx.indexOf('ZOOM -') >= 0, 'zooming out: ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(1, 127); shown(); });
    assert(tx.indexOf('ZOOM') >= 0 && tx.indexOf('ZOOM +') < 0 && tx.indexOf('ZOOM -') < 0, 'a touched K2: ' + JSON.stringify(tx));
    note(1, 0);
    back();
    /* Loop: the sample's name up top (Josh: "show the sample name in the
     * header of "sample" instead of "loop""); Zoom takes the middle from
     * Pitch / Gain while in hand */
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3); ticks(2);
    let lf;
    tx = globalThis.__texts(() => { lf = shown(); });
    assert(tx.indexOf('CLK') >= 0 && tx.indexOf('LOAD') >= 0 && tx.indexOf('JOG') >= 0 && tx.indexOf('PAGE') >= 0 && tx.indexOf('1/2') >= 0,
           'Loop hints: ' + JSON.stringify(tx));
    /* nothing in the middle with no knob in hand (Josh) */
    const nm = A.auSampleName(4, 0).toUpperCase();
    assert(nm && nm !== 'NO SAMPLE' && tx.some((x) => x.toUpperCase() === nm) && tx.indexOf('LOOP') < 0 && !tx.some((x) => /^(ZOOM [+-]|GAIN |PITCH |DETUNE )|ST$|DB$/.test(x)) && !lf[12 * 128 + 64], 'Loop at rest: ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { cc(72, 1); lf = shown(); });
    /* ...and in hand it is lit, as Start / End are */
    assert(tx.indexOf('ZOOM +') >= 0 && lf[9 * 128 + 64] && lf[15 * 128 + 64], 'Loop zoom: ' + JSON.stringify(tx));
    S.knobTurnedTick[1] = S.clockMs - 1000; ticks(1);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ WAVE K4 Gain · K5 Pitch · K6 Detune (the clip\'s), read out in the middle; the waveform follows the gain (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3); ticks(2);
    const waveInk = () => { const f = shown(); let n = 0; for (let y = 20; y < 50; y++) for (let x = 0; x < 128; x++) n += f[y * 128 + x]; return n; };
    const quiet = waveInk();
    reset();
    let tx = globalThis.__texts(() => { for (let i = 0; i < 6; i++) cc(74, 1); shown(); });
    assert(sent('t4_au_set_gain').pop() === '0 6' && tx.indexOf('GAIN +6DB') >= 0, 'K4 Gain: ' + JSON.stringify(sent('t4_au_set_gain')) + ' ' + JSON.stringify(tx));
    /* measured before a tick: this rig's engine stub answers 0 dB to a re-read */
    assert(waveInk() > quiet, 'the waveform did not grow with +6 dB: ' + quiet + ' -> ' + waveInk());
    tx = globalThis.__texts(() => { for (let i = 0; i < 10; i++) cc(75, 1); shown(); });
    assert(sent('t4_au_set_pitch').join() === '0 1' && tx.indexOf('PITCH +1') >= 0, 'K5 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')) + ' ' + JSON.stringify(tx));
    /* each turn from idle (the knob's acceleration reads Date.now(): two turns in
     * one millisecond on one machine are two steps, on another a fraction) */
    tx = globalThis.__texts(() => { S.knobAccelLast[5] = 0; cc(76, 127); S.knobAccelLast[5] = 0; cc(76, 127); shown(); });
    assert(sent('t4_au_set_detune').join() === '0 -1,0 -2' && tx.indexOf('DETUNE -2') >= 0, 'K6 Detune: ' + JSON.stringify(sent('t4_au_set_detune')) + ' ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(3, 127); shown(); });
    assert(tx.indexOf('GAIN +6DB') >= 0, 'touching K4 does not read out: ' + JSON.stringify(tx));
    note(3, 0);
    /* K7 the sample's own Tempo, 1 BPM a step — in Slice mode too, where
     * >Seq places the chops by it (Josh, 2026-10-29: Move's "tempo knob to
     * set the original tempo") */
    GET['t4_au_info_0'] = INFO24(1, 8, 0, 8, 50, 0);   /* 84 BPM */
    A.auMarkStale(4, 0); ticks(2);
    assert(A.auInfo(4, 0).bpm10 === 840, 'the Tempo was not read: ' + A.auInfo(4, 0).bpm10);
    tx = globalThis.__texts(() => { S.knobAccelLast[6] = 0; cc(77, 1); shown(); });
    const bs = sent('t4_au_set_bpm');
    assert(bs.length === 1 && bs[0] === '0 850' && tx.indexOf('TEMPO 85 BPM') >= 0,
           'K7 Tempo: ' + JSON.stringify(bs) + ' ' + JSON.stringify(tx));
    /* ...and with Shift a tenth (Josh, 2026-10-30: "fine adjust with shift
     * modifier tempo (needs decimals) and length") */
    S.shiftHeld = true;
    tx = globalThis.__texts(() => { S.knobAccelLast[6] = 0; cc(77, 1); shown(); });
    S.shiftHeld = false;
    assert(sent('t4_au_set_bpm').pop() === '0 851' && tx.indexOf('TEMPO 85.1 BPM') >= 0,
           'Shift + K7: ' + JSON.stringify(sent('t4_au_set_bpm')) + ' ' + JSON.stringify(tx));
    back();
    /* K3 Length on a Loop clip: a bar a detent, a step with Shift */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0);   /* 84 BPM */
    A.auMarkStale(4, 0); ticks(2);
    S.clipLength[4][0] = 2; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    mapPad(2, 3); ticks(2);
    const led = S.auEditor;
    reset();
    S.knobAccelLast[2] = 0; cc(73, 1);
    assert(sent('t4_c0_loop_set').join() === '18', 'K3: not a bar: ' + JSON.stringify(sent('t4_c0_loop_set')));
    S.shiftHeld = true; S.knobAccelLast[2] = 0; cc(73, 127); S.shiftHeld = false;
    assert(sent('t4_c0_loop_set').pop() === '17', 'Shift + K3: not a step: ' + JSON.stringify(sent('t4_c0_loop_set')));
    /* Length touched last: Tempo keeps the clip's end on screen (Josh,
     * 2026-10-30: "if i last touched length, wave view should stay focused on
     * the end of the clip while adjusting bpm") */
    S.clipLength[4][0] = 3; A.auMarkStale(4, 0); ticks(2);
    S.shiftHeld = true; S.knobAccelLast[2] = 0; cc(73, 127); S.shiftHeld = false;   /* 2 steps, inside the file; K3 last */
    for (let z = 0; z < 3; z++) cc(72, 1);           /* zoom in */
    const endNow = () => A.auPlayedEnd(4, 0, A.auInfo(4, 0));
    assert(!led.full && Math.abs(led.B - endNow()) <= 1, 'not on the end before the Tempo turn: ' + led.A + '..' + led.B + ' end ' + endNow());
    for (let k = 0; k < 4; k++) { S.knobAccelLast[6] = 0; cc(77, 127); }
    assert(Math.abs(led.B - endNow()) <= 1 && sent('t4_au_set_bpm').length >= 4,
           'the view left the end while Tempo turned: ' + led.A + '..' + led.B + ' end ' + endNow());
    back();
    S.clipLength[4][0] = 16;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Delete + click on a grid page resets that page only: SLICE n, ALL SLICES with Shift, SAMPLE page 2 (Josh: "for multi-page banks, we should have delete+jog only reset the active page")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    A.auSetSelSlice(4, 2);
    toSlicesP2();
    reset();
    S.shiftHeld = true;                              /* ALL SLICES */
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    S.shiftHeld = false;
    const got = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(!sentLike(/_au_set_/).length, 'ALL SLICES reset the clip\'s base: ' + got);
    assert(['all_pitch=0 0', 'all_detune=0 0', 'all_gain=0 0', 'all_rev=0 0', 'all_atk=0 0', 'all_dec=0 0', 'all_play=0 0']
           .every((k) => got.indexOf('t4_au_' + k) >= 0), 'ALL SLICES did not reset: ' + got);
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);   /* SLICE 3 */
    const sg = sentLike(/_au_slice_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(!sentLike(/_au_set_/).length && !sentLike(/_au_all_/).length, 'SLICE n reset more than itself: ' + JSON.stringify(sentLike(/_au_/)));
    assert(['pitch', 'detune', 'gain', 'rev', 'atk', 'dec', 'play'].every((f) => sg.indexOf('t4_au_slice_' + f + '=0 2 0') >= 0),
           'SLICE 3 did not reset: ' + sg);
    reset();
    click();                                         /* a plain click resets nothing */
    assert(!sentLike(/_au_/).length, 'a plain click reset: ' + JSON.stringify(sentLike(/_au_/)));
    leave();
    /* SAMPLE page 2: Gain, Pitch, Detune, Revrs — not Tempo, not Sync */
    mapPad(2, 3); jog(1); ticks(1);
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    const sa = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(['gain', 'pitch', 'detune', 'revrs'].every((f) => sa.indexOf('t4_au_set_' + f + '=0 0') >= 0) && !sent('t4_au_set_bpm').length && !sent('t4_au_set_sync').length,
           'SAMPLE page 2 did not reset its sound only: ' + sa);
    leave();
    S.actionPopupEndTick = 0;
    S.activeBank = 0; ticks(2);
});

step('⭐ Delete + track clears an Audio clip\'s sequence and keeps its sample and length; Shift + Delete is the full reset (Josh)', () => {
    const ED = globalThis.__ED;
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    S.clipLength[4][0] = 48; S.clipLengthManuallySet[4][0] = true;
    reset();
    ED.clearClip(4, 0, false);
    /* the mirror, before the reread (the stub answers a length of 16) */
    const mirrored = S.clipLength[4][0] === 48 && S.clipLengthManuallySet[4][0];
    ticks(3);
    assert(sent('t4_c0_clear').length === 1, 'no clear: ' + JSON.stringify(sentLike(/_c0_/)));
    assert(A.auInfo(4, 0).name === 'Break Phenom 84 bpm.wav' && S.clipNonEmpty[4][0] && mirrored,
           'the clear dropped the sample or the length: ' + A.auInfo(4, 0).name + ' ' + S.clipLength[4][0]);
    ED.hardResetClip(4, 0); ticks(3);
    assert(sent('t4_c0_hard_reset').length === 1, 'no hard reset');
    S.clipLength[4][0] = 16; S.clipLengthManuallySet[4][0] = false;
    A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ the knob rings follow the Audio screens and the AUDIO bank: lit where a knob works, dark where it does nothing (Josh)', () => {
    const lit = () => globalThis.__ring().map((c) => (c ? 1 : 0)).join('');
    const sent8 = () => [71, 72, 73, 74, 75, 76, 77, 78].map((cc_) => (CCLEDS.get(cc_) ? 1 : 0)).join('');
    assert(globalThis.__ring() === null, 'rings taken with no Audio screen up');
    toSlicesP2(); ticks(3);                          /* SLICES page 2, SLICE n: K3 is blank */
    assert(sent8() === '11011111', 'SLICE n rings: ' + sent8());
    S.shiftHeld = true; ticks(3);                    /* ALL SLICES: K3 is blank */
    assert(sent8() === '11011111', 'ALL SLICES rings: ' + sent8());
    S.shiftHeld = false;
    leave(); ticks(3);
    assert(globalThis.__ring() === null, 'rings kept after leaving SLICES');
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(3);
    S.activeBank = 0;
    mapPad(2, 3); ticks(2);                          /* SAMPLE page 1: K1-K8 (K8 Revrs) */
    assert(lit() === '11111111', 'WAVE rings: ' + lit());
    ticks(3);                                        /* ...and that is what the knobs get */
    assert(sent8() === '11111111', 'the rings sent over WAVE: ' + sent8() + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((x) => CCLEDS.get(x))));
    const g0 = globalThis.__ring()[3].norm;
    cc(74, 1);
    assert(globalThis.__ring()[3].norm > g0, 'the Gain ring did not follow the turn');
    S.knobTurnedTick[3] = S.clockMs - 1000; ticks(1);
    jog(1); ticks(3);                                /* SAMPLE page 2 (Loop): Orig, Sync, K3 blank, K4-K8 */
    assert(sent8() === '11011111', 'SAMPLE page 2 rings: ' + sent8());
    back();
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ SLICES (Josh, 2026-10-29): page 1 the chops — K1 / K3 the slice, a click the chop types; page 2 slice n, Shift every slice; a Loop clip has none', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    assert(!P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4)[2].cells[2], 'a Loop clip\'s map shows a SLICES pad (found on the device)');
    mapPad(2, 2);
    assert(!S.auEditor, 'the SLICES door opened on a Loop clip');
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(2);
    A.auSetSelSlice(4, 2);
    mapPad(2, 2);
    let ed = S.auEditor;
    assert(ed && ed.ed === 'slices' && ed.page !== 1, 'SLICES did not open on its first page');
    let tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SLICE 3/8') >= 0 && tx.indexOf('1/2') >= 0 && tx.indexOf('CHOP') >= 0, 'SLICES page 1: ' + JSON.stringify(tx));
    /* the chops: a dotted line through the waveform on SLICES (chop 1 at x 16,
     * the wave's middle row y 35 cleared — chop 2's column is the fixture's
     * playhead), a faint tick top and bottom on SAMPLE (the middle left
     * alone) — shown there, not offered */
    {
        const px = (f, x, y) => f[y * 128 + x];
        let f = shown();
        assert(!px(f, 16, 35), 'SLICES does not draw chop 1 through the waveform');
        back(); ticks(2);
        mapPad(2, 3); ticks(2);
        f = shown();
        assert(S.auEditor && S.auEditor.ed === 'sample' && px(f, 16, 35) && px(f, 16, 20) && px(f, 16, 21),
               'SAMPLE on a Slice clip does not show chop 1 as a faint tick');
        back(); ticks(2);
        mapPad(2, 2); ticks(2);
        ed = S.auEditor;
    }
    reset();
    cc(71, 1);
    assert(sent('t4_au_slice_start').length === 1 && !sent('t4_au_set_start').length,
           'K1 is not the slice\'s start: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    /* K4-K8 are the slice's, as on page 2 (Josh, 2026-10-30) */
    for (let i = 0; i < 20 && !sent('t4_au_slice_rev').length; i++) cc(77, 1);
    assert(sent('t4_au_slice_rev').join() === '0 2 1' && !sent('t4_au_set_revrs').length,
           'SLICES page 1 K7 is not the slice\'s Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_slice_rev').length < 2; i++) cc(77, 127);
    reset();
    S.knobTouched = -1; S.shiftHeld = true;
    cc(74, 1);
    tx = globalThis.__texts(() => shown());
    assert(sent('t4_au_all_gain').length === 1 && !sent('t4_au_set_gain').length && tx.some((x) => /^ALL GAIN /.test(x)),
           'Shift + page 1 K4 is not every slice\'s Gain: ' + JSON.stringify(sentLike(/_au_/)) + ' ' + JSON.stringify(tx));
    S.shiftHeld = false; S.knobTouched = -1;
    reset();
    click();
    assert(ed.pick && ed.pick.level === 2 && E.auPickRows(ed).map((r) => r.label).join() === 'Even,Transient,Lazy,Manual',
           'a click did not open the chop types: ' + JSON.stringify(ed.pick));
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the chop types onto SLICES');
    jog(1); ticks(1);
    tx = globalThis.__texts(() => shown());
    assert(ed.page === 1 && tx.indexOf('2/2') >= 0 && tx.some((x) => /^SLICE 3\/8$/.test(x)), 'SLICES page 2: ' + JSON.stringify(tx));
    reset();
    for (let i = 0; i < 30; i++) cc(75, 1);
    assert(sent('t4_au_slice_pitch').length >= 1 && !sent('t4_au_set_pitch').length, 'page 2 K5 is not slice 3\'s Pitch: ' + JSON.stringify(sentLike(/_au_/)));
    /* Shift held: every slice (a bare Shift tap is a host shortcut this rig
     * does not stub, so the hold is the state the knobs read) */
    S.knobTouched = -1; S.shiftHeld = true; ticks(1);
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('ALL SLICES') >= 0, 'Shift did not show ALL SLICES: ' + JSON.stringify(tx));
    reset();
    for (let i = 0; i < 40 && !sentLike(/_au_all_rev/).length; i++) cc(77, 1);
    assert(sentLike(/_au_all_rev/).length === 1, 'Shift + K7 is not every slice\'s Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 40 && sentLike(/_au_all_rev/).length < 2; i++) cc(77, 127);
    S.shiftHeld = false; S.knobTouched = -1;
    jog(-1);
    back(); ticks(2);
    assert(!S.auEditor && S.activeBank === 0, 'Back from SLICES did not return to the bank it was on: ' + S.activeBank);
    S.activeBank = 0;
    A.auSetSelSlice(4, 0);
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ the editor follows the clip: a side button with SAMPLE or SLICES up moves it onto that clip (Josh, 2026-10-30: "it doesn\'t change to the new clip")', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    S.sceneRow = 0;
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8;
    delete GET['t4_au_info_1'];
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3); ticks(2);
    assert(S.auEditor && S.auEditor.c === 0, 'SAMPLE did not open on clip A');
    const sideB = () => { cc(42, 127); cc(42, 0); ticks(4); };      /* the second side button: clip B */
    sideB();
    let tx = globalThis.__texts(() => shown());
    assert(S.auEditor && S.auEditor.c === 1 && A.auClipOf(4) === 1, 'SAMPLE did not move to clip B: ' + (S.auEditor && S.auEditor.c));
    assert(tx.indexOf('CLICK TO LOAD SAMPLE') >= 0, 'clip B (empty) is not shown: ' + JSON.stringify(tx));
    cc(43, 127); cc(43, 0); ticks(4);                               /* back to clip A */
    assert(S.auEditor && S.auEditor.c === 0, 'SAMPLE did not move back to clip A');
    back(); ticks(2);
    /* SLICES onto a clip with no slices: SAMPLE */
    mapPad(2, 2); ticks(2);
    assert(S.auEditor && S.auEditor.ed === 'slices', 'SLICES did not open');
    sideB();
    assert(S.auEditor && S.auEditor.c === 1 && S.auEditor.ed === 'sample', 'SLICES on an empty clip did not become SAMPLE: ' + JSON.stringify(S.auEditor && { c: S.auEditor.c, ed: S.auEditor.ed }));
    cc(43, 127); cc(43, 0); ticks(4);
    back(); ticks(2);
    S.activeBank = 0;
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ SAMPLE zoomed out is the clip: the audio where it lands at its Tempo, empty past the file, a tick a beat (Josh, 2026-10-29)', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    /* an 84 BPM sample of 2 s (96000 frames at 48 kHz) in a 1-bar clip: a bar
     * at 84 is 2.86 s, so the file ends 70% across — the rest is empty */
    GET['t4_au_info_0'] = INFO24(0, 8, 8, 0, 50, 0);
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor, i = A.auInfo(4, 0);
    const want = Math.round(384 * A.auFpt(i));
    assert(ed && ed.ed === 'sample' && ed.A === 0 && ed.B === want, 'the view is not the clip\'s bar: ' + (ed && ed.A) + '..' + (ed && ed.B) + ' want 0..' + want);
    const f = shown(), px = (x, y) => f[y * 128 + x];
    const inkCol = (x) => { for (let y = 20; y < 50; y++) if (px(x, y)) return true; return false; };
    const endX = Math.floor(96000 / want * 128);
    assert(inkCol(10) && inkCol(endX - 2), 'the audio is not drawn up to the file\'s end at x ' + endX);
    for (let x = endX + 1; x < 128; x++) assert(!inkCol(x), 'past the file\'s end is not empty (x ' + x + ')');
    /* beats every 32 columns, the bar's two ends taller */
    const r51 = [...Array(128).keys()].filter((x) => px(x, 51)), r53 = [...Array(128).keys()].filter((x) => px(x, 53));
    assert(r51.length === 5 && [0, 32, 64, 96, 127].every((x, k) => Math.abs(r51[k] - x) <= 1) && r53.join() === '0,127',
           'the beat / bar ticks are not under the clip\'s beats: ' + r51 + ' / ' + r53);
    /* the Tempo knob squeezes it: at 168 the bar holds the whole file and more */
    reset();
    for (let i2 = 0; i2 < 84 && (A.auInfo(4, 0).bpm10 | 0) < 1680; i2++) { S.knobAccelLast[6] = 0; cc(77, 1); }
    shown();                                          /* drawn at once (a tick would re-read this rig's fixed info) */
    assert(A.auInfo(4, 0).bpm10 >= 1680 && ed.B - ed.A === Math.round(384 * A.auFpt(A.auInfo(4, 0))) && ed.B < want,
           'turning Tempo up did not shorten the clip\'s window in the sample: ' + ed.A + '..' + ed.B + ' at ' + A.auInfo(4, 0).bpm10);
    back(); ticks(2);
    S.activeBank = 0;
    /* Track View at rest says the Loop clip's Tempo on its info row (Josh: "LOOP 112") */
    GET['t4_au_info_0'] = INFO24(0, 8, 8, 0, 50, 0); A.auMarkStale(4, 0); ticks(2);
    S.knobTouched = -1; S.bankCardLatched = false;
    const rtx = globalThis.__texts(() => shown());
    assert(rtx.some((x) => /^loop 84 /i.test(x)), 'the info row does not carry the Tempo: ' + JSON.stringify(rtx.slice(0, 4)));
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐ Start / End read in seconds to 2 decimals, rounded (Josh: "2 decimals, rounded, for the seconds read-out is fine")', () => {
    assert(A.auFmtTime(55125, 44100) === '1.25s' && A.auFmtTime(237, 44100) === '0.01s' &&
           A.auFmtTime(44100 * 12.346, 44100) === '12.35s' && A.auFmtTime(44100 * 75.5, 44100) === '1:15.50',
           [A.auFmtTime(55125, 44100), A.auFmtTime(237, 44100), A.auFmtTime(44100 * 12.346, 44100), A.auFmtTime(44100 * 75.5, 44100)].join());
});

step('⭐⭐ chopping lives only on SLICES: a click there opens the chop types; SAMPLE\'s click and Shift + click load (Josh: "chopping should only be on slices")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);   /* a hand set of 8, Even Off */
    mapPad(2, 3);
    reset();
    shiftClick(); ticks(2);
    let ed = S.auEditor;
    assert(ed && ed.ed === 'sample' && !ed.pick && S.auChooser, 'Shift + click on SAMPLE did not load: ' + JSON.stringify(ed && ed.pick));
    assert(sentLike(/mark_add/).length === 0, 'Shift + click also added a marker');
    back(); ticks(2);
    assert(!S.auChooser && S.auEditor === ed, 'Back did not close the chooser onto SAMPLE');
    back();
    mapPad(2, 2);
    ed = S.auEditor;
    click();
    assert(ed.pick && ed.pick.level === 2 && E.auPickRows(ed).map((r) => r.label).join() === 'Even,Transient,Lazy,Manual',
           'a click on SLICES did not open the chop types: ' + JSON.stringify(ed.pick));
    assert(inked(shown()), 'the chop types draw nothing');
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the chop types (SLICES stays)');
    back();
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ Even (SLICES › Even): the chop editor, 16 to start, the jog live on the pads; Back asks "Keep N chops?" — Yes bakes, No puts them back (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    const ed = S.auEditor;
    const setP = globalThis.host_module_set_param;
    globalThis.host_module_set_param = (k, v) => {     /* the engine applies Even, as the real one does */
        setP(k, v);
        if (String(k) === 't4_au_set_even') { const e = parseInt(String(v).split(' ')[1], 10); GET['t4_au_info_0'] = e ? INFO(1, e, e) : INFO(1, 8, 0); }
    };
    try {
        reset();
        click(); click();                             /* SLICES › Even */
        assert(ed.mode === 'chop' && ed.chop.kind === 'even' && sent('t4_au_set_even').join() === '0 16',
               'Even did not open its editor at 16 (Josh: "even 16."): ' + JSON.stringify(sent('t4_au_set_even')));
        let tx = globalThis.__texts(() => assert(inked(shown()), 'Even draws nothing'));
        assert(tx.indexOf('EVEN') >= 0 && tx.indexOf('16 CHOPS') >= 0 && tx.indexOf('MANUAL') >= 0, 'Even screen: ' + JSON.stringify(tx));
        const litPads = () => { ticks(2); return Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0).filter((v) => v).length; };
        jog(-1);
        assert(sent('t4_au_set_even').pop() === '0 15' && A.auInfo(4, 0).n === 15 && litPads() === 15,
               'Even 15 is not live on the pads: ' + JSON.stringify(sent('t4_au_set_even')) + ' lit ' + litPads());
        jog(1); jog(1); jog(1);
        assert(sent('t4_au_set_even').pop() === '0 18' && litPads() === 18, 'Even 18 is not live on the pads: lit ' + litPads());
        tx = globalThis.__texts(() => shown());
        assert(tx.indexOf('COUNT 18') >= 0, 'the count is not read out while the jog turns: ' + JSON.stringify(tx));
        /* a pad plays its chop (Josh: "yes - and in manual") */
        note(C.TRACK_PAD_BASE + 3, 100);
        assert(A.auSelSlice(4) === 3, 'a pad in Even did not pick its chop');
        note(C.TRACK_PAD_BASE + 3, 0);
        back();
        assert(ed.ask && ed.ask.kind === 'chops', 'Back did not ask');
        assert(same(shown(), frame(() => D.drawAudioAsk('EVEN', ['Keep 18 chops?'], 0))), '"Keep 18 chops?" is not on screen');
        click();                                      /* opens on Yes */
        assert(sent('t4_au_even_bake').join() === '0' && ed.mode === 'wave' && A.auInfo(4, 0).even === 0 && A.auInfo(4, 0).hand === 18,
               'Yes did not make the 18 the clip\'s chops: ' + JSON.stringify(sentLike(/_au_/)));
        assert(!sent('t4_au_set_mode').length, 'choosing Even set the Mode');
        /* No: the slicing it had before (here, the hand set: Even Off) */
        GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
        reset();
        click(); click(); jog(1);
        back(); jog(-1); click();
        assert(sent('t4_au_set_even').pop() === '0 0' && !sent('t4_au_even_bake').length && ed.mode === 'wave',
               'No did not put Even Off back: ' + JSON.stringify(sentLike(/_au_/)));
    } finally { globalThis.host_module_set_param = setP; }
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Transient (SLICES › Transient): the REAL gesture — on, the jog turns Sens, the marks follow, Back asks; Yes bakes, No cancels (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);
    const ed = S.auEditor;
    reset();
    click(); jog(1); click();                         /* SLICES › Transient */
    assert(ed.mode === 'chop' && ed.chop.kind === 'transient' && sent('t4_au_set_trans').join() === '0 1',
           'Transient did not open: ' + JSON.stringify(sentLike(/_au_/)));
    let tx = globalThis.__texts(() => assert(inked(shown()), 'Transient draws nothing'));
    assert(tx.indexOf('TRANSIENT') >= 0 && tx.some((x) => / CHOPS$/.test(x)), 'Transient screen: ' + JSON.stringify(tx));
    jog(3);
    assert(sent('t4_au_set_sens').pop() === '0 53', 'the jog is not Sens: ' + JSON.stringify(sent('t4_au_set_sens')));
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SENS 53') >= 0, 'Sens is not read out while the jog turns: ' + JSON.stringify(tx));
    /* the engine answers with its chops at that Sens: the screen follows */
    const before = shown();
    GET['t4_au_marks_0'] = '0 20000 20000 45000 45000 70000 70000 96000';
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 53, 1);
    ticks(3);
    assert(A.auMarks(4, 0).length === 4, 'the marks were not re-read: ' + A.auMarks(4, 0).length);
    tx = globalThis.__texts(() => assert(!same(shown(), before), 'the marks on screen did not change'));
    assert(tx.indexOf('4 CHOPS') >= 0, 'the count: ' + JSON.stringify(tx));
    /* more than 128 hits: the first 128 (Josh: "keep the first 128") */
    GET['t4_au_info_0'] = INFO24(1, 128, 0, 211, 53, 1); A.auMarkStale(4, 0); ticks(3);
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('128+ CHOPS') >= 0, 'over the cap: ' + JSON.stringify(tx));
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 53, 1); A.auMarkStale(4, 0); ticks(3);
    assert(globalThis.__ring().map((c) => (c ? 1 : 0)).join('') === '01011110', 'Transient rings: ' + globalThis.__ring().map((c) => (c ? 1 : 0)).join(''));
    back();
    assert(ed.ask && ed.ask.kind === 'chops' && same(shown(), frame(() => D.drawAudioAsk('TRANSIENT', ['Keep 4 chops?'], 0))),
           '"Keep 4 chops?" is not on screen');
    click();
    assert(sent('t4_au_trans_bake').join() === '0' && ed.mode === 'wave' && S.auEditor === ed, 'Yes did not bake: ' + JSON.stringify(sentLike(/_au_/)));
    /* No: cancelled, the hand set as it was */
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(2);
    reset();
    click(); jog(1); click();
    back(); jog(-1); click();
    assert(sent('t4_au_set_trans').join() === '0 1,0 0' && !sent('t4_au_trans_bake').length && ed.mode === 'wave',
           'No did not cancel: ' + JSON.stringify(sentLike(/_au_/)));
    back();
    assert(!S.auEditor, 'WAVE did not close');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Load sample: the chooser opens over WAVE, auditions, a click picks and lands back on WAVE', () => {
    mapPad(2, 3);
    reset(); PREVIEWS.length = 0;
    click();                                         /* SAMPLE: a click loads */
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
    mapPad(2, 3);
    assert(E.auWaveSub(S.auEditor) === 'empty', 'not the empty view: ' + E.auWaveSub(S.auEditor));
    assert(inked(shown()), 'the empty view draws nothing');
    click(); ticks(2);
    assert(S.auChooser && S.auChooser.t === 4, 'a click did not open the chooser');
    back(); ticks(2);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ WAVE in Loop mode: K1 Start · K2 Zoom · K3 End · K4 Gain · K5 Pitch; no chops, no cursor', () => {
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3);
    assert(E.auWaveSub(S.auEditor) === 'loop', 'not the loop view');
    reset();
    cc(71, 1);
    assert(sent('t4_au_set_start').join() === '0 750', 'K1 Start: ' + JSON.stringify(sent('t4_au_set_start')));
    for (let i = 0; i < 10; i++) cc(75, 1);
    assert(sent('t4_au_set_pitch').join() === '0 1', 'K5 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')));
    cc(74, 127);
    assert(sent('t4_au_set_gain').join() === '0 -1', 'K4 Gain: ' + JSON.stringify(sent('t4_au_set_gain')));
    assert(inked(shown()), 'the loop view draws nothing');
    /* no chops and no cursor in Loop (Josh, 2026-10-29: "chops should just be
     * completely invisible in loop mode"; the cursor "only in slice mode"): a
     * pad leaves it, the jog does not move it, a click adds no chop, neither
     * is drawn, Delete + pad removes none, and Shift + click offers Load only */
    reset();
    const cur0 = S.auEditor.cur;
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);
    assert(S.auEditor.cur === cur0, 'a Loop pad moved the cursor: ' + S.auEditor.cur);
    jog(2);
    assert(S.auEditor.cur === cur0, 'the jog moved a Loop cursor: ' + S.auEditor.cur);
    S.auEditor.cur = 6000;                           /* between chops, where Slice would add one */
    click();
    S.auEditor.cur = cur0;
    assert(!sent('t4_au_mark_add').length, 'a click in Loop added a chop: ' + JSON.stringify(sent('t4_au_mark_add')));
    const f0 = shown(); S.auEditor.cur = cur0 + 30000; S.screenDirty = true;
    assert(same(shown(), f0), 'a cursor is drawn in Loop');
    S.auEditor.cur = cur0;
    const marked = shown();
    A.auMarksLocal(4, 0, [[0, 96000]]);                 /* one chop, not eight: nothing drawn changes */
    assert(same(shown(), marked), 'the chops are drawn in Loop');
    A.auMarkStale(4, 0); ticks(2);
    S.auEditor.pick = { level: 1, sel: 0 };
    assert(E.auPickRows(S.auEditor).map((r) => r.id).join() === 'load', 'Loop\'s picker: ' + E.auPickRows(S.auEditor).map((r) => r.id));
    S.auEditor.pick = null;
    cc(HC.MoveDelete, 127); note(C.TRACK_PAD_BASE + 3, 100); note(C.TRACK_PAD_BASE + 3, 0); cc(HC.MoveDelete, 0);
    assert(!sent('t4_au_mark_del').length, 'Delete + pad in Loop removed a chop: ' + JSON.stringify(sent('t4_au_mark_del')));
    assert(!sent('t4_au_set_mode').length, 'editing chops changed the Mode');
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Lazy (SLICES › Lazy): the next pad white, taps cut, Back asks "Keep N new chops?", Yes stays on WAVE', () => {
    mapPad(2, 2);
    reset();
    click(); jog(1); jog(1); click();                 /* SLICES › Lazy */
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

step('⭐⭐ a click in Even / Transient / Lazy keeps the chops and opens Manual on them (Josh: "manual chopping can\'t be available from any other chop screen to edit the chops that are there")', () => {
    const toManual = (label) => {
        const ed = S.auEditor;
        assert(ed.mode === 'chop' && ed.chop && ed.chop.kind === 'manual' && !ed.ask && !ed.pick,
               label + ': a click did not open Manual: ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ask: ed.ask, pick: ed.pick }));
        assert(!sent('t4_au_manual').length, label + ': Manual cleared the chops');
        let n = 0;
        while (S.auEditor && n++ < 6) { if (S.auEditor.ask) { jog(-1); click(); } else back(); ticks(1); }
        assert(!S.auEditor, label + ': could not leave');
    };
    /* Even: baked into a hand set, then Manual */
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2); reset();
    click(); click();                                 /* SLICES › Even */
    assert(S.auEditor.chop && S.auEditor.chop.kind === 'even', 'Even did not open');
    click();
    assert(sent('t4_au_even_bake').join() === '0', 'Even: the click did not keep the chops: ' + JSON.stringify(sentLike(/_au_/)));
    toManual('Even');
    /* Transient */
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2); reset();
    click(); jog(1); click();                         /* SLICES › Transient */
    assert(S.auEditor.chop && S.auEditor.chop.kind === 'transient', 'Transient did not open');
    click();
    assert(sent('t4_au_trans_bake').join() === '0', 'Transient: the click did not keep the chops: ' + JSON.stringify(sentLike(/_au_/)));
    toManual('Transient');
    /* Lazy, running: ends, keeps what was tapped */
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2); reset();
    click(); jog(1); jog(1); click();                 /* SLICES › Lazy */
    GET['t4_au_lazy'] = '1 0 0'; ticks(4);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    GET['t4_au_lazy'] = '2 1 4000'; ticks(4);
    click();
    assert(sent('t4_au_lazy').pop() === '0 0' && sent('t4_au_lazy_keep').join() === '1',
           'Lazy (running): the click did not end and keep: ' + JSON.stringify(sentLike(/_au_lazy/)));
    GET['t4_au_lazy'] = '0 0 0';
    toManual('Lazy (running)');
    /* Lazy, armed with no tap: nothing to keep */
    mapPad(2, 2); reset();
    click(); jog(1); jog(1); click();
    GET['t4_au_lazy'] = '1 0 0'; ticks(4);
    click();
    assert(sent('t4_au_lazy').pop() === '0 0' && !sent('t4_au_lazy_keep').length,
           'Lazy (armed): ' + JSON.stringify(sentLike(/_au_lazy/)));
    GET['t4_au_lazy'] = '0 0 0';
    toManual('Lazy (armed)');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ PAD MODE is a Slice clip\'s alone: a Loop clip\'s IN column has none (Josh: "loop mode should always be 4 rows and has no need for the pad bank")', () => {
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    let map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(!map[0].cells.some((c) => c && c.name === 'PAD MODE'), 'a Loop clip shows PAD MODE: ' + JSON.stringify(map[0].cells));
    S.auLayout[4] = 1;
    assert(!A.auLayoutOn(4), 'a saved 16 Pads layout still applies to a Loop clip');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(2);
    assert(A.auLayoutOn(4), 'the 16 Pads layout does not apply to a Slice clip');
    S.auLayout[4] = 0;
    map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[0].cells.some((c) => c && c.name === 'PAD MODE'), 'a Slice clip lost PAD MODE');
    ticks(20);
});

step('⭐⭐ SLICES zoomed out is SAMPLE\'s window: Start for its Length, widened only to a chop left outside it; the Manual cursor stays inside (Josh, 2026-10-30: "sample\'s start and length should set the zone limits for viewing and chopping the waveform in slice")', () => {
    /* Start 24000, Length 96 ticks at 84 BPM (357.14 frames a tick): to 58286 */
    const short = INFO24(1, 4, 0, 4, 50, 0).replace(' 16 0 96000 ', ' 16 24000 58286 ').replace(/ 0\|/, ' 96|');
    GET['t4_au_info_0'] = short;
    GET['t4_au_marks_0'] = '24000 32000 32000 40000 40000 48000 48000 58286';
    A.auMarkStale(4, 0); ticks(2);
    assert(A.auInfo(4, 0).rstart === 24000 && A.auInfo(4, 0).slen === 96, 'the fixture: ' + JSON.stringify(A.auInfo(4, 0)));
    mapPad(2, 3); ticks(2); shown();
    const sa = [S.auEditor.A, S.auEditor.B];
    back(); ticks(2);
    mapPad(2, 2); ticks(2); shown();
    const ed = S.auEditor;
    assert(ed.ed === 'slices' && ed.full && ed.A === 24000 && Math.abs(ed.B - 58286) <= 1,
           'SLICES zoomed out is not the window: ' + ed.A + '..' + ed.B);
    assert(ed.A === sa[0] && Math.abs(ed.B - sa[1]) <= 1, 'SLICES and SAMPLE differ: ' + ed.A + '..' + ed.B + ' vs ' + sa.join('..'));
    /* Manual: the cursor cannot leave the chopped part */
    click(); jog(1); jog(1); jog(1); click();
    assert(ed.chop && ed.chop.kind === 'manual', 'Manual did not open');
    for (let i = 0; i < 300; i++) jog(-1);
    assert(ed.cur >= 24000, 'the cursor left the chopped part: ' + ed.cur);
    back(); ticks(2);
    if (S.auEditor && S.auEditor.ask) { jog(-1); click(); }
    while (S.auEditor) { back(); ticks(1); }
    /* a Start moved after chopping leaves chop 1 outside: the view widens to it */
    GET['t4_au_marks_0'] = '10000 32000 32000 40000 40000 48000 48000 58286';
    S.auStartsRev = (S.auStartsRev | 0) + 1;         /* the marks are cached until the clip changes */
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2); ticks(2); shown();
    assert(S.auEditor.A === 10000 && Math.abs(S.auEditor.B - 58286) <= 1, 'not widened to the chop outside: ' + S.auEditor.A + '..' + S.auEditor.B);
    back(); ticks(2);
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ the sequence works with SAMPLE or SLICES up, as under any instrument editor: a step tap, Record, hold a step + jog for its page (Josh, 2026-10-30: "note sequencing via step and record should work in sample and slice just like any other mode ... as should step editing via jog turn")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(2);
    S.activeBank = 0; S.bankCardLatched = false;
    const ac = S.trackActiveClip[4] | 0;
    const tap = (k) => { note(16 + k, 127); note(16 + k, 0); ticks(3); };
    const keys = () => sets.map((x) => x[0]).filter((k) => /^t4_/.test(k)).join();
    /* the control: what a tap does in Track View */
    reset(); tap(3);
    const tv = keys();
    assert(tv.length, 'control: a step tap in Track View sends nothing');
    tap(3);                                           /* and back */
    for (const [r, name] of [[3, 'SAMPLE'], [2, 'SLICES']]) {
        mapPad(2, r);
        assert(S.auEditor && S.auEditor.ed === name.toLowerCase(), name + ' did not open');
        reset(); tap(3);
        assert(keys() === tv && S.auEditor, 'a step tap over ' + name + ' is not Track View\'s: ' + keys() + ' vs ' + tv);
        tap(3);
        back(); ticks(2);
    }
    /* Record: the same as in Track View */
    const r0 = S.recordArmed;
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); ticks(2);
    const r1 = S.recordArmed;
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); ticks(2);
    assert(r1 !== r0 && S.recordArmed === r0, 'control: Record does not toggle in Track View');
    mapPad(2, 2);
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); ticks(2);
    assert(S.recordArmed === r1 && S.auEditor, 'Record over SLICES did not do what it does in Track View');
    cc(HC.MoveRec, 127); cc(HC.MoveRec, 0); ticks(2);
    assert(S.recordArmed === r0, 'Record over SLICES did not toggle back');
    /* hold a filled step + jog right: its page, over the editor; left: back */
    S.clipSteps[4][ac][5] = 1; S.clipNonEmpty[4][ac] = true;
    note(21, 127); S.tickCount += 25; ticks(1);
    assert(S.heldStep === 5, 'the step is not held over SLICES: ' + S.heldStep);
    jog(1); ticks(1);
    let tx = globalThis.__texts(() => shown());
    assert(S.stepReveal && S.auEditor && !(S.auEditor.page | 0) && tx.indexOf('CHOP') < 0,
           'hold + jog right did not show the step\'s page over SLICES: ' + JSON.stringify({ rev: S.stepReveal, page: S.auEditor && S.auEditor.page, tx }));
    S.stepRevealJogTick = -100000;                   /* past the reveal's debounce */
    jog(-1); ticks(1);
    tx = globalThis.__texts(() => shown());
    assert(!S.stepReveal && tx.indexOf('CHOP') >= 0, 'jog left did not come back to SLICES: ' + JSON.stringify({ panel: S.auPanel, ed: !!S.auEditor, held: S.heldStep, rev: S.stepReveal, tx: tx.slice(0, 4) }));
    note(21, 0); ticks(3);
    S.clipSteps[4][ac][5] = 0;
    leave();
    S.activeBank = 0; ticks(2);
});

step('⭐⭐ Slice mode: pads are 36 + chop in time order, 8 a row, none past the count; the CLIP bank mirrors ALL LANES', () => {
    ticks(2);
    DM.computePadNoteMap();
    /* Josh, 2026-10-28: "8 a row timeline" */
    /* chop k is note k (Josh, 2026-10-28: "might as well do 128") */
    assert(S.padNoteMap[0] === 0 && S.padNoteMap[3] === 3 && S.padNoteMap[7] === 7 && S.padNoteMap[8] === 0xFF,
           'padmap: ' + Array.from(S.padNoteMap).slice(0, 12).join());
    /* ...and what reaches the engine takes no track octave: a slice has no
     * pitch (Josh, device: the pads went silent with the octave at +1) */
    S.trackOctave[4] = 1;
    const was = S.dspInboundEnabled;
    S.dspInboundEnabled = true;                        /* the engine plays the pads (as on the device) */
    reset();
    DM.computePadNoteMap();
    const pm = sent('t4_padmap').pop() || '';
    assert(pm.split(' ').slice(0, 4).join() === '0,1,2,3', 'the pushed padmap took the octave: ' + pm.slice(0, 40));
    /* ...nor does a held step + pad: the step gets the slice tapped */
    reset();
    note(16 + 2, 100);
    ticks(25);
    note(C.TRACK_PAD_BASE + 1, 100); note(C.TRACK_PAD_BASE + 1, 0);
    note(16 + 2, 0);
    ticks(3);
    const st = sentLike(/_step_2_/).map((x) => x[1]).join('|');
    assert(/(^|[^0-9])1([^0-9]|$)/.test(st) && !/13/.test(st), 'a held step took the octave: ' + JSON.stringify(sentLike(/_step_2_/)));
    S.dspInboundEnabled = was;
    S.trackOctave[4] = 0;
    S.activeBank = 0; S.bankCardLatched = true;
    ticks(1);
    const f = shown();
    assert(inked(f), 'the CLIP card draws nothing');
    const kc = globalThis.__kc();
    /* Mode on K1 (Josh, 2026-10-30: "mode needs to move to k1 on clip"), Res on K4 */
    assert(kc.cells.map((c) => c && c.label).join() === 'Mode,Strch,Shift,Res,Crop,InQnt,Dir,>Seq',
           'the Slice CLIP bank: ' + kc.cells.map((c) => c && c.label));
    reset();
    for (let i = 0; i < 30; i++) cc(71, 127);          /* K1 = Mode */
    assert(sent('t4_au_set_mode').join() === '0 0' && sentLike(/quantize|resolution/).length === 0,
           'K1 is not Mode: ' + JSON.stringify(sets.concat(S.pendingDefaultSetParams.map((e) => [e.key, e.val]))));
    for (let i = 0; i < 30; i++) cc(71, 1);            /* ...and back to Slice */
    assert(sent('t4_au_set_mode').pop() === '0 1', 'K1 did not turn back to Slice');
    /* K4 is Res now, and its touch + click alt is Zoom on Res's own bit */
    reset();
    for (let i = 0; i < 30 && !sentLike(/resolution/).length; i++) cc(74, 1);
    assert(sentLike(/resolution/).length >= 1 && !sent('t4_au_set_mode').length, 'K4 is not Res: ' + JSON.stringify(sets));
    for (let i = 0; i < 30 && sentLike(/resolution/).length < 2; i++) cc(74, 127);
    note(3, 127); click(); note(3, 0);
    assert(S.knobAlt === 1 && A.auAltBit(4, 0, 3) === 0, 'touch K4 + click did not flip Res\'s own alt: ' + S.knobAlt);
    note(3, 127); click(); note(3, 0);
    assert(S.knobAlt === 0, 'the second click did not flip it back');
    reset();
    for (let i = 0; i < 12; i++) cc(78, 1);            /* K8: >Seq, a trigger: a turn does nothing */
    assert(sets.length === 0 && S.pendingDefaultSetParams.length === 0, 'K8 wrote ' + JSON.stringify(sets));
    /* a touched knob's hint is the Audio bank's own, never the melodic CLIP's
     * (found on the device: K4 read CLK LEGATO) */
    const hint = (k) => { S.knobTouched = k; const h = render.bankPageHints(0); S.knobTouched = -1; return JSON.stringify(h); };
    assert(hint(3).indexOf('LEGATO') < 0 && hint(4) === '[["CLK","CROP"]]' && hint(7) === '[["CLK",">SEQ"]]' &&
           hint(5).indexOf('CROP') < 0 && hint(7).indexOf('IMPORT') < 0,
           'Slice CLIP hints: K4 ' + hint(3) + ' K5 ' + hint(4) + ' K6 ' + hint(5) + ' K8 ' + hint(7));
    /* a bank the track does not have (a project's remembered DELAY) goes back to CLIP */
    S.activeBank = 3; ticks(2);
    assert(S.activeBank === 0, 'a remembered DELAY bank stayed on an Audio track: ' + S.activeBank);
});

step('⭐ NOTE FX takes no pitch knob (Oct, Offset, Random)', () => {
    S.activeBank = 1;
    reset();
    for (let i = 0; i < 12; i++) { cc(71, 1); cc(72, 1); cc(78, 1); }
    assert(sentLike(/noteFX_octave|noteFX_offset|noteFX_random/).length === 0, 'a pitch knob wrote');
    S.activeBank = 0;
});

step('⭐ the step editor\'s K1 reads "Slice n"', () => {
    S.heldStep = 0; S.heldStepNotes = [2]; S.activeBank = C.BANK_STEP;
    const cells = render.heldStepCells();
    assert(cells[0].label === 'Slice' && cells[0].bigText === 'Slice 3', 'K1: ' + JSON.stringify(cells[0]));
    S.heldStep = -1; S.heldStepNotes = []; S.activeBank = 0;
});

step('⭐⭐ Loop mode: no sequence — pad taps and steps do nothing, no STEP / NOTE FX; the CLIP bank is Mode alone, the sound on SAMPLE', () => {
    S.activeBank = 1;                                  /* on NOTE FX when the clip turns Loop */
    GET['t4_au_info_0'] = INFO(0, 8);
    A.auMarkStale(4, 0); ticks(4);
    assert(S.activeBank === 0, 'still on NOTE FX with a Loop clip: bank ' + S.activeBank);
    /* Josh, 2026-10-28: "we don't need to show notes at all in loop mode" */
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    /* no PAD MODE on a Loop clip (Josh, 2026-10-30: "loop mode should always be 4 rows and has no need for the pad bank") */
    assert(JSON.stringify(walk) === JSON.stringify([5, C.BANK_MACROS, 0, C.BANK_SOUND]), 'Loop walk: ' + walk.join());
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(!map[2].cells[0] && !map[3].cells[0] && map[2].cells[1], 'the Loop map still has STEP / NOTE FX');
    DM.computePadNoteMap();
    assert(S.padNoteMap.every((v) => v === 0xFF), 'a Loop clip\'s pads play');
    reset();
    S.bankCardLatched = false;
    note(C.TRACK_PAD_BASE + 3, 100); note(C.TRACK_PAD_BASE + 3, 0);
    assert(sentLike(/_au_/).length === 0, 'a Loop pad tap wrote: ' + JSON.stringify(sentLike(/_au_/)));
    note(16, 100); note(16, 0);
    ticks(2);
    assert(sentLike(/_step_/).length === 0, 'a step press edited a Loop clip: ' + JSON.stringify(sentLike(/_step_/)));
    const cells = A.auLoopBankCells(4);
    assert(cells.map((c) => c.label).join() === 'Mode,Strch,Shift,,,,,', 'loop bank: ' + cells.map((c) => c.label));
    /* Mode · Strch · Shift (alt Nudge): the clip's transforms in audio (Josh,
     * 2026-10-30: "an audio-based analog of what they do with midi. thinking
     * of stretch and shift mainly"); the rest do nothing, the sound is SAMPLE's */
    S.bankCardLatched = true;
    reset();
    for (const k of [74, 75, 76, 77, 78]) { S.knobAccelLast[k - 71] = 0; for (let i = 0; i < 30; i++) cc(k, 1); }
    assert(!sentLike(/_au_|_loop_set/).length, 'a Loop CLIP knob past K3 acts: ' + JSON.stringify(sentLike(/_au_|_loop_set/)));
    {
        const ac = S.trackActiveClip[4] | 0, len0 = S.clipLength[4][ac] | 0 || 16, tps = S.clipTPS[4][ac] || 24;
        const bpm0 = A.auInfo(4, ac).bpm10 || 1200;
        /* K2 Strch x2: twice the Length, half the Tempo — half speed over twice the bars */
        reset();
        for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 1);
        assert(sent('t4_c' + ac + '_loop_set').join() === String(len0 * 2) && sent('t4_au_set_bpm').join() === ac + ' ' + Math.round(bpm0 / 2),
               'Strch x2 is not Length x2 + Tempo /2: ' + JSON.stringify(sentLike(/_au_|_loop_set/)));
        S.knobTouched = 1;
        assert(A.auLoopBankCells(4)[1].text === 'x2', 'Strch does not read x2 while turned: ' + A.auLoopBankCells(4)[1].text);
        S.knobTouched = -1;
        assert(A.auLoopBankCells(4)[1].text === '1x', 'Strch does not rest at 1x');
        /* ...and /2 back */
        reset();
        for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 127);
        assert(sent('t4_c' + ac + '_loop_set').join() === String(len0) && S.clipLength[4][ac] === len0, 'Strch /2 did not come back: ' + JSON.stringify(sentLike(/_loop_set/)));
        /* K3 Shift: a step a detent run, wrapping round the clip */
        reset();
        for (let i = 0; i < 30 && !sent('t4_au_set_rot').length; i++) cc(73, 1);
        assert(sent('t4_au_set_rot').join() === ac + ' ' + tps && A.auLoopBankCells(4)[2].text === '+1',
               'Shift is not a step: ' + JSON.stringify(sent('t4_au_set_rot')) + ' ' + A.auLoopBankCells(4)[2].text);
        reset();
        for (let i = 0; i < 30 && sent('t4_au_set_rot').length < 2; i++) cc(73, 127);
        assert(sent('t4_au_set_rot').join() === ac + ' 0,' + ac + ' ' + (len0 * tps - tps), 'Shift does not wrap below 0: ' + JSON.stringify(sent('t4_au_set_rot')));
        for (let i = 0; i < 30 && A.auInfo(4, ac).rot; i++) cc(73, 1);   /* back to 0 */
        /* the pads follow it: a quarter-clip Shift puts the clip's first
         * quarter of audio on pads 9-16 */
        {
            const i0 = A.auInfo(4, ac), L = len0 * tps;
            const plain = A.auLoopMarks(i0, 4, ac), rot = A.auLoopMarks(Object.assign({}, i0, { rot: L / 4 }), 4, ac);
            assert(JSON.stringify(rot[8]) === JSON.stringify(plain[0]) && JSON.stringify(rot[0]) === JSON.stringify(plain[24]),
                   'the Loop pads do not rotate with the Shift');
        }
        /* alt: Nudge (touch K3 + click, as a sequence's Shift / Nudge) */
        S.knobAlt |= 4;
        assert(A.auLoopBankCells(4)[2].label === 'Nudge', 'the alt is not Nudge: ' + A.auLoopBankCells(4)[2].label);
        reset();
        S.knobAccelLast[2] = 0; cc(73, 1);
        assert(sent('t4_au_set_nudge').length === 1 && !sent('t4_au_set_rot').length, 'alt K3 is not Nudge: ' + JSON.stringify(sentLike(/_au_/)));
        S.knobAccelLast[2] = 0; cc(73, 127);
        S.knobAlt &= ~4;
    }
    S.knobTouched = 3;
    const lh = JSON.stringify(render.bankPageHints(0));
    S.knobTouched = -1;
    assert(lh.indexOf('CLK') < 0, 'a blank Loop CLIP knob offers a click: ' + lh);
    S.bankCardLatched = false;

    /* ...they are on SAMPLE: page 1's K8 Revrs (Nudge left SAMPLE, Josh,
     * 2026-10-30); page 2 is page 1's knobs as a grid in their places — K2
     * Sync (Vintage · Pitch · Warp, the DSP's 1 · 2 · 0; a new clip on Warp)
     * where Zoom is, no Start / Length, K1 Orig on its own (touch + click) */
    mapPad(2, 3); ticks(2);
    reset();
    for (let i = 0; i < 20 && !sent('t4_au_set_revrs').length; i++) cc(78, 1);
    assert(sent('t4_au_set_revrs').join() === '0 1' && !sent('t4_au_set_nudge').length, 'SAMPLE K8 is not Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_set_revrs').length < 2; i++) cc(78, 127);
    jog(1); ticks(1);
    const ed = S.auEditor;
    assert(ed.page === 1, 'the jog did not turn SAMPLE to page 2');
    assert(A.auSampleP2Cells(4, 0).map((c) => c.label).join() === 'Orig,Sync,,Gain,Pitch,Detune,Tempo,Revrs', 'page 2: ' + A.auSampleP2Cells(4, 0).map((c) => c.label));
    assert(A.auSampleP2Cells(4, 0)[0].opens === true, 'Orig does not wear the click corners (Josh: "orig needs the corners to indicate it\'s a click gesture")');
    assert(A.auSampleP2Cells(4, 0)[1].text === 'Warp', 'a new clip is not on Warp: ' + A.auSampleP2Cells(4, 0)[1].text);
    for (let i = 0; i < 40; i++) cc(72, 127);
    reset();
    const tv = [];
    for (let i = 0; i < 40; i++) { cc(72, 1); const t = A.auSampleP2Cells(4, 0)[1].text; if (tv[tv.length - 1] !== t) tv.push(t); }
    assert(tv.join() === 'Vintage,Pitch,Warp' && sent('t4_au_set_sync').join() === '0 2,0 0',
           'K2 is not Sync Vintage · Pitch · Warp: ' + tv.join() + ' ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auSyncIdx({ sync: 1 }) === 0 && A.auSyncIdx({ sync: 2 }) === 1 && A.auSyncIdx({ sync: 0 }) === 2 &&
           A.auSyncIdx({ sync: 99 }) === 2, 'Vintage / Pitch / Warp / an unknown value reads wrong');
    for (const v of [0, 1, 2]) {
        const was = S.auInfo[4][0];
        S.auInfo[4][0] = Object.assign({}, was, { sync: v });
        const sq = A.auSampleP2Cells(4, 0)[1].sq;
        S.auInfo[4][0] = was;
        assert(sq && sq.length <= 4, 'Sync ' + v + '\'s square: ' + sq);
    }
    reset();
    /* page 1's knobs work here too: K4 Gain, K7 Tempo, K8 Revrs */
    S.knobAccelLast[3] = 0; cc(74, 1);
    S.knobAccelLast[6] = 0; cc(77, 1);
    for (let i = 0; i < 20 && !sent('t4_au_set_revrs').length; i++) cc(78, 1);
    assert(sent('t4_au_set_gain').length === 1 && sent('t4_au_set_bpm').length === 1 && sent('t4_au_set_revrs').join() === '0 1',
           'page 2 K4 / K7 / K8 are not Gain / Tempo / Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_set_revrs').length < 2; i++) cc(78, 127);
    reset();
    note(6, 127); click(); note(6, 0); ticks(1);
    assert(!sent('t4_au_set_orig').length, 'touch K7 (Tempo) + click fired Orig (Josh: "tempo and touch orig shouldn\'t share a knob")');
    note(0, 127); click(); note(0, 0); ticks(1);
    assert(sent('t4_au_set_orig').join() === '0 0', 'touch K1 + click is not Orig: ' + JSON.stringify(sentLike(/_au_/)));
    jog(-1); back(); ticks(2);
    S.bankCardLatched = false;
});

step('⭐⭐ Loop + steps on SAMPLE (Josh: "it\'s not accessible at all in sample view"): the window is set, the screen stays, Start / End re-read', () => {
    GET['t4_au_info_0'] = INFO(0, 8);
    A.auMarkStale(4, 0); ticks(3);
    E.openWave(4); ticks(2);                           /* the map's pad is tested above */
    assert(S.auEditor, 'SAMPLE did not open');
    reset();
    cc(58, 127);                                       /* hold Loop */
    note(17, 100); note(18, 100);                      /* pages 2..3 */
    note(18, 0); note(17, 0);
    cc(58, 0);
    ticks(2);
    const ac = S.trackActiveClip[4] | 0;
    assert(sent('t4_c' + ac + '_loop_set').join() === String((16 << 16) | 32),
           'Loop + steps over SAMPLE set no window: ' + JSON.stringify(sentLike(/loop_set/)));
    assert(S.auEditor, 'Loop + steps left SAMPLE');
    assert(sentLike(/_step_/).length === 0, 'a step press edited the clip');
    back(); ticks(2);
});

step('⭐⭐ Loop pads: a progress bar over 32 even sections, not the chops — dim the loop, bright what has played, the playhead pulsing; Revrs fills from the end; stopped all dim (Josh)', () => {
    const tc = globalThis.__tc(4);
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    /* 8 chops, but the pads are the CLIP in 32 sections: a 1-bar clip of this
     * 2 s sample at 120 is all of it, 3000 frames a section (Josh, 2026-10-29:
     * "chops should just be completely invisible in loop mode") */
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    GET['t4_au_pos'] = '1 30000 -1';                   /* section 11 */
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 5, 9].every((i) => pad(i) === tc), 'the played sections are not bright: ' + [0, 5, 9].map(pad) + ' vs ' + tc);
    assert(pad(10) === HC.LightGrey, 'the playhead section does not pulse to dim white: ' + pad(10));
    assert(pad(11) && pad(11) !== tc && pad(31) === pad(11), 'the sections to come are not dim (or the chops show): ' + [pad(11), pad(31)]);
    /* Revrs: it plays from the end back, so the sections after the playhead have played */
    GET['t4_au_info_0'] = INFO(0, 8).replace(' 96000 48000 2 0 0 0 ', ' 96000 48000 2 1 0 0 ');
    A.auMarkStale(4, 0); for (let i = 0; i < 6; i++) ticks(1);
    assert(pad(31) === tc && pad(11) === tc && pad(9) !== tc && pad(9), 'Revrs did not fill from the end: ' + [pad(9), pad(11), pad(31)]);
    /* stopped: the loop, all dim */
    GET['t4_au_pos'] = '0 0 -1';
    for (let i = 0; i < 6; i++) ticks(1);
    assert(pad(10) !== HC.LightGrey && pad(10) === pad(20) && pad(0) === pad(20) && pad(0) !== tc, 'stopped is not all dim: ' + [pad(0), pad(10), pad(20)]);
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(4);
});

step('⭐⭐ Loop pads: the sections of the clip past the file\'s end are grey — it never plays them (Josh: "you can\'t see where the end point is")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    GET['t4_au_pos'] = '1 6000 -1';
    /* a 2-bar clip of the 1-bar (2 s at 120) sample: its second half is past the file */
    S.clipLength[4][0] = 32; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 15].every((i) => pad(i) && pad(i) !== HC.DarkGrey) && [16, 24, 31].every((i) => pad(i) === HC.DarkGrey),
           'the sections past the file are not grey: ' + [0, 15, 16, 24, 31].map(pad));
    /* the clip within the sample: nothing grey */
    S.clipLength[4][0] = 16; A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 15, 31].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'a clip within the sample greys: ' + [0, 15, 31].map(pad));
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(4);
});

step('⭐⭐ Loop pads: a later Start moves the clip along the sample, and what passes the file\'s end greys (Josh: "out of start/end range ... aren\'t showing up as dim white")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    GET['t4_au_pos'] = '1 30000 -1';
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    /* Start 24000: the bar runs 24000..120000, the file ends at 96000 (section 24) */
    GET['t4_au_info_0'] = INFO(0, 8).replace(' 16 0 96000 ', ' 16 24000 96000 '); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert(A.auInfo(4, 0).rstart === 24000, 'rstart not parsed: ' + A.auInfo(4, 0).rstart);
    assert([24, 31].every((i) => pad(i) === HC.DarkGrey), 'the sections past the file are not grey: ' + [24, 31].map(pad));
    assert([0, 8, 23].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'sections inside the file are grey: ' + [0, 8, 23].map(pad));
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(4);
});

step('⭐⭐ Loop step buttons: playing, the row follows the playhead page by page, as a sequence does (Josh: "like normal")', () => {
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    const was = [S.playing, S.trackClipPlaying[4], S.trackCurrentStep[4], S.clipLength[4][0]];
    S.clipLength[4][0] = 32; S.clipLoopStart[4][0] = 0; S.trackCurrentPage[4] = 0;
    S.playing = true; S.trackClipPlaying[4] = true; S.trackCurrentStep[4] = 20;
    S.ledsDirtyAudio = true; ticks(2);
    const lit = Array.from({ length: 16 }, (_, i) => LEDS.get(16 + i) || 0);
    assert(lit[4] === HC.White && lit.filter((v) => v === HC.White).length === 1, 'the playhead is not on step 21 of page 2: ' + lit.join());
    assert(lit[0] && lit[0] !== HC.DarkGrey && lit.every((v, i) => i === 4 || v === lit[0]), 'the loop\'s other steps are not dim: ' + lit.join());
    S.playing = was[0]; S.trackClipPlaying[4] = was[1]; S.trackCurrentStep[4] = was[2]; S.clipLength[4][0] = was[3];
    S.ledsDirtyAudio = true; ticks(2);
});

step('⭐⭐ 128 chops: Octave Up / Down steps the pad pages, 32 chops a page (Slice); a Loop clip has one page, its sections (Josh)', () => {
    const marks = (n) => Array.from({ length: n }, (_, k) => Math.round(k * 96000 / n) + ' ' + Math.round((k + 1) * 96000 / n)).join(' ');
    GET['t4_au_info_0'] = INFO(1, 40, 40); GET['t4_au_marks_0'] = marks(40);
    A.auMarkStale(4, 0); ticks(4);
    S.auPage[4] = 0;
    assert(A.auPages(4) === 2, 'pages for 40 chops: ' + A.auPages(4));
    cc(HC.MoveUp, 127); cc(HC.MoveUp, 0); ticks(2);
    assert(S.auPage[4] === 1, 'Octave Up did not show chops 33-64');
    DM.computePadNoteMap();
    assert(S.padNoteMap[0] === 32 && S.padNoteMap[7] === 39 && S.padNoteMap[8] === 0xFF, 'page 2 padmap: ' + Array.from(S.padNoteMap).slice(0, 10).join());
    cc(HC.MoveUp, 127); cc(HC.MoveUp, 0);
    assert(S.auPage[4] === 1, 'Octave Up went past the last page');
    cc(HC.MoveDown, 127); cc(HC.MoveDown, 0); ticks(2);
    assert(S.auPage[4] === 0, 'Octave Down did not go back');
    assert(A.auSliceToPad(33, 4) === -1 && A.auSliceToPad(3, 4) === 3, 'auSliceToPad ignores the page');
    /* Loop: its chops are invisible — one page of sections whatever they
     * number, the playhead late in the sample stays on it, and the step
     * buttons light the whole loop */
    S.auPage[4] = 1;
    GET['t4_au_info_0'] = INFO(0, 40, 40); A.auMarkStale(4, 0);
    GET['t4_au_pos'] = '1 ' + (Math.round(35 * 96000 / 40) + 10) + ' -1';
    S.playing = false;
    for (let i = 0; i < 8; i++) ticks(1);
    assert(A.auPages(4) === 1 && S.auPage[4] === 0, 'a Loop clip has chop pages: ' + A.auPages(4) + ' / ' + S.auPage[4]);
    S.clipLength[4][0] = 16; S.clipLoopStart[4][0] = 0; S.trackCurrentPage[4] = 0;
    S.ledsDirtyAudio = true; ticks(2);
    const lit = Array.from({ length: 16 }, (_, i) => LEDS.get(16 + i) || 0);
    /* one colour, the track's dim — not DarkGrey (outside a clip), not off */
    assert(lit[0] && lit.every((v) => v === lit[0]) && lit[0] !== HC.DarkGrey && lit[0] !== HC.White,
           'the step buttons do not light the whole loop dim: ' + lit.join());
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(6);
    assert(S.auPage[4] === 0, 'a clip of 8 chops kept page 2');
});

step('⭐⭐ PAD MODE (IN column): Layout 4 Rows / 16 Pads — the 16 Pads order is the left 4x4 then the right (Josh)', () => {
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[0].cells[0] && map[0].cells[0].name === 'PAD MODE' && map[0].cells[1] && map[0].cells[1].name === 'LIVE ARP',
           'the IN column: ' + JSON.stringify(map[0].cells));
    S.activeBank = C.BANK_CHORD; S.bankCardLatched = true;
    reset();
    for (let i = 0; i < 25; i++) cc(71, 1);
    assert(sent('t4_au_layout').join() === '1' && S.auLayout[4] === 1, 'K1 did not set 16 Pads: ' + JSON.stringify(sentLike(/layout/)));
    const kc = globalThis.__kc; shown();
    assert(kc().cells[0].label === 'Layout' && kc().cells[0].text === '16 Pads', 'the card: ' + JSON.stringify(kc().cells[0]));
    DM.computePadNoteMap();
    /* 8 chops: the left 4x4 holds them, the right half (chops 17-32) is dark */
    assert(S.padNoteMap[0] === 0 && S.padNoteMap[3] === 3 && S.padNoteMap[4] === 0xFF && S.padNoteMap[8] === 4,
           '16 Pads padmap: ' + Array.from(S.padNoteMap).slice(0, 12).join());
    for (let i = 0; i < 25; i++) cc(71, 127);
    assert(S.auLayout[4] === 0, 'K1 did not go back to 4 Rows');
    DM.computePadNoteMap();
    S.activeBank = 0; S.bankCardLatched = false;
});

step('⭐⭐ LIVE ARP: Oct is Step on Audio, a chop per repeat, to ±15 (Josh: "change octave to "step"")', () => {
    S.activeBank = 5; S.bankCardLatched = true;
    reset();
    for (let i = 0; i < 300; i++) cc(73, 1);
    const v = sent('t4_tarp_octaves');
    assert(v.length && v[v.length - 1] === '15', 'Step did not reach 15: ' + JSON.stringify(v));
    const kc = globalThis.__kc; shown();
    const c2 = kc().cells[2];
    assert(c2.label === 'Step' && c2.text === '+15', 'the card: ' + JSON.stringify(c2));
    S.bankParams[4][5][2] = 4; shown();
    assert(Math.abs(kc().cells[2].arc - 19 / 30) < 1e-9, 'the touch arc is not on ±15: ' + JSON.stringify(kc().cells[2]));
    S.bankParams[4][5][2] = 15;
    /* the widget's own range is ±15: Oct's ±4 pinned the ring at its end
     * while the value went on (Josh: "doesn't match the params") */
    const rn = (v) => { S.bankParams[4][5][2] = v; S.ledsDirtyAudio = true; ticks(3); return CCLEDS.get(73); };
    const ring = [-15, -4, 4, 15].map(rn);
    assert(ring[0] !== ring[1] && ring[1] !== ring[2] && ring[2] !== ring[3], 'the ring is not on ±15 (pinned at ±4): ' + ring);
    S.bankParams[4][5][2] = 15;
    for (let i = 0; i < 300; i++) cc(73, 127);
    S.activeBank = 0; S.bankCardLatched = false;
});

step('⭐ external MIDI: note 36 is chop 1 on an Audio track (a keyboard\'s drum pads)', () => {
    reset();
    const was = S.trackRoute[4];
    S.trackRoute[4] = 2;                                /* the live-note queue: what reaches the engine is visible */
    globalThis.onMidiMessageExternal(new Uint8Array([0x90, 37, 100]));
    globalThis.onMidiMessageExternal(new Uint8Array([0x80, 37, 0]));
    globalThis.onMidiMessageExternal(new Uint8Array([0x90, 20, 100]));   /* below 36: reaches nothing */
    ticks(2);
    const live = sentLike(/live_note/).map((x) => x[0] + '=' + x[1]).join(' | ');
    assert(live === 't4_live_notes=eon 1 100 eoff 1', 'external 37 did not arrive as chop 2 alone: ' + live);
    S.trackRoute[4] = was;
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
