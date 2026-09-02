/* tests/js/test_automation_push.mjs — the JS half of automation playback.
 *
 * The DSP stages the values it cannot write itself; this module drains them
 * and pushes them at a rate the tick can actually afford. Both halves of that
 * sentence are load-bearing and both are pinned here: what gets written, and
 * how it crosses.
 *
 * How it crosses is the whole design. A round-trip is an SPI frame (~2.9 ms,
 * measured) whatever it carries, against a ~10.6 ms tick with js.tick already
 * at 6.9 ms p50. So the drain is ONE bulk read, and the pushes are ONE bulk
 * write per chain slot — never one round-trip per parameter, which stalled
 * the playhead on device. */

let staged = '';                 /* what the DSP is currently offering */
let flags = ['0', '0', '0'];     /* pa_store_full, pa_ring_dropped, pa_owner_conflict */
const writes = [];               /* every parameter write that reached a chain slot */
const requests = [];             /* every bulk request, in order */
let refuse = 0;                  /* bulk SETs to refuse (simulate timeout) */

function enc(items) { let s = items.length + '\n'; for (const it of items) s += it.length + '\n' + it; return s; }
function dec(blob) {
    const out = []; if (!blob) return out;
    let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; }
    return out;
}
let reads = 0;
globalThis.host_module_get_params = (blob) => {
    const keys = dec(blob);
    requests.push({ kind: 'get', keys });
    return enc(keys.map(k => {
        if (k === 'pa_pending') { reads++; const r = staged; staged = ''; return r; }
        if (k === 'pa_store_full') return flags[0];
        if (k === 'pa_ring_dropped') return flags[1];
        if (k === 'pa_owner_conflict') return flags[2];
        return '';
    }));
};
globalThis.host_module_get_param = (key) => (key === 'pa_list' ? '' : '0');
globalThis.host_module_set_params = (blob) => { requests.push({ kind: 'modset', pairs: dec(blob) }); return true; };
const metaAsked = [];
globalThis.shadow_get_param = (slot, key) => {
    if (key.endsWith(':chain_params')) metaAsked.push(key);
    if (key === 'move_fx:2:fx3:chain_params')
        return JSON.stringify([{ key: 'mix', type: 'float', min: 0, max: 100, step: 1 }]);
    if (key.endsWith(':chain_params'))
        return JSON.stringify([
            { key: 'cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
            { key: 'octave', type: 'int',   min: -2, max: 2 },
            { key: 'mode',   type: 'enum',  options: ['LP', 'HP', 'BP'] },
        ]);
    return '';
};
globalThis.shadow_set_params = (slot, marker, blob, transient) => {
    const items = dec(blob);
    requests.push({ kind: 'set', slot, marker, n: items.length / 2, transient });
    if (refuse > 0) { refuse--; return null; }
    for (let i = 0; i + 1 < items.length; i += 2) writes.push({ slot, key: items[i], val: items[i + 1] });
    return true;
};
let fireAndForget = 0;
globalThis.shadow_set_param = () => { fireAndForget++; return true; };
globalThis.shadow_set_param_timeout = () => { fireAndForget++; return true; };

import { automationTick, automationResetCaches, automationPendingSizeForTest,
         automationRefreshPresence, automationNoteWrite, automationPresentForTest,
         automationPollWarnings }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';
import { tickPrefetch } from '../../ui/ui_dsp_bridge.mjs';   /* the drain rides the tick's one read */

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};
const fresh = () => { writes.length = 0; requests.length = 0; automationResetCaches(); automationNoteWrite(); S.playing = true; S.tickCount = 100; };
const tick = () => { S.tickCount++; tickPrefetch(); automationTick(); };

