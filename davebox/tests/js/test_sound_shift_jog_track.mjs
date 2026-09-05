
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_sound_shift_jog_track.mjs — Shift+jog switches TRACK from
 * sound mode's menu, and only from there.
 *
 * Josh, specifying the sound-menu consolidation: Shift+jog stays the track
 * scroll and must work in sound mode's menu the way it already does in the
 * global menu — "only in menu, though: shift+scroll serves other functions in
 * canvas editors accessed through the menu."
 *
 * The implementation is a DECLINE, not a handler: sound mode returns false for
 * the CC and davebox's own jog handler steps the track, with tick following the
 * change. That makes the failure modes silent in both directions, which is what
 * this file is for:
 *   - decline too much (in a module editor) and Shift+jog stops jumping the
 *     module's param SECTIONS, which is an established, different meaning
 *   - decline too little and the gesture simply does nothing in sound mode,
 *     while working everywhere else
 *   - decline on a GLOBAL bus (Master/Send FX) and there is no track to step,
 *     so the turn lands on whatever davebox thinks is active underneath
 *
 * Drives `globalThis.onMidiMessageInternal` — the entry point the host calls —
 * so it proves dispatch, not spelling.
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
/* ⚠⚠ These matter more than they look. `tick()` wraps _tickImpl in a
 * try/catch, so a MISSING host binding throws on the first line that touches it
 * and every later stage of the tick — including sound mode's track-follow —
 * silently never runs. The whole tick looks like it executed. A fourth version
 * of the one-shot step passed against its mutation purely because
 * host_ext_midi_remap_clear was undefined and the follow was unreachable. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const { BANK_SOUND } = await import('../../ui/ui_constants.mjs');
const editops = await import('../../ui/ui_editops.mjs');

const send  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (on) => send(49, on ? 127 : 0);
const turn  = () => send(14, 1);                 /* +1 detent */

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

step('setup: sound mode on a Schwung track, at its menu', () => {
    S.sessionView = false;
    S.globalMenuOpen = false;
    for (let t = 0; t < 8; t++) S.trackRoute[t] = 0;   /* all Schwung */
    S.activeTrack = 2;
    snd.soundEnter(2, 2);
    /* ⚠ Entry lands on the BANK'S PROMPT now (Josh, 2026-08-28: the bank is a
     * door). These steps act on the menu. */
    snd.soundShowMenu();
    if (!snd.soundActive()) throw new Error('sound mode did not enter');
});

step('plain jog still moves the menu cursor, NOT the track', () => {
    const t0 = S.activeTrack;
    turn();
    if (S.activeTrack !== t0)
        throw new Error('an unshifted turn changed the track: ' + t0 + ' -> ' + S.activeTrack);
});

step('⭑ Shift+jog steps the active track', () => {
    shift(true);
    const t0 = S.activeTrack;
    turn();
    if (S.activeTrack !== t0 + 1)
        throw new Error('track did not step: ' + t0 + ' -> ' + S.activeTrack);
    shift(false);
});

