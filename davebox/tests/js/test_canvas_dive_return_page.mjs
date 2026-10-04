import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_canvas_dive_return_page.mjs — leaving a module's CANVAS
 * editor (DR32's ENGN picker) lands back on the page you dove from.
 *
 * Josh, 2026-10-04 (verbatim in the board's spec): "leaving DR32's engine
 * picker lands on a preset page instead of Pad" — only after a preset or kit
 * was loaded in that instance, and the screen reader announced Pad while the
 * screen showed the preset page.
 *
 * The cause: dAVEBOx remembers "the page to come back to" when the editor is
 * left for an errand (a preset load leaves it on My Presets), and restores it
 * BY NAME on the next entry. A dive into a canvas (touch the cell + click)
 * tears the grid down without updating that crumb, so coming back restored
 * the STALE page — silently, after the controller had already announced its
 * first page (Pad). Driven through dAVEBOx's real input path: the bank map's
 * CONFIG pad -> FX 1 -> the editor; a knob touch + click into the canvas; the
 * module's own ctx.close() on a click.
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

/* ---- the module on disk ------------------------------------------------- */
const FIX = path.resolve(process.cwd(), 'tests/fixtures/widget-test');
const DEV_DIR = '/data/UserData/schwung/modules/audio_fx/widget-test';
const MODJSON = JSON.parse(fs.readFileSync(path.join(FIX, 'module.json'), 'utf8'));
for (const p of MODJSON.capabilities.chain_params) {
    if (p.key === 'detail') { p.enterable = true; delete p.as_page; }
}
/* DR32's shape for ENGN: a `type: canvas, enterable` KNOB cell (no as_page)
 * on its Pad page, with other pages around it. */
MODJSON.ui_hierarchy.levels.root.params = [{ level: 'other', label: 'Other' }, { level: 'pad', label: 'Pad' }];
MODJSON.ui_hierarchy.levels.other = { name: 'Other', params: [{ key: 'mode' }, { key: 'level' }], knobs: ['mode', 'level'] };
MODJSON.ui_hierarchy.levels.pad = { name: 'Pad', params: [{ key: 'detail' }, { key: 'level' }], knobs: ['detail', 'level'] };

const CANVAS_SRC = fs.readFileSync(path.join(FIX, 'canvas.js'), 'utf8');
const PAGE_OK = "\nglobalThis.canvas_overlay.drawPage = function (ctx, payload) {\n"
    + "  globalThis.__pageCalls.push({ w: ctx.width, h: ctx.height, payload: payload });\n"
    + "};\n"
    + "globalThis.canvas_overlay.onMidi = function (ctx, m) {\n"
    + "  ctx.state.n = (ctx.state.n || 0) + 1;\n"
    + "  globalThis.__hooks.push(['onMidi', Array.from(m.data), ctx.state.n]);\n"
    + "  if (m.data[1] === 3 && globalThis.__closeOnClick) ctx.close();\n"
    + "  if (globalThis.__callDiveMethods) globalThis.__dive = [ctx.shiftHeld(), ctx.measureText('abc'),\n"
    + "      ctx.getValue(), typeof ctx.setValue, typeof ctx.random()];\n"
    + "};\n"
    + "globalThis.canvas_overlay.handleBack = function (ctx) {\n"
    + "  globalThis.__hooks.push(['handleBack']);\n"
    + "  return globalThis.__backStays-- > 0;\n"
    + "};\n";
globalThis.__hooks = []; globalThis.__backStays = 0; globalThis.__closeOnClick = false;
const PAGE_THROW = "\nglobalThis.canvas_overlay.drawPage = function (ctx, payload) {\n"
    + "  globalThis.__pageCalls.push({ w: ctx.width, h: ctx.height, payload: payload });\n"
    + "  throw new Error('bad page');\n"
    + "};\n";
const disk = { page: 'ok' };
function readDev(p) {
    p = String(p);
    if (p === DEV_DIR + '/canvas.js')
        return CANVAS_SRC + (disk.page === 'ok' ? PAGE_OK : disk.page === 'throw' ? PAGE_THROW : '');
    if (p === DEV_DIR + '/module.json') return JSON.stringify(MODJSON);
    if (p.startsWith(DEV_DIR + '/')) {
        try { return fs.readFileSync(path.join(FIX, p.slice(DEV_DIR.length + 1)), 'utf8'); } catch (e) { return null; }
    }
    return null;
}
globalThis.__pageCalls = [];
/* What the screen reader is told (shared/screen_reader.mjs -> the host). */
const spoken = [];
globalThis.host_send_screenreader = (t) => { spoken.push(String(t)); };

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
}
for (let s = 0; s < 4; s++) loadModule(s);
globalThis.shadow_get_param = (slot, k) => {
    if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
    const v = engine[slot + ':' + k];
    return v === undefined ? '' : v;
};
globalThis.shadow_set_param = () => 1;

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
/* The jog, until the page on screen is the module's ("Detail"). It is the
 * level's preset browser, so it sits FIRST — the editor may land on the page
 * it last showed, so walk back to the start, then forward. */
function jogToCanvasPage() {
    const onIt = () => { const pg = snd.soundPPForTest().page; return !!(pg && pg.canvas && pg.canvas.key === 'detail'); };
    for (let guard = 0; guard < 12 && !onIt(); guard++) { cc(14, 127); ticks(3); }
    for (let guard = 0; guard < 12 && !onIt(); guard++) { cc(14, 1); ticks(3); }
    if (!onIt()) throw new Error('rig: the canvas page is not in the jog rotation — on ' +
                                 JSON.stringify(snd.soundPPForTest().page));
}
/* Bounding box of the pixels that differ between two frames. */
function diffBox(a, b) {
    let x0 = 128, y0 = 64, x1 = -1, y1 = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++)
        if (a[y * 128 + x] !== b[y * 128 + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const pageName = () => { const pg = snd.soundPPForTest().page; return pg ? pg.name : null; };
function jogToPage(name) {
    for (let g = 0; g < 14 && pageName() !== name; g++) { cc(14, 127); ticks(3); }
    for (let g = 0; g < 14 && pageName() !== name; g++) { cc(14, 1); ticks(3); }
    if (pageName() !== name) throw new Error('rig: never reached the ' + name + ' page — on ' + pageName());
}
/* An ERRAND off the editor (what a preset load does: VIEW_EDIT -> the preset
 * screens -> back), so dAVEBOx records the page you left from. */
function errandFrom(name) {
    jogToPage(name);
    snd.soundSetViewForTest(3);              /* VIEW_PRESET_SRC */
    ticks(3);
    if (snd.soundPPForTest().on) throw new Error('rig: the editor stayed up during the errand');
    snd.soundSetViewForTest(1);              /* VIEW_EDIT */
    ticks(4);
    if (pageName() !== name) throw new Error('rig: the errand did not return to ' + name + ' (on ' + pageName() + ')');
}
/* DR32's ENGN gesture: touch the cell's knob, click into the canvas, then the
 * module closes itself on a row click. */
function diveAndClose() {
    globalThis.__closeOnClick = false;
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 127]));      /* touch K1 (detail) */
    cc(3, 127); cc(3, 0);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 0, 0]));        /* let go */
    ticks(3);
    if (snd.soundViewForTest() !== 23) throw new Error('rig: the click did not open the canvas (view ' + snd.soundViewForTest() + ')');
    /* The fixture closes on any CC 3 once armed — armed only now, so the
     * release of the click that OPENED it does not close it. */
    globalThis.__closeOnClick = true;
    cc(3, 127);                                                             /* a row: ctx.close() */
    globalThis.__closeOnClick = false;
    cc(3, 0);
    ticks(6);
    if (snd.soundViewForTest() === 23) throw new Error('rig: the module did not close its canvas');
}

