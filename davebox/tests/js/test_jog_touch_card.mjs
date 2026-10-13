/* tests/js/test_jog_touch_card.mjs — THE JOG TOUCH CARD (Josh, 2026-09-30:
 * a bare jog touch shows the current bank card; 2026-10-13: always, its
 * global menu switch retired) and, since 2026-10-04, the jog TURN that
 * no longer switches banks (Josh: "i want to retire jog to switch banks and the
 * bank column overlay"). Through the real input path; judged on the FRAME.
 * (Split out of test_bank_nav_overlay, which pinned the retired column.)
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
const pure = await import('../../ui/ui_pure.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const touchJog = () => midi(0x90, 9, 127);
const releaseJog = () => midi(0x80, 9, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tick = () => { S.tickCount++; globalThis.tick(); };
/* The UI clock follows the ticks, so the hold window can be crossed on purpose. */
S.clockFollowTicks = true; S.tickCount = 1000;
const holdTicks = 12;
const settle = () => { S.tickCount += holdTicks; globalThis.tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const menu = await import('../../ui/ui_menu.mjs');
const menuItems = () => { menu.openGlobalMenu(); const it = S.globalMenuItems; S.globalMenuOpen = false; return it; };
/* ⭐⭐ THE JOG TOUCH CARD. Judged on the FRAME: a touch must draw what the
 * bank view draws. */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const cardFrames = () => {
    S.sessionView = false; S.activeBank = 1; S.trackActiveBank[2] = 1;
    S.bankCardLatched = false; S.jogTouched = false; settle();
    const rest = frame();
    S.bankCardLatched = true; const latched = frame(); S.bankCardLatched = false;
    return { rest, latched };
};
step('the global menu has no Jog Touch Card switch — the card is not optional', () => {
    const items = menuItems();
    assert(items.some((it) => it && it.label === 'Beat Marks'), 'control: the menu rows were not read');
    assert(!items.some((it) => it && /jog touch/i.test(String(it.label))), 'a Jog Touch row is in the menu');
});
step('⭐⭐ a bare jog touch draws the current bank card, and the release takes it away', () => {
    const { rest, latched } = cardFrames();
    assert(!same(rest, latched), 'control: the overview and the bank card draw the same frame');
    touchJog(); tick();
    assert(same(frame(), latched), 'the touch did not draw the bank card');
    assert(!S.bankCardLatched, 'the touch LATCHED bank mode — it only shows the card');
    releaseJog(); settle();
    assert(same(frame(), rest), 'the card outlived the touch');
});
step('⭐⭐ the jog TURN no longer switches banks — on the overview or under the touched card (Josh, 2026-10-04: "retire jog to switch banks and the bank column overlay")', () => {
    const { rest } = cardFrames();
    jog(1); tick(); jog(1); tick();
    assert(S.activeBank === 1 && S.trackActiveBank[2] === 1, 'the overview turn walked to ' + S.activeBank);
    assert(same(frame(), rest), 'the turn drew something over the overview (a column?)');
    touchJog(); tick(); jog(1); tick(); jog(-1); tick();
    assert(S.activeBank === 1, 'the turn under the touch walked to ' + S.activeBank);
    releaseJog(); settle();
    S.sessionView = true; S.sessKnobMode = 1; settle();
    jog(1); tick(); jog(-1); tick(); jog(-1); tick();
    assert(S.sessKnobMode === 1, 'the session turn walked the mixer mode to ' + S.sessKnobMode);
    S.sessionView = false; S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('⭐ a touch in session view draws the mixer page', () => {
    S.sessionView = true; S.sessKnobMode = 0; settle();
    const rest = frame();
    assert(!render.sessMixerShown(), 'control: the mixer page shows untouched');
    touchJog(); tick();
    assert(render.sessMixerShown() && !same(frame(), rest), 'the touch did not draw the session mixer page');
    releaseJog(); settle();
    S.sessionView = false;
});
step('⭐⭐ a leftover Off file from the retired switch changes nothing: the touch still draws the card', () => {
    globalThis.host_file_exists = () => true;
    globalThis.host_read_file = () => '0\n';
    const { rest, latched } = cardFrames();
    touchJog(); tick();
    assert(same(frame(), latched) && !same(frame(), rest), 'the touch did not draw the bank card');
    releaseJog(); settle();
    globalThis.host_file_exists = () => false; globalThis.host_read_file = () => '';
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});

if (failed) { console.log('FAIL: jog touch card'); process.exit(1); }
console.log('PASS: a jog touch shows the bank card; the turn switches nothing');
}
main().catch((e) => { console.error(e); process.exit(1); });
