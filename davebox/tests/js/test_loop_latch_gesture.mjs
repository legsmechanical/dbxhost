import './_bulk_get_stub.mjs';
/* tests/js/test_loop_latch_gesture.mjs — Track View: a Loop TAP latches the
 * loop-length view; a HOLD stays momentary.
 *
 * Every case performs the real gesture through onMidiMessageInternal. The
 * latch is the loop-LENGTH view only (step buttons, jog, screen): pads, Play
 * and the other Loop-held meanings still mean the button is physically down.
 * The taps that already meant something keep it: unlatching a drum repeat,
 * clearing the TARP buffer. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
let printed = [];
globalThis.print = (x, y, t) => { printed.push(String(t)); };
let stepLights = {};
let buttonLights = {};
globalThis.move_midi_internal_send = (m) => {
    const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90 && a[2] >= 16 && a[2] <= 31) stepLights[a[2] - 16] = a[3];
    if (a.length >= 4 && (a[1] & 0xF0) === 0xB0) buttonLights[a[2]] = a[3];
    return true;
};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};


async function main() {
await import('../../ui/ui.js');
const { S, TICK_MS_FOR_TESTS } = await import('../../ui/ui_state.mjs');
const { _padDispatchMutedNow } = await import('../../ui/ui_drummodel.mjs');
const { atOverview } = await import('../../ui/ui_input_cc.mjs');
const { White } = await import('/data/UserData/schwung/shared/constants.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.clockFollowTicks = true;          /* nowMs() off the tick count, so a hold is a number */
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const tap  = (i) => { note(16 + i, 127); note(16 + i, 0); };
const wait = (ms) => { S.tickCount += Math.ceil(ms / TICK_MS_FOR_TESTS); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const COPY = 60, LOOP = 58, BACK = 51, PLAY = 85;
const loopTap  = () => { cc(LOOP, 127); wait(100); cc(LOOP, 0); };
const loopHold = () => { cc(LOOP, 127); wait(600); cc(LOOP, 0); };
const T = 0, AC = 0;
const writes = () => S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)
    .concat(sets).filter(s => /page_copy|loop_set|_length|repeat|tarp_clear|transport/.test(s));

function melodic(len) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.copyHeld = false; S.copySrc = null; S.shiftHeld = false; S.deleteHeld = false;
    S.loopHeld = false; S.loopLatched = false; S.loopLatchEnding = false;
    S.loopGestureStart = -1; S.stepIntervalMode = false; S.recordArmed = false;
    S.globalMenuOpen = false; S.altMode = false;
    S.activeBank = 0; S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = 0; S.trackCurrentPage[T] = 0; S.liveActiveNotes.clear();
    S.clipLength[T][AC] = len; S.clipLoopStart[T][AC] = 0; S.clipTPS[T][AC] = 24;
    for (let i = 0; i < 256; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][2] = 1;
    S.drumRepeatLatched[T] = false; S.drumRepeatHeldPad[T] = -1; S.drumRepeat2LatchedLanes[T].clear();
    S.bankParams[T][5][7] = 0; S.tarpHeldNotes[T].clear();
    S.tickCount += 100;
}

step('⭐ a Loop TAP latches the loop view: a step then sets the length, and Loop again closes it', () => {
    melodic(64);
    loopTap();
    assert(S.loopLatched && !S.loopHeld, 'latched after the tap');
    printed = []; render.drawUI();
    assert(printed.includes('Clip Length'), 'the Loop screen is up: ' + JSON.stringify(printed));
    tap(0);
    const w = writes();
    assert(w.length === 1 && /length|loop_set/.test(w[0]), 'one length write from the step: ' + JSON.stringify(w));
    assert(S.clipSteps[T][AC][0] === 0, 'the step was not toggled');
    loopTap();
    assert(!S.loopLatched && !S.loopHeld, 'a second tap closes it');
    S.pendingDefaultSetParams.length = 0; sets.length = 0;
    tap(5);
    assert(writes().length === 0, 'closed: a step is a step again: ' + JSON.stringify(writes()));
});

step('a HOLD stays momentary', () => {
    melodic(64);
    loopHold();
    assert(!S.loopLatched && !S.loopHeld, 'not latched after a hold');
});

