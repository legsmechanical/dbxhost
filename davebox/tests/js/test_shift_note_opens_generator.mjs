
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_shift_note_opens_generator.mjs — Shift+Note/Session opens the
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
/* ⚠ davebox's module editor is the HOST'S OWN binding (ui/vendor/), so sound
 * mode's exit path now reaches host bindings this rig never needed —
 * shadow_restore_knob_leds among them, on the LED teardown. Declared here
 * rather than injected into every bundle: tests/js/build.mjs refuses blanket
 * stubbing on purpose, because a missing binding throws inside tick() and the
 * rig would then pass against a tick that stopped on line one. */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();

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
const MoveBack = 51;   /* the Back button's CC */

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
/* The gesture as hardware sends it: Shift down, the button, Shift up.
 *
 * ⚠⚠ It RESOLVES ON THE RELEASE now (Josh, 2026-08-28), because tap and hold
 * mean different things and only the duration separates them:
 *   tap  -> the track's SOUND + CONFIG menu
 *   hold -> straight to instrument edit, which is what the tap used to do
 * `heldTicks` advances the clock between press and release, so a test can ask
 * for either. Anything at or past BACK_HOLD_TICKS (42, ~450ms) is a hold —
 * deliberately Back's threshold, not the ~200ms this button uses for its own
 * momentary-view hold, which is short enough that a slow tap would land in the
 * instrument editor by accident. */
const HOLD_TICKS = 42;
/* Sound mode's view enum — not exported; pinned here so a renumbering shows up
 * as a failure rather than as comparing the wrong constants. */
const VIEW_BLOCKS = 0, VIEW_PROMPT = 18;
function shiftNote(heldTicks) {
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 127]));
    /* ⚠⚠ The hold fires from the TICK, at the threshold — not from the release
     * (Josh, 2026-08-28). So a held gesture must actually TICK while it is
     * held: advancing the clock alone leaves checkShiftNoteHold unrun, and the
     * release then reads as a tap. That is exactly what this helper did first,
     * and it made the hold assertions fail against correct code. */
    if (heldTicks) { S.tickCount += heldTicks; ticks(2); }
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 0]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 0]));
}
/* The two meanings, named so the steps below read as the spec does. */
const shiftNoteTap  = () => shiftNote(0);
const shiftNoteHold = () => shiftNote(HOLD_TICKS + 2);

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

step('⭑ a TAP opens the track\'s SOUND + CONFIG menu', () => {
    shiftNoteTap();
    ticks(4);
    if (!sound.soundActive()) throw new Error('the tap did not open sound mode');
    if (sound.soundPickStateForTest().view !== VIEW_BLOCKS)
        throw new Error('the tap landed on view ' + sound.soundPickStateForTest().view +
                        ', not the menu — the bank\'s prompt is for arriving BY THE BANK');
});

step('⭑⭑ ...and tapping again does NOT close — the gesture is a DESTINATION', () => {
    /* ⚠⚠ REVERSED 2026-08-28. It used to be a toggle: close what is open, else
     * open. That needed a definition of "open", and the definition is where it
     * went wrong — the root screen had to be carved out as an exception
     * (08-26), and the bank respec would have needed a second exception for the
     * prompt. Josh: forget the opener/closer spec; the gesture goes to the same
     * place every time. Back is the only thing that closes, and it means one
     * thing everywhere. */
    shiftNoteTap();
    ticks(4);
    if (!sound.soundActive())
        throw new Error('the second tap CLOSED — the gesture is a destination now, not a toggle');
    if (sound.soundPickStateForTest().view !== VIEW_BLOCKS)
        throw new Error('the second tap moved off the menu: view ' +
                        sound.soundPickStateForTest().view);
});

step('⭑ a tap from DEEP in the stack collapses back to the menu', () => {
    /* This is what replaces the closer, and it is why losing it costs nothing:
     * one press from any depth puts you on the menu, and one Back from there is
     * out. Two presses to leave from anywhere, without having to know where you
     * were. */
    sound.soundSetViewForTest(13);            /* the knob PARAM picker, 4 boxes deep */
    shiftNoteTap();
    ticks(4);
    if (sound.soundPickStateForTest().view !== VIEW_BLOCKS)
        throw new Error('a tap from depth did not collapse to the menu: view ' +
                        sound.soundPickStateForTest().view);
});

