/* tests/js/test_sound_bank_jog.mjs — SOUND + CONFIG is the bank past the last
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
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
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
const { PAD_MODE_DRUM, PAD_MODE_CONDUCT, PAD_MODE_MELODIC_SCALE, BANK_WHEN, BANK_SOUND } = constsMod;

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
function toTop() {
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
    S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
    S.loopHeld = false; S.shiftHeld = false;
    for (let t = 0; t < 8; t++) S.trackRoute[t] = 0;
    S.activeTrack = 2;
    S.trackPadMode[2] = mode;
    S.activeBank = bank; S.trackActiveBank[2] = bank;
    /* LED paths read bankParams, which init() builds on-device only */
    if (!S.bankParams)
        S.bankParams = Array.from({ length: 8 }, () =>
            Array.from({ length: 11 }, () => new Array(8).fill(0)));
    S.bankSelectTick = -1; S.jogTouched = false;
}

step('control: a right turn from CLIP moves to NOTE FX (the bank walk is live)', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    right();
    if (S.activeBank !== 1) throw new Error('bank did not step: ' + S.activeBank);
    if (snd.soundActive()) throw new Error('entered sound mode from CLIP');
});

step('⭑ melodic: right past AUTOMATION (6) enters SOUND + CONFIG', () => {
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();
    if (!snd.soundActive()) throw new Error('sound mode did not open');
    /* The screen IS a bank (Josh, 2026-08-23) and it RECORDS ITSELF like every
     * other one (Josh, 2026-08-25): activeBank takes the BANK_SOUND identity so
     * every bank-keyed behaviour runs its standard branch, AND trackActiveBank
     * takes it too — that write is the whole fix. The bank to come back to is
     * the separate crumb, trackSoundOrigin. */
    if (S.activeBank !== BANK_SOUND) throw new Error('activeBank did not take the sound identity: ' + S.activeBank);
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('the bank did not record itself: ' + S.trackActiveBank[2]);
    if (S.trackSoundOrigin[2] !== 6)
        throw new Error('the origin crumb was not kept: ' + S.trackSoundOrigin[2]);
});

step('⭑ ...and the next right turn walks the menu, not the banks', () => {
    snd.soundTick();                   /* rows build on the tick after entry */
    const r0 = snd.soundPickStateForTest().row;
    right();
    const r1 = snd.soundPickStateForTest().row;
    if (!snd.soundActive()) throw new Error('sound mode closed on a right turn');
    if (r1 <= r0) throw new Error('cursor did not move down: ' + r0 + ' -> ' + r1);
    if (S.activeBank !== BANK_SOUND) throw new Error('the identity was lost underneath: ' + S.activeBank);
    if (S.trackActiveBank[2] !== BANK_SOUND) throw new Error('the recorded bank drifted: ' + S.trackActiveBank[2]);
    if (S.trackSoundOrigin[2] !== 6) throw new Error('the origin crumb drifted: ' + S.trackSoundOrigin[2]);
});

step('⭑ left turns walk back up, and past the top row leave to the last clip bank', () => {
    toTop();
    left();
    if (snd.soundActive()) throw new Error('left turn at the top did not exit');
    if (S.activeBank !== 6) throw new Error('did not land on AUTOMATION: ' + S.activeBank);
    left();
    if (S.activeBank !== 5) throw new Error('bank walk did not resume leftward: ' + S.activeBank);
});

step('⭑ drum: right past CC PARAM (the end of BANK_CYCLE_DRUM) enters too', () => {
    reset(PAD_MODE_DRUM, 6);
    right();
    if (!snd.soundActive()) throw new Error('sound mode did not open on a drum track');
    snd.soundTick(); toTop();
    left();
    if (snd.soundActive()) throw new Error('left at the top did not exit on a drum track');
    if (S.activeBank !== 6) throw new Error('did not land on CC PARAM: ' + S.activeBank);
});

step('⚠ conductor: the cycle still ends at WHEN — no sound-mode bank', () => {
    reset(PAD_MODE_CONDUCT, BANK_WHEN);
    right();
    if (snd.soundActive()) throw new Error('a Conductor track entered sound mode from the jog');
    if (S.activeBank !== BANK_WHEN) throw new Error('bank moved: ' + S.activeBank);
});

