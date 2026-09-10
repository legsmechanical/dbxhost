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
/* ⚠⚠⚠ THIS STEP ONCE ENFORCED THE BUG IT WAS WRITTEN TO PREVENT (fixed
 * 2026-09-10). It matched the NAME `S.clockMs` and concluded "compared against
 * the clock". In `ui_sound.mjs` that name is a field of SOUND MODE'S OWN state
 * object — the second `S` ([[schwung-davebox-two-state-objects]]) — which has
 * no clock at all. Every one of these five comparisons was therefore
 * `undefined <= n`, i.e. permanently FALSE: the volume read-out never drew, the
 * preset audition never fired, the pad watch never expired and the idle poll
 * never ran. Green the whole time, because the string was there.
 * Josh found it by hand: "track volume changes but there's no overlay."
 *
 * The names below now read GS — davebox's real state, where the tick writes the
 * clock. ⭑ And the pin that actually protects this is NOT here: it is the
 * behavioural one in test_shift_volume_everywhere.mjs, which draws the frame
 * and demands the card. A name pin cannot see which object it is naming. */
step('deadlines are compared against the LIVE clock — the one the tick writes, on the object that has it', () => {
    const s = all['ui/ui_sound.mjs'];
    if (!s.includes('GS.clockMs <= S.volShownUntil')) throw new Error('vol readout');
    if (!s.includes('GS.clockMs < S.patchRelistAt')) throw new Error('patch relist');
    if (!s.includes('GS.clockMs >= S.previewAt')) throw new Error('preview');
    if (!s.includes('GS.clockMs >= S.padWatchUntil')) throw new Error('pad watch');
    if (!s.includes('(GS.clockMs - S.lastIdlePollMs) >= POLL_IDLE_MS')) throw new Error('idle poll');
    /* ui_render's `S` IS davebox's state — one object there, so it is correct. */
    if (!all['ui/ui_render.mjs'].includes('S.clockMs > S.tvCardUntil')) throw new Error('vol card');
});
/* The SCAN that catches the next one of these: any field read off sound mode's
 * own `S` that the object never declares and nothing ever assigns is an
 * `undefined` waiting to poison a comparison. A table catches a wrong value;
 * only a scan catches a second source. */
step('⭑⭑ sound mode reads NO field its own state object does not have', () => {
    const src = all['ui/ui_sound.mjs'];
    /* Comments mention `S.activeBank` and friends as prose — strip them, or the
     * scan reports the documentation. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const i = code.indexOf('const S = {');
    const j = code.indexOf('\n};', i);
    if (i < 0 || j < 0) throw new Error('could not find sound mode\'s state literal');
    const lit = code.slice(i, j);
    const declared = new Set([...lit.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
    const assigned = new Set([...code.matchAll(/\bS\.(\w+)\s*=[^=]/g)].map((m) => m[1]));
    const body = code.slice(0, i) + code.slice(j);
    const unknown = [...new Set([...body.matchAll(/\bS\.(\w+)\b/g)].map((m) => m[1]))]
        .filter((f) => !declared.has(f) && !assigned.has(f));
    if (unknown.length)
        throw new Error('read off sound mode\'s S but never declared or assigned there — '
            + 'these are undefined, and an undefined in a comparison is silently false: '
            + unknown.join(', '));
});
process.exit(failed);
