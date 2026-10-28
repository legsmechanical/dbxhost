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
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_CHORD, 5, C.BANK_MACROS, C.BANK_STEP, 0, 1, C.BANK_AUDIO, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_AUDIO, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0) === null, 'the MIDI FX pad is lit (Q4)');
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 7, 0).comp === 'fx1', 'FX 1 is dark');
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[2].cells[2] && map[2].cells[2].bank === C.BANK_AUDIO, 'the sound bank pad is not BANK_AUDIO: ' + JSON.stringify(map[2].cells[2]));
    /* named for the clip's mode (Josh, 2026-10-28: "slice/loop") */
    {
        const c = S.trackQueuedClip[4] >= 0 && !S.playing ? S.trackQueuedClip[4] : (S.trackActiveClip[4] | 0);
        const was = S.auInfo[4][c];
        S.auInfo[4][c] = Object.assign({}, was || {}, { mode: 0 });
        assert(P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4)[2].cells[2].name === 'LOOP', 'a Loop clip\'s bank is not LOOP');
        S.auInfo[4][c] = Object.assign({}, was || {}, { mode: 1 });
        assert(P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4)[2].cells[2].name === 'SLICE', 'a Slice clip\'s bank is not SLICE');
        assert(P.bankDisplayName(C.PAD_MODE_AUDIO, C.BANK_AUDIO, 4) === 'SLICE', 'the header name is not SLICE');
        S.auInfo[4][c] = was;
    }
    /* DELAY left Audio tracks (Josh, 2026-10-28: "let's get rid of delay") */
    assert(!map[3].cells[2], 'the DELAY pad is lit: ' + JSON.stringify(map[3].cells[2]));
});

const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const back = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
const shiftClick = () => { cc(HC.MoveShift, 127); click(); cc(HC.MoveShift, 0); };
/* the AUDIO bank's page (it was the AUDIO editor's screen) */
const ED = () => A.auBankEd(4);

step('⭐⭐ the bank map\'s AUDIO pad is the AUDIO bank (Josh: "can audio be a bank?" · "yes"): CLIP is the clip\'s sound', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    mapPad(2, 2);
    assert(S.activeBank === C.BANK_AUDIO && !S.auPanel, 'the AUDIO pad did not land on the AUDIO bank: ' + S.activeBank);
    assert(ED().page === 0, 'not on its first page');
    /* a knob touch shows its page, as on any bank */
    note(0, 127); ticks(1);
    const kc = globalThis.__kc; shown();
    assert(kc().cells.map((c) => c && c.label).join() === 'Pitch,Detune,Gain,Revrs,Attk,Decay,Play,', 'CLIP (Slice) card: ' + JSON.stringify(kc().cells.map((c) => c && c.label)));
    note(0, 0); ticks(1);
    /* Mode went to the CLIP bank (Josh, 2026-10-28: "loop vs slice mode should be a clip bank setting") */
    const cells = A.auPanelCells(ED());
    assert(cells.map((c) => c.label).join() === 'Pitch,Detune,Gain,Revrs,Attk,Decay,Play,', 'CLIP (Slice): ' + cells.map((c) => c.label));
    S.activeBank = 0;
});

step('⭐⭐ the instrument door on an Audio track is WAVE, the sample\'s editor: the map\'s instrument pad (Josh: "does it make sense ... be the wave editor?" · "make sense")', () => {
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 1).label === 'SAMPLE', 'the instrument pad is not labelled SAMPLE');
    S.activeBank = 0; S.bankCardLatched = false;
    cc(3, 127); note(P.bankMapPadForCell(6, 1), 100); note(P.bankMapPadForCell(6, 1), 0); cc(3, 0); ticks(3);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.activeBank === 0, 'the instrument pad did not open WAVE: ' + JSON.stringify({ ed: !!S.auEditor, b: S.activeBank }));
    back(); ticks(2);
    assert(!S.auEditor && !S.auPanel, 'Back did not leave WAVE');
    mapPad(2, 2);                                    /* back on the AUDIO bank for what follows */
    assert(S.activeBank === C.BANK_AUDIO, 'AUDIO');
});

