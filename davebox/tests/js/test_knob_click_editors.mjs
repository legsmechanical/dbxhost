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
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
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
const { S, standDownBankDisplay } = await import('../../ui/ui_state.mjs');
/* This rig lets go and looks in the same instant; the release hold has its
 * own test (test_touch_hold.mjs). */
S.touchHoldMs = 0;
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

/* Arp Steps and RPT GROOVE's Nudge are JOG PAGES (Josh, 2026-11-20: "now that
 * jog is free to move between pages, i wonder if we can off load those screens
 * to bank pages" · "arp and rpt groove"). No knob opens them any more. */
const jog = (d) => { cc(14, d > 0 ? 1 : 127); ticks(2); };
for (const [bank, name] of [[5, 'LIVE ARP'], [4, 'SEQ ARP']]) {
    step('⭐ ' + name + ': no knob is a door any more — K5 wears no brackets, touched it offers no CLK, and touch + click opens nothing', () => {
        latch(bank);
        assert(S.bankCardLatched, 'setup: latched');
        const f = frame();
        assert(!bracketed(f, 4), 'K5 is still bracketed');
        assert(render.bankPagesRight(bank).endsWith(' 1/3'), 'header page mark: ' + render.bankPagesRight(bank));
        for (const k of [0, 4, 7]) {
            touchClick(k);
            assert(!S.stepIntervalMode, 'touch K' + (k + 1) + ' + click opened Arp Steps');
        }
        touch(4);
        assert(!kit.kitHintsForTest().some((h) => h[0] === 'CLK'), 'touched K5 footer: ' + drawnHints());
        untouch(4);
    });
    step('⭐⭐ ' + name + ': the jog turns its pages — settings, Arp Steps pitch, Arp Steps velocity — clamped at both ends, ON SCREEN', () => {
        const p1 = frame();
        jog(-1);
        assert(!S.stepIntervalMode, 'a left turn on page 1 opened something');
        jog(1);
        assert(S.stepIntervalMode && !S.arpVelPage, 'page 2 is not Arp Steps pitch');
        const p2 = frame();
        assert(!same(p1, p2), 'page 2 did not change the screen');
        assert(render.bankPagesRight(bank).endsWith(' 2/3'), 'page 2 mark: ' + render.bankPagesRight(bank));
        assert(drawnHints() === JSON.stringify([['BACK', 'OUT']]), 'page 2 footer: ' + drawnHints());
        jog(1);
        assert(S.stepIntervalMode && S.arpVelPage, 'page 3 is not Arp Steps velocity');
        assert(!same(p2, frame()), 'page 3 did not change the screen');
        assert(render.bankPagesRight(bank).endsWith(' 3/3'), 'page 3 mark: ' + render.bankPagesRight(bank));
        jog(1);
        assert(S.stepIntervalMode && S.arpVelPage, 'a right turn on page 3 left it (no wrap)');
        jog(-1);
        assert(S.stepIntervalMode && !S.arpVelPage, 'a left turn did not come back to pitch');
        jog(-1);
        assert(!S.stepIntervalMode, 'a left turn did not come back to the settings');
    });
    step('⭐ ' + name + ': the knobs set PITCH on page 2 and VELOCITY on page 3 — Shift no longer chooses', () => {
        const t = S.activeTrack, isSeq = bank === 4;
        const ac = () => isSeq ? S.seqArpStepInt[t][S.activeClip[t]] : S.tarpStepInt[t];
        const av = () => isSeq ? S.seqArpStepVel[t][S.activeClip[t]] : S.tarpStepVel[t];
        jog(1);
        sets.length = 0;
        cc(71 + 1, 1); ticks(1); untouch(1);
        assert(sets.some((x) => x.includes(isSeq ? '_seq_arp_step_int=1' : '_tarp_step_int=1')) || (ac()[1] | 0) !== 0,
               'page 2 K2 did not set step 2\'s pitch: ' + JSON.stringify(sets));
        jog(1);
        sets.length = 0;
        cc(71 + 2, 127); ticks(1); untouch(2);
        assert(sets.some((x) => x.includes(isSeq ? '_seq_arp_step_vel=2' : '_tarp_step_vel=2')),
               'page 3 K3 did not set step 3\'s velocity: ' + JSON.stringify(sets));
        jog(-1); jog(-1);
    });
    step(name + ': Back leaves Arp Steps for the settings, onto the card', () => {
        jog(1); jog(1);
        assert(S.stepIntervalMode, 'setup');
        back();
        assert(!S.stepIntervalMode && S.bankCardLatched, 'Back: editor ' + S.stepIntervalMode + ' latched ' + S.bankCardLatched);
    });
}

