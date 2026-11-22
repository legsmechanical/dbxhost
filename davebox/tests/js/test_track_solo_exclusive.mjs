import './_bulk_get_stub.mjs';
/* tests/js/test_track_solo_exclusive.mjs — Shift + Mute (Track View) solos the
 * track EXCLUSIVELY: the others' solo goes, in the UI mirror as in the DSP. */

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
globalThis.host_module_get_param = () => '';
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
const { PAD_MODE_MELODIC_SCALE } = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const cc = (n, v) => { globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v])); ticks(1); };
const shiftMute = () => { cc(49, 127); cc(88, 127); cc(88, 0); cc(49, 0); ticks(2); };

step('setup: Track View, melodic tracks', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    ticks(8);
});

step('Shift + Mute solos the track and un-solos the others (exclusive)', () => {
    S.activeTrack = 1; shiftMute();
    if (!S.trackSoloed[1]) throw new Error('rig: the gesture did not solo track 2');
    S.activeTrack = 3; shiftMute();
    if (!S.trackSoloed[3]) throw new Error('track 4 not soloed');
    if (S.trackSoloed[1]) throw new Error('track 2 stayed soloed — track solo must be exclusive');
    if (!writes.includes('t3_solo=1')) throw new Error('no t3_solo write');
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
