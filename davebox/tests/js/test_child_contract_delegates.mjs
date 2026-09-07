/* tests/js/test_child_contract_delegates.mjs — dAVEBOx addresses repeated
 * elements through the SHARED contract, not a local subset of it.
 *
 * ⚠⚠ WHAT WAS BROKEN, and it was shipping. `childSpec` required
 * `child_prefix`; the shared `hasChildren` accepts `child_prefix` OR
 * `child_key_template`. **mrdrums declares the template form** — 16 pads,
 * `p{index}_{key}`, `child_index_base: 1`, `child_index_digits: 2` — so
 * dAVEBOx gave it no child level at all: no instance picker, no focus follow,
 * and every per-pad param unreachable. The gap was ALREADY ADMITTED in a
 * comment in ui_sound.mjs ("That is a GAP, not a guarantee") and the fix never
 * followed.
 *
 * `childParamKey` built `<prefix><i>_<key>` directly, honouring none of
 * `child_key_template`, `child_index_base`, `child_index_digits` or
 * `child_key_overrides`. A module numbering from 1 had every read miss by one
 * and answer "" — a populated, plausible, wrong screen.
 *
 * ⭑ SCOPE, HONESTLY: of the 100 captured modules exactly ONE (mrdrums)
 * declares any of these forms, and ZERO declare `child_names` or
 * `focus_press_param`. So one real module is fixed and the rest is the
 * contract being honoured rather than re-derived — which is the point: a
 * subset re-implementation is how the half-port keeps happening.
 *
 * FIXTURES ARE THE REAL DECLARATIONS, read out of the fleet capture.
 */

import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

/* mrdrums' own child level, out of the 100-module capture. */
function mrdrumsChildLevel() {
    const cap = JSON.parse(readFileSync('../tests/fixtures/module-contracts.json', 'utf8'));
    const mods = cap.modules;
    const list = Array.isArray(mods) ? mods : Object.values(mods);
    const m = list.find((x) => (x.id || x.name) === 'mrdrums');
    assert(m, 'mrdrums is not in the fleet capture — the fixture cannot be built');
    let found = null;
    (function walk(o) {
        if (found) return;
        if (Array.isArray(o)) { for (const v of o) walk(v); return; }
        if (o && typeof o === 'object') {
            if (o.child_key_template) { found = o; return; }
            for (const v of Object.values(o)) walk(v);
        }
    })(m);
    assert(found, 'mrdrums declares no child_key_template — this test would prove nothing');
    return found;
}

