
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_sound_bank_jog.mjs — SOUND + CONFIG is the bank past the last
 * clip bank on the jog.
 *
 * Josh, 2026-08-23: "add a new bank to all tracks that mirrors the track editor
 * menu called Sound & Config. When you land on the menu, continuing to scroll
 * scrolls through the track editor menu, jog click/back works like before. When
 * at the top level of the menu, scrolling left beyond the top level scrolls to
 * the preceding clip bank." Non-persisted; Conductor tracks excluded.
 *
 * Both halves fail SILENTLY: a right turn past AUTOMATION that does nothing is
 * indistinguishable from the clamp it replaced, and a left turn at the top of
 * the menu that clamps is exactly what the menu did before. So this drives
 * `globalThis.onMidiMessageInternal` + the real tick, and asserts the VIEW
 * changed, in both directions, for melodic and drum cycles — and does NOT for a
 * Conductor track.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';   /* dbx_state_subdir.h's answer */
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
/* ⚠⚠ tick() swallows errors — a missing binding silently kills every later
 * stage, including the deferred sound-mode entry this file is about. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { computePadNoteMap } = await import('../../ui/ui_drummodel.mjs');
const constsMod = await import('../../ui/ui_constants.mjs');
const ledsMod = await import('../../ui/ui_leds.mjs');
const ifMod = await import('/data/UserData/schwung/shared/input_filter.mjs');
const persistMod = await import('../../ui/ui_persistence.mjs');
const bridgeMod = await import('../../ui/ui_dsp_bridge.mjs');
const pureMod = await import('../../ui/ui_pure.mjs');
const { PAD_MODE_DRUM, PAD_MODE_CONDUCT, PAD_MODE_MELODIC_SCALE, BANK_WHEN, BANK_SOUND, BANK_STEP } = constsMod;
/* The melodic walk's stop before SOUND + CONFIG: SEQ ARP, the last FX bank
 * (categories, 2026-09-26). Drum's is still STEP. */
const MEL_BEFORE_SOUND = 4;

const send  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0x90, d1, d2]));
/* ⚠ A jog turn in TRACK VIEW is TOUCH, turn, then CLICK or RELEASE — the turn
 * opens the bank picker and either gesture applies the selection. A test that
 * sends the CC alone leaves the gesture unfinished and nothing lands.
 * (Inside sound mode the jog is that screen's own — the picker never opens, the
 * click drives the row under the cursor, and this helper is not used for it.)
 * MoveMainTouch is note 9; the jog click is CC 3. */
const turn  = (d) => {
    note(9, 127);
    send(14, d > 0 ? 1 : 127);
    globalThis.tick();
    if (S.bankPickerSel >= 0) { send(3, 127); send(3, 0); globalThis.tick(); }
    note(9, 0);
    globalThis.tick();
};
const right = () => turn(1);
const left  = () => turn(-1);
/* ⭑ The jog TURN no longer walks the banks (Josh, 2026-10-04: "retire jog to
 * switch banks and the bank column overlay"): a bank is reached by the bank
 * map — hold the jog, tap its pad, let go. The sound banks' entry and exit
 * ride the same commit (applyBankPick) the walk used. */
const pickBank = (b) => {
    const pm = S.trackPadMode[S.activeTrack];
    let pad = -1;
    for (let c = 0; c < 4 && pad < 0; c++) for (let r = 0; r < 4; r++)
        if (pureMod.bankPadMapCellAt(pm, S.activeTrack, c, r) === b) { pad = pureMod.bankMapPadForCell(c, r); break; }
    if (pad < 0) throw new Error('bank ' + b + ' is not on the map');
    send(3, 127); note(pad, 100); globalThis.onMidiMessageInternal(new Uint8Array([0x80, pad, 0])); send(3, 0);
    globalThis.tick(); snd.soundTick();
};

function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* Walk the menu cursor to its top row with left turns, asserting each one
 * stays INSIDE sound mode. Entry lands on the GENERATOR row (the block you
 * most likely came to edit), not row 0, so "the top" is a place to reach, not
 * the place you start. */
/* ⚠ Walks the MENU's cursor to its top row. It must therefore BE in the menu:
 * on the bank's prompt a left turn walks BANKS and leaves sound mode, which is
 * the respec, not a fault. Callers arriving by the bank open the door first —
 * this does it for them so every call site does not have to remember. */