step('⭑ it keeps stepping while Shift stays down (the one-shot bug)', () => {
    /* Josh, on hardware: "tracks should scroll with the wheel continuously
     * while held. right now it's a one-shot."
     *
     * Cause: stepping a track makes tick RETARGET the screen, and soundEnter /
     * soundRetarget / soundEnterMove each cleared sound mode's shiftHeld. The
     * key was still physically down, so the copy was simply wrong, and the next
     * turn read as unshifted — moving the cursor instead of the track.
     *
     * The retarget is what makes this specific: one turn works, so any test
     * that turns once passes. This one turns THREE times on one Shift. */
    S.activeTrack = 1;
    snd.soundEnter(1, 1);
    /* ⚠ Entry lands on the BANK'S PROMPT now (Josh, 2026-08-28: the bank is a
     * door). These steps act on the menu. */
    snd.soundShowMenu();
    /* ⚠⚠ The follow lives in the `else` of `if (!S.ledInitComplete)`, so every
     * tick before LED init finishes is consumed by it and never reaches the
     * retarget. A third earlier version of this step ticked the RIGHT tick and
     * still passed against the mutation for exactly that reason. LED init is a
     * precondition here, not the subject, and it does not complete under stub
     * host functions — so it is set directly. */
    S.ledInitComplete = true;
    shift(true);
    /* ⚠⚠ davebox's MAIN tick, not snd.soundTick(). The track-follow that
     * retargets the screen — and used to clear shiftHeld on the way — lives in
     * ui_tick's _tickImpl; sound mode's own tick never runs it. Two earlier
     * versions of this step passed against the mutation that restores the bug:
     * one turned without ticking at all, one ticked the WRONG tick. Reproducing
     * a bug means running the mechanism that causes it. */
    turn(); globalThis.tick();
    turn(); globalThis.tick();
    turn(); globalThis.tick();
    shift(false);
    if (S.activeTrack !== 4)
        throw new Error('expected 1 -> 4 on three turns, got ' + S.activeTrack +
                        (S.activeTrack === 2 ? ' (one-shot: shift was cleared by the retarget)' : ''));
});

step('...and it clamps at the last track rather than wrapping', () => {
    S.activeTrack = 7;
    shift(true);
    turn();
    if (S.activeTrack !== 7)
        throw new Error('stepped past the last track to ' + S.activeTrack);
    shift(false);
    S.activeTrack = 2;
});

step('⭑ Shift+jog FOLLOWS (2026-09-05) — the new Move track lands on ITS bus, on SOUND + CONFIG', () => {
    /* Josh, 2026-08-24: "switching a track from the sound+config bank causes
     * ALL tracks to land on the sound+config bank when scrolling through them."
     *
     * SOUND + CONFIG is a BANK, and a bank is per-track. ui_tick's reconcile
     * used to FOLLOW the track and re-take the bank identity, so every track
     * you scrolled onto reported SOUND + CONFIG. Ruled (Josh): this route
     * closes it. The follow stays for the OTHER switch sites — Shift+pad,
     * session launchers, remote UI — where you are inside a module's editor and
     * comparing two sounds across tracks is the point.
     *
     * ⭑ Move-routed on both sides, because that is the flavour that also
     * re-stamped the display window (soundEnterMove) — one gesture, both
     * failure modes. */
    snd.soundExit();
    S.trackRoute[5] = 1; S.trackRoute[6] = 1;      /* Move-routed */
    S.trackActiveBank[5] = 11;                     /* never persisted, but prove it is not read */
    S.trackActiveBank[6] = 3;                      /* track 6's OWN bank */
    S.activeTrack = 5;
    S.ledInitComplete = true;
    snd.soundEnterMove(5);
    /* ⚠ Entry lands on the BANK'S PROMPT now (Josh, 2026-08-28: the bank is a
     * door). These steps act on the menu. */
    snd.soundShowMenu();
    if (!snd.soundOpen()) throw new Error('control failed: sound mode did not open');
    if (S.activeBank !== 11)
        throw new Error('control failed: the bank identity was not taken (' + S.activeBank + ')');

    S.bankSelectTick = -1;                         /* the Shift edge's clear */
    shift(true);
    turn();
    globalThis.tick();                             /* ui_tick's reconcile runs here */
    /* ⚠⚠ READ THE FLAG WITH SHIFT STILL DOWN. The Shift RELEASE clears
     * bankSelectTick too (the MoveShift handler clears both edges), so a check
     * placed after shift(false) reads -1 no matter what happened — the first
     * version of this step passed with the bug restored for exactly that
     * reason. */
    const _stamp = S.bankSelectTick;
    shift(false);

    if (S.activeTrack !== 6)
        throw new Error('control failed: the track did not step (' + S.activeTrack + ')');
    /* ⭑ RE-RULED 2026-09-05 (item 20, Josh: "tracks should switch under
     * everything except where it just doesn't make any sense"): the switch
     * FOLLOWS. Every track scrolled onto DOES report SOUND + CONFIG — accepted
     * with the ruling: the bank is recorded per track and that is where those
     * tracks were left. The 08-24 worry is answered by the memory, not by
     * closing the screen. */
    if (!snd.soundActive())
        throw new Error('sound mode CLOSED on the switch — the retired 08-24 rule');
    if (S.activeBank !== 11)
        throw new Error('the new track did not land on SOUND + CONFIG: bank ' + S.activeBank);
    if (snd.soundTrack() !== 6) throw new Error('sound mode still on track ' + snd.soundTrack());
    if (_stamp >= 0)
        throw new Error('the switch re-opened the bank display window (tick ' + _stamp + ')');
    snd.soundExit();

    S.trackRoute[5] = 0; S.trackRoute[6] = 0;
    S.trackActiveBank[5] = 0; S.trackActiveBank[6] = 0;
    S.activeTrack = 2; S.activeBank = 0;
});

