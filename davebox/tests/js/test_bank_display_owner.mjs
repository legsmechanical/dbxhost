/* The transient bank display window has ONE owner: armBankDisplay /
 * standDownBankDisplay in ui_state.
 *
 * ⚠⚠ WHY. `bankSelectTick` is armed from ten places and cleared from six across
 * five files, and the clears are TEARDOWNS on input edges — the Shift press and
 * release, the jog-touch release, a project switch. Nothing orders them against
 * the arms, so a feature that arms the window during an input event gets it
 * wiped microseconds later by an edge handler further down the SAME event. The
 * symptom is always the same and always looks like a different bug: "the thing
 * I just chose never appeared".
 *
 * It happened three times in one day (2026-08-25) — a committed bank pick, the
 * bank that pick landed on, and the Shift+click latch — each patched with
 * another `&& !justDidTheThing` at another teardown. This file pins the rule
 * that replaced all three, so the fourth feature does not have to find it
 * again.
 */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

async function main() {
const { S, armBankDisplay, standDownBankDisplay } = await import('../../ui/ui_state.mjs');

function reset(tick) {
    S.tickCount = tick;
    S.bankSelectTick = -1;
    S.bankDisplayArmedTick = -1;
    S.bankCardLatched = false;
}

step('control: a stand-down with nothing recent DOES clear the window', () => {
    reset(100);
    S.bankSelectTick = 50;              /* armed long ago */
    standDownBankDisplay();
    if (S.bankSelectTick >= 0)
        throw new Error('an ordinary stand-down stopped working — the rest of this ' +
                        'file would pass for the wrong reason');
});

step('⭑⭑ a stand-down in the SAME input pass as an arm is STALE and does nothing', () => {
    /* The bug, three times over: an edge handler runs after the thing it would
     * tear down was deliberately set, in the same event. */
    reset(100);
    armBankDisplay();
    standDownBankDisplay();
    if (S.bankSelectTick < 0)
        throw new Error('the teardown wiped a window armed in the same pass — this is ' +
                        'exactly the bug the owner exists to make impossible');
});

step('⭑ ...but the NEXT pass may stand it down', () => {
    /* Otherwise the window could never close: "armed recently" has to mean this
     * event, not the last few. */
    reset(100);
    armBankDisplay();
    S.tickCount = 101;                  /* a later input pass */
    standDownBankDisplay();
    if (S.bankSelectTick >= 0)
        throw new Error('the window became unclosable — the guard is not scoped to ' +
                        'one pass');
});

step('⭑ a LATCHED card refuses an ordinary stand-down, whenever it comes', () => {
    reset(100);
    armBankDisplay();
    S.bankCardLatched = true;
    S.tickCount = 900;                  /* long after */
    standDownBankDisplay();
    if (S.bankSelectTick < 0) throw new Error('the latch did not hold the window');
});

step('⭑ force clears both — it is what Back and the SILENT return mean', () => {
    /* Two callers genuinely mean "no window": Back dismissing the screen, and
     * the silent re-entry whose whole purpose is to arrive without one. */
    reset(100);
    armBankDisplay();
    S.bankCardLatched = true;
    standDownBankDisplay(true);
    if (S.bankSelectTick >= 0)
        throw new Error('force did not clear — Back could not dismiss a latched card');
});

step('⚠ nothing outside the owner writes the field directly', () => {
    /* The rule is only a rule while every site goes through it. A new raw
     * assignment is how the next feature would quietly opt out of it. */
    const files = ['ui.js', 'ui_input_cc.mjs', 'ui_input_pads.mjs', 'ui_tick.mjs',
                   'ui_sound.mjs', 'ui_render.mjs', 'ui_editops.mjs', 'ui_corun.mjs'];
    const raw = [];
    for (const f of files) {
        /* ⚠ Resolved against the repo, not import.meta: the JS suite bundles
         * each test into a temp dir, so a URL relative to this file points at
         * nothing. run.sh runs with davebox/ as the cwd. */
        const src = readFileSync('ui/' + f, 'utf8');
        for (const line of src.split('\n')) {
            const code = line.trim();
            /* Prose mentions the field constantly — comments are documentation,
             * not a bypass. ⚠ Whitespace-tolerant on purpose: the first version
             * of the owner refactor missed a site written with TWO spaces around
             * the '=', which is precisely the kind of thing a hand sweep drops
             * and a scan does not. */
            if (code.startsWith('*') || code.startsWith('/*') || code.startsWith('//')) continue;
            if (/\bbankSelectTick\s*=[^=]/.test(code)) raw.push(f + ': ' + code);
        }
    }
    if (raw.length)
        throw new Error('raw writes bypass the owner:\n  ' + raw.join('\n  '));
});

process.exit(failed);
}
import { readFileSync } from 'node:fs';
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
