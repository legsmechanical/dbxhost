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
const FONTS = await import('../../ui/ui_fonts_pp.mjs');
const MOVY = await import('../../ui/ui_movy.mjs');
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
    assert(JSON.stringify(walk) === JSON.stringify([5, C.BANK_MACROS, 0, C.BANK_INPUT, C.BANK_REMIX, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_AUDIO, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0, 4) === null, 'the MIDI FX pad is lit (Q4)');
    assert(P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 7, 0).comp === 'fx1', 'FX 1 is dark');
    const map = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4);
    /* SAMPLE is the sample's editor; there is no sound bank (Josh,
     * 2026-10-30: "putting the params on track overview is a mistake"); SLICES
     * is a Slicer's (below) */
    assert(map[2].cells[2] && map[2].cells[2].bank === C.BANK_INPUT && !map[2].cells[2].action,
           'an Audio track has a SLICES door, or no INPUT above SAMPLE: ' + JSON.stringify(map[2].cells[2]));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave' && map[2].cells[3].name === 'SAMPLE', 'no SAMPLE door');
    assert(!map.some((c) => c.cells.some((x) => x && x.bank === C.BANK_AUDIO)), 'a pad opens the old sound bank');
    /* DELAY left Audio tracks (Josh, 2026-10-28: "let's get rid of delay");
     * its pad is REMIX's (Josh, 2026-11-10) */
    assert(map[3].cells[2] && map[3].cells[2].bank === C.BANK_REMIX, 'the FX row-3 pad is not REMIX: ' + JSON.stringify(map[3].cells[2]));
    assert(!map[3].cells[0], 'an Audio track has a NOTE FX pad: ' + JSON.stringify(map[3].cells[0]));
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

step('⭐⭐ the walk: a Slicer is PAD MODE, LIVE ARP, MACROS, STEP, CLIP, NOTE FX, MIX; ONE SLICER pad on the instrument slot (the 2026-11-14 rethink)', () => {
    const walk = P.bankCycleForMode(C.PAD_MODE_SLICER, 4);
    assert(JSON.stringify(walk) === JSON.stringify([C.BANK_CHORD, 5, C.BANK_MACROS, C.BANK_STEP, 0, C.BANK_REMIX, 1, C.BANK_SOUND]), 'walk: ' + walk.join());
    const all = P.bankListForMode(C.PAD_MODE_SLICER, 4);
    assert(all.indexOf(C.BANK_CONFIG) >= 0 && all.indexOf(C.BANK_AUTOMATION) >= 0, 'doors: ' + all.join());
    const map = P.bankPadMapForMode(C.PAD_MODE_SLICER, 4);
    assert(!map[2].cells[2], 'a pad is still above the SLICER pad (the old SLICES): ' + JSON.stringify(map[2].cells[2]));
    assert(map[2].cells[3] && map[2].cells[3].action === 'wave' && map[2].cells[3].name === 'SLICER', 'no SLICER door: ' + JSON.stringify(map[2].cells[3]));
    /* REMIX in the same pad as on an Audio track; NOTE FX kept (Josh,
     * 2026-11-10: "keep notefx for slicer. put it in a slot that neither track uses") */
    assert(map[3].cells[2] && map[3].cells[2].bank === C.BANK_REMIX, 'the FX row-3 pad is not REMIX: ' + JSON.stringify(map[3].cells[2]));
    assert(map[3].cells[0] && map[3].cells[0].bank === 1, 'a Slicer lost its NOTE FX pad: ' + JSON.stringify(map[3].cells[0]));
    assert(!P.bankMapJoins(C.PAD_MODE_SLICER, 4).length, 'the map still joins pads on a Slicer');
});

const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const back = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
const shiftClick = () => { cc(HC.MoveShift, 127); click(); cc(HC.MoveShift, 0); };
/* the SLICER editor's pages (the 2026-11-14 rethink): page 2 SHAPE is the
 * picked slice's Attk / Decay; ED() reads the slice's cells (Shift: every
 * slice's) as ui_audio keeps them */
const ED = () => ({ t: 4, page: S.shiftHeld ? 0 : 1 });
const toSlicer = () => { mapPad(2, 3); ticks(1); };
const toSlicesP2 = () => { mapPad(2, 3); jog(1); ticks(1); };
const leave = () => { for (let n = 0; S.auEditor && n < 6; n++) { back(); ticks(1); } };

step('⭐⭐ no sound bank: Back from the SLICER editor returns to the bank that was showing (Josh, 2026-10-30: "just fall back to the last regular knob bank")', () => {
    S.activeBank = 1; S.bankCardLatched = false;
    mapPad(2, 3);
    assert(S.auEditor && S.auEditor.ed === 'slicer' && (S.auEditor.page | 0) === 0, 'the SLICER door did not open the SLICER editor on its first page');
    back(); ticks(2);
    assert(!S.auEditor && !S.auPanel && S.activeBank === 1, 'Back from the SLICER editor did not return to the bank that was showing: ' + S.activeBank);
    S.activeBank = 0; ticks(2);
});

step('⭐⭐ the right 4x4: the instrument pad is SLICER on a Slicer, SAMPLE on an Audio track — the track\'s colour, White while its editor is up, a press opens it; the pad above it dark on both', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    const up = P.bankMapModuleAt(0, C.PAD_MODE_SLICER, 6, 0, 4), sa = P.bankMapModuleAt(0, C.PAD_MODE_SLICER, 6, 1, 4);
    assert(!up && sa && sa.label === 'SLICER', 'the column: ' + JSON.stringify([up, sa]));
    S.activeBank = 0; S.bankCardLatched = false;
    cc(3, 127); ticks(2);
    assert(LEDS.get(P.bankMapPadForCell(6, 1)) === globalThis.__tc(4) && !LEDS.get(P.bankMapPadForCell(6, 0)),
           'SLICER is not the track\'s colour, or the pad above it is lit: ' + [LEDS.get(P.bankMapPadForCell(6, 0)), LEDS.get(P.bankMapPadForCell(6, 1))]);
    note(P.bankMapPadForCell(6, 1), 100); note(P.bankMapPadForCell(6, 1), 0); cc(3, 0); ticks(3);
    assert(S.auEditor && S.auEditor.ed === 'slicer', 'the right SLICER pad did not open the SLICER editor');
    cc(3, 127);
    S.jogPressMs = S.clockMs - C.JOG_HOLD_MAP_MS - 50; ticks(2);   /* held past the threshold (this rig's clock) */
    assert(S.bankMapUp && LEDS.get(P.bankMapPadForCell(6, 1)) === HC.White, 'SLICER\'s shortcut is not White with its editor up');
    cc(3, 0); ticks(2);
    for (let n = 0; S.auEditor && n < 4; n++) { back(); ticks(2); }
    assert(!S.auEditor, 'the SLICER editor did not close');
    /* an Audio track: SAMPLE, nothing above it */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    assert(S.trackPadMode[4] === C.PAD_MODE_AUDIO && !P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 0, 4) &&
           P.bankMapModuleAt(0, C.PAD_MODE_AUDIO, 6, 1, 4).label === 'SAMPLE', 'an Audio track\'s column');
    cc(3, 127); ticks(2);
    assert(!LEDS.get(P.bankMapPadForCell(6, 0)), 'the pad above SAMPLE is lit on an Audio track');
    note(P.bankMapPadForCell(6, 0), 100); note(P.bankMapPadForCell(6, 0), 0); cc(3, 0); ticks(3);
    assert(!S.auEditor, 'the dark pad opened something');
    assert(!render.bankMapItems().joins.length, 'an Audio track\'s map joins pads');
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    assert(!render.bankMapItems().joins.length, 'a Slicer\'s map joins pads');
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

step('⭐ Pitch reads as a number and steps a semitone per detent run (Josh: "doesn\'t read out any values and is very touchy") — the picked slice\'s, on page 1\'s K5; Shift + Pitch does nothing (page 3 moves every slice — Josh, 2026-11-15)', () => {
    toSlicer();
    const cell = () => E.slcPageCells(S.auEditor)[4];
    assert(cell().label === 'Pitch' && cell().kind === 'valsq' && /^[+-]\d+$/.test(cell().text), 'page 1 K5: ' + JSON.stringify(cell()));
    reset();
    note(4, 127);
    for (let i = 0; i < 30; i++) cc(75, 1);         /* K5 Pitch: 30 encoder ticks */
    const n = sent('t4_au_slice_pitch').length;
    assert(n >= 1 && n <= 3, '30 ticks moved the slice pitch ' + n + ' semitones: ' + JSON.stringify(sent('t4_au_slice_pitch')));
    const tx = globalThis.__texts(() => shown());
    assert(tx.some((x) => /^PITCH [+-]\d+$/.test(x)), 'the touched Pitch does not read out: ' + JSON.stringify(tx));
    for (let i = 0; i < 30; i++) cc(75, 127);       /* back down */
    note(4, 0);
    reset();
    S.shiftHeld = true;
    assert(cell().text === '--' && cell().na, 'Shift: page 1 K5 does not read as nothing to set: ' + JSON.stringify(cell()));
    note(4, 127); for (let i = 0; i < 30; i++) cc(75, 1); note(4, 0);
    S.shiftHeld = false;
    assert(!sent('t4_au_all_pitch').length && !sent('t4_au_slice_pitch').length, 'Shift + Pitch set something: ' + JSON.stringify(sentLike(/_au_/)));
    leave();
});

step('⭐ page 2 SHAPE: the picked slice\'s Attk and Decay, titled SLICE n/N, 2/3', () => {
    toSlicesP2();
    assert(S.auEditor && (S.auEditor.page | 0) === 1, 'the jog did not turn to page 2');
    const cells = E.slcPageCells(S.auEditor);
    assert(cells.map((c) => c.label).join() === 'Attk,Decay,,,,,,', 'SHAPE: ' + cells.map((c) => c.label).join());
    const tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SLICE 1/8') >= 0 && tx.indexOf('2/3') >= 0, 'the header: ' + JSON.stringify(tx.slice(0, 6)));
    leave();
});

step('⭐⭐ Shift sets every slice on Play, Revrs, Attk and Decay (`--` where they differ); on Pitch / Detune / Gain it does nothing — the sample\'s are the base that moves them all (Josh, 2026-11-15)', () => {
    toSlicer();
    S.shiftHeld = true;
    GET['t4_au_all_0'] = '0 0 0 x 0 0';                 /* the slices' attacks differ */
    kindSync(); ticks(2);
    reset();
    for (let i = 0; i < 10; i++) cc(75, 1);             /* K5 Pitch */
    cc(76, 1); cc(76, 1);                               /* K6 Detune */
    for (let i = 0; i < 10; i++) cc(78, 1);             /* K8 Gain */
    assert(!sentLike(/_au_(all|slice|set)_(pitch|detune|gain)$/).length, 'Shift + Pitch / Detune / Gain set something: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20; i++) cc(74, 1);             /* K4 Play: a deliberate knob */
    assert(sent('t4_au_all_play').join() === '16 1', 'Play did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    S.shiftHeld = false;                                /* (Shift + jog is the track shortcut) */
    jog(1); ticks(1);                                   /* page 2: Attk, every slice */
    S.shiftHeld = true;
    assert(E.slcPageCells(S.auEditor)[0].text === '--', 'Attk where the slices differ: ' + E.slcPageCells(S.auEditor)[0].text);
    cc(71, 1);
    assert(sent('t4_au_all_atk').length === 1, 'Attk did not set every slice: ' + JSON.stringify(sentLike(/_au_/)));
    S.shiftHeld = false;
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_all_0'] = '0 x 0 0 0 0';
    kindSync(); ticks(2);
});

step('⭐⭐ the slice knobs edit the last pad tapped: page 1 K4 Play · K5 Pitch · K6 Detune · K7 Revrs · K8 Gain', () => {
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);
    assert(A.auSelSlice(4) === 2, 'the pad did not pick slice 3');
    toSlicer();
    ticks(2);
    const cells = E.slcPageCells(S.auEditor);
    assert(cells.map((c) => c.label).join() === ',,,Play,Pitch,Detune,Revrs,Gain', 'page 1: ' + cells.map((c) => c.label).join());
    assert(cells[7].text === '-3 dB', 'slice 3 gain: ' + cells[7].text);
    const tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SLICE 3/8') >= 0 && tx.indexOf('1/3') >= 0, 'the header: ' + JSON.stringify(tx.slice(0, 6)));
    reset();
    for (let i = 0; i < 3; i++) cc(78, 1);             /* K8 Gain */
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
    /* fine at the short end: 1 ms a detent there, the dial log (Josh,
     * 2026-11-12: "it's really hard to dial in decays near the minimum level,
     * which is where subtle control is most important") */
    reset();
    for (let i = 0; i < 5; i++) { S.knobAccelLast[1] = 0; cc(72, 1); }
    assert(sent('t4_au_slice_dec').map((v) => v.split(' ')[2]).join() === '6,7,8,9,10',
           'the first detents up from 5 ms are not 1 ms each: ' + JSON.stringify(sent('t4_au_slice_dec')));
    assert(A.auPanelCells(ED())[1].norm > 0.05, 'the arc does not move at 10 ms (a linear dial): ' + A.auPanelCells(ED())[1].norm);
    reset();
    for (let i = 0; i < 120; i++) { S.knobAccelLast[1] = 0; cc(72, 1); }
    { const v = sent('t4_au_slice_dec').map((x) => +x.split(' ')[2]);
      assert(v[v.length - 1] === 5000 || v[v.length - 1] === 0, '120 single detents do not reach the top: ' + v[v.length - 1]);
      const at = (ms) => v.findIndex((x) => x >= ms);
      assert(at(100) - at(50) > 5 && at(1000) - at(500) > 5 && Math.abs((at(100) - at(50)) - (at(1000) - at(500))) <= 2,
             'not logarithmic — detents 50->100 ms ' + (at(100) - at(50)) + ', 500->1000 ms ' + (at(1000) - at(500))); }
    for (let i = 0; i < 300; i++) cc(72, 127);       /* back to the bottom */
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

step('⭐⭐ the SLICER editor\'s pages turn on the jog (SLICES · SHAPE · SAMPLE); page 3\'s click opens the SAMPLE menu — Load sample · Trim · Normalize (Josh, 2026-11-15: "page 3 ... menu should only include the things that deal with the full sample")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    mapPad(2, 3);
    const ed = S.auEditor;
    assert(ed && ed.ed === 'slicer' && ed.mode === 'wave' && S.auPanel && S.auPanel.wave, 'the SLICER editor did not open');
    ticks(2);
    assert(inked(shown()), 'the SLICER editor draws nothing');
    reset();
    let ptx = globalThis.__texts(() => shown());
    assert(ed.page === 0 && ptx.indexOf('1/3') >= 0 && ptx.indexOf('EDIT') >= 0, 'page 1: ' + JSON.stringify(ptx));
    jog(1); ticks(1);
    ptx = globalThis.__texts(() => shown());
    assert(ed.page === 1 && ptx.indexOf('2/3') >= 0 && ptx.indexOf('ATTK') >= 0, 'the jog did not turn to page 2: ' + JSON.stringify(ptx));
    jog(1); ticks(1);
    ptx = globalThis.__texts(() => shown());
    assert(ed.page === 2 && ptx.indexOf('3/3') >= 0 && ptx.indexOf('SYNC') >= 0 && ptx.indexOf('TEMPO') >= 0 && ptx.indexOf('MENU') >= 0,
           'the jog did not turn to page 3: ' + JSON.stringify(ptx));
    jog(1); ticks(1);
    assert(ed.page === 2, 'the jog turned past page 3');
    click(); ticks(2);
    assert(ed.pick && ed.pick.menu === 'sample' && E.auPickRows(ed).map((r) => r.label).join() === 'Load sample,Trim,Normalize',
           'page 3\'s click did not open the SAMPLE menu: ' + JSON.stringify({ pick: ed.pick, rows: E.auPickRows(ed).map((r) => r.label) }));
    assert(!sentLike(/_au_(mark_add|set_even)/).length, 'a click on page 3 edited the slices: ' + JSON.stringify(sentLike(/_au_/)));
    back(); ticks(1);
    shiftClick(); ticks(2);                          /* Shift + click: the same menu here */
    assert(ed.pick && ed.pick.menu === 'sample', 'Shift + click on page 3 did not open the SAMPLE menu');
    click(); ticks(2);                               /* Load sample */
    assert(S.auChooser && !ed.pick && S.auEditor === ed, 'Load sample did not open the chooser: ' + JSON.stringify({ ch: !!S.auChooser, pick: ed.pick }));
    back(); ticks(2);
    assert(!S.auChooser && S.auEditor === ed, 'Back did not close the chooser onto the SLICER editor');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back did not leave the SLICER editor');
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(20);
});

step('⭐⭐ the slice editor (page 1\'s click): pads pick, K1/K3 move by a pixel, K2 zooms, the jog moves a cursor, click adds, Delete + pad removes; Back leaves it for page 1 (Josh, 2026-11-15: "there\'s no reason anything but scrolling and adding slices needs to be inside-only")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0);                /* a hand set of 8, Even Off */
    kindSync(); ticks(2);
    mapPad(2, 3);
    ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave' && ed.ed === 'slicer' && ed.page === 0, 'no SLICER editor on page 1');
    /* outside, K1 / K3 and Delete + pad already work: only the cursor and adding are inside */
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);
    reset();
    note(0, 127); cc(71, 1); note(0, 0);
    assert(sent('t4_au_slice_start').join() === '16 5 60750', 'K1 outside the slice editor: ' + JSON.stringify(sent('t4_au_slice_start')));
    note(0, 127); cc(71, 127); note(0, 0);              /* and back */
    assert(A.auMarks(4, 16)[5][0] === 60000, 'K1 did not turn back: ' + A.auMarks(4, 16)[5][0]);
    reset();
    click();                                            /* in */
    assert(ed.mode === 'chop' && ed.chop.kind === 'manual' && !ed.ask && !sent('t4_au_manual').length,
           'the click did not enter the slice editor on the slices as they are: ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ask: ed.ask }));
    assert(sent('t4_au_undo_slc').length === 1, 'entering did not take one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
    note(C.TRACK_PAD_BASE + 5, 100); note(C.TRACK_PAD_BASE + 5, 0);   /* the timeline: pad 6 is slice 6 */
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
    note(9, 127); note(9, 0);                        /* touch the jog: jump to the cursor */
    assert(Math.abs(mid() - 60000) <= 1, 'touching the jog did not jump to the cursor: ' + ed.A + '..' + ed.B);
    reset();
    jog(3);
    assert(ed.cur === 60000 + 3 * 197 && ed.last === 'jog', 'jog: ' + ed.cur);
    click();
    assert(sent('t4_au_mark_add').join() === '16 ' + ed.cur, 'click: ' + JSON.stringify(sent('t4_au_mark_add')));
    assert(A.auInfo(4, 16).n === 9 && A.auMarks(4, 16).length === 9, 'the new slice is not on screen');
    reset();
    cc(HC.MoveDelete, 127);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);   /* slice 1: stays */
    note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0);   /* slice 3 */
    cc(HC.MoveDelete, 0);
    assert(sent('t4_au_mark_del').join() === '16 2', 'Delete + pad: ' + JSON.stringify(sent('t4_au_mark_del')));
    const tx = globalThis.__texts(() => assert(inked(shown()), 'the editor draws nothing'));
    assert(['CLK', 'ADD', 'BACK', 'DONE'].every((h) => tx.indexOf(h) >= 0), 'slice-editor hints: ' + JSON.stringify(tx));
    /* Delete + click is the page's reset here as everywhere — never Clear all (the SLICE menu's alone) */
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    assert(!ed.ask && !sent('t4_au_manual').length && sentLike(/_au_slice_(play|pitch|detune|rev|gain)$/).length,
           'Delete + click did not reset the slice (or asked to clear all): ' + JSON.stringify({ ask: ed.ask, s: sentLike(/_au_/) }));
    back();
    assert(S.auEditor === ed && ed.mode === 'wave' && ed.page === 0 && !ed.ask, 'Back did not leave the slice editor for page 1');
    back();
    assert(!S.auEditor && !S.auPanel, 'Back');
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(20);
});

