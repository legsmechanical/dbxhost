/* tests/js/test_power_off_dialog.mjs — SAVE & POWER OFF (Josh, 2026-10-23:
 * power-off should "turn off", through "our own" dialog, and a hold must NOT
 * skip the confirm).
 *
 * The button is NOT claimed for now (ui.js, above the MIDI input section): the
 * shim takes any power SysEx as a press, and some arrive unpressed (suspected).
 * So onPowerButton must stay unexported, and the dialog is driven here through
 * requestPowerOff — what the export called — so it is ready to come back.
 * Tap and hold must both raise the POWER OFF? modal and nothing else;
 * No leaves everything as it was; Yes runs Quit's own staging (stop, save,
 * farewell) and the farewell runs power-off.sh — never exit-to-stock.sh — with
 * "Powering off..." on screen. A Quit still runs exit-to-stock.sh. */

import './_bulk_get_stub.mjs';   /* the bulk read, derived from the single-read stub */
import { readFileSync } from 'fs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
/* A loaded generator: engineLoadedModule() reads `<comp>:module`, and an empty
 * answer is what "no generator" looks like — so the happy path needs a name. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
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
globalThis.shadow_get_shift_held = () => 1;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();

await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const menu = await import('../../ui/ui_menu.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const { openProjectPadPicker, closeProjectPadPicker } = await import('../../ui/ui_dialogs.mjs');
const MoveBack = 51;                   /* the Back button's CC */
const JOG_CLICK = 3, JOG_TURN = 14;    /* jog click / jog step CCs */

S.clockFollowTicks = true;             /* time in tests is driven by S.tickCount */
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; tickmod._tickImpl(); } }
function step(l, fn) {
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
const sysCmds = [];
globalThis.host_system_cmd = (c) => { sysCmds.push(String(c)); return 0; };
function armed() { return !!(S.pendingSuspendManaged || S.pendingExitAfterSave || S.exitFarewell !== 0); }
function reset() {
    S.confirmExit = null; S.confirmExitSel = 1; S.confirmExitFromMenu = null;
    S.pendingSuspendManaged = false; S.pendingExitAfterSave = false;
    S.pendingSuspendSave = false; S.pendingStopBeforeSave = false;
    S.playing = false; S.exitFarewell = 0; S.exitKind = null;
    S.globalMenuOpen = false; S.awaitingProjectSelect = false;
    sysCmds.length = 0;
}
const sentParams = [];
globalThis.host_module_set_param = (k, v) => { sentParams.push(k + '=' + v); };
function screenText() {
    const printed = [];
    const realPrint = globalThis.print;
    globalThis.print = (x, y, t) => { printed.push(String(t)); };
    fonts.setKitTextTrace((t) => printed.push(String(t)));
    try { render.drawUI(); } finally { globalThis.print = realPrint; fonts.setKitTextTrace(null); }
    return printed.join('|');
}

step('setup: a booted session in track view', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false; S.activeTrack = 0;
    reset();
    if (typeof globalThis.onPowerButton !== 'undefined')
        throw new Error('onPowerButton is exported — the host would claim the button again');
});

for (const [id, what] of [[0x2A, 'a tap'], [0x3A, 'a HOLD']]) {
    step(`${what} on POWER asks first (opens on No) and does nothing else`, () => {
        reset();
        tickmod.requestPowerOff(id);
        if (S.confirmExit !== 'poweroff') throw new Error('modal is ' + S.confirmExit);
        if (S.confirmExitSel !== 1) throw new Error('did not open on No');
        if (armed()) throw new Error('the press already started leaving');
        ticks(3);
        if (armed() || sysCmds.length) throw new Error('a tick later it acted: ' + sysCmds.join(','));
        const t = screenText();
        if (t.indexOf('POWER OFF?') < 0) throw new Error('not on screen: ' + t.slice(0, 120));
    });
}

step('No (click on No) closes it and nothing moves', () => {
    reset();
    tickmod.requestPowerOff(0x2A);
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (S.confirmExit !== null) throw new Error('still up');
    ticks(10);
    if (armed() || S.exitKind || sysCmds.length) throw new Error('No powered off: ' + sysCmds.join(','));
});

step('Yes: stop, save, "Powering off...", then power-off.sh — never exit-to-stock.sh', () => {
    reset();
    S.playing = true;
    tickmod.requestPowerOff(0x2A);
    cc(JOG_TURN, 1);                                  /* No → Yes */
    if (S.confirmExitSel !== 0) throw new Error('the wheel did not move to Yes');
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (S.exitKind !== 'poweroff') throw new Error('exitKind ' + S.exitKind);
    sentParams.length = 0;
    let farewellText = '';
    for (let i = 0; i < 40 && S.exitFarewell !== -1; i++) {
        S.tickCount++; tickmod._tickImpl();
        if (S.exitFarewell > 0 && !farewellText) farewellText = screenText();
    }
    if (sentParams.indexOf('transport=stop') < 0) throw new Error('no transport stop: ' + sentParams.join(','));
    if (sentParams.indexOf('save=1') < 0) throw new Error('no save: ' + sentParams.join(','));
    if (sentParams.indexOf('transport=stop') > sentParams.indexOf('save=1')) throw new Error('saved before stopping');
    if (farewellText.indexOf('Powering off...') < 0) throw new Error('farewell said: ' + farewellText);
    if (sysCmds.length !== 1 || sysCmds[0] !== 'sh /data/UserData/daveboxSA/scripts/power-off.sh')
        throw new Error('ran: ' + sysCmds.join(' ; '));
});

step('a second press while leaving changes nothing', () => {
    const before = sysCmds.length;
    tickmod.requestPowerOff(0x2A);
    if (S.confirmExit) throw new Error('raised a dialog over the farewell');
    if (sysCmds.length !== before) throw new Error('ran again');
});

step('POWER over an open Quit confirm takes it (back on No)', () => {
    reset();
    globalThis.onSessionExitRequest();
    if (S.confirmExit !== 'quit') throw new Error('setup: ' + S.confirmExit);
    cc(JOG_TURN, 1);                                  /* Quit's Yes selected */
    tickmod.requestPowerOff(0x3A);
    if (S.confirmExit !== 'poweroff' || S.confirmExitSel !== 1) throw new Error(S.confirmExit + '/' + S.confirmExitSel);
    if (armed()) throw new Error('acted');
});

step('control: Quit still runs exit-to-stock.sh, with "Exiting..."', () => {
    reset();
    globalThis.onSessionExitRequest();
    cc(JOG_TURN, 1); cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    let farewellText = '';
    for (let i = 0; i < 40 && S.exitFarewell !== -1; i++) {
        S.tickCount++; tickmod._tickImpl();
        if (S.exitFarewell > 0 && !farewellText) farewellText = screenText();
    }
    if (farewellText.indexOf('Exiting...') < 0) throw new Error('farewell said: ' + farewellText);
    if (sysCmds.length !== 1 || sysCmds[0] !== 'sh /data/UserData/daveboxSA/scripts/exit-to-stock.sh')
        throw new Error('ran: ' + sysCmds.join(' ; '));
});

process.exit(failed);
}
main();
