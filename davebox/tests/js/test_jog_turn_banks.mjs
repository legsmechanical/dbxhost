import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_jog_turn_banks.mjs — JOG TURN BANKS (Josh, 2026-10-03: "add
 * a toggle to project menu to disable jog turn to switch banks").
 *
 * Performed through the real input path (jog turn CC 14, click CC 3, touch
 * note 9, Loop CC 58, Shift CC 49, pads): with the setting Off a plain turn
 * leaves the bank — and Session View's mixer mode — alone wherever it would
 * have walked (overview, latched card, touch peek, mixer page), while the
 * jog-hold pad map still switches and the jog's other turns (Loop length,
 * Shift + track) still work. On (the default) the turn walks, as before.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step ' + label);
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const W = 128, H = 64;
const fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0; };
globalThis.fill_rect = (x, y, w, h, v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v); };
globalThis.draw_rect = (x, y, w, h, v) => { globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v); };
globalThis.stipple_rect = (x, y, w, h, v, phase) => {
    for (let j = y; j < y + h; j++) for (let i = x + ((((x + j) & 1) === ((phase || 0) & 1)) ? 0 : 1); i < x + w; i += 2) globalThis.set_pixel(i, j, v); };
globalThis.clear_screen = () => fb.fill(0);
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

const slotSets = [];
globalThis.host_system_cmd = () => 0; let FILES = {};
globalThis.host_read_file = (p) => FILES[p] || '';
globalThis.host_file_exists = (p) => p in FILES; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, k, v) => { slotSets.push(k); return 1; };
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const pure = await import('../../ui/ui_pure.mjs');
const prefs = await import('../../ui/ui_prefs.mjs');
const menu = await import('../../ui/ui_menu.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.clockFollowTicks = true; S.tickCount = 1000;
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
const tick = () => { S.tickCount++; globalThis.tick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const turn = (d) => { cc(14, d > 0 ? 1 : 127); ticks(2); };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const holdPast = () => { S.tickCount += Math.ceil(C.JOG_MAP_HOLD_MS / 10.6) + 1; globalThis.tick(); };
const home = () => { S.bankCardLatched = false; S.sessMixerLatched = false; S.altMode = false;
    S.sessionView = false; S.activeBank = 1; S.trackActiveBank[2] = 1; S.bankSelectTick = -1;
    S.jogTouched = false; S.sessKnobMode = 1; ticks(4); };

step('the default is On (no file), and a turn on the overview walks (CONTROL)', () => {
    S.jogTurnBanksOn = null;
    assert(prefs.jogTurnBanksOn() === true, 'default is not On');
    home(); turn(1);
    assert(S.activeBank !== 1, 'On: the turn did not walk');
});

step('the setting is in Project Settings, right under Bank Lock', () => {
    menu.openGlobalMenu(); const items = S.globalMenuItems; S.globalMenuOpen = false;
    const i = items.findIndex((it) => it && it.label === 'Jog Turn Banks');
    assert(i > 0 && items[i - 1].label === 'Bank Lock', 'not under Bank Lock');
    assert(items[i].get() === true, 'the row does not read On');
});

step('it is read from its file at launch (0 = Off) and the row writes it', () => {
    FILES = { [prefs.JOG_TURN_BANKS_PATH]: '0\n' }; S.jogTurnBanksOn = null;
    assert(prefs.jogTurnBanksOn() === false, 'file 0 did not read Off');
    let wrote = '';
    globalThis.host_write_file = (p, v) => { if (p === prefs.JOG_TURN_BANKS_PATH) wrote = v; return true; };
    menu.openGlobalMenu(); const row = S.globalMenuItems.find((it) => it && it.label === 'Jog Turn Banks'); S.globalMenuOpen = false;
    row.set(true);  assert(wrote === '1\n' && prefs.jogTurnBanksOn(), 'On not written: ' + JSON.stringify(wrote));
    row.set(false); assert(wrote === '0\n' && !prefs.jogTurnBanksOn(), 'Off not written: ' + JSON.stringify(wrote));
    FILES = {};
});

step('⭐ Off, track overview: the turn leaves the bank alone, both ways', () => {
    home();
    const nav = S.bankNavTurnMs;
    turn(1); turn(-1); turn(1);
    assert(S.activeBank === 1 && S.trackActiveBank[2] === 1, 'walked to ' + S.activeBank);
    assert(S.bankNavTurnMs === nav, 'the bank list was raised');
});

step('⭐ Off, latched card: the turn leaves the bank alone', () => {
    home(); click();
    assert(S.bankCardLatched, 'setup: the click did not latch');
    turn(1); turn(1);
    assert(S.activeBank === 1, 'walked to ' + S.activeBank);
    back();
});

step('⭐ Off, jog-touch peek: the turn leaves the bank alone', () => {
    home();
    midi(0x90, 9, 127); ticks(2);
    turn(1);
    assert(S.activeBank === 1, 'walked to ' + S.activeBank);
    midi(0x90, 9, 0); ticks(2);
});

step('⭐ Off, Session View: the overview and the mixer page keep their mode', () => {
    home(); S.sessionView = true; ticks(2);
    turn(1);
    assert(S.sessKnobMode === 1, 'overview walked to mode ' + S.sessKnobMode);
    S.sessMixerLatched = true; ticks(2);
    turn(1); turn(-1); turn(-1);
    assert(S.sessKnobMode === 1, 'mixer page walked to mode ' + S.sessKnobMode);
    S.sessMixerLatched = false; S.sessionView = false; ticks(2);
});

step('⭐ Off, the jog-hold pad map still switches banks', () => {
    home();
    const pm = S.trackPadMode[2];
    let target = null;
    for (let c = 0; c < 4 && target === null; c++) for (let r = 0; r < 4; r++) {
        const b = pure.bankPadMapCellAt(pm, 2, c, r);
        if (b !== null && b !== 1 && !pure.bankIsDoor(pm, b)) { target = [c, r, b]; break; }
    }
    assert(target, 'setup: no other walk bank on the map');
    cc(3, 127); holdPast();
    assert(S.bankMapUp, 'setup: the map did not arm');
    const note = pure.bankMapPadForCell(target[0], target[1]);
    midi(0x90, note, 100); midi(0x80, note, 0);
    cc(3, 0); ticks(2);
    assert(S.activeBank === target[2], 'the pad did not switch: on ' + S.activeBank + ', wanted ' + target[2]);
});

step('Off, the jog\'s other turns still work: Shift + turn changes track', () => {
    home();
    cc(49, 127); turn(1); cc(49, 0); ticks(2);
    assert(S.activeTrack === 3, 'Shift + turn: track ' + S.activeTrack);
    cc(49, 127); turn(-1); cc(49, 0); ticks(2);
    assert(S.activeTrack === 2, 'Shift + turn back: track ' + S.activeTrack);
});

step('Off, Loop + turn still changes the clip length', () => {
    home();
    const ac = S.trackActiveClip[2] | 0;
    const before = S.clipLength[2][ac];
    cc(58, 127); ticks(2); turn(1); cc(58, 0); ticks(2);
    assert(S.clipLength[2][ac] === before + 1, 'length ' + before + ' -> ' + S.clipLength[2][ac]);
    assert(S.activeBank === 1, 'and the bank moved to ' + S.activeBank);
});

step('back On: the turn walks again', () => {
    prefs.setJogTurnBanksOn(true);
    home(); turn(1);
    assert(S.activeBank !== 1, 'On again: the turn did not walk');
});

if (failed) process.exit(1);
console.log('test_jog_turn_banks: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
