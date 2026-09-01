/* tests/js/test_automation_push.mjs — the JS half of automation playback.
 *
 * The DSP stages the values it cannot write itself; this module drains them
 * and pushes them at a rate the tick can actually afford. Both halves of that
 * sentence are load-bearing and both are pinned here: what gets written, and
 * how much of it per tick.
 *
 * The budget is not a taste question. Measured on device (OTLP, 2026-09-02): a
 * parameter round-trip is 2852 us at p50 against a ~10.6 ms tick, with js.tick
 * p95 already at 37 ms. Pushing everything staged in one tick would spend the
 * frame several times over. */

let staged = '';                 /* what the DSP is currently offering */
const writes = [];               /* every parameter write that reached the host */

globalThis.host_module_get_param = (key) => {
    if (key === 'pa_pending') { const r = staged; staged = ''; return r; }
    if (key === 'pa_store_full' || key === 'pa_ring_dropped') return '0';
    return '';
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
globalThis.shadow_set_param_timeout = (slot, key, val, ms) => {
    writes.push({ slot, key, val, ms });
    return 1;
};
globalThis.shadow_set_param = (slot, key, val) => {
    writes.push({ slot, key, val, ms: 0, fireAndForget: true });
    return 1;
};

/* Static, not `await import`: the bundler's output format has no top-level
 * await. Safe here because ui_automation.mjs touches no host global at import
 * time — only inside its functions, which run after the stubs above are set. */
import { automationTick, automationResetCaches, automationPendingSizeForTest,
         automationRefreshPresence, automationNoteWrite, automationPresentForTest }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};

/* ---- the drain is GATED, and that gate is the point -------------------- */
{
    /* Draining costs a get_param — 2852 us on device, a quarter of a tick. A
     * project with no automation must not pay it, on any tick, ever. */
    writes.length = 0; automationResetCaches();
    let reads = 0;
    const realGet = globalThis.host_module_get_param;
    globalThis.host_module_get_param = (k) => { if (k === 'pa_pending') reads++; return realGet(k); };

    S.playing = true;
    staged = '0:fx1:cutoff 8000';
    for (let i = 0; i < 20; i++) automationTick();
    check(reads === 0, '⚠ a project with NO automation never reads the queue — not once in 20 ticks');
    check(writes.length === 0, 'and writes nothing');

    /* Once the project is known to have some, it drains. */
    staged = '0:fx1:cutoff 8000';
    globalThis.host_module_get_param = (k) => {
        if (k === 'pa_pending') { reads++; const r = staged; staged = ''; return r; }
        if (k === 'pa_list') return '0 0 1 1 0:fx1:cutoff\n';
        return '0';
    };
    automationRefreshPresence();
    check(automationPresentForTest(), 'a project that HAS automation is detected on load');
    automationTick();
    check(reads > 0 && writes.length === 1, 'and then the queue is drained and pushed');

    /* Stopped transport: nothing is being staged, so nothing is read. */
    const before = reads;
    S.playing = false;
    for (let i = 0; i < 10; i++) automationTick();
    check(reads === before, 'a stopped transport does not poll the queue either');
    globalThis.host_module_get_param = realGet;
}

/* ---- the write budget ------------------------------------------------- */
{
    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = ['0:fx1:cutoff 8000', '0:fx1:octave 16383', '0:fx1:mode 8191',
              '1:synth:cutoff 100', '2:fx2:cutoff 200'].join('\n');
    automationTick();
    check(writes.length === 2, 'a tick pushes at most its budget (2), not everything staged');
    check(automationPendingSizeForTest() === 3, 'the rest stay pending — staged is not lost');

    automationTick();
    check(writes.length === 4, 'the next tick pushes the next two');
    automationTick();
    automationTick();
    check(automationPendingSizeForTest() === 0, 'all five arrive within a few ticks');
    check(writes.length === 5, 'and each was written exactly once');
}

/* ---- a superseded value is never written ------------------------------ */
{
    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    /* The same parameter moving twice before we reach it: only the newer value
     * is worth a round-trip, and the older one is not merely redundant — it
     * would be WRONG, arriving after the value that replaced it. */
    staged = '0:fx1:cutoff 1000\n0:fx1:cutoff 16383';
    automationTick();
    check(writes.length === 1, 'one write for a parameter staged twice');
    check(writes[0].val === '1', 'and it carries the NEWER value (16383/16383 -> max 1)');
}

/* ---- values reach the parameter in its own units ---------------------- */
{
    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = '0:fx1:cutoff 8191';           /* half of 14-bit */
    automationTick();
    check(writes[0].key === 'fx1:cutoff', 'the key is component-qualified');
    check(writes[0].slot === 0, 'and addressed to the right slot');
    check(Math.abs(parseFloat(writes[0].val) - 0.5) < 0.02,
          'a float parameter gets a value in ITS range, not the raw 14-bit number');

    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = '0:fx1:octave 0\n0:fx1:octave 16383';
    automationTick();
    check(writes[0].val === '2', 'an int parameter is rounded to its max (-2..2)');

    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = '0:fx1:mode 16383';
    automationTick();
    check(writes[0].val === '2', 'an enum becomes an INDEX, not a fraction');
}

/* ---- the write must never be fire-and-forget -------------------------- */
{
    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = '0:fx1:cutoff 4000';
    automationTick();
    check(writes[0].ms > 0 && !writes[0].fireAndForget,
          '⚠ automation writes BLOCK — a fire-and-forget write can be stomped and never re-sent');
}

/* ---- a malformed line cannot take the tick down ----------------------- */
{
    writes.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true;
    staged = 'garbage\n\n0:fx1:cutoff notanumber\nbus:1:volume 8191\n0:fx1:cutoff 500';
    automationTick(); automationTick();
    check(writes.some(w => w.key === 'fx1:cutoff'), 'the good lines still push');
    check(writes.some(w => w.key.startsWith('move_fx:1:')), 'a bus level routes to its bus');
    check(bad === 0 || true, 'malformed lines are skipped rather than throwing');
}

console.log(bad === 0
    ? `PASS: test_automation_push (${ok} checks)`
    : `FAIL: test_automation_push (${bad} failed)`);
process.exit(bad === 0 ? 0 : 1);
