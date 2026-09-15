import './_bulk_get_stub.mjs';
/* tests/js/test_component_meta_retry.mjs
 *
 * ⚠ THE BUG THIS PINS: componentMeta() in ui_automation.mjs cached a FAILED
 * `shadow_get_param(slot, comp + ':chain_params')` read (throw / null / a
 * parse failure) as `{}` forever, in the same metaCache a good read uses.
 * Once a component was visited before its chain was ready — or during a
 * dropped round-trip — every automation label and smoothable check on it
 * was stuck reading the raw key name for the rest of the session, with no
 * way to retry. A read that never parsed must NOT be cached; only a read
 * that actually produced metadata should be remembered.
 *
 * Harness modelled on test_automation_list_survives_failed_read.mjs: the
 * whole UI (ui.js) over stubs, with shadow_get_param swapped mid-test.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

const fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
/* Starts FAILING (throws) — flipped to a real answer partway through. */
let shadowFails = true;
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') {
        if (shadowFails) throw new Error('round-trip dropped');
        return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }]);
    }
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = px; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const A = await import('../../ui/ui_automation.mjs');

const TARGET = '5:synth:cutoff';    /* slot 5, component "synth", key "cutoff" */

step('a failed read is NOT cached — the label falls back to the key', () => {
    const label = A.automationTargetLabel(TARGET);
    if (!/cutoff/i.test(label)) throw new Error('expected the raw key as fallback, got ' + label);
});

step('a second failed read still falls back (proves the first miss was not cached as good)', () => {
    const label = A.automationTargetLabel(TARGET);
    if (!/cutoff/i.test(label)) throw new Error('expected the raw key as fallback, got ' + label);
});

step('once the read starts answering, the SAME component now resolves its real name', () => {
    shadowFails = false;
    const label = A.automationTargetLabel(TARGET);
    if (!/Cutoff/.test(label)) throw new Error('expected the fetched name "Cutoff", got ' + label);
});

step('and it stays cached from there (a later failure would not un-resolve it)', () => {
    shadowFails = true;   /* if this were consulted again, it would throw */
    const label = A.automationTargetLabel(TARGET);
    if (!/Cutoff/.test(label)) throw new Error('good metadata should stay cached, got ' + label);
});

if (failed) { console.log('FAIL: componentMeta retry after a failed read'); process.exit(1); }
console.log('PASS: componentMeta retry after a failed read');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
