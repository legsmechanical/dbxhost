import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_preset_pages_per_list.mjs — a module with TWO preset browsers
 * shows each one's OWN list in dAVEBOx's module editor (Josh, 2026-09-27, on
 * JE-8086: "both pages show the same files from the directory that lets you
 * load external presets; schwung doesnt have this problem").
 *
 * davebox walks ONE baked list (findPresetSpec: the first level declaring
 * list_param + count_param) and `presetNames` handed it to EVERY preset page,
 * so JE-8086's Preset page drew its Bank list. The fixture is JE-8086's shape
 * — a Bank browser (bank_list) whose child is a Preset browser (patch) — on
 * upstream's widget-test module, driven through the real editor: open FX 1,
 * jog the pages it PLANNED, and ask its real io for each browser's names —
 * what the controller asks before it draws a list.
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
/* JE-8086's browser shape: Bank -> Preset -> the sound (its gen_params.py). */
{
    const L = MODJSON.ui_hierarchy.levels;
    const sound = L.root;
    L.sound = sound;
    L.root = { label: 'Bank', list_param: 'bank_list', count_param: 'bank_list_count',
               name_param: 'bank_list_name', children: 'plist', params: [] };
    L.plist = { label: 'Preset', list_param: 'patch', count_param: 'patch_count',
                name_param: 'patch_name', children: 'sound', params: [] };
}
const BANKS = ['Factory.mid', 'Leads.mid', 'Pads.mid'];
const PATCHES = ['Brass One', 'Soft Pad', 'Hoover', 'Bells'];

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
    engine[slot + ':fx1:bank_list'] = '0';
    engine[slot + ':fx1:bank_list_count'] = String(BANKS.length);
    engine[slot + ':fx1:patch'] = '2';
    engine[slot + ':fx1:patch_count'] = String(PATCHES.length);
}
const derived = (slot, k) => {
    if (k === 'fx1:bank_list_name') return BANKS[(engine[slot + ':fx1:bank_list'] | 0)] || '';
    if (k === 'fx1:patch_name') return PATCHES[(engine[slot + ':fx1:patch'] | 0)] || '';
    return undefined;
};
for (let s = 0; s < 4; s++) loadModule(s);
globalThis.shadow_get_param = (slot, k) => {
    if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
    const d = derived(slot, k);
    if (d !== undefined) return d;
    const v = engine[slot + ':' + k];
    return v === undefined ? '' : v;
};
globalThis.shadow_set_param = (slot, k, v) => { if (typeof slot === 'number') engine[slot + ':' + k] = String(v); return 1; };

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
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));

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

step('setup: a Schwung track, FX 1 = a module with a Bank and a Preset browser', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 1; S.trackRoute[1] = 0; S.trackChannel[1] = 2;
    ticks(8);
    openFx1Editor();
    ticks(4);
});
/* The REAL planned pages, collected by jogging the real editor. */
const pages = {};
step('the editor plans BOTH browsers as preset pages, each with its own keys', () => {
    for (let g = 0; g < 16; g++) { cc(14, 127); ticks(3); }
    for (let g = 0; g < 20; g++) {
        const pg = snd.soundPPForTest().page;
        if (pg && pg.kind === 'preset' && pg.listParam) pages[pg.listParam] = pg;
        cc(14, 1); ticks(3);
    }
    if (!pages.bank_list || !pages.patch) throw new Error('planned browsers: ' + Object.keys(pages));
});
/* Ask as the controller does when a browser is ENTERED; let the walk finish. */
function namesFor(pg) {
    let n = snd.soundPresetNamesForTest(pg, { entered: true, index: 0, count: 0 });
    for (let i = 0; i < 80 && !n; i++) { ticks(1); n = snd.soundPresetNamesForTest(pg, { entered: true, index: 0, count: 0 }); }
    return n;
}
step('the Bank browser gets the bank list', () => {
    const n = namesFor(pages.bank_list);
    if (!Array.isArray(n) || JSON.stringify(n) !== JSON.stringify(BANKS)) throw new Error('bank page names: ' + JSON.stringify(n));
});
step('⭐⭐ the Preset browser does NOT get the bank list (it draws its own current name, as stock does)', () => {
    const n = snd.soundPresetNamesForTest(pages.patch, { entered: true, index: 2, count: PATCHES.length });
    if (Array.isArray(n) && n.some((x) => BANKS.indexOf(x) >= 0))
        throw new Error('the Preset page was handed the bank list: ' + JSON.stringify(n));
    if (n !== null) throw new Error('want null (the single-name body), got ' + JSON.stringify(n));
});
step('the match is the full key triple (list, count, name)', () => {
    const spec = { listKey: 'bank_list', countKey: 'bank_list_count', nameKey: 'bank_list_name' };
    if (!snd.soundPresetPageMatchesSpecForTest({ listParam: 'bank_list', countParam: 'bank_list_count', nameParam: 'bank_list_name' }, spec)) throw new Error('its own page did not match');
    if (snd.soundPresetPageMatchesSpecForTest({ listParam: 'patch', countParam: 'patch_count', nameParam: 'patch_name' }, spec)) throw new Error('another browser matched');
    if (snd.soundPresetPageMatchesSpecForTest({ listParam: 'bank_list', countParam: 'x', nameParam: 'bank_list_name' }, spec)) throw new Error('a different count matched');
});

if (failed) { console.log('FAIL: preset pages show their own lists'); process.exit(1); }
console.log('PASS: each preset browser shows its own list');
}
main().catch((e) => { console.error(e); process.exit(1); });
