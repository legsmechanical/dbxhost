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
const renderMod = await import('../../ui/ui_render.mjs');
const icc = await import('../../ui/ui_input_cc.mjs');

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

step('⭐ the ONE LAW: bank mode shows the card; a knob touch PEEKS it; nothing else', () => {
    /* Josh, 2026-09-01: "every track bank should be visually active only
     * after clicking jog wheel... knob touches are the ONLY other thing that
     * shows the card — it just peeks the active one until knob is released."
     * The old transient bankSelectTick window is gone as a display driver;
     * it is what made cards appear outside the mode and the click read as a
     * fall-through. */
    rest(); S.activeBank = 1;
    S.bankSelectTick = S.tickCount;
    if (bankCardVisible()) throw new Error('the transient window revealed the card — only mode or peek may');
    S.bankSelectTick = -1; S.knobTouched = 3;
    if (!bankCardVisible()) throw new Error('a knob touch did not PEEK the card');
    S.knobTouched = -1;
    if (bankCardVisible()) throw new Error('the peek outlived the touch');
    S.bankCardLatched = true;
    if (!bankCardVisible()) throw new Error('bank mode itself does not show the card');
    S.bankCardLatched = false;
});

step('⭐ SESSION mirrors the grammar: click latches the mixer; the FX door is a GATEWAY bank', () => {
    /* Josh, 2026-09-01: master/send FX is never a click on a mixer bank — it
     * is a click-to-confirm bank at the end of the walk, the SOUND + CONFIG
     * idiom. And the walk itself only runs once the page is open. */
    rest(); S.sessionView = true; S.sessMixerLatched = false;
    cc(14, 1);
    if (S.sessKnobMode !== 0) throw new Error('a turn from the session overview walked the modes');
    click();
    if (!S.sessMixerLatched) throw new Error('session click did not latch the mixer');
    click();                                     /* click on VOLUME: a no-op */
    if (sndMod.soundActive()) throw new Error('a click on a mixer bank opened the FX list');
    if (!S.sessMixerLatched) throw new Error('the no-op click broke the latch');
    for (let i = 0; i < 4; i++) cc(14, 1);       /* walk to the gateway */
    if (S.sessKnobMode !== 4) throw new Error('the walk did not reach the gateway: ' + S.sessKnobMode);
    cc(14, 1);
    if (S.sessKnobMode !== 4) throw new Error('the walk went past the gateway');
    click();                                     /* the confirm */
    if (!sndMod.soundActive()) throw new Error('the gateway click did not enter the FX list');
    if (!sndMod.soundIsGlobal()) throw new Error('the gateway did not land in a global bus context');
    sndMod.soundExit();
    cc(14, 65);                                  /* left turn off the gateway */
    if (S.sessKnobMode !== 3) throw new Error('a left turn did not walk back to SEND B');
    cc(51, 127); cc(51, 0);                      /* Back dismisses the mixer */
    if (S.sessMixerLatched) throw new Error('Back did not dismiss the mixer');
    S.sessionView = false;
});

step('the gateway has no knobs — a knob turn there is inert', () => {
    rest(); S.sessionView = true;
    click();
    S.sessKnobMode = 4; S.sessVolLevel[0] = 0.5; S.sessVolSlots[0] = 1;
    sets.length = 0;
    cc(71, 3);                                   /* knob 1 turn */
    if (sets.length) throw new Error('a knob wrote through the gateway: ' + JSON.stringify(sets));
    cc(51, 127); cc(51, 0);
    S.sessionView = false;
});

step('⭐ a VIEW SWITCH leaves the bank view — each view opens on its overview', () => {
    /* Josh, 2026-09-01: "leaving the bank view on session or track should
     * make it so you start back on track/session overview oled." The
     * remembered bank survives; only the display law resets. */
    rest(); S.activeBank = 1;
    click();                                     /* latch the track bank view */
    if (!S.bankCardLatched) throw new Error('setup: no latch');
    cc(50, 127); cc(50, 0);                      /* Note/Session tap -> session view */
    if (!S.sessionView) throw new Error('setup: did not switch to session view');
    if (S.bankCardLatched) throw new Error('the track latch survived the switch');
    click();                                     /* latch the session mixer */
    if (!S.sessMixerLatched) throw new Error('setup: session click did not latch');
    cc(50, 127); cc(50, 0);                      /* back to track view */
    if (S.sessionView) throw new Error('setup: did not switch back');
    if (S.sessMixerLatched) throw new Error('the session latch survived the switch');
    if (bankCardVisible()) throw new Error('track view did not open on its overview');
    if (S.activeBank !== 1) throw new Error('the remembered bank was lost: ' + S.activeBank);
});

