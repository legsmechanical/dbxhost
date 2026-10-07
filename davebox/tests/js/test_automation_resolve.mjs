/* tests/js/test_automation_resolve.mjs — THE ENGINE IS TOLD HOW TO WRITE EACH
 * AUTOMATED PARAMETER ITSELF, and the per-tick drain closes when it is.
 *
 * A step's lock used to reach its parameter through here: staged by the
 * engine, read on the next tick, written a frame later — after the note it
 * belonged to (tester, 2026-10-05: "the real automation actually occurs one
 * step late"). The engine can now write a chain parameter in its own render,
 * ahead of the step's notes, for every target this side has DESCRIBED to it
 * (set_param "pa_resolve"). This file pins the describing:
 *
 *   - what is described, in which words, and what never is (seq:, mac:, MIDI
 *     targets, a key the module does not publish — the engine must not guess);
 *   - that the description says the same thing wireValue DOES — the same
 *     expected strings as the engine's own formatter test
 *     (tests/test_param_auto_host_write.c), so the two cannot drift apart;
 *   - that with everything described the tick stops reading the ring, and
 *     starts again the moment something needs it;
 *   - that a module swap takes the description back (pa_unresolve).
 *
 * The stub engine here delivers a staged value ONLY for a target it has not
 * been given a resolution for — which is what the real one does. */

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
    /* A MODULE bus insert publishes its own metadata under its own prefix —
     * chain_bus.c serves "bus<N>:fx<K>:chain_params". A range nothing else
     * declares, so a write in these units can only have come from here. */
    if (key === 'bus1:fx2:chain_params')
        return JSON.stringify([{ key: 'drive', type: 'float', min: 0, max: 24, step: 0.5 }]);
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


import * as auto from '../../ui/ui_automation.mjs';
import { automationTick, automationResetCaches, automationRefreshPresence,
         automationInvalidateMeta, automationWireValue,
         automationResolvedForTest, automationRingNeededForTest }
    from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';
import { tickPrefetch } from '../../ui/ui_dsp_bridge.mjs';
import { POLL_INTERVAL, SEQ_AUTO_TARGETS } from '../../ui/ui_constants.mjs';

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};
const tick = () => { S.tickCount++; tickPrefetch(); automationTick(); };
/* Every pa_resolve / pa_unresolve that reached the engine, in order. */
const modsets = () => {
    const out = [];
    for (const r of requests) if (r.kind === 'modset')
        for (let i = 0; i + 1 < r.pairs.length; i += 2) out.push([r.pairs[i], r.pairs[i + 1]]);
    return out;
};
const resolves = () => modsets().filter(([k]) => k === 'pa_resolve').map(([, v]) => v);
const drains = () => requests.filter(r => r.kind === 'get' && r.keys.includes('pa_pending')).length;
const SEQ_KEY = Object.keys(SEQ_AUTO_TARGETS)[0];
const list = (targets) => targets.map(t => '0 0 1 1 ' + t).join('\n') + '\n';
let ringAny = '0';
const baseGetParams = globalThis.host_module_get_params;
globalThis.host_module_get_params = (blob) => {
    const keys = dec(blob);
    if (!keys.includes('pa_ring_any')) return baseGetParams(blob);
    requests.push({ kind: 'get', keys });
    return enc(keys.map(k => (k === 'pa_ring_any' ? ringAny : k === 'pa_pending' ? (() => { const r = staged; staged = ''; return r; })() : '0')));
};
function load(targets) {
    writes.length = 0; requests.length = 0; metaAsked.length = 0; staged = ''; ringAny = '0';
    automationResetCaches();
    S.playing = true; S.tickCount = 1000 * POLL_INTERVAL + 1;      /* not a poll tick */
    globalThis.host_module_get_param = (k) => (k === 'pa_list' ? list(targets) : '0');
    automationRefreshPresence();
}

