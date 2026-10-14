
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
/* tests/js/test_mirror_mic_switch.mjs — the Mirror Mic row in the global menu.
 * The web mirror can record the device's microphone only after it is switched
 * on HERE: the row is the one door, it reads the host's byte rather than a
 * copy of its own, and nothing about it is written to disk (a saved On would
 * open the microphone at the next launch with nobody at the device). Read off
 * the menu the real door opens. */
const calls = [];
let micByte = false;
globalThis.host_mirror_mic = (...a) => { calls.push(a.slice()); if (a.length) micByte = !!a[0]; return micByte; };
const writes = [];
globalThis.host_file_exists = () => false; globalThis.host_read_file = () => '';
globalThis.host_write_file = (p, c) => { writes.push(String(p)); return true; };
const cmds = [];
globalThis.host_system_cmd = (c) => { cmds.push(String(c)); return 0; };

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
const row = () => (S.globalMenuItems || []).find((it) => it.label === 'Mirror Mic');

step('the row is in the menu, with the device settings', () => {
    menu.openGlobalMenu();
    if (!S.globalMenuOpen) throw new Error('menu did not open');
    const l = labels(); const i = l.indexOf('Mirror Mic');
    if (i < 0) throw new Error('no Mirror Mic row: ' + l.join(' | '));
    if (l[i - 1] !== 'Move Settings...' || l[i + 1] !== '---')
        throw new Error('wrong place: ' + l.slice(i - 2, i + 2).join(' | '));
});

step('it starts Off, and reading it sets nothing', () => {
    calls.length = 0;
    if (row().get() !== false) throw new Error('it does not read Off');
    if (calls.some((a) => a.length)) throw new Error('reading the row SET the byte: ' + JSON.stringify(calls));
});

step('On sets the host byte, and the row reads the byte back', () => {
    row().set(true);
    if (micByte !== true) throw new Error('the byte was not set');
    if (row().get() !== true) throw new Error('the row still reads Off');
});

step('the row shows what the HOST holds, not a copy of its own', () => {
    micByte = false;                 /* a relaunch clears it under the menu */
    if (row().get() !== false) throw new Error('the row kept its own On');
    micByte = true;
});

step('Off clears it', () => {
    row().set(false);
    if (micByte !== false) throw new Error('the byte is still set');
    if (row().get() !== false) throw new Error('the row still reads On');
});

step('nothing was saved or run: the switch does not outlive the session', () => {
    row().set(true); row().set(false);
    if (writes.length) throw new Error('wrote: ' + writes.join(' ; '));
    if (cmds.length) throw new Error('ran: ' + cmds.join(' ; '));
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
