/* tests/js/test_custom_widgets.mjs — a module's OWN in-grid widget draws in
 * dAVEBOx's module editor (upstream #420 / #450 / #472, ported for dAVEBOx).
 *
 * ⚠⚠ THE GESTURE, NOT THE FUNCTION. The shared registry had zero writers in
 * this tree: every custom cell fell through to a dial, silently. Filling it
 * from the wrong place (the host's chain editor) would be green and invisible,
 * so this drives dAVEBOx's real input path — Shift+Note into the sound menu,
 * jog to FX 1, click — against upstream's REAL widget-test module.json and
 * canvas.js (tests/fixtures/widget-test), then renders a frame through
 * dAVEBOx's own param-pages binding and asserts the module's drawer RAN.
 * → [[wired-is-not-reachable]], [[test-the-path-not-the-function]]
 *
 * The host stubs copy the C semantics, because the state machine is built on
 * the difference:
 *   shadow_get_param      null = the read FAILED; "" = answered, nothing there
 *   host_read_file        null when the file cannot be opened
 *   shadow_load_ui_module reads the file, evaluates it, false on a missing
 *                         file or a throw (the exception is logged, not raised)
 */
import './_bulk_get_stub.mjs';
import fs from 'fs';
import path from 'path';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + l + '") got an ASYNC function — hoist the awaits');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

/* ---- the module on disk ------------------------------------------------- */
const FIX = path.resolve(process.cwd(), 'tests/fixtures/widget-test');
const DEV_DIR = '/data/UserData/schwung/modules/audio_fx/widget-test';
const MODJSON = JSON.parse(fs.readFileSync(path.join(FIX, 'module.json'), 'utf8'));
/* What a test may change about the files, without touching the fixture:
 * `canvas` = null hides canvas.js (a rename); a string replaces its bytes. */
const disk = { canvas: undefined };
function devToFixture(p) {
    p = String(p);
    return p.startsWith(DEV_DIR + '/') ? path.join(FIX, p.slice(DEV_DIR.length + 1)) : null;
}
function readDev(p) {
    if (String(p) === DEV_DIR + '/canvas.js' && disk.canvas !== undefined) return disk.canvas;
    const f = devToFixture(p);
    try { return f ? fs.readFileSync(f, 'utf8') : null; } catch (e) { return null; }
}

/* ---- host surface --------------------------------------------------------- */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => readDev(p);                 /* null = fopen failed */
globalThis.host_file_exists = (p) => readDev(p) !== null;
/* ⚠⚠ TRIPWIRE: the entry-point wrappers swallow exceptions into seq8-jserr.log,
 * so a tick that died on line one looks exactly like a clean pass. */
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

/* Every evaluation of a module script, and every call into a drawer. The spy
 * wraps what the script REALLY assigned and calls straight through. */
const loads = [];
const draws = [];
globalThis.shadow_load_ui_module = (p) => {
    const src = readDev(p);
    loads.push(String(p));
    if (src === null) return false;                             /* js_load_file failed */
    try {
        (new Function('"use strict";\n' + src))();
    } catch (e) {
        return false;                                           /* eval_buf != 0 */
    }
    const ov = globalThis.canvas_overlay;
    if (ov && typeof ov.drawCell === 'function') {
        const real = ov.drawCell;
        ov.drawCell = function (ctx, payload) {
            draws.push({ kind: payload.group && payload.group.kind, w: ctx.width, h: ctx.height });
            return real.call(this, ctx, payload);
        };
    }
    if (ov && ov.widgetKinds && typeof ov.widgetKinds === 'object' && !Array.isArray(ov.widgetKinds)) {
        for (const k of Object.keys(ov.widgetKinds)) {
            const e = ov.widgetKinds[k];
            if (e && typeof e.draw === 'function') {
                const real = e.draw;
                e.draw = function (ctx, payload) {
                    draws.push({ kind: payload.group && payload.group.kind, w: ctx.width, h: ctx.height });
                    return real.call(this, ctx, payload);
                };
            }
        }
    }
    return true;
};

/* The slot's chain. fx1 holds widget-test; everything else is empty. */
const failKeys = new Set();                     /* reads that do not answer */
const engine = {};
function loadWidgetTest(slot) {
    engine[slot + ':fx1:module'] = 'widget-test';
    engine[slot + ':fx1:chain_params'] = JSON.stringify(MODJSON.capabilities.chain_params);
    engine[slot + ':fx1:ui_hierarchy'] = JSON.stringify(MODJSON.ui_hierarchy);
    engine[slot + ':fx1:level'] = '0.5';
    engine[slot + ':fx1:mode'] = '1';
}
loadWidgetTest(0);
const paramReads = [];
globalThis.shadow_get_param = (slot, k) => {
    if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
    paramReads.push(slot + ':' + k);
    if (failKeys.has(k)) return null;
    const v = engine[slot + ':' + k];
    return v === undefined ? '' : v;
};
globalThis.shadow_set_param = (slot, k, v) => {
    const m = String(k).match(/^(.*):module$/);
    if (m) {
        if (!v) {
            for (const key of Object.keys(engine)) if (key.startsWith(slot + ':' + m[1] + ':')) delete engine[key];
        } else engine[slot + ':' + k] = String(v);
    }
    return 1;
};