/* ---- what is described, and in which words ------------------------------ */
{
    load(['2:synth:cutoff', '2:synth:octave', '2:synth:mode', '2:slot:volume', '2:synth:unknown',
          'bus:1:volume', 'seq:2:' + SEQ_KEY, 'mac:2:3', 'cc:74', 'at']);
    for (let i = 0; i < 4; i++) tick();
    const r = resolves();
    check(r.includes('2:synth:cutoff 2 synth:cutoff 0 0 1 0.01'), 'a float: slot, chain key, kind 0, min, max, step');
    check(r.includes('2:synth:octave 2 synth:octave 1 -2 2 0'), 'an int: kind 1, its range');
    check(r.includes('2:synth:mode 2 synth:mode 2 0 2 0'), 'an enum: kind 2, the last option index');
    check(r.includes('2:slot:volume 2 slot:volume 0 0 4 0.01'), 'a slot level: the 0..4 gain declared here, no module read');
    check(r.includes('bus:1:volume 0 move_fx:1:volume 0 0 1 0.0001'), 'a bus level: slot 0, the move_fx key, four decimals');
    check(!r.some(v => v.startsWith('2:synth:unknown ')), '⚠ a key the module does not publish is NOT described — the engine must not guess a range');
    check(!r.some(v => /^(seq|mac):/.test(v) || /^(cc:74|at) /.test(v)), 'seq:, mac: and MIDI targets are never described');
    check(r.length === 5, 'and nothing else is (got ' + r.length + ')');
    check(automationResolvedForTest('2:synth:cutoff') !== null && automationResolvedForTest('2:synth:unknown') === null,
          'the mirror agrees with what was sent');
    requests.length = 0;
    for (let i = 0; i < 12; i++) tick();
    check(resolves().length === 0, 'a description is sent once, not every tick');
}

/* ---- a repeated element takes the bare key's metadata ------------------- */
{
    const prev = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (slot, key) => (key === 'synth:chain_params'
        ? JSON.stringify([{ key: 'transpose', type: 'int', min: -48, max: 48 }]) : prev(slot, key));
    load(['4:synth:pad3_transpose']);
    for (let i = 0; i < 3; i++) tick();
    check(resolves().includes('4:synth:pad3_transpose 4 synth:pad3_transpose 1 -48 48 0'),
          '⚠ pad3_transpose is described as the int -48..48 its bare key publishes, not a 0..1 float');
    globalThis.shadow_get_param = prev;
}

