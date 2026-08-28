/* tests/js/test_shift_note_opens_generator.mjs — Shift+Note/Session opens the
 * active track's generator editor in one press, and still CLOSES what is open.
 *
 * Josh, 2026-08-26: "Track view: Shift+Note/Session should jump STRAIGHT to
 * either the generator's canvas UI (inside the SOUND + CONFIG bank, so Back
 * returns you to it) or Move co-run."
 *
 * ⚠⚠ THE CLOSER IS THE PART MOST AT RISK, which is why it is asserted first and
 * last. The opener was deliberately RETIRED on 2026-08-24 ("no gesture may open
 * a menu the module's own UI already reaches"), and retiring it is what made
 * this the one-press way out from any depth. Adding a destination must not cost
 * that exit — so the gesture is a toggle, and a change that only implemented
 * "open" would satisfy the request while removing the property the last ruling
 * was about.
 *
 * The destination follows the track's ROUTE, because "edit this track's
 * instrument" means different things per route: a Schwung track's sound is its
 * Generator block, a Move track's belongs to Move (co-run), and an EXT/MIDI
 * track has neither.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
/* A loaded generator: engineLoadedModule() reads `<comp>:module`, and an empty
 * answer is what "no generator" looks like — so the happy path needs a name. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 1;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const sound = await import('../../ui/ui_sound.mjs');
/* ⚠ MoveNoteSession comes from dAVEBOx's OWN constants, not the host's shared
 * ones — importing it from there yields `undefined`, the CC never matches, and
 * every assertion below reports "the gesture did nothing" while testing nothing.
 * Caught by printing the constant when the first assertion failed. */
const { MoveNoteSession, BANK_SOUND, BANK_DEFAULT } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
/* The gesture as hardware sends it: Shift down, the button, Shift up. */
function shiftNote() {
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 0]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 0]));
}

step('setup: track view, track 1 on a Schwung chain', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;                 /* Schwung chain */
    ticks(16);
    if (sound.soundActive()) throw new Error('sound mode was already open before the gesture');
});

step('one press OPENS the track\'s sound', () => {
    shiftNote();
    ticks(4);
    if (!sound.soundActive())
        throw new Error('the gesture did not open sound mode');
});

/* THE PROPERTY THE LAST RULING WAS ABOUT. */
step('...and pressing it again CLOSES — the one-press way out survives', () => {
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the gesture no longer closes — the way out from any depth is gone');
});

/* ── The ROOT exception (Josh, 2026-08-26) ────────────────────────────────
 *
 * "the first time you do shift+note/session it sends the bank back to the first
 * one and you have to do it again to get into the instrument. it should just go
 * right to the instrument."
 *
 * Sitting on SOUND + CONFIG — sound mode's ROOT screen, the block picker — the
 * closer ran and `soundExit()` landed on BANK_DEFAULT, which is literally "the
 * first one". The press was spent going backwards from the very screen the
 * gesture opens FROM.
 *
 * ⭑ The exception is scoped to ROOT on purpose, so the two steps below are a
 * PAIR: root must open, and anything deeper must still close. Testing only the
 * first would pass an implementation that dropped the closer entirely, which is
 * the property the 08-24 retirement created. */
step('from SOUND + CONFIG (root) the press OPENS, it does not go back a bank', () => {
    S.trackRoute[0] = 0;                 /* Schwung chain again */
    sound.soundEnter(0, 0);              /* lands on the block picker = root */
    ticks(4);
    if (!sound.soundAtBlockRoot())
        throw new Error('setup failed: not on the root screen, so this proves nothing');
    shiftNote();
    ticks(4);
    if (!sound.soundActive())
        throw new Error('the press CLOSED sound mode from root — that is the bug: it ' +
                        'sends the bank back to the first one instead of opening');
    if (sound.soundAtBlockRoot())
        throw new Error('still on the picker — the press did nothing at all');
});

step('...but from DEEPER than root it still CLOSES — the way out survives', () => {
    /* We are one level past root after the step above, which is exactly the
     * depth the one-press exit exists for. */
    if (sound.soundAtBlockRoot())
        throw new Error('setup failed: still at root, so the closer is not under test');
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the one-press way out from depth is gone');
});