step('⭐ Pitch reads as a number and steps a semitone per detent run (Josh: "doesn\'t read out any values and is very touchy")', () => {
    const cell = () => A.auPanelCells(ED())[0];
    assert(cell().kind === 'valsq' && cell().text === '+0', 'CLIP Pitch: ' + JSON.stringify(cell()));
    reset();
    note(0, 127);
    for (let i = 0; i < 30; i++) cc(71, 1);         /* 30 encoder ticks */
    const n = sent('t4_au_set_pitch').length;
    assert(n >= 1 && n <= 3, '30 ticks moved Pitch ' + n + ' semitones: ' + JSON.stringify(sent('t4_au_set_pitch')));
    assert(cell().text === '+' + n, 'the cell does not read the new pitch: ' + cell().text);
    const kc = globalThis.__kc; shown();
    assert(kc().cells[0].lit && kc().cells[0].text === '+' + n, 'the touched Pitch does not read out: ' + JSON.stringify(kc().cells[0]));
    for (let i = 0; i < 30; i++) cc(71, 127);       /* back down */
    note(0, 0);
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    /* SLICE n's Pitch too */
    jog(1);
    assert(A.auBankTitle(4).indexOf('SLICE') === 0, 'not on SLICE n');
    const sc = A.auPanelCells(ED())[0];
    assert(sc.label === 'Pitch' && sc.kind === 'valsq' && /^[+-]\d+$/.test(sc.text), 'SLICE Pitch: ' + JSON.stringify(sc));
    reset();
    for (let i = 0; i < 30; i++) cc(71, 1);
    const m = sent('t4_au_slice_pitch').length;
    assert(m >= 1 && m <= 3, '30 ticks moved the slice pitch ' + m + ' semitones');
    jog(-1);
});

step('⭐ the jog turns its pages: CLIP, SLICE n (no SLICING, no ALL SLICES)', () => {
    const titles = [];
    for (let i = 0; i < 3; i++) { titles.push(A.auBankTitle(4)); jog(1); }
    assert(titles.join('|') === 'ALL SLICES|SLICE 1/8|SLICE 1/8', 'pages: ' + titles.join('|'));
    /* Loop mode: the one page is LOOP (Josh: "and "Loop" when not in slice mode") */
    for (let i = 0; i < 3; i++) jog(-1);
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(2);
    assert(A.auBankTitle(4) === 'LOOP', 'Loop title: ' + A.auBankTitle(4));
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    for (let i = 0; i < 3; i++) jog(1);
    for (let i = 0; i < 3; i++) jog(-1);
    assert(ED().page === 0, 'back to CLIP');
});