function openMenuIfPrompt() {
    if (!snd.soundActive()) return;
    /* view 18 = the MIX card, no door since 2026-09-26: the menu opens as
     * Shift+Note's tap opens it, over the bank. */
    if (snd.soundPickStateForTest().view === 18) {
        snd.soundShowMenu(); globalThis.tick(); snd.soundTick();
    }
}
function toTop() {
    openMenuIfPrompt();
    for (let guard = 0; guard < 16; guard++) {
        if (snd.soundPickStateForTest().row === 0) return;
        left();
        if (!snd.soundActive()) throw new Error('left turn BELOW the top row exited sound mode');
    }
    throw new Error('never reached the top row');
}

function reset(mode, bank) {
    if (snd.soundActive()) snd.soundExit();
    S.sessionView = false; S.globalMenuOpen = false;
    S.ledInitComplete = true;          /* the deferred entry lives past LED init */
    S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
    S.loopHeld = false; S.shiftHeld = false;
    for (let t = 0; t < 8; t++) S.trackRoute[t] = 0;
    S.activeTrack = 2;
    S.trackPadMode[2] = mode;
    S.activeBank = bank; S.trackActiveBank[2] = bank;
    /* Josh, 2026-09-01: the jog only drives banks INSIDE the bank view — this
     * file's domain — so every step enters it the way the click would. */
    S.bankCardLatched = true;
    /* LED paths read bankParams, which init() builds on-device only */
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 11 }, () => new Array(8).fill(0)));
    S.bankSelectTick = -1; S.jogTouched = false;
}

step('control: a turn from CLIP walks no bank (retired 2026-10-04)', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    right();
    if (S.activeBank !== 0) throw new Error('the turn walked: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('entered sound mode from CLIP');
});

step('⭑ melodic: a map pick of MIX enters it', () => {
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);
    if (!snd.soundActive()) throw new Error('sound mode did not open');
    /* The screen IS a bank (Josh, 2026-08-23) and it RECORDS ITSELF like every
     * other one (Josh, 2026-08-25): activeBank takes the BANK_SOUND identity so
     * every bank-keyed behaviour runs its standard branch, AND trackActiveBank
     * takes it too — that write is the whole fix. (No origin crumb since
     * Since 2026-09-24: nothing but the walk moves the bank, so there is nothing to
     * come back to.) */
    if (S.activeBank !== BANK_SOUND) throw new Error('activeBank did not take the sound identity: ' + S.activeBank);
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('the bank did not record itself: ' + S.trackActiveBank[2]);
});

step('⭑⭑ ...and a turn on MIX walks no bank; sound mode declines it', () => {
    snd.soundTick();
    left();
    if (S.activeBank !== BANK_SOUND) throw new Error('the turn walked off MIX: ' + S.activeBank);
});

step('⚠ CONTROL: the MIX click opens nothing; the CONFIG click opens the menu, and then the jog walks ROWS', () => {
    /* The other half. Without this the step above passes on a build where the
     * jog is declined because the menu is unreachable at all. */
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);               /* onto MIX -> its card */
    snd.soundTick();
    send(3, 127); send(3, 0);
    globalThis.tick(); snd.soundTick();
    if (snd.soundPickStateForTest().view !== 18) throw new Error('the MIX click opened view ' + snd.soundPickStateForTest().view);
    /* CONFIG is a door since 2026-10-03 (off the walk): put the bank there, the
     * card locked, and let the tick open it as it opens a restored bank. */
    reset(PAD_MODE_MELODIC_SCALE, constsMod.BANK_CONFIG);
    globalThis.tick(); snd.soundTick(); globalThis.tick(); snd.soundTick();
    send(3, 127); send(3, 0);           /* the CONFIG card's door */
    globalThis.tick(); snd.soundTick();
    if (snd.soundPickStateForTest().view !== 0) throw new Error('the CONFIG click did not open the menu: ' + snd.soundPickStateForTest().view);
    const r0 = snd.soundPickStateForTest().row;
    right();
    const r1 = snd.soundPickStateForTest().row;
    if (r1 <= r0) throw new Error('inside the menu the cursor did not move: ' + r0 + ' -> ' + r1);
    if (S.activeBank !== 16)
        throw new Error('the identity was lost underneath: ' + S.activeBank);
});