step('⚠ a CLAMPED Shift+jog must NOT close sound mode (nothing moved)', () => {
    /* The exit lives inside the `next !== activeTrack` guard. At track 7 a right
     * turn moves nothing, so closing the screen would punish a gesture that did
     * not happen — and it is the easy way to write this fix wrong. */
    S.activeTrack = 7;
    snd.soundEnter(7, 7);
    if (!snd.soundOpen()) throw new Error('control failed: sound mode did not open');
    shift(true); turn(); globalThis.tick(); shift(false);
    if (S.activeTrack !== 7)
        throw new Error('the clamp broke: stepped to ' + S.activeTrack);
    if (!snd.soundOpen())                      /* an unlatched prompt is RESTING: open, not active (2026-09-03) */
        throw new Error('a clamped turn closed sound mode');
    snd.soundExit();
    S.activeTrack = 2; S.activeBank = 0;
});

step('⭑ the follow does NOT record SOUND + CONFIG on the tracks it lands on — only the jog records a bank (Josh, 2026-09-05)', () => {
    /* RE-RULED 2026-09-05 (was the 08-25 "records itself like every other bank"
     * law): "an instrument editor isn't the sound and config bank. Sound config
     * is just a way to get there. NOTHING should set a bank other than the usual
     * bank jog." So a Shift+jog walk through the sound screen changes what is
     * OPEN, never what each track REMEMBERS; passed-through tracks keep their
     * banks by construction. Only a JOG walk (bank mode latched, the bank
     * walk in ui_input_cc) writes trackActiveBank. */
    snd.soundExit();
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackSoundOrigin[t] = -1; }
    S.trackActiveBank[2] = 6;                  /* track 2 starts on AUTOMATION */
    S.trackActiveBank[3] = 1;                  /* track 3's own bank */
    S.activeTrack = 2;
    S.activeBank = 6;
    S.ledInitComplete = true;
    S.bankCardLatched = false;                 /* a GESTURE entry, not the jog */
    snd.soundEnter(2, 2);
    if (S.activeBank !== BANK_SOUND) throw new Error('control: identity not taken for the OPEN mode');
    if (S.trackActiveBank[2] !== 6) throw new Error('a gesture entry RECORDED the bank on track 2: ' + S.trackActiveBank[2]);
    snd.soundShowMenu();                       /* a screen you are IN (the prompt at rest would not follow) */

    shift(true);
    turn(); globalThis.tick();                 /* 2 -> 3: FOLLOWS (2026-09-05) */
    shift(false);
    if (S.activeTrack !== 3) throw new Error('control: did not step to 3');
    if (!snd.soundActive()) throw new Error('control: the switch closed instead of following');
    if (S.trackActiveBank[2] !== 6) throw new Error('leaving track 2 recorded the sound bank on it: ' + S.trackActiveBank[2]);
    if (S.trackActiveBank[3] !== 1) throw new Error('the follow recorded the sound bank on track 3: ' + S.trackActiveBank[3]);
    snd.soundExit();

    /* At rest, coming back to track 2 lands on ITS bank (AUTOMATION) — nothing
     * re-opens, nothing was remembered. */
    S.activeTrack = 3; S.activeBank = 1;
    shift(true);
    send(14, 127); globalThis.tick();          /* 3 -> 2, at rest */
    shift(false);
    globalThis.tick();
    if (S.activeTrack !== 2) throw new Error('control: did not step back to 2 at rest');
    if (S.activeBank !== 6) throw new Error('track 2 came back on bank ' + S.activeBank + ', not its own AUTOMATION');
    if (snd.soundOpen()) throw new Error('the return opened sound mode — nothing was recorded, nothing should re-open');

    /* ⭑ The JOG still records: latched bank mode walking onto SOUND + CONFIG is
     * the one writer — pinned here so the rule is not "never", it is "the jog". */
    S.bankCardLatched = true;
    S.activeBank = BANK_SOUND; S.trackActiveBank[2] = BANK_SOUND;   /* what the bank walk writes (ui_input_cc) */
    snd.soundEnter(2, 2);
    shift(true); turn(); globalThis.tick(); shift(false);           /* 2 -> 3 in bank mode */
    if (S.trackActiveBank[2] !== BANK_SOUND) throw new Error('the jog-recorded bank was lost on the way out: ' + S.trackActiveBank[2]);
    snd.soundExit();
    S.bankCardLatched = false;
});