step('⭐⭐ Clear all slices is in the SLICE menu and only there: it asks, Yes is one slice (Josh, 2026-11-15: "just put clear all exclusively in the page one menu")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor;
    shiftClick(); ticks(2);
    const rows = E.auPickRows(ed).map((r) => r.id);
    assert(ed.pick && ed.pick.menu === 'slices' && rows.join() === 'load,even,transient,lazy,clear,kit', 'the SLICE menu: ' + JSON.stringify(rows));
    for (let k = 0; k < rows.indexOf('clear'); k++) jog(1);
    click(); ticks(1);
    assert(ed.ask && ed.ask.kind === 'clear', 'Clear all did not ask');
    const qtx = globalThis.__texts(() => shown());
    const wtx = globalThis.__texts(() => frame(() => D.drawAudioAsk('SLICES', ['Clear all slices?', 'One slice, Start to End.'], 1)));
    assert(JSON.stringify(qtx) === JSON.stringify(wtx), 'the question is not on screen: ' + JSON.stringify(qtx) + ' vs ' + JSON.stringify(wtx));
    reset();
    click();                                         /* opens on No */
    assert(!ed.ask && !sent('t4_au_manual').length, 'No cleared');
    shiftClick(); for (let k = 0; k < rows.indexOf('clear'); k++) jog(1); click(); jog(1); click();
    assert(sent('t4_au_manual').join() === '16' && A.auInfo(4, 16).n === 1, 'Yes did not clear to one slice: ' + JSON.stringify(sentLike(/_au_/)));
    leave();
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
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
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);   /* an Audio track's SAMPLE */
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
        /* white: SAMPLE on the left map and its shortcut on the right 4x4
         * (the instrument pad), nothing else — not the bank under it */
        const whites = Array.from({ length: 32 }, (_, i) => i).filter((i) => LEDS.get(C.TRACK_PAD_BASE + i) === HC.White);
        const want = [P.bankMapPadForCell(col, row), P.bankMapPadForCell(6, 1)].map((n) => n - C.TRACK_PAD_BASE).sort((a, b) => a - b);
        assert(JSON.stringify(whites) === JSON.stringify(want), 'the map lights ' + JSON.stringify(whites) + ' white over ' + name + ', not ' + JSON.stringify(want));
        note(P.bankMapPadForCell(2, 1), 100); note(P.bankMapPadForCell(2, 1), 0);   /* CLIP */
        cc(3, 0); ticks(3);
        assert(!S.auPanel && !S.auEditor && S.activeBank === 0, 'the pick did not leave ' + name + ' for CLIP: bank ' + S.activeBank);
    }
    /* ...and a short click is still the screen's: a Slicer's page 1 enters the slice editor */
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3);
    reset();
    click(); ticks(2);
    assert(S.auEditor.mode === 'chop' && S.auEditor.chop.kind === 'manual' && !S.bankMapUp, 'a short click did not reach the SLICER editor: ' + JSON.stringify(S.auEditor.mode));
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