step('⭑ the MENU top edge CLAMPS; Back exits to the CARD; a map pick leaves', () => {
    /* Josh, 2026-09-01: "scrolling past the top should no longer jump to the
     * previous card. that menu is now exited by pressing back, which lands
     * you on the sound+config card." The card then hands the jog back to the
     * bank walk, so a left there leaves the way any bank does. */
    toTop();
    left();
    if (!snd.soundActive()) throw new Error('the menu top edge EXITED — it must clamp now');
    if (snd.soundPickStateForTest().row !== 0) throw new Error('the clamp moved the cursor');
    send(51, 127); send(51, 0); globalThis.tick();     /* Back */
    if (!snd.soundActive()) throw new Error('Back left sound mode — it must land on the card');
    /* The menu was opened from the CONFIG card (the step above), so Back lands
     * on THAT card — 24, VIEW_CFGCARD. */
    if (snd.soundViewForTest() !== 24)
        throw new Error('Back did not land on the card (view ' + snd.soundViewForTest() + ')');
    /* (CONFIG is a door: the map does not open over its screen. Leave it the
     * way a real session does — from a bank — then pick on.) */
    reset(PAD_MODE_MELODIC_SCALE, BANK_SOUND); S.pendingSoundEnterTrack = 2; globalThis.tick(); snd.soundTick();
    pickBank(5); globalThis.tick();
    if (S.activeBank !== 5) throw new Error('the pick did not land on LIVE ARP: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('picking LIVE ARP did not leave sound mode');
    pickBank(constsMod.BANK_MACROS); globalThis.tick();
    if (S.activeBank !== 13) throw new Error('the pick did not land on MACROS: ' + S.activeBank);
    pickBank(BANK_STEP); globalThis.tick();
    if (snd.soundActive()) throw new Error('picking on from MACROS did not leave sound mode');
    if (S.activeBank !== BANK_STEP) throw new Error('the pick did not land on STEP: ' + S.activeBank);
});

step('⭑ drum: a map pick of MIX enters too; a pick of DELAY leaves', () => {
    reset(PAD_MODE_DRUM, 3);
    pickBank(BANK_SOUND);
    if (!snd.soundActive()) throw new Error('sound mode did not open on a drum track');
    snd.soundTick();
    pickBank(3); globalThis.tick();
    if (snd.soundActive()) throw new Error('the pick did not leave on a drum track');
    if (S.activeBank !== 3) throw new Error('did not land on DELAY: ' + S.activeBank);
});

step('⚠ conductor: the cycle ends at TIMING — no sound-mode bank', () => {
    reset(PAD_MODE_CONDUCT, BANK_WHEN);
    right();
    if (snd.soundActive()) throw new Error('a Conductor track entered sound mode from the jog');
    if (S.activeBank !== BANK_WHEN) throw new Error('bank moved: ' + S.activeBank);
});

step('⚠ a deferred entry still SHOWS, and a turn does not walk off it', () => {
    /* The deferred entry the walk queues AFTER recording the bank (2026-09-24):
     * the track is already on SOUND + CONFIG when it lands. */
    reset(PAD_MODE_MELODIC_SCALE, BANK_SOUND);
    S.pendingSoundEnterTrack = 2; globalThis.tick(); snd.soundTick();
    if (!snd.soundActive()) throw new Error('control: deferred entry did not open');
    /* This entry has NO jog behind it, so soundEnter itself must arm the
     * display window — without that the screen yields to the overview on the
     * very first frame and the entry appears to do nothing. (The jog entry path
     * arms it at the CC site too, which masked this once.) */
    if (!snd.soundRender()) throw new Error('the deferred entry did not show the screen');
    /* ⚠⚠ REWRITTEN 2026-08-28. This used to walk the MENU to its top row and
     * leave with one more left turn, landing on the ORIGIN bank — because the
     * bank was the menu. The bank is a DOOR now: its prompt hands the jog
     * straight to the bank walk, so leaving is the ordinary cycle step to
     * AUTOMATION. Returning to the ORIGIN is BACK's job, asserted below. */
    left();
    if (S.activeBank !== BANK_SOUND)
        throw new Error('the turn walked off the bank: ' + S.activeBank);
});

step('⭑ and BACK from the prompt leaves BANK MODE and keeps the bank (2026-09-03: "Back never changes which bank you are on")', () => {
    /* ⚠ Rewritten 2026-09-03. Back used to hand the bank to its origin crumb,
     * which Josh saw as the knobs changing mode on the way out. Now Back only
     * unlatches: the track stays on SOUND + CONFIG, the mode stays open
     * RESTING (the overview shows, the knobs are the levels). */
    reset(PAD_MODE_MELODIC_SCALE, BANK_SOUND);          /* on the bank (2026-09-24) */
    S.pendingSoundEnterTrack = 2; globalThis.tick(); snd.soundTick();
    if (!snd.soundActive()) throw new Error('control: deferred entry did not open');
    send(51, 127); send(51, 0); globalThis.tick(); snd.soundTick();
    if (S.bankCardLatched) throw new Error('Back did not leave bank mode');
    if (!snd.soundOpen() || snd.soundActive()) throw new Error('the mode should stay open, RESTING');
    if (S.activeBank !== BANK_SOUND)
        throw new Error('Back changed the bank: ' + S.activeBank);
});

step('⚠ RETIRED 2026-09-03: the old AUTO bank 6 is OFF the walk (the AUTOMATION bank replaces it), so its grey pad coloring cannot be reached from the jog', () => {
    const { bankCycleForMode } = pureMod;
    if (bankCycleForMode(PAD_MODE_MELODIC_SCALE).indexOf(6) >= 0) throw new Error('bank 6 is back on the walk');
});

step('⭑⭑ the TOP LEVEL keeps THE ONE LAW: bank mode or knob peek, never otherwise', () => {
    /* The prompt IS the SOUND + CONFIG card, so it obeys the one law (Josh,
     * 2026-09-01): visible iff bank mode is on or a knob peeks. The retired
     * drivers — jog touch, the transient bankSelectTick window — must NOT
     * bring it back; they were the "jog touch peeks the card" half of the
     * S+C-as-active-bank bug. Sound mode stays ACTIVE underneath a stand-down.
     * Every branch here fails silently on device (a card that never yields
     * just looks like the old behaviour). */
    const jogTouch   = (on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, 9, on ? 127 : 0]));
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);                /* enter MIX, the page held */
    if (!snd.soundActive()) throw new Error('did not enter');
    snd.soundTick();
    if (!S.bankCardLatched) throw new Error('control: not in bank mode after the walk');
    if (!snd.soundRender()) throw new Error('card not shown in bank mode');
    /* Bank mode down: the card yields to the overview — and stays down however
     * long the retired window would have run. */
    S.bankCardLatched = false;
    if (snd.soundRender()) throw new Error('card shown outside bank mode');
    if (!snd.soundOpen()) throw new Error('yielding must not EXIT sound mode');
    S.tickCount += 200; globalThis.tick();
    if (snd.soundRender()) throw new Error('card came back with no driver at all');
    /* Jog touch is a display driver again, behind the Jog Touch Card switch
     * (Josh, 2026-09-30, default On): it SHOWS the card while held and is not
     * bank mode; with the switch Off it shows nothing (the 2026-08-31 law). */
    S.jogTouchCardOn = true;
    jogTouch(true);
    if (!S.jogTouched) throw new Error('control: jog touch not tracked');
    if (!snd.soundRender()) throw new Error('jog touch (switch On) did not show the card');
    if (S.bankCardLatched) throw new Error('jog touch LATCHED bank mode — it only shows');
    jogTouch(false);
    if (snd.soundRender()) throw new Error('the card outlived the jog touch');
    S.jogTouchCardOn = false;
    jogTouch(true);
    if (snd.soundRender()) throw new Error('jog touch showed the card with the switch Off');
    jogTouch(false);
    S.jogTouchCardOn = true;
    /* The transient window (armed by a dozen actions) is retired as a display
     * driver too: arm it directly and the card must stay down. */
    S.bankSelectTick = S.tickCount;
    if (snd.soundRender()) throw new Error('bankSelectTick showed the card — retired driver');
    S.bankSelectTick = -1;
    /* A knob touch PEEKS the card; release stands it down. */
    S.knobTouched = 0;
    if (!snd.soundRender()) throw new Error('knob touch did not peek the card');
    S.knobTouched = -1;
    if (snd.soundRender()) throw new Error('knob release did not stand the peek down');
    /* Back in bank mode for the menu half below. */
    S.bankCardLatched = true;
    if (!snd.soundRender()) throw new Error('card did not return with bank mode');
    /* ⭑⭑ THE MENU DOES NOT YIELD — Josh, 2026-08-28: "it's not a bank". The
     * display law belongs to the bank, and after the respec the only thing here
     * that IS one is the prompt. A menu you deliberately clicked into stays up
     * until it is dismissed; it would be perverse for it to vanish because you
     * stopped touching the jog.
     * ⚠ This assertion is the whole reason the split exists, and nothing else
     * would catch its loss: a menu that yields looks exactly like the old
     * behaviour, which is what it WAS one commit ago. */
    snd.soundTick();
    send(3, 127); send(3, 0); globalThis.tick(); snd.soundTick();   /* prompt -> menu */
    S.tickCount += 200; globalThis.tick();
    if (S.bankSelectTick >= 0) throw new Error('control: the display window did not expire');
    if (!snd.soundRender())
        throw new Error('the MENU yielded to the overview — it is not a bank, it stays until ' +
                        'dismissed');
    /* And deeper still never yields either: open a row and re-check. */
    send(3, 127); send(3, 0); snd.soundTick(); globalThis.tick();
    S.tickCount += 200; globalThis.tick();
    if (snd.soundPickStateForTest && snd.soundActive()) {
        if (!snd.soundRender()) throw new Error('a sub-screen yielded to the overview');
    }
    snd.soundExit();
});

