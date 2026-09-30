import './_bulk_get_stub.mjs';
/* tests/js/test_page_copy_gesture.mjs — PAGE copy: hold Loop + Copy, tap a
 * page, tap another.
 *
 * Josh, 2026-09-30: "Sequence page copy/paste: Allow entire sequence pages to
 * be copied and pasted while holding the loop button using copy+step button.
 * works like all other copy operations (Sticky, etc.). if a paste would extend
 * beyond the clip length, then extend the clip length to accommodate."
 *
 * Every case performs the real gesture through onMidiMessageInternal and
 * asserts the ONE queued DSP write, the mirror, the popup and the lights. The
 * two gestures it sits between must keep working: Loop + step alone sets the
 * length, Copy + step alone copies a step. (The paste itself is pinned in C:
 * tests/test_page_copy.c.) */

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
globalThis.move_midi_internal_send = (m) => {
    const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90 && a[2] >= 16 && a[2] <= 31) stepLights[a[2] - 16] = a[3];
    return true;
};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const render = await import('../../ui/ui_render.mjs');
const { kitHintsForTest } = await import('../../ui/ui_movy.mjs');
const pills = () => JSON.stringify(kitHintsForTest());
const { White } = await import('/data/UserData/schwung/shared/constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const tap  = (i) => { note(16 + i, 127); note(16 + i, 0); };
const COPY = 60, SHIFT = 49, LOOP = 58;
const T = 0, AC = 0, LANE = 3;
const writes = () => S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)
    .concat(sets).filter(s => /page_copy|loop_set|_length|copy_to|repeat/.test(s));
const popup = () => (S.actionPopupLines || []).join(' / ');

function melodic(len, ls) {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.copyHeld = false; S.copySrc = null; S.shiftHeld = false; S.deleteHeld = false; S.loopHeld = false;
    S.loopGestureStart = -1; S.stepIntervalMode = false; S.recordArmed = false;
    S.activeBank = 0; S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = 0; S.trackCurrentPage[T] = 0;
    S.clipLength[T][AC] = len; S.clipLoopStart[T][AC] = ls || 0; S.clipTPS[T][AC] = 24;
    for (let i = 0; i < 256; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][2] = 1; S.clipSteps[T][AC][9] = 1; S.clipSteps[T][AC][20] = 1;
    S.actionPopupLines = [];
    S.tickCount += 100;
}
function drum(len) {
    melodic(16);
    S.trackPadMode[T] = 1; S.drumStepPage[T] = 0; S.activeDrumLane[T] = LANE;
    S.drumLaneLength[T] = len; S.drumLaneLoopStart[T] = 0;
    S.drumLaneSteps[T][LANE] = new Array(256).fill('0');
    S.drumLaneSteps[T][LANE][4] = '1';
    S.drumLaneHasNotes[T][LANE] = true;
}

step('⭐ Loop + Copy + page, then another page: ONE page_copy write, the pages copied, the clip grown', () => {
    melodic(32);
    cc(LOOP, 127); cc(COPY, 127);
    tap(0);
    assert(S.copySrc && S.copySrc.kind === 'page' && S.copySrc.page === 0, 'the page source: ' + JSON.stringify(S.copySrc));
    assert(popup() === 'COPIED', 'the popup says COPIED, got ' + popup());
    tap(3);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_c0_page_copy=0 3 0', 'queued ' + JSON.stringify(w));
    assert(S.clipSteps[T][AC][50] === 1 && S.clipSteps[T][AC][57] === 1, 'the mirror has page 1 on page 4');
    assert(S.clipLength[T][AC] === 64 && S.clipLoopStart[T][AC] === 0, 'the mirror grew to 64 steps');
    assert(popup() === 'PASTED / 64 steps', 'the popup names the new length, got ' + popup());
    assert(S.pendingStepsReread === 2 && S.pendingStepsRereadClip === AC, 'the steps are reread');
    cc(COPY, 0); cc(LOOP, 0);
    assert(writes().length === 1, 'no length write on release: ' + JSON.stringify(writes()));
});

