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
 *   - Audio is a row of the Instmt/Dest picker, Slicer the row after it;
 *     picking either converts (the engine key), the track keeps a Schwung
 *     slot, its instrument goes; an instrument-less track with notes asks
 *     first (Q2), No keeps it;
 *   - THE TWO INSTRUMENTS (Josh, 2026-11-02: "two instruments "audio" and
 *     "slicer""): an AUDIO track's every clip holds its own sample and plays
 *     it with the clip (what was a Loop clip); a SLICER holds ONE sample and
 *     its chops for the whole track (what was a Slice clip), in the engine's
 *     slot 16 — every clip of it is a sequence of those chops;
 *   - the walk: CONFIG door, MACROS, AUTOMATION door, CLIP, MIX on both; a
 *     Slicer adds PAD MODE, STEP and NOTE FX — no RPT GROOVE / HARMONY /
 *     SEQ ARP / DELAY on either;
 *   - the bank map: the SAMPLE pad opens the sample's editor; SLICES is a
 *     Slicer's; MIDI FX dark;
 *   - the editor: on screen; the jog turns pages; knobs write (Start in
 *     frames, an Audio clip's); touch + click opens the chooser (the knob is
 *     let go); SLICE n edits the last pad tapped; ALL SLICES sets every slice;
 *   - the chop design (Josh, 2026-10-27): SLICES › Even · Transient · Lazy ·
 *     Manual; Even and Transient are TOOLS that write the chops at once; a
 *     visit to a chop editor is one undo step; the waveform editor moves a
 *     slice's start / end by a pixel, zooms, adds a marker at the cursor,
 *     Delete + pad removes one; Lazy lights only the next pad, taps cut;
 *   - the pads are the chops in time order, 8 a row from the bottom-left;
 *   - a Slicer: pads 36 + chop, none past the count; the CLIP bank reads
 *     Res Strch Shift -- InQnt Crop Dir >Seq (a MIDI clip's, no Legato);
 *   - an Audio track: pad taps and steps do nothing, the pads show the loop
 *     as a progress bar; the CLIP bank is Strch (K2) and Shift / Nudge (K3),
 *     no Mode; its SAMPLE menu has no Chop sample;
 *   - the step editor's K1 reads "Slice n", K4 no Vel;
 *   - leaving Audio / the Slicer asks (Q3), Yes converts back (undoable);
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
              't4_au_info_0': INFO(0, 8), 't4_pad_mode': '3',
              't4_au_peaks_0': PEAKS, 't4_au_pos': '1 24000 2', 't4_au_lazy': '0 0 0',
              't4_au_marks_0': MARKS8,
              't4_au_sl_0_0': '0 12000 0 0 0 0 0 0 0', 't4_au_sl_0_2': '24000 36000 0 0 -3 0 0 0 0',
              't4_au_all_0': '0 x 0 0 0 0' };
const PREVIEWS = [];
globalThis.host_preview_play = (p) => { PREVIEWS.push(String(p)); };
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
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
/* THE TWO INSTRUMENTS (Josh, 2026-11-02): what this file's fixtures call a
 * "Slice clip" (info mode 1) is a SLICER track now — its sample is the
 * track's slot, read as clip 16 — and a "Loop clip" (mode 0) an AUDIO
 * track's. So the engine stub answers a slot read from the clip-0 fixture,
 * and the track's kind follows the fixture's mode (__kindSync). */
const slotKey = (k) => String(k).replace(/^(t4_au_(?:info|marks|peaks|all|progress)_)16$/, '$10')
                                .replace(/^(t4_au_sl_)16_/, '$10_').replace(/^(t4_au_wave_)16_/, '$10_');
globalThis.host_module_get_param = (k) => {
    if (k === 't4_pad_mode' && globalThis.__S && globalThis.__S.trackPadMode[4] >= 3) return String(globalThis.__S.trackPadMode[4]);
    const kk = GET[k] !== undefined ? k : slotKey(k);
    return GET[kk] !== undefined ? GET[kk] : '';
};
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
globalThis.__S = S;
const C = await import('../../ui/ui_constants.mjs');
const HC = await import('/data/UserData/schwung/shared/constants.mjs');
const A = await import('../../ui/ui_audio.mjs');
const E = await import('../../ui/ui_audio_editor.mjs');
const CH = await import('../../ui/ui_audio_chooser.mjs');
const P = await import('../../ui/ui_pure.mjs');
const D = await import('../../ui/ui_dialogs.mjs');
const DM = await import('../../ui/ui_drummodel.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const HP = await import('../../ui/hud/hud_publish.mjs');
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
/* A step starts its knob turns cold, as a first turn does: the acceleration
 * reads Date.now() since the knob's last turn, and a turn left by an earlier
 * step landed in a slower band on CI's slower Linux runner (a fraction of a
 * step, or none) where it did not on a fast machine. */
const reset = () => { sets.length = 0; S.pendingDefaultSetParams.length = 0; S.knobAccelLast.fill(0); };
/* the fixture's mode is the track's kind (see slotKey): 1 a Slicer, 0 Audio;
 * both the clip and the slot are read again */
const kindSync = () => {
    if (S.trackPadMode[4] === C.PAD_MODE_AUDIO || S.trackPadMode[4] === C.PAD_MODE_SLICER) {
        const m = parseInt(String(GET['t4_au_info_0'] || '').split(' ')[2], 10);
        const pm = m === 1 ? C.PAD_MODE_SLICER : C.PAD_MODE_AUDIO;
        if (S.trackPadMode[4] !== pm) { S.trackPadMode[4] = pm; S.pendingPadNoteMapRecompute = true; S.ledsDirtyAudio = true; }
    }
    A.auMarkStale(4, 0); A.auMarkStale(4, 16);
};

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
    assert(sent('t4_convert_to_audio').join() === 'u', 'no undoable convert: ' + JSON.stringify(sentLike(/_convert_/)));
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO && A.isAudioTrack(4), 'pad mode ' + S.trackPadMode[4]);
    assert(S.trackRoute[4] === 0, 'the route moved: ' + S.trackRoute[4]);
    assert(A.auInfo(4, 0).name === 'Break Phenom 84 bpm.wav', 'the clips were not read');
    S.clipNonEmpty[4][0] = false;
});

step('⭐⭐ the walk: an Audio track is LIVE ARP, MACROS, CLIP, MIX — no sequence (no STEP, NOTE FX or PAD MODE), no RPT GROOVE, HARMONY, SEQ ARP or DELAY', () => {
    /* (an Audio clip plays its sample with the clip: what was a Loop clip —
     * Josh, 2026-10-28: "we don't need to show notes at all in loop mode") */
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    assert(JSON.stringify(walk) === JSON.stringify([5, C.BANK_MACROS, 0, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_AUDIO, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0, 4) === null, 'the MIDI FX pad is lit (Q4)');
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 7, 0).comp === 'fx1', 'FX 1 is dark');
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    /* SAMPLE is the sample's editor; there is no sound bank (Josh,
     * 2026-10-30: "putting the params on track overview is a mistake"); SLICES
     * is a Slicer's (below) */
    assert(!map[2].cells[2], 'an Audio track has a SLICES door: ' + JSON.stringify(map[2].cells[2]));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave' && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE door');
    assert(!map.some((c) => c.cells.some((x) => x && x.bank === C.BANK_AUDIO)), 'a pad opens the old sound bank');
    /* DELAY left Audio tracks (Josh, 2026-10-28: "let's get rid of delay") */
    assert(!map[3].cells[2], 'the DELAY pad is lit: ' + JSON.stringify(map[3].cells[2]));
});

step('⭐⭐ Slicer is the row after Audio; picked on an Audio track it converts at once (LEAVE AUDIO is the picker\'s question), the engine\'s convert undoable, the slot read as the track\'s sample (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    const rows = C.instrPickerRows(S.trackRoute, 4, [], S.trackChannel);
    const ai = rows.findIndex((r) => r.v === C.INSTR_AUDIO), si = rows.findIndex((r) => r.v === C.INSTR_SLICER);
    assert(si === ai + 1 && rows[si].label === 'Slicer' && C.INSTR_SLICER === 61, 'rows: ' + rows.map((r) => r.label || '---').join('|'));
    reset();
    GET['t4_au_info_0'] = INFO(1, 8);                  /* the engine's slot: a sample of 8 chops */
    snd.requestInstrChange(4, C.INSTR_SLICER);
    assert(!S.confirmConvertToDrum, 'Audio to Slicer asked here (the picker asks LEAVE AUDIO)');
    ticks(3);
    assert(sent('t4_convert_to_slicer').join() === 'u' && !sent('t4_convert_to_audio').length, 'no convert: ' + JSON.stringify(sentLike(/_convert_/)));
    assert(S.trackPadMode[4] === C.PAD_MODE_SLICER && A.isSlicerTrack(4) && A.isSampledTrack(4) && !A.isAudioTrack(4), 'pad mode ' + S.trackPadMode[4]);
    assert(A.auClipOf(4) === A.AU_SLC && A.AU_SLC === 16 && A.auSeqClipOf(4) === 0, 'the Slicer does not read its slot: ' + A.auClipOf(4));
    assert(A.auInfo(4, 16).name === 'Break Phenom 84 bpm.wav' && A.auInfo(4, 16).n === 8, 'the slot was not read');
    assert(S.trackRoute[4] === 0, 'the route moved: ' + S.trackRoute[4]);
});

step('⭐⭐ the walk: a Slicer is PAD MODE, LIVE ARP, MACROS, STEP, CLIP, NOTE FX, MIX; SLICES above SAMPLE on the map', () => {
    const walk = P.bankCycleForMode(C.PAD_MODE_SLICER, 4);
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_CHORD, 5, C.BANK_MACROS, C.BANK_STEP, 0, 1, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_SLICER, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    const map = P.bankPadMapForMode(C.PAD_MODE_SLICER, 4);
    assert(map[2].cells[2] && map[2].cells[2].action === 'slices' && map[2].cells[2].name === 'SLICES',
           'the SLICES door is not under CLIP: ' + JSON.stringify(map[2].cells[2]));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave' && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE door');
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

step('⭐⭐ the right 4x4: SLICES above SAMPLE on a Slicer — the track\'s colour, White while its editor is up, a press opens it; dark on an Audio track (Josh, 2026-10-30: "both slice and sample should also be available in the right 4x4 shortcuts" · "slices above sample")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    const sl = P.bankMapModuleAt(0, C.PAD_MODE_SLICER, 6, 0, 4), sa = P.bankMapModuleAt(0, C.PAD_MODE_SLICER, 6, 1, 4);
    assert(sl && sl.label === 'SLICES' && sa && sa.label === 'SAMPLE', 'the column: ' + JSON.stringify([sl, sa]));
    S.activeBank = 0; S.bankCardLatched = false;
    cc(3, 127); ticks(2);
    assert(LEDS.get(P.bankMapPadForCell(6, 0)) === globalThis.__tc(4) && LEDS.get(P.bankMapPadForCell(6, 1)) === globalThis.__tc(4),
           'SLICES / SAMPLE are not the track\'s colour: ' + [LEDS.get(P.bankMapPadForCell(6, 0)), LEDS.get(P.bankMapPadForCell(6, 1))]);
    note(P.bankMapPadForCell(6, 0), 100); note(P.bankMapPadForCell(6, 0), 0); cc(3, 0); ticks(3);
    assert(S.auEditor && S.auEditor.ed === 'slices', 'the right SLICES pad did not open SLICES');
    cc(3, 127);
    S.jogPressMs = S.clockMs - C.JOG_HOLD_MAP_MS - 50; ticks(2);   /* held past the threshold (this rig's clock) */
    assert(S.bankMapUp && LEDS.get(P.bankMapPadForCell(6, 0)) === HC.White, 'SLICES\' shortcut is not White with SLICES up');
    cc(3, 0); ticks(2);
    for (let n = 0; S.auEditor && n < 4; n++) { back(); ticks(2); }
    assert(!S.auEditor, 'SLICES did not close');
    /* an Audio track: no SLICES there */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO && !P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0, 4), 'an Audio track has a SLICES shortcut');
    cc(3, 127); ticks(2);
    assert(!LEDS.get(P.bankMapPadForCell(6, 0)), 'the pad above SAMPLE is lit on an Audio track');
    note(P.bankMapPadForCell(6, 0), 100); note(P.bankMapPadForCell(6, 0), 0); cc(3, 0); ticks(3);
    assert(!S.auEditor, 'the dark pad opened something');
    /* the OLED map joins SLICES and SAMPLE on a Slicer only */
    assert(!render.bankMapItems().joins.length, 'an Audio track\'s map joins pads');
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    assert(JSON.stringify(render.bankMapItems().joins) === JSON.stringify([{ c: 2, r0: 2, r1: 3 }]),
           'SLICES over SAMPLE are not joined: ' + JSON.stringify(render.bankMapItems().joins));
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
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
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
    kindSync(); ticks(2);
    assert(A.auPanelCells(ED())[0].text === '--', 'Attk: ' + A.auPanelCells(ED())[0].text);
    reset();
    for (let i = 0; i < 10; i++) cc(75, 1);             /* K5 Pitch: one detent run (KNOB_PICK) */
    assert(sent('t4_au_all_pitch').join() === '16 1', 'pitch: ' + JSON.stringify(sentLike(/_au_/)));
    cc(76, 1); cc(76, 1);                               /* K6 Detune: cents */
    assert(sent('t4_au_all_detune').join() === '16 1,16 2', 'detune: ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auPanelCells(ED())[5].label === 'Detune' && A.auPanelCells(ED())[5].kind === 'arcbip' &&
           A.auPanelCells(ED())[5].text === '+2' && A.auPanelCells(ED())[5].signed === 2 / 50,
           'the Detune cell: ' + JSON.stringify(A.auPanelCells(ED())[5]));
    cc(74, 1);                                          /* K4 Gain */
    assert(sent('t4_au_all_gain').join() === '16 1', 'gain: ' + JSON.stringify(sentLike(/_au_/)));
    assert(!sentLike(/_au_set_(pitch|detune|gain)$/).length, 'ALL SLICES moved the clip\'s base: ' + JSON.stringify(sentLike(/_au_set_/)));
    cc(71, 1);                                          /* K1 Attk: every slice */
    assert(sent('t4_au_all_atk').length === 1, 'Attk did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    touchClick(2);                                      /* K3 is blank: a click does nothing */
    assert(!sent('t4_au_chop').length, 'K3 + click sequences from SLICES');
    S.shiftHeld = false;
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_all_0'] = '0 x 0 0 0 0';
    kindSync(); ticks(2);
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
    assert(sent('t4_au_slice_gain').some((v) => /^16 2 -2$/.test(v)), 'slice gain: ' + JSON.stringify(sent('t4_au_slice_gain')));
    cc(76, 127);                                        /* K6 Detune */
    assert(sent('t4_au_slice_detune').join() === '16 2 -1', 'slice detune: ' + JSON.stringify(sent('t4_au_slice_detune')));
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

step('⭐⭐ >Seq is on a Slicer\'s CLIP bank: touch K8 + click (Josh: ">seq in the clip BANK")', () => {
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
    const map = P.bankPadMapForMode(S.trackPadMode[4], 4);
    assert(map[2].cells[3] && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE pad on the instrument slot');
    mapPad(2, 3);
    assert(S.auEditor && S.auEditor.mode === 'wave' && S.auPanel && S.auPanel.wave, 'WAVE did not open');
    ticks(2);
    assert(inked(shown()), 'WAVE draws nothing');
    reset();
    const ed = S.auEditor;
    /* the jog turns SAMPLE's pages (Josh, 2026-10-29: "the waveform on page 1
     * and the params on page 2"): over to Pitch / Detune / Gain / Tempo / Revrs and back */
    jog(1); ticks(1);
    let ptx = globalThis.__texts(() => shown());
    assert(ed.page === 1 && ptx.indexOf('2/2') >= 0 && ptx.indexOf('TEMPO') >= 0 && ptx.indexOf('ORIG') < 0, 'the jog did not turn to page 2: ' + JSON.stringify(ptx));
    jog(-1); ticks(1);
    ptx = globalThis.__texts(() => shown());
    assert(ed.page === 0 && ptx.indexOf('1/2') >= 0, 'the jog did not turn back to page 1: ' + JSON.stringify(ptx));
    /* a click opens SAMPLE's menu (Josh, 2026-10-30: "it should load a menu for
     * consistency"): Load sample · Trim · Normalize */
    click(); ticks(2);
    assert(ed.pick && ed.pick.level === 1 && E.auPickRows(ed).map((r) => r.label).join() === 'Load sample,Trim,Normalize',
           'a click did not open SAMPLE\'s menu: ' + JSON.stringify({ pick: ed.pick, rows: E.auPickRows(ed).map((r) => r.label) }));
    assert(!sentLike(/_au_(mark_add|set_even)/).length, 'a click on SAMPLE edited the chops: ' + JSON.stringify(sentLike(/_au_/)));
    click(); ticks(2);                              /* Load sample */
    assert(S.auChooser && !ed.pick && S.auEditor === ed, 'Load sample did not open the chooser: ' + JSON.stringify({ ch: !!S.auChooser, pick: ed.pick }));
    back(); ticks(2);
    assert(!S.auChooser && S.auEditor === ed, 'Back did not close the chooser onto SAMPLE');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back did not leave WAVE');
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(20);
});

step('⭐⭐ SAMPLE on a Slicer: no Start or Length — K1 / K3 do nothing, the header reads LEN and the chop count; no cursor, no Delete + pad; a pad goes to its chop at the zoom it has (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8 */
    kindSync(); ticks(2);
    mapPad(2, 3);
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.ed !== 'slices' && ed.c === 16, 'SAMPLE did not open on the Slicer\'s sample: ' + JSON.stringify(ed && { ed: ed.ed, c: ed.c }));
    reset();
    cc(71, 1); cc(73, 1);
    assert(!sentLike(/_au_(set_start|set_end|slice_start|slice_end)$/).length && !sentLike(/_loop_set$/).length,
           'K1 / K3 moved something on a Slicer\'s SAMPLE: ' + JSON.stringify(sentLike(/_au_|_loop_set/)));
    /* what plays is its chops: the sample's length and how many (frames 96000 at 48 kHz) */
    const tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('LEN ' + A.auFmtTime(96000, 48000).toUpperCase()) >= 0 && tx.indexOf('8 CHOPS') >= 0 && !tx.some((x) => /^S \d/.test(x)),
           'the header: ' + JSON.stringify(tx));
    const cur0 = ed.cur;
    jog(2);
    assert(ed.cur === cur0 && ed.page === 1, 'the jog moved a cursor on SAMPLE (it turns the page): ' + ed.cur);
    jog(-2);
    cc(HC.MoveDelete, 127); note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0); cc(HC.MoveDelete, 0);
    assert(!sent('t4_au_mark_del').length, 'Delete + pad removed a chop on SAMPLE');
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
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(20);
});

