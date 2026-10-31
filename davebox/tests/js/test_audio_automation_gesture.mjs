/* tests/js/test_audio_automation_gesture.mjs — AUTOMATING AN AUDIO CLIP'S
 * SOUND from the SAMPLE editor, through the real knobs (Josh, 2026-10-31:
 * Pitch, Detune, Gain, Revrs as a switch, and Tempo).
 *
 *   - K4 Gain turned while playing: the clip's setting is written AND the
 *     automation owner hears it as seq:<t>:au_gain (the rest named first,
 *     then the live value); the touch's release ends the gesture;
 *   - K7 Tempo and K8 Revrs name their own keys;
 *   - Delete + touch clears that knob's lane, Mute + touch switches it off;
 *   - SLICES' K4-K8 are a slice's own sound: not automation targets;
 *   - the lane's value, as the engine reports it, reaches the editor's info
 *     (the screen shows what plays); the lane is called "Smp>Gain".
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const PEAKS = Array.from({ length: 128 }, (_, i) => ((i * 7) % 100).toString(16).padStart(2, '0').repeat(2)).join('');
/* "state err mode even hand jump rstart rend pitch gain frames rate ch revrs nudge jmpq n detune sync reach bpm10|name" */
const INFO = (mode) => '2 0 ' + mode + ' 0 1 16 0 96000 0 0 96000 48000 2 0 0 0 1 0 0 96000 1200|Break 84.wav';
const GET = { 't4_au_dir': '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples',
              't4_au_info_0': INFO(0), 't4_pad_mode': '3',
              't4_au_peaks_0': PEAKS, 't4_au_pos': '1 24000 2', 't4_au_lazy': '0 0 0',
              't4_au_marks_0': '0 96000', 't4_au_all_0': '0 x 0 0 0 0', 'pa_list': '' };
globalThis.host_preview_play = () => {}; globalThis.host_preview_stop = () => {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
/* the bulk write's blob: "<n>\n" then "<len>\n<item>" n times, key / value pairs */
function dec(blob) { const out = []; if (!blob) return out; const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push([it[i], it[i + 1]]); return true; };
globalThis.host_module_get_param = (k) => (GET[k] !== undefined ? GET[k] : '');
globalThis.host_module_get_params = () => '';
globalThis.host_sampler_is_recording = () => false;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_save_state_now = () => 1;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.move_midi_inject_to_move = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const A = await import('../../ui/ui_audio.mjs');
const E = await import('../../ui/ui_audio_editor.mjs');
const AU = await import('../../ui/ui_automation.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0; S.touchHoldMs = 0;

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]);
const jog = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
/* turn knob k (0-based) until the clip's setting is written `n` times */
const turn = (k, dir, n) => { for (let i = 0; i < 40 && n > 0; i++) { const b = sets.length; cc(71 + k, dir > 0 ? 1 : 127); if (sets.slice(b).some((x) => /_au_set_/.test(x[0]))) n--; } };
const norm = (v, lo, hi) => Math.round((v - lo) * 16383 / (hi - lo));

snd.requestInstrChange(4, C.INSTR_AUDIO);
if (S.confirmConvertToDrum) { jog(-1); click(); }
ticks(3);
if (!(S.trackPadMode[4] === C.PAD_MODE_AUDIO && A.isAudioTrack(4))) { console.error('FAIL: setup: t4 did not become Audio'); process.exit(1); }
A.auMarkStale(4, 0); ticks(2);

step('⭐⭐ K4 Gain turned while playing: written to the clip AND heard as seq:4:au_gain (rest first, then live)', () => {
    E.openWave(4, 'sample'); ticks(2);
    assert(S.auEditor && S.auEditor.ed !== 'slices', 'SAMPLE did not open');
    S.playing = true;
    sets.length = 0;
    note(3, 127);
    turn(3, 1, 2);
    assert(sent('t4_au_set_gain').length >= 1, 'the clip\'s Gain was not written: ' + JSON.stringify(sets));
    ticks(1);
    const rest = sent('t4_pa_rest'), live = sent('t4_pa_live');
    assert(rest.length === 1 && rest[0] === '0 seq:4:au_gain ' + norm(0, -40, 12),
           'the resting value (0 dB) was not named once: ' + JSON.stringify(rest));
    assert(live.length >= 1 && live[live.length - 1] === 'seq:4:au_gain ' + norm(2, -40, 12),
           'the live value is not +2 dB on seq:4:au_gain: ' + JSON.stringify(live));
    note(3, 0); ticks(1);
    assert(sent('t4_pa_live_end').includes('seq:4:au_gain'), 'the touch\'s release did not end the gesture');
});

step('K7 Tempo and K8 Revrs automate as au_bpm and au_revrs', () => {
    sets.length = 0;
    note(6, 127); turn(6, 1, 1); ticks(1); note(6, 0); ticks(1);
    assert(sent('t4_pa_live').some((v) => v.indexOf('seq:4:au_bpm ') === 0), 'K7 is not seq:4:au_bpm: ' + JSON.stringify(sets));
    sets.length = 0;
    note(7, 127); for (let i = 0; i < 20; i++) cc(78, 1);   /* KNOB_DELIB: 20 detents a switch */ ticks(1); note(7, 0); ticks(1);
    assert(sent('t4_au_set_revrs').length === 1, 'K8 did not switch Revrs once: ' + JSON.stringify(sets) + ' ed=' + JSON.stringify({ page: S.auEditor && S.auEditor.page, mode: S.auEditor && S.auEditor.mode, ed: S.auEditor && S.auEditor.ed, info: A.auInfo(4, 0) }));
    assert(sent('t4_pa_live').some((v) => v === 'seq:4:au_revrs 16383'), 'K8 is not seq:4:au_revrs at 1: ' + JSON.stringify(sent('t4_pa_live')));
});