step('⭐⭐ CLIP knobs: Pitch / Detune / Gain for the clip, Revrs..Play for every slice (`--` where they differ)', () => {
    GET['t4_au_all_0'] = '0 0 0 x 0 0';                 /* the slices' attacks differ */
    A.auMarkStale(4, 0); ticks(2);
    assert(A.auPanelCells(ED())[4].text === '--', 'Attk: ' + A.auPanelCells(ED())[4].text);
    reset();
    for (let i = 0; i < 10; i++) cc(71, 1);             /* K1 Pitch: one detent run (KNOB_PICK) */
    assert(sent('t4_au_set_pitch').join() === '0 1', 'pitch: ' + JSON.stringify(sent('t4_au_set_pitch')));
    cc(72, 1); cc(72, 1);                               /* K2 Detune: cents */
    assert(sent('t4_au_set_detune').join() === '0 1,0 2', 'detune: ' + JSON.stringify(sent('t4_au_set_detune')));
    assert(A.auPanelCells(ED())[1].label === 'Detune' && A.auPanelCells(ED())[1].kind === 'arcbip' &&
           A.auPanelCells(ED())[1].text === '+2' && A.auPanelCells(ED())[1].signed === 2 / 50,
           'the Detune cell: ' + JSON.stringify(A.auPanelCells(ED())[1]));
    cc(73, 1);                                          /* K3 Gain */
    assert(sent('t4_au_set_gain').join() === '0 1', 'gain: ' + JSON.stringify(sent('t4_au_set_gain')));
    cc(75, 1);                                          /* K5 Attk: every slice */
    assert(sent('t4_au_all_atk').length === 1, 'Attk did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    touchClick(7);                                      /* K8 is blank: a click does nothing */
    assert(!sent('t4_au_chop').length, 'K8 + click still sequences from the AUDIO editor');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_all_0'] = '0 x 0 0 0 0';
    A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ SLICE n edits the last pad tapped', () => {
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);
    assert(A.auSelSlice(4) === 2, 'the pad did not pick slice 3');
    jog(1);
    ticks(2);
    assert(A.auBankTitle(4) === 'SLICE 3/8', A.auBankTitle(4));
    assert(A.auPanelCells(ED()).map((c) => c.label).join() === 'Pitch,Detune,Gain,Revrs,Attk,Decay,Play,', 'SLICE: sound only');
    assert(A.auPanelCells(ED())[2].text === '-3 dB', 'slice 3 gain: ' + A.auPanelCells(ED())[2].text);
    reset();
    for (let i = 0; i < 3; i++) cc(73, 1);             /* K3 Gain */
    assert(sent('t4_au_slice_gain').some((v) => /^0 2 -2$/.test(v)), 'slice gain: ' + JSON.stringify(sent('t4_au_slice_gain')));
    cc(72, 127);                                        /* K2 Detune */
    assert(sent('t4_au_slice_detune').join() === '0 2 -1', 'slice detune: ' + JSON.stringify(sent('t4_au_slice_detune')));
    jog(-1);
});