step('⭐⭐ Manual (SLICES › click › Manual): the chops as they are; pads pick, K1/K3 move by a pixel, K2 zooms, click adds, Delete + pad removes, Delete + click clears', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    kindSync(); ticks(2);
    mapPad(2, 2);                                       /* SLICES: chopping lives only here */
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave' && ed.ed === 'slices', 'no SLICES editor');
    reset();
    click(); jog(1); jog(1); jog(1); click();           /* the chop types, one row a detent */
    /* no question on the way in (Josh: "edit existing chips with a "clear all" option") */
    assert(ed.mode === 'chop' && ed.chop.kind === 'manual' && !ed.ask && !sent('t4_au_manual').length,
           'Manual did not open on the chops as they are: ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ask: ed.ask }));
    /* the visit is ONE undo step (Josh, 2026-11-02: one undo per chop-editor visit) */
    assert(sent('t4_au_undo_slc').length === 1, 'opening Manual did not take one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);   /* the timeline: pad 6 is chop 6 */
    assert(A.auSelSlice(4) === 5 && ed.cur === 60000, 'the pad did not pick slice 6: ' + A.auSelSlice(4) + ' ' + ed.cur);
    reset();
    note(0, 127); cc(71, 1); note(0, 0);
    assert(sent('t4_au_slice_start').join() === '16 5 60750', 'K1: one pixel (750 frames): ' + JSON.stringify(sent('t4_au_slice_start')));
    assert(A.auMarks(4, 16)[4][1] === 60750, 'the slice before did not follow its home end');
    reset();
    for (let z = 0; z < 6; z++) cc(72, 1);          /* K2: zoom in, on the start (last touched) */
    assert(ed.B - ed.A === 25166 && Math.abs((ed.A + ed.B) / 2 - 60750) <= 1, 'zoom is not centred on the start: ' + ed.A + '..' + ed.B);
    cc(73, 1);                                       /* K3: the end, one pixel (197) */
    assert(sent('t4_au_slice_end').join() === '16 5 72197', 'K3: ' + JSON.stringify(sent('t4_au_slice_end')));
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
    assert(sent('t4_au_slice_end').pop() === '16 5 0', 'home: ' + JSON.stringify(sent('t4_au_slice_end')));
    cc(73, 127);                                     /* sticks at home a few detents */
    assert(sent('t4_au_slice_end').length === 2, 'the end left home at once');
    reset();
    jog(3);
    assert(ed.cur === 60000 + 3 * 197 && ed.last === 'jog', 'jog: ' + ed.cur);   /* the cursor stays where the pad put it */
    click();
    assert(sent('t4_au_mark_add').join() === '16 ' + ed.cur, 'click: ' + JSON.stringify(sent('t4_au_mark_add')));
    assert(A.auInfo(4, 16).n === 9 && A.auMarks(4, 16).length === 9, 'the marker is not on screen');
    reset();
    cc(HC.MoveDelete, 127);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);   /* slice 1: stays */
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);   /* slice 3 */
    cc(HC.MoveDelete, 0);
    assert(sent('t4_au_mark_del').join() === '16 2', 'Delete + pad: ' + JSON.stringify(sent('t4_au_mark_del')));
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
    assert(sent('t4_au_manual').join() === '16' && A.auInfo(4, 16).n === 1 && ed.mode === 'chop', 'Yes did not clear to one slice');
    back();
    assert(S.auEditor === ed && ed.mode === 'wave' && !ed.ask, 'Back from Manual did not return to WAVE');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(20);
});

step('⭐⭐ scrolling a zoomed waveform never stretches the overview (Josh: "the whole screen turns white")', () => {
    /* zoomed in, the new window's read pending: the overview stretched fills every column */
    const A0 = 40000, B0 = 41280;                    /* 10 frames a pixel */
    const cols = A.auWaveColumns(4, 16, 128, A0, B0);   /* a Slicer's slot */
    assert(cols && cols.every((v) => v === 0), 'a pending deep window drew the stretched overview: ' + cols.slice(0, 8));
    /* the read lands: a ramp, column k = k/127 */
    const ramp = Array.from({ length: 128 }, (_, k) => '00' + k.toString(16).padStart(2, '0')).join('');
    GET['t4_au_wave_0_' + A0 + '_' + B0] = ramp;
    ticks(1);
    const got = A.auWaveColumns(4, 16, 128, A0, B0);
    assert(Math.abs(got[64] - 64 / 127) < 1e-6, 'the read did not draw: ' + got[64]);
    /* scrolled 32 pixels on, before ITS read: the last one, shifted */
    const sc = A.auWaveColumns(4, 16, 128, A0 + 320, B0 + 320);
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
        /* white: SAMPLE on the left map and its shortcut on the right 4x4
         * (the instrument pad), nothing else — not the bank under it */
        const whites = Array.from({ length: 32 }, (_, i) => i).filter((i) => LEDS.get(C.TRACK_PAD_BASE + i) === HC.White);
        const want = [P.bankMapPadForCell(col, row), P.bankMapPadForCell(6, 1)].map((n) => n - C.TRACK_PAD_BASE).sort((a, b) => a - b);
        assert(JSON.stringify(whites) === JSON.stringify(want), 'the map lights ' + JSON.stringify(whites) + ' white over ' + name + ', not ' + JSON.stringify(want));
        note(P.bankMapPadForCell(2, 1), 100); note(P.bankMapPadForCell(2, 1), 0);   /* CLIP */
        cc(3, 0); ticks(3);
        assert(!S.auPanel && !S.auEditor && S.activeBank === 0, 'the pick did not leave ' + name + ' for CLIP: bank ' + S.activeBank);
    }
    /* ...and a short click is still the screen's: SLICES opens its chop types */
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 2);
    reset();
    click(); ticks(2);
    assert(S.auEditor.pick && !S.bankMapUp, 'a short click did not reach SLICES: ' + JSON.stringify(S.auEditor.pick));
    back(); back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
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
    /* Shift + click is still SAMPLE's own (its menu, as a click) */
    mapPad(2, 3);
    shiftClick(); ticks(2);
    assert(S.auEditor && S.auEditor.pick, 'Shift + click left SAMPLE instead of opening its menu');
    back(); ticks(2);
    assert(S.auEditor && !S.auEditor.pick, 'Back did not close the menu onto SAMPLE');
    back(); ticks(2);
    assert(!S.auEditor, 'WAVE did not close');
});

step('⭐ a Slicer\'s SAMPLE: K1 / K3 do nothing (no Start or Length), so the LEN / CHOPS readouts never light as if in hand (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    const px = (f, x, y) => f[y * 128 + x];
    try {
        let f = shown();
        assert(!px(f, 2, 9) && !px(f, 2, 15), 'a readout is lit with no knob in hand');
        note(0, 127); f = shown(); note(0, 0);
        assert(!px(f, 2, 9) && !px(f, 2, 15), 'touching K1 lit the LEN readout on a Slicer\'s SAMPLE (K1 does nothing there)');
        cc(73, 1); f = shown();
        assert(!px(f, 124 - 2, 9), 'turning K3 lit the CHOPS readout on a Slicer\'s SAMPLE (K3 does nothing there)');
    } finally {
        S.knobTurnedTick[2] = S.clockMs - 1000; ticks(1);
        leave(); ticks(2);
    }
});

step('⭐⭐ SAMPLE: the sample\'s name up top; Start / End light while touched or turned (an Audio clip\'s); ZOOM + / - / ZOOM between them (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);   /* a Slicer, a hand set of 8 */
    mapPad(2, 3);
    ticks(2);
    const px = (f, x, y) => f[y * 128 + x];
    const rx = 124 - 2;                              /* the end strip runs to x 124 */
    let tx = globalThis.__texts(() => { shown(); });
    /* a click opens the menu (chopping is SLICES' alone), the jog turns the
     * page; SAMPLE page 1 of 2 under the sample's name (SLICE n/N is SLICES') */
    assert(['CLK', 'MENU', 'JOG', 'PAGE'].every((h) => tx.indexOf(h) >= 0), 'Slicer hints: ' + JSON.stringify(tx));
    assert(tx.indexOf('1/2') >= 0 && tx.some((x) => /^BREAK PHENOM/.test(x)), 'the header: ' + JSON.stringify(tx.slice(0, 6)));
    tx = globalThis.__texts(() => { cc(72, 1); shown(); });
    assert(tx.indexOf('ZOOM +') >= 0, 'zooming in: ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { cc(72, 127); shown(); });
    assert(tx.indexOf('ZOOM -') >= 0, 'zooming out: ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(1, 127); shown(); });
    assert(tx.indexOf('ZOOM') >= 0 && tx.indexOf('ZOOM +') < 0 && tx.indexOf('ZOOM -') < 0, 'a touched K2: ' + JSON.stringify(tx));
    note(1, 0);
    S.knobTurnedTick[1] = S.clockMs - 1000; ticks(1);
    back();
    /* an Audio clip: the sample's name up top (Josh: "show the sample name in
     * the header of "sample" instead of "loop""); Zoom takes the middle from
     * Pitch / Gain while in hand */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    let lf;
    tx = globalThis.__texts(() => { lf = shown(); });
    assert(tx.indexOf('CLK') >= 0 && tx.indexOf('MENU') >= 0 && tx.indexOf('JOG') >= 0 && tx.indexOf('PAGE') >= 0 && tx.indexOf('1/2') >= 0,
           'Audio hints: ' + JSON.stringify(tx));
    /* nothing in the middle with no knob in hand (Josh) */
    const nm = A.auSampleName(4, 0).toUpperCase();
    assert(nm && nm !== 'NO SAMPLE' && tx.some((x) => x.toUpperCase() === nm) && tx.indexOf('LOOP') < 0 && !tx.some((x) => /^(ZOOM [+-]|GAIN |PITCH |DETUNE )|ST$|DB$/.test(x)) && !lf[12 * 128 + 64], 'Audio at rest: ' + JSON.stringify(tx));
    /* Start / End: lit while touched or turned, dark otherwise */
    assert(!px(lf, 2, 9) && !px(lf, 3, 15), 'Start is lit with no knob in hand');
    note(0, 127); lf = shown();
    assert(px(lf, 2, 9) && px(lf, 2, 15), 'touching K1 did not light Start');
    note(0, 0); lf = shown();
    assert(!px(lf, 2, 9), 'letting go of K1 left Start lit');
    S.knobAccelLast[2] = 0; cc(73, 1); lf = shown();  /* K3 turned, no touch */
    assert(S.knobTouched === 2 && px(lf, rx, 9), 'turning K3 did not light End');
    S.knobTurnedTick[2] = S.clockMs - 1000; ticks(1); lf = shown();
    assert(S.knobTouched === -1 && !px(lf, rx, 9), 'End stayed lit after the turn');
    tx = globalThis.__texts(() => { cc(72, 1); lf = shown(); });
    /* ...and in hand it is lit, as Start / End are */
    assert(tx.indexOf('ZOOM +') >= 0 && lf[9 * 128 + 64] && lf[15 * 128 + 64], 'Audio zoom: ' + JSON.stringify(tx));
    S.knobTurnedTick[1] = S.clockMs - 1000; ticks(1);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ WAVE K4 Gain · K5 Pitch · K6 Detune (the clip\'s), read out in the middle; the waveform follows the gain (Josh) — and the Screen view gets the waveform', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    /* ⭐ the Screen view (a browser watching): WAVE publishes its screen with
     * the waveform — amplitude columns, region, knobs; nobody watching, nothing */
    {
        let last = null;
        globalThis.host_ui_publish = (j) => { if (j) last = j; return true; };
        HP.hudTick(8e15);       /* the viewer probe, now (past the real clock) */
        shown();
        assert(last, 'Screen view: nothing was published with a viewer connected');
        const d = JSON.parse(last);
        assert(d.where.screen === 'audio-wave-editor', 'Screen view: screen id ' + d.where.screen);
        assert(d.body && d.body.wave && Array.isArray(d.body.wave.amp) && d.body.wave.amp.length >= 100,
               'Screen view: no waveform: ' + JSON.stringify(d.body && d.body.wave).slice(0, 200));
        assert(d.body.wave.region && d.body.wave.region.length === 2, 'Screen view: no region');
        if (process.env.HUD_DUMP) require('fs').writeFileSync(process.env.HUD_DUMP, last);
        globalThis.host_ui_publish = (j) => { if (j) throw new Error('published with nobody watching'); return false; };
        HP.hudTick(9e15); shown();
        globalThis.host_ui_publish = () => false;
    }
    const waveInk = () => { const f = shown(); let n = 0; for (let y = 20; y < 50; y++) for (let x = 0; x < 128; x++) n += f[y * 128 + x]; return n; };
    const quiet = waveInk();
    reset();
    /* each turn from idle, as for Detune below: the acceleration reads Date.now(),
     * and CI's slower Linux runner took one of six quick turns as a fraction */
    let tx = globalThis.__texts(() => { for (let i = 0; i < 6; i++) { S.knobAccelLast[3] = 0; cc(74, 1); } shown(); });
    assert(sent('t4_au_set_gain').pop() === '16 6' && tx.indexOf('GAIN +6DB') >= 0, 'K4 Gain: ' + JSON.stringify(sent('t4_au_set_gain')) + ' ' + JSON.stringify(tx));
    /* measured before a tick: this rig's engine stub answers 0 dB to a re-read */
    assert(waveInk() > quiet, 'the waveform did not grow with +6 dB: ' + quiet + ' -> ' + waveInk());
    tx = globalThis.__texts(() => { for (let i = 0; i < 10; i++) cc(75, 1); shown(); });
    assert(sent('t4_au_set_pitch').join() === '16 1' && tx.indexOf('PITCH +1') >= 0, 'K5 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')) + ' ' + JSON.stringify(tx));
    /* each turn from idle (the knob's acceleration reads Date.now(): two turns in
     * one millisecond on one machine are two steps, on another a fraction) */
    tx = globalThis.__texts(() => { S.knobAccelLast[5] = 0; cc(76, 127); S.knobAccelLast[5] = 0; cc(76, 127); shown(); });
    assert(sent('t4_au_set_detune').join() === '16 -1,16 -2' && tx.indexOf('DETUNE -2') >= 0, 'K6 Detune: ' + JSON.stringify(sent('t4_au_set_detune')) + ' ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(3, 127); shown(); });
    assert(tx.indexOf('GAIN +6DB') >= 0, 'touching K4 does not read out: ' + JSON.stringify(tx));
    note(3, 0);
    /* K7 the sample's own Tempo, 1 BPM a step — on a Slicer too, where
     * >Seq places the chops by it (Josh, 2026-10-29: Move's "tempo knob to
     * set the original tempo") */
    GET['t4_au_info_0'] = INFO24(1, 8, 0, 8, 50, 0);   /* 84 BPM */
    kindSync(); ticks(2);
    assert(A.auInfo(4, 16).bpm10 === 840, 'the Tempo was not read: ' + A.auInfo(4, 16).bpm10);
    tx = globalThis.__texts(() => { S.knobAccelLast[6] = 0; cc(77, 1); shown(); });
    const bs = sent('t4_au_set_bpm');
    assert(bs.length === 1 && bs[0] === '16 850' && tx.indexOf('TEMPO 85 BPM') >= 0,
           'K7 Tempo: ' + JSON.stringify(bs) + ' ' + JSON.stringify(tx));
    /* ...and with Shift a tenth (Josh, 2026-10-30: "fine adjust with shift
     * modifier tempo (needs decimals) and length") */
    S.shiftHeld = true;
    tx = globalThis.__texts(() => { S.knobAccelLast[6] = 0; cc(77, 1); shown(); });
    S.shiftHeld = false;
    assert(sent('t4_au_set_bpm').pop() === '16 851' && tx.indexOf('TEMPO 85.1 BPM') >= 0,
           'Shift + K7: ' + JSON.stringify(sent('t4_au_set_bpm')) + ' ' + JSON.stringify(tx));
    back();
    /* K3 Length on an Audio clip: a bar a detent, a step with Shift */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0);   /* 84 BPM */
    kindSync(); ticks(2);
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
    S.clipLength[4][0] = 3; kindSync(); ticks(2);
    S.shiftHeld = true; S.knobAccelLast[2] = 0; cc(73, 127); S.shiftHeld = false;   /* 2 steps, inside the file; K3 last */
    for (let z = 0; z < 3; z++) cc(72, 1);           /* zoom in */
    const endNow = () => A.auPlayedEnd(4, 0, A.auInfo(4, 0));
    assert(!led.full && Math.abs(led.B - endNow()) <= 1, 'not on the end before the Tempo turn: ' + led.A + '..' + led.B + ' end ' + endNow());
    for (let k = 0; k < 4; k++) { S.knobAccelLast[6] = 0; cc(77, 127); }
    assert(Math.abs(led.B - endNow()) <= 1 && sent('t4_au_set_bpm').length >= 4,
           'the view left the end while Tempo turned: ' + led.A + '..' + led.B + ' end ' + endNow());
    back();
    S.clipLength[4][0] = 16;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ Delete + click on a grid page resets that page only: SLICE n, ALL SLICES with Shift, SAMPLE page 2 (Josh: "for multi-page banks, we should have delete+jog only reset the active page")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    A.auSetSelSlice(4, 2);
    toSlicesP2();
    reset();
    S.shiftHeld = true;                              /* ALL SLICES */
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    S.shiftHeld = false;
    const got = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(!sentLike(/_au_set_/).length, 'ALL SLICES reset the clip\'s base: ' + got);
    assert(['all_pitch=16 0', 'all_detune=16 0', 'all_gain=16 0', 'all_rev=16 0', 'all_atk=16 0', 'all_dec=16 0', 'all_play=16 0']
           .every((k) => got.indexOf('t4_au_' + k) >= 0), 'ALL SLICES did not reset: ' + got);
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);   /* SLICE 3 */
    const sg = sentLike(/_au_slice_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(!sentLike(/_au_set_/).length && !sentLike(/_au_all_/).length, 'SLICE n reset more than itself: ' + JSON.stringify(sentLike(/_au_/)));
    assert(['pitch', 'detune', 'gain', 'rev', 'atk', 'dec', 'play'].every((f) => sg.indexOf('t4_au_slice_' + f + '=16 2 0') >= 0),
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
    assert(['gain', 'pitch', 'detune', 'revrs'].every((f) => sa.indexOf('t4_au_set_' + f + '=16 0') >= 0) && !sent('t4_au_set_bpm').length && !sent('t4_au_set_sync').length,
           'SAMPLE page 2 did not reset its sound only: ' + sa);
    leave();
    S.actionPopupEndTick = 0;
    S.activeBank = 0; ticks(2);
});

step('⭐ Delete + track clears an Audio clip\'s sequence and keeps its sample and length; Shift + Delete is the full reset (Josh)', () => {
    const ED = globalThis.__ED;
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);   /* an Audio track */
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
    kindSync(); ticks(2);
});