step('⭑⭑ a HOLD goes straight to instrument edit', () => {
    /* The old tap behaviour, now behind a deliberate hold. */
    shiftNoteHold();
    ticks(6);
    const v = sound.soundPickStateForTest().view;
    if (v === VIEW_BLOCKS)
        throw new Error('the hold stopped at the menu — it should reach the instrument');
});

step('⭑⭑ the HOLD spends Shift, so what it opens does not also see it', () => {
    /* ⚠⚠ Josh, on device: the hold fires at the THRESHOLD, with the key still
     * physically down — so the editor it opened came up with its own Shift
     * overlay already on screen. The gesture consumed the modifier; whatever it
     * opens must not consume it a second time.
     *
     * ⚠ The screens opened here RE-READ the physical key on entry ("sync, never
     * assume up"), which is why clearing the flag once is not enough and the
     * latch has to survive until the real release. */
    sound.soundExit(); ticks(4);
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 127]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 127]));
    S.tickCount += HOLD_TICKS + 2; ticks(2);          /* the hold fires HERE */
    if (S.shiftHeld)
        throw new Error('Shift still reads as held after the hold fired — the screen it ' +
                        'opened will come up with a Shift overlay');
    /* ⚠⚠ AND SOUND MODE'S OWN COPY, which is the one that matters. It re-reads
     * the physical key on entry, so the global being false is not enough — that
     * re-read is exactly what would hand Shift to the screen the hold just
     * opened. Asserting only the global let a mutation removing the mask
     * survive. */
    if (sound.soundPickStateForTest().shift)
        throw new Error("sound mode re-read the physical key and resurrected Shift — the " +
                        'screen the hold opened will see it held');
    if (S.shiftHeld) throw new Error('Shift came back while the key was still down');
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveNoteSession, 0]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 0]));
    /* ⚠ CONTROL: a fresh press is honoured again, or "Shift reads as up" would
     * be satisfied by a build where Shift is simply broken, and every assertion
     * above would still pass. */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 127]));
    if (!S.shiftHeld) throw new Error('Shift is dead — a fresh press is not honoured');
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveShift, 0]));
});

step('⭑⭑ leaving the editor RETRACES the hold — back to where you were', () => {
    /* Josh, 2026-08-29: "when exiting instrument editor entered from shift hold
     * shortcut, it should go back to where you were, not necessarily the
     * sound+config menu."
     *
     * ⚠ Three answers, not two. Before the respec "where you were" was either a
     * bank or the menu; the bank now has a PROMPT of its own, and being returned
     * to the menu from there is a screen you were never on. */
    const view = () => sound.soundPickStateForTest().view;
    const back = () => {
        S.backHoldFired = false;
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveBack, 127]));
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, MoveBack, 0]));
        ticks(4);
    };

    /* from the PROMPT */
    sound.soundExit(); ticks(4);
    S.trackRoute[0] = 0;
    sound.soundEnter(0, 0); ticks(2);
    if (view() !== VIEW_PROMPT) throw new Error('setup: not on the prompt');
    shiftNoteHold(); ticks(6);
    if (view() === VIEW_PROMPT) throw new Error('setup: the hold did not leave the prompt');
    back();
    if (view() !== VIEW_PROMPT)
        throw new Error('left the editor onto view ' + view() + ', not the PROMPT it was ' +
                        'entered from');

    /* from the MENU */
    sound.soundShowMenu(); ticks(2);
    if (view() !== VIEW_BLOCKS) throw new Error('setup: not on the menu');
    shiftNoteHold(); ticks(6);
    back();
    if (view() !== VIEW_BLOCKS)
        throw new Error('left the editor onto view ' + view() + ', not the MENU it was ' +
                        'entered from');
});