step('a MIDI-routed track opens nothing and says why', () => {
    S.trackRoute[0] = 2;                 /* MIDI out — no generator, no co-run */
    S.actionPopupEndTick = -1;
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('opened sound mode for a track that has no sound');
    if (S.actionPopupEndTick < 0)
        throw new Error('silently did nothing — a one-press gesture must explain itself');
    S.trackRoute[0] = 0;
});

/* Session view has its own meaning for this gesture (the buses); the opener is
 * track-view only, and co-run refuses in session view anyway. */
step('session view is left alone', () => {
    S.sessionView = true;
    ticks(2);
    shiftNote();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the track-view opener fired in session view');
    S.sessionView = false;
});

/* ── The gesture RETURNS you where you pressed (Josh, 2026-08-26) ──────────
 *
 * "when in a sound editor from that menu, it should exit back to the place the
 * user was when they did the gesture to enter it" — and, on the ambiguity:
 * "always leaves sound mode entirely unless you were already in sound mode".
 *
 * Driven through the unshifted Note/Session (CC 50 = Move's Menu), which is the
 * exit Josh asked for on Schwung tracks. The Back path shares the same
 * soundGestureReturn() call, one level deeper.
 *
 * ⚠⚠ THE TWO CONTROLS AT THE END ARE THE POINT. This change is a narrow
 * exception carved into TWO standing rulings — the 08-25 "unshifted Note/Session
 * is not a closer" retirement, and the 08-25 "back inside a bank always goes to
 * the DEFAULT bank" rule. An implementation that simply made the button a closer
 * again would pass every positive assertion above while quietly reversing both. */
function menuPress() {
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 0]));
}

step('pressed from a normal bank: the exit LEAVES sound mode, onto THAT bank', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;
    S.activeBank = 3;                       /* deliberately NOT the default */
    ticks(8);
    shiftNote();
    ticks(4);
    if (!sound.soundActive()) throw new Error('setup failed: the gesture did not open sound mode');
    menuPress();
    ticks(4);
    if (sound.soundActive())
        throw new Error('the exit did not leave sound mode');
    if (S.activeBank !== 3)
        throw new Error('landed on bank ' + S.activeBank + ', not the bank the gesture was ' +
                        'pressed from (3) — that is the old default-bank close');
});

step('pressed from SOUND + CONFIG: the exit STAYS in sound mode, back on the picker', () => {
    S.trackRoute[0] = 0;
    sound.soundEnter(0, 0);                 /* already in sound mode, at root */
    ticks(4);
    if (!sound.soundAtBlockRoot()) throw new Error('setup failed: not at root');
    shiftNote();
    ticks(4);
    menuPress();
    ticks(4);
    if (!sound.soundActive())
        throw new Error('it left sound mode — but the press came FROM sound mode, so the ' +
                        'return point is the picker, not a bank');
    if (!sound.soundAtBlockRoot())
        throw new Error('still not back on the picker');
});

/* CONTROL 1 — the 08-25 retirement survives for every OTHER entry. */
step('⚠ control: with no gesture crumb, Menu is NOT a closer', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;
    ticks(8);
    sound.soundEnter(0, 0);                 /* a BANK-WALK style entry: no crumb */
    ticks(4);
    if (!sound.soundActive()) throw new Error('setup failed: sound mode is not open');
    menuPress();
    ticks(4);
    /* ⚠ The observable is the RECORDED bank, not soundActive(). With no crumb the
     * press falls through to the view toggle, and tick's reconcile ends sound
     * mode as a LEAVE — so soundActive() goes false either way and cannot tell a
     * leave from a close. A LEAVE keeps the track recorded on SOUND + CONFIG
     * (the screen is waiting when you return); a CLOSE resets it. Josh's 08-25
     * words are exactly this: "without resetting the track's current bank place". */
    if (S.trackActiveBank[0] !== BANK_SOUND)
        throw new Error('the track stopped being recorded on SOUND + CONFIG (bank ' +
                        S.trackActiveBank[0] + ') — Menu acted as a CLOSER without a gesture ' +
                        'crumb, reversing the 08-25 retirement');
});