step('⭑⭑ the bank RECORDS ITSELF: sidecar write + Shift+jog track switch', () => {
    /* ⚠ This step pinned the OPPOSITE until 2026-08-25 ("the identity NEVER
     * persists"). That rule is what made SOUND + CONFIG the one bank in the walk
     * that never wrote itself down: trackActiveBank stayed on the bank you came
     * through — always AUTOMATION, the only neighbour — and the exit restore,
     * the co-run landing and "banks land somewhere I did not leave them" all
     * read that stale value. Josh ruled it records itself, like all the others. */
    const { writeSidecar } = persistMod;
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);                /* enter from STEP */
    if (!snd.soundActive() || S.activeBank !== BANK_SOUND)
        throw new Error('control: not in sound mode with the identity on');
    let tab = null;
    globalThis.host_write_file = (path, body) => {
        if (String(path).indexOf('ui-state') >= 0) { try { tab = JSON.parse(body).tab; } catch (e) {} }
        return true;
    };
    S.currentSetUuid = 'testuuid';
    writeSidecar();
    globalThis.host_write_file = () => true;
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('sidecar sync dropped the recorded bank: ' + S.trackActiveBank[2]);
    if (!tab || tab[2] !== BANK_SOUND)
        throw new Error('BANK_SOUND did not reach the sidecar: ' + (tab ? tab[2] : 'no tab'));
    /* Shift+jog switches tracks with sound mode open. RULED 2026-08-24 (Josh):
     * SOUND + CONFIG is a BANK and a bank is per-track, so this gesture CLOSES
     * it and the new track lands on its OWN bank — it does NOT follow.
     * (Until then the reconcile re-took the identity on every step, so each
     * track scrolled onto reported SOUND + CONFIG.) ⭑ LEAVING remembers: the
     * outgoing track stays RECORDED on SOUND + CONFIG, which is what the rest of
     * this step is for — switch back and its screen is there again.
     *
     * ⚠ The follow itself is NOT retired — it still runs for the other switch
     * sites (Shift+pad, session launchers, remote UI). Only this route exits. */
    S.trackActiveBank[3] = 2;
    send(49, 127);                        /* shift down */
    send(14, 1); globalThis.tick();       /* track 2 -> 3 */
    send(49, 0);
    if (S.activeTrack !== 3) throw new Error('control: track did not switch');
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('leaving forgot the bank on track 2: ' + S.trackActiveBank[2]);
    /* ⭑ (Josh, 2026-09-24/25): the SOUND + CONFIG CARD is the track's
     * BANK, so a switch from it shows the NEW track's own bank — the card does
     * not follow (only a screen you are IN, the menu or an editor, does).
     * Track 3 is on bank 2; track 2 keeps SOUND + CONFIG because the jog put it
     * there. */
    if (S.activeBank !== 2) throw new Error('track 3 is not on its own bank: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('the SOUND + CONFIG card followed onto a track on bank 2');
    if (S.trackActiveBank[3] !== 2)
        throw new Error('track 3 was recorded on ' + S.trackActiveBank[3] + ', not its own bank 2');
    snd.soundExit();
});

