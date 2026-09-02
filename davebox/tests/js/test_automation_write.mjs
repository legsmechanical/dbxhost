/* tests/js/test_automation_write.mjs — the WRITE side of per-parameter
 * automation: what a knob edit in the chain editor turns into.
 *
 * The grammar under test is the spec's (param-automation-spec.md §3): a held
 * step + a turn is a p-lock; playing with Record on records; playing with
 * Record off overrides and resumes on release; stopped is just a knob. The
 * DSP decides record-vs-override from its own flags, so what is pinned here
 * is what JS SENDS, in what order, once per what — and that it all crosses
 * as ONE bulk write a tick, live values coalesced. */

const sets = [];                          /* every module write that crossed, in order */
const requests = [];
let refuse = 0;
function enc(items) { let s = items.length + '\n'; for (const it of items) s += it.length + '\n' + it; return s; }
function dec(blob) {
    const out = []; if (!blob) return out;
    let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; }
    return out;
}
let staged = '';
let presenceReads = 0;
globalThis.host_module_get_params = (blob) => enc(dec(blob).map(k => {
    if (k === 'pa_pending') { const r = staged; staged = ''; return r; }
    return '0';
}));
globalThis.host_module_get_param = (key) => { if (key === 'pa_list') { presenceReads++; return ''; } return '0'; };
globalThis.host_module_set_params = (blob) => {
    const items = dec(blob);
    requests.push(items.length / 2);
    if (refuse > 0) { refuse--; return null; }
    for (let i = 0; i + 1 < items.length; i += 2) sets.push(items[i] + '=' + items[i + 1]);
    return true;
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
globalThis.shadow_set_params = (slot, marker, blob) => {
    const items = dec(blob);
    for (let i = 0; i + 1 < items.length; i += 2) writes.push({ slot, key: items[i], val: items[i + 1] });
    return true;
};

import { automationParamEdit, automationParamTouch, automationTick, automationResetCaches,
         automationNoteWrite, automationGestureCountForTest, automationPendingSizeForTest,
         automationModuleWriteCountForTest, automationPresentForTest }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';
import { tickPrefetch } from '../../ui/ui_dsp_bridge.mjs';

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};
function reset(o) {
    automationResetCaches();
    sets.length = 0; requests.length = 0; writes.length = 0; presenceReads = 0;
    S.heldStep = -1; S.playing = false; S.recordArmed = false; S.tickCount = 100;
    S.clipTPS[0][0] = 24;
    Object.assign(S, o || {});
}
const tick = () => { S.tickCount++; tickPrefetch(); automationTick(); };
const T = 0, C = 0, SLOT = 1;

/* ---- stopped, nothing held: a knob is a knob ---------------------------- */
{
    reset();
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', false);
    tick();
    check(sets.length === 0 && requests.length === 0, 'stopped with no step held: NOTHING is written, no request made');
    check(automationGestureCountForTest() === 0, 'and the gesture is gone on release');
}

/* ---- a held step + a turn = a p-lock ------------------------------------ */
{
    reset({ heldStep: 3 });
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    check(sets.length === 0 && automationModuleWriteCountForTest() === 4,
          'from the MIDI handler nothing crosses yet — it is buffered for the tick');
    tick();
    check(requests.length === 1 && requests[0] === 4, '⚠ ...and crosses as ONE bulk write');
    check(sets[0] === 't0_pa_rest=0 1:fx1:cutoff 4096',
          '⚠ the resting value is the value BEFORE the first edit (0.25 -> 4096), not the new one');
    check(sets[1] === 't0_c0_undo_checkpoint=1', 'one undo checkpoint opens the gesture');
    check(sets[2] === 't0_pa_hold=1:fx1:cutoff', 'the target is held while the lock is dialled');
    check(sets[3] === 't0_pa_set2=0 1:fx1:cutoff 72 95 8192',
          'the lock covers the held step in clip ticks (step 3 x 24 = 72..95) at the NEW value');
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.75', '0.5');
    tick();
    check(sets.length === 5 && sets[4] === 't0_pa_set2=0 1:fx1:cutoff 72 95 12287',
          'a second turn in the same gesture writes the lock again — no second rest, no second checkpoint, no second hold');
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', false);
    tick();
    check(sets.length === 5, 'a touch release while the step is still held ends nothing');
    S.heldStep = -1;
    tick();
    check(sets.length === 6 && sets[5] === 't0_pa_live_end=1:fx1:cutoff', 'the step coming up releases the hold');

    reset({ heldStep: 0, playing: true, recordArmed: true });
    automationParamEdit(T, C, SLOT, 'fx1:octave', '2', '0');
    tick();
    check(sets.some(x => x.startsWith('t0_pa_set2=0 1:fx1:octave 0 23 16383')),
          'held step during playback: the lock, not a live record (int 2 of -2..2 -> 16383)');
    check(!sets.some(x => x.startsWith('t0_pa_live')), 'and nothing goes live');
}