step('⭐ Delete + touch clears the knob\'s lane; Mute + touch switches it off', () => {
    S.playing = false;
    GET['pa_list'] = '4 0 1 4 seq:4:au_pitch 0 0\n';
    AU.automationRefreshPresence(); ticks(2);
    assert(AU.automationStateFor(4, 0, 'seq:4:au_pitch'), 'setup: the Pitch lane is not listed');
    sets.length = 0;
    S.muteHeld = true; note(4, 127); note(4, 0); S.muteHeld = false; ticks(1);
    assert(sent('t4_pa_active').includes('0 seq:4:au_pitch 0'), 'Mute + touch K5 did not switch the Pitch lane off: ' + JSON.stringify(sets));
    S.deleteHeld = true; note(4, 127); note(4, 0); S.deleteHeld = false; ticks(1);
    assert(sent('t4_pa_clear_key').includes('0 seq:4:au_pitch'), 'Delete + touch K5 did not clear the Pitch lane: ' + JSON.stringify(sets));
});

step('SLICES\' K4-K8 are the slice\'s own sound: no automation', () => {
    GET['t4_au_info_0'] = INFO(1); A.auMarkStale(4, 0); ticks(2);
    while (S.auEditor) { cc(51, 127); cc(51, 0); ticks(1); }
    E.openWave(4, 'slices'); ticks(2);
    assert(S.auEditor && S.auEditor.ed === 'slices', 'SLICES did not open');
    S.playing = true;
    sets.length = 0;
    note(3, 127); for (let i = 0; i < 8; i++) cc(74, 1); note(3, 0); ticks(1);
    assert(!sets.some((x) => /_pa_(rest|live)$/.test(x[0])), 'a SLICES knob was heard as automation: ' + JSON.stringify(sets));
    S.playing = false;
});

step('⭐⭐ ALL SLICES (SLICES with Shift): K4 Gain written to every chop AND heard as seq:4:au_s_gain', () => {
    GET['t4_au_info_0'] = INFO(1); A.auMarkStale(4, 0); ticks(2);
    if (!(S.auEditor && S.auEditor.ed === 'slices')) { E.openWave(4, 'slices'); ticks(2); }
    assert(S.auEditor && S.auEditor.ed === 'slices', 'SLICES did not open');
    S.playing = true;
    sets.length = 0;
    S.shiftHeld = true;
    note(3, 127);
    for (let i = 0; i < 8 && !sent('t4_au_all_gain').length; i++) cc(74, 1);
    ticks(1);
    S.shiftHeld = false;
    note(3, 0); ticks(1);                 /* Shift let go first: the release still ends it */
    assert(sent('t4_au_all_gain').length >= 1, 'ALL SLICES\' Gain was not written: ' + JSON.stringify(sets));
    assert(sent('t4_pa_live').some((v) => v.indexOf('seq:4:au_s_gain ') === 0), 'not heard as seq:4:au_s_gain: ' + JSON.stringify(sent('t4_pa_live')));
    assert(sent('t4_pa_live_end').includes('seq:4:au_s_gain'), 'the release did not end the gesture');
    S.playing = false;
    assert(snd.soundSeqMirror(4, 'au_s_dec', 5001) === true, 'the ALL SLICES mirror refused');
    assert(A.auAll(4, 0)[A.ALL_FIELDS.indexOf('dec')] === 0, 'Decay\'s 5001 did not show as Full (0) on ALL SLICES');
    snd.soundSeqMirror(4, 'au_s_pitch', 7);
    assert(A.auAll(4, 0)[A.ALL_FIELDS.indexOf('pitch')] === 7, 'ALL SLICES does not show the lane\'s Pitch');
    assert(AU.automationTargetLabel('seq:4:au_s_play') === 'Slcs>Play' && AU.automationTargetStepped('seq:4:au_s_play'),
           'label / stepping: ' + AU.automationTargetLabel('seq:4:au_s_play'));
});

step('⭐ the lane\'s value reaches the editor\'s info; the lane is called "Smp>Gain"', () => {
    GET['t4_au_info_0'] = INFO(0); A.auMarkStale(4, 0); ticks(2);
    assert(snd.soundSeqMirror(4, 'au_gain', -12) === true, 'the mirror refused an Audio lane');
    assert(A.auInfo(4, 0).gain === -12, 'the editor does not show the lane\'s -12 dB: ' + A.auInfo(4, 0).gain);
    snd.soundSeqMirror(4, 'au_bpm', 2400);
    assert(A.auInfo(4, 0).bpm10 === 2400, 'Tempo did not reach the info');
    assert(AU.automationTargetLabel('seq:4:au_gain') === 'Smp>Gain', 'label: ' + AU.automationTargetLabel('seq:4:au_gain'));
    assert(AU.automationTargetStepped('seq:4:au_revrs') && !AU.automationTargetStepped('seq:4:au_pitch'),
           'Revrs must step and Pitch glide');
    S.trackPadMode[4] = 0;
    assert(snd.soundSeqMirror(4, 'au_gain', -3) === false, 'an au_ value was mirrored onto a track that is not Audio');
    S.trackPadMode[4] = C.PAD_MODE_AUDIO;
});

process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
