/* tests/js/test_canvas_page.mjs — a MODULE-OWNED PAGE draws in dAVEBOx's module
 * editor (upstream #420's third part: `type: "canvas"` + `as_page`, e.g.
 * MonkSynth's fullscreen Face page).
 *
 * ⚠⚠ THE GESTURE, NOT THE FUNCTION. The shared controller returns early when
 * its io offers no `drawCanvasPage`, and dAVEBOx's ppIo() offered none — so the
 * page was in the jog rotation, its header and footer drew, and the band
 * between them was silently blank. This drives dAVEBOx's real input path
 * (Shift+Note -> sound menu -> FX 1 -> click -> jog to the page), renders
 * through render.drawUI(), and asserts on INK.
 * → [[wired-is-not-reachable]], [[test-the-path-not-the-function]]
 *
 * THE FIXTURE is upstream's widget-test module, extended IN MEMORY (the files
 * are shared with test_custom_widgets and stay byte-identical):
 *   - `detail` (type canvas) gains `as_page: true, preset_browser: true`, and
 *     the root level a list/count/name param, so the page IS the level's
 *     browser — MonkSynth's exact declaration shape;
 *   - `level` gains MonkSynth's widget shape too: `live: true` and
 *     `viz.extra_keys: ["face"]`, with a read-only int `face` param;
 *   - canvas.js gains a `canvas_overlay.drawPage` that records its call and
 *     fills its whole frame. `disk.page` switches it: ok | absent | throw.
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
    if (p.key === 'detail') { p.as_page = true; p.preset_browser = true; }
    if (p.key === 'level') { p.live = true; p.viz.extra_keys = ['face']; }
}
MODJSON.capabilities.chain_params.unshift({ key: 'face', name: 'Character', short_name: 'Char',
    type: 'int', min: 0, max: 11, step: 1, default: 0, access: 'read', show_value: false });
Object.assign(MODJSON.ui_hierarchy.levels.root,
    { list_param: 'preset', count_param: 'preset_count', name_param: 'preset_name' });

const CANVAS_SRC = fs.readFileSync(path.join(FIX, 'canvas.js'), 'utf8');
const PAGE_OK = "\nglobalThis.canvas_overlay.drawPage = function (ctx, payload) {\n"
    + "  globalThis.__pageCalls.push({ w: ctx.width, h: ctx.height, payload: payload });\n"
    + "  ctx.fillRect(0, 0, ctx.width, ctx.height, 1);\n"
    + "  ctx.fillRect(-40, -40, 400, 400, 1);   /* reaching outside: must be clipped */\n"
    + "};\n";
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
    const onIt = () => { const pg = snd.soundPPForTest().page; return !!(pg && pg.name === 'Detail'); };
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

step('setup: a Schwung track', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0; S.trackChannel[0] = 1;
    ticks(8);
});

/* ── B first: the CONTROL frame — drawPage absent -> chrome only, no throw ── */
let controlFrame = null;
let controlEvals = -1;
step('⚠ B (control): drawPage ABSENT — the page draws its chrome, nothing throws, one log line', () => {
    disk.page = 'absent';
    engineLog.length = 0; loads.length = 0;
    openOnTrack(1);
    controlEvals = evalsOfCanvas();
    jogToCanvasPage();
    globalThis.__pageCalls.length = 0;
    controlFrame = frame();
    ticks(30); frame();
    if (globalThis.__pageCalls.length) throw new Error('a drawer ran with no drawPage');
    if (controlFrame.indexOf(1) < 0) throw new Error('the page drew no chrome at all — the rig cannot see a frame');
    if (engineLog.length !== 1 || engineLog[0].indexOf('exposes no drawPage') < 0)
        throw new Error('want one "no drawPage" line, got ' + JSON.stringify(engineLog));
    if (evalsOfCanvas() !== controlEvals) throw new Error('the draw path evaluated canvas.js: ' + (evalsOfCanvas() - controlEvals) + 'x');
    leaveSound();
});