step('⚠ CONTROL: the two lengths really do differ', () => {
    /* Without this both assertions above could be passing on a build where the
     * duration is ignored and everything lands in the same place. */
    sound.soundExit(); ticks(4);
    shiftNoteTap(); ticks(4);
    const tapView = sound.soundPickStateForTest().view;
    sound.soundExit(); ticks(4);
    shiftNoteHold(); ticks(6);
    const holdView = sound.soundPickStateForTest().view;
    if (tapView === holdView)
        throw new Error('tap and hold both landed on view ' + tapView +
                        ' — the duration is being ignored');
});

step('a MIDI-routed track opens nothing and says why — on the HOLD', () => {
    /* ⚠ The HOLD is what reaches an instrument, so the hold is what has to
     * refuse. A TAP opens SOUND + CONFIG for ANY route: a MIDI track has that
     * menu, and it is exactly where you would change its routing. */
    S.trackRoute[0] = 2;                 /* MIDI out — no generator, no co-run */
    /* ⚠ From a CLOSED state: a previous step may have left the menu open, and
     * the hold refusing does not close it — nothing closes but Back now. */
    sound.soundExit(); ticks(4);
    S.actionPopupEndTick = -1;
    shiftNoteHold();
    ticks(4);
    if (sound.soundActive())
        throw new Error('opened sound mode for a track that has no sound');
    if (S.actionPopupEndTick < 0)
        throw new Error('silently did nothing — a one-press gesture must explain itself');
    S.trackRoute[0] = 0;
});

/* Session view has its own meaning for this gesture (the buses); the opener is
 * track-view only, and co-run refuses in session view anyway. */
step('session view does not get the TRACK opener (it gets its own — see the step above)', () => {
    /* ⚠ REWRITTEN 2026-09-02. This used to assert the gesture did NOTHING in
     * session view. Josh ruled it a destination there too ("shift+menu in
     * session view should jump to master/send effects menu"), so what must
     * still hold is narrower: it must not open a TRACK's sound flavour. */
    S.sessionView = true;
    if (sound.soundActive()) sound.soundExit();
    S.sessMixerLatched = false;
    ticks(2);
    shiftNote();
    ticks(4);
    if (sound.soundActive() && !sound.soundIsGlobal())
        throw new Error('the track-view opener fired in session view');
    if (!sound.soundActive())
        throw new Error('session view now HAS a counterpart and it did not fire');
    sound.soundExit(); S.sessMixerLatched = false;
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

/* ⚠⚠ TWO STEPS REMOVED 2026-08-28, and the machinery with them.
 *
 * They pinned where the gesture's CLOSER landed — onto the bank it was pressed
 * from, via the `genReturn` crumb stamped at the press. The gesture no longer
 * closes (it is a destination), so nothing stamps that crumb and there is no
 * exit to place. Back does the leaving now, and where BACK lands is pinned in
 * test_sound_bank_jog.
 *
 * ⚠ That leaves `genReturn` / `soundGestureReturn()` STAMPED BY NOBODY — dead
 * code that still reads as live. Flagged for removal rather than deleted here,
 * because it is also consulted by the unshifted Note/Session path and that
 * deserves its own look. */

step('⭐ SESSION VIEW: Shift+Menu jumps to the MASTER/SEND FX list — and it must be VISIBLE', () => {
    /* Josh, 2026-09-02: "shift+menu in session view should jump to master/send
     * effects menu." The track flavour opens THIS TRACK's sound menu; the
     * session's counterpart is its own device list. Before this the gesture
     * returned outright in session view ("session view has its own
     * counterpart" — there wasn't one).
     *
     * ⚠⚠ THE HALF THAT WOULD SHIP BROKEN: since the session FX list became
     * owned by sessMixerVisible(), opening it WITHOUT latching bank mode makes
     * it stand down on the very next render — the screen would not change, the
     * gesture would look dead, and sound mode would sit active underneath
     * defeating the click gate. Asserting soundActive() alone would MISS that
     * entirely, so this asserts the list actually DRAWS. */
    S.genReturn = null;
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    if (sound.soundActive()) sound.soundExit();
    S.sessionView = true;
    S.sessMixerLatched = false;          /* at rest, nothing latched */
    S.knobTouched = -1;
    S.touchedIdx = -1; S.volTouched = false;
    S.jogTouched = false; S.bankSelectTick = -1;
    ticks(4);

    shiftNoteTap();
    ticks(2);
    if (!sound.soundActive())
        throw new Error('Shift+Menu did nothing in session view');
    if (!sound.soundIsGlobal())
        throw new Error('it opened a TRACK flavour in session view, not the session buses');
    if (!S.sessMixerLatched)
        throw new Error('bank mode was not latched — the list will stand down on the next ' +
                        'render and the gesture will look dead');
    if (sound.soundRender() !== true)
        throw new Error('the FX list opened INVISIBLY — soundActive() is true but nothing draws');

    /* Idempotent, exactly like the track flavour: pressed again from inside a
     * bus it collapses back to the list rather than toggling off.
     * ⚠ ACTUALLY GO INTO A BUS — an earlier version of this step re-pressed
     * from the LIST and only claimed otherwise in its comment, which is how it
     * missed the stale-level-edit defect below. */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 3, 127]));   /* click: enter MASTER FX */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 3, 0]));
    ticks(3);
    /* VIEW_BUSES = 9 is the list; entering a bus lands on VIEW_BLOCKS = 0. */
    if (sound.soundViewForTest() !== 0)
        throw new Error('rig: the click did not enter a bus (view ' +
                        sound.soundViewForTest() + ')');
    /* ⚠ And with a LEVEL EDIT live: a collapse must end it, exactly as leaveBus
     * does. Left set, sound mode's Back chain tests busLevelEditing BEFORE
     * VIEW_BUSES and spends the next press clearing a stale flag — a dead Back. */
    /* ⚠ Through sound mode's OWN accessor: busLevelEditing is on its private S,
     * and setting it via ui_state writes a DIFFERENT object (two objects called
     * S) — the assertion would then pin nothing at all. */
    sound.soundBusLevelEditingForTest(true);
    shiftNoteTap();
    ticks(2);
    if (!sound.soundActive() || !sound.soundIsGlobal())
        throw new Error('a second press toggled the list off instead of collapsing to it');
    if (sound.soundBusLevelEditingForTest())
        throw new Error('the collapse left a live level edit armed — the next Back is a dead press');
    if (sound.soundRender() !== true) throw new Error('the list stopped drawing after a re-press');

    /* The HOLD has no session counterpart and must not invent one. */
    sound.soundExit(); S.sessMixerLatched = false;
    shiftNoteHold();
    ticks(2);
    if (sound.soundActive())
        throw new Error('the HOLD opened something in session view — it has no counterpart');
    S.sessionView = false;
});