/* A framebuffer, so "drew" is ink and not a decision. */
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
/* The SAME specifier dAVEBOx imports — so this is the instance it fills. */
const REG = await import('/data/UserData/schwung/shared/param_pages/widget_registry.mjs');

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function frame() { globalThis.clear_screen(); render.drawUI(); }

/* Shift+Note -> the sound menu -> jog to the FX 1 row -> click. */
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
/* Out of sound mode the way a user leaves it: Back until the menu is gone. */
function leaveSound() {
    for (let i = 0; i < 6 && snd.soundOpen(); i++) { cc(51, 127); cc(51, 0); ticks(2); }
    ticks(2);
}

step('setup: a Schwung track', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0; S.trackChannel[0] = 1;
    ticks(8);
});

/* The first two cells of the knob row — `level` (custom:wtmeter) and `mode`
 * (custom:wtmode) — as pixels. Custom or built-in, they are drawn in the same
 * place from the same values, so the only thing that can change them between
 * the control and the real case is who drew them. */
function cellInk() {
    const out = [];
    for (let y = 12; y < 56; y++) for (let x = 0; x < 64; x++) out.push(FB[y * 128 + x]);
    return out.join('');
}
let controlInk = '';
let controlEvals = -1;      /* canvas.js evaluations the gesture costs WITHOUT us (discovery's kit probe) */

/* ── CONTROL first: the same rig with the loader off draws built-ins ───────── */
step('⚠ CONTROL: without the loader the same gesture draws built-in widgets, and no module drawer runs', () => {
    snd.soundWidgetsEnableForTest(false);
    try {
        loads.length = 0;
        openFx1Editor();
        ticks(4);
        controlEvals = loads.filter(p => p.endsWith('/canvas.js')).length;
        draws.length = 0;
        frame();
        if (draws.length) throw new Error('a module drawer ran with the loader off: ' + JSON.stringify(draws));
        if (REG.isWidgetAvailable('custom:wtmeter')) throw new Error('registry filled with the loader off');
        controlInk = cellInk();
        if (controlInk.indexOf('1') < 0) throw new Error('the cells drew nothing — the rig cannot see a widget');
        leaveSound();
    } finally {
        snd.soundWidgetsEnableForTest(true);
    }
});

/* ── Test A ───────────────────────────────────────────────────────────────── */
step('⭐⭐ opening the editor registers the module\'s widgets in the registry the grid reads', () => {
    loads.length = 0;
    openFx1Editor();
    ticks(4);
    if (!REG.isWidgetAvailable('custom:wtmeter') || !REG.isWidgetAvailable('custom:wtmode'))
        throw new Error('not registered: wtmeter=' + REG.isWidgetAvailable('custom:wtmeter')
                        + ' wtmode=' + REG.isWidgetAvailable('custom:wtmode'));
    const w = snd.soundWidgetsForTest();
    if (!w.ok || w.loads !== 1) throw new Error('state: ' + JSON.stringify(w));
    const evals = loads.filter(p => p.endsWith('/canvas.js')).length;
    if (evals !== controlEvals + 1)
        throw new Error('canvas.js evaluated ' + evals + ' times; the same gesture without the loader costs '
                        + controlEvals + ' — the loader must add exactly one');
});

step('⭐⭐ the frame runs the module\'s drawCell through dAVEBOx\'s binding — both kinds, in cells', () => {
    draws.length = 0;
    frame();
    const kinds = new Set(draws.map(d => d.kind));
    if (!kinds.has('custom:wtmeter')) throw new Error('drawCell never ran: ' + JSON.stringify(draws));
    if (!kinds.has('custom:wtmode')) throw new Error('the widgetKinds drawer never ran: ' + JSON.stringify(draws));
    for (const d of draws) if (!(d.w > 0 && d.w < 128 && d.h > 0 && d.h < 64))
        throw new Error('a drawer got a non-cell frame: ' + JSON.stringify(d));
    if (cellInk() === controlInk)
        throw new Error('the cells are pixel-identical to the built-in control — the drawer ran but drew nothing of its own');
});

step('the load kept dAVEBOx alive — its globals survive a script that could assign them', () => {
    for (const n of ['init', 'tick', 'onMidiMessageInternal', 'onMidiMessageExternal'])
        if (typeof globalThis[n] !== 'function') throw new Error(n + ' was lost across the load');
    if ('canvas_overlay' in globalThis) throw new Error('canvas_overlay leaked into the shared globals');
});

step('settled: ticking on does not reload, re-read or re-evaluate', () => {
    loads.length = 0;
    const before = paramReads.filter(k => k.endsWith('chain_params')).length;
    ticks(60);
    frame();
    if (loads.length) throw new Error('re-evaluated per tick: ' + loads.length);
    const after = paramReads.filter(k => k.endsWith('chain_params')).length;
    if (after !== before) throw new Error('chain_params re-read ' + (after - before) + 'x while settled');
});

leaveSound();
if (swallowed !== null) bad('no swallowed exception in any callback', swallowed);
if (failed) process.exit(1);
console.log('PASS: custom widgets draw in dAVEBOx\'s module editor');
}
main();
