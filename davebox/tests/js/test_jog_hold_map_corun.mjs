/* tests/js/test_jog_hold_map_corun.mjs — HOLD THE JOG IN MOVE CO-RUN AND THE BANK
 * MAP COMES UP OVER MOVE'S EDITOR; a short click is still Move's.
 *
 * Josh, 2026-10-08: "jog-hold map in move co-run".
 *
 * In co-run the jog belongs to Move's own editor. dAVEBOx now keeps the CLICK
 * (the turn stays Move's) only to time it: let go early and the click is
 * passed on to Move, press then release; hold on and the map shows — with the
 * screen taken for exactly as long as it is up. A pad tapped on it leaves
 * co-run for that bank; INST is where you already are.
 *
 * Every step performs the gesture through onMidiMessageInternal and the tick,
 * and reads what went to Move and what the host was asked for. */
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
globalThis.set_led = () => {};
/* The host's service stack, as far as the module can see it: an open, a mask
 * update, and a close that returns SYNCHRONOUSLY (as shadow_ui's does). */
const toMove = [], updates = [];
let opened = null, closes = 0, onReturn = null, physShift = 0;
globalThis.move_midi_inject_to_move = (p) => { toMove.push(Array.from(p)); };
globalThis.host_register_primary = (o) => { onReturn = o.onServiceReturn; return true; };
globalThis.host_open_service = (id, opts) => { opened = { id, opts }; return true; };
globalThis.host_update_service = (id, opts) => { updates.push({ id, opts }); if (opened) opened.opts = opts; return true; };
globalThis.host_close_service = () => { closes++; opened = null; if (onReturn) onReturn('move_native', null); return true; };
globalThis.shadow_get_shift_held = () => physShift;
globalThis.shadow_get_move_ui_mode = () => 0;
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

const corun = await import('../../ui/ui_corun.mjs');
corun.initPrimarySurface();
const shortHold = () => { S.tickCount += 3; globalThis.tick(); };
const holdMap = () => { S.tickCount += Math.ceil(C.JOG_HOLD_MAP_MS / 10.6) + 1; globalThis.tick(); };
const DELAY = pad(3, 2), INST = pad(2, 3), CONFIG = pad(0, 3);
const OLED = 1, CLICK = 1 << 27, TURN = 1 << 4;
const clicks = () => toMove.filter((p) => p[1] === 0xB0 && p[2] === 3).map((p) => p[3]);
const enter = (origin) => {
    ccm.bankMapEnd(); if (S.moveCoRunTrack >= 0) corun.exitMoveNativeCoRun();
    home(); S.trackRoute[2] = 1; S.sessionView = false; S.pendingSoundEnterTrack = -1;
    corun.enterMoveNativeCoRun(2, origin || 'track'); ticks(20);
    toMove.length = 0; updates.length = 0; closes = 0;
};

step('rig: co-run is up, keeping the jog CLICK and not the turn or the screen', () => {
    enter();
    assert(S.moveCoRunTrack === 2 && opened && opened.id === 'move_native', 'co-run did not open');
    const m = opened.opts.keep_mask;
    assert((m & CLICK) && !(m & TURN) && !(m & OLED), 'mask ' + m);
});

step('⭐ a SHORT click is Move\'s: press then release reach Move on the release, no map, still co-run', () => {
    enter();
    press();
    assert(S.jogDeferred && !S.bankMapUp, 'the press was not held back');
    assert(clicks().length === 0, 'Move got the press before dAVEBOx knew it was a click: ' + clicks());
    shortHold();
    release(); ticks(1);
    assert(JSON.stringify(clicks()) === '[127,0]', 'Move got ' + JSON.stringify(clicks()) + ', wanted press then release');
    assert(!S.bankMapUp && !S.bankMapLatched && S.moveCoRunTrack === 2 && closes === 0, 'the click disturbed co-run');
    assert(updates.length === 0, 'the screen was taken for a click');
});

