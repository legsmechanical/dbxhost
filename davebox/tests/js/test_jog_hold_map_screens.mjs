/* tests/js/test_jog_hold_map_screens.mjs — HOLD THE JOG ON A SCREEN AND THE BANK
 * MAP COMES UP; a short click still clicks.
 *
 * Josh, 2026-10-07: "Is there a way to have jog click hold show the pad map
 * everywhere? Even in menus module editors and immediately jump out to
 * whatever is selected?"
 *
 * On the overviews the press paints the map at once (test_bank_pad_map.mjs).
 * On a screen that owns the click — the global menu, TRACK CONFIG, the module
 * editor, the AUTOMATION screen — the press used to go to the screen. Now it
 * is held back: let go inside JOG_HOLD_MAP_MS and the click is delivered then;
 * hold on and the map paints over the screen. A pad tapped on it leaves the
 * screen for that bank; letting go without a pick leaves the screen untouched.
 *
 * Every step performs the gesture through onMidiMessageInternal and the tick. */
import './_bulk_get_stub.mjs';
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

globalThis.host_write_file = () => true;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sentParams = [];
globalThis.host_module_set_param = (k, v) => { sentParams.push([String(k), String(v)]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.host_module_get_params = () => null;
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
/* Pad LEDs: last colour per note, across the whole run (two caches sit in the
 * path, so an unchanged pad is not re-sent). */
const led = {};
globalThis.move_midi_internal_send = (pkt) => { if ((pkt[1] & 0xF0) === 0x90) led[pkt[2]] = pkt[3]; return true; };
globalThis.move_midi_external_send = () => {};
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
const snd = await import('../../ui/ui_sound.mjs');
const K = await import('/data/UserData/schwung/shared/constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
S.dspInboundEnabled = true;   /* the engine takes pad input, so the mute is pushed */
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const press = () => midi(0xB0, 3, 127);
const release = () => midi(0xB0, 3, 0);
const jog = (d) => midi(0xB0, 14, d > 0 ? d : 128 + d);
const tap = (note) => { midi(0x90, note, 100); midi(0x80, note, 0); };
const pad = pure.bankMapPadForCell;
S.clockFollowTicks = true; S.tickCount = 1000;
const tick = () => { S.tickCount++; globalThis.tick(); };
/* The map paints on the PRESS now (2026-10-04); a hold is just time passing. */
const holdPast = () => { S.tickCount += 2; globalThis.tick(); };
/* ...and past the click window: letting go after this is no click. */
const holdLong = () => { S.tickCount += Math.ceil(C.JOG_CLICK_MAX_MS / 10.6) + 1; globalThis.tick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const ink = (f, x, y, w, h) => { let n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n += f[j * W + i]; return n; };
const cellInk = (f, c, r) => { const q = kit.bankMapCellRect(c, r); return ink(f, q.x, q.y, q.w, q.h) / (q.w * q.h); };
const rightDark = () => { for (let r = 0; r < 4; r++) for (let c = 4; c < 8; c++) if ((led[pad(c, r)] | 0) !== 0) return false; return true; };
const ccm = await import('../../ui/ui_input_cc.mjs');
const home = () => { ccm.bankMapEnd(); S.activeBank = 0; S.trackActiveBank[S.activeTrack] = 0; S.bankCardLatched = false;
    S.bankSelectTick = -1; S.pendingSoundEnterTrack = -1; S.trackPadMode[S.activeTrack] = C.PAD_MODE_MELODIC_SCALE ?? 0; };

home();

const menuMod = await import('../../ui/ui_menu.mjs');
const TE = await import('/data/UserData/schwung/shared/text_entry.mjs');
const shortHold = () => { S.tickCount += 3; globalThis.tick(); };                 /* ~32 ms */
const holdMap = () => { S.tickCount += Math.ceil(C.JOG_HOLD_MAP_MS / 10.6) + 1; globalThis.tick(); };
const menuSnap = () => JSON.stringify([S.globalMenuOpen, S.globalMenuState, S.globalMenuStack]);
const DELAY = pad(3, 2), CLIP = pad(2, 1), AUTO = pad(1, 1), CONFIG = pad(0, 3);

/* ---- the global menu ---------------------------------------------------- */
step('⭐ a SHORT click on a menu still clicks — on the release, and no map ever shows', () => {
    menuMod.openGlobalMenu();
    assert(S.globalMenuOpen, 'rig: the global menu did not open');
    const before = menuSnap();
    press();
    assert(S.jogDeferred && !S.bankMapUp, 'the press was not held back (deferred ' + S.jogDeferred + ', map ' + S.bankMapUp + ')');
    assert(menuSnap() === before, 'the menu acted on the PRESS — a hold could not be told from a click');
    shortHold();
    assert(!S.bankMapUp, 'the map painted before the hold threshold');
    release(); ticks(1);
    assert(menuSnap() !== before, 'the short click did nothing — the menu never got it');
    assert(!S.bankMapUp && !S.jogDeferred && S.jogPressMs < 0, 'state left behind after a click');
});

step('⭐⭐ HOLD on a menu: the map paints over it; letting go WITHOUT a pick leaves the menu exactly as it was', () => {
    ccm.bankMapEnd(); menuMod.openGlobalMenu();
    const before = menuSnap();
    press(); holdMap();
    assert(S.bankMapUp && S.bankMapFromScreen, 'the hold did not paint the map (up ' + S.bankMapUp + ')');
    assert(S.globalMenuOpen, 'the menu was closed just by SHOWING the map');
    assert(cellInk(frame(), 3, 2) > 0.05, 'the map is not on screen');
    release(); ticks(2);
    assert(!S.bankMapUp && !S.bankMapLatched, 'the map stayed after the jog came up');
    assert(menuSnap() === before, 'the menu changed under a hold that picked nothing');
});

step('⭐⭐ HOLD + tap a bank: you are OUT of the menu and on that bank', () => {
    ccm.bankMapEnd(); menuMod.openGlobalMenu();
    press(); holdMap();
    tap(DELAY); ticks(1);
    assert(!S.globalMenuOpen, 'the pick did not leave the menu');
    assert(S.activeBank === 3, 'the pick did not land on DELAY: bank ' + S.activeBank);
    assert(S.bankMapUp, 'a held map went away on the pick (it stays until the jog is up)');
    release(); ticks(2);
    assert(!S.bankMapUp && !S.globalMenuOpen && S.activeBank === 3, 'after release: map ' + S.bankMapUp + ' menu ' + S.globalMenuOpen + ' bank ' + S.activeBank);
});

step('a dead pad on that map does NOTHING — the menu is not torn down for a tap that picks nothing', () => {
    home(); menuMod.openGlobalMenu();
    const before = menuSnap();
    press(); holdMap();
    tap(pad(6, 1)); ticks(1);                            /* the right 4x4 */
    assert(S.globalMenuOpen && menuSnap() === before, 'a dead pad closed or changed the menu');
    release(); ticks(2);
    assert(S.globalMenuOpen && !S.bankMapUp, 'after release the menu should still be there');
});

step('"press, then turn" before the threshold is still "click, then turn" — the click is not lost', () => {
    ccm.bankMapEnd(); menuMod.openGlobalMenu();
    const before = menuSnap();
    press();
    jog(1);
    assert(!S.jogDeferred && !S.bankMapUp, 'the turn did not settle the undecided press');
    assert(menuSnap() !== before, 'the click was dropped when a turn followed it');
    release(); ticks(1);
    assert(!S.bankMapUp, 'a map came up after the press had already been spent as a click');
});

step('a LOST release heals: the next press ends the stale hold and is judged afresh', () => {
    home(); menuMod.openGlobalMenu();
    press(); holdMap();
    assert(S.bankMapUp, 'rig: no map');
    press();                                             /* its release never came */
    assert(!S.bankMapUp && !S.bankMapFromScreen, 'the stale map survived a fresh press');
    assert(S.jogDeferred, 'the fresh press over the menu was not held back like any other');
    release(); ticks(1);
});

/* ---- what must stay on the PRESS ---------------------------------------- */
step('⚠ a chord stays on the press: Shift held, the jog is not held back', () => {
    home(); menuMod.openGlobalMenu();
    midi(0xB0, K.MoveShift, 127);
    press();
    assert(!S.jogDeferred, 'Shift + jog was deferred — the chord would act late and a hold would show the map');
    release(); midi(0xB0, K.MoveShift, 0); ticks(1);
});
step('⚠ the on-screen keyboard keeps the jog: it reads the pads itself, so no map over it', () => {
    home(); ccm.bankMapEnd(); S.globalMenuOpen = false;
    S.pendingSoundEnterTrack = S.activeTrack; ticks(3);
    TE.openTextEntry({ title: 'T', initialText: 'ab', onConfirm: () => {}, onCancel: () => {} });
    press(); holdMap();
    assert(!S.jogDeferred && !S.bankMapUp, 'a hold put the bank map over the keyboard');
    release(); TE.closeTextEntry(); ticks(1);
    snd.soundExit(); ticks(2);
});

/* ---- TRACK CONFIG (sound mode's menu), reached by the map's own pad ------ */
step('⭐⭐ in TRACK CONFIG: hold shows the map, and a bank pick LEAVES sound mode for that bank', () => {
    home();
    press(); release(); ticks(1);                        /* click: the map latches */
    assert(S.bankMapLatched, 'rig: the overview click did not latch the map');
    tap(CONFIG); ticks(4);
    assert(snd.soundActive() && !snd.soundOnCard(), 'rig: TRACK CONFIG did not open (active ' + snd.soundActive() + ')');
    press();
    assert(S.jogDeferred && !S.bankMapUp, 'the press in TRACK CONFIG was not held back');
    holdMap();
    assert(S.bankMapUp && snd.soundActive(), 'the hold did not paint the map over TRACK CONFIG');
    tap(DELAY); ticks(2);
    assert(!snd.soundActive(), 'the pick did not leave sound mode');
    assert(S.activeBank === 3, 'the pick did not land on DELAY: bank ' + S.activeBank);
    release(); ticks(2);
    assert(!S.bankMapUp && !snd.soundActive() && S.activeBank === 3, 'after release: map ' + S.bankMapUp + ' sound ' + snd.soundActive() + ' bank ' + S.activeBank);
});
step('…and letting go without a pick leaves you IN TRACK CONFIG', () => {
    home();
    press(); release(); ticks(1); tap(CONFIG); ticks(4);
    assert(snd.soundActive(), 'rig: TRACK CONFIG did not open');
    const view = snd.soundViewForTest();
    press(); holdMap(); release(); ticks(2);
    assert(snd.soundActive() && snd.soundViewForTest() === view && !S.bankMapUp, 'the screen changed under a hold that picked nothing (view ' + snd.soundViewForTest() + ' was ' + view + ')');
    snd.soundExit(); ticks(2);
});

/* ---- the AUTOMATION screen ---------------------------------------------- */
step('⭐⭐ on the AUTOMATION screen: hold shows the map; a pick lands on the bank and the screen is gone; no pick, still there', () => {
    home();
    press(); release(); ticks(1); tap(AUTO); ticks(3);
    assert(S.activeBank === C.BANK_AUTOMATION && ccm.doorScreenUp(), 'rig: the AUTOMATION screen did not open');
    press(); holdMap();
    assert(S.bankMapUp, 'the hold did not paint the map over AUTOMATION');
    release(); ticks(2);
    assert(S.activeBank === C.BANK_AUTOMATION && ccm.doorScreenUp() && !S.bankMapUp, 'a hold with no pick left the AUTOMATION screen');
    press(); holdMap();
    tap(DELAY); ticks(2);
    release(); ticks(2);
    assert(S.activeBank === 3 && !ccm.doorScreenUp() && !S.bankMapUp, 'after a pick: bank ' + S.activeBank + ' door ' + ccm.doorScreenUp());
});

if (failed) { console.log('FAIL: jog hold map over screens'); process.exit(1); }
console.log('PASS: a jog hold shows the bank map over a screen; a short click still clicks');
}
main().catch(e => { console.error(e); process.exit(1); });