step('⭐⭐ SAMPLE: the sample\'s name up top; Start / End light while touched or turned (an Audio clip\'s); ZOOM + / - / ZOOM between them (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);   /* a Slicer, a hand set of 8 */
    mapPad(2, 3);
    ticks(2);
    const px = (f, x, y) => f[y * 128 + x];
    const rx = 124 - 2;                              /* the end strip runs to x 124 */
    let tx = globalThis.__texts(() => { shown(); });
    /* a Slicer's page 1: a click enters the slice editor, the jog turns the
     * page; SLICE n/N, 1/3 (its page 3 is under the sample's name) */
    assert(['CLK', 'EDIT', 'JOG', 'PAGE'].every((h) => tx.indexOf(h) >= 0), 'Slicer hints: ' + JSON.stringify(tx));
    assert(tx.indexOf('1/3') >= 0 && tx.indexOf('SLICE 1/8') >= 0, 'the header: ' + JSON.stringify(tx.slice(0, 6)));
    jog(1); jog(1); ticks(1);
    tx = globalThis.__texts(() => { shown(); });
    assert(tx.indexOf('3/3') >= 0 && tx.some((x) => /^BREAK PHENOM/.test(x)), 'page 3 is not under the sample\'s name: ' + JSON.stringify(tx.slice(0, 6)));
    jog(-1); jog(-1); ticks(1);
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
    assert(tx.indexOf('CLK') >= 0 && tx.indexOf('MENU') >= 0 && tx.indexOf('JOG') >= 0 && tx.indexOf('PAGE') >= 0 && tx.indexOf('1/3') >= 0,
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

step('⭐⭐ WAVE K8 Gain · K5 Pitch · K6 Detune (an Audio clip\'s; Gain on K8 since Josh, 2026-11-13), read out in the middle; the waveform follows the gain (Josh) — and the Screen view gets the waveform (a Slicer\'s are on its page 3: test_slicer_editor_gesture)', () => {
    GET['t4_au_info_0'] = INFO(0, 8, 0); kindSync(); ticks(2);
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
    let tx = globalThis.__texts(() => { for (let i = 0; i < 6; i++) { S.knobAccelLast[7] = 0; cc(78, 1); } shown(); });
    assert(sent('t4_au_set_gain').pop() === '0 6' && tx.indexOf('GAIN +6DB') >= 0, 'K8 Gain: ' + JSON.stringify(sent('t4_au_set_gain')) + ' ' + JSON.stringify(tx));
    /* measured before a tick: this rig's engine stub answers 0 dB to a re-read */
    assert(waveInk() > quiet, 'the waveform did not grow with +6 dB: ' + quiet + ' -> ' + waveInk());
    tx = globalThis.__texts(() => { for (let i = 0; i < 10; i++) cc(75, 1); shown(); });
    assert(sent('t4_au_set_pitch').join() === '0 1' && tx.indexOf('PITCH +1') >= 0, 'K5 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')) + ' ' + JSON.stringify(tx));
    /* each turn from idle (the knob's acceleration reads Date.now(): two turns in
     * one millisecond on one machine are two steps, on another a fraction) */
    tx = globalThis.__texts(() => { S.knobAccelLast[5] = 0; cc(76, 127); S.knobAccelLast[5] = 0; cc(76, 127); shown(); });
    assert(sent('t4_au_set_detune').join() === '0 -1,0 -2' && tx.indexOf('DETUNE -2') >= 0, 'K6 Detune: ' + JSON.stringify(sent('t4_au_set_detune')) + ' ' + JSON.stringify(tx));
    tx = globalThis.__texts(() => { note(7, 127); shown(); });
    assert(tx.indexOf('GAIN +6DB') >= 0, 'touching K8 does not read out: ' + JSON.stringify(tx));
    note(7, 0);
    /* K7 the sample's own Tempo, 1 BPM a step — on a Slicer too, where
     * >Seq places the chops by it (Josh, 2026-10-29: Move's "tempo knob to
     * set the original tempo") */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0);   /* 84 BPM */
    kindSync(); ticks(2);
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
    /* K3 End on an Audio clip, as fine as Start — a pixel a detent — the
     * Length left to the Loop gestures (Josh, 2026-11-12: "i need it fine
     * like start. and maybe that should just BE knob 3"); Start..End is the
     * loop and the Tempo follows it ("we need a way to say this is where the
     * loop starts and ends" · fill the clip: "yes") */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0);   /* 84 BPM */
    kindSync(); ticks(2);
    S.clipLength[4][0] = 2; S.clipTPS[4][0] = 24; S.clipLoopStart[4][0] = 0;
    mapPad(2, 3); ticks(2);
    const led = S.auEditor;
    const top = A.auPlayedEnd(4, 0, A.auInfo(4, 0)), px = Math.max(1, Math.round((led.B - led.A) / 128));
    const k3txt = () => globalThis.__texts(() => { shown(); });
    /* End reads as End alone: OFF, never the clip's bars (Josh, 2026-11-13:
     * "i still don't get end having a bars readout") */
    assert(k3txt().indexOf('E OFF') >= 0 && !k3txt().some((x) => /^LEN |BAR/.test(x)), 'no End: the screen does not read E OFF: ' + JSON.stringify(k3txt()));
    reset();
    S.knobAccelLast[2] = 0; cc(73, 1);               /* up with no End: nothing */
    assert(!sentLike(/t4_(au_set_end|c0_loop_set)/).length, 'K3 up with no End: ' + JSON.stringify(sentLike(/t4_/)));
    S.knobAccelLast[2] = 0; cc(73, 127);
    assert(sent('t4_au_set_end').join() === '0 ' + (top - px) && !sent('t4_c0_loop_set').length,
           'K3: not End a pixel in: ' + JSON.stringify(sent('t4_au_set_end')) + ' top ' + top + ' px ' + px);
    const iE = A.auInfo(4, 0);
    assert(iE.cut === top - px && A.auPlayedEnd(4, 0, iE) === top - px, 'End is not where the clip ends: ' + JSON.stringify(iE));
    /* the file goes on past End, for reference (Josh, 2026-11-13: "the
     * waveform beyond start end disappears. that shouldn't happen"): the
     * columns past End are read, and a zoomed-in view scrolls before Start */
    {
        const [slo, shi] = E.auScrollBounds(led), [vlo] = E.auViewBounds(led);
        assert(slo === 0 && shi >= 96000 && vlo === (iE.rstart | 0), 'SAMPLE does not scroll over the whole file: ' + JSON.stringify([slo, shi, vlo]));
        /* End halfway: the columns past it still carry the audio (dithered) */
        const half = Math.round(((led.A | 0) + (led.B | 0)) / 2);
        S.auInfo[4][0] = Object.assign({}, iE, { cut: half, rend: half });
        const f = shown(), endPx = Math.floor((half - led.A) / (led.B - led.A) * 128);
        let ink = 0;
        for (let x = endPx + 3; x < Math.min(128, endPx + 30); x++) for (let y = 20; y < 50; y++) ink += f[y * 128 + x] ? 1 : 0;
        /* End a solid line, edged in black */
        let line = -1;
        for (let x = endPx - 2; x <= endPx + 2 && line < 0; x++) { let n = 0; for (let y = 20; y < 50; y++) n += f[y * 128 + x] ? 1 : 0; if (n === 30) line = x; }
        S.auInfo[4][0] = iE;
        assert(ink > 0, 'nothing drawn past End: the file does not run on for reference');
        assert(line >= 0 && !f[30 * 128 + line + 1], 'no line at End (around x ' + endPx + ')');
    }
    /* End is a cut: the Tempo stays the sample's (Josh, 2026-11-13: "loop
     * length then changes how much of that loop plays back just like a midi
     * clip") */
    assert(A.auBpm(iE) === 84, 'an End moved the Tempo: ' + A.auBpm(iE));
    assert(k3txt().some((x) => /^E \d/.test(x)), 'the screen does not read End: ' + JSON.stringify(k3txt()));
    /* ...and still, once the engine's info is read again (End, then Bars, the last fields) */
    const infoWas = GET['t4_au_info_0'];
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0).replace('|', ' 0 0 ' + (top - px) + ' 0|');
    A.auMarkStale(4, 0); ticks(3);
    assert(A.auInfo(4, 0).cut === top - px && A.auInfo(4, 0).span === 0 && A.auBpm(A.auInfo(4, 0)) === 84,
           'a re-read lost End: ' + A.auBpm(A.auInfo(4, 0)) + ' cut ' + A.auInfo(4, 0).cut);
    /* BARS on page 2, beside Tempo (Josh, 2026-11-13: "bars should describe
     * how long the original clip is BETWEEN the start and end points" · "bars
     * should be a knob in page 2 next to tempo" · "hold bars.") */
    const cutE = top - px, secs = cutE / 48000, derived = secs * 84 / 240;
    led.page = 1; ticks(1);
    const barsCell = () => A.auSampleP2Cells(4, 0)[A.AU_P2_BARS];
    assert(barsCell().label === 'Bars' && barsCell().text === A.auBarsText(derived),
           'Bars at rest is not the Tempo\'s reading: ' + barsCell().text + ' want ' + A.auBarsText(derived));
    /* from a part bar the first detent lands on the whole bar that way: 1.7 -> 2 up, 1 down */
    {
        const i0 = A.auInfo(4, 0), e17 = (i0.rstart | 0) + Math.round(1.7 * 48000);   /* 1.7 bars at 240 BPM */
        S.auInfo[4][0] = Object.assign({}, i0, { cut: e17, span: 0, bpm10: 2400 });
        reset(); A.auBarsTurn(4, 0, 1);
        S.auInfo[4][0] = Object.assign({}, i0, { cut: e17, span: 0, bpm10: 2400 });
        A.auBarsTurn(4, 0, -1);
        assert(sent('t4_au_set_bars').join() === '0 768,0 384', 'from 1.7 bars: ' + JSON.stringify(sent('t4_au_set_bars')));
        S.auInfo[4][0] = i0;
    }
    reset();
    for (let k = 0; k < 20 && !sent('t4_au_set_bars').length; k++) cc(78, 1);   /* TIME's K8 (2026-11-14) */
    const want = Math.floor(derived + 1e-6) + 1;
    assert(sent('t4_au_set_bars').join() === '0 ' + want * 384 && A.auInfo(4, 0).span === want * 384,
           'K8 up is not the next whole bar: ' + JSON.stringify(sent('t4_au_set_bars')) + ' want ' + want);
    /* which one holds is marked: an arrow after its label (Josh, 2026-11-13:
     * "do 2" — the Octatrack's priority arrow) */
    {
        const arrowAt = (k, f) => {
            const lbl = A.auSampleP2Cells(4, 0)[k].label.toUpperCase();
            const tw = FONTS.fontWidth4x5(lbl), tx = Math.round((k % 4) * MOVY.MV_CELL_W + MOVY.MV_CELL_W / 2 - tw / 2);
            const ax = tx + tw + 1, ty = MOVY.MV_LBL1_Y + Math.floor((MOVY.MV_LBL_H - 5) / 2);
            let n = 0; for (let y = ty; y < ty + 5; y++) n += f[y * 128 + ax + 2] ? 1 : 0;
            return n === 5;
        };
        led.page = 1; S.knobTouched = -1;
        const f = shown();
        assert(arrowAt(A.AU_P2_BARS, f) && !arrowAt(A.AU_P2_TEMPO, f), 'Bars set: the arrow is not at Bars alone');
        const i1 = A.auInfo(4, 0);
        S.auInfo[4][0] = Object.assign({}, i1, { span: 0 });
        const g = shown();
        S.auInfo[4][0] = i1;
        assert(arrowAt(A.AU_P2_TEMPO, g) && !arrowAt(A.AU_P2_BARS, g), 'no Bars: the arrow is not at Tempo alone');
    }
    const fitOf = (e) => Math.round(48000 * 600 / ((e / (want * 384)) * 96)) / 10;
    assert(A.auBpm(A.auInfo(4, 0)) === fitOf(cutE) && barsCell().text === String(want),
           'the Tempo does not follow the Bars: ' + A.auBpm(A.auInfo(4, 0)) + ' want ' + fitOf(cutE));
    /* held when End moves: the Tempo follows (the engine's answer, as it
     * will read: End a pixel in, the Bars kept) */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0).replace('|', ' 0 0 ' + cutE + ' ' + want * 384 + '|');
    led.page = 0; ticks(1);
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0).replace('|', ' 0 0 ' + (cutE - px) + ' ' + want * 384 + '|');
    reset();
    S.knobAccelLast[2] = 0; cc(73, 127);
    const cut2 = A.auInfo(4, 0).cut;
    assert(cut2 < cutE && !sent('t4_au_set_bars').length && A.auInfo(4, 0).span === want * 384 && A.auBpm(A.auInfo(4, 0)) === fitOf(cut2),
           'moving End did not hold the Bars: ' + JSON.stringify(sentLike(/t4_/)) + ' ' + A.auBpm(A.auInfo(4, 0)));
    /* a Tempo turn hands the say back: the Bars go, from the Tempo they made */
    reset();
    S.knobAccelLast[6] = 0; cc(77, 1);
    assert(sent('t4_au_set_bpm').join() === '0 ' + (Math.round(fitOf(cut2) * 10) + 10) && A.auInfo(4, 0).span === 0,
           'K7 under Bars: ' + JSON.stringify(sent('t4_au_set_bpm')) + ' span ' + A.auInfo(4, 0).span);
    S.auInfo[4][0] = Object.assign({}, A.auInfo(4, 0), { bpm10: 840, cut: cutE });
    GET['t4_au_info_0'] = infoWas;
    /* out to the file's end (an End: the whole file), one past it none */
    for (let k = 0; k < 6000 && A.auInfo(4, 0).cut !== 96000; k++) { S.knobAccelLast[2] = 0; cc(73, 1); }
    assert(A.auInfo(4, 0).cut === 96000 && sent('t4_au_set_end').pop() === '0 96000', 'End did not stop on the file\'s end: ' + A.auInfo(4, 0).cut);
    S.knobAccelLast[2] = 0; cc(73, 1);
    assert(sent('t4_au_set_end').pop() === '0 0' && !(A.auInfo(4, 0).cut > 0) && A.auBpm(A.auInfo(4, 0)) === 84,
           'past the file\'s end End did not go (the Tempo the knob\'s): ' + JSON.stringify(sent('t4_au_set_end')) + ' ' + A.auBpm(A.auInfo(4, 0)));
    /* K1 Start stops short of End */
    /* (End down part of the way: a detent is a pixel of the zoomed-out view,
     * which is the clip window plus its margins) */
    for (let k = 0; k < 60; k++) { S.knobAccelLast[2] = 0; cc(73, 127); }
    const endAt = A.auInfo(4, 0).cut;
    for (let k = 0; k < 200; k++) { S.knobAccelLast[0] = 0; cc(71, 1); }
    assert(endAt > 0 && A.auInfo(4, 0).rstart <= endAt - 16 && A.auInfo(4, 0).rstart > 0, 'Start passed End: ' + A.auInfo(4, 0).rstart + ' end ' + endAt);
    S.auInfo[4][0] = Object.assign({}, A.auInfo(4, 0), { rstart: 0, cut: 0 });
    /* End touched last: Tempo keeps the clip's end on screen (Josh,
     * 2026-10-30: "if i last touched length, wave view should stay focused on
     * the end of the clip while adjusting bpm") */
    S.clipLength[4][0] = 3; kindSync(); ticks(2);
    note(2, 127); note(2, 0);                        /* K3 last (touched: no End set) */
    for (let z = 0; z < 3; z++) cc(72, 1);           /* zoom in */
    const endNow = () => A.auPlayedEnd(4, 0, A.auInfo(4, 0));
    /* the end in the MIDDLE: the file runs on past it (Josh, 2026-11-13: "we need it for reverence") */
    const onEnd = () => Math.abs((led.A + led.B) / 2 - endNow()) <= 1;
    assert(!led.full && onEnd(), 'not on the end before the Tempo turn: ' + led.A + '..' + led.B + ' end ' + endNow());
    for (let k = 0; k < 4; k++) { S.knobAccelLast[6] = 0; cc(77, 127); }
    assert(onEnd() && sent('t4_au_set_bpm').length >= 4,
           'the view left the end while Tempo turned: ' + led.A + '..' + led.B + ' end ' + endNow());
    back();
    S.clipLength[4][0] = 16;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ a Free clip on SAMPLE (Josh, 2026-11-13: "a mode ... irrespective of the sequencer\'s timing" · "yep"): K7 is Speed and reads out, no Tempo menu or Tempo lane, the view is Start..End with no beats, the Track View strip too', () => {
    const was = GET['t4_au_info_0'];
    S.clipLength[4][0] = 2; S.clipTPS[4][0] = 24;     /* a short clip: a Free clip's view does not follow it */
    GET['t4_au_info_0'] = INFO24(0, 8, 0, 8, 50, 0).replace('|', ' 0 0 0 0 1 1000|');
    kindSync(); ticks(2);
    assert(A.auIsFree(A.auInfo(4, 0)) && A.auInfo(4, 0).speed === 1000, 'the info read does not give Free: ' + JSON.stringify(A.auInfo(4, 0)));
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.full, 'SAMPLE did not open zoomed out');
    const [lo, hi] = E.auViewBounds(ed);
    assert(lo === 0 && hi === 96000, 'a Free clip\'s view is not Start..End: ' + lo + '..' + hi);
    reset();
    note(6, 127);
    S.knobAccelLast[6] = 0; cc(77, 1);
    const tx = globalThis.__texts(() => shown());
    assert(sent('t4_au_set_speed').join() === '0 1010' && !sent('t4_au_set_bpm').length, 'K7 on Free: ' + JSON.stringify(sentLike(/t4_/)));
    assert(tx.indexOf('SPEED 101%') >= 0, 'Speed does not read out: ' + JSON.stringify(tx));
    click(); ticks(1);
    assert(!(ed.pick && ed.pick.tempo), 'touch K7 + click opened the Tempo menu on a Free clip');
    note(6, 0);
    if (ed.pick) { back(); ticks(1); }               /* (it is SAMPLE's own menu: Load · Trim · Normalize) */
    assert(!ed.pick, 'the menu did not close');
    /* no beats under the waveform: the rows under it are empty */
    const f = shown();
    let under = 0;
    for (let x = 0; x < 128; x++) for (let y = 51; y < 54; y++) under += f[y * 128 + x] ? 1 : 0;
    assert(under === 0, 'beats drawn under a Free clip\'s waveform: ' + under + ' px');
    back(); ticks(2);
    /* the Track View says so: "Loop Free 100%" where a Loop clip says its Tempo */
    const ov = globalThis.__texts(() => shown());
    assert(!S.auEditor && ov.some((x) => /^LOOP FREE 100%/.test(x)), 'the Track View does not say Free: ' + JSON.stringify(ov.slice(0, 6)));
    GET['t4_au_info_0'] = was; S.clipLength[4][0] = 16;
    kindSync(); ticks(2);
});

step('⭐⭐ Delete + click resets the page showing only (Josh: "for multi-page banks, we should have delete+jog only reset the active page"): the SLICER editor\'s page 1 the picked slice\'s sound (Shift: every slice\'s Play / Revrs), page 2 its Attk / Decay (Shift: every slice\'s), page 3 the sample\'s Gain / Pitch / Detune', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    A.auSetSelSlice(4, 2);
    toSlicer();
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);   /* page 1: slice 3 */
    let g = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(['play', 'pitch', 'detune', 'rev', 'gain'].every((f) => g.indexOf('t4_au_slice_' + f + '=16 2 0') >= 0) &&
           !sentLike(/_au_slice_(atk|dec)$/).length && !sentLike(/_au_(set|all)_/).length, 'page 1 did not reset slice 3\'s sound only: ' + g);
    reset();
    S.shiftHeld = true;
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);   /* page 1 with Shift: every slice's Play / Revrs */
    S.shiftHeld = false;
    g = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(g.indexOf('t4_au_all_play=16 0') >= 0 && g.indexOf('t4_au_all_rev=16 0') >= 0 && !sentLike(/_au_all_(pitch|detune|gain|atk|dec)$/).length,
           'page 1 with Shift did not reset every slice\'s Play / Revrs only: ' + g);
    jog(1); ticks(1);                                    /* page 2: Attk / Decay */
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    g = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(g.indexOf('t4_au_slice_atk=16 2 0') >= 0 && g.indexOf('t4_au_slice_dec=16 2 0') >= 0 && !sentLike(/_au_slice_(pitch|gain|play)$/).length,
           'page 2 did not reset slice 3\'s Attk / Decay only: ' + g);
    reset();
    click();                                             /* a plain click on page 2: nothing */
    assert(!sentLike(/_au_/).length, 'a plain click reset: ' + JSON.stringify(sentLike(/_au_/)));
    jog(1); ticks(1);                                    /* page 3: the sample's sound */
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    g = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(['gain', 'pitch', 'detune'].every((f) => g.indexOf('t4_au_set_' + f + '=16 0') >= 0) && !sent('t4_au_set_bpm').length && !sent('t4_au_set_sync').length,
           'page 3 did not reset the sample\'s sound only: ' + g);
    leave();
    /* an Audio clip's SAMPLE page 2 TIME / page 3 SOUND, as before */
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    mapPad(2, 3); jog(1); ticks(1);
    S.auInfo[4][0] = Object.assign({}, A.auInfo(4, 0), { sync: 1 });
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    const st = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(sent('t4_au_set_sync').length === 1 && !sentLike(/_au_set_(gain|pitch|detune|dir|bpm|bars)/).length,
           'TIME did not reset its own knobs only: ' + st);
    jog(1); ticks(1);
    reset();
    cc(HC.MoveDelete, 127); click(); cc(HC.MoveDelete, 0);
    const sa = sentLike(/_au_/).map((x) => x[0] + '=' + x[1]).join(' ');
    assert(['gain', 'pitch', 'detune'].every((f) => sa.indexOf('t4_au_set_' + f + '=0 0') >= 0) && !sent('t4_au_set_bpm').length && !sent('t4_au_set_sync').length && !sent('t4_au_set_dir').length,
           'SOUND did not reset its sound only: ' + sa);
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
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
    toSlicer(); ticks(3);                            /* the SLICER editor page 1: every knob works */
    assert(sent8() === '11111111', 'page 1 rings: ' + sent8());
    S.shiftHeld = true; ticks(3);                    /* Shift: every slice's Play / Revrs only — Start, Zoom, End, Pitch, Detune, Gain dark */
    assert(sent8() === '00010010', 'page 1 rings with Shift: ' + sent8());
    S.shiftHeld = false;
    jog(1); ticks(3);                                /* page 2 SHAPE: Attk, Decay */
    assert(sent8() === '11000000', 'page 2 rings: ' + sent8());
    jog(1); ticks(3);                                /* page 3 SAMPLE: Start Zoom End Sync / Pitch Detune Tempo Gain */
    assert(sent8() === '11111111', 'page 3 rings: ' + sent8());
    leave(); ticks(3);
    assert(globalThis.__ring() === null, 'rings kept after leaving the SLICER editor');
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(3);
    S.activeBank = 0;
    mapPad(2, 3); ticks(2);                          /* SAMPLE page 1: K1-K8 (K4 Offset, K8 Gain) */
    assert(lit() === '11111111', 'WAVE rings: ' + lit());
    ticks(3);                                        /* ...and that is what the knobs get */
    assert(sent8() === '11111111', 'the rings sent over WAVE: ' + sent8() + ' ' + JSON.stringify([71, 72, 73, 74, 75, 76, 77, 78].map((x) => CCLEDS.get(x))));
    const g0 = globalThis.__ring()[7].norm;
    cc(78, 1);
    assert(globalThis.__ring()[7].norm > g0, 'the Gain ring did not follow the turn');
    S.knobTurnedTick[7] = S.clockMs - 1000; ticks(1);
    /* ...and Offset's, on K4: how far round the clip it has turned */
    {
        const o0 = globalThis.__ring()[3].norm;
        S.knobAccum[3] = 0; for (let i = 0; i < 10; i++) cc(74, 1);
        assert(globalThis.__ring()[3].norm > o0, 'the Offset ring did not follow the turn: ' + o0 + ' -> ' + globalThis.__ring()[3].norm);
        S.knobAccum[3] = 0; for (let i = 0; i < 10; i++) cc(74, 127);
        S.knobTurnedTick[3] = S.clockMs - 1000; ticks(1);
    }
    /* Loop + jog on SAMPLE: the clip's length a step a detent, as on any clip,
     * the screen staying on its page (Josh, 2026-11-12: "turning jog doesn't
     * adjust it by steps ... it just scrolls to the second sample edit page") */
    {
        const ac = A.auClipOf(4), len0 = S.clipLength[4][ac], pg0 = S.auPanel && S.auPanel.page;
        reset();
        cc(HC.MoveLoop, 127); jog(1); cc(HC.MoveLoop, 0); ticks(2);
        assert(S.clipLength[4][ac] === len0 + 1 && sent('t4_clip_length').join() === String(len0 + 1),
               'Loop + jog on SAMPLE did not lengthen the clip: ' + len0 + ' -> ' + S.clipLength[4][ac] + ' ' + JSON.stringify(sent('t4_clip_length')));
        assert(S.auPanel && S.auPanel.page === pg0, 'Loop + jog turned SAMPLE\'s page: ' + (S.auPanel && S.auPanel.page));
        cc(HC.MoveLoop, 127); jog(-1); cc(HC.MoveLoop, 0); ticks(2);
        assert(S.clipLength[4][ac] === len0, 'Loop + jog left did not shorten it back: ' + S.clipLength[4][ac]);
    }
    jog(1); ticks(3);                                /* SAMPLE page 2 TIME (Loop): Sync, Warp, Nudge, Offset / -, -, Tempo, Bars */
    assert(sent8() === '11110011', 'SAMPLE page 2 rings: ' + sent8());
    jog(1); ticks(3);                                /* page 3 SOUND: -, -, -, - / Pitch, Detune, -, Gain */
    assert(sent8() === '00001101', 'SAMPLE page 3 rings: ' + sent8());
    back();
    /* a Slicer's CLIP bank: K4 (no Legato there) dark, the rest lit (Josh,
     * 2026-11-12: "clip bank knob led rings are lit on empty knobs, which
     * they shouldn't be per the general UI conventions") */
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    S.activeBank = 0; S.bankCardLatched = false; shown(); ticks(3);
    assert(sent8() === '11101111', 'Slicer CLIP bank rings: ' + sent8());
});