step('⚠ Shift+Note entry is unchanged: left at the top still exits (same door, same way out)', () => {
    reset(PAD_MODE_MELODIC_SCALE, 3);
    S.pendingSoundEnterTrack = 2; globalThis.tick(); snd.soundTick();
    if (!snd.soundActive()) throw new Error('control: deferred entry did not open');
    /* This entry has NO jog behind it, so soundEnter itself must arm the
     * display window — without that the screen yields to the overview on the
     * very first frame and Shift+Note appears to do nothing. (The jog entry
     * path arms it at the CC site too, which masked this once.) */
    if (!snd.soundRender()) throw new Error('Shift+Note entry did not show the screen');
    toTop();
    left();
    if (snd.soundActive()) throw new Error('left at the top did not exit');
    if (S.activeBank !== 3) throw new Error('landed on the wrong bank: ' + S.activeBank);
});

step('⭑ AUTO-bank pad coloring stands down while SOUND + CONFIG is up', () => {
    /* The AUTO bank paints the melodic pads grey (palette 118 root / 124
     * non-root). Sound mode leaves S.activeBank on the bank it was entered
     * from — which can be AUTO — but the pads stay with the SEQUENCER there,
     * so they must wear their default clip coloring. The gate is
     * ui_leds' autoBankLeds() reading the S.soundOpen mirror; both halves
     * fail silently (a stale mirror or a missed site just leaves grey pads).
     * Captured at the wire: setLED emits [0x09, 0x90, note, color]. */
    const { updateTrackLEDs, invalidateLEDCache } = ledsMod;
    const { clearAllLEDs } = ifMod;   /* resets input_filter's send cache too */
    const { TRACK_PAD_BASE } = constsMod;
    const padColors = () => {
        const seen = {};
        clearAllLEDs();               /* before the capture arms — its own
                                       * note-offs are not pad paint */
        globalThis.move_midi_internal_send = (b) => {
            if (b && b[1] === 0x90 && b[2] >= TRACK_PAD_BASE && b[2] < TRACK_PAD_BASE + 32)
                seen[b[2]] = b[3];
        };               /* both caches — ui_leds' AND input_filter's;
                                       * ticks during earlier steps already primed
                                       * them, and a primed cache eats the repaint */
        invalidateLEDCache();
        updateTrackLEDs();
        globalThis.move_midi_internal_send = () => {};
        return Object.values(seen);
    };
    /* ⚠ DarkGrey === 124 === the AUTO non-root grey, so the non-root pads are
     * IDENTICAL in both states. The tell is the ROOT pads: AUTO paints them
     * 118 (LightGrey), the default coloring paints them trackColor(t). A real
     * pad map is needed or every pad is non-root and both states read all-124. */
    reset(PAD_MODE_MELODIC_SCALE, 6);
    computePadNoteMap();
    const tCol = ledsMod.trackColor(2);
    if (tCol === 118) throw new Error('fixture: trackColor(2) is LightGrey — pick another track');
    const grey = padColors();
    if (!grey.length) throw new Error('control: no pad LEDs painted at all');
    if (!grey.some(c => c === 118))
        throw new Error('control: AUTO bank painted no LightGrey root pads (' + grey.join(',') + ')');
    if (grey.some(c => c === tCol))
        throw new Error('control: AUTO bank painted track-color pads');
    right();                            /* enter SOUND + CONFIG from AUTO */
    if (!snd.soundActive()) throw new Error('did not enter sound mode');
    const inSound = padColors();
    if (!inSound.length) throw new Error('no pad LEDs painted in sound mode');
    if (inSound.some(c => c === 118))
        throw new Error('AUTO root grey still painted under sound mode: ' + inSound.join(','));
    if (!inSound.some(c => c === tCol))
        throw new Error('default track-color roots missing under sound mode: ' + inSound.join(','));
    snd.soundTick(); toTop(); left();   /* back out onto AUTO */
    if (snd.soundActive()) throw new Error('did not exit');
    const back = padColors();
    if (!back.some(c => c === 118))
        throw new Error('AUTO grey palette did not return after exit: ' + back.join(','));
});

