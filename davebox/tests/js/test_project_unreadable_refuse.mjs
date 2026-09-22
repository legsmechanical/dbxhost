/* tests/js/test_project_unreadable_refuse.mjs — a project whose song Move
 * cannot read is REFUSED in the picker, with the reason on screen.
 *
 * Josh, 2026-09-22: "unreadable - refuse to open with notice". Move reports
 * such a load as OPENED, so nothing downstream could catch it: the picker is
 * the last place it can be stopped. project-cmd's list says why per project
 * (`broken`); tests/host/test_project_unreadable.sh pins that half.
 *
 * ⚠ Every refusal here is paired with the SAME gesture on a healthy project
 * going through — a check that refuses everything would pass every refusal
 * assertion and lock the user out of their work.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const cmds = [];
const printed = [];
const ledState = {};
let slotAnswer = { ok: true, slot: 1, project: 'b', slot_uuid: 's1', why: '' };
const projectsOnDisk = { projects: [
    { uuid: 'a', name: 'A', index: 0, color: 2, broken: null },
    { uuid: 'b', name: 'B', index: 1, color: 0, broken: null },
    { uuid: 'x', name: 'X', index: 2, color: 0, broken: 'invalid' },
] };

globalThis.host_system_cmd = (c) => { cmds.push(c); return 0; };
globalThis.host_read_file = (path) =>
    String(path).indexOf('projects') >= 0 ? JSON.stringify(projectsOnDisk)
  : String(path).indexOf('slot_switch') >= 0 ? JSON.stringify(slotAnswer) : '';
globalThis.host_file_exists = () => true;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => { printed.length = 0; };
globalThis.print = (x, y, t) => { printed.push(String(t)); };
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
globalThis.move_midi_internal_send = (pkt) => { ledState[pkt[2]] = pkt[3]; };
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 1;
/* The tick's own reads/writes (the stop-before-save steps at the end drive it). */
globalThis.host_module_get_params = () => '';
globalThis.host_module_set_params = () => true;
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.host_autosave_hold = () => {};
globalThis.pixel_print = () => {};
globalThis.move_midi_external_send = () => {};


async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const { drawUI } = await import('../../ui/ui_render.mjs');
const { updateSessionLEDs, invalidateLEDCache } = await import('../../ui/ui_leds.mjs');
const { DeepRed } = await import('/data/UserData/schwung/shared/constants.mjs');
const _pendPad = () => S.pendingProjectSwitch ? S.pendingProjectSwitch.pad : null;

function mkPicker(currentIdx) {
    const byIndex = {};
    for (const pr of projectsOnDisk.projects) byIndex[pr.index] = pr;
    return { projects: projectsOnDisk.projects, current: currentIdx, byIndex,
             touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
             menu: null, colorPick: null, confirmNew: null,
             renameActive: false, restarting: false };
}
function fresh() {
    S.projectPadPicker = mkPicker(0);
    S.awaitingProjectSelect = false; S.forceRelaunchNextLoad = false;
    S.pendingProjectSwitch = null; S.pendingProjectRelaunch = null;
    S.switchLoading = null; S.actionPopupEndTick = -1; S.actionPopupLines = [];
    S.shiftHeld = false; cmds.length = 0;
}
const screen = () => { S.screenDirty = true; drawUI(); return printed.slice(); };
const cardUp = () => { const t = screen(); return t.includes("CAN'T OPEN") && t.includes('Song file damaged'); };

