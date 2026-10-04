import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_bank_lock.mjs — BANK LOCK (Josh, 2026-10-03: "project menu
 * toggle bank card locking (enable disable click to lock bank cards)"; on the
 * click with locking off: "Click does the bank's thing"; and "Both views").
 *
 * Performed through the real input path (jog click CC 3, Back CC 51, jog CC
 * 14) with the setting Off: the overview click never locks, it does the
 * bank's own click — alt params, Arp Steps, the AUTOMATION menu (on screen),
 * TRACK CONFIG, the macro list, Session's FX door — and Back lands on the
 * overview. On (the default) the click locks, as before.
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
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
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
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const ab = await import('../../ui/ui_automation_bank.mjs');
const prefs = await import('../../ui/ui_prefs.mjs');
const menu = await import('../../ui/ui_menu.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const knobTouch = (k) => { globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 127])); ticks(1); };
const knobRelease = (k) => { globalThis.onMidiMessageInternal(new Uint8Array([0x90, k, 0])); ticks(1); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const same = (a, b) => a.every((v, i) => v === b[i]);
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[2] = b; ticks(4); };
const VIEW_BLOCKS = 0, VIEW_BUSES = 9, VIEW_MACROS = 19, VIEW_CFGCARD = 24;
const home = () => { S.bankCardLatched = false; S.sessMixerLatched = false; S.altMode = false;
    S.stepIntervalMode = false; S.knobTouched = -1; S.sessionView = false; ab.autoBankReset(); ticks(2); };

step('the default is On (no file), and the overview click locks as before', () => {
    S.bankLockOn = null;
    assert(prefs.bankLockOn() === true, 'default is not On');
    home(); toBank(1);
    click();
    assert(S.bankCardLatched, 'Bank Lock On: the click did not lock');
    back();
});

step('the setting is in Project Settings, right under Jog Touch Card', () => {
    menu.openGlobalMenu(); const items = S.globalMenuItems; S.globalMenuOpen = false;
    const i = items.findIndex((it) => it && it.label === 'Bank Lock');
    assert(i > 0 && items[i - 1].label === 'Jog Touch Card', 'not under Jog Touch Card');
});

step('⭐ Off, RPT GROOVE (a page alt): a plain click does nothing; touch any knob + click flips the page without locking', () => {
    S.bankLockOn = false; home();
    S.trackPadMode[2] = C.PAD_MODE_DRUM; toBank(5);
    click();
    assert(!S.bankCardLatched && !S.altMode, 'plain click: latched ' + S.bankCardLatched + ' alt ' + S.altMode);
    knobTouch(3); click(); knobRelease(3);
    assert(!S.bankCardLatched && S.altMode, 'touch + click: latched ' + S.bankCardLatched + ' alt ' + S.altMode);
    back();
    assert(!S.altMode, 'Back did not clear the alt page');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE; toBank(1);
});

step('⭐ Off, NOTE FX: a plain click does nothing; touch K8 + click flips K8 without locking', () => {
    home(); toBank(1);
    S.actionPopupLines = [];
    click();
    assert(!S.bankCardLatched && !S.altMode && !S.knobAlt, 'latched ' + S.bankCardLatched + ' alt ' + S.altMode + ' knobAlt ' + S.knobAlt);
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 7, 127]));
    click();
    globalThis.onMidiMessageInternal(new Uint8Array([0x90, 7, 0])); ticks(2);
    assert(S.knobAlt === 1 << 7 && !S.bankCardLatched, 'knobAlt ' + S.knobAlt + ' latched ' + S.bankCardLatched);
    back();
    assert(S.knobAlt === 0, 'Back did not flip K8 back');
});

step('⭐ Off, SEQ ARP: a plain click does nothing; touch K5 + click opens Arp Steps, no lock', () => {
    home(); toBank(4);
    click();
    assert(!S.stepIntervalMode && !S.bankCardLatched, 'plain click: stepInterval ' + S.stepIntervalMode);
    knobTouch(4); click(); knobRelease(4);
    assert(S.stepIntervalMode && !S.bankCardLatched, 'stepInterval ' + S.stepIntervalMode);
    back();
    assert(!S.stepIntervalMode, 'Back did not close Arp Steps');
});