step('⭐⭐ the SLICER editor\'s page 1: the picked slice — K1 / K3 its edges, K4-K8 its sound, Shift every slice on Play / Revrs; the corner brackets and CLK EDIT; Shift + click the SLICE menu; an Audio track has no SLICER pad', () => {
    S.activeBank = 0; S.bankCardLatched = false;
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    { const c = P.bankPadMapForMode(C.PAD_MODE_AUDIO, 4)[2].cells[3];
      assert(c && c.name === 'SAMPLE', 'an Audio track\'s instrument pad is not SAMPLE: ' + JSON.stringify(c)); }
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    A.auSetSelSlice(4, 2);
    mapPad(2, 3);
    const ed = S.auEditor;
    assert(ed && ed.ed === 'slicer' && ed.page === 0, 'the SLICER editor did not open on its first page');
    let tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SLICE 3/8') >= 0 && tx.indexOf('1/3') >= 0 && tx.indexOf('EDIT') >= 0, 'page 1: ' + JSON.stringify(tx));
    {   /* the slices drawn through the waveform (slice 1's line at x 16: the middle row cleared), the corner brackets */
        const px = (f, x, y) => f[y * 128 + x];
        const f = shown();
        assert(!px(f, 16, 35), 'page 1 does not draw slice 1 through the waveform');
        assert(px(f, 0, 19) && px(f, 127, 19) && px(f, 0, 50) && px(f, 127, 50), 'no corner brackets round the waveform (click to enter)');
    }
    reset();
    cc(71, 1);
    assert(sent('t4_au_slice_start').length === 1 && !sent('t4_au_set_start').length, 'K1 is not the slice\'s start: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    for (let i = 0; i < 20 && !sent('t4_au_slice_rev').length; i++) cc(77, 1);
    assert(sent('t4_au_slice_rev').join() === '16 2 1', 'K7 is not the slice\'s Revrs: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_slice_rev').length < 2; i++) cc(77, 127);
    reset();
    S.knobTouched = -1; S.shiftHeld = true;
    for (let i = 0; i < 20 && !sent('t4_au_all_play').length; i++) cc(74, 1);
    tx = globalThis.__texts(() => shown());
    assert(sent('t4_au_all_play').length === 1 && tx.some((x) => /^ALL PLAY /.test(x)),
           'Shift + K4 is not every slice\'s Play: ' + JSON.stringify(sentLike(/_au_/)) + ' ' + JSON.stringify(tx));
    S.shiftHeld = false; S.knobTouched = -1;
    for (let i = 0; i < 20 && sent('t4_au_all_play').length < 2; i++) { S.shiftHeld = true; cc(74, 127); S.shiftHeld = false; }
    reset();
    shiftClick();
    assert(ed.pick && ed.pick.menu === 'slices' && E.auPickRows(ed).map((r) => r.label).join() === 'Load sample,Even,Transient,Lazy,Clear all,Convert to kit',
           'Shift + click did not open the SLICE menu: ' + JSON.stringify(ed.pick));
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('SLICES') >= 0, 'the menu is not headed SLICES: ' + JSON.stringify(tx.slice(0, 3)));
    back();
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the SLICE menu onto page 1');
    back(); ticks(2);
    assert(!S.auEditor && S.activeBank === 0, 'Back from the SLICER editor did not return to the bank it was on: ' + S.activeBank);
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
    mapPad(2, 3); ticks(2);
    assert(S.auEditor && S.auEditor.ed === 'slicer' && S.auEditor.c === 16, 'the SLICER editor did not open on the Slicer\'s sample');
    sideB();
    assert(S.auEditor && S.auEditor.c === 16 && S.auEditor.ed === 'slicer' && A.auSeqClipOf(4) === 1,
           'the SLICER editor left the Slicer\'s sample on clip B: ' + JSON.stringify(S.auEditor && { c: S.auEditor.c, ed: S.auEditor.ed, seq: A.auSeqClipOf(4) }));
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
    const f2 = shown();                               /* drawn at once (a tick would re-read this rig's fixed info) */
    /* ...and zoomed out the view keeps a margin past the window, the file
     * running on there dithered (Josh, 2026-11-16: the parts outside Start /
     * End "not when you're zoomed all the way out, which is disorienting") */
    const win = Math.round(384 * A.auFpt(A.auInfo(4, 0))), pad = Math.round(win * E.AU_VIEW_PAD);
    assert(A.auInfo(4, 0).bpm10 >= 1680 && ed.A === 0 && ed.B === Math.min(win + pad, 96000) && ed.B < want,
           'turning Tempo up did not shorten the clip\'s window (+ its margin) in the sample: ' + ed.A + '..' + ed.B + ' at ' + A.auInfo(4, 0).bpm10 + ' window ' + win);
    const winX = Math.floor(win / (ed.B - ed.A) * 128);
    let dith = 0, solid = 0;
    for (let x = winX + 3; x < 127; x++) for (let y = 22; y < 48; y++) { if (f2[y * 128 + x]) dith++; else solid++; }
    assert(winX < 120 && dith > 0, 'zoomed out, nothing of the file shows past the window (x ' + winX + '..127)');
    back(); ticks(2);
    S.activeBank = 0;
    /* Track View at rest says the Audio clip's Tempo on its info row (Josh: "LOOP 112") */
    GET['t4_au_info_0'] = INFO24(0, 8, 8, 0, 50, 0); kindSync(); ticks(2);
    S.knobTouched = -1; S.bankCardLatched = false;
    const rtx = globalThis.__texts(() => shown());
    assert(rtx.some((x) => /^loop 84 /i.test(x)), 'the info row does not carry the Tempo: ' + JSON.stringify(rtx.slice(0, 4)));
    /* ...and a Shot clip says Shot, not Loop (Josh, 2026-11-13: "make it say shot") */
    S.auInfo[4][0] = Object.assign({}, A.auInfo(4, 0), { shot: 1 });
    const stx = globalThis.__texts(() => shown());
    assert(stx.some((x) => /^shot 84 /i.test(x)) && !stx.some((x) => /^loop 84 /i.test(x)),
           'a Shot clip\'s info row does not say Shot: ' + JSON.stringify(stx.slice(0, 4)));
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐ Start / End read in seconds to 2 decimals, rounded (Josh: "2 decimals, rounded, for the seconds read-out is fine")', () => {
    assert(A.auFmtTime(55125, 44100) === '1.25s' && A.auFmtTime(237, 44100) === '0.01s' &&
           A.auFmtTime(44100 * 12.346, 44100) === '12.35s' && A.auFmtTime(44100 * 75.5, 44100) === '1:15.50',
           [A.auFmtTime(55125, 44100), A.auFmtTime(237, 44100), A.auFmtTime(44100 * 12.346, 44100), A.auFmtTime(44100 * 75.5, 44100)].join());
});

step('⭐⭐ the chopping tools are the SLICE menu\'s (Shift + click on page 1 or 2); page 3\'s menu has none — only what deals with the whole file (Josh, 2026-11-15)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);   /* a hand set of 8, Even Off */
    mapPad(2, 3);
    const ed = S.auEditor;
    jog(1); jog(1); ticks(1);                       /* page 3 */
    reset();
    shiftClick(); ticks(2);
    assert(ed.pick && ed.pick.menu === 'sample' && !E.auPickRows(ed).some((r) => /even|transient|lazy|kit|clear/.test(r.id)),
           'page 3\'s menu offers chopping: ' + JSON.stringify(E.auPickRows(ed).map((r) => r.id)));
    assert(sentLike(/mark_add/).length === 0, 'Shift + click also added a slice');
    back(); ticks(2);
    assert(!ed.pick && S.auEditor === ed, 'Back did not close the menu onto page 3');
    jog(-1); ticks(1);                              /* page 2: Shift + click is the SLICE menu too */
    shiftClick(); ticks(2);
    assert(ed.pick && ed.pick.menu === 'slices', 'Shift + click on page 2 is not the SLICE menu: ' + JSON.stringify(ed.pick));
    {
        const tx = globalThis.__texts(() => shown());
        assert(tx.indexOf('EXIT') >= 0 && tx.indexOf('UP') < 0, 'the SLICE menu\'s Back hint: ' + JSON.stringify(tx));
    }
    back();
    assert(!ed.pick && S.auEditor === ed && ed.page === 1, 'Back did not close the SLICE menu onto page 2');
    leave();
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
});

step('⭐⭐ the SLICE menu › Convert to kit (Josh, 2026-10-30: "convert to kit. creates a move drum rack kit with 32 pad max ... carrying over slice pitch, decay, gain, etc." · 2026-11-14: "an offline resample of the entire sample of its sample-wide settings before exporting?" · "at most 2 samples — one reversed and one not"): the engine bakes the range; a pad per slice in it, playing its fraction of the bake (a backwards one, of the reverse)', () => {
    /* the range 12000..84000 of 96000: slice 1 (0..12000) lies outside it */
    GET['t4_au_info_0'] = INFO(1, 8, 0).replace(' 16 0 96000 ', ' 16 12000 84000 '); kindSync(); ticks(2);
    GET['t4_au_sl_0_1'] = '12000 24000 0 2 0 0 1 10 250 7 1';    /* Pitch +2, Gate, Attk 10 ms, Decay 250 ms, Detune 7 */
    GET['t4_au_sl_0_2'] = '24000 36000 0 0 -3 1 0 0 0 0 1';      /* Gain -3, Revrs, One */
    GET['t4_au_sl_0_3'] = '36000 48000 0 0 0 0 2 0 0 0 1';       /* Thru: on to the range's End */
    S.currentSetName = 'My Song';
    const SAMP = '/data/UserData/UserLibrary/Samples/dAVEBOx/Exported kits/My Song 5.wav';
    const KIT = '/data/UserData/UserLibrary/Track Presets/dBx-slice/My Song 5.ablpreset';
    const cmds = [], files = {}, bakes = [];
    const cmd0 = globalThis.host_system_cmd, wr0 = globalThis.host_write_file, set0 = globalThis.host_module_set_param;
    globalThis.host_system_cmd = (c) => { cmds.push(String(c)); return 0; };
    globalThis.host_write_file = (path, body) => { files[String(path)] = String(body); return wr0(path, body); };
    /* the engine's bake: asked, then (a tick later) done with 1.5 dB of the Gain left to the pads */
    globalThis.host_module_set_param = (k, v) => {
        set0(k, v);
        const m = String(k) === 't4_au_kit' && /^([01]) (\d+)\|(.*)$/.exec(String(v));
        if (m) bakes.push({ rev: m[1] === '1', seq: m[2], path: m[3] });   /* (the engine's answer, below) */
    };
    GET['t4_au_kit'] = '2 0 0.00 7';                  /* an earlier kit's answer, still there: a read can overtake the write */
    const bulk = [], gp0 = globalThis.host_module_get_params;
    globalThis.host_module_get_params = (blob) => { bulk.push(String(blob)); return ''; };
    try {
        mapPad(2, 3);
        const ed = S.auEditor;
        shiftClick();                                     /* the SLICE menu */
        const rows = E.auPickRows(ed);
        for (let k = 0; k < rows.findIndex((r) => r.id === 'kit'); k++) jog(1);
        click();
        assert(!ed.pick && S.pendingAuKit, 'the row did not ask for the kit');
        ticks(2);
        assert(bakes.length === 1 && bakes[0].path === SAMP && bakes[0].rev, 'the bake asked: ' + JSON.stringify(bakes));
        assert(cmds.length === 0, 'the sample was copied as it is: ' + JSON.stringify(cmds));
        assert(!Object.keys(files).some((k) => k.indexOf('/Track Presets/dBx-slice/') >= 0), 'the preset was written on an earlier kit\'s answer');
        GET['t4_au_kit'] = '1 0 0.00 ' + bakes[0].seq; ticks(10);   /* the engine took it: baking */
        assert(!Object.keys(files).some((k) => k.indexOf('/Track Presets/dBx-slice/') >= 0), 'the preset was written before the bake was in');
        assert((S.actionPopupLines || []).join('|') === 'CONVERT TO KIT|Baking|My Song 5', 'no word while it bakes: ' + JSON.stringify(S.actionPopupLines));
        GET['t4_au_kit'] = '2 0 1.50 ' + bakes[0].seq;
        ticks(10);
        const kitPath = Object.keys(files).find((k) => k.indexOf('/Track Presets/dBx-slice/') >= 0);
        assert(kitPath, 'no kit written: ' + Object.keys(files).join());
        assert((S.actionPopupLines || []).join('|') === 'KIT SAVED|My Song 5|6 pads', 'notice: ' + JSON.stringify(S.actionPopupLines));
        const slBulk = bulk.filter((b) => /_au_sl_/.test(b));
        assert(slBulk.length === 1 && /t4_au_sl_\d+_0/.test(slBulk[0]) && /t4_au_sl_\d+_7/.test(slBulk[0]),
               'the slices were not read in one round trip: ' + slBulk.length + ' bulk reads');
        const kit = JSON.parse(files[kitPath]);
        /* numbers as Ableton writes them: floats keep ".0", the note / choke /
         * transpose fields are integers */
        assert(/"Volume": 0\.0\b/.test(files[kitPath]) && /"receivingNote": 36,/.test(files[kitPath]) &&
               /"Voice_Transpose": 2,/.test(files[kitPath]) && !/"Volume": 0,/.test(files[kitPath]), 'numbers not as Ableton writes them');
        assert(kit.kind === 'instrumentRack', 'the rack: ' + kit.kind);
        /* a native preset as Move writes one: schema 1.8.3, the drum rack with its
         * reverb return, then the rack-wide saturator */
        assert(/\/1\.8\.3\/devicePreset\.json$/.test(kit.$schema), 'schema: ' + kit.$schema);
        assert(kit.chains[0].devices.map((d) => d.kind).join() === 'drumRack,saturator' &&
               kit.chains[0].devices[0].returnChains[0].devices[0].kind === 'reverb', 'not a native drum rack preset');
        const pads = kit.chains[0].devices[0].chains;
        assert(kit.chains[0].devices[0].kind === 'drumRack' && pads.length === 16, 'pads: ' + pads.length + ' (6 slices in the range, filled to 16)');
        const cell = (k) => pads[k].devices[0];
        const uri = 'ableton:/user-library/Samples/dAVEBOx/Exported%20kits/My%20Song%205.wav';
        const ruri = 'ableton:/user-library/Samples/dAVEBOx/Exported%20kits/My%20Song%205%20rev.wav';
        assert(pads.every((p, k) => p.drumZoneSettings.receivingNote === 36 + k), 'notes are not 36 up');
        assert(pads.slice(0, 6).every((p, k) => cell(k).deviceData.sampleUri === (k === 1 ? ruri : uri) && p.drumZoneSettings.chokeGroup === 1),
               'the slices do not play the bake (slice 3 its reverse) in choke group 1: ' + pads.slice(0, 6).map((p, k) => cell(k).deviceData.sampleUri).join());
        assert(pads.slice(6).every((p, k) => cell(6 + k).deviceData.sampleUri === null), 'pads past the slices (and slice 8, past End) are not empty');
        const near = (x, y) => Math.abs(x - y) < 1e-9;
        const c0 = cell(0).parameters, c1 = cell(1).parameters, c2 = cell(2).parameters, c5 = cell(5).parameters;
        const rem = Math.pow(10, 1.5 / 20);
        /* pad 1 is slice 2 (slice 1 lies outside the range): its sixth of it */
        assert(near(c0.Voice_PlaybackStart, 0) && near(c0.Voice_PlaybackLength, 1 / 6) && c0.Voice_Transpose === 2 && c0.Voice_Detune === 7 &&
               c0.Voice_Envelope_Mode === 'A-S-R' && c0.Voice_Envelope_Attack === 0.01 && near(c0.Voice_Gain, rem) &&
               c0.Voice_Envelope_Hold === 0 && near(c0.Voice_Envelope_Decay, 0.25) /* the slice's ms as they are: both decay on the drum cell's curve */,
               'pad 1 (slice 2): ' + JSON.stringify(c0));
        /* slice 3 backwards: 1/6..2/6 of the range, mirrored in the reverse */
        assert(near(c1.Voice_PlaybackStart, 4 / 6) && near(c1.Voice_PlaybackLength, 1 / 6) && near(c1.Voice_Gain, Math.pow(10, -1.5 / 20)) &&
               c1.Voice_Envelope_Hold === 60 && c1.Voice_Envelope_Mode === 'A-H-D', 'pad 2 (slice 3, Revrs): ' + JSON.stringify(c1));
        /* slice 4 Thru: from 2/6 on to the range's End */
        assert(near(c2.Voice_PlaybackStart, 2 / 6) && near(c2.Voice_PlaybackLength, 4 / 6) && c2.Voice_Envelope_Mode === 'A-H-D', 'pad 3 (slice 4, Thru): ' + JSON.stringify(c2));
        assert(near(c5.Voice_PlaybackStart, 5 / 6) && near(c5.Voice_PlaybackLength, 1 / 6), 'pad 6 (slice 7, the last in the range): ' + JSON.stringify(c5));
        /* velocity as a stock kit's (0.35), the Volume putting a velocity-127 hit at
         * the slice's level: the drum cell's law boosts past unity above 70 */
        const vg = (vel, p) => Math.pow(10, ((vel - 70) * p.Voice_VelocityToVolume * 0.4 + p.Volume) / 20);
        assert(near(c0.Voice_VelocityToVolume, 0.35) && near(vg(127, c0), 1) && vg(100, c0) < 1 && vg(127, c5) <= 1 + 1e-9,
               'a hard hit lands on the slice\'s level, no louder: ' + JSON.stringify({ v: c0.Voice_VelocityToVolume, vol: c0.Volume }));
        assert(S.auEditor === ed && !ed.pick, 'the kit did not leave the SLICER editor up');
        /* the names: the project and the track (a Slicer's sample is the track's) — "My Song 5" */
        assert(kitPath === KIT && kit.name === 'My Song 5', 'the kit\'s name: ' + JSON.stringify({ kitPath, name: kit.name }));
    } finally {
        globalThis.host_system_cmd = cmd0; globalThis.host_write_file = wr0; globalThis.host_module_get_params = gp0;
        globalThis.host_module_set_param = set0;
        for (const k of ['t4_au_sl_0_1', 't4_au_sl_0_2', 't4_au_sl_0_3', 't4_au_kit']) delete GET[k];
        GET['t4_au_info_0'] = INFO(1, 8, 0);
        leave(); ticks(2);
        S.actionPopupLines = []; S.actionPopupEndTick = 0;     /* the notice is a card over later screens */
    }
});

