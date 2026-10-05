import './_bulk_get_stub.mjs';
/* tests/js/test_delete_step_lock_order.mjs — Delete + step clears the step's
 * automation locks AFTER the note clear that takes the undo snapshot.
 *
 * THE BUG THIS PINS (2026-10-04 module review, R-20b): the lock clear went on
 * the automation file's own write list, which flushes a tick EARLY, while the
 * melodic note clear rides the one-per-tick queue and is what snapshots undo.
 * So the locks were gone before the snapshot was taken, and Undo brought the
 * note back without them. The drum lane's clear is sent at once, so there the
 * order was already right; both are checked.
 *
 * The real gesture: hold Delete, press the step, run the ticks; every write
 * the DSP receives, single or bulk, in one ordered list. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const sets = [];
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {}; globalThis.flush_display = () => {};
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_ui_flags = () => 0; globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.tickCount = 1000;

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));
const DELETE = 119, STEP = (i) => 16 + i;
const ticks = (n) => { for (let i = 0; i < n; i++) globalThis.tick(); };

function deleteStep(t, i) {
    S.activeTrack = t; S.activeBank = 0; S.copyHeld = false; S.shiftHeld = false;
    S.heldStep = -1; S.heldStepBtn = -1; S.pendingDefaultSetParams.length = 0;
    sets.length = 0;
    cc(DELETE, 127); note(STEP(i), 127); note(STEP(i), 0); cc(DELETE, 0);
    ticks(12);
}
const at = (re) => sets.findIndex(x => re.test(x));

step('melodic: the note clear (the undo snapshot) reaches the DSP BEFORE the lock clear', () => {
    S.trackPadMode[1] = 0; S.trackActiveClip[1] = 0; S.trackCurrentPage[1] = 0;
    S.clipSteps[1][0][3] = 1;
    deleteStep(1, 3);
    const n = at(/^t1_c0_step_3_clear=/), a = at(/^t1_pa_clear_step=/);
    assert(n >= 0, 'no note clear sent: ' + JSON.stringify(sets));
    assert(a >= 0, 'no lock clear sent: ' + JSON.stringify(sets));
    assert(n < a, 'the lock clear landed first (' + a + ' before ' + n + '): ' + JSON.stringify(sets));
});

step('drum: the lane clear goes first too', () => {
    S.trackPadMode[0] = 1; S.trackActiveClip[0] = 0; S.drumStepPage[0] = 0; S.activeDrumLane[0] = 0;
    S.drumLaneSteps[0][0] = new Array(256).fill('0'); S.drumLaneSteps[0][0][3] = '1';
    deleteStep(0, 3);
    const n = at(/^t0_l0_step_3_clear=/), a = at(/^t0_pa_clear_step=/);
    assert(n >= 0 && a >= 0, 'writes: ' + JSON.stringify(sets));
    assert(n < a, 'the lock clear landed first: ' + JSON.stringify(sets));
});

if (failed) { console.error('FAIL: delete_step_lock_order'); process.exit(1); }
console.log('PASS: delete_step_lock_order');
}
main().catch((e) => { console.error(e); process.exit(1); });
