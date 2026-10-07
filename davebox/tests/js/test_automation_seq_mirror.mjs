/* tests/js/test_automation_seq_mirror.mjs — AN AUTOMATED BANK KNOB: THE ENGINE
 * MOVES IT, THE SCREEN FOLLOWS.
 *
 * A `seq:<track>:<key>` lane (NOTE FX, HARMONIZE, DELAY, SEQ ARP, the
 * directions) used to be played from this side: the engine staged each value,
 * the tick read it and wrote it back — a tick and a frame after the note it
 * belonged to, and for as long as one such lane existed the ring was read on
 * every tick of a playing session. The engine applies them itself now
 * (tests/test_param_auto_seq_apply.c). What is pinned HERE:
 *
 *   - the engine's table IS the automatable half of SEQ_AUTO_TARGETS — every
 *     key, both ends of its range, and which pad mode it belongs to. One side
 *     drifting from the other is a lane that silently does nothing;
 *   - while playing, the POLL reads where the engine has each knob and hands
 *     it to the mirror — and for a couple of polls after Stop, when the
 *     resting values land;
 *   - nothing is read for it when stopped, or when no bank-knob lane exists;
 *   - a knob under a hand is not mirrored over. */
import './_bulk_get_stub.mjs';
import { readFileSync } from 'node:fs';

let LIST = '';
let SEQVALS = '';
const asked = [];
globalThis.host_module_get_param = (k) => {
    asked.push(k);
    if (k === 'pa_list') return LIST;
    if (k === 'pa_seq_vals') return SEQVALS;
    if (k === 'pa_pending') return '';
    return '0';
};
globalThis.host_module_set_params = () => true;
globalThis.host_module_set_param = () => {};
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_set_param = () => true;
globalThis.shadow_set_param_timeout = () => true;

import { automationTick, automationResetCaches, automationRefreshPresence, automationRegisterSeqApply,
         automationParamTouch, automationWantsSeqVals } from '../../ui/ui_automation.mjs';
import { S } from '../../ui/ui_state.mjs';
import { tickPrefetch } from '../../ui/ui_dsp_bridge.mjs';
import { POLL_INTERVAL, SEQ_AUTO_TARGETS } from '../../ui/ui_constants.mjs';

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};
const mirrored = [];
automationRegisterSeqApply((t, k, v) => { mirrored.push(t + ' ' + k + ' ' + v); return true; });
const tick = () => { S.tickCount++; tickPrefetch(); automationTick(); };
const ticks = (n) => { for (let i = 0; i < n; i++) tick(); };
const seqReads = () => asked.filter(k => k === 'pa_seq_vals').length;
function load(list) {
    automationResetCaches();
    LIST = list; SEQVALS = ''; asked.length = 0; mirrored.length = 0;
    S.playing = false; S.tickCount = 1000 * POLL_INTERVAL;
    automationRefreshPresence();
    asked.length = 0;
}

/* ---- the engine's table is the automatable half of ours ----------------- */
{
    const src = readFileSync('dsp/seq8_param_auto.c', 'utf8');
    const body = src.slice(src.indexOf('pa_seq_defs[] = {'), src.indexOf('#define PA_SEQ_COUNT'));
    const rows = [...body.matchAll(/\{\s*"([a-zA-Z0-9_]+)",\s*(-?\d+),\s*(-?\d+),\s*PA_SEQ_(MELODIC|DRUM)\s*\}/g)]
        .map(m => ({ key: m[1], min: +m[2], max: +m[3], drum: m[4] === 'DRUM' }));
    check(rows.length > 20, 'rig: the engine table was found (' + rows.length + ' rows)');
    const ours = Object.values(SEQ_AUTO_TARGETS).filter(t => t.automatable !== false);
    check(Object.values(SEQ_AUTO_TARGETS).some(t => t.automatable === false),
          'control: SEQ_AUTO_TARGETS still holds non-automatable keys (ARP IN), so the filter matters');
    const diffs = [];
    for (const t of ours) {
        const r = rows.find(x => x.key === t.key);
        if (!r) { diffs.push(t.key + ': not in the engine'); continue; }
        if (r.min !== t.min || r.max !== t.max) diffs.push(t.key + ': ' + r.min + '..' + r.max + ' there, ' + t.min + '..' + t.max + ' here');
        if (r.drum !== (t.bank === 7)) diffs.push(t.key + ': pad mode differs');
    }
    for (const r of rows) if (!ours.some(t => t.key === r.key)) diffs.push(r.key + ': the engine applies a key that is not automatable here');
    check(diffs.length === 0, '⚠ the engine\'s table and SEQ_AUTO_TARGETS agree on every key, range and pad mode'
          + (diffs.length ? ' — ' + diffs.join('; ') : ' (' + rows.length + ' keys)'));
}

