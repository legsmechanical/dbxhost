/* tests/js/bundle_custom_widgets.mjs — custom widgets, THROUGH THE SHIPPED
 * BUNDLE. Run by tests/test_custom_widgets_bundle.sh, which first builds
 * dist/davebox/ui.js with scripts/bundle_ui.sh and then runs this under
 * `node --import ./tools/audit_loader.mjs` (device-absolute shared imports ->
 * the real files in this repo).
 *
 * ⚠⚠ WHAT ONLY THE BUNDLE CAN ANSWER. The registry dAVEBOx fills and the one
 * the grid reads are the same object only because both resolve to ONE module
 * NAME at runtime: dAVEBOx imports it by the canonical specifier, the binding
 * reaches it relatively from the same directory. In the bundle both stay
 * EXTERNAL, so identity is decided by the runtime's module map — QuickJS keys
 * it by normalised name, node by URL, and the hooks make the two agree. A test
 * that bundles the shared files INTO itself would have one copy whatever the
 * specifiers said, and could not fail. And module-scope registrations have
 * been wiped by bundle ORDER before, which no import-the-modules test sees.
 * → [[module-scope-registration-wiped-by-bundle-order]]
 *
 * This file drives the artifact the way the host does: init, tick, and the
 * MIDI callbacks on globalThis — it has no handle on davebox's state at all.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');                 /* davebox/ */
const BUNDLE = path.join(root, 'dist/davebox/ui.js');
const FIX = path.join(root, 'tests/fixtures/widget-test');
const DEV_DIR = '/data/UserData/schwung/modules/audio_fx/widget-test';
const MODJSON = JSON.parse(fs.readFileSync(path.join(FIX, 'module.json'), 'utf8'));

let failed = 0;
const ok = (m) => console.log('  ok   — ' + m);
const fail = (m) => { console.error('  FAIL — ' + m); failed = 1; };

/* ---- the static half: what the artifact imports ------------------------- */
const src = fs.readFileSync(BUNDLE, 'utf8');
const SPEC = '/data/UserData/schwung/shared/param_pages/widget_registry.mjs';
if (src.indexOf('from "' + SPEC + '"') < 0)
    fail('the bundle does not import the registry by its canonical specifier');