/* ── A: the real thing ─────────────────────────────────────────────────────── */
let visitEvals = -1;
step('⭐⭐ A: jog to the module page — drawPage runs with upstream\'s payload and paints the band', () => {
    disk.page = 'ok';
    loads.length = 0;
    openOnTrack(2);
    jogToCanvasPage();
    globalThis.__pageCalls.length = 0;
    const fb = frame();
    visitEvals = evalsOfCanvas();
    const calls = globalThis.__pageCalls;
    if (calls.length !== 1) throw new Error('drawPage calls per frame: ' + calls.length);
    const { w, h, payload } = calls[0];
    for (const k of ['key', 'values', 'base', 'keys', 'touched', 'preset', 'nowMs', 'width', 'height'])
        if (!(k in payload)) throw new Error('payload lacks ' + k + ': ' + Object.keys(payload));
    if (payload.key !== 'detail') throw new Error('payload.key ' + payload.key);
    if (typeof payload.values !== 'object' || typeof payload.base !== 'object') throw new Error('values/base not objects');
    if (!Array.isArray(payload.keys) || payload.keys.indexOf('level') < 0) throw new Error('keys: ' + JSON.stringify(payload.keys));
    if (payload.touched !== -1) throw new Error('touched ' + payload.touched);
    if (typeof payload.nowMs !== 'number') throw new Error('nowMs ' + payload.nowMs);
    if (payload.width !== w || payload.height !== h) throw new Error('width/height disagree with the ctx');
    if (!payload.preset || typeof payload.preset !== 'object')
        throw new Error('a preset_browser page got no browser state: ' + JSON.stringify(payload.preset));
    if (!(w > 0 && w <= 128 && h > 0 && h < 64)) throw new Error('band ' + w + 'x' + h);

    /* Ink: what differs from the control is exactly the band, and nothing else. */
    const box = diffBox(controlFrame, fb);
    if (!box) throw new Error('the frame is pixel-identical to the control — drawPage painted nothing');
    if (box.w > w || box.h > h)
        throw new Error('ink outside the band (' + JSON.stringify(box) + ' vs ' + w + 'x' + h + ') — the chrome was painted over');
    const cx = box.x + (box.w >> 1), cy = box.y + (box.h >> 1);
    if (!fb[cy * 128 + cx]) throw new Error('the band centre is not lit');
    if (box.y === 0) throw new Error('the band starts on row 0 — the header was painted over');
});

step('A: dAVEBOx\'s globals survive, and canvas_overlay did not leak', () => {
    for (const n of ['init', 'tick', 'onMidiMessageInternal', 'onMidiMessageExternal'])
        if (typeof globalThis[n] !== 'function') throw new Error(n + ' was lost');
    if ('canvas_overlay' in globalThis) throw new Error('canvas_overlay leaked into the shared globals');
});

step('⭐ D: a whole visit — entry, jog, drawing the page — evaluates canvas.js no more than entry alone', () => {
    /* controlEvals is counted straight after ENTRY, before any frame, so the
     * page drawer has not run: discovery's kit probe + the widget loader, the
     * cost of a visit before this port. The real visit, measured AFTER the
     * page drew, must cost exactly that. */
    _log('  canvas.js evaluations: entry alone ' + controlEvals + ', whole visit with the page drawn ' + visitEvals);
    if (visitEvals !== controlEvals) throw new Error('visit evaluations ' + visitEvals + ' vs entry ' + controlEvals);
    loads.length = 0;
    ticks(60);
    for (let i = 0; i < 5; i++) frame();
    if (evalsOfCanvas()) throw new Error('drawing the page evaluated canvas.js ' + evalsOfCanvas() + 'x');
});

step('D: the page drawer SHARED the widget loader\'s evaluation — one per entry, total', () => {
    /* Everything but discovery's kit probe (engineLoadKitStructure) is one
     * evaluation: the widgets and the page share it. */
    leaveSound();
    loads.length = 0;
    openOnTrack(3);
    const atEntry = evalsOfCanvas();
    jogToCanvasPage();
    globalThis.__pageCalls.length = 0;
    frame();
    if (globalThis.__pageCalls.length !== 1) throw new Error('rig: drawPage did not run');
    if (evalsOfCanvas() !== atEntry) throw new Error('reaching the page added ' + (evalsOfCanvas() - atEntry) + ' evaluations');
    if (atEntry !== controlEvals) throw new Error('entry cost ' + atEntry + ', control ' + controlEvals);
});

/* ── C: a throwing drawPage ────────────────────────────────────────────────── */
step('⭐ C: drawPage THROWS — retired once with one log line, the chrome still draws', () => {
    leaveSound();
    disk.page = 'throw';
    engineLog.length = 0;
    globalThis.__pageCalls.length = 0;
    openOnTrack(0);
    jogToCanvasPage();
    let fb = frame();
    for (let i = 0; i < 20; i++) { ticks(1); fb = frame(); }
    if (globalThis.__pageCalls.length !== 1) throw new Error('a thrower was called ' + globalThis.__pageCalls.length + 'x in one visit');
    if (engineLog.length !== 1 || engineLog[0].indexOf('disabled after throw') < 0)
        throw new Error('want one "disabled" line, got ' + JSON.stringify(engineLog));
    const box = diffBox(controlFrame, fb);
    if (box) throw new Error('after a throw the page must be the control\'s chrome-only frame; differs at ' + JSON.stringify(box));
});

step('⭐ C: a new visit asks the retired drawer again — once', () => {
    leaveSound();
    engineLog.length = 0;
    globalThis.__pageCalls.length = 0;
    openOnTrack(0);
    jogToCanvasPage();
    frame(); frame();
    if (globalThis.__pageCalls.length !== 1) throw new Error('called ' + globalThis.__pageCalls.length + 'x on the new visit (want 1)');
    if (engineLog.length !== 1) throw new Error('want one line on the new visit, got ' + JSON.stringify(engineLog));
});

leaveSound();
if (swallowed !== null) bad('no swallowed exception in any callback', swallowed);
if (failed) process.exit(1);
console.log('PASS: module-owned canvas pages draw in dAVEBOx\'s module editor');
}
main();
