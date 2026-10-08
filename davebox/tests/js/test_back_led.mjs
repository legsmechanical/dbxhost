/* tests/js/test_back_led.mjs — THE BACK BUTTON LIGHTS WHERE A TAP DOES
 * SOMETHING (Josh, 2026-10-04: "Back button needs to light when it's
 * functional"), and is dark where a tap is a no-op.
 *
 * The rule (backTapWouldAct) mirrors _backTap; it had drifted: it stayed lit
 * on any overview resting off the first bank (Back stopped stepping banks on
 * 2026-08-25) and stayed dark over sound mode, a bank page on screen, the
 * AUTOMATION screen. Driven through the real input path; read off the LED the
 * hardware is sent (CC 51), and paired with what a Back TAP then does.
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
const btn = {};
globalThis.move_midi_internal_send = (pkt) => {
    if ((pkt[1] & 0xF0) === 0x90) led[pkt[2]] = pkt[3];
    if ((pkt[1] & 0xF0) === 0xB0) btn[pkt[2]] = pkt[3];
    return true;
};
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
/* The track map lights the right grid's top two rows (the track pads). */
const lowerRightDark = () => { for (let r = 2; r < 4; r++) for (let c = 4; c < 8; c++) if ((led[pad(c, r)] | 0) !== 0) return false; return true; };
const ccm = await import('../../ui/ui_input_cc.mjs');
const home = () => { ccm.bankMapEnd(); S.activeBank = 0; S.trackActiveBank[S.activeTrack] = 0; S.bankCardLatched = false;
    S.bankSelectTick = -1; S.pendingSoundEnterTrack = -1; S.trackPadMode[S.activeTrack] = C.PAD_MODE_MELODIC_SCALE ?? 0; };

home();

const BACK = 51;
const tickS = (n) => { for (let i = 0; i < n; i++) { tick(); snd.soundTick(); } };
const lit = () => { tickS(2); return (btn[BACK] | 0) !== 0; };
const backTap = () => { midi(0xB0, BACK, 127); midi(0xB0, BACK, 0); tickS(3); };
const ab = await import('../../ui/ui_automation_bank.mjs');

function reset() {
    if (snd.soundOpen()) snd.soundExit();
    S.sessionView = false; S.perfViewLocked = false;
    home(); S.knobAlt = 0; S.altMode = false; S.jogTouched = false; S.autoReturn = null;
    tickS(3);
}

step('⭐ Track overview on CLIP: dark — a tap does nothing there', () => {
    reset();
    assert(!lit(), 'Back is lit on the plain overview');
});

step('⭐⭐ Track overview resting on DELAY: DARK (it was lit — Back stopped stepping banks long ago)', () => {
    reset();
    press(); holdPast(); tap(pad(3, 2)); release();
    assert(S.activeBank === 3 && !render.bankCardVisible(), 'rig: not on the DELAY overview');
    assert(!lit(), 'Back is lit on an overview where a tap does nothing');
    backTap();
    assert(S.activeBank === 3, 'control: a Back tap moved the bank');
});

step('a lane-jump return crumb lights Back only where a tap would use it', () => {
    reset();
    S.activeBank = 3; S.trackActiveBank[2] = 3;
    S.autoReturn = { track: 2, bank: 3, sel: 0 };
    assert(lit(), 'control: Back is dark on the bank the jump landed on');
    /* Another track, same bank number: the tap would only discard the crumb. */
    S.activeTrack = 4; S.activeBank = 3; S.trackActiveBank[4] = 3;
    assert(!lit(), 'Back is lit for a crumb that belongs to another track');
    S.activeTrack = 2; S.activeBank = 1; S.trackActiveBank[2] = 1;
    assert(!lit(), 'Back is lit for a crumb that belongs to another bank');
    S.activeBank = 0; S.trackActiveBank[2] = 0; S.autoReturn = null;
});

step('a clicked-open bank map: lit; Back closes it and the LED goes dark', () => {
    reset();
    press(); release();
    assert(S.bankMapLatched && lit(), 'Back is dark over a clicked-open map');
    backTap();
    assert(!S.bankMapUp && !lit(), 'after Back: map ' + S.bankMapUp + ', LED lit ' + lit());
});

step('⭐ a bank PAGE held on screen (Shift + hold Step 11 / any latched card): lit; Back dismisses it, dark', () => {
    reset();
    S.activeBank = 3; S.trackActiveBank[2] = 3; S.bankCardLatched = true; tickS(2);
    assert(render.bankCardVisible() && lit(), 'Back is dark over a held bank page');
    backTap();
    assert(!render.bankCardVisible() && !lit(), 'after Back: page ' + render.bankCardVisible() + ', LED lit ' + lit());
});

step('⭐ TRACK CONFIG (sound mode, from the CONFIG pad): lit; Back out to the overview, dark', () => {
    reset();
    press(); release(); tap(pad(0, 3)); tickS(6);
    assert(snd.soundActive(), 'rig: TRACK CONFIG did not open');
    assert(lit(), 'Back is dark inside TRACK CONFIG');
    for (let i = 0; i < 4 && snd.soundActive(); i++) backTap();
    assert(!snd.soundActive() && !lit(), 'after Back: sound ' + snd.soundActive() + ', LED lit ' + lit());
});

step('⭐ the instrument editor from the INST pad on the OVERVIEW (no bank page held): lit; Back retraces, dark', () => {
    reset();
    press(); release(); tap(pad(2, 3)); tickS(4);
    S.tickCount += 400; tickS(4);                 /* past any bank-display window */
    assert(snd.soundActive(), 'rig: the instrument editor did not open');
    assert(!S.bankCardLatched && S.bankSelectTick < 0 && !S.jogTouched, 'rig: a bank page is held too — the case would not isolate sound mode');
    assert(lit(), 'Back is dark in the instrument editor');
    for (let i = 0; i < 4 && snd.soundActive(); i++) backTap();
    assert(!snd.soundActive() && !lit(), 'after Back: sound ' + snd.soundActive() + ', LED lit ' + lit());
});

step('⭐ the AUTOMATION screen (from its pad): lit; Back dismisses it, dark', () => {
    reset();
    press(); release(); tap(pad(1, 1)); tickS(3);
    assert(ab.autoBankMenuOpen(), 'rig: AUTOMATION did not open');
    assert(lit(), 'Back is dark over the AUTOMATION screen');
    for (let i = 0; i < 3 && (ab.autoBankMenuOpen() || render.bankCardVisible()); i++) backTap();
    assert(!lit(), 'Back still lit after the AUTOMATION screen closed');
});

step('a knob flipped to its alt: lit; Back flips it back, dark', () => {
    reset();
    S.knobAlt = 1; tickS(2);
    assert(lit(), 'Back is dark with an alt shown');
    backTap();
    assert(S.knobAlt === 0 && !lit(), 'after Back: knobAlt ' + S.knobAlt + ', LED lit ' + lit());
});

step('Session overview: dark; Perf Mode locked: lit (Back unlocks it)', () => {
    reset();
    S.sessionView = true; tickS(3);
    assert(!lit(), 'Back is lit on the Session overview');
    S.perfViewLocked = true;
    assert(lit(), 'Back is dark with Perf Mode locked');
    backTap();
    assert(!S.perfViewLocked && !lit(), 'after Back: locked ' + S.perfViewLocked + ', LED lit ' + lit());
    S.sessionView = false; tickS(2);
});

if (failed) { console.error('test_back_led: FAIL'); process.exit(1); }
console.log('test_back_led: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
