/* tests/js/test_comp_param_label.mjs — a component and a param shown together
 * use the SHORT form, and the wire format is not touched.
 *
 * Josh, 2026-08-27: `synth: cutoff` is 82px in the movy font against a value
 * column with ~54px on the KNOBS screen, so the row's own label was being eaten
 * to make room — and at the long end (`midi_fx1: osc1_phase`, 91px) it truncated
 * on the FULL SCREEN, not merely in a box. `Syn>cutoff` is 69px, and the row
 * label shrank from `Knob 1` (34px) to `K1` (13px) in the same pass.
 *
 * ⚠⚠ THE REGRESSION THIS FILE EXISTS FOR IS NOT COSMETIC. The same
 * `target:param` string is also a WIRE FORMAT: `knob_<n>_set` is parsed by the
 * chain DSP and `lfo<n>:target` is a param value, both carrying the raw
 * component id. Applying the display shortening to either writes a component id
 * that does not exist — `Syn:cutoff` addresses nothing, fails silently, and the
 * knob simply stops working. Display and wire must not converge.
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

globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.set_pixel = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
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
const snd = await import('../../ui/ui_sound.mjs');
const L = (id, param) => snd.compLabelsForTest(id, param);

step('⭑ a target and a param read as `Short>param`', () => {
    const cases = [['synth', 'cutoff', 'Syn>cutoff'],
                   ['fx1', 'mix', 'FX1>mix'],
                   ['fx4', 'room_size', 'FX4>room_size'],
                   ['midi_fx1', 'velocity', 'MFX1>velocity']];
    for (const [id, param, want] of cases) {
        const got = L(id, param).pair;
        if (got !== want) throw new Error(`${id}+${param} rendered "${got}", expected "${want}"`);
    }
});

step('⚠ an UNKNOWN component passes through rather than being mangled', () => {
    /* A component this table has not heard of is better shown by its real id
     * than by a guess — and silently dropping it would name the WRONG one. */
    if (L('fx9', 'gain').pair !== 'fx9>gain')
        throw new Error(`unknown id became "${L('fx9', 'gain').pair}"`);
});

step('⭑ an incomplete assignment renders as nothing, not as half a pair', () => {
    for (const [id, param] of [['synth', ''], ['', 'cutoff'], ['', '']])
        if (L(id, param).pair !== '')
            throw new Error(`"${id}"+"${param}" rendered "${L(id, param).pair}"`);
});

step('⭑⭑ ONE table owns both forms — wide and short agree on the id set', () => {
    /* The HUD's roomy line and the inline value are different STRINGS for the
     * same component, and they used to be different TABLES. Adding fx5 to one
     * and not the other is the bug that shape produces; this asserts every id
     * answers in both forms. */
    const EXPECT = {
        synth:    ['Syn',  'SYNTH'],
        fx1:      ['FX1',  'FX 1'],
        fx2:      ['FX2',  'FX 2'],
        fx3:      ['FX3',  'FX 3'],
        fx4:      ['FX4',  'FX 4'],
        midi_fx1: ['MFX1', 'MIDI FX'],
        midi_fx2: ['MFX2', 'MIDI FX 2'],
    };
    for (const [id, [short, wide]] of Object.entries(EXPECT)) {
        const e = L(id, 'p');
        if (e.short !== short) throw new Error(`${id}.short is "${e.short}", expected "${short}"`);
        if (e.wide !== wide)   throw new Error(`${id}.wide is "${e.wide}", expected "${wide}"`);
    }
    /* ⚠ CONTROL for the fallthrough, using an id the table really lacks — my
     * first version inferred "fell through" from `wide === id.toUpperCase()`,
     * which is a FALSE POSITIVE for synth, whose wide form legitimately IS
     * SYNTH. Expected values catch a wrong entry; only a genuinely absent id
     * can demonstrate the fallback. */
    const miss = L('fx9', 'p');
    if (miss.short !== 'fx9' || miss.wide !== 'FX9')
        throw new Error(`the unknown-id fallback changed: short "${miss.short}", wide "${miss.wide}"`);
});

