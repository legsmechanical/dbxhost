/* tests/js/test_sound_shift_jog_track.mjs — Shift+jog switches TRACK from
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
globalThis.fill_rect = () => {};
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

const send  = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (on) => send(49, on ? 127 : 0);
const turn  = () => send(14, 1);                 /* +1 detent */

function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

step('setup: sound mode on a Schwung track, at its menu', () => {
    S.sessionView = false;
    S.globalMenuOpen = false;
    for (let t = 0; t < 8; t++) S.trackRoute[t] = 0;   /* all Schwung */
    S.activeTrack = 2;
    snd.soundEnter(2, 2);
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
    shift(true); turn(); shift(false);
    if (S.activeTrack !== 3)
        throw new Error('control failed: Shift+jog is not switching in the menu');
    S.activeTrack = 2;
    snd.soundEnter(2, 2);
    snd.soundTick();                 /* rows are built on the tick after entry */

    /* Navigate deterministically to the Sound Control door and open it.
     * ⚠ Do NOT sweep-click rows: `Track to` is now row 0, so a sweep enters its
     * edit and then COMMITS a destination, which changes the route and
     * retargets the screen. That produced a false failure here (and, in an
     * earlier form, a false pass). */
    const st = snd.soundPickStateForTest();
    const target = st.kinds.indexOf('settings');
    if (target < 0) throw new Error('no Sound Control door in the menu');
    for (let i = st.row; i !== target; i = (i + 1) % st.kinds.length) turn();
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