step('⭐ Decay: shortest at the bottom of the dial, Full at the top (Josh: "it should be max at max when it\'s turned all the way up")', () => {
    jog(1);
    const last = () => { const v = sent('t4_au_slice_dec'); return v.length ? v[v.length - 1].split(' ')[2] : null; };
    reset();
    cc(76, 127);                                     /* K6 down from Full */
    assert(last() === '5000', 'down from Full did not land on 5000 ms: ' + last());
    for (let i = 0; i < 300; i++) cc(76, 127);       /* all the way down */
    assert(last() === '5' && !sent('t4_au_slice_dec').some((v) => / 0$/.test(v)),
           'all the way down is not the shortest decay: ' + last());
    assert(A.auPanelCells(ED())[5].text === '5ms' && A.auPanelCells(ED())[5].norm < 0.01, 'the bottom: ' + JSON.stringify(A.auPanelCells(ED())[5]));
    for (let i = 0; i < 400; i++) cc(76, 1);         /* all the way up */
    assert(last() === '0' && A.auPanelCells(ED())[5].text === 'Full' && A.auPanelCells(ED())[5].norm === 1,
           'all the way up is not Full: ' + last());
    jog(-1);
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

step('⭐⭐ the map\'s WAVE pad opens WAVE (Slice: the chop editor); a clip on Even is edited like any other (Josh)', () => {
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(map[2].cells[3] && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE pad on the instrument slot');
    mapPad(2, 3);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.auPanel && S.auPanel.wave, 'WAVE did not open');
    ticks(2);
    assert(inked(shown()), 'WAVE draws nothing');
    reset();
    jog(1); click();                                 /* Even 8: a click still adds a marker */
    assert(sent('t4_au_mark_add').length === 1 && A.auInfo(4, 0).even === 0 && A.auInfo(4, 0).n === 9,
           'a marker on a clip on Even: ' + JSON.stringify(sentLike(/_au_/)) + ' even ' + A.auInfo(4, 0).even);
    back();
    assert(!S.auEditor && !S.auPanel, 'Back did not leave WAVE');
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ WAVE in Slice mode: pads pick, K1/K3 move by a pixel, K2 zooms, click adds, Delete + pad removes', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3);
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave', 'no editor');
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
    /* ...and a short click is still the screen's: WAVE (Slice) adds a marker */
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 3);
    reset();
    jog(1); click(); ticks(2);
    assert(sent('t4_au_mark_add').length === 1 && !S.bankMapUp, 'a short click did not reach WAVE: ' + JSON.stringify(sentLike(/_au_/)));
    back();
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
    /* Shift + click is still WAVE's own (the picker) */
    mapPad(2, 3);
    shiftClick(); ticks(2);
    assert(S.auEditor && S.auEditor.pick, 'Shift + click left WAVE instead of opening its picker');
    back(); back(); ticks(2);
    assert(!S.auEditor, 'WAVE did not close');
});

step('⭐⭐ WAVE: SLICE n/n or LOOP up top; Start / End light while touched or turned; ZOOM + / - / ZOOM between them (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);   /* a hand set of 8 */
    mapPad(2, 3);
    ticks(2);
    const px = (f, x, y) => f[y * 128 + x];
    let f, tx = globalThis.__texts(() => { f = shown(); });
    /* two hints fit; Josh chose CLK ADD · SH+CLK MENU over a knob hint */
    assert(['CLK', 'ADD', 'SH+CLK', 'MENU'].every((h) => tx.indexOf(h) >= 0), 'Slice hints: ' + JSON.stringify(tx));
    assert(tx.indexOf('SLICE 1/8') >= 0 || tx.some((x) => /^SLICE \d+\/8$/.test(x)), 'the header: ' + JSON.stringify(tx.slice(0, 6)));
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
    assert(tx.indexOf('KNOBS') >= 0 && tx.indexOf('EDIT') >= 0 && tx.indexOf('SH+CLK') >= 0, 'Loop hints: ' + JSON.stringify(tx));
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
    tx = globalThis.__texts(() => { cc(76, 127); cc(76, 127); shown(); });
    assert(sent('t4_au_set_detune').join() === '0 -1,0 -2' && tx.indexOf('DETUNE -2') >= 0, 'K6 Detune: ' + JSON.stringify(sent('t4_au_set_detune')) + ' ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(3, 127); shown(); });
    assert(tx.indexOf('GAIN +6DB') >= 0, 'touching K4 does not read out: ' + JSON.stringify(tx));
    note(3, 0);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; A.auMarkStale(4, 0); ticks(20);
});

step('⭐⭐ Delete + jog click on the AUDIO bank resets the page showing, only that page (Josh: "for multi-page banks, we should have delete+jog only reset the active page")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
    mapPad(2, 2);                                    /* the AUDIO bank, CLIP */
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    const got = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(['set_pitch=0 0', 'set_detune=0 0', 'set_gain=0 0', 'all_rev=0 0', 'all_atk=0 0', 'all_dec=0 0', 'all_play=0 0']
           .every((k) => got.indexOf('t4_au_' + k) >= 0), 'CLIP did not reset: ' + got);
    jog(1);                                          /* SLICE n */
    A.auSetSelSlice(4, 2);
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    const sg = sentLike(/_au_slice_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(!sent('t4_au_set_pitch').length && !sentLike(/_au_all_/).length, 'SLICE n reset CLIP too: ' + JSON.stringify(sentLike(/_au_/)));
    assert(['pitch', 'detune', 'gain', 'rev', 'atk', 'dec', 'play'].every((f) => sg.indexOf('t4_au_slice_' + f + '=0 2 0') >= 0),
           'SLICE 3 did not reset: ' + sg);
    reset();
    click();                                         /* a plain click resets nothing */
    assert(!sentLike(/_au_/).length, 'a plain click reset: ' + JSON.stringify(sentLike(/_au_/)));
    S.actionPopupEndTick = 0;
    jog(-1); S.activeBank = 0; ticks(2);
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
    mapPad(2, 2); ticks(3);                          /* the AUDIO bank, ALL SLICES: K8 is blank */
    assert(sent8() === '11111110', 'ALL SLICES rings: ' + sent8());
    jog(1); ticks(3);                                /* SLICE n: K8 is blank */
    assert(sent8() === '11111110', 'SLICE n rings: ' + sent8());
    jog(-1);
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(3);
    assert(A.auBankTitle(4) === 'LOOP' && sent8() === '11110000', 'LOOP rings: ' + sent8());
    S.activeBank = 0;
    mapPad(2, 3); ticks(2);                          /* WAVE: K1-K6, not K7 / K8 */
    assert(lit() === '11111100', 'WAVE rings: ' + lit());
    ticks(3);                                        /* ...and that is what the knobs get */
    assert(sent8() === '11111100', 'the rings sent over WAVE: ' + sent8() + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((x) => CCLEDS.get(x))));
    const g0 = globalThis.__ring()[3].norm;
    cc(74, 1);
    assert(globalThis.__ring()[3].norm > g0, 'the Gain ring did not follow the turn');
    S.knobTurnedTick[3] = S.clockMs - 1000; ticks(1);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); A.auMarkStale(4, 0); ticks(2);
});