step('⭐⭐ HOLD: the map is on the screen and the pads, the screen is taken; letting go gives it back and Move saw NOTHING', () => {
    enter();
    press(); holdMap();
    assert(S.bankMapUp, 'the hold did not bring up the map');
    assert(updates.length === 1 && updates[0].id === 'move_native' && (updates[0].opts.keep_mask & OLED) &&
           (updates[0].opts.keep_mask & CLICK) && updates[0].opts.track === 2,
           'the screen was not taken: ' + JSON.stringify(updates));
    assert(cellInk(frame(), 3, 2) > 0.05, 'the map is not drawn');
    ticks(1);
    assert((led[DELAY] | 0) !== 0 && rightDark(), 'the pads do not show the map');
    release(); ticks(2);
    assert(!S.bankMapUp && !S.bankMapLatched, 'the map stayed up');
    assert(updates.length === 2 && !(updates[1].opts.keep_mask & OLED) && (updates[1].opts.keep_mask & CLICK),
           'the screen was not given back: ' + JSON.stringify(updates));
    assert(clicks().length === 0, 'a hold reached Move as a click: ' + clicks());
    assert(S.moveCoRunTrack === 2 && closes === 0, 'a hold with no pick left co-run');
});

step('a quick click never LATCHES a map in co-run (the click is Move\'s)', () => {
    enter();
    for (let i = 0; i < 3; i++) { press(); shortHold(); release(); ticks(1); }
    assert(!S.bankMapUp && !S.bankMapLatched, 'a click latched the map');
    assert(JSON.stringify(clicks()) === '[127,0,127,0,127,0]', 'clicks to Move: ' + JSON.stringify(clicks()));
});

step('⭐⭐ HOLD + tap a bank: out of co-run and on that bank — not back in the sound menu it was entered from', () => {
    enter('sound');
    press(); holdMap();
    tap(DELAY); ticks(1);
    assert(closes === 1 && S.moveCoRunTrack < 0, 'the pick did not leave co-run');
    assert(S.activeBank === 3, 'the pick did not land on DELAY: bank ' + S.activeBank);
    assert(S.pendingSoundEnterTrack < 0, 'the pick is about to be dragged back into the sound menu');
    release(); ticks(3);
    assert(!S.bankMapUp && S.activeBank === 3 && S.moveCoRunTrack < 0, 'after release: map ' + S.bankMapUp + ' bank ' + S.activeBank);
    assert(clicks().indexOf(127) < 0, 'Move was sent a click press for a pick: ' + clicks());
});

step('INST on that map is where you already are: nothing closes, and letting go returns to Move\'s editor', () => {
    enter();
    press(); holdMap();
    tap(INST); ticks(1);
    assert(closes === 0 && S.moveCoRunTrack === 2, 'INST left co-run');
    release(); ticks(2);
    assert(!S.bankMapUp && closes === 0 && S.moveCoRunTrack === 2, 'INST did not just put the map away');
    assert(clicks().length === 0, 'Move got a click: ' + clicks());
});

step('a dead pad picks nothing and co-run stays', () => {
    enter();
    press(); holdMap();
    tap(pad(6, 1)); ticks(1);
    assert(closes === 0 && S.moveCoRunTrack === 2 && S.bankMapUp, 'a dead pad did something');
    release(); ticks(2);
    assert(!S.bankMapUp && clicks().length === 0, 'after release');
});

step('Shift + click is a chord: it goes straight to Move, on the press', () => {
    enter();
    physShift = 1; ticks(1);
    press();
    assert(!S.jogDeferred && JSON.stringify(clicks()) === '[127]', 'the chord press was held back: ' + JSON.stringify(clicks()));
    holdMap();
    assert(!S.bankMapUp, 'a Shift chord became the map');
    release(); ticks(1);
    assert(JSON.stringify(clicks()) === '[127,0]', 'chord edges: ' + JSON.stringify(clicks()));
    physShift = 0; ticks(1);
});

step('co-run ends under an undecided press: no click lands anywhere, and Move\'s click is let go', () => {
    enter();
    press();
    assert(S.jogDeferred, 'rig');
    corun.exitMoveNativeCoRun(); ticks(1);
    assert(S.moveCoRunTrack < 0 && !S.jogDeferred, 'the press survived the exit');
    const c = clicks();
    assert(c.indexOf(127) < 0 && c[c.length - 1] === 0, 'Move click state after exit: ' + JSON.stringify(c));
    const bank = S.activeBank, up = S.bankMapUp;
    release(); ticks(2);
    assert(!S.bankMapUp && !S.bankMapLatched && S.activeBank === bank && !up, 'the stale release acted on track view');
});

console.log(failed ? 'test_jog_hold_map_corun: FAIL' : 'PASS: the bank map comes up over Move co-run; a short click is still Move\'s');
process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
