/* tests/js/test_record_punch.mjs — record is a PUNCH during playback
 * (Josh, 2026-08-31): pressing Record while the transport is running arms
 * IMMEDIATELY (no wait for the bar), and pressing it again stops IMMEDIATELY
 * (no wait for the page edge). Every other path — stopped → count-in, the
 * count-in cancel, adaptive LENGTH growth and its page-multiple lock — is
 * deliberately unchanged, and the steps below pin both halves of that
 * sentence: the punch is immediate, and the length lock still happens.
 *
 * Observables are POSITIVE (set_params that must APPEAR), so a tick that
 * dies upstream fails these steps rather than passing them —
 * [[schwung-tick-swallows-errors-late-stages-never-run]]. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { MoveRec } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const of   = (key) => sets.filter(([k]) => k === key);

step('⭐ punch IN: playing + empty clip arms recording IMMEDIATELY (rv=1, never 2)', () => {
    sets.length = 0;
    S.playing = true; S.recordArmed = false; S.recordCountingIn = false;
    S.clipNonEmpty[2][0] = false; S.clipLengthManuallySet[2][0] = false;
    S.clipLength[2][0] = 16; S.trackCurrentStep[2] = 3;
    cc(MoveRec, 127); cc(MoveRec, 0);
    const rec = of('t2_recording');
    if (rec.length !== 1) throw new Error('t2_recording sent ' + rec.length + ' times: ' + JSON.stringify(sets));
    if (rec[0][1] !== '1') throw new Error('armed with rv=' + rec[0][1] + ' — the bar-deferred arm is retired');
    if (S.recordPendingPage) throw new Error('recordPendingPage set — nothing is pending, the arm was immediate');
    if (!S.recordArmed) throw new Error('not armed');
    if (!S.clipAdaptiveMode[2][0]) throw new Error('adaptive LENGTH mode must survive the immediate arm');
});

step('⭐ punch OUT: second press mid-page locks the length on the NEXT tick and disarms on the one after', () => {
    sets.length = 0;
    S.trackCurrentStep[2] = 3;                    /* mid-page: the old gate waited for step >= 15 */
    cc(MoveRec, 127); cc(MoveRec, 0);
    if (!S.recordScheduledStop || !S.recordStopNow)
        throw new Error('punch-out did not arm the immediate stop');
    globalThis.tick();                            /* tick 1: length lock — NOW, not at the page edge */
    const len = of('t2_c0_length');
    if (len.length !== 1) throw new Error('length not locked on the first tick: ' + JSON.stringify(sets));
    if (len[0][1] !== '16') throw new Error('lock rounded wrong: ' + len[0][1] + ' (page of step 3 is 0..15)');
    if (S.clipAdaptiveMode[2][0]) throw new Error('adaptive mode survived the lock');
    globalThis.tick();                            /* tick 2: the disarm itself */
    const rec = of('t2_recording');
    if (rec.length !== 1 || rec[0][1] !== '0')
        throw new Error('recording=0 not sent on tick 2: ' + JSON.stringify(rec));
    if (S.recordArmed) throw new Error('still armed after the punch-out');
});

step('⚠ unchanged: STOPPED still arms through the count-in, never t_recording', () => {
    sets.length = 0;
    S.playing = false; S.bpmMirror = 120;
    S.clipNonEmpty[2][0] = false; S.clipLengthManuallySet[2][0] = false;
    cc(MoveRec, 127); cc(MoveRec, 0);
    if (!of('record_count_in').length) throw new Error('no count-in: ' + JSON.stringify(sets));
    if (of('t2_recording').length) throw new Error('stopped arm sent t2_recording directly');
    if (!S.recordCountingIn) throw new Error('not counting in');
    /* and the cancel path is untouched */
    sets.length = 0;
    cc(MoveRec, 127); cc(MoveRec, 0);
    if (!of('record_count_in_cancel').length && !of('t2_recording').some(([,v]) => v === '0'))
        throw new Error('count-in press did not cancel: ' + JSON.stringify(sets));
    if (S.recordArmed) throw new Error('still armed after count-in cancel');
});

step('⚠ unchanged: a FIXED clip (non-empty) punches in without entering adaptive mode', () => {
    sets.length = 0;
    S.playing = true; S.clipNonEmpty[2][0] = true;
    cc(MoveRec, 127); cc(MoveRec, 0);
    const rec = of('t2_recording');
    if (rec.length !== 1 || rec[0][1] !== '1') throw new Error(JSON.stringify(rec));
    if (S.clipAdaptiveMode[2][0]) throw new Error('a non-empty clip entered adaptive mode');
    /* fixed punch-out goes straight through disarmRecord — same press, immediate */
    sets.length = 0;
    cc(MoveRec, 127); cc(MoveRec, 0);
    if (!of('t2_recording').some(([,v]) => v === '0'))
        throw new Error('fixed disarm not immediate: ' + JSON.stringify(sets));
    if (S.recordArmed) throw new Error('still armed');
    S.playing = false;
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