step('⭐ Back from a bus lands on the FX LIST, never the track prompt (the TRACK 0 bug)', () => {
    /* Josh, on device minutes after the gateway shipped: gateway -> Master ->
     * Back rendered "CLICK TO ENTER TRACK 0 SOUND & CONFIG" — the TRACK door
     * with S.track = -1. A bus must Back into the session FX list. */
    rest(); S.sessionView = true;
    click();                                     /* latch the mixer */
    S.sessKnobMode = 4;
    click();                                     /* the gateway: FX list opens */
    if (!sndMod.soundActive()) throw new Error('setup: list did not open');
    cc(3, 127); cc(3, 0);                        /* pick MASTER (row 0) */
    for (let i = 0; i < 4; i++) sndMod.soundTick();   /* the pick defers to tick */
    if (sndMod.soundViewForTest && sndMod.soundViewForTest() === 9)
        throw new Error('setup: the pick did not enter the bus (view 9)');
    cc(51, 127); cc(51, 0);                      /* Back */
    if (!sndMod.soundActive()) throw new Error('Back exited sound mode instead of the list');
    if (!sndMod.soundIsGlobal()) throw new Error('Back left the global context');
    if (sndMod.soundViewForTest && sndMod.soundViewForTest() !== 9)
        throw new Error('Back did not land on the FX list (view ' + sndMod.soundViewForTest() + ')');
    sndMod.soundExit();
    S.sessionView = false;
});

step('⭐ the session screens DRAW at the gateway — the mode-label crash regression', () => {
    /* A parallel 4-entry label array in drawMetroIndicator threw at
     * sessKnobMode=4 and killed the WHOLE session draw mid-frame — Josh saw
     * 'an incomplete session view... only the count-in indicator'. The
     * indicator reads the mode table now. Both screens must survive a draw
     * at the gateway: the latched page and, after Back, the overview. */
    const render = renderMod;
    rest(); S.sessionView = true;
    click(); globalThis.tick();
    if (!S.sessMixerLatched) throw new Error('setup: click did not latch');
    S.sessKnobMode = 4;                              /* the gateway */
    globalThis.clear_screen(); render.drawUI();      /* throws = fails the step */
    /* ⚠ Direct _onCCMsg dispatch: this step's subject is the DRAW crash, and
     * accumulated rig residue upstream in ui.js eats a full-path Back here —
     * the full path is proven by the SESSION-mirrors step above and by the
     * on-device probe. */
    icc._onCCMsg(51, 127); icc._onCCMsg(51, 0); globalThis.tick();
    if (S.sessMixerLatched) throw new Error('Back did not dismiss');
    globalThis.clear_screen(); render.drawUI();      /* the crash was HERE */
    S.sessionView = false; S.sessKnobMode = 0;
});

step('⭐⭐ S+C AS THE REMEMBERED BANK, at rest: overview, quiet jog touch, and the click LATCHES', () => {
    /* The reported bug (Josh, on device, 2026-09-01): with SOUND + CONFIG as
     * the track's remembered bank, "jog touch peeks and click falls through to
     * the bank". Mechanism: the unscoped tick invariant held sound mode open
     * at rest, so soundActive() defeated the click gate, and soundRender's
     * prompt still read the retired jog-touch/window drivers. The one law:
     * at rest the overview shows, jog touch shows NOTHING, and the click
     * opens bank mode on the gateway card. */
    rest();
    S.trackActiveBank[2] = 11; S.activeBank = 11;    /* BANK_SOUND */
    globalThis.tick(); globalThis.tick();
    if (sndMod.soundActive())
        throw new Error('the invariant re-opened sound mode AT REST — soundActive() true at idle');
    if (bankCardVisible()) throw new Error('card visible at rest');
    S.jogTouched = true;
    if (bankCardVisible() || sndMod.soundRender())
        throw new Error('jog touch showed the card — retired driver');
    S.jogTouched = false;
    click(); globalThis.tick(); globalThis.tick();   /* latch; invariant opens the gateway */
    if (!S.bankCardLatched) throw new Error('click fell through — bank mode did not latch');
    if (!sndMod.soundActive())
        throw new Error('bank mode did not open the remembered SOUND + CONFIG gateway');
    if (!sndMod.soundRender()) throw new Error('gateway card not drawn in bank mode');
    sndMod.soundExit(); rest(); S.trackActiveBank[2] = 0; S.activeBank = 0;
});