/* ---- a lock is held by the STEP, and playback keeps off it ------------- */
{
    reset({ heldStep: 2, playing: true });
    automationNoteWrite();
    /* No touch-down: while a pad is held the editor may never see one. */
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    tick();
    check(sets.some(x => x === 't0_pa_hold=1:fx1:cutoff'), '⚠ dialling a lock tells the DSP to HOLD the target');
    check(S.stepHoldPromote === true, '⚠ and promotes the step press to a HOLD, so a fast release cannot tap-toggle the note');
    check(sets.indexOf('t0_pa_hold=1:fx1:cutoff') < sets.findIndex(x => x.startsWith('t0_pa_set2')), 'before the lock write');
    for (let i = 0; i < 40; i++) tick();                       /* a long pause mid-dial */
    check(automationGestureCountForTest() === 1, '⚠ the gesture does NOT expire while the step is held — even with no touch');
    staged = '1:fx1:cutoff 9000';
    tick();
    check(writes.length === 0, 'and playback is not pushed under the hand');
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', false);   /* a stray release */
    tick();
    check(automationGestureCountForTest() === 1, 'a touch release does not end it either — the step does');
    S.heldStep = -1;
    tick();
    check(automationGestureCountForTest() === 0 && sets.some(x => x === 't0_pa_live_end=1:fx1:cutoff'),
          '⚠ the step coming up ends the gesture and hands the target back to playback');
}

/* ---- playing: live, and the DSP decides record vs override ------------- */
{
    reset({ playing: true, recordArmed: false });
    automationParamTouch(T, C, SLOT, 'fx1:mode', true);
    automationParamEdit(T, C, SLOT, 'fx1:mode', '2', '1');
    tick();
    check(sets[0] === 't0_pa_rest=0 1:fx1:mode 8192', 'rest first (enum index 1 of 3 -> 8192)');
    check(sets[1] === 't0_pa_live=1:fx1:mode 16383', 'then the live value (enum index 2 -> max)');
    check(sets.length === 2, '⚠ Record OFF: no undo checkpoint — an override changes nothing that undo could restore');
    /* Three detents in one tick: one live write, the newest value. */
    automationParamEdit(T, C, SLOT, 'fx1:mode', '0', '2');
    automationParamEdit(T, C, SLOT, 'fx1:mode', '1', '0');
    automationParamEdit(T, C, SLOT, 'fx1:mode', '0', '1');
    tick();
    check(sets.length === 3 && sets[2] === 't0_pa_live=1:fx1:mode 0',
          '⚠ three detents in a tick are ONE live write, at the newest value — never a backlog');
    check(automationPresentForTest(), 'the drain gate opened the moment something went live');
    automationParamTouch(T, C, SLOT, 'fx1:mode', false);
    tick();
    check(sets[3] === 't0_pa_live_end=1:fx1:mode', '⚠ release ends the live target on the NEXT tick — that is what makes automation RESUME');
    check(presenceReads === 1, 'and the gesture end asks the DSP ONCE whether anything was actually recorded');

    reset({ playing: true, recordArmed: true });
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    tick();
    check(sets[1] === 't0_c0_undo_checkpoint=1' && sets[2] === 't0_pa_live=1:fx1:cutoff 8192',
          'Record ON: the checkpoint is booked before the first live value');
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.6', '0.5');
    tick();
    check(sets.filter(x => x.includes('undo_checkpoint')).length === 1, 'ONE checkpoint per gesture');
}

/* ---- a refused module write is retried whole, in order ----------------- */
{
    reset({ playing: true, recordArmed: true });
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');
    refuse = 1;
    tick();
    check(sets.length === 0 && automationModuleWriteCountForTest() === 3, 'a refused bulk write keeps everything it carried');
    tick();
    check(sets.length === 3 && sets[0].startsWith('t0_pa_rest') && sets[2].startsWith('t0_pa_live'),
          'and it goes next tick, same order');
}

/* ---- touch wins: a target under a hand is not pushed -------------------- */
{
    reset({ playing: true });
    automationNoteWrite();
    automationParamTouch(T, C, SLOT, 'fx1:cutoff', true);
    staged = '1:fx1:cutoff 4000\n1:fx1:octave 100';
    tick();
    check(writes.length === 1 && writes[0].key === 'fx1:octave',
          '⚠ the touched parameter is NOT pushed while the hand is on it; the other still is');
    check(automationPendingSizeForTest() === 0, 'and the suppressed value is dropped, not kept (the DSP re-asserts on release)');
}

/* ---- a gesture with no touch-down ends on its own ----------------------- */
{
    reset({ playing: true });
    automationParamEdit(T, C, SLOT, 'fx1:cutoff', '0.5', '0.25');   /* no touch seen: sensor missed */
    check(automationGestureCountForTest() === 1, 'a turn without a touch still opens a gesture');
    for (let i = 0; i < 30; i++) tick();
    check(automationGestureCountForTest() === 0, '⚠ ...and it ends after ~270 ms of stillness');
    check(sets.some(x => x === 't0_pa_live_end=1:fx1:cutoff'),
          'with a live_end, so automation resumes even when the touch sensor missed');
}

console.log(bad === 0
    ? `PASS: test_automation_write (${ok} checks)`
    : `FAIL: test_automation_write (${bad} failed)`);
process.exit(bad === 0 ? 0 : 1);
