import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_string_param_keyboard.mjs — touch + click on a module's
 * STRING param opens the shared keyboard on that param.
 *
 * Josh, on the device: touch + click on a module's text knob (a sung-lyrics
 * string on its Play page) showed nothing. The click dived out of the grid and
 * fell through to dAVEBOx's bank editor front page, which for a module whose
 * editor is all pages discovers nothing — an empty screen. Stock opens the
 * keyboard. Driven through the real input path: the bank map's CONFIG pad ->
 * FX 1 -> the editor; a knob touch + click; the keyboard's own OK and Back.
 */
import './_bulk_get_stub.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const FIX = path.resolve(process.cwd(), 'tests/fixtures/widget-test');
const DEV_DIR = '/data/UserData/schwung/modules/audio_fx/widget-test';
const MODJSON = JSON.parse(fs.readFileSync(path.join(FIX, 'module.json'), 'utf8'));
MODJSON.capabilities.chain_params.push({ key: 'lyrics', name: 'Lyrics', type: 'string', default: '' });
MODJSON.ui_hierarchy.levels.root.params = [{ level: 'other', label: 'Other' }, { level: 'play', label: 'Play' }];
MODJSON.ui_hierarchy.levels.other = { name: 'Other', params: [{ key: 'mode' }, { key: 'level' }], knobs: ['mode', 'level'] };
MODJSON.ui_hierarchy.levels.play = { name: 'Play', params: [{ key: 'level' }, { key: 'mode' }, { key: 'lyrics' }], knobs: ['level', 'mode', 'lyrics'] };
const CANVAS_SRC = fs.readFileSync(path.join(FIX, 'canvas.js'), 'utf8');
function readDev(p) {
    p = String(p);
    if (p === DEV_DIR + '/canvas.js') return CANVAS_SRC;
    if (p === DEV_DIR + '/module.json') return JSON.stringify(MODJSON);
    if (p.startsWith(DEV_DIR + '/')) {
        try { return fs.readFileSync(path.join(FIX, p.slice(DEV_DIR.length + 1)), 'utf8'); } catch (e) { return null; }
    }
    return null;
}
globalThis.__pageCalls = []; globalThis.__hooks = [];
const spoken = [];
globalThis.host_send_screenreader = (t) => { spoken.push(String(t)); };
globalThis.host_ui_publish = () => false;

/* ---- host surface --------------------------------------------------------- */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => readDev(p);
globalThis.host_file_exists = (p) => readDev(p) !== null;
let swallowed = null;
globalThis.host_write_file = (p, b) => {
    if (String(p).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(b).slice(0, 900);
    return true;
};
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};

/* Every evaluation of a module script. */
const loads = [];
globalThis.shadow_load_ui_module = (p) => {
    const src = readDev(p);
    loads.push(String(p));
    if (src === null) return false;
    try { (new Function('"use strict";\n' + src))(); } catch (e) { return false; }
    return true;
};
const evalsOfCanvas = () => loads.filter(p => p.endsWith('/canvas.js')).length;

const engine = {};
function loadModule(slot) {
    engine[slot + ':fx1:module'] = 'widget-test';
    engine[slot + ':fx1:chain_params'] = JSON.stringify(MODJSON.capabilities.chain_params);
    engine[slot + ':fx1:ui_hierarchy'] = JSON.stringify(MODJSON.ui_hierarchy);
    engine[slot + ':fx1:level'] = '0.5';
    engine[slot + ':fx1:mode'] = '1';
    engine[slot + ':fx1:face'] = '3';
    engine[slot + ':fx1:preset'] = '1';
    engine[slot + ':fx1:preset_count'] = '12';
    engine[slot + ':fx1:preset_name'] = 'Fish';
    engine[slot + ':fx1:lyrics'] = 'twinkle twinkle';
}
for (let s = 0; s < 4; s++) loadModule(s);
globalThis.shadow_get_param = (slot, k) => {
    if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
    const v = engine[slot + ':' + k];
    return v === undefined ? '' : v;
};
const writes = [];
globalThis.shadow_set_param = (slot, k, v) => { writes.push([slot, String(k), String(v)]); engine[slot + ':' + k] = String(v); return 1; };

const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.stipple_rect = () => {};
globalThis.set_pixel = _px;
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.host_seed_module_defaults = () => [0, 0];
/* ⚠ 0, not false: the binding reads Shift as `shadow_get_shift_held() !== 0`,
 * so the device stub's `false` reads as HELD and every jog pages by level. */
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
/* This rig lets go and looks in the same instant; the release hold has its
 * own test (test_touch_hold.mjs). */
S.touchHoldMs = 0;
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function frame() { globalThis.clear_screen(); render.drawUI(); return FB.slice(); }