step('⚠ a track CLOSED deliberately does not come back on SOUND + CONFIG', () => {
    /* Leaving remembers; CLOSING hands the bank back. Without this half the
     * recording is write-only and every track you ever opened the screen on
     * would re-open it forever — the opposite bug, and just as silent. */
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackSoundOrigin[t] = -1; }
    S.trackActiveBank[2] = 6; S.trackActiveBank[3] = 1;
    S.activeTrack = 2;
    S.activeBank = 6;                          /* the live mirror agrees — it is
                                                * what the entry reads as the origin */
    snd.soundEnter(2, 2);
    /* RE-RULED 2026-09-05: a gesture entry does not record the bank at all,
     * so the close has nothing to hand back — the pin below is that it stays
     * on the bank it was entered from, either way. */
    if (S.trackActiveBank[2] !== 6)
        throw new Error('control: entering by gesture recorded the bank: ' + S.trackActiveBank[2]);
    snd.soundExit();                           /* the deliberate close (Back) */
    /* ⭑ THE INVARIANT THIS STEP IS FOR is that the track stops being recorded on
     * SOUND + CONFIG — without it the recording is write-only and every track you
     * ever opened the screen on would re-open it forever.
     * ⚠⚠ WHICH bank it lands on changed on 2026-08-26: a close now returns to the
     * bank it was ENTERED FROM (6 here). It used to be the track's DEFAULT bank
     * per Josh's 2026-08-25 rule, which he retired — "we can get rid of the back
     * goes to default bank entirely" — so Back and the jog now agree. Asserted
     * exactly, not just "not BANK_SOUND", because "returns where you came from"
     * is the new law and deserves a pin of its own. */
    if (S.trackActiveBank[2] === BANK_SOUND)
        throw new Error('the track came back on SOUND + CONFIG — closing must hand the bank back');
    if (S.trackActiveBank[2] !== 6)
        throw new Error('closing landed on ' + S.trackActiveBank[2] + ', not the bank it was ' +
                        'entered from (6)' + (S.trackActiveBank[2] === 0 ?
                        ' — 0 is the RETIRED default-bank close' : ''));

    shift(true); turn(); globalThis.tick();            /* 2 -> 3 */
    send(14, 127); globalThis.tick();                  /* 3 -> 2, back again */
    shift(false);
    if (S.activeTrack !== 2) throw new Error('control: did not return to track 2');
    if (snd.soundActive())
        throw new Error('a track closed deliberately re-opened SOUND + CONFIG on return');
    /* Same retirement as above: the close handed the bank back to the one it was
     * entered from (6), so that is what returning to the track shows. The point
     * of the assertion is unchanged — the track is NOT back on SOUND + CONFIG. */
    if (S.activeBank !== 6)
        throw new Error('expected track 2 back on the bank it was entered from (6), got ' +
                        S.activeBank + (S.activeBank === 0 ? ' — the RETIRED default-bank close'
                                                            : ''));
    S.activeBank = 0;
});