/* ---- the drain is GATED, and that gate is the point -------------------- */
{
    writes.length = 0; requests.length = 0; automationResetCaches();
    reads = 0; S.playing = true;
    staged = '0:fx1:cutoff 8000';
    for (let i = 0; i < 20; i++) tick();
    check(reads === 0, '⚠ a project with NO automation never reads the queue — not once in 20 ticks');
    check(writes.length === 0, 'and writes nothing');

    globalThis.host_module_get_param = (k) => (k === 'pa_list' ? '0 0 1 1 0:fx1:cutoff\n' : '0');
    automationRefreshPresence();
    check(automationPresentForTest(), 'a project that HAS automation is detected on load');
    tick();
    check(reads > 0 && writes.length === 1, 'and then the queue is drained and pushed');
    globalThis.host_module_get_param = (key) => (key === 'pa_list' ? '' : '0');

    writes.length = 0;
    S.playing = false;
    staged = '0:fx1:cutoff 4000';
    tick();
    check(writes.length === 1 && writes[0].key === 'fx1:cutoff',
          '⚠ the resting value staged on the STOP edge is pushed — a drain gated on S.playing alone loses it');
    for (let i = 0; i < 10; i++) tick();
    const before = reads;
    for (let i = 0; i < 10; i++) tick();
    check(reads === before, 'once the grace after the edge is spent, a stopped transport does not poll');
}

/* ---- ONE round-trip per direction ------------------------------------- */
{
    fresh();
    staged = ['0:fx1:cutoff 8000', '0:fx1:octave 16383', '0:fx1:mode 8191',
              '0:synth:cutoff 100', '0:fx2:cutoff 200'].join('\n');
    tick();
    const gets = requests.filter(r => r.kind === 'get');
    const sets = requests.filter(r => r.kind === 'set');
    check(gets.length === 1, '⚠ the drain is ONE bulk read a tick — the tick\'s own prefetch');
    check(['pa_pending', 'pa_store_full', 'pa_ring_dropped', 'pa_owner_conflict'].every(k => gets[0].keys.includes(k)),
          'and it carries the DSP flags along, so they cost no read of their own');
    check(sets.length === 1 && sets[0].slot === 0 && sets[0].marker === 'chain:' && sets[0].n === 5,
          '⚠ five parameters on one slot cross in ONE bulk write to that slot');
    check(writes.length === 5, 'and each was written exactly once');
    check(sets[0].transient === true,
          '⚠ the push is TRANSIENT — playback, not an edit; a plain SET re-dirties the slot and the host autosaves it at its cap for the whole performance');
    check(fireAndForget === 0, '⚠ nothing goes through the per-parameter paths, blocking or not');
}

/* ---- slots are requests; the budget is requests per tick ---------------- */
{
    fresh();
    staged = ['0:fx1:cutoff 8000', '1:fx1:cutoff 100', '2:fx1:cutoff 200'].join('\n');
    tick();
    let sets = requests.filter(r => r.kind === 'set');
    check(sets.length === 2, 'three slots pending: two requests this tick (the budget)');
    check(automationPendingSizeForTest() === 1, 'the third slot stays pending — not lost');
    tick();
    sets = requests.filter(r => r.kind === 'set');
    check(sets.length === 3 && writes.length === 3, 'and goes next tick');
}

/* ---- a superseded value is never written ------------------------------ */
{
    fresh();
    staged = '0:fx1:cutoff 1000\n0:fx1:cutoff 16383';
    tick();
    check(writes.length === 1, 'one write for a parameter staged twice');
    check(writes[0].val === '1', 'and it carries the NEWER value (16383/16383 -> max 1)');
}

/* ---- values reach the parameter in its own units ---------------------- */
{
    fresh();
    staged = '0:fx1:cutoff 8191';           /* half of 14-bit */
    tick();
    check(writes[0].key === 'fx1:cutoff', 'the key is component-qualified');
    check(writes[0].slot === 0, 'and addressed to the right slot');
    check(Math.abs(parseFloat(writes[0].val) - 0.5) < 0.02,
          'a float parameter gets a value in ITS range, not the raw 14-bit number');

    fresh();
    staged = '0:fx1:octave 0\n0:fx1:octave 16383';
    tick();
    check(writes[0].val === '2', 'an int parameter is rounded to its max (-2..2)');

    fresh();
    staged = '0:fx1:mode 16383';
    tick();
    check(writes[0].val === '2', 'an enum becomes an INDEX, not a fraction');
}