step('⭑ BACK lands on the bank you CAME FROM — same as the jog\'s left turn', () => {
    /* ⚠⚠ REWRITTEN 2026-08-26. This used to assert the opposite: Josh ruled on
     * 2026-08-25 that "back inside a bank should always go to the default bank",
     * and this step pinned Back (default) as DIFFERENT from the jog (origin).
     * He RETIRED that on 2026-08-26 — "we can get rid of the back goes to
     * default bank entirely" — having lived with the gesture return, which lands
     * you where you pressed. Two ways out that disagreed about where "out" is
     * was the thing that felt wrong.
     *
     * So the two exits are now the SAME law, and that sameness is what is pinned
     * here: whichever way you leave, you land on the bank you came from. Driven
     * through the real CC — MoveBack is 51 — so this proves dispatch, not
     * spelling. */
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);                      /* enter from SEQ ARP */
    if (!snd.soundActive()) throw new Error('control: did not enter sound mode');
    send(51, 127); send(51, 0); globalThis.tick();
    /* ⚠ 2026-09-03: Back KEEPS the bank (unlatches; the mode rests). The
     * jog's left turn is the way to the bank you came from. */
    if (S.bankCardLatched) throw new Error('Back did not leave bank mode');
    if (S.activeBank !== BANK_SOUND || S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('Back changed the bank: ' + S.activeBank + '/' + S.trackActiveBank[2]);

    /* ...and the jog agrees, which is now the point rather than the contrast.
     * The jog's exit lives on the CARD now (the menu clamps, 2026-09-01). */
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);
    snd.soundTick();
    pickBank(MEL_BEFORE_SOUND); globalThis.tick();     /* the map: back to SEQ ARP */
    if (snd.soundActive()) throw new Error('control: the pick off MIX did not exit');
    if (S.activeBank !== MEL_BEFORE_SOUND)
        throw new Error('the pick landed on ' + S.activeBank + ', not SEQ ARP');
    /* ⭑ AND IT MUST ARM THE DISPLAY WINDOW, like every other bank change on the
     * walk. Josh, on hardware 2026-08-26: "scrolling back from the top of the
     * sound+config bank goes right to the bank before it and does not
     * immediately show the picker overlay like it should."
     * This exit was the ONE silent arrival on the whole jog walk — every other
     * bank change calls armBankDisplay(), this branch returned early without it,
     * so you landed on a page with nothing naming the bank you had reached.
     * ⚠ The observable is bankSelectTick, which armBankDisplay stamps with the
     * current tick; -1 is "no window". Asserting the OVERLAY rather than the
     * bank is the point — landing on the right bank silently was the bug. */
    if (S.bankSelectTick < 0)
        throw new Error('the jog exit did not arm the bank display — it lands on the bank ' +
                        'silently, with no picker overlay naming where you arrived');
    S.activeBank = 0;
});

