/* tests/js/test_audio_review_gaps.mjs — CONVERT TO KIT paths a code review
 * listed as untested (2026-10-31), through the real gesture (SLICES › click ›
 * Convert to kit) where one exists, and the tick's own path (S.pendingAuKit,
 * which that row sets) for the refusals the menu cannot reach:
 *   - more than 32 chops writes 32 pads (KIT_PADS), and the notice says 32;
 *   - no sample / no chops: NO KIT, nothing copied, nothing written;
 *   - no sample / a Loop clip: the menu offers no Convert to kit at all.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
const PEAKS = Array.from({ length: 128 }, (_, i) => ((i * 7) % 100).toString(16).padStart(2, '0').repeat(2)).join('');
/* "state err mode even hand jump rstart rend pitch gain frames rate ch revrs nudge jmpq n|name" */
const INFO = (mode, n, even, state) => (state === undefined ? 2 : state) + ' 0 ' + mode + ' ' + (even === undefined ? n : even) + ' ' +
    (even === 0 ? n : 1) + ' 16 0 96000 0 0 96000 48000 2 0 0 0 ' + n + '|Break Phenom 84 bpm.wav';
const MARKS = (n) => Array.from({ length: n }, (_, k) => (k * 2000) + ' ' + ((k + 1) * 2000)).join(' ');
const GET = { 't4_au_dir': '/data/UserData/UserLibrary/Sets/x/dAVEBOx/samples',
              't4_au_info_0': INFO(1, 8), 't4_pad_mode': '3',
              't4_au_peaks_0': PEAKS, 't4_au_pos': '1 24000 2', 't4_au_lazy': '0 0 0',
              't4_au_marks_0': MARKS(8), 't4_au_all_0': '0 x 0 0 0 0' };
globalThis.host_preview_play = () => {}; globalThis.host_preview_stop = () => {};
let CMDS = [];
const SAMP = '/data/UserData/UserLibrary/Samples/dAVEBOx/Exported kits/My Song 5A.wav';
globalThis.host_system_cmd = (c) => { CMDS.push(String(c)); globalThis.__stubStat = { [SAMP]: { mode: 0o100644, size: 9 } }; return 0; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
let swallowed = null;
let FILES = {};
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0) { if (swallowed === null) swallowed = String(body).slice(0, 900); return true; }
    FILES[String(path)] = String(body);
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
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = _px;
globalThis.move_midi_internal_send = () => true;
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
const P = await import('../../ui/ui_pure.mjs');
const K = await import('../../ui/ui_audio_kit.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = 0; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.playing = false;
S.activeTrack = 4; S.activeBank = 0; S.touchHoldMs = 0; S.currentSetName = 'My Song';

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 ? 0x90 : 0x80, d1, d2]));
const ticks = (n) => {
    for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; globalThis.tick(); }
    assert(swallowed === null, 'the tick threw: ' + swallowed);
};
const sent = (k) => sets.filter((x) => x[0] === k).map((x) => x[1]);
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
const mapPad = (c, r) => { cc(3, 127); note(P.bankMapPadForCell(c, r), 100); note(P.bankMapPadForCell(c, r), 0); cc(3, 0); ticks(3); };
const leave = () => { for (let n = 0; S.auEditor && n < 6; n++) { back(); ticks(1); } };
const clip = (info, marks) => { GET['t4_au_info_0'] = info; GET['t4_au_marks_0'] = marks; A.auMarkStale(4, 0); ticks(2); };
const fresh = () => { CMDS = []; FILES = {}; globalThis.__stubStat = null; S.actionPopupLines = []; S.actionPopupEndTick = 0; };
const kitsWritten = () => Object.keys(FILES).filter((p) => /\.ablpreset$/.test(p));

/* the track becomes Audio by the real gesture (Instmt/Dest -> Audio, Yes) */
snd.requestInstrChange(4, C.INSTR_AUDIO);
if (S.confirmConvertToDrum) { jog(-1); click(); }
ticks(3);
if (!(S.trackPadMode[4] === C.PAD_MODE_AUDIO && A.isAudioTrack(4))) { console.error('FAIL: setup: t4 did not become Audio'); process.exit(1); }

/* SLICES › click › the chop types' rows */
const openKitMenu = () => { mapPad(2, 2); const ed = S.auEditor; assert(ed && ed.ed === 'slices', 'SLICES did not open'); click(); return ed; };

