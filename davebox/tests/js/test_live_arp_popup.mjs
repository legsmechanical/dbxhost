/* tests/js/test_live_arp_popup.mjs — Shift + Step 11 (Josh, 2026-10-03):
 * "i want to have live arp settings pop-up when you shift+hold the 11th step
 * button"; "Stays until Back". A TAP still toggles LIVE ARP (now on release).
 * Through the real input path; the pop-up is judged ON SCREEN (the frame is
 * the locked LIVE ARP card's) while Shift is still physically down.
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
const snd = await import('../../ui/ui_sound.mjs');
const persist = await import('../../ui/ui_persistence.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
S.clockFollowTicks = true; S.tickCount = 1000;
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const HOLD = Math.ceil(450 / 10.6) + 2;
const shiftDown = () => midi(0xB0, 49, 127), shiftUp = () => midi(0xB0, 49, 0);
const s11Down = () => midi(0x90, 26, 127), s11Up = () => midi(0x80, 26, 0);
const back = () => { midi(0xB0, 51, 127); midi(0xB0, 51, 0); ticks(2); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const same = (a, b) => a.every((v, i) => v === b[i]);
const home = () => { S.activeBank = 0; S.trackActiveBank[2] = 0; S.bankCardLatched = false; S.doorReturn = null;
    S.stepIntervalMode = false; S.altMode = false; S.shiftHeld = false; S.bankLockOn = true; S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE; ticks(2); };
const arpRef = () => { const b = S.activeBank, l = S.bankCardLatched; S.activeBank = 5; S.bankCardLatched = true;
    const f = frame(); S.activeBank = b; S.bankCardLatched = l; return f; };
const hold = () => { shiftDown(); s11Down(); S.tickCount += HOLD; tick(); };

home();
step('a TAP toggles LIVE ARP on the release (last style), and back off; the bank does not move', () => {
    S.lastTarpStyle[2] = 3;
    shiftDown(); s11Down();
    assert((S.bankParams[2][5][0] | 0) === 0, 'it toggled on the press');
    s11Up(); shiftUp(); ticks(2);
    assert(S.bankParams[2][5][0] === 3, 'tap did not turn it on: ' + S.bankParams[2][5][0]);
    shiftDown(); s11Down(); s11Up(); shiftUp(); ticks(2);
    assert((S.bankParams[2][5][0] | 0) === 0, 'tap did not turn it off');
    assert(S.activeBank === 0 && !render.bankCardVisible(), 'a tap moved the bank or showed a card');
});

step('⭐⭐ a HOLD opens LIVE ARP, locked and ON SCREEN while Shift is still down; letting go toggles nothing', () => {
    home();
    const ref = arpRef();
    hold();
    assert(S.activeBank === 5 && S.bankCardLatched, 'bank ' + S.activeBank + ' latched ' + S.bankCardLatched);
    assert(render.bankCardVisible(), 'the card is stood down while Shift is held');
    assert(same(frame(), ref), 'the screen is not the LIVE ARP card');
    s11Up(); shiftUp(); ticks(2);
    assert((S.bankParams[2][5][0] | 0) === 0, 'the release after a hold toggled LIVE ARP');
    assert(render.bankCardVisible() && S.activeBank === 5, 'the pop-up did not stay up');
});

step('⭐ Back returns exactly where you were (the overview)', () => {
    const over = (() => { const b = S.activeBank, l = S.bankCardLatched; S.activeBank = 0; S.bankCardLatched = false; const f = frame(); S.activeBank = b; S.bankCardLatched = l; return f; })();
    back();
    assert(S.activeBank === 0 && !S.bankCardLatched && !render.bankCardVisible(), 'bank ' + S.activeBank);
    assert(S.doorReturn === null, 'the crumb survived');
    assert(same(frame(), over), 'not the overview');
});

step('from a locked DELAY card, Back lands on that card again', () => {
    home(); S.activeBank = 3; S.trackActiveBank[2] = 3; S.bankCardLatched = true; ticks(2);
    hold(); s11Up(); shiftUp(); ticks(2);
    assert(S.activeBank === 5, 'pop-up did not open');
    back();
    assert(S.activeBank === 3 && S.bankCardLatched && render.bankCardVisible(), 'bank ' + S.activeBank + ' latched ' + S.bankCardLatched);
});

step('with Bank Lock off the pop-up still stays up; Back is home, unlocked', () => {
    home(); S.bankLockOn = false;
    hold(); s11Up(); shiftUp(); ticks(2);
    assert(S.activeBank === 5 && render.bankCardVisible(), 'not up with Bank Lock off');
    back();
    assert(S.activeBank === 0 && !S.bankCardLatched, 'Back did not get home');
    S.bankLockOn = true;
});

step('a click on it opens Arp Steps; Back closes that first, then goes home', () => {
    home();
    hold(); s11Up(); shiftUp(); ticks(2);
    midi(0xB0, 3, 127); midi(0xB0, 3, 0); ticks(2);
    assert(S.stepIntervalMode, 'the click did not open Arp Steps');
    back();
    assert(!S.stepIntervalMode && S.activeBank === 5 && S.doorReturn, 'first Back: ' + S.activeBank);
    back();
    assert(S.activeBank === 0 && !S.bankCardLatched, 'second Back did not get home');
});

step('a jog turn does not walk off it (a screen, not a bank); Back still goes home', () => {
    home();
    hold(); s11Up(); shiftUp(); ticks(2);
    midi(0x90, 9, 127); midi(0xB0, 14, 1); ticks(1); midi(0x80, 9, 0); ticks(2);
    assert(S.activeBank === 5 && S.doorReturn, 'the turn walked off: bank ' + S.activeBank);
    back();
    assert(S.activeBank === 0 && !S.bankCardLatched, 'Back did not get home');
});

step('⭐ a project saved while it is up saves the bank you came from', () => {
    home(); S.activeBank = 3; S.trackActiveBank[2] = 3; ticks(2);
    hold(); s11Up(); shiftUp(); ticks(2);
    assert(S.trackActiveBank[2] === 5, 'setup: the screen did not borrow its bank');
    const tab = persist.sidecarObject().tab;
    assert(tab[2] === 3, 'saved bank: ' + tab[2]);
    back();
});

step('drum track: a hold does nothing', () => {
    home(); S.trackPadMode[2] = C.PAD_MODE_DRUM;
    hold(); s11Up(); shiftUp(); ticks(2);
    assert(S.activeBank === 0 && !S.bankCardLatched && S.doorReturn === null, 'a drum hold opened something');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE;
});

if (failed) { console.error('test_live_arp_popup: FAIL'); process.exit(1); }
console.log('test_live_arp_popup: all passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