step('⭑ the TOP LEVEL keeps the banks\' display law: falls back to the overview', () => {
    /* Same flags the clip banks read: the screen shows while the jog is
     * touched or the bank-display window is open, and yields to the track
     * overview otherwise — sound mode stays ACTIVE underneath. Every branch
     * here fails silently (a screen that never yields just looks like the
     * old behaviour; one that never comes back looks broken only on device). */
    const jogTouch   = (on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, 9, on ? 127 : 0]));
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                             /* enter SOUND + CONFIG */
    if (!snd.soundActive()) throw new Error('did not enter');
    snd.soundTick();
    if (!snd.soundRender()) throw new Error('screen not shown inside the entry window');
    /* Window expires: the banks\' own timeout clears bankSelectTick in tick. */
    S.tickCount += 200; globalThis.tick();
    if (S.bankSelectTick >= 0) throw new Error('control: display window did not expire');
    if (snd.soundRender()) throw new Error('top level did not yield to the overview after the window');
    if (!snd.soundActive()) throw new Error('yielding must not EXIT sound mode');
    /* Touch the jog: the screen comes back; release: it yields at once. */
    jogTouch(true);
    if (!S.jogTouched) throw new Error('control: jog touch not tracked');
    if (!snd.soundRender()) throw new Error('jog touch did not bring the screen back');
    jogTouch(false);
    if (snd.soundRender()) throw new Error('jog release did not yield immediately');
    /* A turn re-opens the window (and still moves the cursor).
     * ⚠ Asserted mid-gesture — touch and turn, NO release. The release stands
     * the window down by design (two lines up, this file proves it), so a
     * complete turn would open the window and close it again before the
     * assertion ran. What is under test is the TURN. */
    const r0 = snd.soundPickStateForTest().row;
    jogTouch(true);
    send(14, 1); globalThis.tick();
    if (snd.soundPickStateForTest().row === r0) throw new Error('turn no longer moves the cursor');
    if (!snd.soundRender()) throw new Error('a turn did not re-open the display window');
    jogTouch(false);
    /* Deeper levels never yield: open the row under the cursor via the real
     * click, then check with the window closed. */
    snd.soundTick();
    send(3, 127); snd.soundTick(); globalThis.tick();
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
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                             /* enter from AUTOMATION */
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
    if (snd.soundActive()) throw new Error('sound mode followed the Shift+jog switch');
    if (S.activeBank !== 2)
        throw new Error("the switch did not land on track 3's own origin: " + S.activeBank +
                        (S.activeBank === BANK_SOUND ? ' (still SOUND + CONFIG)' : ''));
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
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                                   /* enter from AUTOMATION (6) */
    if (!snd.soundActive()) throw new Error('control: did not enter sound mode');
    send(51, 127); send(51, 0); globalThis.tick();
    if (snd.soundActive()) throw new Error('Back did not close SOUND + CONFIG');
    if (S.activeBank !== 6)
        throw new Error('Back landed on ' + S.activeBank + ', not AUTOMATION (6) — the bank it ' +
                        'was entered from' + (S.activeBank === 0 ? '; 0 is the RETIRED ' +
                        'default-bank close' : ''));
    if (S.trackActiveBank[2] !== 6)
        throw new Error('the recorded bank did not follow Back: ' + S.trackActiveBank[2]);

    /* ...and the jog agrees, which is now the point rather than the contrast. */
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();
    snd.soundTick();
    toTop();
    left();
    if (snd.soundActive()) throw new Error('control: the top-edge left turn did not exit');
    if (S.activeBank !== 6)
        throw new Error('the jog exit landed on ' + S.activeBank + ', not the bank it came from');
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

    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                                   /* into SOUND + CONFIG */
    if (!snd.soundActive()) throw new Error('control: did not enter sound mode');

    noteSession();                             /* -> session view */
    if (!S.sessionView) throw new Error('control: did not switch to session view');
    if (snd.soundActive()) throw new Error('the screen survived the view change');
    if (S.trackActiveBank[2] !== BANK_SOUND)
        throw new Error('the view change RESET the bank to ' + S.trackActiveBank[2] +
                        (S.trackActiveBank[2] === 0 ? " — Josh's report" : ''));

    S.bankSelectTick = -1;
    noteSession();                             /* -> back to track view */
    if (S.sessionView) throw new Error('control: did not switch back to track view');
    if (!snd.soundActive())
        throw new Error('the track came back to track view without its screen');
    if (S.activeBank !== BANK_SOUND) throw new Error('came back on bank ' + S.activeBank);
    if (S.bankSelectTick >= 0)
        throw new Error('the return opened the bank display window (tick ' + S.bankSelectTick + ')');
    snd.soundExit();
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
    reset(PAD_MODE_MELODIC_SCALE, 6);
    right();                                   /* enter SOUND + CONFIG from AUTOMATION */
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
    for (let t = 0; t < 8; t++) { S.trackActiveBank[t] = 0; S.trackSoundOrigin[t] = -1; }
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
    S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
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
    S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
    S.loopHeld = false; S.shiftHeld = false; S.perfViewLocked = false;
    S.sessionView = true;
    S.sessKnobMode = 0;
    S.knobTouched = -1; S.jogTouched = false; S.bankSelectTick = -1;
    S.touchedIdx = -1;
}

