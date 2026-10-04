import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_bank_click_latch.mjs — what the PLAIN jog click does, end to
 * end through the real dispatch. Since 2026-10-04 (Josh: "hold jog instantly
 * peek the pad map and jog click instantly pop it up and another jog click
 * close it"; "Touch only; drop Bank Lock"; Session "same as Track View"):
 *
 *   - the click opens the BANK MAP (Session View: the Session map), never a
 *     bank page; a second click or Back closes it
 *   - a bank page shows only while a knob is touched (or the jog, with Jog
 *     Touch Card) — nothing locks one by a click
 *   - Shift + jog click stays retired — only the picker-abandon survives
 *   - the session walk is the four mixer modes (no FX gateway); the map's FX
 *     pads open the buses
 * (The file keeps its name; it pinned the click-to-lock grammar it replaces.) */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { bankCardVisible } = await import('../../ui/ui_render.mjs');
const sndMod = await import('../../ui/ui_sound.mjs');
const renderMod = await import('../../ui/ui_render.mjs');
const pureMod = await import('../../ui/ui_pure.mjs');
const icc = await import('../../ui/ui_input_cc.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
function rest() {
    if (S.bankMapUp) icc.bankMapEnd();
    S.bankCardLatched = false; S.bankSelectTick = -1; S.bankDisplayArmedTick = -1;
    S.knobTouched = -1; S.altMode = false; S.bankPickerSel = -1;
    S.jogTouched = false; S.shiftHeld = false; S.tickCount += 10;
}

step('⭐ the plain click from the overview opens the MAP — never a bank page; a second click closes it', () => {
    rest(); S.activeBank = 1;
    click();
    if (!S.bankMapLatched || !S.bankMapUp) throw new Error('the click did not open the map');
    if (S.bankCardLatched || bankCardVisible()) throw new Error('the click locked a bank page');
    click();
    if (S.bankMapUp) throw new Error('the second click did not close the map');
});

step('⭐ Back closes a map the click opened; the bank stays', () => {
    rest(); S.activeBank = 1;
    click();
    cc(51, 127); cc(51, 0);
    if (S.bankMapUp || S.bankMapLatched) throw new Error('Back did not close the map');
    if (S.activeBank !== 1 || bankCardVisible()) throw new Error('Back moved the bank or showed a card');
});

step('⭐ Shift+jog-click is retired: no map, no latch — only picker abandon', () => {
    rest(); S.activeBank = 1;
    S.shiftHeld = true;
    click();
    if (S.bankMapUp || S.bankCardLatched) throw new Error('Shift+click opened something — the gesture is retired');
    S.bankPickerSel = 2;
    click();
    if (S.bankPickerSel >= 0) throw new Error('Shift+click no longer abandons an open picker');
    S.shiftHeld = false;
});

step('⭐ the bare jog TOUCH is not bank mode', () => {
    rest(); S.activeBank = 1;
    note(9, 127);
    if (bankCardVisible()) throw new Error('touch alone put the card in bank mode');
    if (!S.jogTouched) throw new Error('control: jogTouched not even tracked');
    note(9, 0);
});

step('⭐ the ONE LAW: a held page shows the card; a knob touch PEEKS it; nothing else', () => {
    rest(); S.activeBank = 1;
    S.bankSelectTick = S.tickCount;
    if (bankCardVisible()) throw new Error('the transient window revealed the card — only a held page or a peek may');
    S.bankSelectTick = -1; S.knobTouched = 3;
    if (!bankCardVisible()) throw new Error('a knob touch did not PEEK the card');
    S.knobTouched = -1;
    if (bankCardVisible()) throw new Error('the peek outlived the touch');
    S.bankCardLatched = true;                    /* a page held on purpose (Shift + hold Step 11) */
    if (!bankCardVisible()) throw new Error('a held page does not show the card');
    S.bankCardLatched = false;
});

step('⭐ SESSION: a turn walks no mixer mode (retired 2026-10-04); the click opens the Session MAP', () => {
    rest(); S.sessionView = true; S.sessKnobMode = 0;
    cc(14, 1); cc(14, 1);
    if (S.sessKnobMode !== 0) throw new Error('a turn walked the mixer mode: ' + S.sessKnobMode);
    click();
    if (!S.bankMapLatched || S.bankMapKind !== 'session') throw new Error('the session click did not open the Session map');
    if (renderMod.sessMixerVisible()) throw new Error('the click showed the mixer page');
    click();
    if (S.bankMapUp) throw new Error('the second click did not close it');
    S.knobTouched = 2;
    if (!renderMod.sessMixerVisible()) throw new Error('a knob touch did not show the mixer page');
    S.knobTouched = -1;
    S.sessionView = false;
});

step('⭐ a VIEW SWITCH closes a map — each view opens on its overview; the remembered bank survives', () => {
    rest(); S.activeBank = 1;
    click();
    if (!S.bankMapLatched) throw new Error('setup: no map');
    cc(50, 127); cc(50, 0);                      /* Note/Session -> session overview */
    if (!S.sessionView) throw new Error('the escape did not go to session view');
    if (S.bankMapUp || S.bankMapLatched) throw new Error('the view switch did not close the map');
    click();
    if (!S.bankMapLatched) throw new Error('setup: no session map');
    cc(50, 127); cc(50, 0);
    if (S.bankMapUp) throw new Error('the escape did not close the session map');
    if (S.sessionView) { cc(50, 127); cc(50, 0); }
    if (S.sessionView) throw new Error('setup: did not switch back');
    if (bankCardVisible()) throw new Error('track view did not open on its overview');
    if (S.activeBank !== 1) throw new Error('the remembered bank was lost: ' + S.activeBank);
});

step('⭐ MASTER from the Session map opens its effects; Back walks out to the overview', () => {
    rest(); S.sessionView = true;
    click();                                     /* the Session map */
    note(pureMod.bankMapPadForCell(1, 0), 100); note(pureMod.bankMapPadForCell(1, 0), 0);   /* MASTER */
    for (let i = 0; i < 4; i++) { sndMod.soundTick(); globalThis.tick(); }
    if (!sndMod.soundActive() || !sndMod.soundIsGlobal()) throw new Error('MASTER did not open its effects');
    if (S.bankMapUp) throw new Error('the map stayed up over the effects');
    for (let i = 0; i < 4 && sndMod.soundActive(); i++) { cc(51, 127); cc(51, 0); globalThis.tick(); }
    if (sndMod.soundActive()) throw new Error('Back did not walk out of the effects');
    if (!S.sessionView || S.bankMapUp) throw new Error('Back did not land on the session overview');
    S.sessionView = false; rest();
});

step('⭑ AT REST a turn moves NO bank (the walk retired 2026-10-04); a map pick of MIX opens it RESTING', () => {
    rest(); sndMod.soundExit();
    S.sessionView = false; S.bankCardLatched = false; S.knobTouched = -1;
    S.activeTrack = 2; S.activeBank = 1; S.trackActiveBank[2] = 1;
    cc(14, 1); globalThis.tick();
    if (S.activeBank !== 1 || S.trackActiveBank[2] !== 1) throw new Error('the turn walked the bank: ' + S.activeBank);
    S.bankPickerSel = pureMod.bankListForMode(0, 2).indexOf(11); icc.applyBankPick(true);   /* the map's pick at rest */
    globalThis.tick(); globalThis.tick();
    if (S.activeBank !== 11) throw new Error('the pick did not land on MIX: ' + S.activeBank);
    if (!sndMod.soundOpen() || sndMod.soundActive()) throw new Error('the sound bank should open RESTING (open, not active)');
    if (renderMod.bankCardVisible()) throw new Error('the card must not show at rest');
    S.bankPickerSel = pureMod.bankListForMode(0, 2).indexOf(1); icc.applyBankPick(true); globalThis.tick();
    if (sndMod.soundOpen()) throw new Error('picking off MIX at rest did not close the resting mode');
});

step('⭐ a menu entered OUTSIDE a held page Backs out of sound mode — no invisible prompt', () => {
    rest();
    sndMod.soundEnter(2, 2); sndMod.soundShowMenu();
    if (!sndMod.soundActive()) throw new Error('setup: gesture menu did not open');
    if (S.bankCardLatched) throw new Error('setup: gesture entry held a page');
    cc(51, 127); cc(51, 0); globalThis.tick();
    if (sndMod.soundActive())
        throw new Error('menu-top Back outside a held page left sound mode open (invisible prompt)');
    rest(); S.activeBank = 0; S.trackActiveBank[2] = 0;
});

step('⭐ a jog click DURING a knob peek opens no map and locks nothing (a bank with no touch + click meaning)', () => {
    rest(); S.activeBank = 2;
    S.knobTouched = 3;                               /* the peek */
    if (!bankCardVisible()) throw new Error('control: peek not visible');
    click();
    if (S.bankCardLatched || S.bankMapUp) throw new Error('a peek click locked a page or opened the map');
    S.knobTouched = -1;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
