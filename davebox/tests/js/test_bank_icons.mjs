/* tests/js/test_bank_icons.mjs — CLIP, DRUM LANE and ALL LANES have their own
 * header icons (Josh, 2026-09-26: "B for clip, B for drum, A for all. lanes" /
 * "all lanes - do 3x3 grid"), and ALL LANES blinks its ICON, not its name
 * ("on all lanes, have the icon blink instead of the "ALL"").
 *
 * Checks the glyph per bank and track type, that the header draws the glyph
 * in one blink phase and a blank of the same width in the other while the NAME
 * never changes, and that the bank map (a list) never blinks.
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
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const kit = await import('../../ui/ui_movy.mjs');
const DRUM = C.PAD_MODE_DRUM, MEL = 0, COND = C.PAD_MODE_CONDUCT;

step('⭐ the glyph per bank and track type', () => {
    const g = render.bankHeaderGlyph;
    assert(g(0, MEL) === 'clip', 'melodic CLIP: ' + g(0, MEL));
    assert(g(0, DRUM) === 'drum', 'DRUM LANE: ' + g(0, DRUM));
    assert(g(7, DRUM) === 'lanes', 'ALL LANES: ' + g(7, DRUM));
    assert(g(0, COND) === 'seq', 'a Conductor keeps its note pair: ' + g(0, COND));
    assert(g(1, MEL) === 'seq' && g(1, DRUM) === 'seq', 'NOTE FX unchanged');
    assert(g(C.BANK_SOUND, MEL) === 'audio' && g(C.BANK_MACROS, DRUM) === 'perf', 'SOUND/MACROS unchanged');
    for (const k of ['clip', 'drum', 'lanes', 'lanesOff'])
        assert(kit.kitBankGlyphWidth(k) > 0, 'no bitmap for ' + k);
    assert(kit.kitBankGlyphWidth('lanes') === kit.kitBankGlyphWidth('lanesOff'), 'the blank is not the icon\'s width: the name would move');
});

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const header = () => { fb.fill(0); render.drawUI(); const o = []; for (let y = 0; y < 7; y++) for (let x = 0; x < 128; x++) o.push(fb[y * 128 + x]); return o; };
const icon = (h) => { let n = 0; for (let y = 1; y < 6; y++) for (let x = 2; x < 7; x++) n += h[y * 128 + x] ? 0 : 1; return n; };   /* ink = dark on the white bar */
const rest = (h) => h.map((v, i) => ((i % 128) >= 10 ? v : 0)).join('');

step('⭐ ALL LANES: the icon blinks, the name holds still', () => {
    S.trackPadMode[0] = DRUM; S.activeBank = 7; S.trackActiveBank[0] = 7;
    S.allLanesConfirmed = true; S.bankSelectTick = S.tickCount; S.bankCardLatched = true;
    S.clockMs = 0;   const on = header();
    S.clockMs = 300; const off = header();
    assert(icon(on) > 0, 'no icon in the on phase');
    assert(icon(off) === 0, 'the icon did not blink off: ' + icon(off) + ' px');
    assert(rest(on) === rest(off), 'the NAME changed between phases (it must hold still)');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('the bank map never blinks: ALL LANES lists the grid in both phases', () => {
    S.bankNavKind = 'track';
    const items = () => render.bankNavItems().items;
    S.clockMs = 0; const a = items().find((x) => x.name === 'ALL LANES');
    S.clockMs = 300; const b = items().find((x) => x.name === 'ALL LANES');
    assert(a && b && a.glyph === 'lanes' && b.glyph === 'lanes', JSON.stringify([a, b]));
    assert(items().find((x) => x.name === 'DRUM LANE').glyph === 'drum', 'DRUM LANE in the map');
    S.bankNavKind = null;
    S.trackPadMode[0] = MEL; S.bankNavKind = 'track';
    assert(render.bankNavItems().items[0].glyph === 'clip', 'CLIP in the melodic map');
    S.bankNavKind = null; S.bankCardLatched = false;
});

if (failed) { console.log('FAIL: bank icons'); process.exit(1); }
console.log('PASS: CLIP, DRUM LANE and ALL LANES icons; ALL LANES blinks its icon');
}
main().catch((e) => { console.error(e); process.exit(1); });
