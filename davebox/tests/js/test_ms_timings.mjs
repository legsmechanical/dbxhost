/* tests/js/test_ms_timings.mjs — UI timings are MILLISECONDS on the one clock,
 * never tick counts (the 2026-09-02 law; this file pins the 2026-09-05 residue).
 *
 * Why a pin: a tick-counted duration is silent. It reads fine, the suite is
 * green, and on the device it is 3.6× shorter than the day it was written
 * because the tick got faster. Four of these were live regressions when they
 * were converted: the select-handoff window (~4 s against a 6.5 s measured
 * handoff — the watchdog wedge), the preset audition debounce (~44 ms), the
 * pad-watch window (~80 ms, "the tap did nothing") and the idle poll (~70 ms,
 * 3.6× the round-trips). */
import { readFileSync } from 'fs';
let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

const MS = [
    ['ui/ui_sound.mjs',       ['PATCH_RELIST_MS', 'PREVIEW_DELAY_MS', 'VOL_SHOW_MS', 'POLL_IDLE_MS', 'PAD_WATCH_MS']],
    ['ui/ui_constants.mjs',   ['VOL_CARD_MS']],
    ['ui/ui_tick.mjs',        ['SELECT_HANDOFF_MS']],
    ['ui/ui_daves.mjs',       ['SCAN_STEP_MS']],
];
const GONE = ['PATCH_RELIST_TICKS', 'PREVIEW_DELAY_TICKS', 'VOL_SHOW_TICKS', 'POLL_IDLE_TICKS',
              'PAD_WATCH_TICKS', 'VOL_CARD_TICKS', 'SELECT_HANDOFF_TICKS', 'SCAN_STEP_TICKS',
              'BANK_PICKER_SETTLE_TICKS', 'bankPickerIdleTick', 'selectHandoffTicks',
              'padWatchLeft', 'previewDelay', 'patchRelist ', 'S.tickCount % POLL_IDLE'];
const all = {};
for (const [f] of MS) all[f] = readFileSync(f, 'utf8');
for (const f of ['ui/ui_persistence.mjs', 'ui/ui_render.mjs', 'ui/ui_input_cc.mjs', 'ui/ui_state.mjs'])
    all[f] = readFileSync(f, 'utf8');

for (const [f, names] of MS)
    step(`${f}: ${names.join(', ')} are declared in milliseconds`, () => {
        for (const n of names)
            if (!new RegExp(`^(export )?const ${n} = [0-9]+;`, 'm').test(all[f]))
                throw new Error(`${n} is not a numeric ms constant`);
    });
step('no tick-counted name survives in any of the touched files', () => {
    for (const f of Object.keys(all))
        for (const g of GONE)
            if (all[f].includes(g)) throw new Error(`${f} still mentions ${g}`);
});
step('deadlines are compared against the clock, not the tick count', () => {
    const s = all['ui/ui_sound.mjs'];
    if (!s.includes('S.clockMs <= S.volShownUntil')) throw new Error('vol readout');
    if (!s.includes('S.clockMs < S.patchRelistAt')) throw new Error('patch relist');
    if (!s.includes('S.clockMs >= S.previewAt')) throw new Error('preview');
    if (!s.includes('S.clockMs >= S.padWatchUntil')) throw new Error('pad watch');
    if (!s.includes('(S.clockMs - S.lastIdlePollMs) >= POLL_IDLE_MS')) throw new Error('idle poll');
    if (!all['ui/ui_render.mjs'].includes('S.clockMs > S.tvCardUntil')) throw new Error('vol card');
});
process.exit(failed);