step('⭑ NOTE/SESSION is a LEAVE: the view toggle must not reset the track\'s bank', () => {
    /* Josh, 2026-08-25: "note/session should always jump to session view from
     * track view without resetting the track's current bank place. right now,
     * pressing it in sound+config jumps to the first bank."
     *
     * The press flips S.sessionView directly; tick's reconcile then ends sound
     * mode because the view it was called from is gone. That end is a LEAVE, not
     * a close — the track comes WITH you, so it stays recorded on the bank and
     * the screen is back when you return. A close would move it off SOUND +
     * CONFIG, which is the reset he saw. MoveNoteSession is CC 50.
     * ⚠ 2026-08-26: a close now lands on the bank you came FROM rather than the
     * default, but this step is unaffected — it is about LEAVE vs CLOSE, not
     * about which bank a close picks.
     *
     * ⚠ The unshifted button used to be a CLOSER — "the way out from any depth"
     * — so it never reached the view toggle at all, which is why the bank moved
     * and the view did not. Retired 2026-08-25; Shift+Note/Session is still the
     * one-press way out. That is the half this step would fail on if it came
     * back: the first assertion is that the VIEW actually changed. */
    const noteSession = () => { send(50, 127); globalThis.tick(); send(50, 0); globalThis.tick(); };

    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);                      /* into MIX */
    if (!snd.soundActive()) throw new Error('control: did not enter sound mode');

    /* ⚠⚠ REWRITTEN by Josh's ESCAPE LAW (2026-09-02): from a non-overview state
     * the button no longer switches views at all — it returns you to the
     * overview of the view you are IN. So the FIRST press leaves sound mode and
     * stays in track view; the SECOND, now at rest, is the view switch this
     * step was originally written around. The 08-25 substance is untouched and
     * is still what this step exists to prove: neither press may RESET the
     * track's bank place. (That is why the escape leaves with {leaving:true}.) */
    /* ⚠ 2026-09-30: the escape now lands on the SESSION overview (Josh:
     * "note/session should ALWAYS send you to session view") — which is the
     * 08-25 ask again. One press leaves sound mode for session view, and must
     * not reset the bank place. */
    noteSession();                             /* escape -> session overview */
    if (!S.sessionView) throw new Error('the escape did not go to session view');
    if (snd.soundActive()) throw new Error('the escape did not leave sound mode');
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('the view change RESET the bank to ' + S.trackActiveBank[2] +
                        (S.trackActiveBank[2] === 0 ? " — Josh's report" : ''));

    S.bankSelectTick = -1;
    noteSession();                             /* -> back to track view */
    if (S.sessionView) throw new Error('control: did not switch back to track view');
    /* ⭑⭑ THE ONE LAW (Josh, 2026-09-01) rewrote the second half of this step:
     * a view switch dismisses bank mode, so the return lands AT REST — the
     * screen must NOT re-open there (holding it open is what defeated the jog
     * click's !soundActive() gate). LEAVE vs CLOSE still holds: the bank stays
     * RECORDED, and bank mode re-opens exactly where you left it. */
    if (snd.soundActive())
        throw new Error('the screen re-opened at rest — the one law says overview');
    if (S.activeBank !== BANK_SOUND) throw new Error('came back on bank ' + S.activeBank);
    /* A knob touch peeks the recorded MIX page again (no click locks a page
     * since 2026-10-04): the mode is open at rest and shows on the touch. */
    if (!snd.soundOpen()) throw new Error('the recorded MIX is not open at rest');
    S.knobTouched = 0;
    if (!snd.soundRender()) throw new Error('a knob touch did not peek the recorded MIX page');
    S.knobTouched = -1;
    snd.soundExit();
    S.bankCardLatched = false;
    S.activeBank = 0;

    /* ...and an ORDINARY bank survives the same round trip, which it always did
     * — the positive control that says this step can tell the two apart. */
    reset(PAD_MODE_MELODIC_SCALE, 3);
    noteSession();
    noteSession();
    if (S.activeBank !== 3 || S.trackActiveBank[2] !== 3)
        throw new Error('an ordinary bank did not survive the view round trip: ' +
                        S.activeBank + '/' + S.trackActiveBank[2]);
});

