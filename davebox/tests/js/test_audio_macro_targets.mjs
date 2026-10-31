/* tests/js/test_audio_macro_targets.mjs — AN AUDIO CLIP'S SOUND as a TARGET
 * of + Add lane and of a macro (the follow-up to automating it from the
 * SAMPLE editor, Josh 2026-10-31).
 *
 *   - + Add lane on an Audio track offers Sample (a Loop clip) and also
 *     All Slices (a Slice clip); picking Sample > Pitch adds the empty lane
 *     seq:<t>:au_pitch — the one the editor's knob records to;
 *   - a macro on Sample > Gain: the touch + click picker offers it, a turn
 *     writes the clip's Gain and is heard as seq:<t>:au_gain; the page cell
 *     shows the clip's value; the mapping survives the sidecar's reader;
 *   - off an Audio track the rows are gone and such a macro reads UNASSIGNED.
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
AU.automationResolveOffForTest(true);
const ENG = await import('../../ui/ui_engine.mjs');
const BR = await import('../../ui/ui_dsp_bridge.mjs');
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
const pickRow = (id) => {
    const rows = snd.soundKnobPickRowsForTest();
    const i = rows.indexOf(id);
    assert(i >= 0, 'the picker has no ' + id + ' row: ' + JSON.stringify(rows));
    for (let n = 0; n < rows.length; n++) jog(-1); for (let n = 0; n < i; n++) jog(1); click(); ticks(2);
};
const pickParam = (key) => {
    const ps = snd.soundKnobParamsForTest().map(p => p.key);
    const i = ps.indexOf(key);
    assert(i >= 0, 'the param list has no ' + key + ': ' + JSON.stringify(ps));
    for (let n = 0; n < ps.length; n++) jog(-1); for (let n = 0; n < i; n++) jog(1); click(); ticks(2);
};
const leave = () => { for (let i = 0; i < 6 && snd.soundOpen(); i++) { cc(51, 127); cc(51, 0); ticks(2); } };

step('⭐⭐ + Add lane on a Loop clip: Sample (no All Slices); Sample > Pitch adds the empty lane seq:4:au_pitch', () => {
    sets.length = 0;
    assert(snd.soundAutoAddLane(4, 0, 0), 'the picker did not open');
    ticks(3);
    const rows = snd.soundKnobPickRowsForTest();
    assert(rows.indexOf('au:au') >= 0, 'no Sample row: ' + JSON.stringify(rows));
    assert(rows.indexOf('au:aus') < 0, 'All Slices offered for a Loop clip\'s lane: ' + JSON.stringify(rows));
    pickRow('au:au');
    const keys = snd.soundKnobParamsForTest().map(p => p.key).join(',');
    assert(keys === 'au_gain,au_pitch,au_detune,au_bpm,au_revrs', 'Sample lists ' + keys);
    pickParam('au_pitch');
    assert(sent('t4_pa_add').includes('0 seq:4:au_pitch'), 'pa_add: ' + JSON.stringify(sets.filter(x => /pa_add/.test(x[0]))));
    leave();
});

step('⭐ + Add lane on a Slice clip offers All Slices too, its seven keys', () => {
    GET['t4_au_info_0'] = INFO(1); A.auMarkStale(4, 0); ticks(2);
    assert(snd.soundAutoAddLane(4, 0, 0), 'the picker did not open'); ticks(3);
    pickRow('au:aus');
    const keys = snd.soundKnobParamsForTest().map(p => p.key).join(',');
    assert(keys === 'au_s_atk,au_s_dec,au_s_gain,au_s_pitch,au_s_detune,au_s_rev,au_s_play', 'All Slices lists ' + keys);
    sets.length = 0;
    pickParam('au_s_dec');
    assert(sent('t4_pa_add').includes('0 seq:4:au_s_dec'), 'pa_add: ' + JSON.stringify(sets.filter(x => /pa_add/.test(x[0]))));
    leave();
    GET['t4_au_info_0'] = INFO(0); A.auMarkStale(4, 0); ticks(2);
});

step('⭐⭐ a macro on Sample > Gain: touch + click picks it, a turn writes the clip\'s Gain and records seq:4:au_gain', () => {
    snd.soundEnter(4, ENG.slotIndex(4)); ticks(2);
    assert(snd.soundOpen(), 'rig: sound mode did not open on the Audio track');
    snd.soundSetBank(C.BANK_MACROS); ticks(2);
    const tn = (k, on) => note(k, on ? 127 : 0);
    tn(0, true); click(); tn(0, false); ticks(2);
    const names = snd.soundKnobTargetsForTest().map(t => t.name);
    assert(names.indexOf('Sample') >= 0 && names.indexOf('All Slices') >= 0, 'targets: ' + JSON.stringify(names));
    pickRow('au:au');
    pickParam('au_gain');
    const mp = S.trackMacros[4] && S.trackMacros[4][0];
    assert(mp && mp.legs && mp.legs[0].kind === 'au' && mp.legs[0].key === 'au_gain', 'K1 = ' + JSON.stringify(mp));
    S.playing = true;
    sets.length = 0;
    tn(0, true);
    for (let i = 0; i < 60 && !sent('t4_au_set_gain').length; i++) { cc(71, 1); ticks(1); }
    assert(sent('t4_au_set_gain').length >= 1, 'the turn did not write the clip\'s Gain: ' + JSON.stringify(sets));
    ticks(1);
    assert(sent('t4_pa_live').some(v => v.indexOf('seq:4:au_gain ') === 0), 'not heard as seq:4:au_gain: ' + JSON.stringify(sent('t4_pa_live')));
    tn(0, false); ticks(1);
    assert(sent('t4_pa_live_end').includes('seq:4:au_gain'), 'the touch\'s release did not end the gesture');
    S.playing = false;
    const w = sent('t4_au_set_gain');
    const g = parseInt(w[w.length - 1].split(' ')[1], 10);
    assert(g > 0, 'the clip\'s Gain did not move up: ' + JSON.stringify(w));
    /* the engine answers the re-read with what was written */
    GET['t4_au_info_0'] = INFO(0).replace(/^((?:\S+ ){9})\S+/, '$1' + g); A.auMarkStale(4, 0); ticks(2);
    const cell = snd.soundMacrosForTest().drawn[0];
    assert(cell && String(cell.text) === ('+' + g + 'DB'), 'the page cell does not show the clip\'s Gain: ' + JSON.stringify(cell));
});