step('⭐ Start / End read in seconds to 2 decimals, rounded (Josh: "2 decimals, rounded, for the seconds read-out is fine")', () => {
    assert(A.auFmtTime(55125, 44100) === '1.25s' && A.auFmtTime(237, 44100) === '0.01s' &&
           A.auFmtTime(44100 * 12.346, 44100) === '12.35s' && A.auFmtTime(44100 * 75.5, 44100) === '1:15.50',
           [A.auFmtTime(55125, 44100), A.auFmtTime(237, 44100), A.auFmtTime(44100 * 12.346, 44100), A.auFmtTime(44100 * 75.5, 44100)].join());
});

step('⭐⭐ Shift + click: the picker — Load sample / Chop sample › Lazy · Manual · Even (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); A.auMarkStale(4, 0); ticks(2);   /* a hand set of 8, Even Off */
    mapPad(2, 3);
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
    assert(ed.pick.editEven && ed.pick.even === 16, 'Even did not start editing at 16 (Josh: "even 16.")');
    /* live: each detent slices the clip, and the pads show the count (Josh) */
    const setP = globalThis.host_module_set_param;
    globalThis.host_module_set_param = (k, v) => {     /* the engine applies Even, as the real one does */
        setP(k, v);
        if (String(k) === 't4_au_set_even') { const e = parseInt(String(v).split(' ')[1], 10); GET['t4_au_info_0'] = e ? INFO(1, e, e) : INFO(1, 1, 0); }
    };
    const litPads = () => { ticks(2); return Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0).filter((v) => v).length; };
    jog(-1);
    assert(sent('t4_au_set_even').pop() === '0 15' && A.auInfo(4, 0).n === 15 && litPads() === 15,
           'Even 15 is not live on the pads: ' + JSON.stringify(sent('t4_au_set_even')) + ' lit ' + litPads());
    jog(1); jog(1); jog(1);
    assert(sent('t4_au_set_even').pop() === '0 18' && litPads() === 18, 'Even 18 is not live on the pads: lit ' + litPads());
    back();                                          /* the clip had Even Off: Back puts that back */
    assert(sent('t4_au_set_even').pop() === '0 0' && !ed.pick.editEven, 'Back did not put Even Off back: ' + JSON.stringify(sent('t4_au_set_even')));
    click();                                         /* edit again (from Off: 16), turn to 15, click keeps it */
    assert(ed.pick.editEven, 'not editing');
    jog(-1); click();
    assert(sent('t4_au_set_even').pop() === '0 15' && !ed.pick, 'Even 15 not kept');
    /* kept = the clip's own chops now (Josh: "it's just a way to chop them") */
    assert(sent('t4_au_even_bake').join() === '0' && A.auInfo(4, 0).even === 0 && A.auInfo(4, 0).hand === 15,
           'Even 15 did not become the chops: ' + JSON.stringify(sent('t4_au_even_bake')));
    /* a chop method leaves the Mode alone: the chops serve both */
    assert(!sent('t4_au_set_mode').length, 'choosing Even set the Mode: ' + JSON.stringify(sent('t4_au_set_mode')));
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
    mapPad(2, 3);
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