step('⭐⭐ more than 32 chops: Convert to kit writes 32 pads (36..67), the notice says 32', () => {
    clip(INFO(1, 40, 0), MARKS(40));
    fresh();
    const ed = openKitMenu();
    const rows = E.auPickRows(ed);
    const ki = rows.findIndex((r) => r.id === 'kit');
    assert(ki >= 0, 'no Convert to kit row on a 40-chop Slice clip: ' + JSON.stringify(rows));
    for (let k = 0; k < ki; k++) jog(1);
    click();
    assert(S.pendingAuKit, 'the row did not ask for the kit');
    ticks(2);
    const kits = kitsWritten();
    assert(kits.length === 1, 'kits written: ' + JSON.stringify(kits));
    const kit = JSON.parse(FILES[kits[0]]);
    const pads = kit.chains[0].devices[0].chains;
    assert(pads.length === K.KIT_PADS && pads.length === 32, 'a 40-chop kit has ' + pads.length + ' pads, not 32');
    assert(pads.every((p, k) => p.drumZoneSettings.receivingNote === 36 + k && p.devices[0].deviceData.sampleUri),
           'the 32 pads are not 36..67, each playing the shared copy');
    /* pad 32 is chop 32 (frames 62000..64000 of 96000), not a later one */
    const last = pads[31].devices[0].parameters;
    assert(Math.abs(last.Voice_PlaybackStart - 62000 / 96000) < 1e-9, 'pad 32 is not chop 32: start ' + last.Voice_PlaybackStart);
    assert(CMDS.length === 1, 'the sample was not copied exactly once: ' + JSON.stringify(CMDS));
    const L = S.actionPopupLines || [];
    assert(L[0] === 'KIT SAVED' && L[2] === '32 pads (8 left out)', 'the notice does not say 8 chops were left out: ' + JSON.stringify(L));
    leave();
});

step('⭐⭐ no sample: the SLICES menu offers no Convert to kit; the tick path says NO KIT / No sample and writes nothing', () => {
    clip(INFO(1, 8, 0, 0).replace('|Break Phenom 84 bpm.wav', '|'), MARKS(8));
    fresh();
    const ed = openKitMenu();
    /* (a click there opens no chop menu at all: nothing to chop) */
    assert(!(ed.pick && E.auPickRows(ed).some((r) => r.id === 'kit')), 'a clip with no sample offers Convert to kit: ' + JSON.stringify(ed.pick));
    leave();
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'the SLICES gesture on a clip with no sample wrote a kit');
    S.pendingAuKit = { t: 4, c: 0 };
    ticks(2);
    const L = S.actionPopupLines || [];
    assert(L[0] === 'NO KIT' && L[1] === 'No sample', 'notice: ' + JSON.stringify(L));
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'a refused kit wrote / copied: ' + JSON.stringify([Object.keys(FILES), CMDS]));
});

step('⭐⭐ a failed load (state 3, the name kept) is "no sample" too: NO KIT, nothing written', () => {
    clip(INFO(1, 8, 0, 3), MARKS(8));
    fresh();
    S.pendingAuKit = { t: 4, c: 0 };
    ticks(2);
    const L = S.actionPopupLines || [];
    assert(L[0] === 'NO KIT' && L[1] === 'No sample', 'notice: ' + JSON.stringify(L));
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'a kit of a missing sample was written / copied');
});

step('⭐⭐ no chops: NO KIT / No chops, nothing copied or written', () => {
    clip(INFO(1, 8, 0), '');
    fresh();
    S.pendingAuKit = { t: 4, c: 0 };
    ticks(2);
    const L = S.actionPopupLines || [];
    assert(L[0] === 'NO KIT' && L[1] === 'No chops', 'notice: ' + JSON.stringify(L));
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'a kit with no chops was written / copied');
});

step('⭐ a Loop clip: SLICES offers no Convert to kit (the only way in)', () => {
    clip(INFO(0, 8), MARKS(8));
    fresh();
    mapPad(2, 2);
    const ed = S.auEditor;
    if (ed && ed.ed === 'slices') {
        click();
        assert(!E.auPickRows(ed).some((r) => r.id === 'kit'), 'a Loop clip\'s SLICES offers Convert to kit');
        back();
    }
    leave();
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'opening a Loop clip\'s SLICES wrote a kit');
});

step('auConvertToKit itself refuses a Loop clip (defence in depth: the menu keeps it out too)', () => {
    clip(INFO(0, 8), MARKS(8));
    fresh();
    S.pendingAuKit = { t: 4, c: 0 };
    ticks(2);
    const L = S.actionPopupLines || [];
    assert(L[0] === 'NO KIT' && /Slice/.test(L[1] || ''), 'a Loop clip was kitted: ' + JSON.stringify(L));
    assert(kitsWritten().length === 0 && CMDS.length === 0, 'a refused Loop kit still wrote or copied');
});

if (failed) { console.error('FAIL: test_audio_review_gaps'); process.exit(1); }
console.log('PASS: test_audio_review_gaps');
}
main().catch((e) => { console.error(e); process.exit(1); });