step('sticky: keep holding Copy and paste the same page again', () => {
    melodic(64);
    cc(LOOP, 127); cc(COPY, 127);
    tap(0); tap(1); tap(2);
    const w = writes();
    assert(w.length === 2 && w[0] === 't0_c0_page_copy=0 1 0' && w[1] === 't0_c0_page_copy=0 2 0',
           'queued ' + JSON.stringify(w));
    assert(popup() === 'PASTED', 'no length named when nothing grew, got ' + popup());
    cc(COPY, 0); cc(LOOP, 0);
});

step('Copy first, then Loop: the same gesture', () => {
    melodic(32);
    cc(COPY, 127); cc(LOOP, 127);
    tap(0); tap(1);
    assert(writes()[0] === 't0_c0_page_copy=0 1 0', 'queued ' + JSON.stringify(writes()));
    cc(LOOP, 0); cc(COPY, 0);
});

step('Shift + Copy cuts, and the pasted page becomes the source', () => {
    melodic(64);
    cc(LOOP, 127); cc(SHIFT, 127); cc(COPY, 127);
    tap(0);
    assert(S.copySrc.kind === 'cut_page' && popup() === 'CUT', 'a cut source: ' + JSON.stringify(S.copySrc));
    tap(2);
    assert(writes()[0] === 't0_c0_page_copy=0 2 1', 'queued ' + JSON.stringify(writes()));
    assert(S.clipSteps[T][AC][2] === 0 && S.clipSteps[T][AC][34] === 1, 'the mirror moved the page');
    assert(S.copySrc.kind === 'page' && S.copySrc.page === 2, 'the source is now page 3: ' + JSON.stringify(S.copySrc));
    tap(3);
    assert(writes()[1] === 't0_c0_page_copy=2 3 0', 'the next paste copies from page 3: ' + JSON.stringify(writes()));
    cc(COPY, 0); cc(SHIFT, 0); cc(LOOP, 0);
});

step('a paste before the loop start moves it back', () => {
    melodic(16, 32);
    S.clipSteps[T][AC][33] = 1;
    cc(LOOP, 127); cc(COPY, 127);
    tap(2); tap(0);
    assert(S.clipLoopStart[T][AC] === 0 && S.clipLength[T][AC] === 48, 'mirror window ' +
           S.clipLoopStart[T][AC] + '+' + S.clipLength[T][AC]);
    cc(COPY, 0); cc(LOOP, 0);
});

step('an unlit page (outside the clip) is not a source', () => {
    melodic(16);
    cc(LOOP, 127); cc(COPY, 127);
    tap(5);
    assert(!S.copySrc && writes().length === 0, 'took ' + JSON.stringify(S.copySrc));
    cc(COPY, 0); cc(LOOP, 0);
});

step('releasing Loop ends the page copy; Copy + step is a step copy again', () => {
    melodic(32);
    cc(LOOP, 127); cc(COPY, 127);
    tap(0);
    cc(LOOP, 0);
    assert(!S.copySrc, 'the page source was dropped: ' + JSON.stringify(S.copySrc));
    tap(2); tap(5);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_c0_step_2_copy_to=5', 'a step copy: ' + JSON.stringify(w));
    cc(COPY, 0);
});

step('a step source picked before Loop is not mixed into a page copy', () => {
    melodic(32);
    cc(COPY, 127);
    tap(2);
    cc(LOOP, 127);
    tap(1);
    assert(writes().length === 0, 'swallowed, queued ' + JSON.stringify(writes()));
    cc(LOOP, 0); cc(COPY, 0);
});

step('control: Loop + step alone still sets the length', () => {
    melodic(16);
    cc(LOOP, 127);
    tap(3);
    cc(LOOP, 0);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_c0_loop_set=' + String((0 << 16) | 64), 'queued ' + JSON.stringify(w));
});

step('control: Copy + step alone still copies a step', () => {
    melodic(16);
    cc(COPY, 127);
    tap(2); tap(7);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_c0_step_2_copy_to=7', 'queued ' + JSON.stringify(w));
    cc(COPY, 0);
});

step('refused while recording, as length changes are', () => {
    melodic(32);
    S.recordArmed = true; S.recordCountingIn = false;
    cc(LOOP, 127); cc(COPY, 127);
    tap(0); tap(1);
    assert(writes().length === 0 && !S.copySrc, 'queued ' + JSON.stringify(writes()));
    cc(COPY, 0); cc(LOOP, 0);
    S.recordArmed = false;
});

