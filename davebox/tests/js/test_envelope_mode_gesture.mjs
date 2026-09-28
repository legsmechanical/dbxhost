/* tests/js/test_envelope_mode_gesture.mjs — DR32's envelope picture follows its
 * Envelope switch ON THE SCREEN DAVEBOX OPENS.
 *
 * ⚠⚠ WHY THIS EXISTS (2026-09-28): upstream #545's `mode` role was ported, its
 * drawer test passed on bare keys and hand-made values, and on the device the
 * picture read A-H-D whatever the switch said. The drawer was never the
 * question; what reaches it was. So this drives the real path: the module
 * editor opened the way a user opens it, fed the contract exactly as the Move
 * SERVES it (tests/fixtures/dr32-0.4.0-served.json — DR32's DSP answers
 * `chain_params` from its own chain_params.json, and the chain host prefers
 * that answer), paged to Shape with the jog, and read off a real framebuffer.
 */
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const DR32 = JSON.parse(readFileSync('../tests/fixtures/dr32-0.4.0-served.json', 'utf8'));

/* ---- host surface -------------------------------------------------------- */
const ASSIGN = Object.create(null);
globalThis.shadow_get_param = (slot, key) => { const k = String(key); return k in ASSIGN ? ASSIGN[k] : ''; };
globalThis.shadow_set_param = (slot, key, val) => { ASSIGN[key] = String(val); return 1; };
globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};

/* A REAL FRAMEBUFFER, lines included: the shared device stub makes draw_line
 * inert, and an envelope is drawn in lines. Defined first so the stub (which
 * only fills in what is missing) leaves it alone. */
const FB = new Uint8Array(128 * 64);
const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.set_pixel = px;
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { px((x | 0) + i, y | 0, c); px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { px(x | 0, (y | 0) + j, c); px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.draw_line = (x0, y0, x1, y1, c) => {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let n = 0; n < 512; n++) {
        px(x0, y0, c === undefined ? 1 : c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
    }
};
globalThis.stipple_rect = () => {};
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.host_write_file = () => true;
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir', 'host_remove_dir',
                  'host_system_cmd', 'host_module_set_param', 'host_module_get_param', 'host_send_midi',
                  'move_midi_inject_to_move', 'host_set_led', 'set_led', 'host_get_setting',
                  'host_set_setting', 'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');

const cc = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (d) => cc(14, d > 0 ? 1 : 127);

/* The pad being edited: pad 1, so every Shape key is `pad1_<key>`. */
ASSIGN['synth:module'] = 'dr32';
ASSIGN['synth:ui_hierarchy'] = JSON.stringify(DR32.ui_hierarchy);
ASSIGN['synth:chain_params'] = JSON.stringify(DR32.chain_params);
ASSIGN['synth:ui_current_pad'] = '1';
const set = (k, v) => { ASSIGN['synth:pad1_' + k] = String(v); };
set('attack', 0.01); set('decay', 2); set('hold', 5); set('env_mode', 'A-H-D');

GS.sessionView = false;
for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
GS.activeTrack = 4;
snd.soundExit();
snd.soundEnter(4, 4);
ticks(4);
for (let guard = 0; snd.soundViewForTest() !== 1; guard++) {
    assert(guard < 8, 'rig: never reached the module editor — view ' + snd.soundViewForTest());
    click(); ticks(4);
}
ticks(30);

step('the grid editor has the screen (not the flat fallback)', () => {
    assert(snd.soundPPForTest().on, 'soundPPForTest().on is false');
});

let shapeFound = false;
step('the jog reaches the Shape page', () => {
    for (let n = 0; n < 40 && !shapeFound; n++) {
        const p = snd.soundEditorPageForTest();
        if (p && /shape/i.test(String(p.name || p.title || ''))) { shapeFound = true; break; }
        jog(1); ticks(6);
    }
    const p = snd.soundEditorPageForTest();
    assert(shapeFound, 'no Shape page; last page: ' + JSON.stringify(p && { name: p.name, keys: p.keys }));
});

/* Shot of the picture band only: the three cells the envelope spans (x 0..95)
 * over the first widget row. Text and the ENV cell are outside it. */
function shot(mode, hold) {
    set('env_mode', mode); set('hold', hold);
    ticks(40);
    render.drawUI();
    const rows = [];
    for (let y = 10; y < 34; y++) { let r = ''; for (let x = 0; x < 96; x++) r += FB[y * 128 + x] ? '#' : '.'; rows.push(r); }
    return rows.join('\n');
}

if (shapeFound) {
    for (const [label, AHD, ASR] of [['text', 'A-H-D', 'A-S-R'], ['index', '0', '1']]) {
        const ahdShort = shot(AHD, 5), ahdLong = shot(AHD, 40);
        const asrShort = shot(ASR, 5), asrLong = shot(ASR, 40);
        if (process.env.ENV_DEBUG) console.log(`--- ${label} AHD hold 5\n${ahdShort}\n--- ${label} ASR hold 5\n${asrShort}`);
        step(`(${label} readback) A-H-D: turning Hold moves the picture`, () => assert(ahdShort !== ahdLong, 'identical'));
        step(`(${label} readback) A-S-R: turning Hold moves nothing`, () => assert(asrShort === asrLong, 'hold still moves the picture'));
        step(`(${label} readback) A-S-R draws a different shape from A-H-D`, () => assert(ahdShort !== asrShort, 'same picture in both modes'));
    }
}

if (failed) { console.log('FAIL: test_envelope_mode_gesture'); process.exit(1); }
console.log('PASS: test_envelope_mode_gesture');
}
main().catch((e) => { console.error(e); process.exit(1); });
