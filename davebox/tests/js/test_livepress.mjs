/* tests/js/test_livepress.mjs — pins for the live-pad-press declaration that
 * lets a drum module focus the element you physically hit.
 *
 * Why these pins exist: the feature is invisible when it silently does nothing.
 * A module that declares the fields gets focus-follows-finger; a module that
 * declares none must be UNAFFECTED, and the difference is decided entirely by
 * childSpec/livePressSpec reading (or failing to read) two optional fields. A
 * typo there is exactly the "loads fine, logs nothing, does nothing" failure
 * this arc keeps paying for.
 *
 * DISCIPLINE: every fixture below is a complete level object. Inheriting a
 * field from a neighbouring fixture is how a false pass gets written. */
import { childSpec, livePressSpec } from '../../ui/ui_discover.mjs';

let failed = 0;
function eq(got, want, label) {
    if (got !== want) { console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); failed = 1; }
}

/* -- childSpec: the two new fields are OPTIONAL ------------------------- */

/* minijv's shape — repeated elements, no module-owned selection. Both new
 * fields must read as empty strings, never undefined: callers test them for
 * truthiness and an undefined that stringifies to "undefined" would address a
 * key no module has. */
const minijv = { child_prefix: 'sram_part_', child_count: 8, child_label: 'Part' };
eq(childSpec(minijv).prefix, 'sram_part_', 'minijv prefix survives');
eq(childSpec(minijv).count, 8, 'minijv count survives');
eq(childSpec(minijv).selectParam, '', 'minijv declares no select param');
eq(childSpec(minijv).pressParam, '', 'minijv declares no press param');

/* DR32's shape — the module owns the selection and wants the vouch. */
const dr32 = {
    child_prefix: 'pad', child_count: 32, child_label: 'Pad',
    child_select_param: 'ui_current_pad',
    child_press_param: 'ui_live_press',
};
eq(childSpec(dr32).selectParam, 'ui_current_pad', 'dr32 select param read');
eq(childSpec(dr32).pressParam, 'ui_live_press', 'dr32 press param read');
eq(childSpec(dr32).count, 32, 'dr32 count read');

/* A non-string (a module hand-editing its json to `true`, or a number) must
 * degrade to "not declared" rather than becoming the string "true" and
 * addressing a key nothing answers. */
eq(childSpec({ child_prefix: 'pad', child_count: 4, child_press_param: true }).pressParam,
   '', 'non-string press param is not a declaration');
/* the #426 alignment: upstream's child_index_param is the focus source, this fork's child_select_param the fallback; the base rides along */
eq(childSpec({ child_prefix: 'pad', child_count: 4, child_index_param: 'ui_current_pad', child_select_param: 'old' }).selectParam, 'ui_current_pad', 'child_index_param wins over child_select_param');
eq(childSpec({ child_prefix: 'pad', child_count: 4, child_select_param: 'old' }).selectParam, 'old', 'child_select_param still read when it is all a module declares');
eq(childSpec({ child_prefix: 'pad', child_count: 16, child_index_param: 'p', child_index_base: 1 }).indexBase, 1, 'child_index_base is carried (pads count from 1)');
eq(childSpec({ child_prefix: 'pad', child_count: 4, child_index_param: 'p' }).indexBase, 0, 'no base declared = 0');
eq(childSpec({ child_prefix: 'pad', child_count: 4, child_select_param: 7 }).selectParam,
   '', 'non-string select param is not a declaration');

/* The new fields must not resurrect a level that is not a repeated element at
 * all — no prefix, no spec, whatever else it declares. */
eq(childSpec({ child_press_param: 'ui_live_press' }), null,
   'press param alone does not make a child level');
eq(childSpec({ child_prefix: 'pad', child_count: 0, child_press_param: 'x' }), null,
   'zero count is still not a child level');

/* -- livePressSpec: find the declaration anywhere in a hierarchy -------- */

/* The vouch fires from a pad press without a level in hand, so it has to be
 * findable from the whole level map — not just from the level on screen. */
const levels = {
    root: { name: 'Drum Rack 32', params: [] },
    fx:   { name: 'Effects', params: [] },
    pads: dr32,
};
const found = livePressSpec(levels);
eq(found && found.levelKey, 'pads', 'declaration located by level key');
eq(found && found.pressParam, 'ui_live_press', 'press param carried out');
eq(found && found.selectParam, 'ui_current_pad', 'select param carried out');
eq(found && found.count, 32, 'count carried out, for bounds-checking the readback');

/* A hierarchy with repeated elements but no declaration must return null —
 * this is what keeps every other module in the fleet untouched. */
eq(livePressSpec({ root: { params: [] }, parts: minijv }), null,
   'repeated elements alone do not opt in');
eq(livePressSpec({ root: { params: [] } }), null, 'no child levels at all');
eq(livePressSpec(null), null, 'no levels at all (module published nothing)');
eq(livePressSpec({}), null, 'empty level map');

/* A level declaring select but NOT press is a legitimate half-declaration:
 * the menu can follow the module's focus even when nothing vouches. It must
 * not be picked up as a press declaration. */
eq(livePressSpec({ pads: { child_prefix: 'pad', child_count: 32,
                           child_select_param: 'ui_current_pad' } }), null,
   'select without press is not a press declaration');

/* -- note naming: a host that EMITS the note can name the element ---------- */

/* DR32's real shape now. The note param is what removes the correlation race
 * entirely for a sequencer host; the vouch stays for the canvas, which cannot
 * know which pad a grid position is. */
const dr32n = {
    child_prefix: 'pad', child_count: 32, child_label: 'Pad',
    child_select_param: 'ui_current_pad',
    child_press_param: 'ui_live_press',
    child_press_note_param: 'ui_live_note',
};
eq(childSpec(dr32n).noteParam, 'ui_live_note', 'note param read');
eq(childSpec(dr32n).pressParam, 'ui_live_press', 'vouch survives alongside it');
eq(childSpec(minijv).noteParam, '', 'no note param declared reads as empty');
eq(childSpec({ child_prefix: 'p', child_count: 4, child_press_note_param: 5 }).noteParam,
   '', 'non-string note param is not a declaration');

const fn = livePressSpec({ root: { params: [] }, pads: dr32n });
eq(fn && fn.noteParam, 'ui_live_note', 'note param carried out of livePressSpec');

/* A module may declare ONLY the note param — a sequencer-only integration with
 * no canvas to vouch. That must still be found, or the feature silently does
 * nothing for it. */
const noteOnly = livePressSpec({ pads: {
    child_prefix: 'pad', child_count: 32, child_press_note_param: 'ui_live_note' } });
eq(noteOnly && noteOnly.noteParam, 'ui_live_note', 'note-only declaration is found');
eq(noteOnly && noteOnly.pressParam, '', 'note-only has no vouch key');

/* ...but a level declaring NEITHER is still not a press declaration. */
eq(livePressSpec({ pads: { child_prefix: 'pad', child_count: 32,
                           child_select_param: 'ui_current_pad' } }), null,
   'select alone is still not a press declaration');

if (failed) process.exit(1);
console.log('PASS: live pad press declaration (childSpec + livePressSpec)');