step('⭐⭐ MOVE-TRACK PARITY: same click, same Back law as a Schwung track', () => {
    /* The Front-2 gates were written on Schwung tracks (the brief's second
     * open bug). Same walk on a Move-routed track: click latches, the gateway
     * opens the MOVE flavour, click enters the menu, and Back steps menu ->
     * gateway card -> overview — never straight out. Before the Back-law fix,
     * a Move track's menu-top Back went through leaveBus's soundExit and threw
     * you out of sound AND bank mode where a Schwung track stepped to the card. */
    rest();
    S.trackRoute[2] = 1;                             /* Move-routed */
    S.trackActiveBank[2] = 11; S.activeBank = 11;
    globalThis.tick(); globalThis.tick();
    if (sndMod.soundActive()) throw new Error('move flavour open at rest — one law violated');
    click(); globalThis.tick(); globalThis.tick();
    if (!S.bankCardLatched || !sndMod.soundActive())
        throw new Error('click did not open the gateway on a Move track');
    click(); globalThis.tick();                      /* gateway card -> menu */
    cc(51, 127); cc(51, 0); globalThis.tick();       /* menu top -> gateway card */
    if (!sndMod.soundActive())
        throw new Error('menu-top Back EXITED sound mode on a Move track — the divergence');
    if (!S.bankCardLatched) throw new Error('menu-top Back dropped bank mode');
    if (!sndMod.soundRender()) throw new Error('the gateway card is not what Back landed on');
    cc(51, 127); cc(51, 0); globalThis.tick();       /* card -> overview, mode down */
    if (sndMod.soundActive()) throw new Error('Back from the card did not close the gateway');
    if (S.bankCardLatched) throw new Error('Back from the card did not exit bank mode');
    S.trackRoute[2] = 0; rest(); S.trackActiveBank[2] = 0; S.activeBank = 0;
});

step('⭐ a menu entered OUTSIDE bank mode Backs out of sound mode — no invisible prompt', () => {
    /* The Shift+Note destination gesture opens the menu with no card above it.
     * Its top-level Back must leave sound mode entirely: stepping to the
     * prompt instead would park soundActive() true behind the overview (the
     * one law hides the card there) and re-arm the click-falls-through bug. */
    rest();
    sndMod.soundEnter(2, 2); sndMod.soundShowMenu();
    if (!sndMod.soundActive()) throw new Error('setup: gesture menu did not open');
    if (S.bankCardLatched) throw new Error('setup: gesture entry latched bank mode');
    cc(51, 127); cc(51, 0); globalThis.tick();
    if (sndMod.soundActive())
        throw new Error('menu-top Back outside bank mode left sound mode open (invisible prompt)');
    rest(); S.activeBank = 0; S.trackActiveBank[2] = 0;
});

step('⭐ Back from the SESSION FX LIST lands the gateway card, still in bank mode', () => {
    /* The Back law, session flavour (the brief\'s CHECK item): the gateway
     * click is the one door into the bus list, so its Back must land back on
     * the gateway CARD — session view with the mixer latch still on and the
     * knob mode still the gateway — never the resting overview. */
    rest(); S.sessionView = true;
    click(); globalThis.tick();                      /* latch the mixer page */
    if (!S.sessMixerLatched) throw new Error('setup: click did not latch');
    S.sessKnobMode = 4;                              /* walk to the gateway */
    click(); globalThis.tick();                      /* enter the FX list */
    if (!sndMod.soundActive()) throw new Error('setup: gateway click did not open the FX list');
    /* Full-path Back: sound mode's own hook must consume it (direct _onCCMsg
     * would bypass soundOnCC and prove nothing about the list's Back). */
    cc(51, 127); cc(51, 0); globalThis.tick();
    if (sndMod.soundActive()) throw new Error('Back did not leave the FX list');
    if (!S.sessMixerLatched)
        throw new Error('Back dropped bank mode — landed the overview, not the gateway card');
    if (S.sessKnobMode !== 4) throw new Error('Back walked off the gateway (mode ' + S.sessKnobMode + ')');
    S.sessionView = false; S.sessKnobMode = 0; rest();
});

step('⭐ a jog click DURING a knob peek is a deliberate no-op on a bank with no click meaning', () => {
    /* A hand resting on a knob must not latch bank mode by brushing the jog
     * (review finding: this was unspecified). Bank 2 (melodic) has no
     * alt-params and no per-bank click meaning. */
    rest(); S.activeBank = 2;
    S.knobTouched = 3;                               /* the peek */
    if (!bankCardVisible()) throw new Error('control: peek not visible');
    click();
    if (S.bankCardLatched) throw new Error('a peek click latched bank mode');
    S.knobTouched = -1;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