step('setup: a Schwung track, FX 1 editor up', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    openOnTrack(1);                          /* the rig loads the module into slots 0-3 */
});

step('with no errand behind it, the dive returns to Pad — not the module\'s first page (Main)', () => {
    jogToPage('Pad');
    spoken.length = 0;
    diveAndClose();
    if (pageName() !== 'Pad') throw new Error('landed on ' + pageName());
});

step('⭐ the screen reader names the page you are ON — the last word on return is Pad, not the first page', () => {
    /* Josh's log: "808 Kick, 3 of 10" announced on return while the screen
     * showed My Presets. The editor announces the page it lands on, then the
     * restore moves it — which must be announced too. */
    const last = spoken[spoken.length - 1] || '';
    if (!/^Pad\b/.test(last)) throw new Error('last announcement on return: "' + last + '" (all: ' + JSON.stringify(spoken) + ')');
});

step('⭐⭐ after an errand from ANOTHER page, the dive still returns to Pad — on screen, not just in state', () => {
    jogToPage('Other'); ticks(2);
    const otherFrame = frame();
    errandFrom('Other');                     /* the crumb now names Other */
    jogToPage('Pad'); ticks(2);
    const padFrame = frame();
    if (padFrame.every((v, i) => v === otherFrame[i])) throw new Error('rig: Pad and Other draw the same frame — the screen check would be blind');
    diveAndClose();
    if (pageName() !== 'Pad')
        throw new Error('the dive came back to "' + pageName() + '" — the stale errand page, the DR32 bug');
    ticks(2);
    const back = frame();
    if (back.every((v, i) => v === otherFrame[i])) throw new Error('the screen DRAWS the Other page');
    if (!back.every((v, i) => v === padFrame[i])) throw new Error('the screen is not the Pad page it dove from');
});

step('...and the errand return itself still works (the crumb is not simply gone)', () => {
    errandFrom('Other');
    if (pageName() !== 'Other') throw new Error('an errand from Other came back to ' + pageName());
});

if (failed) { console.error('test_canvas_dive_return_page: FAIL'); process.exit(1); }
console.log('test_canvas_dive_return_page: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