/* ---- the description says what wireValue does --------------------------- */
{
    /* The SAME expectations as the engine's formatter table. */
    const prev = globalThis.shadow_get_param;
    globalThis.shadow_get_param = (slot, key) => (key === 'synth:chain_params' ? JSON.stringify([
        { key: 'cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'bip',    type: 'float', min: -1, max: 1, step: 0.01 },
        { key: 'freq',   type: 'float', min: 20, max: 20000, step: 1 },
        { key: 'nostep', type: 'float', min: 0, max: 1 },
        { key: 'tr',     type: 'int',   min: -48, max: 48 },
        { key: 'cc',     type: 'int',   min: 0, max: 127 },
        { key: 'mode',   type: 'enum',  options: ['a', 'b', 'c', 'd'] },
    ]) : prev(slot, key));
    automationResetCaches();
    const T = [
        ['5:synth:cutoff', 0, '0'], ['5:synth:cutoff', 16383, '1'], ['5:synth:cutoff', 8192, '0.5'], ['5:synth:cutoff', 6062, '0.37'],
        ['5:slot:volume', 4096, '1'], ['5:synth:bip', 0, '-1'], ['5:synth:bip', 4096, '-0.5'],
        ['5:synth:freq', 8192, '10011'], ['bus:1:volume', 1234, '0.0753'], ['5:synth:nostep', 8192, '0.5'],
        ['5:synth:tr', 0, '-48'], ['5:synth:tr', 16383, '48'], ['5:synth:tr', 8192, '0'], ['5:synth:cc', 8127, '63'],
        ['5:synth:mode', 0, '0'], ['5:synth:mode', 16383, '3'], ['5:synth:mode', 8192, '2'],
        ['5:synth:mode', 2730, '0'], ['5:synth:mode', 2731, '1'],
    ];
    let wrong = [];
    for (const [t, n, want] of T) { const got = automationWireValue(t, n); if (got !== want) wrong.push(t + '@' + n + ' -> ' + got + ' (want ' + want + ')'); }
    check(wrong.length === 0, '⚠ wireValue gives the strings the engine\'s formatter is pinned to' + (wrong.length ? ': ' + wrong.join('; ') : ''));
    globalThis.shadow_get_param = prev;
}

/* ---- with everything described, the tick stops reading the ring --------- */
{
    load(['2:synth:cutoff', '2:slot:volume', 'cc:74']);
    for (let i = 0; i < 12; i++) tick();                      /* resolve + the forced window */
    check(!automationRingNeededForTest(), 'rig: every target is described (or MIDI), nothing needs the ring');
    requests.length = 0;
    for (let i = 0; i < 40; i++) tick();
    check(drains() === 0, '⚠ 40 playing ticks, every target described: the ring is not read once');
    const checks = requests.filter(r => r.kind === 'get' && r.keys.includes('pa_ring_any')).length;
    check(checks > 0 && checks <= Math.ceil(40 / POLL_INTERVAL) + 1,
          'the engine is asked on the POLL whether anything is waiting (' + checks + ' in 40 ticks)');

    /* control: one target the engine cannot write, and the per-tick read is back */
    load(['2:synth:cutoff', 'seq:2:' + SEQ_KEY]);
    for (let i = 0; i < 12; i++) tick();
    requests.length = 0;
    for (let i = 0; i < 40; i++) tick();
    check(drains() === 40, '⚠ control: with a seq: target listed the ring is read every tick again (' + drains() + '/40)');
}

/* ---- the engine says a value is waiting: the drain reopens -------------- */
{
    load(['2:synth:cutoff']);
    for (let i = 0; i < 12; i++) tick();
    requests.length = 0; writes.length = 0;
    staged = '2:synth:cutoff 16383'; ringAny = '1';           /* it refused, or hit its cap */
    for (let i = 0; i < POLL_INTERVAL * 2 + 2; i++) tick();
    check(writes.some(w => w.slot === 2 && w.key === 'synth:cutoff' && w.val === '1'),
          '⚠ a value the engine staged after all is found within a poll and pushed');
    check(resolves().filter(v => v.startsWith('2:synth:cutoff ')).length === 1,
          'and the target is described to the engine again (it had lost it, or refused)');
    ringAny = '0';
}

/* ---- a module swap takes the description back --------------------------- */
{
    load(['2:synth:cutoff', '3:synth:cutoff']);
    for (let i = 0; i < 12; i++) tick();
    requests.length = 0;
    automationInvalidateMeta(2);
    tick();
    const ms = modsets();
    const iu = ms.findIndex(([k, v]) => k === 'pa_unresolve' && v === '2');
    const ir = ms.findIndex(([k, v]) => k === 'pa_resolve' && v.startsWith('2:synth:cutoff '));
    check(iu >= 0, '⚠ the engine is told to forget that slot (pa_unresolve 2)');
    check(ir > iu, 'and the target is described again AFTER it, from fresh metadata');
    check(!ms.some(([k, v]) => k === 'pa_resolve' && v.startsWith('3:')), 'another slot\'s description is left alone');
    requests.length = 0;
    automationInvalidateMeta();
    tick(); tick(); tick();
    check(modsets().some(([k, v]) => k === 'pa_unresolve' && v === 'all'), 'no slot named = all of them (a project load)');
}

/* ---- metadata that cannot be read yet is retried, not guessed ----------- */
{
    const prev = globalThis.shadow_get_param;
    let failing = true;
    globalThis.shadow_get_param = (slot, key) => (failing && key.endsWith(':chain_params') ? null : prev(slot, key));
    load(['2:synth:cutoff']);
    for (let i = 0; i < 5; i++) tick();
    check(resolves().length === 0 && automationRingNeededForTest(),
          '⚠ a failed metadata read describes nothing and keeps the ring open');
    failing = false;
    for (let i = 0; i < 30; i++) tick();
    check(resolves().includes('2:synth:cutoff 2 synth:cutoff 0 0 1 0.01'), 'and it is described once the read succeeds');
    globalThis.shadow_get_param = prev;
}

/* ---- one component read a tick ----------------------------------------- */
{
    load(['2:synth:cutoff', '2:fx1:cutoff', '2:fx2:cutoff']);
    metaAsked.length = 0;
    tick();
    check(metaAsked.length === 1, '⚠ the first tick reads ONE component\'s metadata, not three (' + metaAsked.length + ')');
    for (let i = 0; i < 40; i++) tick();
    check(resolves().length === 3, 'and all three are described within a few ticks');
}

console.log(bad ? `test_automation_resolve: ${bad} FAILED` : `test_automation_resolve: all ${ok} passed`);
process.exit(bad ? 1 : 0);