step('⭐ Delete + track on a Slicer clears its clip as a MIDI clip\'s (the length back to adaptive); Shift + Delete leaves the track\'s sample alone (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    const ED = globalThis.__ED;
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    assert(A.isSlicerTrack(4), 'not a Slicer');
    S.clipLength[4][0] = 48; S.clipLengthManuallySet[4][0] = true; S.clipNonEmpty[4][0] = true;
    reset();
    ED.clearClip(4, 0, false);
    const mirrored = S.clipLength[4][0] === 16 && !S.clipLengthManuallySet[4][0] && !S.clipNonEmpty[4][0];
    ticks(3);
    assert(sent('t4_c0_clear').length === 1, 'no clear: ' + JSON.stringify(sentLike(/_c0_/)));
    assert(mirrored, 'a Slicer clip\'s clear kept its length or content');
    assert(A.auInfo(4, 16).name === 'Break Phenom 84 bpm.wav', 'the clear dropped the Slicer\'s sample');
    reset();
    ED.hardResetClip(4, 0); ticks(3);
    assert(sent('t4_c0_hard_reset').length === 1, 'no hard reset');
    assert(A.auInfo(4, 16).name === 'Break Phenom 84 bpm.wav' && !sentLike(/_au_(clear|pick)/).length,
           'Shift + Delete touched the Slicer\'s sample: ' + JSON.stringify(sentLike(/_au_/)));
    S.clipLength[4][0] = 16; S.clipLengthManuallySet[4][0] = false; S.clipNonEmpty[4][0] = false;
    kindSync(); ticks(2);
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
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(3);
    S.activeBank = 0;
    mapPad(2, 3); ticks(2);                          /* SAMPLE page 1: K1-K8 (K8 Revrs) */
    assert(lit() === '11111111', 'WAVE rings: ' + lit());
    ticks(3);                                        /* ...and that is what the knobs get */
    assert(sent8() === '11111111', 'the rings sent over WAVE: ' + sent8() + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((x) => CCLEDS.get(x))));
    const g0 = globalThis.__ring()[3].norm;
    cc(74, 1);
    assert(globalThis.__ring()[3].norm > g0, 'the Gain ring did not follow the turn');
    S.knobTurnedTick[3] = S.clockMs - 1000; ticks(1);
    jog(1); ticks(3);                                /* SAMPLE page 2 (Loop): Sync, Pitch, Detune, Gain, Tempo, Revrs, K7 / K8 blank */
    assert(sent8() === '11111100', 'SAMPLE page 2 rings: ' + sent8());
    back();
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐⭐ SLICES (Josh, 2026-10-29): page 1 the chops — K1 / K3 the slice, a click the chop types; page 2 slice n, Shift every slice; an Audio track has none', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    assert(!P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4)[2].cells[2], 'an Audio track\'s map shows a SLICES pad (found on the device)');
    mapPad(2, 2);
    assert(!S.auEditor, 'the SLICES door opened on an Audio track');
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
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
               'SAMPLE on a Slicer does not show chop 1 as a faint tick');
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
    assert(sent('t4_au_slice_rev').join() === '16 2 1' && !sent('t4_au_set_revrs').length,
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
    assert(ed.pick && ed.pick.level === 2 && E.auPickRows(ed).map((r) => r.label).join() === 'Even,Transient,Lazy,Manual,Convert to kit',
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
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐⭐ the editor follows the clip: a side button with SAMPLE up on an Audio track moves it onto that clip (Josh, 2026-10-30: "it doesn\'t change to the new clip"); a Slicer\'s stays on the track\'s sample', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    S.sceneRow = 0;
    GET['t4_au_info_0'] = INFO(0, 8); GET['t4_au_marks_0'] = MARKS8;   /* an Audio track: clip A holds a sample */
    delete GET['t4_au_info_1'];
    kindSync(); ticks(2);
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
    /* a Slicer: every clip plays the track's one sample — SLICES stays on it
     * while the clip the steps are in changes (Josh, 2026-11-02: "two
     * instruments \"audio\" and \"slicer\"") */
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 2); ticks(2);
    assert(S.auEditor && S.auEditor.ed === 'slices' && S.auEditor.c === 16, 'SLICES did not open on the Slicer\'s sample');
    sideB();
    assert(S.auEditor && S.auEditor.c === 16 && S.auEditor.ed === 'slices' && A.auSeqClipOf(4) === 1,
           'SLICES left the Slicer\'s sample on clip B: ' + JSON.stringify(S.auEditor && { c: S.auEditor.c, ed: S.auEditor.ed, seq: A.auSeqClipOf(4) }));
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('CLICK TO LOAD SAMPLE') < 0, 'clip B shows the Slicer as empty: ' + JSON.stringify(tx));
    cc(43, 127); cc(43, 0); ticks(4);
    back(); ticks(2);
    S.activeBank = 0;
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐⭐ SAMPLE zoomed out is the clip: the audio where it lands at its Tempo, empty past the file, a tick a beat (Josh, 2026-10-29)', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    /* an 84 BPM sample of 2 s (96000 frames at 48 kHz) in a 1-bar clip: a bar
     * at 84 is 2.86 s, so the file ends 70% across — the rest is empty */
    GET['t4_au_info_0'] = INFO24(0, 8, 8, 0, 50, 0);
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    kindSync(); ticks(2);
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
    /* Track View at rest says the Audio clip's Tempo on its info row (Josh: "LOOP 112") */
    GET['t4_au_info_0'] = INFO24(0, 8, 8, 0, 50, 0); kindSync(); ticks(2);
    S.knobTouched = -1; S.bankCardLatched = false;
    const rtx = globalThis.__texts(() => shown());
    assert(rtx.some((x) => /^loop 84 /i.test(x)), 'the info row does not carry the Tempo: ' + JSON.stringify(rtx.slice(0, 4)));
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐ Start / End read in seconds to 2 decimals, rounded (Josh: "2 decimals, rounded, for the seconds read-out is fine")', () => {
    assert(A.auFmtTime(55125, 44100) === '1.25s' && A.auFmtTime(237, 44100) === '0.01s' &&
           A.auFmtTime(44100 * 12.346, 44100) === '12.35s' && A.auFmtTime(44100 * 75.5, 44100) === '1:15.50',
           [A.auFmtTime(55125, 44100), A.auFmtTime(237, 44100), A.auFmtTime(44100 * 12.346, 44100), A.auFmtTime(44100 * 75.5, 44100)].join());
});

step('⭐⭐ chopping lives only on SLICES: a click there opens the chop types; SAMPLE\'s click and Shift + click load (Josh: "chopping should only be on slices")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);   /* a hand set of 8, Even Off */
    mapPad(2, 3);
    reset();
    shiftClick(); ticks(2);
    let ed = S.auEditor;
    assert(ed && ed.ed === 'sample' && ed.pick && ed.pick.level === 1 && !E.auPickRows(ed).some((r) => /chop/i.test(r.label)),
           'Shift + click on SAMPLE is not its menu (without chopping): ' + JSON.stringify(ed && ed.pick));
    assert(sentLike(/mark_add/).length === 0, 'Shift + click also added a marker');
    back(); ticks(2);
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the menu onto SAMPLE');
    back();
    mapPad(2, 2);
    ed = S.auEditor;
    click();
    assert(ed.pick && ed.pick.level === 2 && E.auPickRows(ed).map((r) => r.label).join() === 'Even,Transient,Lazy,Manual,Convert to kit',
           'a click on SLICES did not open the chop types: ' + JSON.stringify(ed.pick));
    assert(inked(shown()), 'the chop types draw nothing');
    {
        const tx = globalThis.__texts(() => shown());
        assert(tx.indexOf('EXIT') >= 0 && tx.indexOf('UP') < 0, 'the chop types\' Back hint: ' + JSON.stringify(tx));
    }
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the chop types (SLICES stays)');
    back();
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
});

step('⭐⭐ SLICES › Convert to kit (Josh, 2026-10-30: "convert to kit. creates a move drum rack kit with 32 pad max ... carrying over slice pitch, decay, gain, etc." · "shared copy"): the sample copied once into the library, a pad per chop playing its part of it', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    GET['t4_au_sl_0_1'] = '12000 24000 0 2 0 0 1 10 250 7';      /* Pitch +2, Gate, Attk 10 ms, Decay 250 ms, Detune 7 */
    S.currentSetName = 'My Song';
    const SAMP = '/data/UserData/UserLibrary/Samples/dAVEBOx/Exported kits/My Song 5.wav';
    const KIT = '/data/UserData/UserLibrary/Track Presets/dBx-slice/My Song 5.ablpreset';
    const cmds = [], files = {};
    const cmd0 = globalThis.host_system_cmd, wr0 = globalThis.host_write_file;
    /* the copy lands where it was sent (its name is pinned at the end) */
    globalThis.host_system_cmd = (c) => { cmds.push(String(c)); const m = /'([^']*)'$/.exec(String(c)); globalThis.__stubStat = { [m ? m[1] : SAMP]: { mode: 0o100644, size: 9 } }; return 0; };
    globalThis.host_write_file = (path, body) => { files[String(path)] = String(body); return wr0(path, body); };
    const bulk = [], gp0 = globalThis.host_module_get_params;
    globalThis.host_module_get_params = (blob) => { bulk.push(String(blob)); return ''; };
    try {
        mapPad(2, 2);
        const ed = S.auEditor;
        click();
        const rows = E.auPickRows(ed);
        for (let k = 0; k < rows.findIndex((r) => r.id === 'kit'); k++) jog(1);
        click();
        assert(!ed.pick && S.pendingAuKit, 'the row did not ask for the kit');
        ticks(2);
        /* the kit's content first, wherever it was written; its NAME is
         * pinned last (a Slicer's sample is the slot, 16 — the name is the
         * track and its current clip, 5A) */
        assert(cmds.length === 1 && /^cp '\/data\/UserData\/UserLibrary\/Sets\/x\/dAVEBOx\/samples\/Break Phenom 84 bpm\.wav' '/.test(cmds[0]),
               'the copy: ' + JSON.stringify(cmds));
        const kitPath = Object.keys(files).find((k) => k.indexOf('/Track Presets/dBx-slice/') >= 0);
        assert(kitPath, 'no kit written: ' + Object.keys(files).join());
        assert((S.actionPopupLines || [])[0] === 'KIT SAVED', 'notice: ' + JSON.stringify(S.actionPopupLines));
        const slBulk = bulk.filter((b) => /_au_sl_/.test(b));
        assert(slBulk.length === 1 && /t4_au_sl_\d+_0/.test(slBulk[0]) && /t4_au_sl_\d+_7/.test(slBulk[0]),
               'the chops were not read in one round trip: ' + slBulk.length + ' bulk reads');
        const kit = JSON.parse(files[kitPath]);
        /* numbers as Ableton writes them: floats keep ".0", the note / choke /
         * transpose fields are integers */
        assert(/"Volume": 0\.0\b/.test(files[kitPath]) && /"receivingNote": 36,/.test(files[kitPath]) &&
               /"Voice_Transpose": 0,/.test(files[kitPath]) && !/"Volume": 0,/.test(files[kitPath]), 'numbers not as Ableton writes them');
        assert(kit.kind === 'instrumentRack', 'the rack: ' + kit.kind);
        /* a native preset as Move writes one: schema 1.8.3, the drum rack with its
         * reverb return, then the rack-wide saturator */
        assert(/\/1\.8\.3\/devicePreset\.json$/.test(kit.$schema), 'schema: ' + kit.$schema);
        assert(kit.chains[0].devices.map((d) => d.kind).join() === 'drumRack,saturator' &&
               kit.chains[0].devices[0].returnChains[0].devices[0].kind === 'reverb', 'not a native drum rack preset');
        const pads = kit.chains[0].devices[0].chains;
        assert(kit.chains[0].devices[0].kind === 'drumRack' && pads.length === 16, 'pads: ' + pads.length + ' (8 chops, filled to 16)');
        const cell = (k) => pads[k].devices[0];
        const uri = cell(0).deviceData.sampleUri;
        assert(/^ableton:\/user-library\/Samples\/dAVEBOx\/Exported%20kits\//.test(uri), 'the chops\' sample: ' + uri);
        assert(pads.every((p, k) => p.drumZoneSettings.receivingNote === 36 + k), 'notes are not 36 up');
        assert(pads.slice(0, 8).every((p, k) => cell(k).deviceData.sampleUri === uri && p.drumZoneSettings.chokeGroup === 1),
               'the chops do not share the copy in choke group 1');
        assert(pads.slice(8).every((p, k) => cell(8 + k).deviceData.sampleUri === null), 'pads past the chops are not empty');
        const c0 = cell(0).parameters, c1 = cell(1).parameters, c2 = cell(2).parameters;
        assert(c0.Voice_PlaybackStart === 0 && c0.Voice_PlaybackLength === 0.125, 'chop 1 region: ' + c0.Voice_PlaybackStart + ' ' + c0.Voice_PlaybackLength);
        assert(c1.Voice_PlaybackStart === 0.125 && c1.Voice_Transpose === 2 && c1.Voice_Detune === 7 &&
               c1.Voice_Envelope_Mode === 'A-S-R' && c1.Voice_Envelope_Attack === 0.01 &&
               c1.Voice_Envelope_Hold === 0 && Math.abs(c1.Voice_Envelope_Decay - 0.25 * 0.9 * 83.87 / 20) < 1e-9, 'chop 2: ' + JSON.stringify(c1));
        assert(Math.abs(c2.Voice_Gain - Math.pow(10, -3 / 20)) < 1e-9 && c2.Voice_Envelope_Hold === 60 &&
               c2.Voice_Envelope_Mode === 'A-H-D', 'chop 3: ' + JSON.stringify(c2));
        assert(c0.Voice_VelocityToVolume === 0, 'velocity reaches a slice\'s level');
        assert(S.auEditor === ed && !ed.pick, 'the kit did not leave SLICES up');
        /* the names: the project and the track (a Slicer's sample is the track's) — "My Song 5" */
        assert(cmds[0] === "cp '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples/Break Phenom 84 bpm.wav' '" + SAMP + "'",
               'the copy\'s name: ' + JSON.stringify(cmds));
        assert(kitPath === KIT && kit.name === 'My Song 5' && uri === 'ableton:/user-library/Samples/dAVEBOx/Exported%20kits/My%20Song%205.wav',
               'the kit\'s name: ' + JSON.stringify({ kitPath, name: kit.name, uri }));
    } finally {
        globalThis.host_system_cmd = cmd0; globalThis.host_write_file = wr0; globalThis.host_module_get_params = gp0; globalThis.__stubStat = null;
        delete GET['t4_au_sl_0_1'];
        leave(); ticks(2);
        S.actionPopupLines = []; S.actionPopupEndTick = 0;     /* the notice is a card over later screens */
    }
});

