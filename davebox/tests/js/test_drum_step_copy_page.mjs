import './_bulk_get_stub.mjs';
/* tests/js/test_drum_step_copy_page.mjs — Copy + step on a DRUM track copies
 * the step on the page you are LOOKING at.
 *
 * ⚠ The bug: the handler built the absolute step from trackCurrentPage (the
 * melodic page), but Left/Right on a drum track moves drumStepPage. Past the
 * first page, Copy + step therefore copied (and pasted onto, and cut from)
 * page 1's step instead of the one under your finger. Delete + step already
 * used the drum page.
 *
 * The test performs the real gesture: Right arrow to page 2, hold Copy, press
 * the source step, press the destination step. */

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
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const STEP = (i) => 16 + i;
const COPY = 60, SHIFT = 49, RIGHT = 63;
const T = 0, AC = 0, LANE = 0;
const queued = (key) => S.pendingDefaultSetParams.find(p => p.key === key);

function freshDrumOnPage2() {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.copyHeld = false; S.copySrc = null; S.shiftHeld = false; S.deleteHeld = false;
    S.activeBank = 0; S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = [];
    S.playing = false; S.trackQueuedClip[T] = -1; S.trackActiveClip[T] = AC;
    S.trackPadMode[T] = 1;                       /* drum */
    S.trackCurrentPage[T] = 0; S.drumStepPage[T] = 0;
    S.drumLaneLength[T] = 64; S.drumLaneLoopStart[T] = 0;
    S.activeDrumLane[T] = LANE;
    S.drumLaneSteps[T][LANE] = new Array(256).fill('0');
    S.drumLaneSteps[T][LANE][16 + 2] = '1';      /* a hit on page 2, step 3 */
    S.drumLaneHasNotes[T][LANE] = true;
    cc(RIGHT, 127); cc(RIGHT, 0);                /* the real paging gesture */
    S.tickCount += 100;
}

step('control: Right arrow on a drum track moves the DRUM page, not the melodic one', () => {
    freshDrumOnPage2();
    assert(S.drumStepPage[T] === 1, 'drumStepPage is ' + S.drumStepPage[T]);
    assert(S.trackCurrentPage[T] === 0, 'trackCurrentPage moved to ' + S.trackCurrentPage[T] +
           ' — the rest of this file would not tell the two pages apart');
});

step('⚠ Copy + step on page 2 copies page 2\'s step onto page 2\'s step', () => {
    freshDrumOnPage2();
    cc(COPY, 127);
    note(STEP(2), 127); note(STEP(2), 0);
    assert(S.copySrc && S.copySrc.kind === 'step', 'a step source was taken, got ' + JSON.stringify(S.copySrc));
    assert(S.copySrc.absStep === 18, 'the source is absolute step ' + S.copySrc.absStep + ', expected 18 (page 2, step 3)');
    note(STEP(5), 127); note(STEP(5), 0);
    const w = queued('t0_l0_step_18_copy_to');
    assert(w && w.val === '21', 'expected t0_l0_step_18_copy_to=21, queued ' +
           JSON.stringify(S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)));
    assert(S.drumLaneSteps[T][LANE][21] === '1', 'the mirror shows the hit on page 2, step 6');
    assert(S.drumLaneSteps[T][LANE][5] === '0', 'page 1, step 6 was left alone');
    cc(COPY, 0);
});

step('⚠ Shift + Copy + step (cut) on page 2 cuts page 2\'s step', () => {
    freshDrumOnPage2();
    cc(COPY, 127); cc(SHIFT, 127);
    note(STEP(2), 127); note(STEP(2), 0);
    assert(S.copySrc && S.copySrc.kind === 'cut_step' && S.copySrc.absStep === 18,
           'a cut source at 18 was taken, got ' + JSON.stringify(S.copySrc));
    note(STEP(5), 127); note(STEP(5), 0);
    assert(queued('t0_l0_step_18_copy_to') && queued('t0_l0_step_18_copy_to').val === '21',
           'the cut copied 18 → 21');
    assert(queued('t0_l0_step_18_clear'), 'and cleared the page-2 source, queued ' +
           JSON.stringify(S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)));
    assert(!queued('t0_l0_step_2_clear'), 'page 1\'s step 3 was not cleared');
    cc(SHIFT, 0); cc(COPY, 0);
});

step('control: a melodic track still copies on its own page', () => {
    freshDrumOnPage2();
    S.trackPadMode[T] = 0;
    S.clipLength[T][AC] = 64; S.clipTPS[T][AC] = 24; S.clipLoopStart[T][AC] = 0;
    S.trackCurrentPage[T] = 2; S.drumStepPage[T] = 0;
    for (let i = 0; i < 256; i++) S.clipSteps[T][AC][i] = 0;
    S.clipSteps[T][AC][33] = 1;
    cc(COPY, 127);
    note(STEP(1), 127); note(STEP(1), 0);
    note(STEP(4), 127); note(STEP(4), 0);
    const w = queued('t0_c0_step_33_copy_to');
    assert(w && w.val === '36', 'expected t0_c0_step_33_copy_to=36, queued ' +
           JSON.stringify(S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)));
    cc(COPY, 0);
});

if (failed) { console.log('FAIL: drum Copy + step follows the drum page'); process.exit(1); }
console.log('PASS: drum Copy + step follows the drum page');
}
main().catch(e => { console.error(e); process.exit(1); });
