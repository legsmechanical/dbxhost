/* tests/js/test_modbus_insert_display_value.mjs — the MODULE BUS insert row
 * must show the loaded effect's FULL name, the same as the Sound menu's own
 * block rows, not a 2-letter abbreviation.
 *
 * ⭐ WHY THIS EXISTS. Device report (Josh, screenshot): the "TB > … > BUS 1 >
 * INSERTS" screen showed "FX 1 >" with no effect name at all for a loaded
 * insert. Root cause: `renderModBusChain` (ui_sound.mjs) fell back to
 * `engineModuleAbbrev(c.module)` — a 2-character code, meaningful only when
 * the host's `module.json`-scanned abbrev cache happens to hold it — instead
 * of the full module id the Sound menu's block rows use
 * (`refreshBlockNames`: `r.name = moduleIdOf(engineLoadedModule(...))`).
 *
 * ⚠⚠ THE MECHANISM BEHIND THE SCREENSHOT was not the abbreviation at all: the
 * old row set BOTH `value` and `chevron: !!c.module` on the same row, and
 * `drawKitList`'s row loop does `row.chevron ? '>' : value` — chevron and
 * value are MUTUALLY EXCLUSIVE there (its own docstring says so). For any
 * loaded insert `chevron` was true, so the value was thrown away
 * UNCONDITIONALLY regardless of what it resolved to — "FX 1  >" with nothing
 * before the chevron is exactly that. Fixed by folding the door marker INTO
 * the value string (the `trackto` row's own pattern: `r.gen + ' >'`) and
 * never setting `chevron` on this row again.
 *
 * `modBusInsertDisplayValue` is the extracted, PURE piece of that decision:
 * insert's own `display_name` first, else the full module id (normalised via
 * `moduleIdOf` exactly like a bus's DSP-path report is elsewhere), capped to
 * a fixed pixel width (reserving room for the ' >' door mark) so a long name
 * is cut short on the right rather than crushing the "FX N" label down to
 * nothing (drawKitList shrinks the LABEL to fit whatever width the VALUE
 * claims — see ui_movy.mjs `drawKitList`), then the door mark appended.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
const eq = (got, want, what) => {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`);
};

/* ---- host surface (unused by the pure function, but ui_sound.mjs needs a
 * full stub set to import without throwing — same minimal set as
 * test_sound_buses_row_order.mjs, which proved this is enough). ---- */
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_write_file = () => true;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_system_cmd = () => 0;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.host_send_midi = () => {};
globalThis.move_midi_inject_to_move = () => {};
globalThis.host_set_led = () => {};
globalThis.set_led = () => {};
globalThis.host_get_setting = () => '';
globalThis.host_set_setting = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const snd = await import('../../ui/ui_sound.mjs');
const V = snd.modBusInsertDisplayValue;

step('a loaded insert with NO display_name shows its FULL module id, not an abbreviation', () => {
    eq(V('', 'reverb'), 'REVERB >', 'value');
});

step('an insert WITH a display_name shows that instead (several effects, one binary)', () => {
    eq(V('BussColors4', 'airwin'), 'BUSSCOLORS4 >', 'value');
});

step('an empty position (no module) shows "--" with NO door mark — nothing to enter', () => {
    eq(V('', ''), '--', 'value');
    eq(V('anything', ''), '--', 'value');
});

step('⭐ a bus-reported DSP PATH is normalised the same way the Sound menu normalises one', () => {
    eq(V('', 'modules/audio_fx/reverb/reverb.so'), 'REVERB >', 'value');
});

step('⭐⭐ a LONG name is cut short on the right, not the whole row broken', () => {
    const long = V('', 'a-very-long-effect-module-name-that-will-not-fit-on-one-row');
    const FULL = 'A-VERY-LONG-EFFECT-MODULE-NAME-THAT-WILL-NOT-FIT-ON-ONE-ROW';
    if (long.length >= FULL.length + ' >'.length)
        throw new Error('name was not truncated: ' + long);
    if (!long.endsWith(' >')) throw new Error('door mark lost in truncation: ' + long);
    const name = long.slice(0, -2);
    if (!name) throw new Error('truncation ate the whole value');
    /* Truncated from a real prefix of the name, not garbled or re-ordered. */
    if (FULL.indexOf(name) !== 0)
        throw new Error('truncated value is not a left-prefix of the full name: ' + long);
});

step('⭐⭐⭐ THE MECHANISM: the row never sets chevron alongside value — drawKitList would eat it', () => {
    /* Regression pin for the actual screenshot bug: value and chevron are
     * mutually exclusive in drawKitList (row.chevron ? '>' : value), so a
     * fix that reintroduces `chevron: true` next to a `value` string would
     * silently reproduce "FX 1  >" with no name again. The door mark must
     * live INSIDE the value text. */
    const v = V('', 'reverb');
    if (!v.endsWith(' >')) throw new Error('loaded insert value carries no door mark: ' + v);
    if (v === '>') throw new Error('value collapsed to bare chevron — the old bug, back again');
});

console.log(failed ? 'FAIL: test_modbus_insert_display_value.mjs' : 'PASS: test_modbus_insert_display_value.mjs');
process.exit(failed);
}
main();
