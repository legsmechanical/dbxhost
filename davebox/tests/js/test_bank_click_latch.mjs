/* tests/js/test_bank_click_latch.mjs — the Front-2 bank-access revision
 * (Josh, 2026-08-31), end to end through the real dispatch:
 *
 *   - plain jog CLICK from the resting overview opens the PERSISTENT bank
 *     display (the latch that lived on Shift+click since 08-25)
 *   - once a card is visible, the click keeps its per-bank meanings
 *     (alt-param toggle, arp step-interval, ALL LANES confirm)
 *   - Back dismisses the latch back to the overview
 *   - Shift+jog-click is RETIRED (no latch, no toggle) — only the
 *     picker-abandon survives
 *   - the bare jog TOUCH no longer reveals the card (touch-reveal retired);
 *     the render predicate and the click gate share one owner, pinned by
 *     asserting through bankCardVisible() itself. */

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

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
function rest() {
    S.bankCardLatched = false; S.bankSelectTick = -1; S.bankDisplayArmedTick = -1;
    S.knobTouched = -1; S.altMode = false; S.bankPickerSel = -1;
    S.jogTouched = false; S.shiftHeld = false; S.tickCount += 10;
}

step('⭐ plain click from the RESTING OVERVIEW latches the bank display', () => {
    rest(); S.activeBank = 1;
    if (bankCardVisible()) throw new Error('setup: card already visible');
    click();
    if (!S.bankCardLatched) throw new Error('no latch');
    if (!bankCardVisible()) throw new Error('latched but the render predicate says no card');
});

step('⭐ ...and Back dismisses it to the overview', () => {
    cc(51, 127); cc(51, 0);
    if (S.bankCardLatched) throw new Error('Back did not unlatch');
    if (bankCardVisible()) throw new Error('card still visible after Back');
});

step('with the card VISIBLE, click keeps its per-bank meaning — alt-param toggle', () => {
    rest(); S.activeBank = 1;                    /* NOTE FX has alt params */
    click();                                     /* latch from overview */
    const alt = S.altMode;
    click();                                     /* second click: card visible */
    if (S.altMode === alt) throw new Error('second click did not toggle alt-params');
    if (!S.bankCardLatched) throw new Error('the per-bank click broke the latch');
    S.altMode = false;
});

step('with the card VISIBLE on SEQ ARP, click toggles the step-interval editor', () => {
    rest(); S.activeBank = 4;
    click();                                     /* latch */
    if (S.stepIntervalMode) throw new Error('latch click also toggled the arp editor');
    click();
    if (!S.stepIntervalMode) throw new Error('second click did not open the arp editor');
    S.stepIntervalMode = false;
});

step('⭐ Shift+jog-click is retired: no latch, no unlatch — only picker abandon', () => {
    rest(); S.activeBank = 1;
    S.shiftHeld = true;
    click();
    if (S.bankCardLatched) throw new Error('Shift+click latched — the gesture is retired');
    S.shiftHeld = false;
    click();                                     /* latch for the unlatch check */
    if (!S.bankCardLatched) throw new Error('setup: plain click failed to latch');
    S.shiftHeld = true;
    click();
    if (!S.bankCardLatched) throw new Error('Shift+click UNLATCHED — the old toggle is back');
    S.shiftHeld = false;
    /* the abandon survives */
    S.bankPickerSel = 2; S.shiftHeld = true;
    click();
    if (S.bankPickerSel >= 0) throw new Error('Shift+click no longer abandons an open picker');
    S.shiftHeld = false;
});

step('⭐ the bare jog TOUCH no longer reveals the card', () => {
    rest(); S.activeBank = 1;
    note(9, 127);                                /* jog capacitive touch down */
    if (bankCardVisible()) throw new Error('touch alone revealed the bank card — retired 2026-08-31');
    if (!S.jogTouched) throw new Error('control: jogTouched not even tracked — picker commit would break');
    note(9, 0);
});

step('control: the transient window still reveals (only TOUCH-reveal retired)', () => {
    rest(); S.activeBank = 1;
    S.bankSelectTick = S.tickCount;              /* a committed pick arms this */
    if (!bankCardVisible()) throw new Error('the transient window stopped revealing — too much was retired');
});

step('⭐ SESSION mirrors the grammar: click latches the mixer, click again overlays the FX list', () => {
    rest(); S.sessionView = true; S.sessMixerLatched = false; S.sessFxOverlaySel = -1;
    click();
    if (!S.sessMixerLatched) throw new Error('session click did not latch the mixer');
    click();
    if (S.sessFxOverlaySel !== 0) throw new Error('second click did not open the FX overlay');
    cc(14, 1);
    if (S.sessFxOverlaySel !== 1) throw new Error('jog did not move the overlay cursor');
    cc(14, 1); cc(14, 1);
    if (S.sessFxOverlaySel !== 2) throw new Error('overlay cursor did not clamp at the last bus');
    cc(51, 127); cc(51, 0);                      /* Back: close overlay only */
    if (S.sessFxOverlaySel >= 0) throw new Error('Back did not close the overlay');
    if (!S.sessMixerLatched) throw new Error('Back closed the mixer with the overlay');
    cc(51, 127); cc(51, 0);                      /* Back again: dismiss the mixer */
    if (S.sessMixerLatched) throw new Error('second Back did not dismiss the mixer');
    S.sessionView = false;
});

step('⭐ committing the overlay enters that bus\'s editor', () => {
    rest(); S.sessionView = true;
    click(); click();                            /* latch, overlay */
    cc(14, 1);                                   /* Send A */
    click();                                     /* commit */
    if (S.sessFxOverlaySel >= 0) throw new Error('overlay stayed open past the commit');
    const snd = sndMod;
    if (!snd.soundActive()) throw new Error('the pick did not enter sound mode');
    if (!snd.soundIsGlobal()) throw new Error('the pick did not land in a global bus context');
    snd.soundExit();
    S.sessionView = false;
});

step('the turn past SEND B clamps — the old FX-list door is retired', () => {
    rest(); S.sessionView = true; S.sessKnobMode = 3;   /* SEND B */
    S.bankSelectTick = S.tickCount;                     /* page shown */
    cc(14, 1);                                          /* one more right turn */
    if (S.sessKnobMode !== 3) throw new Error('mode walked past SEND B');
    if (globalThis.__busMenuOpened) throw new Error('the retired door opened');
    if (sndMod.soundActive()) throw new Error('the turn entered sound mode');
    S.sessionView = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
