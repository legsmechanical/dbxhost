import './_bulk_get_stub.mjs';
/* tests/js/test_automation_bank_gradient.mjs — THE STEP ROW SHOWS WHAT THE LANE PLAYS.
 *
 * Josh, 2026-09-24: no notes on the step buttons in automation mode — instead
 * Legacy's intensity gradient: each step coloured by the value the selected
 * lane plays there (seven levels), a step holding a real point blinking OFF
 * briefly, DarkGrey outside the cycle. The values come from ONE read per page
 * (tN_cC_pa_vals_<base>_<tps>), never per tick.
 *
 * (Rig shared with test_automation_bank_cycle.mjs.)
 *
 * ---- original header of the rig: ----
 * THE GRID FOLLOWS THE SELECTED ROW.
 *
 * Josh, 2026-09-24: with a lane selected on the AUTOMATION bank, the step
 * buttons, Left/Right, the page bar ("mimic the style used in track overview")
 * and the header are THAT lane's cycle — a 4-bar lane under a 2-bar clip has
 * four pages; a 13-step lane leaves 14–16 dark — and no notes, which cannot be
 * edited there. Back → the clip's grid again, exactly as before.
 *
 * Performs the gestures on the real UI (jog click, jog turn, Right/Left, Back)
 * and asserts what is ON SCREEN (the header text, found pixel-exact; the page
 * bar's pixels) and ON THE STEP BUTTONS (the LED stream). */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
