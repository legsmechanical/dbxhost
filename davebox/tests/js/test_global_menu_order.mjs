
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const ENGINE = {
    'synth:module': 'nusaw',
    'slot:volume': '1.000', 'slot:pan': '0.500',
    'slot:send_a': '0.250', 'slot:send_b': '0.100',
    'slot:muted': '0', 'slot:soloed': '0',
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, v) => { ENGINE[key] = String(v); return 1; };
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
/* tests/js/test_global_menu_order.mjs — the global menu's rows and groups, as
 * Josh laid them out with the menu arranger (2026-09-24). The list is read off
 * the menu the real door opens, dividers included, so a reorder, a lost rule or
 * a row that comes back fails here. */
async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const menu = await import('../../ui/ui_menu.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'menu-uuid';
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
let failed = 0;
menu.openGlobalMenu();
const got = (S.globalMenuItems || []).map((it) => it.type === 'divider' ? '---' : it.label);
const want = ['BPM', 'Swing Amt', 'Swing Res', '---', 'Metro', 'Metro Vol', '---',
    'Clock Follow', 'Clock Out', '---', 'Key', 'Scale', 'Scale Aware', '---',
    'Launch', 'Beat Marks', '---', 'MIDI In', '---', 'Projects...', '---',
    'Save state', 'Load state', 'Clear Sess', '---', 'Export to Ableton', '---',
    'Suspend session', 'Quit', '---', 'Host Settings...', '---', 'Daves', 'Open Your Dave Box'];
if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error('  FAIL — the global menu order:\n    got  ' + got.join(' | ') + '\n    want ' + want.join(' | '));
    failed = 1;
} else console.log('  ok   — the global menu is in the ruled order, with its groups');
if (got.indexOf('Tap Tempo') >= 0) { console.error('  FAIL — Tap Tempo is back in the menu'); failed = 1; }
process.exit(failed);
}
main();