step('⭐⭐ Even (SLICES › Even): a TOOL — it writes that many even chops at once, from the count there is, the jog live on the pads; the visit is one undo step; Back or a click keeps the chops, no question (Josh, 2026-10-30: "click in editor closes the editor and saves the slices just like back. and get rid of the comfirmation for back")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 2);
    const ed = S.auEditor;
    const setP = globalThis.host_module_set_param;
    globalThis.host_module_set_param = (k, v) => {     /* the engine writes Even's chops, as the real one does: even 0, n N */
        setP(k, v);
        if (String(k) === 't4_au_set_even') { const e = parseInt(String(v).split(' ')[1], 10); GET['t4_au_info_0'] = INFO(1, e, 0); }
    };
    try {
        reset();
        click(); click();                             /* SLICES › Even */
        /* (the count it opens on is the chops there are — 8 here; a sample
         * just picked is cut 16 even by the engine, so it opens at 16 there —
         * Josh: "even 16.") */
        assert(ed.mode === 'chop' && ed.chop.kind === 'even' && sent('t4_au_set_even').join() === '16 8',
               'Even did not open its editor on the chops there are: ' + JSON.stringify(sent('t4_au_set_even')) + ' ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ed: ed.ed, same: S.auEditor === ed }));
        assert(sent('t4_au_undo_slc').length === 1, 'opening Even is not one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
        assert(A.auInfo(4, 16).even === 0 && A.auInfo(4, 16).n === 8, 'Even left a setting behind: ' + JSON.stringify(A.auInfo(4, 16)));
        let tx = globalThis.__texts(() => assert(inked(shown()), 'Even draws nothing'));
        assert(tx.indexOf('EVEN') >= 0 && tx.indexOf('8 CHOPS') >= 0 && tx.indexOf('DONE') >= 0 && tx.indexOf('MANUAL') < 0, 'Even screen: ' + JSON.stringify(tx));
        const litPads = () => { ticks(2); return Array.from({ length: 32 }, (_, i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0).filter((v) => v).length; };
        for (let k = 0; k < 7; k++) jog(1);
        assert(sent('t4_au_set_even').pop() === '16 15' && A.auInfo(4, 16).n === 15 && litPads() === 15,
               'Even 15 is not live on the pads: ' + JSON.stringify(sent('t4_au_set_even')) + ' lit ' + litPads());
        jog(1); jog(1); jog(1);
        assert(sent('t4_au_set_even').pop() === '16 18' && litPads() === 18, 'Even 18 is not live on the pads: lit ' + litPads());
        const countTx = globalThis.__texts(() => shown());     /* (asserted at the end) */
        assert(sent('t4_au_undo_slc').length === 1, 'each turn took an undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
        /* a pad plays its chop (Josh: "yes - and in manual") */
        note(C.TRACK_PAD_BASE + 3, 100);
        assert(A.auSelSlice(4) === 3, 'a pad in Even did not pick its chop');
        note(C.TRACK_PAD_BASE + 3, 0);
        const nEven = sent('t4_au_set_even').length;
        back();
        assert(!ed.ask, 'Back asked');
        /* the chops were written as the jog turned: Back keeps them, nothing
         * put back (Josh, 2026-11-02, R6: "Yes") */
        assert(ed.mode === 'wave' && A.auInfo(4, 16).even === 0 && A.auInfo(4, 16).n === 18 && A.auInfo(4, 16).hand === 18 &&
               sent('t4_au_set_even').length === nEven && !sent('t4_au_even_bake').length,
               'Back did not keep the 18 chops as written: ' + JSON.stringify(sentLike(/_au_/)));
        assert(!sent('t4_au_set_mode').length, 'choosing Even set the Mode');
        /* a click: the same, and no Manual */
        GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
        reset();
        click(); click(); jog(1);
        click();
        assert(!ed.ask && ed.mode === 'wave' && !ed.chop && sent('t4_au_set_even').join() === '16 8,16 9' && A.auInfo(4, 16).n === 9,
               'a click did not keep the chops and close Even: ' + JSON.stringify({ ask: ed.ask, mode: ed.mode, chop: ed.chop, sent: sentLike(/_au_/) }));
        assert(sent('t4_au_undo_slc').length === 1, 'the second visit is not its own undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
        /* one chop or none to start from (a cleared Manual): Even opens at 16 */
        GET['t4_au_info_0'] = INFO(1, 1, 0); kindSync(); ticks(2);
        reset();
        click(); click();
        assert(sent('t4_au_set_even').join() === '16 16', 'Even from one chop did not open at 16: ' + JSON.stringify(sent('t4_au_set_even')));
        back();
        /* the count read out while the jog turns: the chops written, 18 */
        assert(countTx.indexOf('COUNT 18') >= 0, 'the count is not read out while the jog turns: ' + JSON.stringify(countTx));
    } finally {
        globalThis.host_module_set_param = setP;
        leave();
        GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
    }
});

step('⭐⭐ Transient (SLICES › Transient): the REAL gesture — on, the jog turns Sens and writes the chops at it, the marks follow; the visit is one undo step; Back or a click keeps the chops, no question (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 2);
    const ed = S.auEditor;
    reset();
    click(); jog(1); click();                         /* SLICES › Transient */
    assert(ed.mode === 'chop' && ed.chop.kind === 'transient' && sent('t4_au_set_trans').join() === '16 1',
           'Transient did not open: ' + JSON.stringify(sentLike(/_au_/)));
    assert(sent('t4_au_undo_slc').length === 1, 'opening Transient is not one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
    let tx = globalThis.__texts(() => assert(inked(shown()), 'Transient draws nothing'));
    assert(tx.indexOf('TRANSIENT') >= 0 && tx.some((x) => / CHOPS$/.test(x)), 'Transient screen: ' + JSON.stringify(tx));
    jog(3);
    assert(sent('t4_au_set_sens').pop() === '16 53', 'the jog is not Sens: ' + JSON.stringify(sent('t4_au_set_sens')));
    assert(sent('t4_au_set_trans').length === 2 && sent('t4_au_set_trans').every((v) => v === '16 1'),
           'each Sens did not write the chops again: ' + JSON.stringify(sent('t4_au_set_trans')));
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SENS 53') >= 0, 'Sens is not read out while the jog turns: ' + JSON.stringify(tx));
    /* the engine answers with its chops at that Sens: the screen follows */
    const before = shown();
    GET['t4_au_marks_0'] = '0 20000 20000 45000 45000 70000 70000 96000';
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 53, 0);
    ticks(3);
    assert(A.auMarks(4, 16).length === 4, 'the marks were not re-read: ' + A.auMarks(4, 16).length);
    tx = globalThis.__texts(() => assert(!same(shown(), before), 'the marks on screen did not change'));
    assert(tx.indexOf('4 CHOPS') >= 0, 'the count: ' + JSON.stringify(tx));
    /* more than 128 hits: the first 128 (Josh: "keep the first 128") */
    GET['t4_au_info_0'] = INFO24(1, 128, 0, 211, 53, 0); kindSync(); ticks(3);
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('128+ CHOPS') >= 0, 'over the cap: ' + JSON.stringify(tx));
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 53, 0); kindSync(); ticks(3);
    assert(globalThis.__ring().map((c) => (c ? 1 : 0)).join('') === '01011110', 'Transient rings: ' + globalThis.__ring().map((c) => (c ? 1 : 0)).join(''));
    reset();
    back();
    /* what it wrote stays — nothing baked, nothing put back (Josh, 2026-11-02, R6: "Yes") */
    assert(!ed.ask && ed.mode === 'wave' && S.auEditor === ed && !sentLike(/_au_(trans_bake|set_trans|set_even)$/).length && A.auInfo(4, 16).n === 4,
           'Back did not keep the chops, without asking: ' + JSON.stringify(sentLike(/_au_/)));
    /* a click: the same */
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    reset();
    click(); jog(1); click();
    const nTrans = sent('t4_au_set_trans').length;
    click();
    assert(!ed.ask && ed.mode === 'wave' && !ed.chop && sent('t4_au_set_trans').length === nTrans && !sent('t4_au_trans_bake').length,
           'a click did not keep the chops and close Transient: ' + JSON.stringify(sentLike(/_au_/)));
    back();
    assert(!S.auEditor, 'WAVE did not close');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ an Audio clip\'s SAMPLE menu: Trim and Normalize ask Overwrite or New (New first), Back changes nothing; Trim with nothing to cut says so (Josh, 2026-10-30: "trim and normalize options" · "dialog: overwrite or new sample" · "new copy is default")', () => {
    /* an Audio clip that plays part of its file: Start 24000 for 96 ticks */
    const part = INFO24(0, 4, 0, 4, 50, 0).replace(' 16 0 96000 ', ' 16 24000 58286 ').replace(/ 0\|/, ' 96|');
    GET['t4_au_info_0'] = part; kindSync(); ticks(2);
    assert(A.auTrimCuts(4, 0), 'the fixture leaves nothing to cut');
    mapPad(2, 3);
    const ed = S.auEditor;
    const menu = (row) => { click(); ticks(1); for (let i = 0; i < row; i++) jog(1); click(); ticks(1); };
    /* Trim › the question, on New */
    reset();
    menu(1);
    assert(ed.ask && ed.ask.kind === 'edit' && ed.ask.op === 'trim' && ed.ask.sel === 0, 'Trim did not ask, on New: ' + JSON.stringify(ed.ask));
    {
        const lines = ['Cut the file to', 'what the clip plays.'];
        const asked = frame(() => D.drawAudioAsk('TRIM', lines, 0, ['Overwrite', 'New']));
        assert(same(shown(), asked), 'the Trim question is not on screen');
        assert(!same(asked, frame(() => D.drawAudioAsk('TRIM', lines, 0))), 'control: the buttons do not read Overwrite / New');
    }
    let tx;
    S.undoAvailable = false;
    click(); ticks(1);
    assert(!ed.ask && sent('t4_au_edit').join() === '0 0 0', 'New did not trim into a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    assert(S.undoAvailable, 'Trim New is not an undo step');
    /* Undo: the clip's info is read again at once (its sample came back) */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(1);
    assert(A.auInfo(4, 0).rstart !== 24000, 'setup: the mirror already reads the restored clip');
    GET['t4_au_info_0'] = part; GET['last_restore'] = 'm 4 0';
    S.pendingUndoSync = 1; S.tickCount = 1001; ticks(1);
    assert(A.auInfo(4, 0).state === 2 && A.auInfo(4, 0).rstart === 24000, 'the undo did not re-read the Audio clip: ' + JSON.stringify(A.auInfo(4, 0)));
    delete GET['last_restore'];
    kindSync(); ticks(2);
    /* Trim › Overwrite: no undo step (it cannot be undone) */
    reset();
    S.undoAvailable = false;
    menu(1); jog(-1); click(); ticks(1);
    assert(sent('t4_au_edit').join() === '0 0 1', 'Overwrite did not trim the file: ' + JSON.stringify(sent('t4_au_edit')));
    assert(!S.undoAvailable, 'Overwrite offered an Undo it cannot do');
    GET['t4_au_info_0'] = part; kindSync(); ticks(2);
    /* None (the chooser's): an undo step */
    S.undoAvailable = false;
    A.auClear(4, 0);
    assert(S.undoAvailable, 'None is not an undo step');
    GET['t4_au_info_0'] = part; kindSync(); ticks(2);
    /* Normalize › Back: nothing */
    reset();
    menu(2);
    tx = globalThis.__texts(() => shown());
    assert(ed.ask && ed.ask.op === 'norm' && tx.indexOf('NORMALIZE') >= 0, 'Normalize did not ask: ' + JSON.stringify(tx));
    back(); ticks(1);
    assert(!ed.ask && !sent('t4_au_edit').length && S.auEditor === ed, 'Back did something: ' + JSON.stringify(sent('t4_au_edit')));
    /* Normalize › New */
    menu(2); click(); ticks(1);
    assert(sent('t4_au_edit').join() === '0 1 0', 'Normalize did not make a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    /* the whole file already: Trim says so and asks nothing */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    assert(!A.auTrimCuts(4, 0), 'a clip on the whole file has something to cut');
    reset();
    menu(1);
    assert(!ed.ask && !sent('t4_au_edit').length, 'Trim with nothing to cut asked or sent');
    back(); ticks(2);
    S.actionPopupEndTick = 0;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ a Slicer\'s SAMPLE › Trim is its own screen, before chopping: K1 / K3 the handles a pixel a detent, a click asks New / Overwrite and cuts to them (the chops start again), Back leaves it; nothing to cut says so; Normalize asks as on Audio (Josh, 2026-11-02: "Trim is a destructive operation so it has to be something you do pre chop" · "Yeah")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.c === 16, 'SAMPLE did not open on the Slicer\'s sample');
    const menu = (row) => { click(); ticks(1); for (let i = 0; i < row; i++) jog(1); click(); ticks(1); };
    reset();
    menu(1);                                         /* Trim */
    assert(ed.mode === 'trim' && !ed.ask && JSON.stringify(ed.trim) === '[0,96000]' && !sent('t4_au_edit').length,
           'Trim did not open its screen on the whole file: ' + JSON.stringify({ mode: ed.mode, trim: ed.trim, ask: ed.ask }));
    let tx = globalThis.__texts(() => assert(inked(shown()), 'the Trim screen draws nothing'));
    assert(tx.indexOf('TRIM') >= 0 && tx.indexOf('S 0.00S') >= 0 && tx.indexOf('E 2.00S') >= 0, 'the Trim screen: ' + JSON.stringify(tx));
    /* nothing cut yet: a click says so, asks nothing */
    click(); ticks(1);
    assert(!ed.ask && ed.mode === 'trim' && !sent('t4_au_edit').length, 'Trim with nothing to cut asked or sent');
    S.actionPopupEndTick = 0;
    cc(71, 1);                                       /* K1: the start, a pixel (750 frames) */
    S.knobAccelLast[2] = 0; cc(73, 127);             /* K3: the end, a pixel back */
    assert(JSON.stringify(ed.trim) === '[750,95250]', 'the handles: ' + JSON.stringify(ed.trim));
    assert(!sentLike(/_au_(set_start|set_end|slice_start|slice_end)$/).length, 'a handle wrote to the engine: ' + JSON.stringify(sentLike(/_au_/)));
    /* Back: the handles go, nothing cut */
    back(); ticks(1);
    assert(ed.mode === 'wave' && !ed.trim && !sent('t4_au_edit').length && S.auEditor === ed, 'Back from Trim cut something or left SAMPLE');
    menu(1); cc(71, 1);
    S.undoAvailable = false;
    click(); ticks(1);
    assert(ed.ask && ed.ask.op === 'trim' && ed.ask.sel === 0, 'a click did not ask, on New: ' + JSON.stringify(ed.ask));
    {
        /* 8 hand-set chops: the question says they go */
        const lines = ['Cut to the handles.', 'Chops: 16 even again.'];
        assert(same(shown(), frame(() => D.drawAudioAsk('TRIM', lines, 0, ['Overwrite', 'New']))), 'the Trim question is not on screen');
    }
    click(); ticks(1);
    assert(!ed.ask && sent('t4_au_edit').join() === '16 0 0 750 96000' && ed.mode === 'wave' && S.undoAvailable,
           'New did not cut to the handles into a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    /* Overwrite: no undo step */
    reset(); S.undoAvailable = false;
    menu(1); S.knobAccelLast[2] = 0; cc(73, 127); click(); ticks(1); jog(-1); click(); ticks(1);
    assert(sent('t4_au_edit').join() === '16 0 1 0 95250' && !S.undoAvailable, 'Overwrite: ' + JSON.stringify(sent('t4_au_edit')));
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    /* Normalize › New */
    reset();
    menu(2);
    tx = globalThis.__texts(() => shown());
    assert(ed.ask && ed.ask.op === 'norm' && tx.indexOf('NORMALIZE') >= 0, 'Normalize did not ask: ' + JSON.stringify(tx));
    click(); ticks(1);
    assert(sent('t4_au_edit').join() === '16 1 0', 'Normalize did not make a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    leave(); ticks(2);
    S.actionPopupEndTick = 0;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ Tempo\'s menu: touch Tempo + click on SAMPLE, either page, offers Fit to clip (an Audio clip\'s) and Original tempo (Josh, 2026-11-02: "fit to clip" · "(once)" · "both on a small pop-up menu that shows when you touch click tempo" · "menu should be "Fit to clip" "Original tempo""); Fit sets the sample\'s Tempo once so Start to its end fills the clip, one undo step, out of range said', () => {
    /* an Audio clip, 2 s of 48 kHz at 84 BPM; the clip 1 bar from step 0 */
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0); kindSync(); ticks(2);
    const len0 = S.clipLength[4][0], tps0 = S.clipTPS[4][0], ls0 = S.clipLoopStart[4][0];
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    mapPad(2, 3);
    const ed = S.auEditor;
    const say = () => globalThis.__texts(() => shown()).join(' ');
    assert(!E.auPickRows({ pick: { level: 1 }, t: 4, c: 0 }).some((r) => /fit|orig/i.test(r.label)), 'SAMPLE\'s menu still has Fit / Orig');
    /* page 1: touching Tempo (K7) says a click opens it */
    note(6, 127); ticks(1);
    assert(/TEMPO/i.test(say().split('BREAK')[0] + ' ' + say().slice(-40)), 'touching Tempo does not offer its menu: ' + say());
    click(); ticks(1);
    note(6, 0); ticks(1);
    assert(ed.pick && ed.pick.tempo && E.auPickRows(ed).map((r) => r.label).join() === 'Fit to clip,Original tempo',
           'touch Tempo + click: ' + JSON.stringify(ed.pick) + ' ' + E.auPickRows(ed).map((r) => r.label));
    assert(/TEMPO/.test(say()) && inked(shown()), 'the menu is not on screen: ' + say());   /* its rows are drawKitList's (auPickRows, above) */
    /* Fit to clip: 1 bar in 2 s = 120 BPM */
    reset(); S.undoAvailable = false;
    click(); ticks(1);
    assert(sent('t4_au_set_bpm').join() === '0 1200', 'the Tempo: ' + JSON.stringify(sent('t4_au_set_bpm')));
    assert(sent('t4_au_undo').join() === '0' && S.undoAvailable, 'not an undo step: ' + JSON.stringify(sent('t4_au_undo')));
    const ord = sets.map((x) => x[0]).concat(S.pendingDefaultSetParams.map((e) => e.key));
    assert(ord.indexOf('t4_au_undo') < ord.indexOf('t4_au_set_bpm'), 'the Tempo went before the undo step: ' + ord.join());
    assert((S.actionPopupLines || []).join(' ') === 'FIT TO CLIP 120 BPM', 'notice: ' + JSON.stringify(S.actionPopupLines));
    assert(!ed.pick && S.auEditor === ed, 'the menu stayed open');
    assert(S.clipLength[4][0] === 16 && !sent('t4_c0_length').length, 'the clip\'s length moved');
    /* a plain click still opens SAMPLE's menu */
    click(); ticks(1);
    assert(ed.pick && !ed.pick.tempo && ed.pick.level === 1, 'a plain click no longer opens SAMPLE\'s menu');
    back(); ticks(1);
    /* page 2: Tempo on K5; Original tempo; a loop starting at bar 2 fits at 240 */
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0); kindSync(); ticks(2);
    jog(1); ticks(1);
    assert(ed.page === 1, 'setup: not on page 2');
    note(4, 127); ticks(1);
    assert(/TEMPO/i.test(say()), 'page 2: touching Tempo does not offer its menu: ' + say());
    click(); note(4, 0); ticks(1);
    assert(ed.pick && ed.pick.tempo, 'page 2: touch K5 + click did not open Tempo\'s menu');
    reset();
    jog(1); click(); ticks(1);
    assert(sent('t4_au_set_orig').join() === '0 0' && !sent('t4_au_set_bpm').length, 'Original tempo: ' + JSON.stringify(sentLike(/_au_/)));
    assert(/ORIGINAL TEMPO/.test((S.actionPopupLines || []).join(' ')), 'notice: ' + JSON.stringify(S.actionPopupLines));
    assert(!ed.pick, 'the menu stayed open');
    S.clipLoopStart[4][0] = 16;
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0); kindSync(); ticks(2);
    reset();
    touchClick(4); ticks(1); click(); ticks(1);
    assert(sent('t4_au_set_bpm').join() === '0 2400', 'page 2, a loop starting at bar 2: ' + JSON.stringify(sent('t4_au_set_bpm')));
    /* Back closes the menu, nothing set */
    reset();
    touchClick(4); ticks(1); back(); ticks(1);
    assert(!ed.pick && S.auEditor === ed && !sentLike(/_au_set_/).length, 'Back did something: ' + JSON.stringify(sentLike(/_au_/)));
    jog(-1); ticks(1);
    S.clipLoopStart[4][0] = 0;
    /* a Start a few frames from the end: past 999.9 BPM, nothing set */
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0).replace(' 16 0 96000 ', ' 16 95990 96000 '); kindSync(); ticks(2);
    reset(); S.undoAvailable = false;
    touchClick(6); ticks(1); click(); ticks(1);
    assert(!sent('t4_au_set_bpm').length && !sent('t4_au_undo').length && !S.undoAvailable, 'out of range set something');
    assert((S.actionPopupLines || []).join(' ') === 'FIT TO CLIP Out of range', 'notice: ' + JSON.stringify(S.actionPopupLines));
    /* a Slicer: Original tempo only (its clips are sequences: nothing to fit) */
    back(); ticks(2);
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    const sed = S.auEditor;
    touchClick(6); ticks(1);
    assert(sed && sed.pick && sed.pick.tempo && E.auPickRows(sed).map((r) => r.id).join() === 'orig', 'a Slicer\'s Tempo menu: ' + (sed && E.auPickRows(sed).map((r) => r.id)));
    reset();
    click(); ticks(1);
    assert(sent('t4_au_set_orig').join() === '16 0', 'a Slicer\'s Original tempo: ' + JSON.stringify(sentLike(/_au_/)));
    leave(); ticks(2);
    S.actionPopupEndTick = 0;
    S.clipLength[4][0] = len0; S.clipTPS[4][0] = tps0; S.clipLoopStart[4][0] = ls0;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ Load sample: the chooser opens over WAVE, auditions, a click picks and lands back on WAVE', () => {
    mapPad(2, 3);
    reset(); PREVIEWS.length = 0;
    click(); click();                                /* SAMPLE's menu › Load sample */
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
    S.undoAvailable = false; S.redoAvailable = true;
    click();
    assert(!S.auChooser && S.auEditor && S.auEditor.mode === 'wave', 'the chooser did not close back onto WAVE');
    /* a Slicer's sample is the track's: the pick names its slot, 16 */
    assert(sent('t4_au_pick').join() === '16|/data/CoreLibrary/Samples/Loops/Break.wav', 'pick: ' + sent('t4_au_pick'));
    assert(S.undoAvailable && !S.redoAvailable, 'a pick is not an undo step');
    os.__setReaddir(null); globalThis.__stubStat = null;
    back();
    GET['t4_au_info_0'] = INFO(1, 8);
    kindSync(); ticks(2);
});

step('⭐⭐ WAVE with no sample: the click corners, CLICK TO LOAD SAMPLE; a click opens the chooser', () => {
    GET['t4_au_info_0'] = '0 0 1 8 1 16 0 0 0 0 0 0 0 0 0 0 8|';
    kindSync(); ticks(2);
    mapPad(2, 3);
    assert(E.auWaveSub(S.auEditor) === 'empty', 'not the empty view: ' + E.auWaveSub(S.auEditor));
    assert(inked(shown()), 'the empty view draws nothing');
    click(); ticks(2);
    assert(S.auChooser && S.auChooser.t === 4, 'a click did not open the chooser');
    back(); ticks(2);
    back();
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐⭐ SAMPLE on an Audio clip: K1 Start · K2 Zoom · K3 End · K4 Gain · K5 Pitch; no chops, no cursor', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
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
    kindSync(); ticks(2);
    S.auEditor.pick = { level: 1, sel: 0 };
    /* no Chop sample on an Audio clip's menu: chops are a Slicer's, and an
     * Audio clip reaches one by copy and paste (Josh, 2026-11-02) */
    assert(E.auPickRows(S.auEditor).map((r) => r.id).join() === 'load,trim,norm', 'Audio\'s menu: ' + E.auPickRows(S.auEditor).map((r) => r.id));
    S.auEditor.pick = null;
    cc(HC.MoveDelete, 127); note(C.TRACK_PAD_BASE + 3, 100); note(C.TRACK_PAD_BASE + 3, 0); cc(HC.MoveDelete, 0);
    assert(!sent('t4_au_mark_del').length, 'Delete + pad in Loop removed a chop: ' + JSON.stringify(sent('t4_au_mark_del')));
    assert(!sent('t4_au_set_mode').length, 'editing chops changed the Mode');
    back();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ an Audio clip\'s SAMPLE menu has no Chop sample: Load sample · Trim · Normalize, and nothing turns it into a Slicer — an Audio clip reaches one by copy and paste (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\""; the Chop sample of 2026-10-30 went with Mode)', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    mapPad(2, 3);
    const ed = S.auEditor;
    assert(ed && ed.ed === 'sample' && E.auWaveSub(ed) === 'loop', 'not SAMPLE on an Audio clip');
    reset();
    click();
    const rows = E.auPickRows(ed);
    assert(ed.pick && ed.pick.level === 1 && rows.map((r) => r.id).join() === 'load,trim,norm' && !rows.some((r) => /chop/i.test(r.label)),
           'the menu: ' + JSON.stringify(rows));
    const tx = globalThis.__texts(() => assert(inked(shown()), 'the menu draws nothing'));
    assert(!tx.some((x) => /CHOP/.test(x)), 'Chop sample is on screen: ' + JSON.stringify(tx));
    jog(1); jog(1); jog(1);                         /* past the last row: Normalize stays */
    assert(ed.pick.sel === 2, 'the menu has a row past Normalize: ' + ed.pick.sel);
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the menu onto SAMPLE');
    assert(!sentLike(/_au_(set_mode|set_even|set_trans|lazy|manual|undo_slc)$/).length && S.trackPadMode[4] === C.PAD_MODE_AUDIO,
           'the menu chopped or changed the track: ' + JSON.stringify(sentLike(/_au_/)));
    back(); ticks(2);
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; S.auSrc[4] = 'sample'; kindSync(); ticks(20);
});

step('⭐⭐ Lazy (SLICES › Lazy): the next pad white, taps cut; Back ends it keeping them, no question, and stays on WAVE; played out, the same', () => {
    mapPad(2, 2);
    reset();
    click(); jog(1); jog(1); click();                 /* SLICES › Lazy */
    ticks(1);
    assert(S.auEditor && S.auEditor.mode === 'lazy' && sent('t4_au_lazy').join() === '16 1', 'Lazy did not arm: ' + JSON.stringify(sent('t4_au_lazy')));
    assert(sent('t4_au_undo_slc').length === 1, 'Lazy is not one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
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
    assert(sent('t4_au_lazy').pop() === '16 0' && !S.auEditor.ask && sent('t4_au_lazy_keep').join() === '1' && S.auEditor.mode === 'wave',
           'Back did not end Lazy keeping its chops, without asking: ' + JSON.stringify(sentLike(/_au_lazy/)));
    GET['t4_au_lazy'] = '0 0 0'; ticks(4);
    /* played out to its end: kept, no question */
    reset();
    click(); jog(1); jog(1); click();
    GET['t4_au_lazy'] = '1 0 0'; ticks(4);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    GET['t4_au_lazy'] = '2 1 4000'; ticks(4);
    GET['t4_au_lazy'] = '3 1 4000'; ticks(4);
    assert(!S.auEditor.ask && sent('t4_au_lazy_keep').join() === '1' && S.auEditor.mode === 'wave',
           'played out, Lazy did not keep its chops without asking: ' + JSON.stringify(sentLike(/_au_lazy/)));
    GET['t4_au_lazy'] = '0 0 0';
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ a click in Lazy ends it keeping what was tapped (armed: nothing to keep), and never opens Manual (Josh, 2026-10-30: "get rid of click to insert a [slice] outside of manual mode")', () => {
    /* Lazy, running: ends, keeps what was tapped */
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 2); reset();
    click(); jog(1); jog(1); click();                 /* SLICES › Lazy */
    GET['t4_au_lazy'] = '1 0 0'; ticks(4);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    GET['t4_au_lazy'] = '2 1 4000'; ticks(4);
    click();
    assert(sent('t4_au_lazy').pop() === '16 0' && sent('t4_au_lazy_keep').join() === '1',
           'Lazy (running): the click did not end and keep: ' + JSON.stringify(sentLike(/_au_lazy/)));
    assert(S.auEditor.mode === 'wave' && !S.auEditor.chop && !S.auEditor.ask, 'Lazy (running): the click did not land on SLICES');
    GET['t4_au_lazy'] = '0 0 0';
    /* Lazy, armed with no tap: nothing to keep */
    reset();
    click(); jog(1); jog(1); click();
    GET['t4_au_lazy'] = '1 0 0'; ticks(4);
    click();
    assert(sent('t4_au_lazy').pop() === '16 0' && !sent('t4_au_lazy_keep').length && S.auEditor.mode === 'wave' && !S.auEditor.chop,
           'Lazy (armed): ' + JSON.stringify(sentLike(/_au_lazy/)));
    GET['t4_au_lazy'] = '0 0 0';
    back();
    assert(!S.auEditor, 'could not leave');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ PAD MODE is a Slicer\'s alone: an Audio track\'s IN column has none (Josh: "loop mode should always be 4 rows and has no need for the pad bank")', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    let map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(!map[0].cells.some((c) => c && c.name === 'PAD MODE'), 'an Audio track shows PAD MODE: ' + JSON.stringify(map[0].cells));
    S.auLayout[4] = 1;
    assert(!A.auLayoutOn(4), 'a saved 16 Pads layout still applies to an Audio track');
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    assert(A.auLayoutOn(4), 'the 16 Pads layout does not apply to a Slicer');
    S.auLayout[4] = 0;
    map = P.bankPadMapForMode(C.PAD_MODE_SLICER, 4);
    assert(map[0].cells.some((c) => c && c.name === 'PAD MODE'), 'a Slicer lost PAD MODE');
    ticks(20);
});

step('⭐⭐ SLICES zoomed out is SAMPLE\'s window — on a Slicer the whole sample (no Start or Length: what plays is its chops); the Manual cursor stays inside (Josh, 2026-10-30: "sample\'s start and length should set the zone limits for viewing and chopping the waveform in slice" · 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 50, 0);
    GET['t4_au_marks_0'] = '0 24000 24000 48000 48000 72000 72000 96000';
    kindSync(); ticks(2);
    mapPad(2, 3); ticks(2); shown();
    const sa = [S.auEditor.A, S.auEditor.B];
    /* (SAMPLE's end is the sample's length in whole ticks at its Tempo: within a tick of the file's end) */
    const tick = A.auFpt(A.auInfo(4, 16));
    assert(S.auEditor.full && sa[0] === 0 && Math.abs(sa[1] - 96000) <= tick, 'SAMPLE zoomed out is not the whole sample: ' + sa.join('..'));
    back(); ticks(2);
    mapPad(2, 2); ticks(2); shown();
    const ed = S.auEditor;
    assert(ed.ed === 'slices' && ed.full && ed.A === sa[0] && Math.abs(ed.B - sa[1]) <= tick,
           'SLICES and SAMPLE differ: ' + ed.A + '..' + ed.B + ' vs ' + sa.join('..'));
    /* Manual: the cursor cannot leave the sample */
    click(); jog(1); jog(1); jog(1); click();
    assert(ed.chop && ed.chop.kind === 'manual', 'Manual did not open');
    for (let i = 0; i < 300; i++) jog(-1);
    assert(ed.cur >= 0, 'the cursor left the sample: ' + ed.cur);
    for (let i = 0; i < 300; i++) jog(1);
    assert(ed.cur < 96000, 'the cursor left the sample: ' + ed.cur);
    back(); ticks(2);
    if (S.auEditor && S.auEditor.ask) { jog(-1); click(); }
    while (S.auEditor) { back(); ticks(1); }
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ the sequence works with SAMPLE or SLICES up, as under any instrument editor: a step tap, Record, hold a step + jog for its page (Josh, 2026-10-30: "note sequencing via step and record should work in sample and slice just like any other mode ... as should step editing via jog turn")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
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

step('⭐⭐ an Audio clip\'s Shift turns its waveform: zoomed out, SAMPLE and the Track View strip show the audio rotated inside the clip, the beats still (Josh, 2026-10-30: "make the waveform rotate. feature isn\'t done until it is")', () => {
    const base = INFO24(0, 8, 0, 8, 50, 0);                   /* Loop, 84 BPM, Shift 0 */
    const withRot = (r) => base.replace(/ 0\|/, ' 0 ' + r + '|');   /* ...slen 0, then the Shift */
    const ac = S.trackActiveClip[4] | 0;
    S.clipLength[4][ac] = 16; S.clipTPS[4][ac] = 24;
    const wasPos = GET['t4_au_pos'];
    GET['t4_au_pos'] = '0 0 -1';                              /* no playhead in the way */
    GET['t4_au_info_0'] = withRot(0); kindSync(); ticks(4);
    assert(A.auInfo(4, 0).rot === 0, 'the fixture: ' + A.auInfo(4, 0).rot);
    mapPad(2, 3); ticks(4);
    assert(S.auEditor && S.auEditor.full, 'SAMPLE is not zoomed out');
    const rows = (f, y0, y1) => (x) => { let v = ''; for (let y = y0; y <= y1; y++) v += f[y * 128 + x] ? 1 : 0; return v; };
    const f0 = shown();
    GET['t4_au_info_0'] = withRot(96); kindSync(); ticks(4);   /* a quarter of 384 ticks */
    assert(A.auInfo(4, 0).rot === 96, 'the Shift was not read: ' + A.auInfo(4, 0).rot);
    const f1 = shown();
    const a = rows(f0, 20, 49), b = rows(f1, 20, 49);
    let moved = 0, same = 0;
    for (let x = 0; x < 128; x++) { if (b(x) === a((x - 32 + 128) % 128)) moved++; if (b(x) === a(x)) same++; }
    assert(moved >= 124, 'the waveform did not turn a quarter of the screen: ' + moved + '/128 columns match');
    assert(same < 100, 'control: the waveform looks the same unturned (' + same + '/128): the fixture cannot show a turn');
    /* the beats stay where the clip's beats are */
    const ta = rows(f0, 51, 53), tb = rows(f1, 51, 53);
    let beats = 0; for (let x = 0; x < 128; x++) if (ta(x) === tb(x)) beats++;
    assert(beats === 128, 'the beat ticks moved with the audio');
    /* zoomed in across the Shift's point the view is two windows of the
     * sample: both stay read — the screen settles, no read every tick */
    {
        /* an 8-step clip (both pieces inside the file), the view across its split */
        S.clipLength[4][ac] = 8; kindSync(); ticks(2);
        const ed = S.auEditor, P = A.auInfo(4, 0).rstart + 96 * A.auFpt(A.auInfo(4, 0));
        ed.full = false; ed.A = Math.round(P - 5000); ed.B = Math.round(P + 5000);
        shown();
        assert(!ed.full && ed.A < P && ed.B > P, 'the zoomed view does not cross the Shift\'s point: ' + ed.A + '..' + ed.B + ' / ' + P);
        const get = globalThis.host_module_get_param;
        let reads = 0;
        globalThis.host_module_get_param = (k) => { if (/_au_wave_/.test(String(k))) reads++; return get(k); };
        try {
            for (let n = 0; n < 6; n++) { shown(); ticks(1); }       /* settle */
            reads = 0;
            for (let n = 0; n < 10; n++) { shown(); ticks(1); }
        } finally { globalThis.host_module_get_param = get; }
        assert(reads === 0, 'the two pieces keep being re-read: ' + reads + ' reads in 10 ticks');
        S.clipLength[4][ac] = 16;
    }
    back(); ticks(2);
    /* the Track View strip turns too */
    GET['t4_au_info_0'] = withRot(0); kindSync(); ticks(4);
    S.activeBank = 0; S.bankCardLatched = false;
    const g0 = shown();
    GET['t4_au_info_0'] = withRot(96); kindSync(); ticks(4);
    const g1 = shown();
    const sa = rows(g0, 49, 54), sb = rows(g1, 49, 54);
    let smoved = 0, ssame = 0;
    for (let x = 4; x < 124; x++) { if (sb(x) === sa(4 + ((x - 4 - 30 + 120) % 120))) smoved++; if (sb(x) === sa(x)) ssame++; }
    assert(smoved >= 116 && ssame < 110, 'the Track View strip did not turn: ' + smoved + ' moved, ' + ssame + ' same of 120');
    GET['t4_au_pos'] = wasPos;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ a Slicer: pads are 36 + chop in time order, 8 a row, none past the count; the CLIP bank is a MIDI clip\'s (no Mode, no Legato, >Seq on K8)', () => {
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
    /* a Slicer's clip is a sequence like a MIDI clip's: its CLIP bank, Res
     * back on K1 and no Mode (Josh, 2026-11-02: "two instruments \"audio\"
     * and \"slicer\""), Legato left out (a step holds one chop), >Seq where
     * Import was */
    assert(kc.cells.map((c) => c && c.label).join() === 'Res,Strch,Shift,,InQnt,Crop,Dir,>Seq',
           'the Slicer CLIP bank: ' + kc.cells.map((c) => c && c.label));
    reset();
    for (let i = 0; i < 30 && !sentLike(/resolution/).length; i++) cc(71, 1);   /* K1 = Res */
    assert(sentLike(/resolution/).length >= 1 && !sentLike(/_au_set_mode$/).length, 'K1 is not Res: ' + JSON.stringify(sets));
    for (let i = 0; i < 30 && sentLike(/resolution/).length < 2; i++) cc(71, 127);
    /* ...and its touch + click alt is Zoom, on Res's own bit */
    note(0, 127); click(); note(0, 0);
    assert(S.knobAlt === 1 && A.auAltBit(4, 0, 0) === 0, 'touch K1 + click did not flip Res\'s alt: ' + S.knobAlt);
    note(0, 127); click(); note(0, 0);
    assert(S.knobAlt === 0, 'the second click did not flip it back');
    reset();
    for (let i = 0; i < 12; i++) { cc(74, 1); cc(78, 1); }   /* K4 blank (no Legato); K8 >Seq, a trigger: a turn does nothing */
    assert(sets.length === 0 && S.pendingDefaultSetParams.length === 0, 'K4 / K8 wrote ' + JSON.stringify(sets));
    /* a touched knob's hint is the Slicer bank's own, never the melodic CLIP's
     * Legato / Import (found on the device: K4 read CLK LEGATO) */
    const hint = (k) => { S.knobTouched = k; const h = render.bankPageHints(0); S.knobTouched = -1; return JSON.stringify(h); };
    assert(hint(3).indexOf('LEGATO') < 0 && hint(5) === '[["CLK","CROP"]]' && hint(7) === '[["CLK",">SEQ"]]' &&
           hint(4).indexOf('CROP') < 0 && hint(7).indexOf('IMPORT') < 0,
           'Slicer CLIP hints: K4 ' + hint(3) + ' K5 ' + hint(4) + ' K6 ' + hint(5) + ' K8 ' + hint(7));
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

step('⭐ a held step\'s K1 stops at the clip\'s last chop (review: it ran on to chop 128, which plays nothing)', () => {
    const n = A.auInfo(4, A.auClipOf(4)).n;          /* the Slicer's chops */
    assert(A.isSlicerTrack(4) && n > 1 && n < 128, 'setup: chops ' + n);
    S.heldStep = 0; S.heldStepNotes = [A.AU_NOTE_BASE + n - 2]; S.activeBank = C.BANK_STEP; S.heldStepBtn = 16;
    reset();
    for (let i = 0; i < 60; i++) cc(71, 1);
    assert(S.heldStepNotes[0] === A.AU_NOTE_BASE + n - 1, 'K1 went past the last chop: ' + S.heldStepNotes + ' (chops ' + n + ')');
    S.heldStep = -1; S.heldStepNotes = []; S.heldStepBtn = -1; S.activeBank = 0;
});

step('⭐ the step editor\'s K1 reads "Slice n"; K2 and K4 (Vel) are blank', () => {
    S.heldStep = 0; S.heldStepNotes = [2]; S.activeBank = C.BANK_STEP;
    const cells = render.heldStepCells();
    assert(cells[0].label === 'Slice' && cells[0].bigText === 'Slice 3', 'K1: ' + JSON.stringify(cells[0]));
    /* ...and the page as drawn: the merged box over K1 / K2 says the chop, not
     * a note name (found on the device: "D-2" for chop 3) */
    S.heldStepBtn = -1; S.stepWasEmpty = false;
    const tx = globalThis.__texts(() => frame(() => render.drawHeldStepPage()));
    assert(tx.indexOf('3') >= 0 && !tx.some((x) => /^D-?2/.test(x)), 'the step page names a note: ' + JSON.stringify(tx));
    /* K2 blank (no octave), K4 blank: a Slicer plays every chop at one level
     * (Josh, 2026-11-02: "no velocity modulation") */
    assert(cells[1].kind === 'blank' && !cells[1].label && cells[3].kind === 'blank' && !cells[3].label,
           'K2 / K4: ' + JSON.stringify([cells[1], cells[3]]));
    S.heldStepBtn = 16; reset();
    for (let i = 0; i < 20; i++) { cc(72, 1); cc(74, 1); }
    assert(!sentLike(/_vel$|_step_0_vel|_set_notes$/).length, 'K2 / K4 wrote on a Slicer\'s step: ' + JSON.stringify(sets));
    S.heldStepBtn = -1;
    S.heldStep = -1; S.heldStepNotes = []; S.activeBank = 0;
});

step('⭐⭐ an Audio track: no sequence — pad taps and steps do nothing, no STEP / NOTE FX; the CLIP bank is Strch and Shift, no Mode (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\""), the sound on SAMPLE', () => {
    S.activeBank = 1;                                  /* on NOTE FX when the track becomes Audio */
    GET['t4_au_info_0'] = INFO(0, 8);
    kindSync(); ticks(4);
    assert(S.activeBank === 0, 'still on NOTE FX on an Audio track: bank ' + S.activeBank);
    /* Josh, 2026-10-28: "we don't need to show notes at all in loop mode" */
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    /* no PAD MODE on an Audio track (Josh, 2026-10-30: "loop mode should always be 4 rows and has no need for the pad bank") */
    assert(JSON.stringify(walk) === JSON.stringify([5, C.BANK_MACROS, 0, C.BANK_SOUND]), 'Loop walk: ' + walk.join());
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    assert(!map[2].cells[0] && !map[3].cells[0] && map[2].cells[1], 'the Loop map still has STEP / NOTE FX');
    DM.computePadNoteMap();
    assert(S.padNoteMap.every((v) => v === 0xFF), 'an Audio clip\'s pads play');
    reset();
    S.bankCardLatched = false;
    note(C.TRACK_PAD_BASE + 3, 100); note(C.TRACK_PAD_BASE + 3, 0);
    assert(sentLike(/_au_/).length === 0, 'a Loop pad tap wrote: ' + JSON.stringify(sentLike(/_au_/)));
    note(16, 100); note(16, 0);
    ticks(2);
    assert(sentLike(/_step_/).length === 0, 'a step press edited an Audio clip: ' + JSON.stringify(sentLike(/_step_/)));
    const cells = A.auLoopBankCells(4);
    assert(cells.map((c) => c.label).join() === ',Strch,Shift,,,,,' && cells[0].kind === 'blank', 'Audio CLIP bank: ' + cells.map((c) => c.label));
    /* the header reads the name while the knob is in hand: it must fit (a long
     * one ran off the screen on the device) */
    assert(cells.every((c) => !c.name || c.name.length <= 16) && cells[1].name === 'Stretch' && cells[2].name === 'Shift',
           'names too long for the header: ' + cells.map((c) => c.name));
    /* Strch · Shift (alt Nudge): the clip's transforms in audio (Josh,
     * 2026-10-30: "an audio-based analog of what they do with midi. thinking
     * of stretch and shift mainly"); K1 is blank (Mode left with the two
     * instruments), the rest do nothing, the sound is SAMPLE's */
    S.bankCardLatched = true;
    reset();
    for (const k of [71, 74, 75, 76, 77, 78]) { S.knobAccelLast[k - 71] = 0; for (let i = 0; i < 30; i++) cc(k, 1); }
    assert(!sentLike(/_au_|_loop_set|resolution|quantize/).length, 'an Audio CLIP knob other than K2 / K3 acts: ' + JSON.stringify(sentLike(/_au_|_loop_set|resolution|quantize/)));
    {
        const ac = S.trackActiveClip[4] | 0, len0 = S.clipLength[4][ac] | 0 || 16, tps = S.clipTPS[4][ac] || 24;
        const bpm0 = A.auInfo(4, ac).bpm10 || 1200;
        /* K2 Strch x2: twice the Length, twice the Tempo — the audio spans twice
         * the bars, so it plays at half speed over the doubled clip */
        reset();
        for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 1);
        assert(sent('t4_c' + ac + '_loop_set').join() === String(len0 * 2) && sent('t4_au_set_bpm').join() === ac + ' ' + bpm0 * 2,
               'Strch x2 is not Length x2 + Tempo x2: ' + JSON.stringify(sentLike(/_au_|_loop_set/)));
        S.knobTouched = 1;
        assert(A.auLoopBankCells(4)[1].text === 'x2', 'Strch does not read x2 while turned: ' + A.auLoopBankCells(4)[1].text);
        S.knobTouched = -1;
        assert(A.auLoopBankCells(4)[1].text === '1x', 'Strch does not rest at 1x');
        /* ...and /2 back */
        reset();
        for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 127);
        assert(sent('t4_c' + ac + '_loop_set').join() === String(len0) && S.clipLength[4][ac] === len0, 'Strch /2 did not come back: ' + JSON.stringify(sentLike(/_loop_set/)));
        /* x2 on a loop over 150 BPM: its Tempo may reach 999.9 (Josh, 2026-10-30:
         * "999.9 max and .1 minimum"; at the project's 300 cap it refused) */
        {
            const i0 = A.auInfo(4, ac);
            S.auInfo[4][ac] = Object.assign({}, i0, { bpm10: 1600 });
            reset();
            for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 1);
            assert(sent('t4_au_set_bpm').join() === ac + ' 3200', 'Strch x2 refused a 160 BPM loop: ' + JSON.stringify(sentLike(/_bpm|_loop_set/)));
            S.clipLength[4][ac] = len0; S.auInfo[4][ac] = i0;
        }
        /* /2 on an odd Length halves down, as MIDI's does (it refused) */
        S.clipLength[4][ac] = 23;
        reset();
        for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 127);
        assert(sent('t4_c' + ac + '_loop_set').join() === '11' && S.clipLength[4][ac] === 11, 'Strch /2 refused an odd Length: ' + JSON.stringify(sentLike(/_loop_set|_bpm/)));
        S.clipLength[4][ac] = len0;
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
                   'the Audio pads do not rotate with the Shift');
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
    assert(lh.indexOf('CLK') < 0, 'a blank Audio CLIP knob offers a click: ' + lh);
    S.bankCardLatched = false;

    /* ...they are on SAMPLE: page 1's K8 Revrs (Nudge left SAMPLE, Josh,
     * 2026-10-30); page 2 is K1 Sync (Vintage · Pitch · Warp, the DSP's
     * 1 · 2 · 0; a new clip on Warp), Pitch, Detune, Gain, Tempo, Revrs */
    mapPad(2, 3); ticks(2);
    reset();
    for (let i = 0; i < 20 && !sent('t4_au_set_revrs').length; i++) cc(78, 1);
    assert(sent('t4_au_set_revrs').join() === '0 1' && !sent('t4_au_set_nudge').length, 'SAMPLE K8 is not Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_set_revrs').length < 2; i++) cc(78, 127);
    jog(1); ticks(1);
    const ed = S.auEditor;
    assert(ed.page === 1, 'the jog did not turn SAMPLE to page 2');
    /* page 2 in its own order (Josh, 2026-11-02: "1: sync, 2 pitch, 3 detune, 4 gain, 5 tempo, 6 reverse" · "page 2 only") */
    assert(A.auSampleP2Cells(4, 0).map((c) => c.label).join() === 'Sync,Pitch,Detune,Gain,Tempo,Revrs,,', 'page 2: ' + A.auSampleP2Cells(4, 0).map((c) => c.label));
    assert(A.auSampleP2Cells(4, 0)[4].opens === true && A.auSampleP2Cells(4, 0).filter((c) => c.opens).length === 1,
           'Tempo does not wear the corner brackets, alone (Josh: "tempo needs the corner indicators to show it\'s touch click")');
    assert(A.auSampleP2Cells(4, 0)[0].text === 'Warp', 'a new clip is not on Warp: ' + A.auSampleP2Cells(4, 0)[0].text);
    for (let i = 0; i < 40; i++) cc(71, 127);
    reset();
    const tv = [];
    for (let i = 0; i < 40; i++) { cc(71, 1); const t = A.auSampleP2Cells(4, 0)[0].text; if (tv[tv.length - 1] !== t) tv.push(t); }
    assert(tv.join() === 'Vintage,Pitch,Warp' && sent('t4_au_set_sync').join() === '0 2,0 0',
           'K1 is not Sync Vintage · Pitch · Warp: ' + tv.join() + ' ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auSyncIdx({ sync: 1 }) === 0 && A.auSyncIdx({ sync: 2 }) === 1 && A.auSyncIdx({ sync: 0 }) === 2 &&
           A.auSyncIdx({ sync: 99 }) === 2, 'Vintage / Pitch / Warp / an unknown value reads wrong');
    for (const v of [0, 1, 2]) {
        const was = S.auInfo[4][0];
        S.auInfo[4][0] = Object.assign({}, was, { sync: v });
        const sq = A.auSampleP2Cells(4, 0)[0].sq;
        S.auInfo[4][0] = was;
        assert(sq && sq.length <= 4, 'Sync ' + v + '\'s square: ' + sq);
    }
    reset();
    /* K2 Pitch, K3 Detune, K4 Gain, K5 Tempo, K6 Revrs; K7 / K8 nothing */
    for (let i = 0; i < 20 && !sent('t4_au_set_pitch').length; i++) cc(72, 1);
    S.knobAccelLast[2] = 0; cc(73, 1);
    S.knobAccelLast[3] = 0; cc(74, 1);
    S.knobAccelLast[4] = 0; cc(75, 1);
    for (let i = 0; i < 20 && !sent('t4_au_set_revrs').length; i++) cc(76, 1);
    for (let i = 0; i < 20; i++) { cc(77, 1); cc(78, 1); }
    assert(sent('t4_au_set_pitch').length === 1 && sent('t4_au_set_detune').length === 1 && sent('t4_au_set_gain').length === 1 &&
           sent('t4_au_set_bpm').length === 1 && sent('t4_au_set_revrs').join() === '0 1' && !sent('t4_au_set_sync').length,
           'page 2 K2-K8 are not Pitch / Detune / Gain / Tempo / Revrs / nothing: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_set_revrs').length < 2; i++) cc(76, 127);
    reset();
    /* no knob of its own for Orig any more: touch K1 + click does nothing */
    note(0, 127); click(); note(0, 0); ticks(1);
    assert(!sent('t4_au_set_orig').length && !ed.pick, 'touch K1 + click still does something: ' + JSON.stringify(sentLike(/_au_/)));
    jog(-1); back(); ticks(2);
    S.bankCardLatched = false;
});