step('⭑ Shift+PAD means exactly what Shift+jog means — one rule, every route', () => {
    /* Josh, 2026-08-24, retiring the follow: "shift+pad should behave the same
     * as scrolling. if 2 sounds mid-edit need comparing, both can just be set
     * to the sound+config bank and they'll land there from shift+pad just like
     * they would from shift+scroll, right?" — right. The per-track memory makes
     * the follow redundant, so the exit moved into _switchActiveTrack and every
     * switch route inherits it instead of six sites agreeing by hand. Since
     * 2026-08-25 that memory IS the recorded bank — trackActiveBank holding
     * BANK_SOUND — not a bit beside it.
     *
     * Bottom-row pads are notes TRACK_PAD_BASE(68)+track under Shift. */
    const padSelect = (t) => globalThis.onMidiMessageInternal(
        new Uint8Array([0x90, 68 + t, 127]));

    snd.soundExit();
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackSoundOrigin[t] = -1; }
    S.trackActiveBank[2] = 6;                  /* track 2 starts on AUTOMATION */
    S.trackActiveBank[4] = 1;                  /* track 4's own bank */
    S.activeTrack = 2;
    S.activeBank = 6;
    S.sessionView = false;
    S.ledInitComplete = true;
    snd.soundEnter(2, 2);
    if (S.activeBank !== BANK_SOUND) throw new Error('control: identity not taken');
    S.bankCardLatched = true;                  /* bank mode: the return re-opens
                                                * only here (the one law) */

    shift(true);
    /* The Shift edge clears the window (both edges do); with the switch now
     * FOLLOWING, nothing else clears the stamp soundEnter above legitimately
     * wrote, so mirror the edge here or the read below sees that entry's stamp. */
    S.bankSelectTick = -1;
    padSelect(4); globalThis.tick();
    if (S.activeTrack !== 4)
        throw new Error('control: Shift+pad did not select track 4 (' + S.activeTrack + ')');
    /* One rule, every route — and since 2026-09-05 that rule is the FOLLOW. */
    if (!snd.soundActive())
        throw new Error('Shift+pad CLOSED sound mode — it must mean what the jog means, which follows now');
    if (S.activeBank !== BANK_SOUND)
        throw new Error('track 4 did not land on SOUND + CONFIG: ' + S.activeBank);

    /* ...and back onto track 2, which was LEFT on the bank: it returns. */
    padSelect(2); globalThis.tick();
    const _stamp = S.bankSelectTick;           /* ⚠⚠ read with Shift still DOWN */
    shift(false);
    if (S.activeTrack !== 2) throw new Error('did not return to track 2');
    if (!snd.soundActive())
        throw new Error('Shift+pad back onto the track did not restore SOUND + CONFIG');
    if (S.activeBank !== BANK_SOUND)
        throw new Error('came back on bank ' + S.activeBank);
    if (_stamp >= 0)
        throw new Error('the return opened the bank display window (tick ' + _stamp + ')');
    snd.soundExit();
    S.bankCardLatched = false;
    S.activeBank = 0;
});

step('⚠ a SESSION bus is not a track sound — a track switch leaves it alone', () => {
    /* The one exclusion in _switchActiveTrack. Master/Send FX are entered from
     * the session FX list, not from a track, so a track switch has nothing to
     * say about them — closing one would be the follow's mistake in reverse. */
    snd.soundExit();
    S.sessionView = true;
    snd.soundEnterBuses();
    send(3, 127); snd.soundTick(); globalThis.tick();   /* enter the bus */
    if (!snd.soundIsGlobal()) throw new Error('control: not on a global bus');
    const _before = snd.soundActive();
    editops._switchActiveTrack(5);
    if (!_before || !snd.soundActive())
        throw new Error('a track switch closed a SESSION bus screen');
    snd.soundExit();
    S.sessionView = false;
    S.activeTrack = 2; S.activeBank = 0;
});