step('a hold while latched closes it on release (and works as a hold meanwhile)', () => {
    melodic(64);
    loopTap();
    cc(LOOP, 127);
    tap(1);
    wait(600); cc(LOOP, 0);
    assert(!S.loopLatched, 'closed');
    assert(writes().length === 1, 'the step still set the length: ' + JSON.stringify(writes()));
});

step('a Loop press used for a step is not a tap: no latch', () => {
    melodic(64);
    cc(LOOP, 127); tap(1); cc(LOOP, 0);
    assert(!S.loopLatched, 'Loop + step does not latch');
});

step('a lone tap on a drum track with a latched repeat unlatches it, and does not latch', () => {
    melodic(64);
    S.trackPadMode[T] = 1; S.drumStepPage[T] = 0; S.activeDrumLane[T] = 0;
    S.drumLaneLength[T] = 64; S.drumLaneLoopStart[T] = 0;
    S.drumRepeatLatched[T] = true; S.drumRepeatHeldPad[T] = 5;
    loopTap();
    assert(!S.drumRepeatLatched[T], 'the repeat unlatched');
    assert(writes().some(w => /drum_repeat_stop/.test(w)), 'repeat stop queued: ' + JSON.stringify(writes()));
    assert(!S.loopLatched, 'the view did not latch');
    loopTap();
    assert(S.loopLatched, 'nothing left to unlatch: the next tap latches');
    loopTap();
});

step('a tap that clears the TARP latch buffer does not latch', () => {
    melodic(64);
    S.bankParams[T][5][7] = 1; S.tarpHeldNotes[T].add(60);
    loopTap();
    assert(writes().some(w => /tarp_clear_latched/.test(w)), 'the buffer cleared: ' + JSON.stringify(writes()));
    assert(!S.loopLatched, 'the view did not latch');
});

step('latched: pads play and Play toggles the transport (only a HELD Loop + Play restarts)', () => {
    melodic(64);
    loopTap();
    assert(!_padDispatchMutedNow(), 'pads are live under a latched view');
    cc(PLAY, 127); cc(PLAY, 0);
    assert(!sets.some(s => /restart_at/.test(s)) && sets.some(s => /^transport=play/.test(s)),
           'Play played: ' + JSON.stringify(sets));
    loopTap();
});

step('Back closes the latched view first, and the Back LED / overview agree', () => {
    melodic(64);
    loopTap();
    assert(!atOverview(), 'a latched view is not the overview');
    cc(BACK, 127); cc(BACK, 0);
    assert(!S.loopLatched, 'Back closed it');
    assert(atOverview(), 'and that is the overview');
});

step('another screen taking over (the global menu, Session) closes it', () => {
    melodic(64);
    loopTap();
    S.globalMenuOpen = true; ticks(2);
    assert(!S.loopLatched, 'the menu closed it');
    S.globalMenuOpen = false;
    loopTap();
    S.sessionView = true; ticks(2);
    assert(!S.loopLatched, 'Session closed it (Session Loop is Perf Mode)');
    assert(!S.loopHeld, 'and Perf Mode did not inherit it');
    S.sessionView = false;
});

step('page copy works latched, and ends with the latch', () => {
    melodic(64);
    loopTap();
    cc(COPY, 127); tap(0); tap(1);
    assert(writes().some(w => w === 't0_c0_page_copy=0 1 0'), 'pasted: ' + JSON.stringify(writes()));
    assert(S.copySrc && S.copySrc.kind === 'page', 'still the page source, Copy held');
    loopTap();
    assert(!S.copySrc, 'the page copy ended with the view');
    cc(COPY, 0);
});

step('the Loop button is solid white while latched', () => {
    melodic(64);
    loopTap();
    buttonLights = {};
    ticks(2);
    assert(buttonLights[LOOP] === White, 'Loop LED ' + buttonLights[LOOP]);
    loopTap();
});

if (failed) { console.log('FAIL: loop latch gesture'); process.exit(1); }
console.log('PASS: loop latch gesture');
}
main().catch(e => { console.error(e); process.exit(1); });