step('⭐⭐ a Slicer\'s SAMPLE page 2: K1 Sync is Off / Pitch (the engine\'s 0 / 1), K7 Cndct — whether it follows the Conductor, off by default (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    S.auCond[4] = 0;
    mapPad(2, 3); ticks(2);
    jog(1); ticks(1);
    const ed = S.auEditor;
    assert(ed && ed.page === 1 && ed.c === 16, 'not on a Slicer\'s SAMPLE page 2');
    const cells = () => A.auSampleP2Cells(4, 16);
    assert(cells().map((c) => c.label).join() === 'Sync,Pitch,Detune,Gain,Tempo,Revrs,Cndct,', 'page 2: ' + cells().map((c) => c.label));
    assert(cells()[0].text === 'Off' && JSON.stringify(cells()[0].options) === '["Off","Pitch"]' && cells()[6].text === 'Off',
           'Sync / Cndct at rest: ' + JSON.stringify([cells()[0], cells()[6]]));
    reset();
    for (let i = 0; i < 40 && !sent('t4_au_set_sync').length; i++) cc(71, 1);
    assert(sent('t4_au_set_sync').join() === '16 1' && cells()[0].text === 'Pitch', 'K1 up is not Sync Pitch: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 40; i++) cc(71, 1);         /* no third value */
    assert(sent('t4_au_set_sync').join() === '16 1', 'Sync went past Pitch: ' + JSON.stringify(sent('t4_au_set_sync')));
    for (let i = 0; i < 40 && sent('t4_au_set_sync').length < 2; i++) cc(71, 127);
    assert(sent('t4_au_set_sync').join() === '16 1,16 0' && cells()[0].text === 'Off', 'K1 down is not Sync Off: ' + JSON.stringify(sent('t4_au_set_sync')));
    reset();
    for (let i = 0; i < 40 && !sent('t4_au_cond').length; i++) cc(77, 1);
    assert(sent('t4_au_cond').join() === '1' && S.auCond[4] === 1 && cells()[6].text === 'On', 'K7 is not Cndct On: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 40 && sent('t4_au_cond').length < 2; i++) cc(77, 127);
    assert(sent('t4_au_cond').join() === '1,0' && S.auCond[4] === 0, 'K7 did not turn Cndct Off: ' + JSON.stringify(sent('t4_au_cond')));
    leave(); ticks(2);
    S.activeBank = 0; S.bankCardLatched = false;
});

step('⭐⭐ Loop + steps on SAMPLE (Josh: "it\'s not accessible at all in sample view"): the window is set, the screen stays, Start / End re-read', () => {
    GET['t4_au_info_0'] = INFO(0, 8);
    kindSync(); ticks(3);
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

step('⭐⭐ Audio pads: a progress bar over 32 even sections, not the chops — dim the loop, bright what has played, the playhead pulsing; Revrs fills from the end; stopped all dim (Josh)', () => {
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
    kindSync(); for (let i = 0; i < 6; i++) ticks(1);
    assert(pad(31) === tc && pad(11) === tc && pad(9) !== tc && pad(9), 'Revrs did not fill from the end: ' + [pad(9), pad(11), pad(31)]);
    /* stopped: the loop, all dim */
    GET['t4_au_pos'] = '0 0 -1';
    for (let i = 0; i < 6; i++) ticks(1);
    assert(pad(10) !== HC.LightGrey && pad(10) === pad(20) && pad(0) === pad(20) && pad(0) !== tc, 'stopped is not all dim: ' + [pad(0), pad(10), pad(20)]);
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(4);
});

step('⭐⭐ Audio pads: the sections of the clip past the file\'s end are grey — it never plays them (Josh: "you can\'t see where the end point is")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    GET['t4_au_pos'] = '1 6000 -1';
    /* a 2-bar clip of the 1-bar (2 s at 120) sample: its second half is past the file */
    S.clipLength[4][0] = 32; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    GET['t4_au_info_0'] = INFO(0, 8); kindSync();
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 15].every((i) => pad(i) && pad(i) !== HC.DarkGrey) && [16, 24, 31].every((i) => pad(i) === HC.DarkGrey),
           'the sections past the file are not grey: ' + [0, 15, 16, 24, 31].map(pad));
    /* ...and the playhead goes on through them, following the sequence (Josh,
     * 2026-10-30: "loop pad playhead should continue to follow the SEQUENCE on
     * the pads even when it's going beyond the audio"): nothing sounds there */
    {
        const was = [S.playing, S.trackClipPlaying[4], S.trackCurrentStep[4]];
        GET['t4_au_pos'] = '0 0 -1';
        S.playing = true; S.trackClipPlaying[4] = true; S.trackCurrentStep[4] = 24;   /* step 25 of 32: section 24 */
        for (let i = 0; i < 6; i++) ticks(1);
        assert(pad(24) === HC.LightGrey && pad(16) === HC.DarkGrey && pad(31) === HC.DarkGrey,
               'the playhead stopped at the file\'s end: ' + [16, 24, 31].map(pad));
        S.playing = was[0]; S.trackClipPlaying[4] = was[1]; S.trackCurrentStep[4] = was[2];
        GET['t4_au_pos'] = '1 6000 -1';
    }
    /* the clip within the sample: nothing grey */
    S.clipLength[4][0] = 16; kindSync();
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 15, 31].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'a clip within the sample greys: ' + [0, 15, 31].map(pad));
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(4);
});

