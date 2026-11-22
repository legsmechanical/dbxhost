import './_bulk_get_stub.mjs';
/* tests/js/test_stop_clears_perf_loop.mjs — a transport Stop ends the looper
 * (DSP), so the UI drops the loop lengths it was showing; the perf view, its
 * mods and Latch mode stay. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const writes = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;   /* the bank knob's turn now reaches the automation owner (2026-09-03) */
let PLAYING = '1';
const snapshot = () => { const v = new Array(64).fill('0'); v[0] = PLAYING; for (let i = 17; i < 25; i++) v[i] = '-1'; return v.join(' '); };
globalThis.host_module_get_param = (k) => {
    k = String(k);
    if (k === 'state_uuid') return 'stop-uuid';
    if (k === 'state_dirty') return '0';
    if (k === 'state_snapshot') return snapshot();
    return '';
};
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
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
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { POLL_INTERVAL } = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
const poll = () => { const t0 = Date.now(); ticks(POLL_INTERVAL * 3); while (Date.now() - t0 < 70) {} ticks(2); };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

step('setup: playing, a latched loop length in the perf view', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true;
    S.currentSetUuid = 'stop-uuid';
    PLAYING = '1'; poll();
    if (!S.playing) throw new Error('rig: the poll did not read playing');
    S.perfViewLocked = true; S.perfStack = [3]; S.perfStickyLengths = new Set([3]);
});

step('a transport Stop drops the loop lengths (the DSP stopped the looper)', () => {
    PLAYING = '0'; poll();
    if (S.playing) throw new Error('rig: still playing');
    if (S.perfStack.length || S.perfStickyLengths.size) throw new Error('loop lengths survived the stop: ' + JSON.stringify(S.perfStack));
    if (!S.perfViewLocked) throw new Error('the perf view itself should stay as it was');
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