step('⭐ from REST: the jog opens Arp Steps; nothing locks, and Back is the overview', () => {
    home(); toBank(5); standDownBankDisplay(true); ticks(2);
    assert(!render.bankCardVisible(), 'setup: at rest (latched ' + S.bankCardLatched + ', touched ' + S.knobTouched + ', shift ' + S.shiftHeld + ')');
    jog(1);
    assert(S.stepIntervalMode && !S.bankCardLatched, 'editor ' + S.stepIntervalMode + ' latched ' + S.bankCardLatched);
    back();
    assert(!S.stepIntervalMode && !render.bankCardVisible(), 'Back from the editor is the overview');
});

step('⭐⭐ RPT GROOVE: Velocity is page 1/2 — no KNB+CLK in the footer, room under the numbers; a click or a touch + click flips nothing', () => {
    S.trackPadMode[2] = C.PAD_MODE_DRUM;
    latch(5);
    assert(!JSON.stringify(kit.kitHintsForTest()).includes('KNB+CLK'), 'velocity page footer: ' + footerDrawn());
    assert(render.bankPagesRight(5).endsWith(' 1/2'), 'page mark: ' + render.bankPagesRight(5));
    const f = frame();
    let ink = 0; for (let y = kit.MV_FOOTER_Y - 2; y < kit.MV_FOOTER_Y; y++) for (let x = 0; x < 128; x++) ink += f[y * W + x];
    assert(ink === 0, 'the step numbers run into the footer: ' + ink + ' px');
    let nums = 0; for (let y = 48; y < 53; y++) for (let x = 0; x < 128; x++) nums += f[y * W + x];
    assert(nums > 0, 'the step numbers are not on their row (48) above the footer');
    click();
    assert(!S.altMode && !S.bankMapUp, 'a plain click flipped the page, or left the map up');
    touchClick(3);
    assert(!S.altMode, 'touch + click still flips to Nudge');
});

step('⭐⭐ RPT GROOVE: the jog turns to Nudge (2/2) and back, clamped; Back clears Nudge', () => {
    const v = frame();
    jog(-1);
    assert(!S.altMode, 'a left turn on Velocity flipped it');
    jog(1);
    assert(S.altMode, 'a right turn did not go to Nudge');
    assert(!same(v, frame()), 'Nudge did not change the screen');
    assert(render.bankPagesRight(5).endsWith(' 2/2'), 'page mark: ' + render.bankPagesRight(5));
    jog(1);
    assert(S.altMode, 'a right turn on Nudge left it (no wrap)');
    jog(-1);
    assert(!S.altMode, 'a left turn did not come back to Velocity');
    jog(1);
    back();
    assert(!S.altMode, 'Back did not clear the Nudge page');
    S.trackPadMode[2] = C.PAD_MODE_MELODIC_SCALE;
});

/* MIX and MACROS are sound mode's cards: their footers name the bank map
 * (HLD BANKS) while no knob is touched — the jog turn walks nothing since
 * 2026-10-04 — and a touched knob's own click instead. */
const pure = await import('../../ui/ui_pure.mjs');
for (const [bank, name, want] of [[C.BANK_SOUND, 'MIX', null], [C.BANK_MACROS, 'MACROS', 'ASSIGN']]) {
    step('⭐ ' + name + ' card: HLD BANKS untouched, never JOG BANK; a touched knob takes the CLK', () => {
        home();
        let pad = -1;
        for (let c = 0; c < 4 && pad < 0; c++) for (let r = 0; r < 4; r++)
            if (pure.bankPadMapCellAt(S.trackPadMode[2], 2, c, r) === bank) { pad = pure.bankMapPadForCell(c, r); break; }
        midi(0xB0, 3, 127);
        midi(0x90, pad, 100); midi(0x80, pad, 0);
        midi(0xB0, 3, 0); ticks(4);
        assert(S.activeBank === bank && !S.bankMapUp, 'setup: not on ' + name + ' (' + S.activeBank + '), map up ' + S.bankMapUp);
        S.bankCardLatched = true; ticks(4);
        assert(render.bankCardVisible(), 'setup: ' + name + '\'s card is not up: open ' + snd.soundOpen() + ' pending ' + S.pendingSoundEnterTrack + ' route ' + S.trackRoute[2]);
        let h = (frame(), kit.kitHintsForTest());
        assert(h.some((p) => p[0] === 'HLD' && p[1] === 'BANKS') && !h.some((p) => p[0] === 'JOG'),
               name + ' untouched: ' + JSON.stringify(h));
        touch(5);
        h = (frame(), kit.kitHintsForTest());
        assert(!h.some((p) => p[1] === 'BANKS'), name + ' touched still offers the map: ' + JSON.stringify(h));
        if (want) assert(h.some((p) => p[0] === 'CLK' && p[1] === want), name + ' touched: ' + JSON.stringify(h));
        untouch(5);
        back(); back(); ticks(2);
        if (snd.soundActive()) snd.soundExit();
        S.bankCardLatched = false; toBank(0);
    });
}

if (failed) process.exit(1);
console.log('test_knob_click_editors: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
