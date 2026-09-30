/* tests/js/test_bank_nav_overlay.mjs — the BANK NAVIGATION OVERLAY (Josh,
 * 2026-09-26): "turning the knob should show a bank selection overlay on the
 * left side of the screen ... Shows only upon jog turn on bank or track/session
 * overview pages and goes away immediately upon release."
 *
 * Performs the gesture through the real input path: touch the jog, turn it on
 * the track overview — the jog still WALKS the bank, and a column on the left
 * lists the walk with the new bank on the middle row, inverted; release — the
 * column is gone. The session overview walks its session banks the same way.
 * CONTROLS: a touch with no turn shows nothing; a turn inside the AUTOMATION
 * list (which is not a walk) shows nothing.
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
const holdTicks = Math.ceil(C.BANKNAV_HOLD_MS / 10.6) + 1;
const settle = () => { S.tickCount += holdTicks; globalThis.tick(); };
const frame = () => { fb.fill(0); render.drawUI(); return fb.slice(); };
const MID_Y = ((kit.MV_BANKNAV_ROWS - 1) >> 1) * kit.MV_BANKNAV_ROW_H + 1;
/* The middle row is inverted: a wide band of the column's left half is solid
 * ink down the whole row. (Counted across x, not read at one x: a row inside a
 * category starts its highlight past the category gutter.) */
const midRowSolidCols = (f) => {
    let n = 0;
    for (let x = 0; x < 64; x++) {
        let all = true;
        for (let y = MID_Y - 1; y < MID_Y + 8; y++) if (!f[y * W + x]) { all = false; break; }
        if (all) n++;
    }
    return n;
};
const columnUp = (f) => midRowSolidCols(f) >= 10;   /* measured: off 0-2, on 15+ */

step('⚠ CONTROL: a touch with no turn shows no column', () => {
    S.activeBank = 0; S.trackActiveBank[2] = 0; S.bankSelectTick = -1;
    touchJog(); tick();
    assert(!columnUp(frame()), 'the column is up without a turn');
    releaseJog(); tick();
});
step('⭐⭐ THE GESTURE: touch + turn on the track overview walks the bank AND shows the column', () => {
    touchJog(); tick();
    jog(1); tick();
    const cyc = render.bankNavItems();
    assert(S.activeBank === 1, 'the jog no longer walks the bank: ' + S.activeBank);
    assert(cyc.items[cyc.cur].name === 'NOTE FX', 'the column centres ' + cyc.items[cyc.cur].name);
    assert(columnUp(frame()), 'no column on the left while jogging');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('the column follows the walk to MIX', () => {
    for (let i = 0; i < 12 && S.activeBank !== C.BANK_SOUND; i++) { jog(1); tick(); }
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'MIX', 'centred ' + nav.items[nav.cur].name);
    assert(nav.items.every((it) => it.glyph || it.name === 'CONFIG'), 'an entry has no glyph');   /* CONFIG wears none, like its menu */
    /* MIX's page is sound mode's screen: the column must sit over it too. */
    assert(columnUp(frame()), 'no column over the MIX page');
    assert(swallowed === null, 'swallowed: ' + swallowed);
});
step('⭐ release: the column goes once the last detent is BANKNAV_HOLD_MS old', () => {
    releaseJog(); tick();
    assert(columnUp(frame()), 'a release right on a detent dropped the column (the sensor drops out mid-turn)');
    settle();
    assert(!columnUp(frame()), 'the column outlived the release');
    assert(S.bankNavKind === null, 'still armed: ' + S.bankNavKind);
});
step('⭐⭐ THE TOUCH DROPS OUT MID-TURN (device, 2026-09-26): the column stays up and follows the walk', () => {
    S.activeBank = 0; S.trackActiveBank[2] = 0;
    touchJog(); tick(); jog(1); tick();
    const b1 = S.activeBank;
    releaseJog(); tick();                      /* the sensor lets go... */
    jog(1); tick();                            /* ...while the hand keeps turning */
    assert(S.activeBank !== b1, 'control: the walk did not move');
    assert(columnUp(frame()), 'the banks scrolled with no column');
    const nav = render.bankNavItems();
    assert(S.bankNavKind === 'track' && nav.cur === pure.bankCycleForMode(S.trackPadMode[2], 2).indexOf(S.activeBank), 'the column does not follow the walk');
    touchJog(); tick();                        /* the touch comes back */
    assert(columnUp(frame()), 'the re-touch blinked the column off');
    jog(1); tick();
    assert(columnUp(frame()), 'no column after the re-touch');
    releaseJog(); settle();
    assert(!columnUp(frame()), 'the column outlived the hold');
});
step('⚠ CONTROL: a touch long after the last turn still shows nothing', () => {
    settle();
    touchJog(); tick();
    assert(!columnUp(frame()), 'a bare touch raised the column');
    releaseJog(); settle();
});
step('⭐ session overview: the turn walks the session banks and the column lists them', () => {
    S.sessionView = true; S.sessKnobMode = 0;
    touchJog(); tick();
    jog(1); tick(); jog(1); tick();
    assert(S.sessKnobMode === 2, 'session bank ' + S.sessKnobMode);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'SEND A', 'centred ' + nav.items[nav.cur].name);
    assert(columnUp(frame()), 'no column on the session overview');
    releaseJog(); settle();
    assert(!columnUp(frame()), 'the session column outlived the release');
    S.sessionView = false;
});

