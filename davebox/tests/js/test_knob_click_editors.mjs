import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_knob_click_editors.mjs — the editors a plain jog click used to
 * open move to knob touch + click (Josh, 2026-10-04: "live arp > step editor =
 * knob touch + click on steps param (k5) and style the knob appropriately ...
 * repeat groove velocity > nudge = touch any knob and click (add footer hint
 * that says knob+click goes to nudge/velocity in both modes.)"; "seq arp should
 * work like live arp"). MACROS' per-knob editors are pinned in test_macros_rest
 * / test_macros_bank / test_bank_lock.
 *
 * Real gestures: knob touch notes 0-7, jog click CC 3, Back CC 51, jog CC 14.
 * Asserted on state AND on screen (the drawn footer, the brackets, the frame).
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
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + "=" + v); };
const _dec = (blob) => { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; };
globalThis.host_module_set_params = (b) => { const it = _dec(b); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
let LIST = '';
const knobLed = {};                  /* knob ring CC (71-78) -> colour */
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : ''); globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = (slot, k, v) => { slotSets.push(k); return 1; };
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m); if (a.length >= 4 && (a[1] & 0xF0) === 0xB0 && a[2] >= 71 && a[2] <= 78) knobLed[a[2]] = a[3]; return true; }; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const kit = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
const tick = () => { S.tickCount++; globalThis.tick(); snd.soundTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
const touch = (k) => { midi(0x90, k, 127); ticks(1); };
const untouch = (k) => { midi(0x90, k, 0); ticks(1); };
const touchClick = (k) => { touch(k); click(); untouch(k); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const same = (a, b) => a.every((v, i) => v === b[i]);
const toBank = (b) => { S.activeBank = b; S.trackActiveBank[S.activeTrack] = b; ticks(4); };
const home = () => { if (S.bankMapUp) { click(); } S.bankCardLatched = false; S.stepIntervalMode = false; S.altMode = false; S.knobAlt = 0; };
/* A bank page HELD up — what Shift + hold Step 11 does for LIVE ARP (no click
 * locks a page since 2026-10-04). */
const latch = (b) => { home(); toBank(b); S.bankCardLatched = true; ticks(2); };
const drawnHints = () => { frame(); return JSON.stringify(kit.kitHintsForTest()); };
/* The footer as DRAWN: the pairs offered, cut by the row's own fit rule
 * (drawKitHintRow returns how many it drew; BACK is pinned last). */
const footerDrawn = () => {
    frame();
    const offered = kit.kitHintsForTest();
    const n = kit.drawKitHintRow(kit.MV_FOOTER_Y, offered);
    const back = offered.filter((h) => h[0] === 'BACK');
    const flow = offered.filter((h) => h[0] !== 'BACK');
    return JSON.stringify(flow.slice(0, n - back.length).concat(back));
};
const bracketed = (f, k) => {
    const x = (k % 4) * kit.MV_CELL_W, y = k < 4 ? kit.MV_ROW0_Y : kit.MV_ROW1_Y;
    const w = kit.MV_CELL_W, h = kit.MV_KH, at = (px, py) => f[py * W + px];
    return !!(at(x, y) && at(x + w - 1, y) && at(x, y + h - 1) && at(x + w - 1, y + h - 1));
};

for (const [bank, name] of [[5, 'LIVE ARP'], [4, 'SEQ ARP']]) {
    step('⭐ ' + name + ': K5 (Steps) wears the brackets; touched, the footer says CLK STEPS; a plain click opens nothing', () => {
        latch(bank);
        assert(S.bankCardLatched, 'setup: latched');
        const f = frame();
        assert(bracketed(f, C.ARP_STEPS_KNOB), 'K5 is not bracketed');
        assert(!bracketed(f, 0) && !bracketed(f, 5), 'another knob is bracketed');
        assert(!kit.kitHintsForTest().some((h) => h[0] === 'CLK' && h[1] !== 'BANKS'), 'untouched footer offers a knob CLK: ' + drawnHints());
        assert(kit.kitHintsForTest().some((h) => h[0] === 'CLK' && h[1] === 'BANKS'), 'untouched footer does not offer the map: ' + drawnHints());
        click();
        assert(!S.stepIntervalMode && S.bankMapLatched, 'a plain click opened Arp Steps, or not the map');
        click();
        assert(!S.bankMapUp, 'setup: the second click did not close the map');
        for (const k of [0, 3, 7]) {
            touchClick(k);
            assert(!S.stepIntervalMode, 'touch K' + (k + 1) + ' + click opened Arp Steps (only Steps, K5, does)');
        }
        touch(C.ARP_STEPS_KNOB);
        assert(drawnHints() === JSON.stringify([['CLK', 'STEPS']]), 'touched K5 footer: ' + drawnHints());
        untouch(C.ARP_STEPS_KNOB);
    });
    step('⭐⭐ ' + name + ': touch K5 + click opens Arp Steps ON SCREEN; inside, neither click closes it; Back does, onto the card', () => {
        const before = frame();
        touchClick(C.ARP_STEPS_KNOB);
        assert(S.stepIntervalMode, 'Arp Steps did not open');
        assert(!same(before, frame()), 'the screen did not change');
        click();
        assert(S.stepIntervalMode, 'a plain click inside closed it');
        touchClick(C.ARP_STEPS_KNOB);
        assert(S.stepIntervalMode, 'touch K5 + click inside closed it (K5 is step 5 there)');
        back();
        assert(!S.stepIntervalMode && S.bankCardLatched, 'Back: editor ' + S.stepIntervalMode + ' latched ' + S.bankCardLatched);
    });
    step(name + ': a jog turn leaves Arp Steps, as before', () => {
        touchClick(C.ARP_STEPS_KNOB);
        assert(S.stepIntervalMode, 'setup');
        cc(14, 1); ticks(2);
        assert(!S.stepIntervalMode, 'the turn did not leave Arp Steps');
    });
}

step('⭐ from REST: touch K5 + click opens Arp Steps; nothing locks, and Back is the overview', () => {
    home(); toBank(5);
    assert(!render.bankCardVisible(), 'setup: at rest');
    touchClick(C.ARP_STEPS_KNOB);
    assert(S.stepIntervalMode && !S.bankCardLatched, 'editor ' + S.stepIntervalMode + ' latched ' + S.bankCardLatched);
    back();
    assert(!S.stepIntervalMode && !render.bankCardVisible(), 'Back from the editor is the overview');
});

step('⭐⭐ RPT GROOVE: the footer says KNB+CLK NUDGE on the Velocity page — drawn, with room under the numbers', () => {
    S.trackPadMode[2] = C.PAD_MODE_DRUM;
    latch(5);
    assert(footerDrawn() === JSON.stringify([['KNB+CLK', 'NUDGE'], ['BACK', 'OUT']]), 'velocity page footer: ' + footerDrawn());
    const f = frame();
    let ink = 0; for (let y = kit.MV_FOOTER_Y - 2; y < kit.MV_FOOTER_Y; y++) for (let x = 0; x < 128; x++) ink += f[y * W + x];
    assert(ink === 0, 'the step numbers run into the footer: ' + ink + ' px');
    let nums = 0; for (let y = 48; y < 53; y++) for (let x = 0; x < 128; x++) nums += f[y * W + x];
    assert(nums > 0, 'the step numbers are not on their row (48) above the footer');
    click();
    assert(!S.altMode && S.bankMapLatched, 'a plain click flipped the page, or did not open the map');
    click();
    assert(!S.bankMapUp, 'setup: the second click did not close the map');
});

step('⭐⭐ RPT GROOVE: touch ANY knob + click flips to Nudge; the footer says KNB+CLK VELOCITY; and back', () => {
    for (const k of [3, 7]) {
        touchClick(k);
        assert(S.altMode, 'K' + (k + 1) + ' + click did not flip to Nudge');
        assert(footerDrawn() === JSON.stringify([['KNB+CLK', 'VELOCITY'], ['BACK', 'OUT']]), 'nudge page footer: ' + footerDrawn());
        touchClick(0);
        assert(!S.altMode, 'K1 + click did not flip back to Velocity');
    }
    touchClick(2);
    back();
    assert(!S.altMode, 'Back did not clear the Nudge page');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE;
});

if (failed) process.exit(1);
console.log('test_knob_click_editors: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
