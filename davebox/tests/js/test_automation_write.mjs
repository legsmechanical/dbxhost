/* tests/js/test_automation_write.mjs — the WRITE side of per-parameter
 * automation: what a knob edit in the chain editor turns into.
 *
 * The grammar under test is the spec's (param-automation-spec.md §3): a held
 * step + a turn is a p-lock; playing with Record on records; playing with
 * Record off overrides and resumes on release; stopped is just a knob. The
 * DSP decides record-vs-override from its own flags, so what is pinned here
 * is what JS SENDS, in what order, and once per what. */

const sets = [];                          /* every deferred set_param, in order */
let staged = '';
globalThis.host_module_get_param = (key) => {
    if (key === 'pa_pending') { const r = staged; staged = ''; return r; }
    return '0';
};
globalThis.shadow_get_param = (slot, key) => {
    if (key.endsWith(':chain_params'))
        return JSON.stringify([
            { key: 'cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
            { key: 'octave', type: 'int',   min: -2, max: 2 },
            { key: 'mode',   type: 'enum',  options: ['LP', 'HP', 'BP'] },
        ]);
    return '';
};
const writes = [];
globalThis.shadow_set_param_timeout = (slot, key, val, ms) => { writes.push({ slot, key, val }); return true; };

import { automationParamEdit, automationParamTouch, automationTick, automationResetCaches,
         automationNoteWrite, automationGestureCountForTest, automationPendingSizeForTest }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};
function reset(o) {
    automationResetCaches();
    S.pendingDefaultSetParams.length = 0;
    S.heldStep = -1; S.playing = false; S.recordArmed = false;
    S.clipTPS[0][0] = 24;
    Object.assign(S, o || {});
}
const drained = () => S.pendingDefaultSetParams.map(x => x.key + '=' + x.val);
const T = 0, C = 0, SLOT = 1;

/* ---- stopped, nothing held: a knob is a knob ---------------------------- */
{
    reset();
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', false);
    check(drained().length === 0, 'stopped with no step held: NOTHING is written to the store');
    check(automationGestureCountForTest() === 0, 'and the gesture is gone on release');
}

/* ---- a held step + a turn = a p-lock ------------------------------------ */
{
    reset({ heldStep: 3 });
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    const d = drained();
    check(d[0] === 't0_pa_rest=0 1:fx1:cutoff 4096',
          '⚠ the resting value is the value BEFORE the first edit (0.25 -> 4096), not the new one');
    check(d[1] === 't0_c0_undo_checkpoint=1', 'one undo checkpoint opens the gesture');
    check(d[2] === 't0_pa_set2=0 1:fx1:cutoff 72 95 8192',
          'the lock covers the held step in clip ticks (step 3 x 24 = 72..95) at the NEW value');
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.75', '0.5');
    const d2 = drained();
    check(d2.length === 4 && d2[3] === 't0_pa_set2=0 1:fx1:cutoff 72 95 12287',
          'a second turn in the same gesture writes the lock again — no second rest, no second checkpoint');
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', false);
    check(drained().length === 4, 'releasing after a lock sends no live_end — nothing was live');

    /* A lock while PLAYING is still a lock (Move: hold a step during playback). */
    reset({ heldStep: 0, playing: true, recordArmed: true });
    automationParamEdit(T, C, SLOT, 'fx1:octave', '2', '0');
    check(drained().some(x => x.startsWith('t0_pa_set2=0 1:fx1:octave 0 23 16383')),
          'held step during playback: the lock, not a live record (int 2 of -2..2 -> 16383)');
    check(!drained().some(x => x.startsWith('t0_pa_live')), 'and nothing goes live');
}

/* ---- playing: live, and the DSP decides record vs override ------------- */
{
    reset({ playing: true, recordArmed: false });
    automationParamTouch(T, C, SLOT, 'fx1:mode', true);
    automationParamEdit(T, C, SLOT, 'fx1:mode', '2', '1');
    let d = drained();
    check(d[0] === 't0_pa_rest=0 1:fx1:mode 8192', 'rest first (enum index 1 of 3 -> 8192)');
    check(d[1] === 't0_pa_live=1:fx1:mode 16383', 'then the live value (enum index 2 -> max)');
    check(d.length === 2, '⚠ Record OFF: no undo checkpoint — an override changes nothing that undo could restore');
    automationParamEdit(T, C, SLOT, 'fx1:mode', '0', '2');
    check(drained().length === 3 && drained()[2] === 't0_pa_live=1:fx1:mode 0', 'every turn re-sends the live value');
    automationParamTouch(T, C, SLOT, 'fx1:mode', false);
    check(drained()[3] === 't0_pa_live_end=1:fx1:mode', '⚠ release ends the live target — that is what makes automation RESUME');

    reset({ playing: true, recordArmed: true });
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    d = drained();
    check(d[1] === 't0_c0_undo_checkpoint=1' && d[2] === 't0_pa_live=1:fx1:cutoff 8192',
          'Record ON: the checkpoint is booked before the first live value');
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.6', '0.5');
    check(drained().filter(x => x.includes('undo_checkpoint')).length === 1, 'ONE checkpoint per gesture');
}

/* ---- touch wins: a target under a hand is not pushed -------------------- */
{
    reset({ playing: true });
    automationNoteWrite();
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    staged = '1:fx1:cutoff 4000\n1:fx1:octave 100';
    automationTick();
    check(writes.length === 1 && writes[0].key === 'fx1:octave',
          '⚠ the touched parameter is NOT pushed while the hand is on it; the other still is');
    check(automationPendingSizeForTest() === 0, 'and the suppressed value is dropped, not kept (the DSP re-asserts on release)');
}

/* ---- a gesture with no touch-down ends on its own ----------------------- */
{
    reset({ playing: true });
    writes.length = 0;
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');   /* no touch seen: sensor missed */
    check(automationGestureCountForTest() === 1, 'a turn without a touch still opens a gesture');
    for (let i = 0; i < 30; i++) automationTick();
    check(automationGestureCountForTest() === 0, '⚠ ...and it ends after ~270 ms of stillness');
    check(drained().some(x => x === 't0_pa_live_end=1:fx1:cutoff'),
          'with a live_end, so automation resumes even when the touch sensor missed');
}

console.log(bad === 0
    ? `PASS: test_automation_write (${ok} checks)`
    : `FAIL: test_automation_write (${bad} failed)`);
process.exit(bad === 0 ? 0 : 1);