step('⭐ session MIXER card (latched): the turn walks the mixer modes and the column lists them', () => {
    S.sessionView = true; S.sessKnobMode = 0; S.sessMixerLatched = true;
    touchJog(); tick();
    jog(1); tick();
    assert(S.sessKnobMode === 1, 'mixer mode ' + S.sessKnobMode);
    const nav = render.bankNavItems();
    assert(nav.items[nav.cur].name === 'PAN', 'centred ' + nav.items[nav.cur].name);
    assert(columnUp(frame()), 'no column on the latched mixer card');
    releaseJog(); settle();
    assert(!columnUp(frame()), 'the mixer-card column outlived the release');
    S.sessMixerLatched = false; S.sessionView = false;
});

/* BANK VIEW MAP (Josh, 2026-09-27: "Global toggle to disable bank navigation
 * overlay when bank cards are locked"). The switch is flipped through the
 * global menu's own item, so the test also proves the item is there. */
const menu = await import('../../ui/ui_menu.mjs');
const prefs = await import('../../ui/ui_prefs.mjs');
const written = {};
const _hwf = globalThis.host_write_file;
globalThis.host_write_file = (p, b) => { written[p] = String(b); return _hwf(p, b); };
const menuItems = () => { menu.openGlobalMenu(); const it = S.globalMenuItems; S.globalMenuOpen = false; return it; };
const mapItem = () => menuItems().find((it) => it && it.label === 'Bank Map on Lock');
step('the global menu has Bank Map on Lock, right under Beat Marks, On by default', () => {
    const items = menuItems(), i = items.findIndex((it) => it && it.label === 'Bank Map on Lock');
    assert(i > 0, 'no Bank Map on Lock item');
    assert(items[i - 1].label === 'Beat Marks', 'not under Beat Marks: ' + items[i - 1].label);
    assert(prefs.bankViewMapOn() === true, 'default is not On');
});
const latchedWalk = () => {
    S.sessionView = false; S.activeBank = 0; S.trackActiveBank[2] = 0;
    midi(0xB0, 3, 127); midi(0xB0, 3, 0); tick();          /* jog click: the bank view */
    assert(S.bankCardLatched, 'control: the click did not open the bank view');
    touchJog(); tick(); jog(1); tick();
    assert(S.activeBank !== 0, 'control: the walk did not move');
};
step('⭐ Bank Map on Lock ON: the bank view shows the column while walking', () => {
    latchedWalk();
    assert(columnUp(frame()), 'no column in the bank view with the switch on');
    releaseJog(); settle();
});
step('⭐⭐ Bank Map on Lock OFF: the bank view walks with no column; the overview keeps it', () => {
    const it = mapItem(); it.set(false);
    assert(written[prefs.BANK_VIEW_MAP_PATH] === '0\n', 'not persisted: ' + JSON.stringify(written));
    latchedWalk();
    assert(!columnUp(frame()), 'the column is up in the bank view with the switch off');
    releaseJog(); settle();
    midi(0xB0, 51, 127); midi(0xB0, 51, 0); tick();         /* Back: to the overview */
    assert(!S.bankCardLatched, 'control: Back did not leave the bank view');
    touchJog(); tick(); jog(1); tick();
    assert(columnUp(frame()), 'the switch took the column off the overview too');
    releaseJog(); settle();
});
step('⭐ Bank Map on Lock OFF: the latched session mixer card walks with no column', () => {
    S.sessionView = true; S.sessKnobMode = 0; S.sessMixerLatched = true;
    touchJog(); tick(); jog(1); tick();
    assert(S.sessKnobMode === 1, 'control: mixer mode ' + S.sessKnobMode);
    assert(!columnUp(frame()), 'column on the latched mixer card with the switch off');
    releaseJog(); settle();
    S.sessMixerLatched = false; S.sessionView = false;
    mapItem().set(true);
    assert(written[prefs.BANK_VIEW_MAP_PATH] === '1\n', 'On not persisted');
});
step('the switch is read from its file at launch (0 = off, absent = on)', () => {
    globalThis.host_file_exists = (p) => p === prefs.BANK_VIEW_MAP_PATH;
    globalThis.host_read_file = (p) => (p === prefs.BANK_VIEW_MAP_PATH ? '0\n' : '');
    S.bankViewMapOn = null;
    assert(prefs.bankViewMapOn() === false, 'a 0 file reads as on');
    globalThis.host_file_exists = () => false; globalThis.host_read_file = () => '';
    S.bankViewMapOn = null;
    assert(prefs.bankViewMapOn() === true, 'no file reads as off');
});

