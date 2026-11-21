import './_bulk_get_stub.mjs';
/* tests/js/test_drum_delay_knob_ranges.mjs — on a drum track the DELAY bank's
 * K5 is Gate (0..10) and K6 Clock Feedback (-100..+100). Both are remapped onto
 * the lane's own keys, and both once took the melodic K5/K6 ranges instead. */

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
const tickmod = await import('../../ui/ui_tick.mjs');
const { PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

/* The last value a turn wrote to a drum lane's DELAY key. Drum DELAY K5/K6 do
 * not write their own bank keys: applyBankParam remaps them onto the LANE's
 * delay_gate_fb / delay_clock_fb (`tN_lL_pfx_set=<key> <v>`). */
function lastLane(key) {
    for (let i = writes.length - 1; i >= 0; i--) {
        const m = writes[i].match(/^t0_l\d+_pfx_set=(\S+) (-?\d+)$/);
        if (m && m[1] === key) return parseInt(m[2], 10);
    }
    return null;
}
function turn(cc, mag, frames) {
    for (let i = 0; i < frames; i++) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, cc, mag]));
        ticks(1);
    }
}
const RIGHT = 6, LEFT = 128 - 6;

step('setup: a drum track on the DELAY bank', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    S.trackPadMode.fill(PAD_MODE_DRUM);
    S.activeBank = 3;
    S.knobLocked.fill(false);
    ticks(16);
});

step('K6 (Clock Feedback) reaches +100 and -100, not 0..10', () => {
    turn(76, RIGHT, 200);
    const hi = lastLane('delay_clock_fb');
    if (hi !== 100) throw new Error('turned fully right, delay_clock_fb = ' + hi + ' (want 100)');
    turn(76, LEFT, 400);
    const lo = lastLane('delay_clock_fb');
    if (lo !== -100) throw new Error('turned fully left, delay_clock_fb = ' + lo + ' (want -100)');
});

step('K5 (Gate) stops at 10 and turns back at once (no dead zone)', () => {
    turn(75, RIGHT, 400);
    const top = lastLane('delay_gate_fb');
    if (top !== 10) throw new Error('turned fully right, delay_gate_fb = ' + top + ' (want 10)');
    if (S.bankParams[0][3][4] !== 10) throw new Error('the shown Gate value ran to ' + S.bankParams[0][3][4]);
    const n = writes.length;
    for (let i = 0; i < 60 && lastLane('delay_gate_fb') === 10; i++) turn(75, LEFT, 1);
    if (lastLane('delay_gate_fb') !== 9) throw new Error('turning back did not reach 9 within 60 frames (dead zone)');
    if (writes.length === n) throw new Error('no write at all');
});

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed);
}
main().catch((e) => { console.error(e); process.exit(1); });