step('⭐ a BOUNDED leg turns across its own span: Tempo held to 120-140 BPM steps 0.1 BPM a detent, unranged 5 BPM', () => {
    const tempoStep = (lo, hi) => {
        GET['t4_au_info_0'] = INFO(0); A.auMarkStale(4, 0); ticks(2);       /* bpm10 1200 */
        S.trackMacros[4][0] = { v: null, legs: [{ kind: 'au', key: 'au_bpm', lo, hi }] };
        ticks(3);
        sets.length = 0;
        for (let i = 0; i < 8 && !sent('t4_au_set_bpm').length; i++) { cc(71, 1); ticks(1); }
        const w = sent('t4_au_set_bpm');
        assert(w.length >= 1, 'the turn did not write Tempo: ' + JSON.stringify(sets));
        return parseInt(w[0].split(' ')[1], 10) - 1200;
    };
    const ranged = tempoStep((1200 - 1) / 9998, (1400 - 1) / 9998);
    assert(ranged === 1, 'a 120-140 leg moved ' + ranged + ' tenths of a BPM, not 1');
    const whole = tempoStep(0, 1);
    assert(whole === 50, 'an unranged leg moved ' + whole + ' tenths, not 50 (the page law over 1..9999)');
});

step('off an Audio track the rows are gone and the macro reads UNASSIGNED', () => {
    S.trackPadMode[4] = 0;
    const ids = snd.soundKnobTargetsForTest().map(t => t.id);
    assert(ids.indexOf('au:au') < 0 && ids.indexOf('au:aus') < 0, 'Audio rows on a melodic track: ' + JSON.stringify(ids));
    ticks(2);
    const cell = snd.soundMacrosForTest().drawn[0];
    assert(cell && /UNASSIGNED/.test(String(cell.name)), 'cell: ' + JSON.stringify(cell));
    S.trackPadMode[4] = C.PAD_MODE_AUDIO;
    leave();
});

step('the sidecar reader keeps an Audio leg and drops one whose key is not an Audio target', () => {
    const bridge = BR;
    globalThis.host_state_subdir = globalThis.host_state_subdir || (() => 'dAVEBOx');
    S.currentSetUuid = S.currentSetUuid || 'test-uuid';
    const was = globalThis.host_read_file;
    globalThis.host_read_file = () => JSON.stringify({ v: 9, mac: [null, null, null, null, [
        { v: 0.5, legs: [{ kind: 'au', key: 'au_s_dec', lo: 0.2, hi: 1 }] },
        { v: 0, legs: [{ kind: 'au', key: 'clip_playback_dir' }] }, null, null, null, null, null, null]] });
    globalThis.host_file_exists = () => true;
    bridge.restoreUiSidecar(false);
    globalThis.host_read_file = was; globalThis.host_file_exists = () => false;
    const l = S.trackMacros[4] && S.trackMacros[4][0] && S.trackMacros[4][0].legs[0];
    assert(l && l.kind === 'au' && l.key === 'au_s_dec' && l.lo === 0.2, 'K1 leg: ' + JSON.stringify(S.trackMacros[4]));
    assert(S.trackMacros[4][1] === null, 'a non-Audio key survived as an Audio leg: ' + JSON.stringify(S.trackMacros[4][1]));
});

process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