step('⚠ control: with no gesture crumb, Menu is NOT a closer', () => {
    /* ⚠ Explicitly crumb-FREE. The HOLD stamps `genReturn` again as of
     * 2026-08-29 (so the editor it opens can retrace), and an earlier step's
     * crumb leaking in here would make the unshifted press spend it and close —
     * which is the very thing this control exists to say does NOT happen
     * without one. init() does not clear it. */
    S.genReturn = null;
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackRoute[0] = 0;
    ticks(8);
    sound.soundEnter(0, 0);                 /* a BANK-WALK style entry: no crumb */
    ticks(4);
    if (!sound.soundOpen()) throw new Error('setup failed: sound mode is not open');
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
step('an EMPTY generator opens the module picker, captioned (on the HOLD)', () => {
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
        shiftNoteHold();
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
        S.bankCardLatched = true;                  /* the card is the door only in bank mode (resting = overview, 2026-09-03) */
        ticks(4);
        const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
        /* ⚠ Entry lands on the BANK'S PROMPT now, so the first click is the
         * door into the menu — it is not the row. */
        cc(3, 127); cc(3, 0); ticks(2);
        /* ⚠ And the Instrument row opens a PICKER now rather than editing in
         * place (the enum law), so this click opens the list and the one below
         * commits the selection. The jog step between them is unchanged: the
         * picker opens on the CURRENT value, and Schwung is one step before
         * MIDI Ch 1 in instrOptions' order. */
        cc(3, 127); cc(3, 0);                      /* open the Instrument picker */
        ticks(1);
        cc(14, 127);                               /* one step left: MIDI Ch 1 -> Schwung */
        ticks(1);
        cc(3, 127); cc(3, 0);                      /* commit */
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