/* CONTROL 2 — the crumb cannot outlive its screen and strand a stale return. */
step('⚠ control: leaving by any other route SPENDS the crumb', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;
    S.activeBank = 5;
    ticks(8);
    shiftNote();                            /* arms the crumb */
    ticks(4);
    sound.soundExit();                      /* ...but we leave another way */
    ticks(4);
    sound.soundEnter(0, 0);                 /* a fresh, crumb-less entry */
    ticks(4);
    menuPress();
    ticks(4);
    if (S.trackActiveBank[0] !== BANK_SOUND)
        throw new Error('a STALE crumb from an earlier gesture drove this exit (landed on bank ' +
                        S.trackActiveBank[0] + ') — that is the "banks land somewhere I did not ' +
                        'leave them" bug the crumb exists to avoid');
});

/* ⭑ AN EMPTY GENERATOR OPENS THE PICKER (Josh, 2026-08-27). It used to drop you
 * on the block list with a popup reading "NO GENERATOR / Pick one to add it" —
 * an instruction standing in for the action. The gesture means "edit this
 * track's sound"; with no sound yet, choosing one IS the edit.
 *
 * ⚠ The rig mocks a LOADED generator by default (`synth:module` -> 'nusaw'),
 * which is the happy path every other step here needs. This one has to make the
 * block genuinely empty, so it swaps that mock and puts it back — without which
 * it would silently exercise the loaded path and pass while proving nothing.
 * ⚠ LAST in the file: it leaves sound mode on a different screen, and mid-file
 * it broke the MIDI-routed step below it.
 * ⚠ The observable is the SCREEN, not a popup — asserting a popup would now pass
 * against a gesture that opened nothing at all. */
step('an EMPTY generator opens the module picker, captioned', () => {
    const realGet = globalThis.shadow_get_param;
    globalThis.shadow_get_param = () => '';        /* nothing loaded, any comp */
    try {
        globalThis.init();
        S.awaitingProjectSelect = false;
        S.ledInitComplete = true;
        S.sessionView = false;
        S.activeTrack = 0;
        S.trackRoute[0] = 0;                       /* Schwung chain */
        ticks(8);
        shiftNote();
        ticks(6);
        const b = sound.soundBrowseStateForTest();
        if (!b.browsing)
            throw new Error('the gesture did not land on the module picker');
        if (b.prompt !== 'SELECT INSTRUMENT')
            throw new Error('no caption over the picker, got ' + JSON.stringify(b.prompt) +
                            ' — nothing says why you are suddenly choosing a module');
    } finally {
        globalThis.shadow_get_param = realGet;
    }
});

/* ⭑ THE MERGE (Josh, 2026-08-27): choosing `Schwung` as the Instrument goes
 * STRAIGHT to the module picker when the slot is empty. Picking an instrument
 * and picking WHICH one is a single intent; before this you were left on the
 * block list to notice the row was empty and open it yourself.
 *
 * ⚠ Driven through the real row + jog, not by calling the helper: the property
 * is that the CHOICE leads there, and the browse is queued for AFTER the track
 * has re-entered its new flavour. A test that called openBrowse directly would
 * prove the picker exists, not that choosing Schwung reaches it. */
step('choosing Schwung as the Instrument opens the module picker', () => {
    const realGet = globalThis.shadow_get_param;
    globalThis.shadow_get_param = () => '';        /* empty slot */
    try {
        globalThis.init();
        S.awaitingProjectSelect = false;
        S.ledInitComplete = true;
        S.sessionView = false;
        S.activeTrack = 0;
        S.trackRoute[0] = 2;                       /* MIDI-routed: the screen is just the row */
        S.trackChannel[0] = 1;
        ticks(8);
        sound.soundEnter(0, 0);
        ticks(4);
        const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
        cc(3, 127); cc(3, 0);                      /* jog click: start editing the row */
        ticks(1);
        cc(14, 127);                               /* one step left: MIDI ch 1 -> Schwung */
        ticks(1);
        cc(3, 127); cc(3, 0);                      /* click again: commit */
        ticks(10);                                 /* reflavour, then the queued browse */
        const b = sound.soundBrowseStateForTest();
        if (!b.browsing)
            throw new Error('choosing Schwung did not open the module picker');
        if (b.prompt !== 'SELECT INSTRUMENT')
            throw new Error('picker opened without the caption, got ' + JSON.stringify(b.prompt));
    } finally {
        globalThis.shadow_get_param = realGet;
    }
});

if (failed) process.exit(1);
console.log('test_shift_note_opens_generator: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
