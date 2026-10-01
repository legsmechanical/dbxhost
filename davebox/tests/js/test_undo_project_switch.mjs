import './_bulk_get_stub.mjs';
/* tests/js/test_undo_project_switch.mjs — Undo never reaches across a project
 * switch (2026-10-01). Every undo/redo unit describes the project open before
 * the switch; an Undo right after opening another one restored THAT project's
 * clip into it. The tick's state_load send drops the JS units (forgetUndo); the
 * DSP drops its own (tests/test_state_load_drops_undo.c). Performs the real
 * Undo press. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.stipple_rect = () => {}; globalThis.set_pixel = () => {};
let printed = [];
globalThis.print = (x, y, t) => { printed.push(String(t)); };
let stepLights = {};
let buttonLights = {};
globalThis.move_midi_internal_send = (m) => {
    const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90 && a[2] >= 16 && a[2] <= 31) stepLights[a[2] - 16] = a[3];
    if (a.length >= 4 && (a[1] & 0xF0) === 0xB0) buttonLights[a[2]] = a[3];
    return true;
};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};



async function main() {
await import('../../ui/ui.js');
const { S, noteUndoUnit } = await import('../../ui/ui_state.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.tickCount = 1000;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const UNDO = 56, SHIFT = 49;
const undoSent = () => sets.concat(S.pendingDefaultSetParams.map(p => p.key + '=' + p.val)).filter(s => /^(undo_restore|redo_restore)/.test(s));

step('control: an edit\'s Undo unit, Undo pressed in the same project → undo_restore', () => {
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.currentSetUuid = 'aaaaaaaa-2222-3333-4444-555555555555';
    noteUndoUnit();
    cc(UNDO, 127); cc(UNDO, 0);
    assert(undoSent().some(s => /^undo_restore/.test(s)), 'Undo did not restore: ' + JSON.stringify(sets));
});

step('⭐ an edit, then ANOTHER project opens: Undo does nothing (and neither does Redo)', () => {
    noteUndoUnit();
    S.undoJs = { fn: () => {} }; S.undoSeqArpSnapshot = { x: 1 };
    S.currentSetUuid = 'bbbbbbbb-2222-3333-4444-555555555555';
    S.pendingSetLoad = true;
    ticks(1);
    assert(sets.some(s => /^state_load=/.test(s)), 'rig: the load was not sent: ' + JSON.stringify(sets));
    assert(!S.undoAvailable && !S.redoAvailable && !S.undoJs && !S.undoSeqArpSnapshot,
           'units survived the switch: ' + JSON.stringify([S.undoAvailable, S.redoAvailable, !!S.undoJs, !!S.undoSeqArpSnapshot]));
    sets.length = 0; S.pendingDefaultSetParams.length = 0;
    S.stateLoading = false; S.pendingDspSync = 0;
    cc(UNDO, 127); cc(UNDO, 0);
    cc(SHIFT, 127); cc(UNDO, 127); cc(UNDO, 0); cc(SHIFT, 0);
    assert(undoSent().length === 0, 'Undo/Redo reached the previous project: ' + JSON.stringify(undoSent()));
});

if (failed) { console.log('FAIL: test_undo_project_switch'); process.exit(1); }
console.log('PASS: test_undo_project_switch');
}
main().catch(e => { console.error(e); process.exit(1); });