step('⭐⭐ Even (the SLICE menu › Even): a TOOL — it writes that many even slices at once, from the count there is, the jog live on the pads; the visit is one undo step; Back keeps the cut, a click keeps it AND lands in the slice editor at the same view (Josh, 2026-11-15)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3);
    const ed = S.auEditor;
    const setP = globalThis.host_module_set_param;
    globalThis.host_module_set_param = (k, v) => {     /* the engine writes Even's chops, as the real one does: even 0, n N */
        setP(k, v);
        if (String(k) === 't4_au_set_even') { const e = parseInt(String(v).split(' ')[1], 10); GET['t4_au_info_0'] = INFO(1, e, 0); }
    };
    try {
        reset();
        shiftClick(); jog(1); click();                /* the SLICE menu › Even */
        /* (the count it opens on is the chops there are — 8 here; a sample
         * just picked is cut 16 even by the engine, so it opens at 16 there —
         * Josh: "even 16.") */
        assert(ed.mode === 'chop' && ed.chop.kind === 'even' && sent('t4_au_set_even').join() === '16 8',
               'Even did not open its editor on the chops there are: ' + JSON.stringify(sent('t4_au_set_even')) + ' ' + JSON.stringify({ mode: ed.mode, chop: ed.chop, ed: ed.ed, same: S.auEditor === ed }));
        assert(sent('t4_au_undo_slc').length === 1, 'opening Even is not one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
        assert(A.auInfo(4, 16).even === 0 && A.auInfo(4, 16).n === 8, 'Even left a setting behind: ' + JSON.stringify(A.auInfo(4, 16)));
        let tx = globalThis.__texts(() => assert(inked(shown()), 'Even draws nothing'));
        assert(tx.indexOf('EVEN') >= 0 && tx.indexOf('8 SLICES') >= 0 && tx.indexOf('EDIT') >= 0 && tx.indexOf('MANUAL') < 0, 'Even screen: ' + JSON.stringify(tx));
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
        /* a click: the cut kept, and straight into the slice editor at the same view */
        GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
        reset();
        shiftClick(); jog(1); click(); jog(1);
        const A0 = ed.A, B0 = ed.B;
        click();
        assert(!ed.ask && ed.mode === 'chop' && ed.chop && ed.chop.kind === 'manual' && sent('t4_au_set_even').join() === '16 8,16 9' && A.auInfo(4, 16).n === 9,
               'a click did not keep the cut and enter the slice editor: ' + JSON.stringify({ ask: ed.ask, mode: ed.mode, chop: ed.chop, sent: sentLike(/_au_/) }));
        assert(ed.A === A0 && ed.B === B0 && ed.cur >= A0 && ed.cur <= B0, 'the slice editor did not open at the same view: ' + [A0, B0, ed.A, ed.B, ed.cur].join());
        assert(sent('t4_au_undo_slc').length === 1, 'the second visit is not its own undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
        back();
        assert(ed.mode === 'wave' && ed.page === 0, 'Back from the slice editor did not return to page 1');
        /* one chop or none to start from (a cleared Manual): Even opens at 16 */
        GET['t4_au_info_0'] = INFO(1, 1, 0); kindSync(); ticks(2);
        reset();
        shiftClick(); jog(1); click();
        assert(sent('t4_au_set_even').join() === '16 16', 'Even from one slice did not open at 16: ' + JSON.stringify(sent('t4_au_set_even')));
        back();
        /* the count read out while the jog turns: the chops written, 18 */
        assert(countTx.indexOf('COUNT 18') >= 0, 'the count is not read out while the jog turns: ' + JSON.stringify(countTx));
    } finally {
        globalThis.host_module_set_param = setP;
        leave();
        GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
    }
});

step('⭐⭐ Transient (the SLICE menu › Transient): the REAL gesture — on, the jog turns Sens and writes the slices at it, the marks follow; the visit is one undo step; Back keeps the cut, a click keeps it and enters the slice editor (Josh)', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); kindSync(); ticks(2);
    mapPad(2, 3);
    const ed = S.auEditor;
    reset();
    shiftClick(); jog(1); jog(1); click();            /* the SLICE menu › Transient */
    assert(ed.mode === 'chop' && ed.chop.kind === 'transient' && sent('t4_au_set_trans').join() === '16 1',
           'Transient did not open: ' + JSON.stringify(sentLike(/_au_/)));
    assert(sent('t4_au_undo_slc').length === 1, 'opening Transient is not one undo step: ' + JSON.stringify(sent('t4_au_undo_slc')));
    let tx = globalThis.__texts(() => assert(inked(shown()), 'Transient draws nothing'));
    assert(tx.indexOf('TRANSIENT') >= 0 && tx.some((x) => / SLICES$/.test(x)), 'Transient screen: ' + JSON.stringify(tx));
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
    assert(tx.indexOf('4 SLICES') >= 0, 'the count: ' + JSON.stringify(tx));
    /* more than 128 hits: the first 128 (Josh: "keep the first 128") */
    GET['t4_au_info_0'] = INFO24(1, 128, 0, 211, 53, 0); kindSync(); ticks(3);
    tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('128+ SLICES') >= 0, 'over the cap: ' + JSON.stringify(tx));
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 53, 0); kindSync(); ticks(3);
    /* K2 Zoom alone: the sample's knobs are page 3's, the slice's page 1's */
    assert(globalThis.__ring().map((c) => (c ? 1 : 0)).join('') === '01000000', 'Transient rings: ' + globalThis.__ring().map((c) => (c ? 1 : 0)).join(''));
    reset();
    back();
    /* what it wrote stays — nothing baked, nothing put back (Josh, 2026-11-02, R6: "Yes") */
    assert(!ed.ask && ed.mode === 'wave' && S.auEditor === ed && !sentLike(/_au_(trans_bake|set_trans|set_even)$/).length && A.auInfo(4, 16).n === 4,
           'Back did not keep the chops, without asking: ' + JSON.stringify(sentLike(/_au_/)));
    /* a click: the same */
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    reset();
    shiftClick(); jog(1); jog(1); click();
    const nTrans = sent('t4_au_set_trans').length;
    click();
    assert(!ed.ask && ed.mode === 'chop' && ed.chop && ed.chop.kind === 'manual' && sent('t4_au_set_trans').length === nTrans && !sent('t4_au_trans_bake').length,
           'a click did not keep the cut and enter the slice editor: ' + JSON.stringify(sentLike(/_au_/)));
    back();
    assert(S.auEditor === ed && ed.mode === 'wave', 'Back did not leave the slice editor for page 1');
    back();
    assert(!S.auEditor, 'the SLICER editor did not close');
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

step('⭐⭐ a Slicer\'s Trim cuts the file to its range (page 3\'s Start / End, a strip pixel a detent) and keeps the slices — no screen of its own; New / Overwrite asked as on Audio; nothing to cut says so; Normalize asks too (Josh, 2026-11-15: "keep them")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.c === 16 && ed.ed === 'slicer', 'the SLICER editor did not open on the Slicer\'s sample');
    jog(1); jog(1); ticks(1);                       /* page 3 */
    const menu = (row) => { click(); ticks(1); for (let i = 0; i < row; i++) jog(1); click(); ticks(1); };
    reset();
    menu(1);                                         /* Trim, the range the whole file: nothing to cut */
    assert(!ed.ask && ed.mode !== 'trim' && !sent('t4_au_edit').length, 'Trim with nothing to cut asked, sent or opened a screen');
    S.actionPopupEndTick = 0;
    note(0, 127); cc(71, 1); note(0, 0);             /* K1: the range's Start, a strip pixel (96000 / 92) */
    assert(sent('t4_au_set_start').join() === '16 1043', 'K1 is not the range\'s Start by a strip pixel: ' + JSON.stringify(sentLike(/_au_/)));
    S.knobAccelLast[2] = 0; cc(73, 127);             /* K3: the range's End, a pixel back */
    assert(sent('t4_au_set_end').join() === '16 94957', 'K3 is not the range\'s End: ' + JSON.stringify(sentLike(/_au_/)));
    /* the engine answers with its range (this rig's stub does not keep sets) */
    const RANGED = '2 0 1 8 1 16 1043 94957 0 0 96000 48000 2 0 0 0 8 0 0 96000 840 8 50 0 0 0 0 94957 0 0 1000 0|Break Phenom 84 bpm.wav';
    GET['t4_au_info_0'] = RANGED; kindSync(); ticks(2);
    assert(A.auInfo(4, 16).rstart === 1043 && A.auPlayedEnd(4, 16, A.auInfo(4, 16)) === 94957, 'the range was not read back: ' + JSON.stringify(A.auInfo(4, 16)));
    S.undoAvailable = false;
    reset();
    menu(1);
    assert(ed.ask && ed.ask.op === 'trim' && ed.ask.sel === 0, 'Trim did not ask, on New: ' + JSON.stringify(ed.ask));
    {
        const qtx = globalThis.__texts(() => shown());
        const wtx = globalThis.__texts(() => frame(() => D.drawAudioAsk('TRIM', ['Cut the file to', 'Start-End. Slices stay.'], 0, ['Overwrite', 'New'])));
        assert(JSON.stringify(qtx) === JSON.stringify(wtx), 'the Trim question is not on screen: ' + JSON.stringify(qtx));
    }
    click(); ticks(1);
    assert(!ed.ask && sent('t4_au_edit').join() === '16 0 0' && S.undoAvailable, 'New did not cut to the range into a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    GET['t4_au_info_0'] = RANGED; kindSync(); ticks(2);
    /* Overwrite: no undo step */
    reset(); S.undoAvailable = false;
    menu(1); jog(-1); click(); ticks(1);
    assert(sent('t4_au_edit').join() === '16 0 1' && !S.undoAvailable, 'Overwrite: ' + JSON.stringify(sent('t4_au_edit')));
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    /* Normalize › New */
    reset();
    menu(2);
    const tx = globalThis.__texts(() => shown());
    assert(ed.ask && ed.ask.op === 'norm' && tx.indexOf('NORMALIZE') >= 0, 'Normalize did not ask: ' + JSON.stringify(tx));
    click(); ticks(1);
    assert(sent('t4_au_edit').join() === '16 1 0', 'Normalize did not make a new sample: ' + JSON.stringify(sent('t4_au_edit')));
    leave(); ticks(2);
    S.actionPopupEndTick = 0;
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ Tempo\'s menu: touch Tempo + click on SAMPLE, either page, offers Fit to clip (an Audio clip\'s) and Original tempo (Josh, 2026-11-02: "fit to clip" · "(once)" · "both on a small pop-up menu that shows when you touch click tempo" · "menu should be "Fit to clip" "Original tempo""); Fit sets the Bars once so Start to its end fills the clip (Josh, 2026-11-13: Bars beside Tempo), one undo step, out of range said', () => {
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
    assert(sent('t4_au_set_bars').join() === '0 384' && !sent('t4_au_set_bpm').length,
           'Fit to clip did not set 1 bar: ' + JSON.stringify(sentLike(/_au_set_/)));
    assert(sent('t4_au_undo').join() === '0' && S.undoAvailable, 'not an undo step: ' + JSON.stringify(sent('t4_au_undo')));
    const ord = sets.map((x) => x[0]).concat(S.pendingDefaultSetParams.map((e) => e.key));
    assert(ord.indexOf('t4_au_undo') < ord.indexOf('t4_au_set_bars'), 'the Bars went before the undo step: ' + ord.join());
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
    note(6, 127); ticks(1);
    assert(/TEMPO/i.test(say()), 'page 2: touching Tempo does not offer its menu: ' + say());
    click(); note(6, 0); ticks(1);
    assert(ed.pick && ed.pick.tempo, 'page 2: touch K7 + click did not open Tempo\'s menu');
    reset();
    jog(1); click(); ticks(1);
    assert(sent('t4_au_set_orig').join() === '0 0' && !sent('t4_au_set_bpm').length, 'Original tempo: ' + JSON.stringify(sentLike(/_au_/)));
    assert(/ORIGINAL TEMPO/.test((S.actionPopupLines || []).join(' ')), 'notice: ' + JSON.stringify(S.actionPopupLines));
    assert(!ed.pick, 'the menu stayed open');
    S.clipLoopStart[4][0] = 16;
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0); kindSync(); ticks(2);
    reset();
    touchClick(6); ticks(1); click(); ticks(1);
    assert(sent('t4_au_set_bars').join() === '0 768' && /240 BPM/.test((S.actionPopupLines || []).join(' ')),
           'page 2, a loop starting at bar 2: ' + JSON.stringify(sent('t4_au_set_bars')) + ' ' + JSON.stringify(S.actionPopupLines));
    /* Back closes the menu, nothing set */
    reset();
    touchClick(6); ticks(1); back(); ticks(1);
    assert(!ed.pick && S.auEditor === ed && !sentLike(/_au_set_/).length, 'Back did something: ' + JSON.stringify(sentLike(/_au_/)));
    jog(-1); ticks(1);
    S.clipLoopStart[4][0] = 0;
    /* a Start a few frames from the end: past 999.9 BPM, nothing set */
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0).replace(' 16 0 96000 ', ' 16 95990 96000 '); kindSync(); ticks(2);
    reset(); S.undoAvailable = false;
    touchClick(6); ticks(1); click(); ticks(1);
    assert(!sent('t4_au_set_bpm').length && !sent('t4_au_set_bars').length && !sent('t4_au_undo').length && !S.undoAvailable, 'out of range set something');
    assert((S.actionPopupLines || []).join(' ') === 'FIT TO CLIP Out of range', 'notice: ' + JSON.stringify(S.actionPopupLines));
    /* WITH AN END, the same menu: Fit to clip fits Start..End — 3 bars at
     * 84 BPM into the 1-bar clip: 1 bar, the sample's Tempo 84 / 3 = 28 */
    const bar84 = 48000 * 240 / 84, endF = Math.round(3 * bar84);
    GET['t4_au_info_0'] = INFO24(0, 4, 0, 4, 50, 0).replace(' 16 0 96000 0 0 96000 48000 ', ' 16 0 ' + endF + ' 0 0 900000 48000 ').replace('|', ' 0 0 ' + endF + ' 0|');
    S.clipLength[4][0] = 16; kindSync(); ticks(3);
    assert(A.auInfo(4, 0).cut === endF, 'setup: no End read: ' + JSON.stringify(A.auInfo(4, 0)));
    touchClick(6); ticks(1);
    assert(ed.pick && ed.pick.tempo && E.auPickRows(ed).map((r) => r.label).join() === 'Fit to clip,Original tempo', 'with an End, Tempo\'s menu: ' + E.auPickRows(ed).map((r) => r.label));
    reset();
    click(); ticks(1);
    assert(sent('t4_au_set_bars').join() === '0 384' && (S.actionPopupLines || []).join(' ') === 'FIT TO CLIP 28 BPM' && S.clipLength[4][0] === 16,
           'Fit to clip with an End: ' + JSON.stringify(sentLike(/t4_/)) + ' ' + JSON.stringify(S.actionPopupLines));
    /* a Slicer: Original tempo only (its clips are sequences: nothing to fit),
     * from Tempo on the SLICER editor's page 3 */
    back(); ticks(2);
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    mapPad(2, 3); ticks(2);
    jog(1); jog(1); ticks(1);
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
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);   /* an Audio clip's SAMPLE (a Slicer's: page 3's menu) */
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
    /* an Audio clip's: the pick names the clip, 0 */
    assert(sent('t4_au_pick').join() === '0|/data/CoreLibrary/Samples/Loops/Break.wav', 'pick: ' + sent('t4_au_pick'));
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