step('⭐⭐ Lazy (from the picker): the next pad white, taps cut, Back asks "Keep N new chops?", Yes stays on WAVE', () => {
    mapPad(2, 3);
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
    assert(kc.cells.map((c) => c && c.label).join() === 'Res,Strch,Shift,Mode,Crop,InQnt,Dir,>Seq',
           'the Slice CLIP bank: ' + kc.cells.map((c) => c && c.label));
    reset();
    for (let i = 0; i < 30; i++) cc(74, 127);          /* K4 = Mode, no longer a second Quantize */
    assert(sent('t4_au_set_mode').join() === '0 0' && sentLike(/quantize/).length === 0,
           'K4 is not Mode: ' + JSON.stringify(sets.concat(S.pendingDefaultSetParams.map((e) => [e.key, e.val]))));
    for (let i = 0; i < 30; i++) cc(74, 1);            /* ...and back to Slice */
    assert(sent('t4_au_set_mode').pop() === '0 1', 'K4 did not turn back to Slice');
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

step('⭐⭐ Loop mode: no sequence — pad taps and steps do nothing, no STEP / NOTE FX; the CLIP bank is Nudge · Mode', () => {
    S.activeBank = 1;                                  /* on NOTE FX when the clip turns Loop */
    GET['t4_au_info_0'] = INFO(0, 8);
    A.auMarkStale(4, 0); ticks(4);
    assert(S.activeBank === 0, 'still on NOTE FX with a Loop clip: bank ' + S.activeBank);
    /* Josh, 2026-10-28: "we don't need to show notes at all in loop mode" */
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_CHORD, 5, C.BANK_MACROS, 0, C.BANK_AUDIO, C.BANK_SOUND]), 'Loop walk: ' + walk.join());
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
    assert(cells.map((c) => c.label).join() === 'Tempo,Bars,Nudge,Mode,,,,', 'loop bank: ' + cells.map((c) => c.label));
    S.bankCardLatched = true;
    reset();
    /* K3 Nudge: one detent's worth (the knob's acceleration may need a tick or two) */
    for (let i = 0; i < 4 && !sent('t4_au_set_nudge').length; i++) cc(73, 1);
    assert(sent('t4_au_set_nudge').join() === '0 5', 'K3 is not Nudge: ' + JSON.stringify(sentLike(/_au_/)));
    S.knobTouched = 2;                                 /* K3 Nudge: no click alternate */
    const lh = JSON.stringify(render.bankPageHints(0));
    S.knobTouched = -1;
    assert(lh.indexOf('CLK') < 0, 'a Loop CLIP knob offers a click: ' + lh);
    /* K1 Tempo: Free · Vintage · Pitch (Josh, 2026-10-29: Fit gone, Sync "vintage"),
     * the DSP's values 0 · 1 · 3; an old Fit (2) reads as Vintage */
    const tv = [];
    for (let i = 0; i < 200; i++) { cc(71, 1); const t = A.auLoopBankCells(4)[0].text; if (tv[tv.length - 1] !== t) tv.push(t); }
    assert(tv.join() === 'Free,Vintage,Pitch' && sent('t4_au_set_tempo').join() === '0 1,0 3' && !sentLike(/_au_set_(revrs|jump|jmpq)/).length,
           'K1 is not Tempo Free · Vintage · Pitch: ' + tv.join() + ' ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auTempoIdx({ tempo: 2 }) === 1 && A.auTempoIdx({ tempo: 3 }) === 2, 'an old Fit / Pitch reads wrong');
    for (let i = 0; i < 200; i++) cc(71, 127);
    /* K2 Bars: the sample's own length, 1..64, with the tempo it makes */
    reset();
    for (let i = 0; i < 40; i++) cc(72, 1);
    const bs = sent('t4_au_set_bars');
    assert(bs.length && bs[0] === '0 2', 'K2 is not Bars: ' + JSON.stringify(sentLike(/_au_/)));
    const bc = A.auLoopBankCells(4)[1];
    const nb = +bc.text;
    assert(bc.label === 'Bars' && nb >= 2 && bc.name.indexOf((nb * 120) + ' bpm') >= 0, 'the Bars cell: ' + JSON.stringify(bc));
    for (let i = 0; i < 400; i++) cc(72, 127);
    assert(A.auLoopBankCells(4)[1].text === '1', 'Bars went below 1: ' + A.auLoopBankCells(4)[1].text);
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
    /* 8 chops, but the pads are the sample in 32 sections of 3000 frames
     * (Josh, 2026-10-29: "chops should just be completely invisible in loop mode") */
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

step('⭐⭐ Loop pads: a Free loop whose clip wraps before the sample ends greys the sections it never reaches (Josh: "you can\'t see where the end point is")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    const reach = (r, rev) => INFO(0, 8).replace(' 96000 48000 2 0 0 0 8|', ' 96000 48000 2 ' + (rev ? 1 : 0) + ' 0 0 8 0 0 ' + r + '|');
    GET['t4_au_pos'] = '1 6000 -1';
    GET['t4_au_info_0'] = reach(30000); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert(A.auInfo(4, 0).reach === 30000, 'reach not parsed: ' + A.auInfo(4, 0).reach);
    assert(pad(9) && pad(9) !== HC.DarkGrey && [10, 20, 31].every((i) => pad(i) === HC.DarkGrey),
           'the sections past the wrap are not grey: ' + [9, 10, 20, 31].map(pad));
    /* Revrs reaches in from the end */
    GET['t4_au_info_0'] = reach(30000, 1); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 21].every((i) => pad(i) === HC.DarkGrey) && pad(22) && pad(22) !== HC.DarkGrey,
           'Revrs did not grey from the start: ' + [0, 21, 22].map(pad));
    /* all of it plays: nothing grey */
    GET['t4_au_info_0'] = reach(96000); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 15, 31].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'a loop that plays whole greys: ' + [0, 15, 31].map(pad));
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); A.auMarkStale(4, 0); ticks(4);
});

step('⭐⭐ Loop pads: sections outside Start..End are grey (Josh: "out of start/end range ... aren\'t showing up as dim white")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    GET['t4_au_pos'] = '1 30000 -1';
    GET['t4_au_info_0'] = INFO(0, 8).replace(' 16 0 96000 ', ' 16 24000 72000 '); A.auMarkStale(4, 0);
    for (let i = 0; i < 6; i++) ticks(1);
    assert(A.auInfo(4, 0).rstart === 24000, 'rstart not parsed: ' + A.auInfo(4, 0).rstart);
    assert([0, 7, 24, 31].every((i) => pad(i) === HC.DarkGrey), 'sections outside the range are not grey: ' + [0, 7, 24, 31].map(pad));
    assert([8, 15, 23].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'sections inside the range are grey: ' + [8, 15, 23].map(pad));
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
    assert(lit.every((v) => v), 'the step buttons do not light the whole loop: ' + lit.join());
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