step('⭐⭐ Off, AUTOMATION: the click opens the menu, ON SCREEN, unlocked; Back returns to the overview', () => {
    home(); toBank(C.BANK_AUTOMATION);
    const before = frame();
    click();
    assert(ab.autoBankMenuOpen() && !S.bankCardLatched, 'menu ' + ab.autoBankMenuOpen());
    assert(render.bankCardVisible(), 'the open menu is not shown');
    assert(!same(before, frame()), 'the screen did not change');
    back();
    assert(!ab.autoBankMenuOpen() && !render.bankCardVisible(), 'Back did not close the menu');
    assert(same(before, frame()), 'Back did not land on the overview');
});

step('⭐⭐ Off, CONFIG: the click opens TRACK CONFIG straight from the overview; Back is home', () => {
    home(); toBank(C.BANK_CONFIG);
    assert(snd.soundOpen() && snd.soundResting(), 'setup: CONFIG is not resting under the overview');
    click();
    assert(snd.soundViewForTest() === VIEW_BLOCKS && snd.soundActive(), 'not in the menu: view ' + snd.soundViewForTest());
    assert(!S.bankCardLatched, 'it locked');
    for (let i = 0; i < 3 && snd.soundActive(); i++) back();
    assert(!snd.soundActive() && !S.bankCardLatched, 'Back did not get home: active ' + snd.soundActive());
});

step('⭐ Off, MACROS: a plain click opens nothing; touch K3 + click opens K3\'s editor; Back is home', () => {
    home(); toBank(C.BANK_MACROS);
    snd.soundSetBank(C.BANK_MACROS); ticks(2);   /* toBank sets the bank raw; sound mode's own bank follows a pick */
    assert(snd.soundOpen() && snd.soundResting() && snd.soundViewForTest() === VIEW_MACROS,
           'setup: MACROS is not resting on its page: view ' + snd.soundViewForTest());
    click();
    assert(snd.soundViewForTest() === VIEW_MACROS && !S.bankCardLatched, 'plain click: view ' + snd.soundViewForTest());
    knobTouch(2); click(); knobRelease(2); ticks(2);
    assert(snd.soundActive() && snd.soundViewForTest() === 12 && !S.bankCardLatched,
           'K3 (empty) did not open its target picker: view ' + snd.soundViewForTest());
    for (let i = 0; i < 3 && snd.soundActive(); i++) back();
    assert(!snd.soundActive() && !S.bankCardLatched, 'Back did not get home');
});

step('⭐ Off, Session: a click on a mixer mode does nothing; on the FX door it opens the list; Back is home', () => {
    home(); toBank(0);
    S.sessionView = true; S.sessKnobMode = 0; ticks(2);
    click();
    assert(!S.sessMixerLatched && !snd.soundActive(), 'a click on VOLUME latched or opened something');
    S.sessKnobMode = 4; ticks(2);
    click(); ticks(2);
    assert(snd.soundActive() && snd.soundViewForTest() === VIEW_BUSES, 'the FX list is not open: ' + snd.soundViewForTest());
    back();
    assert(!snd.soundActive() && !S.sessMixerLatched, 'Back left the mixer card locked');
    S.sessionView = false; S.sessKnobMode = 0; ticks(2);
});

step('turned Off while a card is locked, it unlocks at once (and persists)', () => {
    const written = {};
    const hwf = globalThis.host_write_file;
    globalThis.host_write_file = (p, b) => { written[p] = String(b); return true; };
    S.bankLockOn = true; home(); toBank(1);
    click();
    assert(S.bankCardLatched, 'control: no lock with the setting On');
    menu.openGlobalMenu(); const it = S.globalMenuItems.find((x) => x && x.label === 'Bank Lock'); S.globalMenuOpen = false;
    it.set(false);
    assert(!S.bankCardLatched && !S.sessMixerLatched, 'still locked');
    assert(written[prefs.BANK_LOCK_PATH] === '0\n', 'not persisted: ' + JSON.stringify(written));
    it.set(true);
    globalThis.host_write_file = hwf;
});

if (failed) { console.error('test_bank_lock: FAIL'); process.exit(1); }
console.log('test_bank_lock: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