step('⭐⭐ Audio pads: a later Start moves the clip along the sample, and what passes the file\'s end greys (Josh: "out of start/end range ... aren\'t showing up as dim white")', () => {
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    GET['t4_au_pos'] = '1 30000 -1';
    S.clipLength[4][0] = 16; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    /* Start 24000: the bar runs 24000..120000, the file ends at 96000 (section 24) */
    GET['t4_au_info_0'] = INFO(0, 8).replace(' 16 0 96000 ', ' 16 24000 96000 '); kindSync();
    for (let i = 0; i < 6; i++) ticks(1);
    assert(A.auInfo(4, 0).rstart === 24000, 'rstart not parsed: ' + A.auInfo(4, 0).rstart);
    assert([24, 31].every((i) => pad(i) === HC.DarkGrey), 'the sections past the file are not grey: ' + [24, 31].map(pad));
    assert([0, 8, 23].every((i) => pad(i) && pad(i) !== HC.DarkGrey), 'sections inside the file are grey: ' + [0, 8, 23].map(pad));
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(4);
});

step('⭐⭐ Audio step buttons: playing, the row follows the playhead page by page, as a sequence does (Josh: "like normal")', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
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

step('⭐⭐ 128 chops: Octave Up / Down steps the pad pages, 32 chops a page (a Slicer); an Audio clip has one page, its sections (Josh)', () => {
    const marks = (n) => Array.from({ length: n }, (_, k) => Math.round(k * 96000 / n) + ' ' + Math.round((k + 1) * 96000 / n)).join(' ');
    GET['t4_au_info_0'] = INFO(1, 40, 40); GET['t4_au_marks_0'] = marks(40);
    kindSync(); ticks(4);
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
    GET['t4_au_info_0'] = INFO(0, 40, 40); kindSync();
    GET['t4_au_pos'] = '1 ' + (Math.round(35 * 96000 / 40) + 10) + ' -1';
    S.playing = false;
    for (let i = 0; i < 8; i++) ticks(1);
    assert(A.auPages(4) === 1 && S.auPage[4] === 0, 'an Audio clip has chop pages: ' + A.auPages(4) + ' / ' + S.auPage[4]);
    S.clipLength[4][0] = 16; S.clipLoopStart[4][0] = 0; S.trackCurrentPage[4] = 0;
    S.ledsDirtyAudio = true; ticks(2);
    const lit = Array.from({ length: 16 }, (_, i) => LEDS.get(16 + i) || 0);
    /* one colour, the track's dim — not DarkGrey (outside a clip), not off */
    assert(lit[0] && lit.every((v) => v === lit[0]) && lit[0] !== HC.DarkGrey && lit[0] !== HC.White,
           'the step buttons do not light the whole loop dim: ' + lit.join());
    GET['t4_au_pos'] = '1 24000 2';
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(6);
    assert(S.auPage[4] === 0, 'a clip of 8 chops kept page 2');
});

step('⭐⭐ PAD MODE (IN column, a Slicer\'s): Layout 4 Rows / 16 Pads — the 16 Pads order is the left 4x4 then the right (Josh)', () => {
    assert(A.isSlicerTrack(4), 'setup: not a Slicer');
    const map = P.bankPadMapForMode(C.PAD_MODE_SLICER, 4);
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
    /* two banks: the right 4x4 in the partner track's colours — track 5 pairs
     * with track 1 (Josh, 2026-10-30: "we can just use the corresponding tracks
     * color"); a held pad white ("played slice pads should be white") */
    {
        const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
        GET['t4_au_info_0'] = INFO(1, 24, 0); kindSync(); A.auSetSelSlice(4, 0);
        S.activeBank = 0; S.bankCardLatched = false;
        DM.computePadNoteMap(); S.ledsDirtyAudio = true; for (let i = 0; i < 6; i++) ticks(1);
        assert(pad(1) === C.TRACK_DIM_COLORS[4] && pad(4) === C.TRACK_DIM_COLORS[0] && pad(0) === C.TRACK_COLORS[4],
               'the banks: left ' + pad(1) + ' right ' + pad(4) + ' selected ' + pad(0) + ' (want ' +
               [C.TRACK_DIM_COLORS[4], C.TRACK_DIM_COLORS[0], C.TRACK_COLORS[4]] + ')');
        note(C.TRACK_PAD_BASE + 5, 100); ticks(2);
        assert(pad(5) === HC.White, 'a held pad is not white: ' + pad(5));
        note(C.TRACK_PAD_BASE + 5, 0); ticks(2);
        assert(pad(5) === C.TRACK_COLORS[0], 'the released pad (now selected, right bank) is not the partner\'s colour: ' + pad(5));
        A.auSetSelSlice(4, 0);
        GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
        S.activeBank = C.BANK_CHORD; S.bankCardLatched = true;
    }
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

step('⭐ external MIDI: note 36 is chop 1 on a Slicer (a keyboard\'s drum pads)', () => {
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

step('⭐⭐ paste between the kinds (Josh, 2026-11-02): Audio onto Audio carries the sample; Audio onto a Slicer only while it has no sample; a Slicer\'s clip onto Audio gives it the sample; Slicer onto Slicer the steps; nothing crosses with MIDI, and a cut stays in its kind — every refusal said', () => {
    const ED = globalThis.__ED;
    const said = () => (S.actionPopupLines || []).join(' / ');
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);       /* track 5 (index 4): Audio, clip A a sample */
    assert(A.isAudioTrack(4) && A.auInfo(4, 0).name, 'setup: not an Audio clip with a sample');
    reset(); S.actionPopupLines = [];
    assert(ED.copyClip(4, 0, 1, 0) === false && sent('clip_copy').length === 0 && /CAN'T PASTE/.test(said()), 'an Audio clip pasted onto a melodic track: ' + said());
    S.actionPopupLines = [];
    assert(ED.copyClip(1, 0, 4, 3) === false && sent('clip_copy').length === 0 && /CAN'T PASTE/.test(said()), 'a melodic clip pasted onto an Audio track: ' + said());
    ED.copyClip(4, 0, 4, 5);
    assert(sent('clip_copy').join() === '4 0 4 5', 'Audio -> Audio did not paste');
    assert(A.auInfo(4, 5).name === 'Break Phenom 84 bpm.wav' && S.clipNonEmpty[4][5] === S.clipNonEmpty[4][0], 'the copy did not carry the sample');
    /* two Slicers beside it (tracks 6 and 7), the screen's copies set by hand */
    const slc = A.auParseInfo(INFO(1, 8));
    S.trackPadMode[5] = C.PAD_MODE_SLICER; S.trackPadMode[6] = C.PAD_MODE_SLICER;
    try {
        S.auInfo[5][16] = slc; S.auInfo[6][16] = null;
        /* Audio onto a Slicer that has a sample: refused ("Don't allow an audio
         * clip to pasted into a slucercgrack that already has a sample loaded.") */
        reset(); S.actionPopupLines = [];
        assert(ED.copyClip(4, 0, 5, 2) === false && !sent('clip_copy').length && said() === "CAN'T PASTE / The Slicer has / a sample already",
               'Audio pasted onto a Slicer with a sample: ' + said());
        /* ...onto one with none: it becomes the Slicer's sample, the steps read back */
        reset(); S.actionPopupLines = [];
        ED.copyClip(4, 0, 6, 2);
        assert(sent('clip_copy').join() === '4 0 6 2' && S.pendingStepsRereadTrack === 6 && S.pendingStepsRereadClip === 2 && !said(),
               'Audio did not paste onto an empty Slicer: ' + JSON.stringify(sent('clip_copy')) + ' ' + said());
        /* a Slicer's clip onto an Audio clip: the clip gets the sample (re-read) */
        reset();
        ED.copyClip(5, 2, 4, 6);
        assert(sent('clip_copy').join() === '5 2 4 6' && S.pendingStepsRereadTrack === 4 && S.pendingStepsRereadClip === 6,
               'a Slicer clip did not paste onto Audio: ' + JSON.stringify(sent('clip_copy')));
        /* Slicer onto Slicer: the steps only — the destination keeps its own sample */
        S.auInfo[6][16] = slc;
        reset(); S.actionPopupLines = [];
        ED.copyClip(5, 2, 6, 3);
        assert(sent('clip_copy').join() === '5 2 6 3' && S.auInfo[6][16] === slc && !said(), 'Slicer -> Slicer: ' + JSON.stringify(sent('clip_copy')));
        /* a Slicer with no sample has nothing to give an Audio clip */
        S.auInfo[5][16] = null;
        reset(); S.actionPopupLines = [];
        assert(ED.copyClip(5, 2, 4, 7) === false && !sent('clip_copy').length && /The Slicer has \/ no sample/.test(said()),
               'an empty Slicer pasted onto Audio: ' + said());
        S.auInfo[5][16] = slc;
        /* MIDI and a Slicer: refused both ways */
        reset(); S.actionPopupLines = [];
        assert(ED.copyClip(1, 0, 5, 0) === false && ED.copyClip(5, 0, 1, 0) === false && !sent('clip_copy').length && /CAN'T PASTE/.test(said()),
               'MIDI crossed with a Slicer');
        /* a cut stays in its kind */
        reset(); S.actionPopupLines = [];
        assert(ED.cutClip(4, 0, 6, 4) === false && !sent('clip_cut').length && said() === "CAN'T PASTE / A cut stays on / Audio tracks",
               'an Audio cut crossed to a Slicer: ' + said());
        reset(); S.actionPopupLines = [];
        assert(ED.cutClip(5, 2, 4, 8) === false && !sent('clip_cut').length && said() === "CAN'T PASTE / A cut stays on / Slicer tracks",
               'a Slicer cut crossed to Audio: ' + said());
    } finally {
        S.trackPadMode[5] = 0; S.trackPadMode[6] = 0;
        S.auInfo[5][16] = null; S.auInfo[6][16] = null;
        S.pendingStepsReread = 0;
        S.actionPopupLines = []; S.actionPopupEndTick = 0;
    }
    S.auInfo[4][5] = null; A.auMarkStale(4, 5);
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
});

step('⭐⭐ refusals are SAID (review, 2026-10-31): a sample over 4 minutes onto a Slicer, a failed Trim, Strch at its limit', () => {
    const t = 4, c = S.trackActiveClip[4] | 0;
    const ED = globalThis.__ED;
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);       /* an Audio track */
    const keepInfo = GET['t4_au_info_' + c], keepLen = S.clipLength[t][c];
    const LONG = '2 0 0 16 1 16 0 11025000 0 0 11025000 44100 2 0 0 0 16 0 0 0 1200 0 50 0 0 0|long.wav';   /* 250 s, an Audio clip */
    GET['t4_au_info_' + c] = LONG; A.auMarkStale(t, c); ticks(2);
    /* a Slicer takes 4 minutes at most: a longer Audio clip pasted onto an
     * empty one is refused, and said */
    S.trackPadMode[5] = C.PAD_MODE_SLICER; S.auInfo[5][16] = null;
    try {
        reset(); S.actionPopupLines = [];
        assert(ED.copyClip(t, c, 5, 0) === false && !sent('clip_copy').length, 'a 250 s sample pasted onto a Slicer');
        assert(/TOO LONG TO CHOP/.test((S.actionPopupLines || []).join(' ')), 'no notice: ' + JSON.stringify(S.actionPopupLines));
        /* control: a 10 s one pastes */
        GET['t4_au_info_' + c] = LONG.replace(/11025000/g, '441000'); A.auMarkStale(t, c); ticks(2);
        reset();
        ED.copyClip(t, c, 5, 0);
        assert(sent('clip_copy').join() === t + ' ' + c + ' 5 0', 'control: a 10 s sample did not paste onto a Slicer');
    } finally { S.trackPadMode[5] = 0; S.pendingStepsReread = 0; }
    /* a Trim that fails keeps the sample (state 2, err): said */
    GET['t4_au_info_' + c] = LONG.replace(/11025000/g, '441000'); A.auMarkStale(t, c); ticks(2);
    reset(); S.actionPopupLines = [];
    assert(A.auEdit(t, c, 0, 0), 'the Trim was not sent');
    GET['t4_au_info_' + c] = LONG.replace(/11025000/g, '441000').replace(/^2 0 /, '2 5 ');
    ticks(3);
    assert(/NOT TRIMMED/.test((S.actionPopupLines || []).join(' ')) && /copy/i.test((S.actionPopupLines || []).join(' ')),
           'a failed Trim was silent: ' + JSON.stringify(S.actionPopupLines));
    /* Strch x2 past 256 steps: said */
    GET['t4_au_info_' + c] = LONG.replace(/11025000/g, '441000'); A.auMarkStale(t, c); ticks(2);
    S.clipLength[t][c] = 256; S.clipLoopStart[t][c] = 0;
    reset(); S.actionPopupLines = [];
    assert(A.auClipBankKnob(t, 1, 1) === false, 'Strch x2 went past 256 steps');
    assert(/EXPAND LIMIT/.test((S.actionPopupLines || []).join(' ')), 'Strch at its limit was silent: ' + JSON.stringify(S.actionPopupLines));
    S.clipLength[t][c] = keepLen; GET['t4_au_info_' + c] = keepInfo; A.auMarkStale(t, c); ticks(2);
    S.actionPopupLines = []; S.actionPopupEndTick = 0;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
});

step('⭐ the playhead is asked for only while something can sound (review: ~9 % of the tick, stopped and silent)', () => {
    const g0 = globalThis.host_module_get_param; let n = 0;
    globalThis.host_module_get_param = (k) => { if (/_au_pos$/.test(k)) n++; return g0(k); };
    try {
        const ed = S.auEditor, pl = S.playing, pos0 = GET['t4_au_pos'];
        S.auEditor = null; S.playing = false; S.auPadDown.fill(false);
        GET['t4_au_pos'] = '0 0 -1';                     /* nothing sounding */
        ticks(12);   /* the first read may find the last sound ending */
        n = 0; ticks(12);
        assert(n === 0, 'stopped and silent, the playhead was read ' + n + ' times');
        S.playing = true; ticks(12);
        assert(n > 0, 'playing, the playhead was not read');
        S.playing = pl; S.auEditor = ed;
        if (pos0 === undefined) delete GET['t4_au_pos']; else GET['t4_au_pos'] = pos0;
    } finally { globalThis.host_module_get_param = g0; }
});

step('⭐ a long file says how far it has loaded (review: "Loading..." with no sign of progress)', () => {
    /* a Slicer: its sample is the slot, 16 (the stub answers it from the clip-0 fixture) */
    const c = A.auClipOf(4), keep = GET['t4_au_info_0'];
    assert(c === 16, 'setup: not a Slicer');
    GET['t4_au_info_0'] = keep.replace(/^2 /, '1 ');
    GET['t4_au_progress_0'] = '500 1000';
    A.auMarkStale(4, c); ticks(9);
    assert(A.auSampleName(4, c) === 'Loading 50%', 'loading text: ' + A.auSampleName(4, c));
    GET['t4_au_info_0'] = keep; delete GET['t4_au_progress_0'];
    A.auMarkStale(4, c); ticks(2);
    assert(!/Loading/.test(A.auSampleName(4, c)), 'still loading: ' + A.auSampleName(4, c));
});

/* Leave the sampled track 4 for no instrument through the real gesture: the
 * Track config menu's Instmt/Dest, Shift + click, None; the question is
 * `header`'s; Yes converts back with the engine's undoable "u". */
const leaveTo = (header) => {
    S.clipNonEmpty[4][0] = true;
    reset();
    for (let k = 0; k < 8; k++) note(k, 0);        /* the knobs turned above are let go */
    openTrackConfigViaMap();
    ticks(6);
    const st = snd.soundPickStateForTest();
    assert(st.kinds[st.row] === 'trackto', 'the menu did not land on Instmt/Dest: ' + st.kinds[st.row]);
    assert(st.kinds.indexOf('block') < 0 || !st.comps.some((c) => /^midi_fx/.test(c || '')), 'a sampled track offers MIDI FX');
    cc(HC.MoveShift, 127); cc(3, 127); cc(3, 0); cc(HC.MoveShift, 0);
    ticks(4);
    const p = snd.soundEnumPickForTest();
    assert(p, 'Shift + click did not open the picker');
    const want = p.options.indexOf('None');
    let guard = 0;
    while (snd.soundEnumPickForTest().sel !== want && guard++ < 60) cc(14, snd.soundEnumPickForTest().sel < want ? 1 : 127);
    cc(3, 127); cc(3, 0);
    ticks(1);
    assert(S.confirmConvertToDrum && S.confirmConvertAudio === 'leave', 'leaving did not ask');
    assert(inked(shown()), 'the question is not on screen');
    const dlg = frame(() => D.drawConvertToDrumConfirm());
    const tx = globalThis.__texts(() => frame(() => D.drawConvertToDrumConfirm()));
    assert(tx.some((x) => x.toUpperCase() === header), 'the question is not ' + header + ': ' + JSON.stringify(tx));
    const kind = S.trackPadMode[4];
    GET['t4_pad_mode'] = '0';                        /* what the engine answers once converted */
    S.confirmConvertToDrumSel = 0; cc(3, 127); cc(3, 0);
    ticks(4);
    /* the screen the TICK left (no drawUI of our own): not the question */
    assert(!same(FB.slice(), dlg), 'the answered question stayed on screen (found on the device)');
    /* undoable (Josh, 2026-11-02: leaving is undoable): "u", not "1" */
    assert(sent('t4_convert_to_melodic').join() === 'u', 'no undoable conversion: ' + JSON.stringify(sentLike(/convert/)));
    assert(S.trackPadMode[4] === 0 && !A.isSampledTrack(4), 'still ' + kind);
    assert(!S.auInfo[4][0] && !S.auInfo[4][16], 'the samples were not forgotten');
    snd.soundExit(); ticks(2);
    GET['t4_pad_mode'] = '3';
};

step('⭐⭐ leaving Audio asks (Q3: LEAVE AUDIO); Yes converts back — undoable, the engine\'s "u" — and forgets the samples', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    assert(A.isAudioTrack(4), 'setup: not Audio');
    leaveTo('LEAVE AUDIO');
});

step('⭐⭐ leaving a Slicer asks (LEAVE SLICER); Yes converts back — undoable — and forgets its sample (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\"")', () => {
    /* back to a Slicer first: an empty melodic track converts at once */
    for (let c = 0; c < 16; c++) S.clipNonEmpty[4][c] = false;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8;
    reset();
    snd.requestInstrChange(4, C.INSTR_SLICER);
    assert(!S.confirmConvertToDrum, 'an empty track asked');
    ticks(3);
    assert(sent('t4_convert_to_slicer').join() === 'u' && A.isSlicerTrack(4) && A.auInfo(4, 16).name, 'did not become a Slicer: ' + JSON.stringify(sentLike(/convert/)));
    leaveTo('LEAVE SLICER');
});

step('⭐⭐ Purge samples: removes what no clip, no Slicer and no saved state uses — only that; a state\'s format-37 lines are read (an Audio clip\'s `tNcC_aud`, a Slicer\'s `tN_slc`), the retired `_au2` no longer', () => {
    const dir = GET['t4_au_dir'];
    GET['t0_au_dir'] = dir;
    GET['au_used'] = 'Break Phenom 84 bpm.wav\n';
    const stateDir = dir.replace(/\/samples$/, '');
    os.__setReaddir({ [stateDir]: ['seq8sa-state.json', 'seq8sa-snap-1.json', 'samples'],
                      [dir]: ['Break Phenom 84 bpm.wav', 'old.wav', 'snap "q".wav', 'chops.wav', 'v36.wav'] });
    globalThis.__stubStat = { [dir + '/old.wav']: { mode: 0o100644, size: 2097152 },
                              [dir + '/snap "q".wav']: { mode: 0o100644, size: 9 },
                              [dir + '/chops.wav']: { mode: 0o100644, size: 9 },
                              [dir + '/v36.wav']: { mode: 0o100644, size: 5 },
                              [dir + '/Break Phenom 84 bpm.wav']: { mode: 0o100644, size: 9 } };
    /* a snapshot holds an Audio clip's sample and a Slicer's; an old line
     * (`_au2`, format 36) is read by nothing now, so its file is not kept */
    const files = { [stateDir + '/seq8sa-snap-1.json']: '{"v":37,"t4c3_aud":"0 8 1 16 0 0 0 0 0 0 0|snap \\"q\\".wav","t6_slc":"1 16 0 16 0 0 0 0 0 0 0|chops.wav","t2c1_au2":"0 8 1 16 0 0 0 0 0 0 0|v36.wav"}' };
    const prevRead = globalThis.host_read_file;
    globalThis.host_read_file = (p) => files[p] || '';
    try {
        const p = CH.auPurgeScan();
        assert(p.files.slice().sort().join() === [dir + '/old.wav', dir + '/v36.wav'].sort().join() && p.bytes === 2097152 + 5,
               'purge: ' + JSON.stringify(p.files));
        /* no answer from the engine is not "nothing in use": nothing is offered */
        const used0 = GET['au_used'];
        const g0 = globalThis.host_module_get_param;
        globalThis.host_module_get_param = (k) => (k === 'au_used' ? null : g0(k));
        let q;
        try { q = CH.auPurgeScan(); } finally { globalThis.host_module_get_param = g0; }
        assert(q.files.length === 0 && !q.bytes, 'a null au_used purged: ' + JSON.stringify(q.files));
        globalThis.host_module_get_param = (k) => (k === 'au_used' ? undefined : g0(k));
        try { q = CH.auPurgeScan(); } finally { globalThis.host_module_get_param = g0; }
        assert(q.files.length === 0, 'an undefined au_used purged: ' + JSON.stringify(q.files));
        GET['au_used'] = used0;
        /* the real gesture removes what the scan found */
        const one = { dir: p.dir, files: [dir + '/old.wav'], bytes: 2097152 };
        S.globalMenuOpen = true; S.confirmPurge = one; S.confirmPurgeSel = 0;
        assert(inked(shown()), 'the purge confirm draws nothing');
        const prevW = globalThis.__stubStdWritten;
        globalThis.__stubStdWritten = { [dir + '/old.wav']: 'x', [dir + '/Break Phenom 84 bpm.wav']: 'y' };
        click();
        assert(!S.confirmPurge, 'the confirm stayed');
        assert(!(dir + '/old.wav' in globalThis.__stubStdWritten) && (dir + '/Break Phenom 84 bpm.wav' in globalThis.__stubStdWritten),
               'removed the wrong files');
        assert(S.menuInfoLines[0] === 'Removed 1 sample', 'no result: ' + JSON.stringify(S.menuInfoLines));
        globalThis.__stubStdWritten = prevW;
    } finally {
        S.menuInfoLines = []; S.globalMenuOpen = false; S.confirmPurge = null;
        globalThis.host_read_file = prevRead;
        os.__setReaddir(null); globalThis.__stubStat = null;
    }
});



if (failed) { console.error('FAIL: test_audio_track_gesture'); process.exit(1); }
console.log('PASS: test_audio_track_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