/* ⭐⭐ JOG TOUCH CARD (Josh, 2026-09-30: "Add global menu option for touch jog
 * to show current bank card ... Showing the bank card should be the default.
 * Turning should still show the bank navigation overlay, but it shows over the
 * cards."). Judged on the FRAME: a touch must draw what the bank view draws. */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const jtItem = () => menuItems().find((it) => it && it.label === 'Jog Touch Card');
const cardFrames = () => {
    S.sessionView = false; S.activeBank = 1; S.trackActiveBank[2] = 1;
    S.bankCardLatched = false; S.jogTouched = false; S.bankNavKind = null; settle();
    const rest = frame();
    S.bankCardLatched = true; const latched = frame(); S.bankCardLatched = false;
    return { rest, latched };
};
step('the global menu has Jog Touch Card, right under Bank Map on Lock, On by default', () => {
    const items = menuItems(), i = items.findIndex((it) => it && it.label === 'Jog Touch Card');
    assert(i > 0, 'no Jog Touch Card item');
    assert(items[i - 1].label === 'Bank Map on Lock', 'not under Bank Map on Lock: ' + items[i - 1].label);
    S.jogTouchCardOn = null;
    assert(prefs.jogTouchCardOn() === true, 'default is not On');
});
step('⭐⭐ ON: a bare jog touch draws the current bank card, and the release takes it away', () => {
    const { rest, latched } = cardFrames();
    assert(!same(rest, latched), 'control: the overview and the bank card draw the same frame');
    touchJog(); tick();
    assert(same(frame(), latched), 'the touch did not draw the bank card');
    assert(!S.bankCardLatched, 'the touch LATCHED bank mode — it only shows the card');
    releaseJog(); settle();
    assert(same(frame(), rest), 'the card outlived the touch');
});
step('⭐ ON: a turn under the touch draws the bank column OVER the card', () => {
    cardFrames();
    touchJog(); tick(); jog(1); tick();
    const f = frame();
    assert(columnUp(f), 'no column over the touched card');
    assert(S.activeBank !== 1, 'control: the turn did not walk');
    releaseJog(); settle();
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('⭐ ON: a touch in session view draws the mixer page', () => {
    S.sessionView = true; S.sessKnobMode = 0; S.sessMixerLatched = false; settle();
    const rest = frame();
    S.sessMixerLatched = true; const latched = frame(); S.sessMixerLatched = false;
    assert(!same(rest, latched), 'control: overview and mixer page draw the same frame');
    touchJog(); tick();
    assert(same(frame(), latched), 'the touch did not draw the session mixer page');
    releaseJog(); settle();
    S.sessionView = false;
});
step('⭐⭐ OFF: a bare touch shows nothing, and the switch persists', () => {
    jtItem().set(false);
    assert(written[prefs.JOG_TOUCH_CARD_PATH] === '0\n', 'Off not persisted: ' + JSON.stringify(written));
    const { rest } = cardFrames();
    touchJog(); tick();
    assert(same(frame(), rest), 'the touch drew something with the switch Off');
    releaseJog(); settle();
    jtItem().set(true);
    assert(written[prefs.JOG_TOUCH_CARD_PATH] === '1\n', 'On not persisted');
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('the Jog Touch Card switch is read from its file at launch (0 = off, absent = on)', () => {
    globalThis.host_file_exists = (p) => p === prefs.JOG_TOUCH_CARD_PATH;
    globalThis.host_read_file = (p) => (p === prefs.JOG_TOUCH_CARD_PATH ? '0\n' : '');
    S.jogTouchCardOn = null;
    assert(prefs.jogTouchCardOn() === false, 'a 0 file reads as on');
    globalThis.host_file_exists = () => false; globalThis.host_read_file = () => '';
    S.jogTouchCardOn = null;
    assert(prefs.jogTouchCardOn() === true, 'no file reads as off');
});

if (failed) { console.log('FAIL: bank nav overlay'); process.exit(1); }
console.log('PASS: the bank column shows while the jog walks and goes on release');
}
main().catch((e) => { console.error(e); process.exit(1); });
