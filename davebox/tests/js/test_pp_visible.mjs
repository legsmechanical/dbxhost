/* tests/js/test_pp_visible.mjs — the `visible_if` rule, exercised case by case.
 *
 * ⚠ IT PINS BEHAVIOUR, NOT TEXT. A text comparison fails on a reformat and
 * passes on a logic change, which is exactly backwards. The cases below are read
 * off the rule's branches — every operator and every spelling of it, both
 * polarities of truthy/falsey, the child_prefix key rules, and the fail-open
 * rule that decides what happens when a condition names a param we cannot read.
 *
 * ⭑ It was written to defend a PORT: davebox carried its own copy of this rule
 * for one session, because the host's version sat in shadow_ui.js where no
 * module can import it. The rule now lives in shared/param_pages/visibility.mjs
 * with ONE definition and two consumers, so this no longer guards a copy — it
 * guards the rule itself, which is the better job for it.
 */
import { evaluateVisibility, parseMetaBool, compareConditionValue,
         normalizeVisibilityConditionKey }
    from '/data/UserData/schwung/shared/param_pages/visibility.mjs';

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
/* A child level the way modules really declare one: a count, and the keys it
 * lists. `ratio` is per-operator; anything it does not list is not. */
const OPS = { child_prefix: 'op', child_count: 4, params: ['ratio', { key: 'level' }] };
is(normalizeVisibilityConditionKey('synth', OPS, 2, 'ratio'), 'synth:op2_ratio',
   '⭑ inside a repeated element, a LISTED key means THIS child\'s param');
is(normalizeVisibilityConditionKey('synth', OPS, 2, 'level'), 'synth:op2_level',
   '...listed as an object entry too');
is(normalizeVisibilityConditionKey('synth', OPS, 2, 'op1_ratio'), 'synth:op1_ratio',
   '⚠ ...but a key that already names a child is not given a second index');
is(normalizeVisibilityConditionKey('synth', OPS, -1, 'ratio'), 'synth:ratio',
   'no instance on screen (index -1): the bare key');

/* ⚠⚠ THE GLOBAL GATE. A drum module gates a pad's pages on which engine the
 * focused pad runs -- `ui_engine`, listed on no level and served bare.
 * Expanding it asked for `pad2_ui_engine`, nothing served it, "" compared equal
 * to 0, and every pad got the sample pages (upstream hierChildKeyFor expands
 * only listed keys). */
const PADS = { child_prefix: 'pad', child_index_base: 1, child_count: 32,
               params: ['sample', { key: 'filter_type' }, { key: 'resonance' }] };
is(normalizeVisibilityConditionKey('dr', PADS, 1, 'ui_engine'), 'dr:ui_engine',
   '⚠⚠ an UNLISTED key on a child level stays GLOBAL');
const ENG = { 'dr:ui_engine': '1', 'dr:pad2_ui_engine': undefined };
const dio = (idx) => ({ prefix: 'dr', childIndexOf: () => idx,
    getParam: (k) => (k in ENG && ENG[k] !== undefined ? ENG[k] : '') });
is(evaluateVisibility(dio(1), { param: 'ui_engine', equals: 0 }, PADS), false,
   '...so a synth pad does NOT get the sample-only pages');
is(evaluateVisibility(dio(1), { param: 'ui_engine', equals: 1 }, PADS), true,
   '...and DOES get its engine\'s pages');

/* ⚠ The index is zero-based and the module may count from 1: the second pad
 * (index 1) is `pad2_`, as the controller resolves its VALUE keys. Built by
 * hand as `${prefix}${index}_` it was `pad1_` -- the previous pad's filter. */
is(normalizeVisibilityConditionKey('dr', PADS, 1, 'filter_type'), 'dr:pad2_filter_type',
   '⚠ child_index_base is honoured: index 1 of a 1-based level is pad2_');
const TPL = { child_key_template: 'p{index}_{key}', child_index_base: 1, child_index_digits: 2,
              child_count: 16, knobs: ['type'] };
is(normalizeVisibilityConditionKey('dr', TPL, 2, 'type'), 'dr:p03_type',
   'a template level resolves the same way its value keys do');
const PFX = { child_prefix: 'pad', child_count: 8, params: ['pad_vol'] };
is(normalizeVisibilityConditionKey('dr', PFX, 3, 'pad_vol'), 'dr:pad3_pad_vol',
   '⚠ a LISTED key that merely begins with the prefix is still per-instance');

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