step('drum track: the active lane, grown on its own', () => {
    drum(16);
    cc(LOOP, 127); cc(COPY, 127);
    tap(0); tap(1);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_l3_page_copy=0 1 0', 'queued ' + JSON.stringify(w));
    assert(S.drumLaneSteps[T][LANE][20] === '1' && S.drumLaneLength[T] === 32, 'the lane mirror');
    assert(S.pendingDrumLaneResync === 2 && S.pendingDrumLaneResyncLane === LANE, 'the lane is reread');
    cc(COPY, 0); cc(LOOP, 0);
});

step('drum ALL LANES: behind the confirm, then one all-lanes write', () => {
    drum(16);
    S.activeBank = 7; S.allLanesConfirmed = false;
    cc(LOOP, 127); cc(COPY, 127);
    tap(0);
    assert(!S.copySrc && S.bankCardLatched, 'the confirm is asked first');
    S.allLanesConfirmed = true;
    tap(0); tap(1);
    const w = writes();
    assert(w.length === 1 && w[0] === 't0_all_lanes_page_copy=0 1 0', 'queued ' + JSON.stringify(w));
    assert(S.pendingDrumResync === 2, 'the whole drum clip is reread');
    cc(COPY, 0); cc(LOOP, 0);
    S.activeBank = 0; S.allLanesConfirmed = false; S.bankCardLatched = false;
});

step('a quick Loop + Copy on a drum track does not unlatch the repeat', () => {
    drum(32);
    S.drumRepeatLatched[T] = true; S.drumRepeatHeldPad[T] = 5;
    S.loopTapUnlatchTrack = -1;
    cc(LOOP, 127); cc(COPY, 127);
    tap(0); tap(1);
    cc(COPY, 0); cc(LOOP, 0);
    assert(S.drumRepeatLatched[T], 'the repeat is still latched; queued ' + JSON.stringify(writes()));
    S.drumRepeatLatched[T] = false; S.drumRepeatHeldPad[T] = -1;
});

step('the source page blinks white on the step buttons', () => {
    melodic(64);
    cc(LOOP, 127); cc(COPY, 127);
    tap(1);
    /* The host's setLED caches, so a phase only SENDS a change: trace the
     * sends across light, dark, light. */
    const seen = [];
    for (const ms of [220, 0, 220]) {
        S.clockMs = ms; stepLights = {};
        leds.invalidateLEDCache(); leds.updateStepLEDs();
        seen.push(stepLights[1]);
    }
    assert(seen[0] === White && seen[1] === 0 && seen[2] === White, 'page 2 sent ' + JSON.stringify(seen));
    cc(COPY, 0); cc(LOOP, 0);
});

step('the screen says Copy page, then PASTE on the footer', () => {
    melodic(32);
    cc(LOOP, 127); cc(COPY, 127);
    S.actionPopupLines = []; S.actionPopupEndTick = 0;
    printed = []; render.drawUI();
    assert(printed.includes('Copy page'), 'drew ' + JSON.stringify(printed));
    assert(pills() === '[["STEP","COPY"]]', 'footer ' + pills());
    tap(0);
    S.actionPopupLines = []; S.actionPopupEndTick = 0;
    printed = []; render.drawUI();
    assert(pills() === '[["STEP","PASTE"]]', 'footer ' + pills());
    cc(SHIFT, 127); cc(COPY, 0); cc(COPY, 127);
    printed = []; render.drawUI();
    assert(printed.includes('Cut page'), 'Shift: ' + JSON.stringify(printed));
    cc(SHIFT, 0); cc(COPY, 0);
    printed = []; render.drawUI();
    assert(printed.includes('Clip Length') && pills() === '[["STEP","PAGE"],["JOG","STEP"]]',
           'Copy released: the Loop view is back: ' + JSON.stringify(printed) + ' ' + pills());
    cc(LOOP, 0);
});

if (failed) { console.log('FAIL: page copy gesture'); process.exit(1); }
console.log('PASS: page copy gesture');
}
main().catch(e => { console.error(e); process.exit(1); });
