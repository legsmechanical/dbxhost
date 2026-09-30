/* tests/js/test_midi_export_gesture.mjs — Export to MIDI, from the TRACK
 * CONFIG row, through the real gestures.
 *
 * Josh, 2026-09-30: "export clip to midi file" — ruled: a TRACK CONFIG row;
 * the clip AS IT PLAYS (the Ableton export's render); a "dAVEBOx MIDI" folder
 * in user data.
 *
 * Open the track's menu, jog to the row, click, let the tick run. The engine's
 * render is stubbed (the DSP half is the Ableton export's, tested there); what
 * is asserted is the FILE: its path, and its bytes read back through smfParse.
 * → [[wired-is-not-reachable]] */
import './_bulk_get_stub.mjs';
import { smfParse } from '../../ui/ui_midifile.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const J = JSON.stringify;

globalThis.shadow_get_param = (slot, k) => (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
/* The engine: the render headers a test sets, and the note file it "wrote". */
let HDR = {}, RENDER = '', ASKED = [];
globalThis.host_module_get_param = (k) => {
    if (/_export(_cond|_drum)?$/.test(k)) ASKED.push(k);
    if (k === 'bpm') return '97';
    return HDR[k] !== undefined ? HDR[k] : '';
};
globalThis.host_read_file = (p) => (/davebox-exports\/staging\/render\.txt$/.test(p) ? RENDER : '');
const DIRS = [];
globalThis.host_ensure_dir = (p) => { DIRS.push(p); return true; };
for (const fn of ['host_system_cmd', 'host_file_exists', 'host_write_file',
                  'host_remove_dir', 'shadow_save_state_now', 'host_vol_block',
                  'host_edit_cc_block', 'clear_screen', 'print', 'draw_rect', 'fill_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'move_midi_internal_send', 'set_led',
                  'shadow_get_ui_flags', 'host_register_primary', 'host_open_service',
                  'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'stipple_rect', 'shadow_get_shift_held'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 ? '' : 0);
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
const W = globalThis.__stubStdWritten = {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { MIDI_EXPORT_DIR } = await import('../../ui/ui_midi_export.mjs');

const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const click = () => cc(3, 127) && (cc(3, 0), true);
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const drain = () => { for (let i = 0; i < 3; i++) { GS.tickCount++; tickmod._tickImpl(); } };
const popup = () => (GS.actionPopupLines || []).join(' / ');
const files = () => Object.keys(W).filter(p => p.startsWith(MIDI_EXPORT_DIR + '/')).sort();

function gotoRow(t, key) {
    snd.soundExit();
    GS.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(3);
    snd.soundShowMenu();
    ticks(2);
    for (let guard = 0; guard < 60; guard++) {
        const st = snd.soundPickStateForTest();
        const row = snd.soundPickRowSpecForTest();
        if (row && row.key === key) return true;
        jog(1); ticks(1);
        if (snd.soundPickStateForTest().row === st.row) break;
    }
    return false;
}
function exportRow(t) {
    assert(gotoRow(t, 'midi_export'), 'never reached the Export to MIDI row on track ' + (t + 1));
    const consumed = click();
    assert(consumed, 'the click was not consumed by the menu (it would reach the global handler)');
    drain();
}
function clear() { for (const k of Object.keys(W)) delete W[k]; ASKED = []; HDR = {}; RENDER = ''; GS.actionPopupLines = []; }

step('setup: Schwung tracks, stopped, a project named mngk', () => {
    globalThis.init();
    GS.awaitingProjectSelect = false; GS.ledInitComplete = true; GS.sessionView = false;
    for (let i = 0; i < 8; i++) B.applyInstrChoice(i, C.INSTR_SCHWUNG);
    GS.playing = false;
    GS.currentSetName = 'mngk';
    GS.trackPadMode[2] = 0; GS.trackActiveClip[2] = 0; GS.trackQueuedClip[2] = -1;
});

step('⭐ the row: click → one render of the clip on screen → a .mid in the dAVEBOx MIDI folder, read back note for note', () => {
    clear();
    GS.trackActiveClip[2] = 1;
    HDR['t2_c1_export_cond'] = '768 3 768';
    RENDER = '0:60:100:48;96:64:90:24;96:67:80:24;';
    exportRow(2);
    assert(J(ASKED) === J(['t2_c1_export_cond']), 'rendered ' + J(ASKED));
    assert(J(files()) === J([MIDI_EXPORT_DIR + '/mngk 3B.mid']), 'files ' + J(Object.keys(W)));
    assert(DIRS.includes(MIDI_EXPORT_DIR), 'the folder was not made');
    const r = smfParse(W[MIDI_EXPORT_DIR + '/mngk 3B.mid']);
    const p = r.parts[0];
    assert(J(p.notes) === J([{ t: 0, g: 48, p: 60, v: 100 }, { t: 96, g: 24, p: 64, v: 90 }, { t: 96, g: 24, p: 67, v: 80 }]),
           'notes ' + J(p.notes));
    assert(p.name === 'mngk 3B' && !p.drum && r.bpm === 97, 'name ' + p.name + ' drum ' + p.drum + ' bpm ' + r.bpm);
    assert(popup() === 'EXPORTED / mngk 3B.mid', 'popup ' + popup());
    assert(!Object.keys(W).some(k => /\.part$/.test(k)), 'a temp file was left: ' + J(Object.keys(W)));
});

step('a second export never overwrites: " 2"', () => {
    const first = W[MIDI_EXPORT_DIR + '/mngk 3B.mid'];
    ASKED = [];
    HDR['t2_c1_export_cond'] = '384 1 384'; RENDER = '0:72:100:24;';
    exportRow(2);
    assert(W[MIDI_EXPORT_DIR + '/mngk 3B.mid'] === first, 'the first file changed');
    assert(W[MIDI_EXPORT_DIR + '/mngk 3B 2.mid'], 'files ' + J(files()));
    assert(popup() === 'EXPORTED / mngk 3B 2.mid', 'popup ' + popup());
});

step('the render is made fit for a file: a held repeat is split, nothing runs past the clip end', () => {
    clear();
    GS.trackActiveClip[2] = 0;
    HDR['t2_c0_export_cond'] = '384 3 384';
    RENDER = '0:60:100:200;96:60:90:24;300:62:80:200;';
    exportRow(2);
    const n = smfParse(W[MIDI_EXPORT_DIR + '/mngk 3A.mid']).parts[0].notes;
    assert(J(n) === J([{ t: 0, g: 96, p: 60, v: 100 }, { t: 96, g: 24, p: 60, v: 90 }, { t: 300, g: 84, p: 62, v: 80 }]), J(n));
});

step('a drum clip: the drum render, on channel 10', () => {
    clear();
    GS.trackPadMode[5] = C.PAD_MODE_DRUM; GS.trackActiveClip[5] = 0; GS.trackQueuedClip[5] = -1;
    HDR['t5_c0_export_drum'] = '384 2 384';
    RENDER = '0:36:100:12;96:38:100:12;';
    exportRow(5);
    assert(J(ASKED) === J(['t5_c0_export_drum']), 'rendered ' + J(ASKED));
    const p = smfParse(W[MIDI_EXPORT_DIR + '/mngk 6A.mid']).parts[0];
    assert(p.drum && J(p.channels) === J([9]) && p.notes.length === 2, J(p));
    GS.trackPadMode[5] = 0;
});

step('an empty clip says so and writes nothing', () => {
    clear();
    HDR['t2_c0_export_cond'] = '0 0 0';
    exportRow(2);
    assert(popup() === 'CLIP EMPTY' && !files().length, popup() + ' ' + J(files()));
});

step('a render that fails says EXPORT FAILED and writes nothing', () => {
    clear();
    HDR['t2_c0_export_cond'] = '384 -1 384';
    exportRow(2);
    assert(popup() === 'EXPORT FAILED' && !files().length, popup());
});

step('a write that cannot open says EXPORT FAILED and leaves no temp file', () => {
    clear();
    HDR['t2_c0_export_cond'] = '384 1 384'; RENDER = '0:60:100:24;';
    globalThis.__stubStdOpenFail = () => true;
    exportRow(2);
    globalThis.__stubStdOpenFail = null;
    assert(popup() === 'EXPORT FAILED' && !Object.keys(W).length, popup() + ' ' + J(Object.keys(W)));
});

step('refused while the transport plays — nothing rendered, nothing written', () => {
    clear();
    HDR['t2_c0_export_cond'] = '384 1 384'; RENDER = '0:60:100:24;';
    GS.playing = true;
    exportRow(2);
    GS.playing = false;
    assert(!ASKED.length && !files().length, 'asked ' + J(ASKED));
    assert(/STOP TRANSPORT/.test(popup()), 'popup ' + popup());
});

step('transport started between the click and the tick: refused too', () => {
    clear();
    HDR['t2_c0_export_cond'] = '384 1 384'; RENDER = '0:60:100:24;';
    assert(gotoRow(2, 'midi_export'), 'row');
    click();
    GS.playing = true;
    drain();
    GS.playing = false;
    assert(!ASKED.length && !files().length && /STOP TRANSPORT/.test(popup()), 'asked ' + J(ASKED) + ' ' + popup());
});

step('the click never puts the row into edit mode', () => {
    clear();
    HDR['t2_c0_export_cond'] = '0 0 0';
    exportRow(2);
    assert(!snd.soundCfgEditForTest().editing, 'the row took the jog');
});

step('a Conductor track has no Export to MIDI row', () => {
    GS.trackPadMode[6] = C.PAD_MODE_CONDUCT;
    const keys = snd.configRowsForTest(6).map(r => r.key);
    GS.trackPadMode[6] = 0;
    assert(!keys.includes('midi_export'), 'keys ' + J(keys));
    assert(snd.configRowsForTest(6).some(r => r.key === 'midi_export'), 'control: a Keys track has it');
});

if (failed) { console.log('FAIL: test_midi_export_gesture'); process.exit(1); }
console.log('PASS: test_midi_export_gesture');
}
main().catch(e => { console.error(e); process.exit(1); });
