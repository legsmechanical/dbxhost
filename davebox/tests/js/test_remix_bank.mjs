import "./_bulk_get_stub.mjs";
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

/* tests/js/test_remix_bank.mjs — REMIX, the RS7000-style Loop Remix bank
 * (Josh, 2026-11-10: "replacing midi effects banks on audio tracks with loop
 * remix effects like those on the yamaha rs7000" · "it should be in the same
 * place on both track types. and per clip." · "keep notefx for slicer. put it
 * in a slot that neither track uses"). Through the real gestures:
 *   - the bank map's FX row-3 pad opens REMIX on an Audio track and on a
 *     Slicer; a Slicer's NOTE FX pad still opens NOTE FX;
 *   - the screen draws the REMIX bank: Remix · Type · Famly · Var;
 *   - K1 turns it on (deliberately), K2 the Type, K3 the Family, K4 the
 *     Variation: each sent to the engine as the active clip's setting;
 *   - the clip's snapshot (v[44..46]) is what the cells read. */
async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
globalThis.__S = S;
const C = await import('../../ui/ui_constants.mjs');
const A = await import('../../ui/ui_audio.mjs');
const P = await import('../../ui/ui_pure.mjs');
const render = await import('../../ui/ui_render.mjs');
const _kitText = [];
(await import('../../ui/ui_fonts_pp.mjs')).setKitTextTrace((x) => _kitText.push(String(x)));
const texts = (fn) => { _kitText.length = 0; fn(); return _kitText.slice(); };

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0;
S.touchHoldMs = 0;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]);
const reset = () => { sets.length = 0; S.knobAccelLast.fill(0); };
const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const turn = (k, dir, n) => { S.knobAccum[k] = 0; note(k, 127); for (let i = 0; i < n; i++) { S.knobAccelLast[k] = 0; cc(71 + k, dir > 0 ? 1 : 127); } note(k, 0); };
/* the engine's snapshot of the active clip, REMIX at v[44..46] */
const SNAP = (on, type, v) => Array.from({ length: 44 }, () => '0').concat([String(on), String(type), String(v)]).join(' ');

step('setup: track 5 an Audio track, Track view', () => {
    S.trackPadMode[4] = C.PAD_MODE_AUDIO; S.pendingPadNoteMapRecompute = true; S.ledsDirtyAudio = true;
    S.sessionView = false; S.activeTrack = 4; S.activeBank = 0;
    S.trackActiveClip[4] = 0;
    GET['t4_c0_pfx_snapshot'] = SNAP(0, 0, 0);
    ticks(3);
});

step('⭐ the FX row-3 pad opens REMIX on an Audio track; the screen draws its bank', () => {
    mapPad(3, 2);
    assert(S.activeBank === C.BANK_REMIX, 'the pad did not open REMIX: bank ' + S.activeBank);
    ticks(90);                                      /* past the bank's name card */
    note(0, 127); ticks(2);                         /* a touch shows the knob page */
    const tx = texts(() => render.drawUI()).join('|');
    note(0, 0); ticks(2);
    assert(tx.indexOf('REMIX') >= 0, 'the header does not say REMIX: ' + tx);
    /* (the kit font draws capitals; a long value splits over two lines) */
    for (const l of ['TYPE', 'FAMLY', 'VAR'])
        assert(tx.indexOf(l) >= 0, 'the bank does not show ' + l + ': ' + tx);
    assert(tx.indexOf('OFF') >= 0 && tx.indexOf('NOR') >= 0, 'not Off / Normal at rest: ' + tx);
});

step('a brush on K1 does not turn it on; a deliberate turn does — as the active clip\'s', () => {
    reset();
    turn(0, 1, 8); ticks(1);
    assert(!sent('t4_remix_on').length, 'a brush turned Remix on: ' + JSON.stringify(sets));
    turn(0, 1, 30); ticks(1);
    assert(sent('t4_remix_on').join() === '1', 'Remix on not sent once: ' + JSON.stringify(sets));
    assert(A.rmxBankCells(4)[0].text === 'On', 'the cell does not read On');
});

step('⭐ K2 Type, K3 Family, K4 Variation reach the engine', () => {
    reset();
    turn(1, 1, 16); ticks(1);
    const ty = sent('t4_remix_type');
    assert(ty.length >= 1 && (ty[ty.length - 1] | 0) >= 1, 'Type not sent up: ' + JSON.stringify(sets));
    reset();
    turn(2, 1, 30); ticks(1);
    const fv = sent('t4_remix_var');
    assert(fv.length >= 1 && ((fv[fv.length - 1] | 0) / 16 | 0) === 1, 'Family did not step to Reverse (setting 16..31): ' + JSON.stringify(sets));
    reset();
    turn(3, 1, 16); ticks(1);
    const vv = sent('t4_remix_var');
    assert(vv.length >= 1 && ((vv[vv.length - 1] | 0) / 16 | 0) === 1 && (vv[vv.length - 1] | 0) % 16 >= 1,
           'Variation did not step within Reverse: ' + JSON.stringify(sets));
    note(2, 127); ticks(2);
    const tx = texts(() => render.drawUI()).join('|');
    note(2, 0); ticks(2);
    assert(tx.indexOf('REV') >= 0 && tx.indexOf('ON') >= 0, 'the Family cell does not read Reverse (Remix On): ' + tx);
});

{
    const BR = await import('../../ui/ui_dsp_bridge.mjs');
    step('...clip B: TYPE 7, BREAK 10, on', () => {
        S.trackActiveClip[4] = 1;
        GET['t4_c1_pfx_snapshot'] = SNAP(1, 6, 3 * 16 + 9);
        BR.refreshPerClipBankParams(4);
        const c = A.rmxBankCells(4);
        assert(c[0].text === 'On' && c[1].text === '7' && c[2].text === 'Break' && c[3].text === '10',
               'the cells do not read the snapshot: ' + JSON.stringify(c.slice(0, 4).map((x) => x.text)));
        S.trackActiveClip[4] = 0;
        BR.refreshPerClipBankParams(4);
    });
}

step('⭐ on a Slicer the same pad opens REMIX, and NOTE FX keeps its own pad', () => {
    S.trackPadMode[4] = C.PAD_MODE_SLICER; S.pendingPadNoteMapRecompute = true; S.trackActiveClip[4] = 0; S.activeBank = 0;
    ticks(2);
    mapPad(3, 2);
    assert(S.activeBank === C.BANK_REMIX, 'a Slicer\'s FX row-3 pad did not open REMIX: bank ' + S.activeBank);
    mapPad(3, 0);
    assert(S.activeBank === 1, 'a Slicer\'s NOTE FX pad did not open NOTE FX: bank ' + S.activeBank);
});

process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