step('control: the session mixer walk is live (VOLUME -> PAN)', () => {
    sessReset();
    right();
    if (S.sessKnobMode !== 1) throw new Error('mixer mode did not step: ' + S.sessKnobMode);
    if (snd.soundActive()) throw new Error('opened the FX list from the middle of the mixer');
});

step('⭑ right past the LAST mixer mode opens the session FX list', () => {
    sessReset();
    S.sessKnobMode = 3;                       /* SEND B, the last one */
    right();
    if (!snd.soundActive()) throw new Error('the FX list did not open');
    if (!snd.soundIsGlobal()) throw new Error('opened a TRACK sound, not the session buses');
    if (!snd.soundEnteredInSession()) throw new Error('not marked as entered from session view');
    /* sessKnobMode stays put — it is where the left turn back out lands, the
     * same way activeBank stays on the last clip bank in track view. */
    if (S.sessKnobMode !== 3) throw new Error('the mixer position moved: ' + S.sessKnobMode);
});

step('⭑ ...and a left turn at its TOP ROW steps back out to the mixer', () => {
    /* The half that makes it a bank rather than a destination. */
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
    S.sessKnobMode = 3; right();
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

step('⭑ the FX list obeys the banks DISPLAY LAW (stands down to the overview)', () => {
    sessReset();
    S.sessKnobMode = 3; right();
    if (!snd.soundActive()) throw new Error('control: list did not open');
    /* Entry leaves the window open, so it DRAWS — the positive control. */
    S.bankSelectTick = S.tickCount; S.jogTouched = false; S.touchedIdx = -1;
    if (snd.soundRender() !== true)
        throw new Error('control failed: the list does not draw even with the window open');
    /* Window shut and nothing touched: it must yield so drawUI falls through to
     * the session overview, exactly as a clip bank does in track view. */
    S.bankSelectTick = -1; S.jogTouched = false; S.touchedIdx = -1; S.volTouched = false;
    if (snd.soundRender() !== false)
        throw new Error('the FX list held the screen with no gesture and no window — ' +
                        'it covers the session overview');
    /* ...and a jog touch brings it straight back. */
    S.jogTouched = true;
    if (snd.soundRender() !== true)
        throw new Error('a jog touch did not bring the list back');
    snd.soundExit(); S.jogTouched = false; S.sessionView = false;
});

step('⚠ a GLOBAL bus keeps its clamp: left at the top does not exit', () => {
    reset(PAD_MODE_MELODIC_SCALE, 0);
    S.sessionView = true;
    snd.soundEnterBuses(); snd.soundTick();
    /* open the first bus (Master) */
    send(3, 127); snd.soundTick(); globalThis.tick();
    if (!snd.soundIsGlobal()) throw new Error('control: not on a global bus');
    for (let i = 0; i < 12; i++) left();
    if (!snd.soundActive()) throw new Error('a global bus exited on a left turn');
    snd.soundExit(); S.sessionView = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