step('⭑⭑ THE FIX, end to end: a track left on SOUND + CONFIG comes back on it', () => {
    /* Josh, 2026-08-24/25 — symptom (c) of STATE ON EXIT: "banks land somewhere
     * I did not leave them." The whole chain in one step, because each half
     * passed on its own while the feature stayed broken: the bank records
     * itself -> the sidecar carries it -> the restore keeps it (the old clamp
     * was 0-7, so a persisted 11 loaded SILENTLY as 0) -> the tick invariant
     * re-opens the screen, because BANKS[11] is a stub that draws nothing. */
    const { writeSidecar } = persistMod;
    reset(PAD_MODE_MELODIC_SCALE, MEL_BEFORE_SOUND);
    pickBank(BANK_SOUND);                      /* enter MIX */
    if (!snd.soundActive()) throw new Error('control: did not enter sound mode');

    let body = null;
    globalThis.host_write_file = (path, b) => {
        if (String(path).indexOf('ui-state') >= 0) body = b;
        return true;
    };
    S.currentSetUuid = 'testuuid';
    writeSidecar();
    globalThis.host_write_file = () => true;
    if (!body) throw new Error('control: no sidecar was written');
    if (JSON.parse(body).tab[2] !== BANK_SOUND)
        throw new Error('the bank did not reach the sidecar: ' + JSON.parse(body).tab[2]);

    /* Quit and relaunch: sound mode closed, banks blank, then the sidecar back. */
    snd.soundExit();
    for (let t = 0; t < 8; t++) { S.trackActiveBank[t] = 0; }
    S.activeBank = 0;
    globalThis.host_file_exists = (path) => String(path).indexOf('ui-state') >= 0;
    globalThis.host_read_file = (path) => (String(path).indexOf('ui-state') >= 0 ? body : '');
    bridgeMod.restoreUiSidecar(false);
    globalThis.host_file_exists = () => false;
    globalThis.host_read_file = () => '';

    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('the restore dropped the bank (got ' + S.trackActiveBank[2] +
                        (S.trackActiveBank[2] === 0 ? ' — the old 0-7 clamp' : '') + ')');
    if (S.activeBank !== BANK_SOUND)
        throw new Error('the live mirror did not take it: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('control: the restore should not open screens itself');

    /* ...and the SCREEN follows on the tick, silently — arriving by load is not
     * a bank gesture, so the display window must stay shut. */
    S.bankSelectTick = -1;
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
    globalThis.tick();
    if (!snd.soundActive())
        throw new Error('the bank came back but the screen did not — BANKS[11] draws nothing');
    if (S.bankSelectTick >= 0)
        throw new Error('the return opened the bank display window (tick ' + S.bankSelectTick + ')');
    snd.soundExit();
    S.activeBank = 0;
});

step('⚠ a hand-edited sidecar bank outside the walk still falls back to CLIP', () => {
    /* The clamp gained ONE legal value, not a hole. */
    for (let t = 0; t < 8; t++) S.trackActiveBank[t] = 0;
    const body = JSON.stringify({ v: 9, at: 2, tab: [0, 0, 9, 12, -1, 0, 0, 0] });
    globalThis.host_file_exists = (path) => String(path).indexOf('ui-state') >= 0;
    globalThis.host_read_file = (path) => (String(path).indexOf('ui-state') >= 0 ? body : '');
    bridgeMod.restoreUiSidecar(false);
    globalThis.host_file_exists = () => false;
    globalThis.host_read_file = () => '';
    if (S.trackActiveBank[2] !== 0 || S.trackActiveBank[3] !== 0 || S.trackActiveBank[4] !== 0)
        throw new Error('an out-of-range bank survived the clamp: ' + S.trackActiveBank.join(','));
    S.activeBank = 0;
});

/* ── the SESSION FX bank: the same idea, one view over ──────────────────────
 *
 * Josh, 2026-08-24: "can we have a master/send effects bank on session view
 * after the mixer items that works like the track view sound/config bank?"
 *
 * The screen already existed (Shift+Note/Session opened it); what it lacked was
 * a POSITION on the jog. So it is the same three-part contract as SOUND + CONFIG
 * — reachable one step past the last mixer mode, steps back out from its top
 * row, and obeys the banks' display law — and it is tested as that contract
 * rather than as a new screen. */
function sessReset() {
    if (snd.soundActive()) snd.soundExit();
    S.globalMenuOpen = false;
    S.ledInitComplete = true;
    S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
    S.loopHeld = false; S.shiftHeld = false; S.perfViewLocked = false;
    S.sessionView = true;
    S.sessKnobMode = 0;
    S.knobTouched = -1; S.jogTouched = false; S.bankSelectTick = -1;
    S.bankCardLatched = false;
    S.touchedIdx = -1;
}

step('control: a turn on the session overview walks no mixer mode (retired 2026-10-04)', () => {
    sessReset();
    right();
    if (S.sessKnobMode !== 0) throw new Error('the turn walked the mixer mode: ' + S.sessKnobMode);
    if (snd.soundActive()) throw new Error('opened the FX list from the mixer');
});

step('⭑ the list, once OPEN, still steps back out to the mixer at its top row', () => {
    /* The list screen survives (leaveBus lands there; the overlay commits
     * through it) — opened directly now that the turn door is gone. */
    sessReset();
    S.sessKnobMode = 3;
    snd.soundEnterBuses();
    if (!snd.soundActive()) throw new Error('control: the list is not open');
    left();
    if (snd.soundActive()) throw new Error('the top row did not step back out');
    if (S.sessKnobMode !== 3)
        throw new Error('landed on mixer mode ' + S.sessKnobMode + ', not SEND B');
});

step('⚠ a left turn BELOW the top row moves the cursor, it does not exit', () => {
    /* Positive control for the step above: prove the exit is the CLAMPED edge
     * and not simply "any left turn". Needs more than one bus to be meaningful,
     * which HAS_SEND_FX gives us; skip honestly if the build has only Master. */
    sessReset();
    S.sessKnobMode = 3; snd.soundEnterBuses();
    if (!snd.soundActive()) throw new Error('control: list did not open');
    const _n = snd.soundBusCountForTest();
    if (_n < 2) { ok('   (skipped: this build has one bus, no interior row to test)'); return; }
    right();                                   /* down one row */
    if (!snd.soundActive()) throw new Error('a right turn inside the list exited it');
    left();                                    /* back up to the top — must NOT exit */
    if (!snd.soundActive()) throw new Error('a left turn from row 1 exited instead of moving');
    left();                                    /* NOW at the top: this one exits */
    if (snd.soundActive()) throw new Error('the top row did not step back out');
});

step('⭑⭑ the session FX list is a SCREEN: it draws with nothing touched and never yields (2026-10-04)', () => {
    /* It used to obey the session mixer latch (the one law, session flavour);
     * no latch exists since 2026-10-04, and the list is opened on purpose —
     * Shift + Note/Session or the Session map's FX pads — so it stays until
     * Back, like any menu. */
    sessReset();
    S.sessKnobMode = 3;
    S.knobTouched = -1;
    snd.soundEnterBuses();
    if (!snd.soundActive()) throw new Error('control: list did not open');
    S.bankSelectTick = -1; S.jogTouched = false; S.touchedIdx = -1; S.volTouched = false;
    if (snd.soundRender() !== true) throw new Error('the FX list stood down with nothing touched');
    S.tickCount += 200; globalThis.tick();
    if (snd.soundRender() !== true) throw new Error('the FX list yielded after a while');
    S.jogTouchCardOn = false; S.jogTouched = true;
    if (snd.soundRender() !== true) throw new Error('a jog touch (switch Off) hid the FX list');
    S.jogTouchCardOn = true; S.jogTouched = false;
    snd.soundExit(); S.sessionView = false;
});

step('⚠ a GLOBAL bus keeps its clamp: left at the top does not exit', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    S.sessionView = true;
    snd.soundEnterBuses(); snd.soundTick();
    /* open the first bus (Master) */
    send(3, 127); send(3, 0); snd.soundTick(); globalThis.tick();
    if (!snd.soundIsGlobal()) throw new Error('control: not on a global bus');
    for (let i = 0; i < 12; i++) left();
    if (!snd.soundActive()) throw new Error('a global bus exited on a left turn');
    snd.soundExit(); S.sessionView = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