step('⚠ off the menu (slot settings), Shift+jog is NOT the track switch', () => {
    /* Sub-screens reached FROM the menu keep their own jog meaning — in a
     * module editor Shift+jog jumps param sections, which is the gesture this
     * gate is protecting. Slot settings is the one such screen reachable with
     * stub host functions, so it stands in for the class.
     *
     * ⭑ POSITIVE CONTROL first. An earlier version of this step never left the
     * menu (it called test hooks that did not exist) and "passed" the wrong
     * assertion. Proving the switch works HERE, at this exact cursor, means the
     * second half can only pass because the view actually changed. */
    S.activeTrack = 2;
    snd.soundEnter(2, 2);
    snd.soundShowMenu();
    shift(true); turn(); shift(false);
    if (S.activeTrack !== 3)
        throw new Error('control failed: Shift+jog is not switching in the menu');
    S.activeTrack = 2;
    snd.soundEnter(2, 2);
    /* ⚠ The MENU, not the bank's prompt: this step navigates the menu's rows,
     * and on the prompt the jog is declined so it walks banks instead. */
    snd.soundShowMenu();
    snd.soundTick();                 /* rows are built on the tick after entry */

    /* Navigate deterministically to the Sound Control door and open it.
     * ⚠ Do NOT sweep-click rows: `Track to` is now row 0, so a sweep enters its
     * edit and then COMMITS a destination, which changes the route and
     * retargets the screen. That produced a false failure here (and, in an
     * earlier form, a false pass). */
    const st = snd.soundPickStateForTest();
    const target = st.kinds.indexOf('settings');
    if (target < 0) throw new Error('no Sound Control door in the menu');
    /* ⚠ Turn until the ACTUAL cursor arrives — do not count turns. The cursor
     * steps OVER grouping-rule rows, so one turn is not one index, and counting
     * overshot into Presets (which needs host bindings this harness lacks). */
    for (let guard = 0; guard <= st.kinds.length * 2; guard++) {
        if (snd.soundPickStateForTest().row === target) break;
        turn();
        if (guard === st.kinds.length * 2) throw new Error('never reached the Sound Control row');
    }
    send(3, 127);                                  /* jog click -> Sound Control */
    snd.soundTick();
    if (snd.soundPickStateForTest().view === st.view)
        throw new Error('the door did not open — still on the menu view');

    const before = S.activeTrack;
    shift(true); turn(); shift(false);
    if (S.activeTrack !== before)
        throw new Error('a sub-screen stepped the track: ' + before + ' -> ' + S.activeTrack);
});

step('⚠ INSIDE a global bus (Master FX) Shift+jog does not step a track', () => {
    /* ⭑ It must be INSIDE the bus, not on the bus LIST. `enterBus` sets
     * VIEW_BLOCKS with S.bus global, which is the only state where the view
     * test passes and the !soundIsGlobal() test is what stops the switch —
     * a Master FX chain has no track to step.
     *
     * Mutation found this gap: an earlier version stopped at soundEnterBuses()
     * (VIEW_BUSES), where the VIEW condition already blocks the switch, so
     * deleting !soundIsGlobal() entirely left the test green. */
    snd.soundEnterBuses();
    send(3, 127);                                  /* jog click -> enter the bus */
    snd.soundTick();
    if (!snd.soundIsGlobal())
        throw new Error('not in a global bus context');

    const before = S.activeTrack;
    shift(true); turn(); shift(false);
    if (S.activeTrack !== before)
        throw new Error('a global bus stepped the track: ' + before + ' -> ' + S.activeTrack);
});

if (failed) process.exit(1);
console.log('test_sound_shift_jog_track: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