step('⚠⚠ there is no SECOND component-name table', () => {
    /* The scan, not the table: a second map keyed on the same component ids is
     * how the two drift apart, and only a scan can see one appear. */
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    const owners = src.match(/^const \w+ = \{\n(?:.*\n)*?\};$/gm) || [];
    const suspects = owners.filter((b) =>
        /\bsynth\s*:/.test(b) && /\bfx1\s*:/.test(b) && !/COMPONENT_NAMES/.test(b));
    if (suspects.length)
        throw new Error(`a second component-name table appeared:\n${suspects[0].slice(0, 200)}`);
    if (!/const COMPONENT_NAMES = \{/.test(src))
        throw new Error('COMPONENT_NAMES is gone — re-anchor this scan');
});

step('⭑⭑ the WIRE format still carries the RAW component id', () => {
    /* ⚠⚠ The one that actually breaks the instrument. `knob_<n>_set` is parsed
     * by the chain DSP; shortening it writes a component that does not exist and
     * the knob silently stops working.
     * Source-pinned at the call site, bounded by the statement's own end. */
    /* ⚠ Re-anchored 2026-09-02: the assignment is davebox's MACRO STORE now
     * (commitKnobAssignment writes {kind:'chain', comp, key}); the comp is
     * what macroFullKey joins into the engine key, so the same rule holds. */
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    const i = src.indexOf("m = { kind: 'chain', comp: target, key: param }");
    if (i < 0) throw new Error('the knob assignment store write moved — re-anchor this pin');
    const stmt = src.slice(i, src.indexOf(';', i));
    if (!/comp: target, key: param/.test(stmt))
        throw new Error(`the store no longer keeps the raw target: ${stmt}`);
    if (/compShort|compParamLabel|COMPONENT_NAMES/.test(stmt))
        throw new Error('the DISPLAY shortening reached the WIRE format — this writes a ' +
                        'component id the DSP has never heard of, and fails silently');
});

step('⭑ the KNOBS rows are K1..K8 and carry the assignment as their value', () => {
    /* Call-site pin: the formatter being right is worth nothing if the screen
     * stops using it, and this row map is not reachable without a live slot. */
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    const at = src.indexOf('function renderKnobs');
    if (at < 0) throw new Error('renderKnobs is gone — re-anchor this pin');
    const end = src.indexOf('\n}', at);
    const body = src.slice(at, end);
    if (!/label: 'K' \+ \(i \+ 1\)/.test(body))
        throw new Error('the KNOBS rows are no longer labelled K1..K8');
    /* ⭑ Re-anchored 2026-09-05: the row VALUE now goes through knobRowLabel,
     * because a MAPPED knob (several legs, or a ranged one) cannot say what it
     * is in one target's name. The pin therefore has to check both hops, or a
     * formatter that stopped being called would still pass. */
    if (!/value: knobRowLabel\(i, a\)/.test(body))
        throw new Error('the KNOBS rows no longer show the assignment');
    const ka = src.indexOf('function knobRowLabel');
    if (ka < 0) throw new Error('knobRowLabel is gone — re-anchor this pin');
    const kbody = src.slice(ka, src.indexOf('\n}', ka));
    if (!/return knobAsnLabel\(a\);/.test(kbody))
        throw new Error('a PLAIN macro no longer falls through to knobAsnLabel — the formatter is unreachable');
});

step('⭑ the LFO title and target row use the same short form', () => {
    /* Josh asked for consistency across the surfaces, and these two were the
     * other places a target and a param appear together. */
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    for (const marker of ['function renderLfo', 'case \'target\':']) {
        const at = src.indexOf(marker);
        if (at < 0) throw new Error(`${marker} is gone — re-anchor this pin`);
        const body = src.slice(at, at + 400);
        if (/\bt \+ ':' \+ p\b/.test(body))
            throw new Error(`${marker} still formats its own "t:p" instead of compParamLabel`);
    }
});

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed);
}

main();
