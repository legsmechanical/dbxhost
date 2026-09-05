import './_bulk_get_stub.mjs';
/* tests/js/test_automation_list_survives_failed_read.mjs
 * 2026-09-02): last on the walk after MACROS, replacing the old AUTO bank 6.
 * The card is the LIST of what is automated in the clip (bracketed corners);
 * the knobs are a no-op; jog click enters the menu (cursor + Clear clip);
 * click on a row opens its ops (Delete / Mute / Smooth / Loop); Delete +
 * click clears the clip; Back closes one layer at a time; every edit takes an
 * undo checkpoint. Smooth/Stepped moved here from the module editor.
 *
 * Harness: the whole UI (ui.js + onMidiMessageInternal + tick) over a
 * host_module_get_param stub answering pa_list. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const fb = new Uint8Array(128 * 64);
let painted = 0;
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) { fb[y * 128 + x] = c ? 1 : 0; painted++; } };
const sets = [];
let LIST = '';
/* The AUTOMATION bank polls tN_cC_at_has every poll (ui_dsp_bridge) since the
 * old bank 6 was deleted, so the stub must answer it or the poll clears the
 * aftertouch row back off the card. */
let AT_HAS = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v);
    if (/_at_clear$/.test(k)) AT_HAS = ''; };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob);
    for (let i = 0; i + 1 < it.length; i += 2) { sets.push(it[i] + '=' + it[i + 1]);
        if (/_at_clear$/.test(it[i])) AT_HAS = ''; } return true; };
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST
    : /_at_has$/.test(k) ? AT_HAS : '');
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 }, { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8 }]);
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

/* ⚠ THE BUG THIS PINS (device, 2026-09-05): the automation list is rebuilt
 * from ONE pa_list read; a read that FAILS (null — a timed-out round-trip)
 * used to be parsed as an empty list, wiping the map while the DSP still
 * held every lane. "Clear all" sends only what the map lists, so it then
 * sent nothing, and the automation could not be cleared again. */
async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const A = await import('../../ui/ui_automation.mjs');
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

let paList = '5 0 3 2 4:synth:cutoff 0 4 100\n5 0 3 64 4:slot:pan 0 4 100\n';
const _g = globalThis.host_module_get_param;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : _g(k));

step('a good read lists two lanes', () => {
    A.automationRefreshPresence();
    const e = A.automationEntriesFor(5, 0);
    if (e.length !== 2) throw new Error('entries=' + e.length);
    if (!A.automationPresentForTest()) throw new Error('presence false after a good read');
});
step('a FAILED read (null) keeps the list it had — the DSP still holds those lanes', () => {
    paList = null;
    A.automationRefreshPresence();
    const e = A.automationEntriesFor(5, 0);
    if (e.length !== 2) throw new Error('a null read wiped the list: entries=' + e.length);
    if (!A.automationPresentForTest()) throw new Error('presence flipped on a failed read');
});
step('...so "clear all" still has something to send', () => {
    if (!A.automationClearClip(5, 0)) throw new Error('clear-all sent nothing');
});
step('an EMPTY read (the DSP says so) is a real answer and clears the list', () => {
    paList = '5 0 3 2 4:synth:cutoff 0 4 100\n';
    A.automationRefreshPresence();
    if (A.automationEntriesFor(5, 0).length !== 1) throw new Error('re-list failed');
    paList = '';
    A.automationRefreshPresence();
    if (A.automationEntriesFor(5, 0).length !== 0) throw new Error('an empty list did not clear');
    if (A.automationPresentForTest()) throw new Error('presence true after an empty read');
});
if (failed) process.exit(1);
console.log('PASS: test_automation_list_survives_failed_read.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
