/* tests/js/test_shift_track_overview.mjs — while SHIFT is held in track view,
 * the AUTOMATION bank yields the screen to the TRACK OVERVIEW.
 *
 * Josh, 2026-08-24: "Shift + jog scroll gesture to switch tracks shouldn't
 * register the touch as a show bank gesture. This currently works exactly as it
 * should for all banks except automation and sound+config."
 *
 * The law it is joining: Shift in track view is the track-SWITCH modifier, and
 * the MoveShift handler clears `jogTouched` + `bankSelectTick` on BOTH edges so
 * the OLED stays on the overview while you step — those two flags are exactly
 * what `inTimeout` reads, so every transient bank screen already stands down.
 *
 * AUTOMATION was the exception because its idle display is PERSISTENT: it draws
 * when NOT inTimeout, so the clear that stands every other bank down was the
 * very condition that kept this one up. You never saw which track you had
 * landed on — the one read-out the gesture exists to produce.
 *
 * ⭑ The observable is the TRACK ROW, not the heading. Both screens draw a bank
 * heading (the overview names the bank it is resting on), so a heading test
 * cannot tell them apart. `drawTrackRow` prints the eight track digits through
 * the host `print` global and the automation graph prints nothing that way at
 * all — a signal that matches the mechanism instead of sitting near it.
 *
 * (The SOUND + CONFIG half of Josh's report is a different mechanism — the
 * track-FOLLOW re-stamping the display window — and is pinned in
 * test_sound_shift_jog_track.mjs.)
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

let prints = [];
globalThis.clear_screen = () => { prints = []; };
globalThis.print = (x, y, t) => { prints.push(String(t)); };
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
globalThis.set_pixel = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'shadow_set_param', 'shadow_get_param',
                  'host_send_midi', 'move_midi_inject_to_move', 'shadow_send_midi_to_dsp',
                  'host_set_led', 'host_get_setting', 'host_set_setting', 'set_led',
                  'host_vol_block', 'host_edit_cc_block', 'move_midi_internal_send'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const render = await import('../../ui/ui_render.mjs');
const { S }  = await import('../../ui/ui_state.mjs');
const { BANKS, NUM_TRACKS } = await import('../../ui/ui_constants.mjs');

/* ⚠ `S.bankParams` is null until init() builds it from BANKS, and the track
 * overview reads it — importing the renderer alone threw inside drawUI, which
 * reads as the subject misbehaving rather than as missing setup. Built the same
 * way init() builds it, so the shape cannot drift from the real one. */
if (S.bankParams === null)
    S.bankParams = Array.from({ length: NUM_TRACKS }, () =>
        BANKS.map((b) => b.knobs.map((k) => k.def)));

/* ⚠ Clear the BOOT gate, or drawUI paints "LOADING" and returns — every
 * assertion below would then measure the splash. (The mixer render test paid
 * for this one already.) */
S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
S.sessionView = false;
S.globalMenuOpen = false;
S.actionPopupEndTick = -1;
S.stretchBlockedEndTick = -1;
S.heldStep = -1;
S.activeTrack = 2;
S.activeBank = 6;                  /* AUTOMATION */
S.knobTouched = -1;
S.jogTouched = false;
S.bankSelectTick = -1;
S.loopHeld = false;
S.altMode = false;
S.stepIntervalMode = false;

function draw() { globalThis.clear_screen(); render.drawUI(); }
/* The eight track digits, printed only by drawTrackRow. */
const trackRowDrawn = () => [1,2,3,4,5,6,7,8].every((n) => prints.indexOf(String(n)) >= 0);
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

step('⭑ idle on AUTOMATION now rests on the OVERVIEW — the graph is an in-mode screen', () => {
    /* Rewritten 2026-09-01 (the one law): the always-on idle graph is what
     * Josh could not back out of on device. Outside bank mode, bank 6 idles
     * on the overview like every bank; the graph shows latched. */
    S.shiftHeld = false; S.bankCardLatched = false;
    draw();
    if (!trackRowDrawn())
        throw new Error('idle bank 6 did not rest on the track overview');
    S.bankCardLatched = true;
    draw();
    if (trackRowDrawn())
        throw new Error('bank mode on AUTOMATION did not show the graph');
});

step('⭑ Shift held: AUTOMATION stands down and the TRACK OVERVIEW draws', () => {
    S.bankCardLatched = true;                  /* the graph is up (in mode) */
    S.shiftHeld = true;
    draw();
    if (!trackRowDrawn())
        throw new Error('the automation graph still covers the track overview ' +
                        'while Shift is held — you cannot see which track you switched to');
});

step('⚠ a Shift+KNOB gesture still gets the bank overview, not the track row', () => {
    /* Shift is not only the track-switch modifier — it also pages some banks
     * under a held knob. That case must be untouched: a touched knob takes the
     * bank-overview branch ABOVE the idle graph, so gating the graph on Shift
     * cannot reach it. Pinned because the obvious over-fix (gating the whole
     * bank on Shift) would break it silently. */
    S.shiftHeld = true;
    S.knobTouched = 3;
    draw();
    if (trackRowDrawn())
        throw new Error('Shift+knob fell through to the track overview — the bank ' +
                        'overview must still win while a knob is held');
    S.knobTouched = -1;
});

step('⚠ Shift released: the graph comes straight back', () => {
    S.shiftHeld = false;                        /* still latched from above */
    draw();
    if (trackRowDrawn())
        throw new Error('the graph did not return on the Shift release — the ' +
                        'stand-down must be momentary, not a mode');
});

step('⭑ a NORMAL bank was already correct — same gesture, same answer', () => {
    /* The comparison Josh made. Bank 1 has no persistent screen, so idle
     * already rests on the overview and Shift changes nothing. If this ever
     * fails, the fix above has leaked out of bank 6. */
    S.activeBank = 1;
    S.bankCardLatched = false;                 /* out of bank mode */
    S.shiftHeld = false; draw();
    const idle = trackRowDrawn();
    S.shiftHeld = true;  draw();
    const held = trackRowDrawn();
    if (!idle || !held)
        throw new Error('a normal bank stopped resting on the track overview (idle=' +
                        idle + ' shift=' + held + ')');
    S.shiftHeld = false;
    S.activeBank = 6;
});

if (failed) process.exit(1);
console.log('test_shift_track_overview: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
