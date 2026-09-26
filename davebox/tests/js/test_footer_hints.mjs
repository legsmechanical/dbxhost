/* tests/js/test_footer_hints.mjs — gestures are named in the FOOTER (Josh,
 * 2026-09-26, the footer audit: "agree with all recommendations").
 *
 * The Loop-held length view names STEP PAGE / JOG STEP as pills (it printed
 * "STEP BTN=by page" / "JOG TURN=by step" mid-screen, no footer); the door card
 * (SOUND + CONFIG peek, Master FX door) names CLK ENTER (it printed "CLICK TO
 * ENTER" mid-screen, no footer).
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === (phase & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const has = (k, v) => (kit.kitHintsForTest() || []).some((x) => x[0] === k && x[1] === v);
const hints = () => JSON.stringify(kit.kitHintsForTest());

step('⭐ holding Loop (melodic): STEP PAGE and JOG STEP in the footer', () => {
    S.activeBank = 0; S.loopHeld = true;
    fb.fill(0); render.drawUI();
    assert(has('STEP', 'PAGE') && has('JOG', 'STEP'), 'pills: ' + hints());
    assert(swallowed === null, 'swallowed: ' + swallowed);
    S.loopHeld = false;
});
step('⭐ the door card: CLK ENTER in the footer', () => {
    fb.fill(0); snd.renderGatewayCard('MASTER FX', 'SESSION FX');
    assert(has('CLK', 'ENTER'), 'pills: ' + hints());
});

if (failed) { console.log('FAIL: footer hints'); process.exit(1); }
console.log('PASS: gestures are named in the footer');
}
main().catch((e) => { console.error(e); process.exit(1); });