step('⚠ Shift+tap on an UNREADABLE project: no switch, picker stays, CAN\'T OPEN / Song file damaged on screen', () => {
    fresh(); S.shiftHeld = true;
    dlg.projectPadPickerTap(2);
    assert(_pendPad() === null && S.pendingProjectRelaunch === null, 'a load was requested: ' + JSON.stringify(S.pendingProjectSwitch));
    assert(S.projectPadPicker, 'the picker closed');
    assert(cardUp(), 'no refusal card on screen, printed: ' + JSON.stringify(printed));
});
step('⚠ control: the SAME gesture on a healthy project loads it, with no card', () => {
    fresh(); S.shiftHeld = true;
    dlg.projectPadPickerTap(1);
    assert(_pendPad() === 1, 'the healthy project was not loaded');
    assert(!cardUp(), 'a refusal card came up for a healthy project');
});
/* The menu is drawn in the kit font (not `print`), so its ROWS are read from
 * the model the drawer draws — after the real tap opened it. */
const rowsOf = () => dlg._pppMenuModel(S.projectPadPicker, S.projectPadPicker.menu.k).map(r => r.label);
step('a plain tap opens the menu with "(Can\'t open)" instead of Load; Rename and Color stay', () => {
    fresh();
    dlg.projectPadPickerTap(2);
    assert(S.projectPadPicker.menu && S.projectPadPicker.menu.k === 2, 'the tap did not open pad 2\'s menu');
    const r = rowsOf();
    assert(r[0] === "(Can't open)" && !r.includes('Load') && r.includes('Rename') && r.includes('Color'), 'rows: ' + JSON.stringify(r));
    assert(S.projectPadPicker.menu.sel === 1, 'the cursor starts on the status row, sel=' + S.projectPadPicker.menu.sel);
    /* The status shows as the name row's VALUE — it must be ITS word. It said
     * CURRENT for every status on the device. */
    const m = dlg._pppMenuModel(S.projectPadPicker, 2);
    assert(m[0].value === "CAN'T OPEN", 'status value beside the name: ' + m[0].value);
});
step('control: a healthy project\'s menu still offers Load', () => {
    fresh();
    dlg.projectPadPickerTap(1);
    assert(rowsOf().includes('Load'), 'Load missing on a healthy project: ' + JSON.stringify(rowsOf()));
});
step('the unreadable pad is DIM red, steady; a healthy pad keeps its own colour', () => {
    fresh(); S.ledInitComplete = true; invalidateLEDCache();
    for (const tk of [0, 30]) { S.tickCount = tk; S.clockMs = tk * 10.6; updateSessionLEDs(); }
    assert(ledState[68 + 2] === DeepRed, 'unreadable pad = ' + ledState[68 + 2]);
    assert(ledState[68 + 1] !== DeepRed, 'the healthy pad is dim red too');
});
globalThis.shadow_select_arm = () => {};
globalThis.host_suspend_overtake = () => {};
const { _tickImpl } = await import('../../ui/ui_tick.mjs');
const { BANKS } = await import('../../ui/ui_constants.mjs');
if (!S.bankParams) S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
step('⚠ the song broke AFTER listing: the switch-slot refusal reopens the picker with the reason', () => {
    fresh(); S.shiftHeld = true; S.playing = false; S.ledInitComplete = true;
    S.pendingSuspendSave = false; S.pendingStopBeforeSave = false; S.bootSplashMs = 0;
    dlg.projectPadPickerTap(1);                       /* listed healthy: the switch is requested */
    assert(_pendPad() === 1, 'control: switch requested');
    slotAnswer = { ok: false, slot: -1, project: '', slot_uuid: '', why: 'unreadable:invalid' };
    for (let i = 0; i < 4 && S.pendingProjectSwitch; i++) _tickImpl();
    assert(S.pendingProjectSwitch === null, 'the switch never drained');
    assert(S.projectPadPicker, 'the picker did not come back');
    assert(cardUp(), 'no specific card after a pick-time refusal: ' + JSON.stringify(printed));
    slotAnswer = { ok: true, slot: 1, project: 'b', slot_uuid: 's1', why: '' };
});

if (failed) { console.log('FAIL: unreadable projects'); process.exit(1); }
console.log('PASS: an unreadable project is refused in the picker, with the reason; healthy ones load');
}
main().catch(e => { console.error(e); process.exit(1); });
