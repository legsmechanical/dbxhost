/* tests/js/test_canvas_page_door.mjs — an ENTERABLE module page is a door in
 * dAVEBOx's module editor (upstream e5c9cf46, for DR32's Resample page).
 *
 * Josh, on the device: on DR32's Resample page, clicking "kicks you to the
 * section selector instead of letting you select an option on the page". The
 * shared controller had no door for a canvas page, and dAVEBOx's editor io had
 * no way to hand the module a gesture. This drives dAVEBOx's real input path
 * (Shift+Note -> sound menu -> FX 1 -> click -> jog to the page -> click) and
 * asserts what the MODULE received and which screen you are on.
 *
 * FIXTURE: test_canvas_page's widget-test module, with `detail` declared the
 * way DR32 declares Resample — `as_page: true, enterable: true`, no preset
 * browser — and an overlay that records onMidi / handleBack.
 */
import './_bulk_get_stub.mjs';
import fs from 'fs';
import path from 'path';

const engineLog = [];
const _log = console.log.bind(console);
console.log = (...a) => { const m = a.join(' '); if (m.indexOf('[engine] canvas page') === 0) engineLog.push(m); _log(...a); };

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
    if (p.key === 'detail') { p.as_page = true; p.enterable = true; }
}
/* DR32's shape: the page is its OWN level, reached from root, with a borrowed
 * knob — `levels.resample = { params: [the canvas], knobs: ["master"] }`. */
MODJSON.ui_hierarchy.levels.root.params = MODJSON.ui_hierarchy.levels.root.params
    .filter(p => p.key !== 'detail').concat([{ level: 'resample', label: 'Resample' }]);
MODJSON.ui_hierarchy.levels.resample = { name: 'Resample', params: [{ key: 'detail' }], knobs: ['level', 'mode'] };

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
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
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
const onDoor = () => { const pg = snd.soundPPForTest().page; return !!(pg && pg.canvas && pg.canvas.key === 'detail'); };
const midi = () => globalThis.__hooks.filter(h => h[0] === 'onMidi').map(h => h[1]);

step('setup: a Schwung track, FX 1 editor, on the enterable page', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0; S.trackRoute[0] = 0; S.trackChannel[0] = 1;
    ticks(8);
    openOnTrack(1);
    jogToCanvasPage();
    const pg = snd.soundPPForTest().page;
    if (!pg.canvas.enterable) throw new Error('the plan dropped `enterable`: ' + JSON.stringify(pg.canvas));
});

step('⭐ click ENTERS the page — it does not open the section picker, and the module is not sent the click yet', () => {
    globalThis.__hooks.length = 0;
    cc(3, 127); cc(3, 0); ticks(3);
    if (!onDoor()) throw new Error('the click left the page: now on ' + JSON.stringify(pageName()));
    if (midi().length) throw new Error('the entering click was also sent to the module: ' + JSON.stringify(midi()));
});

step('⭐⭐ entered: the jog and the click reach the MODULE as CC 14 / CC 3, and the page stays', () => {
    globalThis.__hooks.length = 0;
    cc(14, 1); ticks(2);
    cc(14, 127); ticks(2);
    cc(3, 127); cc(3, 0); ticks(2);
    const got = midi();
    if (JSON.stringify(got) !== JSON.stringify([[0xB0, 14, 1], [0xB0, 14, 127], [0xB0, 3, 127]]))
        throw new Error('the module received ' + JSON.stringify(got));
    if (!onDoor()) throw new Error('the jog paged away while entered: on ' + JSON.stringify(pageName()));
    if (globalThis.__hooks.filter(h => h[0] === 'onMidi').map(h => h[2]).join() !== '1,2,3')
        throw new Error('ctx.state did not persist across hooks: ' + JSON.stringify(globalThis.__hooks));
});

step('⭐ the state onMidi moved reaches drawPage (upstream #534): a cursor the module moves can be drawn', () => {
    globalThis.__pageCalls.length = 0;
    frame();
    const last = globalThis.__pageCalls[globalThis.__pageCalls.length - 1];
    if (!last) throw new Error('drawPage was not called');
    if (!last.payload.state || last.payload.state.n !== 3)
        throw new Error('drawPage got state ' + JSON.stringify(last.payload.state) + ', the hooks counted 3');
});

step('a dive script\'s methods work from a page hook (shiftHeld, measureText, getValue, setValue, random)', () => {
    globalThis.__callDiveMethods = true; globalThis.__dive = null; globalThis.__hooks.length = 0;
    cc(14, 1); ticks(2);
    globalThis.__callDiveMethods = false;
    if (!globalThis.__dive) throw new Error('the hook threw before recording — ' + engineLog.slice(-2).join(' | '));
    const [shift, w, val, setv, rnd] = globalThis.__dive;
    if (shift !== false || w !== 17 || typeof val !== 'string' || setv !== 'function' || rnd !== 'number')
        throw new Error('unexpected ' + JSON.stringify(globalThis.__dive));
    if (engineLog.some(m => m.indexOf('disabled after throw') >= 0))
        throw new Error('the page was retired: ' + engineLog.join(' | '));
});

step('Back is the module\'s first: true stays in, then a decline leaves the door (still on the page)', () => {
    globalThis.__hooks.length = 0; globalThis.__backStays = 1;
    cc(51, 127); cc(51, 0); ticks(2);
    cc(14, 1); ticks(2);
    if (JSON.stringify(midi()) !== JSON.stringify([[0xB0, 14, 1]]))
        throw new Error('after a Back the module kept, the jog should still be the module\'s: ' + JSON.stringify(globalThis.__hooks));
    globalThis.__hooks.length = 0;
    cc(51, 127); cc(51, 0); ticks(2);
    if (!globalThis.__hooks.some(h => h[0] === 'handleBack')) throw new Error('handleBack was not asked');
    if (!onDoor()) throw new Error('the declining Back left the PAGE, not just the door: on ' + JSON.stringify(pageName()));
    globalThis.__hooks.length = 0;
    cc(14, 1); ticks(3);
    if (midi().length) throw new Error('after leaving the door the jog still went to the module');
    if (onDoor()) throw new Error('outside the door the jog should page on, and did not');
});

step('ctx.close() from the module leaves the door', () => {
    jogToCanvasPage();
    cc(3, 127); cc(3, 0); ticks(2);                     /* enter */
    globalThis.__closeOnClick = true; globalThis.__hooks.length = 0;
    cc(3, 127); cc(3, 0); ticks(2);                     /* the module picks and closes */
    globalThis.__closeOnClick = false;
    globalThis.__hooks.length = 0;
    cc(14, 1); ticks(3);
    if (midi().length) throw new Error('the door stayed open after ctx.close()');
});

if (failed) { console.log('FAIL: canvas page door'); process.exit(1); }
console.log('PASS: an enterable module page is a door in dAVEBOx\'s editor: click enters, the jog and click are the module\'s, Back is the module\'s first');
}
main().catch(e => { console.error(e); process.exit(1); });