else ok('the bundle imports the registry EXTERNALLY by ' + SPEC);
if (/function\s+registerOverlayWidgets\s*\(|function\s+isWidgetAvailable\s*\(/.test(src))
    fail('the registry was INLINED into the bundle — a second copy the grid never reads');
else ok('no inlined copy of the registry');

/* The binding's own path to the registry, resolved the way QuickJS normalises
 * an import: a relative one against the importing module's NAME, an absolute
 * one as written. */
const SHARED = path.resolve(root, '../src/shared');
function relImports(file) {
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const m of text.matchAll(/^\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
    for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
    return out;
}
{
    const start = '/data/UserData/schwung/shared/param_pages/binding_movy.mjs';
    const seen = new Set([start]);
    const queue = [start];
    let reached = false;
    while (queue.length) {
        const name = queue.shift();
        if (name === SPEC) { reached = true; break; }
        const file = path.join(SHARED, name.slice('/data/UserData/schwung/shared/'.length));
        if (!fs.existsSync(file)) continue;
        for (const rel of relImports(file)) {
            if (!rel.startsWith('.') && !rel.startsWith('/')) continue;   /* std / os */
            const n = rel.startsWith('/') ? rel
                : path.posix.normalize(path.posix.join(path.posix.dirname(name), rel));
            if (!seen.has(n)) { seen.add(n); queue.push(n); }
        }
    }
    if (reached) ok('binding_movy.mjs reaches the registry under the SAME normalised name');
    else fail('the binding does not reach ' + SPEC + ' by name — two registries on device');
}

/* ---- the host surface (C semantics: null = failed read) ------------------ */
function readDev(p) {
    p = String(p);
    if (!p.startsWith(DEV_DIR + '/')) return null;
    try { return fs.readFileSync(path.join(FIX, p.slice(DEV_DIR.length + 1)), 'utf8'); } catch (e) { return null; }
}
const engine = {
    '0:fx1:module': 'widget-test',
    '0:fx1:chain_params': JSON.stringify(MODJSON.capabilities.chain_params),
    '0:fx1:ui_hierarchy': JSON.stringify(MODJSON.ui_hierarchy),
    '0:fx1:level': '0.5', '0:fx1:mode': '1',
};
const draws = [];
let swallowed = null;
Object.assign(globalThis, {
    host_system_cmd: () => 0,
    host_read_file: (p) => readDev(p),
    host_file_exists: (p) => readDev(p) !== null,
    host_write_file: (p, b) => { if (String(p).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(b).slice(0, 900); return true; },
    host_ensure_dir: () => true, host_remove_dir: () => true,
    host_module_set_param: () => {}, host_module_set_params: () => true,
    host_module_get_param: () => '', host_module_get_params: () => '',
    host_state_subdir: () => 'dAVEBOx',
    shadow_save_state_now: () => true,
    host_vol_block: () => {}, host_edit_cc_block: () => {},
    shadow_get_param: (slot, k) => {
        if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
        const v = engine[slot + ':' + k];
        return v === undefined ? '' : v;
    },
    shadow_set_param: () => 1,
    shadow_load_ui_module: (p) => {
        const text = readDev(p);
        if (text === null) return false;
        try { (new Function('"use strict";\n' + text))(); } catch (e) { return false; }
        const ov = globalThis.canvas_overlay;
        if (ov && typeof ov.drawCell === 'function') {
            const real = ov.drawCell;
            ov.drawCell = function (ctx, payload) { draws.push(payload.group && payload.group.kind); return real.call(this, ctx, payload); };
        }
        return true;
    },
    clear_screen: () => {}, print: () => {}, text_width: (t) => String(t).length * 6,
    fill_rect: () => {}, draw_rect: () => {}, stipple_rect: () => {}, set_pixel: () => {},
    draw_line: () => {}, draw_circle: () => {}, draw_arc: () => {}, fill_circle: () => {},
    flush_display: () => {}, move_midi_internal_send: () => {}, set_led: () => {},
    shadow_get_ui_flags: () => 0, shadow_get_shift_held: () => 1,
    host_register_primary: () => true, host_open_service: () => {}, host_close_service: () => {},
    host_ext_midi_remap_clear: () => {}, host_ext_midi_remap_set: () => {}, host_ext_midi_remap_enable: () => {},
    host_seed_module_defaults: () => [0, 0],
    shadow_restore_knob_leds: () => {}, param_view_get_mode: () => 1, tts_get_enabled: () => false,
    host_trace_begin: () => 0, host_trace_end: () => {},
    shadow_send_midi_to_dsp: () => {},
});

/* ---- the runtime half ----------------------------------------------------- */
await import(pathToFileURL(BUNDLE).href);
const REG = await import(SPEC);
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
const MoveNoteSession = 50;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };

globalThis.init();
ticks(30);
cc(MoveNoteSession, 127); cc(MoveNoteSession, 0);       /* Note view */
ticks(8);
cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
ticks(8);
/* A fresh Schwung track's menu: Instrument, MIDI FX, FX 1 — dividers are not
 * stops. Two detents lands on FX 1; the registry answers whether it did. */
cc(14, 1); ticks(2); cc(14, 1); ticks(2);
cc(3, 127); cc(3, 0);
ticks(40);

if (REG.isWidgetAvailable('custom:wtmeter') && REG.isWidgetAvailable('custom:wtmode'))
    ok('the bundle\'s loader filled the registry that ' + SPEC + ' names');
else fail('after opening FX 1 in the bundle the registry is empty (wtmeter=' + REG.isWidgetAvailable('custom:wtmeter') + ')');
if (draws.indexOf('custom:wtmeter') >= 0)
    ok('the grid, reading the registry by its RELATIVE import, ran the module\'s drawCell');
else fail('no drawCell ran through the bundle\'s grid (' + draws.length + ' draws)');
if (swallowed !== null) fail('a callback threw and was swallowed: ' + swallowed);

if (failed) process.exit(1);
