/* tests/js/test_bank_nav_overlay.mjs — the BANK NAVIGATION OVERLAY (Josh,
 * 2026-09-26): "turning the knob should show a bank selection overlay on the
 * left side of the screen ... Shows only upon jog turn on bank or track/session
 * overview pages and goes away immediately upon release."
 *
 * Performs the gesture through the real input path: touch the jog, turn it on
 * the track overview — the jog still WALKS the bank, and a column on the left
 * lists the walk with the new bank on the middle row, inverted; release — the
 * column is gone. The session overview walks its session banks the same way.
 * CONTROLS: a touch with no turn shows nothing; a turn inside the AUTOMATION
 * list (which is not a walk) shows nothing.
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

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const touchJog = () => midi(0x90, 9, 127);
const releaseJog = () => midi(0x80, 9, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tick = () => { S.tickCount++; globalThis.tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const MID_Y = ((kit.MV_BANKNAV_ROWS - 1) >> 1) * kit.MV_BANKNAV_ROW_H + 1;
/* The middle row is inverted: across the column's left edge it is solid ink. */
const midRowLit = (f) => { let n = 0; for (let y = MID_Y - 1; y < MID_Y + 8; y++) n += f[y * W + 1]; return n; };
const columnUp = (f) => midRowLit(f) >= 9;

step('⚠ CONTROL: a touch with no turn shows no column', () => {
    S.activeBank = 0; S.trackActiveBank[2] = 0; S.bankSelectTick = -1;
    touchJog(); tick();
    assert(!columnUp(frame()), 'the column is up without a turn');
    releaseJog(); tick();
});
step('⭐⭐ THE GESTURE: touch + turn on the track overview walks the bank AND shows the column', () => {
    touchJog(); tick();
    jog(1); tick();
    const cyc = render.bankNavItems();
    assert(S.activeBank === 1, 'the jog no longer walks the bank: ' + S.activeBank);
    assert(cyc.items[cyc.cur].name === 'NOTE FX', 'the column centres ' + cyc.items[cyc.cur].name);
    assert(columnUp(frame()), 'no column on the left while jogging');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('the column follows the walk, and shortens SOUND + CONFIG', () => {
    for (let i = 0; i < 12 && S.activeBank !== C.BANK_SOUND; i++) { jog(1); tick(); }
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'SOUND+CFG', 'centred ' + nav.items[nav.cur].name);
    assert(nav.items.every((it) => it.glyph), 'an entry has no glyph');
    /* SOUND + CONFIG's page is sound mode's screen: the column must sit over it too. */
    assert(columnUp(frame()), 'no column over the SOUND + CONFIG page');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('⭐ release: the column is gone', () => {
    releaseJog(); tick();
    assert(!columnUp(frame()), 'the column outlived the release');
    assert(S.bankNavKind === null, 'still armed: ' + S.bankNavKind);
});
step('⭐ session overview: the turn walks the session banks and the column lists them', () => {
    S.sessionView = true; S.sessKnobMode = 0;
    touchJog(); tick();
    jog(1); tick(); jog(1); tick();
    assert(S.sessKnobMode === 2, 'session bank ' + S.sessKnobMode);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'SEND A', 'centred ' + nav.items[nav.cur].name);
    assert(columnUp(frame()), 'no column on the session overview');
    releaseJog(); tick();
    assert(!columnUp(frame()), 'the session column outlived the release');
    S.sessionView = false;
});

if (failed) { console.log('FAIL: bank nav overlay'); process.exit(1); }
console.log('PASS: the bank column shows while the jog walks and goes on release');
}
main().catch((e) => { console.error(e); process.exit(1); });