const ENGINE_ERR = Object.create(null);
globalThis.shadow_get_param = (slot, key) => {
    const bare = String(key).replace(/^slot:/, '');
    return Object.prototype.hasOwnProperty.call(ENGINE_ERR, bare) ? ENGINE_ERR[bare] : '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['set_pixel', 'fill_rect', 'draw_rect', 'stipple_rect', 'clear_screen',
                  'print', 'pixel_print', 'flush_display'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
const { childSpec, childParamKey, livePressSpec, authoritativeMeta } = await import('../../ui/ui_discover.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const LVL = mrdrumsChildLevel();

step('control: the fixture is the template shape, with base and digits', () => {
    assert(LVL.child_key_template === 'p{index}_{key}', 'template changed: ' + LVL.child_key_template);
    assert(LVL.child_index_base === 1, 'base changed');
    assert(LVL.child_index_digits === 2, 'digits changed');
    assert(!LVL.child_prefix, 'the fixture now HAS a child_prefix — it no longer tests the gap');
    assert(LVL.child_count === 16, 'count changed');
});

step('⭐ a template-shaped level HAS children — it used to have none at all', () => {
    const spec = childSpec(LVL);
    assert(spec, 'childSpec rejected mrdrums: no instance picker, no per-pad params, silently');
    assert(spec.count === 16, 'wrong count: ' + (spec && spec.count));
    assert(spec.label === 'Pad', 'wrong label: ' + (spec && spec.label));
});

step('⭐⭐ pad 0 addresses p01_, not p0_ — base AND digits, from the template', () => {
    const k = childParamKey(LVL, 0, 'cutoff');
    assert(k === 'p01_cutoff', 'addressed ' + JSON.stringify(k) + ', expected "p01_cutoff"');
});

step('...and pad 15 addresses p16_', () => {
    assert(childParamKey(LVL, 15, 'cutoff') === 'p16_cutoff',
           'addressed ' + childParamKey(LVL, 15, 'cutoff'));
});

step('⚠ the OLD formula would have addressed a key that does not exist', () => {
    /* What the local implementation built. Kept as a control so the assertion
     * above is about a real difference and not a restatement. */
    const old = (LVL.child_prefix || '') + 0 + '_' + 'cutoff';
    assert(old !== 'p01_cutoff',
           'the old and new forms agree — this fixture no longer demonstrates the bug');
});

step('a child_key_overrides entry escapes the template entirely', () => {
    const key = Object.keys(LVL.child_key_overrides)[0];
    assert(childParamKey(LVL, 3, key) === LVL.child_key_overrides[key],
           'the override was ignored: ' + childParamKey(LVL, 3, key));
});

step('the classic prefix shape still addresses exactly as before', () => {
    const legacy = { child_prefix: 'pad', child_count: 4, child_label: 'Pad' };
    assert(childParamKey(legacy, 2, 'start') === 'pad2_start',
           'a prefix level changed shape: ' + childParamKey(legacy, 2, 'start'));
    const spec = childSpec(legacy);
    assert(spec && spec.count === 4 && spec.prefix === 'pad', 'the prefix spec changed');
});

step('a level with no children is still not a child level', () => {
    assert(childSpec({ label: 'Osc' }) === null, 'a plain level grew children');
    assert(childSpec({ child_prefix: 'p' }) === null, 'a prefix with no count is not children');
    assert(childSpec({ child_count: 4 }) === null, 'a count with no addressing form is not children');
    assert(childParamKey({ label: 'Osc' }, 0, 'cutoff') === 'cutoff',
           'a non-child level rewrote its key');
});

/* ---- the sibling shape ------------------------------------------------- */
step('⭐ focus_press_param on the HIERARCHY is found — a sibling-shape module', () => {
    /* No captured module declares this yet; the shape is upstream's and the
     * priority rule is the shared library's. Supporting it is the difference
     * between honouring a contract and re-deriving a subset of it. */
    const levels = { voice_a: { label: 'A' }, voice_b: { label: 'B' } };
    const spec = livePressSpec(levels, { focus_press_param: 'ui_pad_pressed' });
    assert(spec, 'a hierarchy-level press declaration was ignored — pads sound, nothing follows');
    assert(spec.pressParam === 'ui_pad_pressed', 'wrong press param: ' + (spec && spec.pressParam));
});

step('⚠ a LEVEL declaration still wins over the hierarchy one', () => {
    const levels = { pads: { child_prefix: 'pad', child_count: 4, child_press_param: 'pad_hit' } };
    const spec = livePressSpec(levels, { focus_press_param: 'ui_pad_pressed' });
    assert(spec && spec.pressParam === 'pad_hit',
           'the hierarchy fallback overtook a level declaration: ' + (spec && spec.pressParam));
});

step('control: no declaration anywhere is still null', () => {
    assert(livePressSpec({ osc: { label: 'Osc' } }, {}) === null, 'a press spec appeared from nowhere');
    assert(livePressSpec({}, null) === null, 'a null hierarchy produced a spec');
});

/* ---- the key inversion must not match on an EMPTY prefix --------------- */
step('⚠⚠ a template level does not answer authoritativeMeta for EVERY key', () => {
    /* `spec.prefix` is '' for a template-shaped level, and `indexOf('')` is 0
     * for any string — so without the guard this level claims every key in the
     * module and hands back the first param it finds. The screen then shows one
     * param's range, units and enum options under another param's name, and
     * a knob turn writes that wrong domain back. Nothing is logged.
     * ⭑ Found by mutation: the guard survived until this case existed. */
    const levels = {
        pads: { name: 'MrDrums', child_count: 16, child_label: 'Pad',
                child_key_template: 'p{index}_{key}',
                child_index_base: 1, child_index_digits: 2,
                params: [{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }] },
        globals: { params: [{ key: 'volume', name: 'Volume', type: 'float', min: 0, max: 2 }] },
    };
    /* ⭑ THE KEY SHAPE MATTERS, and my first version of this case did not bite.
     * The inversion strips the prefix, then leading digits, then requires an
     * `_`. With prefix '' most keys fail that `_` test and fall through anyway
     * — so `volume` and `no_such_key` prove nothing. The shape that reaches the
     * end is `<digits>_<key>`, which with an empty prefix strips to `_cutoff`
     * and resolves to the PAD's cutoff. Mutation said so twice before I looked
     * properly. */
    const stolen = authoritativeMeta('3_cutoff', null, levels);
    assert(stolen === null,
           'the template level claimed "3_cutoff" and answered with '
           + JSON.stringify(stolen && stolen.key) + ' — a param under the wrong name, '
           + 'with the wrong range, that a knob turn writes back');

    /* Controls: the ordinary lookups still work. */
    const meta = authoritativeMeta('volume', null, levels);
    assert(meta && meta.key === 'volume', 'a global key stopped resolving');
    assert(authoritativeMeta('no_such_key', null, levels) === null, 'an unknown key resolved');
});

step('control: a real prefix level DOES still invert its per-instance key', () => {
    const levels = { pads: { child_prefix: 'pad', child_count: 4,
        params: [{ key: 'start', name: 'Start', type: 'float', min: 0, max: 1 }] } };
    const meta = authoritativeMeta('pad3_start', null, levels);
    assert(meta && meta.key === 'start',
           'the prefix inversion stopped working: ' + JSON.stringify(meta));
});

/* ---- a failed module is refused, not silently edited -------------------- */
step('⭐ a component reporting a load failure is READ, not assumed healthy', () => {
    ENGINE_ERR['synth_error'] = 'sample bank missing';
    assert(snd.soundComponentErrorForTest(2, 'synth') === 'sample bank missing',
           'davebox did not read the failure — the editor would open on a dead module');
});

step('...and a healthy component reads null', () => {
    ENGINE_ERR['synth_error'] = '';
    assert(snd.soundComponentErrorForTest(2, 'synth') === null,
           'an empty error read as a failure — a working module would be uneditable');
});

step('⚠ an fx component uses its own namespaced key', () => {
    ENGINE_ERR['synth_error'] = '';
    ENGINE_ERR['fx1:error'] = 'no such plugin';
    assert(snd.soundComponentErrorForTest(2, 'fx1') === 'no such plugin',
           'an fx failure was not read from fx1:error');
    assert(snd.soundComponentErrorForTest(2, 'synth') === null,
           'the fx failure leaked onto the generator');
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main();