step('⭐⭐ SAMPLE on an Audio clip: K1 Start · K2 Zoom · K3 End · K4 Offset · K5 Pitch · K8 Gain; no chops, no cursor', () => {
    GET['t4_au_info_0'] = INFO(0, 8); kindSync(); ticks(2);
    mapPad(2, 3);
    assert(E.auWaveSub(S.auEditor) === 'loop', 'not the loop view');
    reset();
    cc(71, 1);
    assert(sent('t4_au_set_start').join() === '0 750', 'K1 Start: ' + JSON.stringify(sent('t4_au_set_start')));
    for (let i = 0; i < 10; i++) cc(75, 1);
    assert(sent('t4_au_set_pitch').join() === '0 1', 'K5 Pitch: ' + JSON.stringify(sent('t4_au_set_pitch')));
    cc(78, 127);
    assert(sent('t4_au_set_gain').join() === '0 -1' && !sent('t4_au_set_revrs').length, 'K8 Gain: ' + JSON.stringify(sent('t4_au_set_gain')));
    assert(inked(shown()), 'the loop view draws nothing');
    /* ⭐⭐ K4 Offset (Josh, 2026-11-13: "offset ... on knob 4 on the waveform
     * view knobs" · "have an arrow on the waveform indicate where it is"): a
     * step a pick, read out in the middle, and an arrow on top where the
     * sample's Start lands in the clip */
    {
        const arrowAt = (f, px) => [-2, -1, 0, 1, 2].every((d) => f[20 * 128 + px + d]) && [-1, 0, 1].every((d) => f[21 * 128 + px + d]) &&
                                   f[22 * 128 + px] && !f[22 * 128 + px - 1] && !f[22 * 128 + px + 1];
        const ed = S.auEditor;
        assert(arrowAt(shown(), 2), 'no Offset arrow at the window\'s left edge with no Offset');
        reset();
        const tx = globalThis.__texts(() => { note(3, 127); S.knobAccum[3] = 0; for (let i = 0; i < 10; i++) cc(74, 1); shown(); });
        note(3, 0);
        const tps = S.clipTPS[4][0] || 24;
        assert(sent('t4_au_set_rot').join() === '0 ' + tps && tx.some((x) => /^OFFSET 1\//.test(x)), 'K4 Offset: ' + JSON.stringify(sent('t4_au_set_rot')) + ' ' + JSON.stringify(tx));
        const i1 = A.auInfo(4, 0), px = Math.floor(((i1.rstart | 0) + tps * A.auFpt(i1) - ed.A) / (ed.B - ed.A) * 128 + 1e-6);   /* Start (K1 moved it) + a step */
        const fr = shown();
        assert(px > 4 && arrowAt(fr, px), 'the Offset arrow is not where the Start lands (x ' + px + '): row 20 ' + [...Array(128).keys()].map((x) => fr[20 * 128 + x]).join(''));
        S.knobAccum[3] = 0; for (let i = 0; i < 10; i++) cc(74, 127);
        assert(A.auInfo(4, 0).rot === 0, 'Offset did not turn back: ' + A.auInfo(4, 0).rot);
    }
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

step('⭐⭐ Lazy (the SLICE menu › Lazy): the next pad white, taps cut; Back ends it keeping them, no question, and stays on WAVE; played out, the same', () => {
    mapPad(2, 3);
    reset();
    shiftClick(); jog(1); jog(1); jog(1); click();                 /* SLICES › Lazy */
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
    shiftClick(); jog(1); jog(1); jog(1); click();
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
    mapPad(2, 3); reset();
    shiftClick(); jog(1); jog(1); jog(1); click();                 /* SLICES › Lazy */
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
    shiftClick(); jog(1); jog(1); jog(1); click();
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

step('⭐⭐ the SLICER editor zoomed out shows the range (here the whole sample); the slice editor\'s cursor stays inside the range (Josh, 2026-11-14: no way of making slices leaves the range)', () => {
    GET['t4_au_info_0'] = INFO24(1, 4, 0, 4, 50, 0);
    GET['t4_au_marks_0'] = '0 24000 24000 48000 48000 72000 72000 96000';
    kindSync(); ticks(2);
    mapPad(2, 3); ticks(2); shown();
    const ed = S.auEditor;
    assert(ed.ed === 'slicer' && ed.full && ed.A === 0 && ed.B === 96000, 'page 1 zoomed out is not the range: ' + ed.A + '..' + ed.B);
    click();                                           /* into the slice editor */
    assert(ed.chop && ed.chop.kind === 'manual', 'the slice editor did not open');
    for (let i = 0; i < 300; i++) jog(-1);
    assert(ed.cur >= 0, 'the cursor left the range: ' + ed.cur);
    for (let i = 0; i < 300; i++) jog(1);
    assert(ed.cur < 96000, 'the cursor left the range: ' + ed.cur);
    while (S.auEditor) { back(); ticks(1); }
    /* a narrower range: the cursor is held inside it */
    const RANGED = '2 0 1 4 1 16 24000 72000 0 0 96000 48000 2 0 0 0 4 0 0 48000 840 4 50 0 0 0 0 72000 0 0 1000 0|Break Phenom 84 bpm.wav';
    GET['t4_au_info_0'] = RANGED; kindSync(); ticks(2);
    mapPad(2, 3); ticks(2); shown();
    click();
    for (let i = 0; i < 300; i++) jog(-1);
    assert(S.auEditor.cur >= 24000, 'the cursor went before Start: ' + S.auEditor.cur);
    for (let i = 0; i < 300; i++) jog(1);
    assert(S.auEditor.cur < 72000, 'the cursor went past End: ' + S.auEditor.cur);
    while (S.auEditor) { back(); ticks(1); }
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ the sequence works with the SLICER editor up, as under any instrument editor: a step tap, Record, hold a step + jog for its page (Josh, 2026-10-30: "note sequencing via step and record should work in sample and slice just like any other mode ... as should step editing via jog turn")', () => {
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
    for (const [r, name] of [[3, 'SLICER']]) {
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
    mapPad(2, 3);
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
    assert(S.stepReveal && S.auEditor && !(S.auEditor.page | 0) && tx.indexOf('EDIT') < 0,
           'hold + jog right did not show the step\'s page over SLICES: ' + JSON.stringify({ rev: S.stepReveal, page: S.auEditor && S.auEditor.page, tx }));
    S.stepRevealJogTick = -100000;                   /* past the reveal's debounce */
    jog(-1); ticks(1);
    tx = globalThis.__texts(() => shown());
    assert(!S.stepReveal && tx.indexOf('EDIT') >= 0, 'jog left did not come back to SLICES: ' + JSON.stringify({ panel: S.auPanel, ed: !!S.auEditor, held: S.heldStep, rev: S.stepReveal, tx: tx.slice(0, 4) }));
    note(21, 0); ticks(3);
    S.clipSteps[4][ac][5] = 0;
    leave();
    S.activeBank = 0; ticks(2);
});

step('⭐⭐ Offset does not reorder the waveform: SAMPLE and the Track View strip show the audio in its own order, the playhead resting at the Offset point (step 1 plays from there), the beats counting from it (Josh, 2026-11-13: "offset shouldn\'t reorder the wave in track overview. it should have a playhead resting at offset point and start playback from there")', () => {
    const base = INFO24(0, 8, 0, 8, 50, 0);                   /* Loop, 84 BPM, Offset 0 */
    const withRot = (r) => base.replace(/ 0\|/, ' 0 ' + r + '|');   /* ...slen 0, then the Offset */
    const ac = S.trackActiveClip[4] | 0;
    S.clipLength[4][ac] = 16; S.clipTPS[4][ac] = 24;
    const wasPos = GET['t4_au_pos'];
    GET['t4_au_pos'] = '0 0 -1';                              /* stopped: the playhead rests */
    S.playing = false;
    GET['t4_au_info_0'] = withRot(0); kindSync(); ticks(4);
    assert(A.auInfo(4, 0).rot === 0, 'the fixture: ' + A.auInfo(4, 0).rot);
    mapPad(2, 3); ticks(4);
    assert(S.auEditor && S.auEditor.full, 'SAMPLE is not zoomed out');
    const col = (f, x, y0, y1) => { let v = ''; for (let y = y0; y <= y1; y++) v += f[y * 128 + x] ? 1 : 0; return v; };
    const f0 = shown();
    GET['t4_au_info_0'] = withRot(96); kindSync(); ticks(4);   /* a quarter of 384 ticks: x 32 */
    assert(A.auInfo(4, 0).rot === 96, 'the Offset was not read: ' + A.auInfo(4, 0).rot);
    const f1 = shown();
    /* the audio where it was: every column away from the two playhead places */
    let same = 0, n = 0;
    for (let x = 0; x < 128; x++) { if (x <= 2 || (x >= 30 && x <= 35)) continue; n++; if (col(f0, x, 24, 49) === col(f1, x, 24, 49)) same++; }
    assert(same === n, 'the waveform moved with the Offset: ' + same + '/' + n + ' columns the same');
    /* control: the fixture has audio to move (a turned copy would differ) */
    let diff = 0; for (let x = 3; x < 126; x++) if (col(f0, x, 24, 49) !== col(f0, x + 2, 24, 49)) diff++;
    assert(diff > 20, 'control: the fixture\'s waveform is too even to show a move (' + diff + ')');
    /* the playhead resting at the Offset point: a white line edged in black */
    const lineAt = (f, x0, x1) => { for (let x = x0; x <= x1; x++) if (/^1+$/.test(col(f, x, 20, 49)) && /^0+$/.test(col(f, x - 1, 20, 49))) return x; return -1; };
    assert(lineAt(f1, 31, 34) >= 0, 'no playhead resting at the Offset point (x 31-34)');
    assert(lineAt(f0, 31, 34) < 0, 'control: a line there with no Offset');
    /* the clip's bar starts there: the tall tick at x 32, none at the Start */
    const r53 = (f) => [...Array(128).keys()].filter((x) => f[53 * 128 + x]);
    assert(r53(f0).indexOf(0) >= 0 && r53(f1).some((x) => x >= 31 && x <= 33) && r53(f1).indexOf(0) < 0,
           'the bar tick does not move to the Offset point: ' + r53(f0) + ' / ' + r53(f1));
    /* ...and playing, the playhead is where the engine plays, in the audio's order */
    {
        const fr = Math.round(A.auInfo(4, 0).rstart + 200 * A.auFpt(A.auInfo(4, 0)));   /* 200 ticks into the sample */
        GET['t4_au_pos'] = '1 ' + fr + ' 0'; S.playing = true; S.trackClipPlaying[4] = true; ticks(6);   /* read every 3rd tick */
        const fp = shown();
        const px = Math.floor((fr - S.auEditor.A) / (S.auEditor.B - S.auEditor.A) * 128);
        assert(lineAt(fp, px, px + 2) >= 0 && lineAt(fp, 31, 34) < 0,
               'playing, the playhead is not at the engine\'s frame (x ' + px + ') — or still rests at the Offset');
        GET['t4_au_pos'] = '0 0 -1'; S.playing = false; S.trackClipPlaying[4] = false; ticks(2);
    }
    back(); ticks(2);
    /* the Track View strip: the audio in its order, the playhead resting at the Offset */
    GET['t4_au_info_0'] = withRot(0); kindSync(); ticks(4);
    S.activeBank = 0; S.bankCardLatched = false;
    const g0 = shown();
    GET['t4_au_info_0'] = withRot(96); kindSync(); ticks(4);
    const g1 = shown();
    let ssame = 0, sn = 0;
    for (let x = 4; x < 124; x++) { if (x <= 6 || (x >= 32 && x <= 37)) continue; sn++; if (col(g0, x, 49, 54) === col(g1, x, 49, 54)) ssame++; }
    assert(ssame === sn, 'the Track View strip moved with the Offset: ' + ssame + '/' + sn);
    let lit = -1; for (let x = 30; x < 40; x++) if (/^1+$/.test(col(g1, x, 49, 54))) lit = x;
    assert(lit >= 0, 'the Track View strip has no playhead resting at the Offset point');
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

step('⭐ the step editor\'s K1 reads "Slice n"; K2 Pitch, K3 Length (Start behind it), K4 Dir (Slice · Fwd · Rev) — the step\'s own sound (Josh, 2026-11-11; Dir 2026-11-15: "b - and it should read "slice" not chop")', () => {
    S.heldStep = 0; S.heldStepNotes = [2]; S.activeBank = C.BANK_STEP;
    S.stepEditXrev = 0; S.stepEditXsemi = 0; S.stepEditXstart = 0; S.stepEditXlen = 100; S.knobAlt = 0;
    const cells = render.heldStepCells();
    assert(cells[0].label === 'Slice' && cells[0].kind === 'valsq' && cells[0].text === '3', 'K1: ' + JSON.stringify(cells[0]));
    /* ...and the page as drawn: the chop's number, not a note name (found on
     * the device: "D-2" for chop 3), in K1's own cell — no merged Note box
     * over K1 / K2 (Josh, 2026-11-11: "slice/pitch don't need to be grouped in a box") */
    S.heldStepBtn = -1; S.stepWasEmpty = false;
    const tx = globalThis.__texts(() => frame(() => render.drawHeldStepPage()));
    assert(tx.indexOf('3') >= 0 && !tx.some((x) => /^D-?2/.test(x)), 'the step page names a note: ' + JSON.stringify(tx));
    { let run = 0, best = 0; for (let y = 10; y < 54; y++) { run = FB[y * 128 + 6] ? run + 1 : 0; best = Math.max(best, run); }
      assert(best < 10, 'the merged Note box is still drawn round K1 / K2 (its left edge, x=6, runs ' + best + ' px)'); }
    /* K3 answers touch + click (Length / Start): it wears the corner brackets */
    assert(cells[2].opens === true, 'K3 Length has no touch + click corners: ' + JSON.stringify(cells[2]));
    assert(cells[1].label === 'Pitch' && cells[2].label === 'Leng' && cells[2].text === '100%' && cells[3].label === 'Dir' && cells[3].text === 'Slice',
           'K2 / K3 / K4 are not Pitch / Length 100% / Dir Slice: ' + JSON.stringify([cells[1], cells[2], cells[3]]));
    /* set, the Dir draws as the arrow square, as a MIDI clip's Dir does */
    S.stepEditXrev = 2;
    assert(render.heldStepCells()[3].kind === 'dirsq' && render.heldStepCells()[3].sel === 1 && render.heldStepCells()[3].text === 'Rev',
           'Dir Rev is not the backwards arrow: ' + JSON.stringify(render.heldStepCells()[3]));
    S.stepEditXrev = 1;
    assert(render.heldStepCells()[3].kind === 'dirsq' && render.heldStepCells()[3].sel === 0, 'Dir Fwd is not the forwards arrow');
    S.stepEditXrev = 0;
    S.heldStepBtn = 16; reset();
    /* K2 Pitch is a pick, as the Sample editor's Pitch, and reads a batched
     * turn's whole count (device pass 2026-11-11: it counted frames, so a
     * fast turn moved no faster than a slow one) — a 10-count message is a pick */
    S.knobAccum[1] = 0; cc(72, 10); cc(72, 10);
    assert(sent('t4_c0_step_0_xsemi').join() === '1,2', 'two 10-count turns did not step the step\'s Pitch to 2 st: ' + JSON.stringify(sent('t4_c0_step_0_xsemi')));
    for (let i = 0; i < 20; i++) cc(72, 1);                 /* K2 Pitch up */
    for (let i = 0; i < 30; i++) cc(74, 1);                 /* K4 Dir: Slice -> Fwd (deliberate) */
    for (let i = 0; i < 10; i++) cc(73, 127);               /* K3 Length down */
    const px = sent('t4_c0_step_0_xsemi'), rv = sent('t4_c0_step_0_xrev'), ln = sent('t4_c0_step_0_xlen');
    assert(px.length && (px[px.length - 1] | 0) > 0, 'K2 did not send the step\'s Pitch up: ' + JSON.stringify(sets));
    assert(rv.length === 1 && rv[0] === '1', 'K4 did not step the Dir to Fwd once: ' + JSON.stringify(rv));
    for (let i = 0; i < 20; i++) cc(74, 1);                 /* ...Fwd -> Rev */
    assert(sent('t4_c0_step_0_xrev').pop() === '2', 'K4 did not step the Dir on to Rev: ' + JSON.stringify(sent('t4_c0_step_0_xrev')));
    for (let i = 0; i < 25; i++) cc(74, 1);                 /* ...and stops there */
    assert(sent('t4_c0_step_0_xrev').length === 2, 'K4 stepped past Rev: ' + JSON.stringify(sent('t4_c0_step_0_xrev')));
    assert(ln.length && (ln[ln.length - 1] | 0) < 100, 'K3 did not send Length down: ' + JSON.stringify(ln));
    assert(!sentLike(/_vel$|_step_0_vel|_set_notes$|_step_0_gate/).length, 'a Slicer step wrote velocity / notes / gate: ' + JSON.stringify(sets));
    /* touch K3 + click: Start; turned, it sends the step's Start */
    note(2, 127); cc(3, 127); cc(3, 0); note(2, 0);
    assert(render.heldStepCells()[2].label === 'Start' && render.heldStepCells()[2].opens === true, 'touch + click did not turn K3 to Start (corners kept): ' + JSON.stringify(render.heldStepCells()[2]));
    reset();
    for (let i = 0; i < 10; i++) cc(73, 1);
    const st = sent('t4_c0_step_0_xstart');
    assert(st.length && (st[st.length - 1] | 0) > 0, 'K3 (Start) did not send the step\'s Start: ' + JSON.stringify(sets));
    S.knobAlt = 0;
    /* ...and the same from ANOTHER bank, the step's page revealed by hold +
     * jog right — the way a held step is edited from LIVE ARP (device pass
     * 2026-11-11: there touch + click left K3 on Length) */
    S.activeBank = 5; S.stepReveal = true;                  /* 5 = LIVE ARP */
    note(2, 127); cc(3, 127); cc(3, 0); note(2, 0);
    assert(render.heldStepCells()[2].label === 'Start', 'touch + click on a revealed step page did not turn K3 to Start: ' + JSON.stringify(render.heldStepCells()[2]));
    reset();
    for (let i = 0; i < 10; i++) cc(73, 1);
    const st2 = sent('t4_c0_step_0_xstart');
    assert(st2.length && (st2[st2.length - 1] | 0) > 0, 'K3 (Start) on a revealed page did not send the step\'s Start: ' + JSON.stringify(sets));
    S.knobAlt = 0; S.stepReveal = false;
    S.heldStepBtn = -1;
    S.heldStep = -1; S.heldStepNotes = []; S.activeBank = 0;
});

step('⭐⭐ an Audio track: no sequence — pad taps and steps do nothing, no STEP / NOTE FX; the CLIP bank is Mode (Loop · Shot), Strch and Shift — the old Loop/Slice Mode left with the split (Josh, 2026-11-02: "two instruments \"audio\" and \"slicer\""); one-shot came back as Mode (2026-11-10: "it should be a clip bank setting"); the sound on SAMPLE', () => {
    S.activeBank = 1;                                  /* on NOTE FX when the track becomes Audio */
    GET['t4_au_info_0'] = INFO(0, 8);
    kindSync(); ticks(4);
    assert(S.activeBank === 0, 'still on NOTE FX on an Audio track: bank ' + S.activeBank);
    /* Josh, 2026-10-28: "we don't need to show notes at all in loop mode" */
    const walk = P.bankCycleForMode(C.PAD_MODE_AUDIO, 4);
    /* no PAD MODE on an Audio track (Josh, 2026-10-30: "loop mode should always be 4 rows and has no need for the pad bank") */
    assert(JSON.stringify(walk) === JSON.stringify([5, C.BANK_MACROS, 0, C.BANK_INPUT, C.BANK_REMIX, C.BANK_SOUND]), 'Loop walk: ' + walk.join());
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
    assert(cells.map((c) => c.label).join() === 'Mode,Strch,,,,,Dir,' && cells[0].kind === 'enumsq' && cells[0].text === 'Loop',
           'Audio CLIP bank: ' + cells.map((c) => c.label) + ' / K1 ' + JSON.stringify(cells[0]));
    /* the header reads the name while the knob is in hand: it must fit (a long
     * one ran off the screen on the device) */
    assert(cells.every((c) => !c.name || c.name.length <= 16) && cells[1].name === 'Stretch',
           'names too long for the header: ' + cells.map((c) => c.name));
    /* K1 Mode (Loop · Shot; test_audio_shot_knob.mjs), K2 Strch, K7 Dir; the
     * rest is SAMPLE's pages (Josh, 2026-11-14): K3-K6 and K8 do nothing here */
    S.bankCardLatched = true;
    reset();
    for (const k of [73, 74, 75, 76, 78]) { S.knobAccelLast[k - 71] = 0; for (let i = 0; i < 30; i++) cc(k, 1); }
    assert(!sentLike(/_au_|_loop_set|resolution|quantize/).length, 'an Audio CLIP K3-K6 / K8 acts: ' + JSON.stringify(sentLike(/_au_|_loop_set|resolution|quantize/)));
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
        /* WITH BARS SET they double instead of the Tempo, and the limit is
         * the Tempo they make (Josh, 2026-11-12: "does stretch in clip take
         * account of this?"; 2026-11-13: Bars beside Tempo): Bars making 600
         * BPM won't double; making 300 they do — Length and Bars x2, the
         * sample's own Tempo left */
        {
            const i0 = A.auInfo(4, ac), bar = 16;
            S.clipLength[4][ac] = bar; S.clipLoopStart[4][ac] = 0; S.clipTPS[4][ac] = 24;
            S.auInfo[4][ac] = Object.assign({}, i0, { state: 2, rstart: 0, nframes: 96000, rate: 48000, cut: 19200, span: 384, bpm10: 1200, _t: 4, _c: ac });
            assert(Math.abs(A.auBpm(A.auInfo(4, ac)) - 600) < 0.11, 'setup: the Bars do not make 600: ' + A.auBpm(A.auInfo(4, ac)));
            reset();
            for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 1);
            assert(!sent('t4_c' + ac + '_loop_set').length && S.clipLength[4][ac] === bar, 'Strch x2 took Bars past 999.9');
            S.auInfo[4][ac] = Object.assign({}, A.auInfo(4, ac), { cut: 38400, bpm10: 6000 });
            reset();
            for (let i = 0; i < 40 && !sent('t4_c' + ac + '_loop_set').length; i++) cc(72, 1);
            assert(sent('t4_c' + ac + '_loop_set').join() === String(bar * 2) && sent('t4_au_set_bars').join() === ac + ' 768' && !sent('t4_au_set_bpm').length,
                   'Strch x2 under Bars: ' + JSON.stringify(sentLike(/_bpm|_bars|_loop_set/)));
            assert(Math.abs(A.auBpm(A.auInfo(4, ac)) - 600) < 0.11, 'the Tempo did not follow the doubled Bars: ' + A.auBpm(A.auInfo(4, ac)));
            S.clipLength[4][ac] = len0; S.auInfo[4][ac] = i0;
        }
    }
    S.knobTouched = 7;
    const lh = JSON.stringify(render.bankPageHints(0));
    S.knobTouched = -1;
    assert(lh.indexOf('CLK') < 0, 'a blank Audio CLIP knob offers a click: ' + lh);
    S.bankCardLatched = false;

    /* ...the sound is on SAMPLE: page 1's K8 Gain, Revrs off page 1 (Josh,
     * 2026-11-13: "knock reverse off the waveform knobs (keep it on page 2
     * though)"); then page 2 TIME and page 3 SOUND, two rows of four, each
     * setting on page 1's knob where page 1 has it (Josh, 2026-11-14) */
    mapPad(2, 3); ticks(2);
    reset();
    for (let i = 0; i < 20; i++) cc(78, 1);
    assert(sent('t4_au_set_gain').length && !sent('t4_au_set_revrs').length && !sent('t4_au_set_nudge').length, 'SAMPLE K8 is not Gain: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20; i++) cc(78, 127);
    jog(1); ticks(1);
    const ed = S.auEditor;
    assert(ed.page === 1, 'the jog did not turn SAMPLE to page 2');
    /* TIME: Sync (Grid · Free) · Warp (Vintage · Pitch · Warp) · Nudge · Offset / - · - · Tempo · Bars */
    const p2 = () => A.auSampleP2Cells(4, 0);
    assert(p2().map((c) => c.label).join() === 'Sync,Warp,Nudge,Offst,,,Tempo,Bars', 'page 2: ' + p2().map((c) => c.label));
    assert(p2()[6].opens === true && p2().filter((c) => c.opens).length === 1,
           'Tempo does not wear the corner brackets, alone (Josh: "tempo needs the corner indicators to show it\'s touch click")');
    assert(p2()[0].text === 'Grid' && p2()[1].text === 'Warp', 'a new clip is not on Grid / Warp: ' + p2()[0].text + ' ' + p2()[1].text);
    for (let i = 0; i < 40; i++) cc(72, 127);
    reset();
    const tv = [];
    for (let i = 0; i < 40; i++) { cc(72, 1); const t = p2()[1].text; if (tv[tv.length - 1] !== t) tv.push(t); }
    assert(tv.join() === 'Vintage,Pitch,Warp' && sent('t4_au_set_sync').join() === '0 2,0 0',
           'K2 is not Warp Vintage · Pitch · Warp: ' + tv.join() + ' ' + JSON.stringify(sentLike(/_au_/)));
    assert(A.auSyncIdx({ sync: 1 }) === 0 && A.auSyncIdx({ sync: 2 }) === 1 && A.auSyncIdx({ sync: 0 }) === 2 &&
           A.auSyncIdx({ sync: 99 }) === 2, 'Vintage / Pitch / Warp / an unknown value reads wrong');
    for (const v of [0, 1, 2]) {
        const was = S.auInfo[4][0];
        S.auInfo[4][0] = Object.assign({}, was, { sync: v });
        const sq = p2()[1].sq;
        S.auInfo[4][0] = was;
        assert(sq && sq.length <= 4, 'Warp ' + v + '\'s square: ' + sq);
    }
    {
        const ac = S.trackActiveClip[4] | 0, len0 = S.clipLength[4][ac] | 0 || 16, tps = S.clipTPS[4][ac] || 24;
        /* K4 Offset: a step a detent run, wrapping round the clip, shown as
         * a note value (Josh, 2026-11-12: "shift param should be labeled
         * offset and work in 1/16ths ... it needs to display as such" · "if
         * it's tied to track resolution that's fine") */
        const c3 = A.auSampleP2Cells(4, ac)[3];
        assert(c3.label === 'Offst' && c3.name === 'Offset' && c3.text === '0/16', 'TIME K4 is not Offset 0/16: ' + JSON.stringify(c3));
        reset();
        for (let i = 0; i < 30 && !sent('t4_au_set_rot').length; i++) cc(74, 1);
        assert(tps === 24 && sent('t4_au_set_rot').join() === ac + ' 24' && A.auSampleP2Cells(4, ac)[3].text === '1/16',
               'Offset is not a 1/16: ' + JSON.stringify(sent('t4_au_set_rot')) + ' ' + A.auSampleP2Cells(4, ac)[3].text);
        reset();
        for (let i = 0; i < 30 && sent('t4_au_set_rot').length < 2; i++) cc(74, 127);
        assert(sent('t4_au_set_rot').join() === ac + ' 0,' + ac + ' ' + (len0 * tps - tps), 'Offset does not wrap below 0: ' + JSON.stringify(sent('t4_au_set_rot')));
        for (let i = 0; i < 40 && A.auInfo(4, ac).rot; i++) cc(74, 1);   /* back to 0 */
        /* ...at 1/8 steps (48 ticks): a 1/8 a detent, shown in eighths */
        {
            const tps0 = S.clipTPS[4][ac];
            S.clipTPS[4][ac] = 48;
            reset();
            for (let i = 0; i < 30 && !sent('t4_au_set_rot').length; i++) cc(74, 1);
            assert(sent('t4_au_set_rot').join() === ac + ' 48' && A.auSampleP2Cells(4, ac)[3].text === '1/8',
                   'at 1/8 resolution Offset is not a 1/8: ' + JSON.stringify(sent('t4_au_set_rot')) + ' ' + A.auSampleP2Cells(4, ac)[3].text);
            for (let i = 0; i < 40 && A.auInfo(4, ac).rot; i++) cc(74, 127);
            S.clipTPS[4][ac] = tps0;
        }
        /* the pads are the clip's time: a quarter-clip Offset plays the
         * audio's second quarter from pad 1, its first quarter last */
        {
            const i0 = A.auInfo(4, ac), L = len0 * tps;
            const plain = A.auLoopMarks(i0, 4, ac), rot = A.auLoopMarks(Object.assign({}, i0, { rot: L / 4 }), 4, ac);
            assert(JSON.stringify(rot[0]) === JSON.stringify(plain[8]) && JSON.stringify(rot[24]) === JSON.stringify(plain[0]),
                   'the Audio pads do not start at the Offset');
        }
    }
    /* K1 Sync: Free and back */
    reset();
    for (let i = 0; i < 20 && !sent('t4_au_set_free').length; i++) cc(71, 1);
    assert(sent('t4_au_set_free').join() === '0 1' && p2()[0].text === 'Free', 'K1 up is not Sync Free: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 20 && sent('t4_au_set_free').length < 2; i++) cc(71, 127);
    assert(sent('t4_au_set_free').join() === '0 1,0 0' && p2()[0].text === 'Grid', 'K1 down is not Sync Grid: ' + JSON.stringify(sent('t4_au_set_free')));
    /* K3 Nudge, K4 Offset, K7 Tempo, K8 Bars; K5 / K6 nothing */
    reset();
    S.knobAccelLast[2] = 0; cc(73, 1);
    for (let i = 0; i < 20 && !sent('t4_au_set_rot').length; i++) cc(74, 1);
    for (let i = 0; i < 20; i++) { cc(75, 1); cc(76, 1); }
    S.knobAccelLast[6] = 0; cc(77, 1);
    assert(sent('t4_au_set_nudge').length === 1 && sent('t4_au_set_rot').length === 1 && sent('t4_au_set_bpm').length === 1 &&
           !sent('t4_au_set_pitch').length && !sent('t4_au_set_detune').length && !sent('t4_au_set_gain').length,
           'page 2 K3-K7 are not Nudge / Offset / nothing / nothing / Tempo: ' + JSON.stringify(sentLike(/_au_/)));
    reset();
    /* no knob of its own for Orig any more: touch K1 + click does nothing */
    note(0, 127); click(); note(0, 0); ticks(1);
    assert(!sent('t4_au_set_orig').length && !ed.pick, 'touch K1 + click still does something: ' + JSON.stringify(sentLike(/_au_/)));
    /* SOUND: - · - · - · - / Pitch · Detune · - · Gain (Dir is the CLIP bank's) */
    jog(1); ticks(1);
    assert(ed.page === 2, 'the jog did not turn SAMPLE to page 3');
    const p3 = () => A.auSampleP3Cells(4, 0);
    assert(p3().map((c) => c.label).join() === ',,,,Pitch,Detune,,Gain', 'page 3: ' + p3().map((c) => c.label));
    jog(1); ticks(1);
    assert(ed.page === 2, 'the jog went past page 3');
    reset();
    for (let i = 0; i < 20; i++) { cc(71, 1); cc(72, 1); cc(73, 1); cc(74, 1); }
    for (let i = 0; i < 20 && !sent('t4_au_set_pitch').length; i++) cc(75, 1);
    S.knobAccelLast[5] = 0; cc(76, 1);
    for (let i = 0; i < 30; i++) cc(77, 1);
    S.knobAccelLast[7] = 0; cc(78, 1);
    assert(sent('t4_au_set_pitch').length === 1 && sent('t4_au_set_detune').length === 1 && !sent('t4_au_set_dir').length &&
           sent('t4_au_set_gain').length === 1 && !sent('t4_au_set_sync').length && !sent('t4_au_set_rot').length && !sent('t4_au_set_free').length,
           'page 3 is not nothing x4 / Pitch / Detune / nothing / Gain: ' + JSON.stringify(sentLike(/_au_/)));
    jog(-1); jog(-1); back(); ticks(2);
    S.bankCardLatched = false;
});

step('⭐⭐ a Slicer\'s Sync, page 3 K4: Off · Pitch · Warp (the engine\'s 0 / 1 / 3 — 2 is Snap\'s, parked); Warp only for a sample up to a minute (Josh, 2026-11-14/15: "it should be named sync" · "prestretch")', () => {
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);   /* 2 s */
    mapPad(2, 3); ticks(2);
    jog(1); jog(1); ticks(1);
    const ed = S.auEditor;
    assert(ed && ed.page === 2 && ed.c === 16, 'not on the SLICER editor\'s page 3');
    const cell = () => E.slcPageCells(ed)[3];
    assert(cell().label === 'Sync' && cell().text === 'Off' && JSON.stringify(cell().options) === '["Off","Pitch","Warp"]', 'K4: ' + JSON.stringify(cell()));
    reset();
    for (let i = 0; i < 25 && !sent('t4_au_set_sync').length; i++) cc(74, 1);
    assert(sent('t4_au_set_sync').join() === '16 1' && cell().text === 'Pitch', 'K4 up is not Pitch: ' + JSON.stringify(sentLike(/_au_/)));
    for (let i = 0; i < 25 && sent('t4_au_set_sync').length < 2; i++) cc(74, 1);
    assert(sent('t4_au_set_sync').join() === '16 1,16 3' && cell().text === 'Warp', 'K4 up again is not Warp (3): ' + JSON.stringify(sent('t4_au_set_sync')));
    for (let i = 0; i < 40; i++) cc(74, 1);         /* no fourth value */
    assert(sent('t4_au_set_sync').length === 2, 'Sync went past Warp: ' + JSON.stringify(sent('t4_au_set_sync')));
    for (let i = 0; i < 60 && sent('t4_au_set_sync').length < 4; i++) cc(74, 127);
    assert(sent('t4_au_set_sync').join() === '16 1,16 3,16 1,16 0' && cell().text === 'Off', 'K4 down: ' + JSON.stringify(sent('t4_au_set_sync')));
    leave(); ticks(2);
    /* a sample over a minute: Off and Pitch only */
    GET['t4_au_info_0'] = INFO(1, 8).replace(' 96000 48000 ', ' 3360000 48000 '); kindSync(); ticks(2);   /* 70 s */
    mapPad(2, 3); ticks(2); jog(1); jog(1); ticks(1);
    assert(JSON.stringify(E.slcPageCells(S.auEditor)[3].options) === '["Off","Pitch"]', 'a 70 s sample offers Warp: ' + JSON.stringify(E.slcPageCells(S.auEditor)[3]));
    reset();
    for (let i = 0; i < 80; i++) cc(74, 1);
    assert(sent('t4_au_set_sync').join() === '16 1', 'Warp was reached on a 70 s sample: ' + JSON.stringify(sent('t4_au_set_sync')));
    leave(); ticks(2);
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
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
    /* REMIX on: the playhead jumps about the sample — no "played so far"
     * fill; every section dim, the one heard pulsing */
    S.rmxSet[4] = [1, 0, 0, 1, 100, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; i++) ticks(1);
    assert([0, 5, 9].every((i) => pad(i) !== tc && pad(i) === pad(31)), 'Remix on: the played sections still fill: ' + [0, 5, 9].map(pad));
    assert(pad(10) === HC.LightGrey, 'Remix on: the section heard does not pulse: ' + pad(10));
    S.rmxSet[4] = [0, 0, 0, 1, 100, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6; i++) ticks(1);
    /* a backwards pass (Dir Bwd, or a ping-pong's way back — the engine's
     * `pos` says which): the sections after the playhead have played */
    GET['t4_au_pos'] = '1 30000 -1 1';
    for (let i = 0; i < 6; i++) ticks(1);
    assert(pad(31) === tc && pad(11) === tc && pad(9) !== tc && pad(9), 'a backwards pass did not fill from the end: ' + [pad(9), pad(11), pad(31)]);
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
        /* a HELD step lights its slice white, as a melodic track lights a held
         * step's notes (Josh, 2026-11-11: "the slice on the step doesn't light
         * up like it does for midi tracks.  it should.") */
        const hp = [9, 10, 11, 3].find((i) => pad(i) && pad(i) !== HC.White), other = hp === 9 ? 10 : 9;
        const hk = A.auPadToSlice(hp, 4), beforeH = pad(hp), beforeO = pad(other);
        assert(hp !== undefined && hk < 24, 'setup: no dim slice pad to hold: ' + [9, 10, 11, 3].map(pad));
        S.heldStep = 0; S.heldStepNotes = [A.AU_NOTE_BASE + hk]; ticks(2);
        assert(pad(hp) === HC.White, 'a held step\'s slice (' + (hk + 1) + ', pad ' + hp + ') is not white: ' + pad(hp));
        assert(pad(other) === beforeO, 'a slice the step does not hold changed: ' + pad(other));
        S.heldStep = -1; S.heldStepNotes = []; ticks(2);
        assert(pad(hp) === beforeH, 'the slice stayed white after the step was let go: ' + pad(hp));
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

step('⭐⭐ the range is a hard edge on the pads: a slice wholly outside Start..End is dark grey (still there to pick), one inside keeps its colour (Josh, 2026-11-15)', () => {
    /* range 30000..96000: slices 1-2 (0..24000) wholly before Start, slice 3 (24000..36000) crosses it */
    const RANGED = '2 0 1 8 1 16 30000 96000 0 0 96000 48000 2 0 0 0 8 0 0 66000 840 8 50 0 0 0 0 0 0 0 1000 0|Break Phenom 84 bpm.wav';
    GET['t4_au_info_0'] = RANGED; GET['t4_au_marks_0'] = MARKS8; kindSync();
    S.activeBank = 0; S.bankCardLatched = false; S.auLayout[4] = 0; S.knobTouched = -1; S.knobPhysIdx = -1;
    A.auSetSelSlice(4, 4);
    DM.computePadNoteMap(); S.ledsDirtyAudio = true; for (let i = 0; i < 6; i++) ticks(1);
    const pad = (i) => LEDS.get(C.TRACK_PAD_BASE + i) || 0;
    assert(pad(0) === HC.DarkGrey && pad(1) === HC.DarkGrey, 'slices outside the range are not dark grey: ' + [pad(0), pad(1)]);
    assert(pad(2) === C.TRACK_DIM_COLORS[4] && pad(3) === C.TRACK_DIM_COLORS[4], 'a slice crossing / inside the range is not the dim track colour: ' + [pad(2), pad(3)]);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0); ticks(2);
    assert(A.auSelSlice(4) === 0 && pad(0) === C.TRACK_COLORS[4], 'a hidden slice cannot be picked (it must, to move it back): ' + pad(0));
    A.auSetSelSlice(4, 0);
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
});

step('⭐⭐ Delete + pad deletes a slice on page 1 without entering the slice editor; slice 1 stays (Josh, 2026-11-15: "let delete + pad delete chops as it does today")', () => {
    GET['t4_au_info_0'] = INFO(1, 8, 0); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(2);
    S.knobTouched = -1; S.knobPhysIdx = -1;             /* (an earlier step's touch: a jog press would be touch + click) */
    mapPad(2, 3); ticks(2);
    const ed = S.auEditor;
    assert(ed && ed.mode === 'wave' && ed.page === 0, 'not on page 1: ' + JSON.stringify(ed && { mode: ed.mode, page: ed.page, ed: ed.ed }));
    reset();
    cc(HC.MoveDelete, 127);
    note(C.TRACK_PAD_BASE + 0, 100); note(C.TRACK_PAD_BASE + 0, 0);
    note(C.TRACK_PAD_BASE + 3, 100); note(C.TRACK_PAD_BASE + 3, 0);
    cc(HC.MoveDelete, 0);
    assert(sent('t4_au_mark_del').join() === '16 3' && ed.mode === 'wave', 'Delete + pad on page 1: ' + JSON.stringify(sent('t4_au_mark_del')));
    jog(1); ticks(1);                                   /* page 2: Delete + pad deletes nothing */
    reset();
    cc(HC.MoveDelete, 127); note(C.TRACK_PAD_BASE + 2, 100); note(C.TRACK_PAD_BASE + 2, 0); cc(HC.MoveDelete, 0);
    assert(!sent('t4_au_mark_del').length, 'Delete + pad on page 2 deleted a slice');
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); GET['t4_au_marks_0'] = MARKS8; kindSync(); ticks(20);
});

step('⭐⭐ page 3\'s strip: K2 zooms it round the edge last moved, and a detent of K1 / K3 is a strip pixel at that zoom; the readouts light while their knob is in hand; zoomed out it is the whole file', () => {
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(2);
    S.knobTouched = -1; S.knobPhysIdx = -1;
    mapPad(2, 3); ticks(2); jog(1); jog(1); ticks(1);
    const ed = S.auEditor;
    let [sA, sB] = E.slcStripView(ed);
    assert(sA === 0 && sB === 96000 && ed.sFull, 'the strip zoomed out is not the whole file: ' + sA + '..' + sB);
    note(1, 127);
    let tx = globalThis.__texts(() => shown());
    assert(tx.indexOf('ZOOM') >= 0, 'touching K2 does not say ZOOM over the strip: ' + JSON.stringify(tx));
    for (let i = 0; i < 6; i++) cc(72, 1);
    note(1, 0);
    [sA, sB] = E.slcStripView(ed);
    assert(!ed.sFull && sB - sA < 96000 * 0.3, 'K2 did not zoom the strip in: ' + sA + '..' + sB);
    reset();
    note(2, 127); cc(73, 127); note(2, 0);              /* K3: End a strip pixel at this zoom */
    const px = Math.max(1, Math.round((sB - sA) / E.SLC_STRIP_W));
    assert(sent('t4_au_set_end').join() === '16 ' + (96000 - px), 'K3 is not a strip pixel at the zoom (' + px + '): ' + JSON.stringify(sent('t4_au_set_end')));
    [sA, sB] = E.slcStripView(ed);
    assert(sA <= 96000 - px && sB >= 96000 - px, 'the zoomed strip does not hold the End it moves: ' + sA + '..' + sB);
    note(0, 127);
    const f = shown();
    note(0, 0);
    assert(f[10 * 128 + 1] && f[16 * 128 + 1], 'Start\'s readout is not lit while K1 is in hand');
    for (let i = 0; i < 12; i++) cc(72, 127);
    assert(E.slcStripView(ed)[0] === 0 && E.slcStripView(ed)[1] === 96000 && ed.sFull, 'K2 down did not zoom back out to the whole file');
    leave();
    GET['t4_au_info_0'] = INFO(1, 8); kindSync(); ticks(20);
});

step('⭐ an automation jump to a Slicer lane opens the SLICER editor on that knob\'s page: the sample\'s lanes page 3, Attk / Decay page 2, Revrs / Play page 1', () => {
    assert(E.slcPageForLane('pitch', true) === 2 && E.slcPageForLane('bpm10', true) === 2, 'the sample\'s lanes are not page 3');
    assert(E.slcPageForLane('atk', false) === 1 && E.slcPageForLane('dec', false) === 1, 'Attk / Decay are not page 2');
    assert(E.slcPageForLane('rev', false) === 0 && E.slcPageForLane('play', false) === 0, 'Revrs / Play are not page 1');
});

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
