import './_bulk_get_stub.mjs';
/* tests/js/test_picker_current_late_identity.mjs — picking the project Move
 * already has open, when the host confirmed it only AFTER dAVEBOx started
 * (Josh, 2026-09-27: "when i first loaded, the last used project 'neato'
 * wouldn't load. loaded another project and then tried to reload neato and it
 * was fine").
 *
 * On the device: init() ran while the host's identity was still `pending`, so
 * S.currentSetUuid stayed empty (on purpose); the host then confirmed neato,
 * the picker marked it current from that confirmation, and the pick took the
 * "already open" shortcut — which sent state_load with the EMPTY identity. The
 * DSP refused each one ("state_load REFUSED: empty identity is not a project")
 * and the watchdog put the picker back, five presses running.
 *
 * Performs it through the real boot: init() with a pending identity, the host
 * confirming, Shift + the project's pad, then the ticks that send the load.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const PROJECTS = JSON.stringify({ current: 0, projects: [
    { uuid: 'p-other', name: 'Project 22', index: 0, color: 1 },
    { uuid: 'p-neato', name: 'neato', index: 11, color: 2 },
]});
let identity = 'pending';
const sets = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (typeof p === 'string' && p.endsWith('projects.json')) ? PROJECTS
    : (typeof p === 'string' && p.endsWith('fresh_session')) ? '1' : '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.shadow_get_param = (slot, k) => {
    if (k === 'active_set_state') return identity === 'open' ? 'open\n\n1' : 'pending\n\n-1';
    if (k === 'active_set') return identity === 'open' ? 'p-neato\nMove-Set-p-neato' : '';
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.host_module_get_param = (k) => (k === 'awaiting_select' ? '1' : k === 'playing' ? '0' : '');
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); };
globalThis.host_module_set_params = () => true;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {}; globalThis.move_midi_inject_to_move = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_ui_flags = () => 0; globalThis.shadow_clear_ui_flags = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
S.clockFollowTicks = true; S.tickCount = 1000;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };

step('setup: a fresh session starts AWAITING, with the host identity still pending', () => {
    globalThis.init();
    assert(S.awaitingProjectSelect, 'not awaiting a pick');
    assert(S.currentSetUuid === '', 'control: an identity was adopted while pending: ' + S.currentSetUuid);
});
step('the host confirms neato after init; the picker marks it current', () => {
    identity = 'open';
    S.ledInitComplete = true; S.stateLoading = false; S.pendingDspSync = 0;
    ticks(5);
    if (!S.projectPadPicker) dlg.openProjectPadPicker();
    assert(S.projectPadPicker, 'no picker');
    assert(S.projectPadPicker.current === 11, 'neato not current: ' + S.projectPadPicker.current);
});
step('⭐⭐ picking it LOADS it: state_load names neato, never the empty identity', () => {
    sets.length = 0;
    S.shiftHeld = true; dlg.projectPadPickerTap(11); S.shiftHeld = false;
    ticks(3);
    const loads = sets.filter(([k]) => k === 'state_load').map(([, v]) => v);
    assert(loads.length >= 1, 'no state_load sent; sets: ' + JSON.stringify(sets.slice(0, 12)));
    assert(!loads.includes(''), 'sent state_load with the EMPTY identity: ' + JSON.stringify(loads));
    assert(loads[0] === 'p-neato', 'state_load names ' + JSON.stringify(loads[0]));
});

if (failed) { console.log('FAIL: picking the open project after a late confirmation'); process.exit(1); }
console.log('PASS: picking the open project loads it, however late the host confirmed it');
}
main().catch((e) => { console.error(e); process.exit(1); });