/* ---- playing: the poll reads it, the mirror gets it --------------------- */
{
    load('2 0 1 4 seq:2:noteFX_gate 0 0\n');
    check(!automationWantsSeqVals(), 'stopped, no clip change: nothing is wanted');
    ticks(POLL_INTERVAL * 3);
    check(seqReads() === 0, '⚠ stopped: the engine is not asked at all (' + seqReads() + ')');

    S.playing = true;
    SEQVALS = '2 noteFX_gate 200\n2 delay_clock_fb -40\n';
    ticks(POLL_INTERVAL * 5);
    check(seqReads() >= 4 && seqReads() <= 6, 'playing: asked once a POLL, not once a tick (' + seqReads() + ' in ' + POLL_INTERVAL * 5 + ' ticks)');
    check(mirrored.includes('2 noteFX_gate 200') && mirrored.includes('2 delay_clock_fb -40'),
          '⚠ every value the engine reports reaches the mirror: ' + JSON.stringify(mirrored.slice(0, 2)));
    check(!asked.includes('pa_pending'), '⚠ and the staged-value ring is never read for it');

    /* Stop: the resting values land a block later — they must still be shown. */
    S.playing = false;
    SEQVALS = '2 noteFX_gate 100\n';
    mirrored.length = 0; asked.length = 0;
    ticks(POLL_INTERVAL * 6);
    check(mirrored.includes('2 noteFX_gate 100'), '⚠ after Stop the resting value is still mirrored');
    check(seqReads() >= 1 && seqReads() <= 3, 'and then the reading stops (' + seqReads() + ' reads after Stop)');
}

/* ---- a hand on the knob wins -------------------------------------------- */
{
    load('2 0 1 4 seq:2:noteFX_gate 0 0\n2 0 1 4 seq:2:harm_octaver 0 0\n');
    S.playing = true;
    automationParamTouch(2, 0, 'seq', '2:noteFX_gate', true);
    SEQVALS = '2 noteFX_gate 17\n2 harm_octaver 3\n';
    mirrored.length = 0;
    ticks(POLL_INTERVAL * 2);
    check(mirrored.includes('2 harm_octaver 3'), 'control: the untouched knob is mirrored');
    check(!mirrored.some(m => m.startsWith('2 noteFX_gate ')), '⚠ the knob under a hand is NOT mirrored over');
    automationParamTouch(2, 0, 'seq', '2:noteFX_gate', false);
}

/* ---- no bank-knob lane: the key is never asked for ---------------------- */
{
    load('2 0 1 1 2:synth:cutoff 0 0\n');
    S.playing = true;
    ticks(POLL_INTERVAL * 4);
    check(seqReads() === 0, '⚠ a project with no bank-knob lane never asks (' + seqReads() + ')');
    load('2 0 1 4 seq:2:noteFX_gate 0 0\n');
    S.playing = true;
    ticks(POLL_INTERVAL * 2);
    check(seqReads() > 0, 'control: with one, it does');
}

console.log(bad ? 'test_automation_seq_mirror: ' + bad + ' FAILED' : 'test_automation_seq_mirror: all ' + ok + ' ok');
process.exit(bad ? 1 : 0);