let LIST = '';
let STEPS = {};
const valReads = [];
let VALS = () => '';
const leds = {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
    const v = /^t\d+_c\d+_pa_vals_(\d+)_(\d+)$/.exec(k);
    if (v) { valReads.push(v[1] + '_' + v[2]); return VALS(parseInt(v[1], 10)); }
    return '';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
        { key: 'drive', name: 'Drive', type: 'float', min: 0, max: 1 },
        { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
globalThis.__menu = await import('../../ui/ui_menu.mjs');
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const C_ = await import('/data/UserData/schwung/shared/constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const L = await import('../../ui/ui_leds.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
const T = 0, C = 0;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const right = () => { cc(63, 127); cc(63, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
function watchLeds(n = 120) {
    const seen = Array.from({ length: 16 }, () => new Set());
    for (let k = 0; k < n; k++) { ticks(1); for (let i = 0; i < 16; i++) seen[i].add(leds[16 + i]); }
    return seen;
}

S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 1;   /* notes everywhere */
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
/* One lane, its own 2-bar loop. Page 1: a ramp 0,8,16..120 then 127 at step 16;
 * step 5 holds a real point. Page 2: steps 0..12 = 127, 13..15 none. */
LIST = '0 0 1 3 0:synth:cutoff 768 5 100\n';
const mask = new Array(32).fill('0'); mask[4] = '1';
STEPS = { t0_c0: '0:synth:cutoff ' + mask.join('') + '\n' };
const hex = (arr) => arr.map(v => (v < 0 ? 255 : v).toString(16).padStart(2, '0')).join('');
const PAGE1 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 127];
const PAGE2 = [127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, -1, -1, -1];
VALS = (base) => '0:synth:cutoff ' + hex(base === 0 ? PAGE1 : PAGE2) + '\n';
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('the level rule is Legacy\'s: 0 → level 0, then six levels up to 127', () => {
    const want = [[0, 0], [1, 1], [22, 1], [23, 2], [64, 3], [106, 5], [107, 6], [127, 6]];
    for (const [v, lv] of want) assert(L.autoGradLevel(v) === lv, `level(${v}) = ${L.autoGradLevel(v)}, want ${lv}`);
    assert(JSON.stringify(L.AUTO_GRAD) === JSON.stringify([76, 29, 29, 3, 4, 67, 127]),
           'Legacy\'s palette indices, got ' + JSON.stringify(L.AUTO_GRAD));
});

step('the point blink is 200 ms on, 100 ms off', () => {
    const offs = []; for (let ms = 0; ms < 600; ms += 10) if (L.autoPointOff(ms)) offs.push(ms);
    assert(offs.length === 20 && offs[0] === 200 && offs[9] === 290 && offs[10] === 500,
           'off exactly 200..299 and 500..599, got ' + JSON.stringify(offs));
});

step('⭐ a selected lane paints its values as the gradient — no notes — and its point blinks OFF', () => {
    click(); ticks(3);
    assert(S.autoLaneVals && S.autoLaneVals[15] === 127, 'values read: ' + JSON.stringify(S.autoLaneVals));
    const seen = watchLeds();
    for (let i = 0; i < 16; i++) {
        if (i === 4) continue;
        const want = L.AUTO_GRAD[L.autoGradLevel(PAGE1[i])];
        assert(seen[i].size === 1 && seen[i].has(want), `step ${i + 1}: want ${want}, saw ${[...seen[i]]}`);
    }
    const p = seen[4];
    assert(p.has(L.AUTO_GRAD[L.autoGradLevel(PAGE1[4])]) && p.has(0) && p.size === 2,
           'the point at step 5 shows its level AND blinks off: ' + [...p]);
});

step('page 2 is ONE new read at base 16; steps with no value are dark, past the cycle DarkGrey', () => {
    valReads.length = 0;
    right(); ticks(2);
    assert(valReads.length === 1 && valReads[0] === '16_24', 'one read at base 16, got ' + JSON.stringify(valReads));
    const seen = watchLeds(20);
    for (let i = 0; i < 13; i++) assert(seen[i].has(C_.Red) && seen[i].size === 1, `step ${i + 17} at the top level`);
    /* The lane's cycle is 32 steps, so 13..15 are INSIDE it but have no value → off. */
    for (const i of [13, 14, 15]) assert(seen[i].size === 1 && seen[i].has(0), `step ${i + 17} has no value → off: ${[...seen[i]]}`);
});

step('reads stay on the slow cadence: at most a handful over 20 ticks', () => {
    valReads.length = 0;
    ticks(20);
    assert(valReads.length <= 3, 'at most ~1 per 400 ms, got ' + valReads.length + ' reads in 20 ticks');
});

step('a failed read shows the points blinking white over dark steps, not stale colours', () => {
    cc(62, 127); cc(62, 0); ticks(2);                  /* back to page 1 */
    assert(S.autoCycle.page === 0, 'setup: page 1');
    const saved = VALS; VALS = () => null;
    auto.automationRefreshPresence();                  /* a new list generation → a new key */
    ticks(2);
    assert(S.autoLaneVals === null, 'a failed read of a new key leaves no values, got ' + JSON.stringify(S.autoLaneVals));
    const seen = watchLeds();
    assert(seen[4].has(C_.White) && seen[4].has(0), 'the point at step 5 blinks white: ' + [...seen[4]]);
    for (const i of [0, 8, 15]) assert(seen[i].size === 1 && seen[i].has(0), `step ${i + 1} dark, no stale colour: ${[...seen[i]]}`);
    VALS = saved;
});

step('⭐ with the global menu open over this card, the click goes to the MENU, not the card', () => {
    const { openGlobalMenu } = globalThis.__menu;
    const a = S.autoBank;
    const before = JSON.stringify({ menu: a && a.menu, ops: !!(a && a.ops) });
    openGlobalMenu();
    assert(S.globalMenuOpen, 'setup: the menu is open');
    const depth = S.globalMenuStack.depth ? S.globalMenuStack.depth() : JSON.stringify(S.globalMenuStack);
    click(); ticks(1);
    const after = JSON.stringify({ menu: S.autoBank && S.autoBank.menu, ops: !!(S.autoBank && S.autoBank.ops) });
    assert(after === before, 'the card did not take the click: ' + before + ' -> ' + after);
    const depth2 = S.globalMenuStack.depth ? S.globalMenuStack.depth() : JSON.stringify(S.globalMenuStack);
    assert(!S.globalMenuOpen || depth2 !== depth || S.menuInfoLines || S.exportDoneDialog, 'the menu acted on the click');
    S.globalMenuOpen = false;
});

if (failed) { console.error('FAIL: test_automation_bank_gradient'); process.exit(1); }
console.log('PASS: test_automation_bank_gradient');
}
main().catch(e => { console.error(e); process.exit(1); });
