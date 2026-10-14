
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
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, v) => { ENGINE[key] = String(v); return 1; };
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
/* tests/js/test_bluetooth_switch.mjs — the Bluetooth row in the global menu.
 * Shown only on a unit whose launcher left the "controller present" marker (a
 * stock unit has no Bluetooth and must not see the row); flipping it records
 * the choice device-global and runs the radio script. Read off the menu the
 * real door opens. */
const DIR = '/data/UserData/dbx-host';
const files = {};                 /* path -> content; absent = no such file */
const cmds = [];
let cmdRc = 0;
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p);
globalThis.host_read_file = (p) => (files[p] != null ? files[p] : '');
globalThis.host_write_file = (p, c) => { files[p] = String(c); return true; };
globalThis.host_system_cmd = (c) => { cmds.push(String(c)); return cmdRc; };

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const menu = await import('../../ui/ui_menu.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'menu-uuid';
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
let failed = 0;
function step(l, fn) { try { fn(); console.log('  ok   — ' + l); } catch (e) { console.error('  FAIL — ' + l + ': ' + (e && e.stack ? e.stack : e)); failed = 1; } }
const labels = () => (S.globalMenuItems || []).map((it) => it.type === 'divider' ? '---' : it.label);
const row = () => (S.globalMenuItems || []).find((it) => it.label === 'Bluetooth');

step('a unit with no Bluetooth controller has no Bluetooth row', () => {
    menu.openGlobalMenu();
    if (!S.globalMenuOpen) throw new Error('menu did not open');
    if (row()) throw new Error('the row is shown without the marker: ' + labels().join(' | '));
    if (cmds.some((c) => c.indexOf('bluetooth') >= 0)) throw new Error('the radio script ran: ' + cmds.join(' ; '));
});

step('with the marker the row sits with the device settings, after Move Settings', () => {
    files[DIR + '/bluetooth-present'] = '';
    S.globalMenuOpen = false; menu.openGlobalMenu();
    const l = labels(); const i = l.indexOf('Bluetooth');
    if (i < 0) throw new Error('no Bluetooth row: ' + l.join(' | '));
    if (l[i - 1] !== 'Move Settings...' || l[i + 1] !== '---')
        throw new Error('wrong place: ' + l.slice(i - 2, i + 2).join(' | '));
});

step('no saved choice reads On, and reading it runs nothing', () => {
    if (row().get() !== true) throw new Error('default is not On');
    if (cmds.some((c) => c.indexOf('bluetooth') >= 0)) throw new Error('reading the row ran: ' + cmds.join(' ; '));
});

step('Off records the choice and powers the radio down', () => {
    cmds.length = 0;
    row().set(false);
    if (files[DIR + '/bluetooth.txt'] !== '0\n') throw new Error('pref file: ' + JSON.stringify(files[DIR + '/bluetooth.txt']));
    if (cmds.length !== 1 || cmds[0] !== 'sh ' + DIR + '/scripts/bluetooth-cmd.sh off')
        throw new Error('ran: ' + JSON.stringify(cmds));
    if (row().get() !== false) throw new Error('the row still reads On');
});

step('On records the choice and powers it back up', () => {
    cmds.length = 0;
    row().set(true);
    if (files[DIR + '/bluetooth.txt'] !== '1\n') throw new Error('pref file: ' + JSON.stringify(files[DIR + '/bluetooth.txt']));
    if (cmds.length !== 1 || cmds[0] !== 'sh ' + DIR + '/scripts/bluetooth-cmd.sh on')
        throw new Error('ran: ' + JSON.stringify(cmds));
});

step('a saved Off is what a fresh session shows', () => {
    files[DIR + '/bluetooth.txt'] = '0\n';
    S.bluetoothOn = null;
    S.globalMenuOpen = false; menu.openGlobalMenu();
    if (row().get() !== false) throw new Error('a saved 0 read as On');
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
