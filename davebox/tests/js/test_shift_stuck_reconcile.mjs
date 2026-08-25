/* tests/js/test_shift_stuck_reconcile.mjs — a Shift RELEASE that never arrived
 * is healed from the hardware's own view.
 *
 * The shim publishes hardware MIDI to us through a 64-slot ring that DROPS
 * SILENTLY when full, and we drain it only between JS callbacks. A dropped PRESS
 * is self-healing (press again); a dropped RELEASE latches forever, because every
 * held-modifier flag latches on an edge.
 *
 * Josh, 2026-08-25: after Shift+volume in track view the Shift+bottom-row track
 * LEDs kept animating "as if they're still in track switch mode" — because as
 * far as dAVEBOx knew, Shift WAS still down. The volume gesture is the worst
 * case for that ring: a CC 79 detent stream plus capacitive touch, with
 * per-detent work on our side.
 *
 * The shim tracks Shift from the HARDWARE BUFFER, independently of the ring, and
 * publishes it in shared memory — so there is an authoritative answer, and the
 * tick compares against it.
 *
 * ⚠ The rig stubs shadow_get_shift_held() to return 1 by default, which makes
 * the reconcile inert (see tests/js/build.mjs for why: tests that legitimately
 * hold Shift were being healed out from under themselves). This test overrides
 * it to 0 — "hardware says Shift is UP" — which is exactly the stuck state. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => true;
globalThis.host_close_service = () => true;
globalThis.move_midi_inject_to_move = () => {};
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
const { applyShiftEdge } = await import('../../ui/ui_input_cc.mjs');
await import('../../ui/ui.js');           /* installs tick / onMidiMessageInternal */

step('⭑ a stuck Shift is healed by the tick, from the hardware view', () => {
    globalThis.shadow_get_shift_held = () => 0;    /* hardware: Shift is UP */

    S.sessionView = false;
    /* ⚠ The LED painter early-returns on this. Off in the rig, which never ran
     * LED init — leaving it on walks uninitialised paint state and throws from
     * inside forceRedraw(), which is a rig gap, not the behaviour under test. */
    S.ledInitComplete = false;
    applyShiftEdge(true);                          /* we believe Shift is DOWN */
    if (!S.shiftHeld) throw new Error('setup failed: shiftHeld did not latch');
    if (!S.shiftTrackLEDActive) throw new Error('setup failed: the LED overlay did not arm');

    globalThis.tick();

    if (S.shiftHeld)
        throw new Error('shiftHeld survived the tick — the release was never healed');
    if (S.shiftTrackLEDActive)
        throw new Error('the track-LED overlay is still armed — this is the symptom Josh saw');
});

/* ⚠ CONTROL. Without this the step above passes just as well against a tick that
 * clears shiftHeld unconditionally — which would make Shift unusable, a far
 * worse bug than the one being fixed. */
step('⚠ CONTROL: a genuinely held Shift is NOT cleared', () => {
    globalThis.shadow_get_shift_held = () => 1;    /* hardware: Shift is DOWN */

    S.sessionView = false;
    S.ledInitComplete = false;
    /* Set the flag directly rather than via applyShiftEdge(): the control only
     * needs the reconcile's INPUT state, and the real edge drags in the LED
     * repaint, which this bare rig cannot walk (no LED init). */
    S.shiftHeld = true;
    globalThis.tick();

    if (!S.shiftHeld)
        throw new Error('a held Shift was cleared — the reconcile is firing on agreement');
    S.shiftHeld = false;
});

/* The heal must run the FULL release, not just drop the flag. A half-heal leaves
 * the volume claim raised and the pending level unsaved — a subtler wrong state
 * than the stuck LEDs. Pinned by routing: both paths go through applyShiftEdge. */
step('⭑ the heal runs the same edge the real release runs', () => {
    const src = require('fs').readFileSync('ui/ui_tick.mjs', 'utf8');
    const i = src.indexOf('shadow_get_shift_held()');
    if (i < 0) throw new Error('the reconcile is gone — re-anchor this pin');
    const near = src.slice(i, i + 200);
    if (!/applyShiftEdge\(false\)/.test(near))
        throw new Error('the reconcile clears state itself instead of calling applyShiftEdge — ' +
                        'it will drift from the real release path');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