/* ---- a refused (timed-out) request is kept, not lost -------------------- */
{
    fresh();
    /* The DSP records a value as SENT the moment it stages it, and never stages
     * it again until it changes. So a request that times out is a permanent
     * loss — unless JS keeps it. */
    refuse = 1;
    staged = '0:fx1:cutoff 8000\n0:fx1:mode 0';
    tick();
    check(writes.length === 0 && automationPendingSizeForTest() === 2,
          '⚠ a request that TIMED OUT keeps every value it carried pending');
    tick();
    check(writes.length === 2 && automationPendingSizeForTest() === 0, 'and they go next tick');
}

/* ---- the flags: reported once, never lost between drain and poll -------- */
{
    fresh();
    flags = ['1', '0', '3'];
    staged = '';
    tick();                                  /* drain carries the flags */
    flags = ['0', '0', '0'];
    const lines = automationPollWarnings();
    check(lines && lines[1] === 'by track 3', 'an owner conflict seen by the DRAIN is reported by the poll');
    check(automationPollWarnings() === null, 'and only once');
    /* Nothing draining (stopped, quiet): the poll reads the flags itself, in one request. */
    S.playing = false; for (let i = 0; i < 8; i++) tick();   /* 3 grace drains, then quiet */
    requests.length = 0;
    flags = ['0', '1', '0'];
    automationPollWarnings();
    const g = requests.filter(r => r.kind === 'get');
    check(g.length === 1 && g[0].keys.length === 3, 'when nothing has drained lately, the poll reads the three flags in ONE request');
}

/* ---- a Move-bus FX block: the component has colons of its own ---------- */
{
    fresh();
    staged = '0:move_fx:2:fx3:mix 8191';
    tick();
    check(writes[0].slot === 0 && writes[0].key === 'move_fx:2:fx3:mix', 'the write key keeps the whole block prefix');
    check(metaAsked.includes('move_fx:2:fx3:chain_params'), '⚠ the metadata is asked of the BLOCK, not of "move_fx"');
    check(writes[0].val === '50', 'and the value maps into the block\'s own range (0..100)');
}

/* ---- mixer levels: host strip state, ranges declared, no round-trip ------ */
{
    fresh();
    metaAsked.length = 0;
    staged = '0:move_fx:2:volume 4095\n3:slot:pan 8191\n3:slot:send_a 16383\n3:slot:synth_volume 4095';
    tick();
    const byKey = Object.fromEntries(writes.map(w => [w.slot + '/' + w.key, w.val]));
    check(byKey['0/move_fx:2:volume'] === '1', 'a bus Volume maps into its 0..4 gain (4095/16383 -> 1, unity)');
    check(byKey['3/slot:pan'] === '0.5', 'a slot Pan into 0..1 (centre)');
    check(byKey['3/slot:send_a'] === '1', 'a send into 0..1');
    check(byKey['3/slot:synth_volume'] === '1', 'Module Level into its 0..4 gain');
    check(metaAsked.length === 0, '⚠ none of them asked the host for chain_params — the levels publish none');
}

/* ---- a malformed line cannot take the tick down ----------------------- */
{
    fresh();
    staged = 'garbage\n\n0:fx1:cutoff notanumber\nbus:1:volume 8191\n0:fx1:cutoff 500';
    tick(); tick();
    check(writes.some(w => w.key === 'fx1:cutoff'), 'the good lines still push');
    check(writes.some(w => w.key.startsWith('move_fx:1:')), 'a bus level routes to its bus');
}

console.log(bad === 0
    ? `PASS: test_automation_push (${ok} checks)`
    : `FAIL: test_automation_push (${bad} failed)`);
process.exit(bad === 0 ? 0 : 1);
