/* tests/js/test_pp_visible.mjs — davebox's `visible_if` evaluator must decide
 * every case the host's does.
 *
 * ⚠⚠ WHY THIS EXISTS. ui/pp_visible.mjs is the ONLY port in the module editor:
 * everything else is the host's own code, shared or vendored. The host's
 * evaluator lives in src/shadow/shadow_ui.js, which a module cannot import, so
 * this one is a copy — and a copy silently rots. This repo has watched a
 * hand-copied renderer diverge four times and a cell classifier twice.
 *
 * ⚠ It pins BEHAVIOUR, case by case, not the text of the function: a text
 * comparison would fail on a reformat and pass on a logic change, which is
 * exactly backwards. The cases below are read off the host's branches — every
 * operator it supports, both polarities, and the fail-open rule.
 */
import { evaluateVisibility, parseMetaBool, compareConditionValue,
         normalizeVisibilityConditionKey } from '../../ui/pp_visible.mjs';

let failed = 0;
const ok  = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e}`); failed = 1; };
const is  = (got, want, label) =>
    (got === want) ? ok(label) : bad(label, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

/* A fake component whose params answer from a table. */
const io = (params, childIndex = -1) => ({
    prefix: 'synth',
    getParam: (k) => (k in params ? params[k] : null),
    childIndexOf: () => childIndex,
});

console.log('visible_if: davebox vs the host\'s rules');

/* --- fail-open, which is the rule that matters most ---------------------- */
is(evaluateVisibility(io({}), { param: 'mode', equals: 'x' }), true,
   '⚠ a param that cannot be READ shows the control (fail-open)');
is(evaluateVisibility(io({}), null), true, 'no condition at all shows it');
is(evaluateVisibility(io({}), { equals: 1 }), true, 'a condition naming no param shows it');

/* --- equals / not_equals, and the typed comparison ----------------------- */
const P = { 'synth:mode': '2', 'synth:on': '1', 'synth:name': 'poly' };
is(evaluateVisibility(io(P), { param: 'mode', equals: 2 }), true,
   '⭑ equals with a NUMBER compares numerically against a string param');
is(evaluateVisibility(io(P), { param: 'mode', equals: '2' }), true, 'equals with a string');
is(evaluateVisibility(io(P), { param: 'mode', equals: 3 }), false, 'equals that does not match');
is(evaluateVisibility(io(P), { param: 'mode', not_equals: 3 }), true, 'not_equals');
is(evaluateVisibility(io(P), { param: 'on', equals: true }), true,
   '⭑ equals with a BOOLEAN goes through the bool parser, not string compare');
is(evaluateVisibility(io(P), { param: 'name', equals: 'poly' }), true, 'equals on a word');

/* --- gt / lt and all their spellings ------------------------------------- */
for (const k of ['gt', 'greater_than', 'greater']) {
    is(evaluateVisibility(io(P), { param: 'mode', [k]: 1 }), true, `${k} above threshold`);
    is(evaluateVisibility(io(P), { param: 'mode', [k]: 5 }), false, `${k} below threshold`);
}
for (const k of ['lt', 'smaller_than', 'smaller']) {
    is(evaluateVisibility(io(P), { param: 'mode', [k]: 5 }), true, `${k} below threshold`);
    is(evaluateVisibility(io(P), { param: 'mode', [k]: 1 }), false, `${k} above threshold`);
}
is(evaluateVisibility(io({ 'synth:mode': 'abc' }), { param: 'mode', gt: 1 }), false,
   '⚠ a NON-NUMERIC value fails a numeric test rather than passing it');

/* --- truthy / falsey, both polarities ------------------------------------ */
is(evaluateVisibility(io(P), { param: 'on', truthy: true }), true, 'truthy:true on a set flag');
is(evaluateVisibility(io(P), { param: 'on', truthy: false }), false,
   '⭑ truthy:FALSE inverts — it means "show when NOT set"');
is(evaluateVisibility(io(P), { param: 'on', falsey: true }), false, 'falsey:true on a set flag');
is(evaluateVisibility(io(P), { param: 'on', falsy: true }), false, 'the `falsy` spelling too');

/* --- the bare fallback --------------------------------------------------- */
is(evaluateVisibility(io(P), { param: 'on' }), true, 'no operator = truthiness of the value');
is(evaluateVisibility(io({ 'synth:on': '0' }), { param: 'on' }), false, '...and its negative');

/* --- key normalisation, incl. repeated elements -------------------------- */
is(normalizeVisibilityConditionKey('synth', null, -1, 'cutoff'), 'synth:cutoff', 'bare key gets the prefix');
is(normalizeVisibilityConditionKey('synth', null, -1, 'fx:cutoff'), 'fx:cutoff',
   '⚠ a key that already carries a namespace is left ALONE');
is(normalizeVisibilityConditionKey('synth', { child_prefix: 'op' }, 2, 'ratio'), 'synth:op2_ratio',
   '⭑ inside a repeated element, a bare key means THIS child\'s param');
is(normalizeVisibilityConditionKey('synth', { child_prefix: 'op' }, 2, 'op1_ratio'), 'synth:op1_ratio',
   '⚠ ...but a key that already names a child is not given a second index');

/* --- the bool parser's exact vocabulary ---------------------------------- */
for (const v of [true, 1, '1', 'true', 'on', 'yes', 'TRUE', ' Yes ']) {
    is(parseMetaBool(v), true, `bool: ${JSON.stringify(v)} is true`);
}
for (const v of [false, 0, '0', 'false', 'off', 'no', '', null, undefined, 'wat']) {
    is(parseMetaBool(v), false, `bool: ${JSON.stringify(v)} is false`);
}
is(compareConditionValue('2', 2), true, 'compare: numeric expected coerces the actual');
is(compareConditionValue('x', 2), false, 'compare: non-numeric actual against a number');

if (failed) { console.error('test_pp_visible: FAIL'); process.exit(1); }
console.log('test_pp_visible: PASS');