function openFx1Editor() {
    openTrackConfigViaMap();
    ticks(6);
    for (let guard = 0; ; guard++) {
        const st = snd.soundPickStateForTest();
        if (st.comps[st.row] === 'fx1') break;
        if (guard > 30) throw new Error('rig: never reached the FX 1 row — ' + JSON.stringify(st.labels));
        cc(14, 1); ticks(1);
    }
    cc(3, 127); cc(3, 0);
    ticks(8);
    if (snd.soundCompForTest() !== 'fx1') throw new Error('rig: editor is on ' + snd.soundCompForTest());
    if (!snd.soundPPForTest().on) throw new Error('rig: the param-pages editor did not take the screen');
}
function leaveSound() {
    for (let i = 0; i < 6 && snd.soundOpen(); i++) { cc(51, 127); cc(51, 0); ticks(2); }
    ticks(2);
}
function openOnTrack(t) {
    S.activeTrack = t; S.trackRoute[t] = 0; S.trackChannel[t] = t + 1;
    ticks(4);
    openFx1Editor();
    ticks(4);
}
const pageName = () => { const pg = snd.soundPPForTest().page; return pg ? pg.name : null; };
function jogToPage(name) {
    for (let g = 0; g < 14 && pageName() !== name; g++) { cc(14, 127); ticks(3); }
    for (let g = 0; g < 14 && pageName() !== name; g++) { cc(14, 1); ticks(3); }
    if (pageName() !== name) throw new Error('rig: never reached the ' + name + ' page — on ' + pageName());
}
const TE = await import('/data/UserData/schwung/shared/text_entry.mjs');
const lyricWrites = () => writes.filter(w => /(^|:)lyrics$/.test(w[1]));
function touchClick(knob) {
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, knob, 127]));   /* touch the knob */
    cc(3, 127); cc(3, 0);                                                   /* click */
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, knob, 0]));     /* let go */
    ticks(3);
}
function slamToOk() { for (let i = 0; i < 120; i++) cc(14, 1); cc(3, 127); cc(3, 0); }

step('setup: a Schwung track, FX 1 editor up', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    openOnTrack(1);
});

step('⭐⭐ touch + click on the string knob opens the keyboard, titled, on the current value', () => {
    jogToPage('Play'); ticks(2);
    if (TE.isTextEntryActive()) throw new Error('rig: a keyboard is already up');
    touchClick(2);
    if (!TE.isTextEntryActive()) throw new Error('no keyboard — view ' + snd.soundViewForTest() + ', grid on ' + snd.soundPPForTest().on);
    if (TE.getTextEntryBuffer() !== 'twinkle twinkle') throw new Error('seeded with ' + JSON.stringify(TE.getTextEntryBuffer()));
    const v = TE.getTextEntryView();
    if (!/LYRICS/i.test(JSON.stringify(v.title || v))) throw new Error('title: ' + JSON.stringify(v.title));
});

step('⭐ Back cancels: nothing written, back on the Play page with the grid up', () => {
    writes.length = 0;
    cc(51, 127); cc(51, 0);
    if (TE.isTextEntryActive()) throw new Error('Back did not close the keyboard');
    ticks(4);
    if (lyricWrites().length) throw new Error('a cancel wrote ' + JSON.stringify(lyricWrites()));
    if (!snd.soundOpen()) throw new Error('cancelling the keyboard left the editor');
    if (!snd.soundPPForTest().on) throw new Error('the grid did not come back (view ' + snd.soundViewForTest() + ')');
    if (pageName() !== 'Play') throw new Error('came back to ' + pageName());
});

step('⭐⭐ OK writes the text to the module and returns to the Play page', () => {
    jogToPage('Other'); ticks(2); jogToPage('Play'); ticks(2);
    touchClick(2);
    if (!TE.isTextEntryActive()) throw new Error('the keyboard did not open the second time');
    writes.length = 0;
    slamToOk();
    if (TE.isTextEntryActive()) { TE.closeTextEntry(); throw new Error('rig: could not reach OK by gesture'); }
    ticks(6);
    const lw = lyricWrites();
    if (lw.length !== 1 || lw[0][0] !== 1 || lw[0][2] !== 'twinkle twinkle')
        throw new Error('writes: ' + JSON.stringify(lw) + ' (all ' + JSON.stringify(writes) + ')');
    if (!snd.soundPPForTest().on || pageName() !== 'Play')
        throw new Error('after OK: grid ' + snd.soundPPForTest().on + ', page ' + pageName());
});

step('...and the trip leaves nothing behind: one Back on the grid leaves the editor, as before it', () => {
    const before = snd.soundViewForTest();
    cc(51, 127); cc(51, 0); ticks(4);
    if (snd.soundPPForTest().on || snd.soundViewForTest() === before)
        throw new Error('Back stayed in the editor: view ' + snd.soundViewForTest() + ', grid ' + snd.soundPPForTest().on);
});

if (failed) { console.error('test_string_param_keyboard: FAIL'); process.exit(1); }
console.log('test_string_param_keyboard: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
