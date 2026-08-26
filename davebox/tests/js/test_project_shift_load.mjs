/* tests/js/test_project_shift_load.mjs — Shift+project-pad loads immediately,
 * and creates the project first when the pad is empty.
 *
 * Josh, 2026-08-26: "Project management: Shift+project-pad loads that project
 * IMMEDIATELY - and CREATES it first if the pad is empty."
 *
 * ⚠⚠ THE CONTROL IS THE POINT OF THIS FILE. A plain tap must STILL not load —
 * that is a deliberate spec (Josh, 2026-08-11: a stray finger on the picker must
 * not swap the project out from under you), and the obvious wrong implementation
 * of this request is to make the pad load unconditionally. That version passes
 * every positive assertion below while deleting the protection. So the plain-tap
 * case is asserted alongside the new one, not assumed.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const cmds = [];
/* The pad the create is allowed to succeed on; _pppRunList re-reads this. */
let projectsOnDisk = { projects: [
    { uuid: 'a', name: 'A', index: 0, color: 2 },
    { uuid: 'b', name: 'B', index: 1, color: 0 },
] };

globalThis.host_system_cmd = (c) => {
    cmds.push(c);
    /* Model the create actually happening, so the "then load" half is reachable.
     * Without this the list never gains the pad and the code correctly reports
     * CREATE FAILED — which would look like the feature not working. */
    const m = /new-at (\d+)/.exec(c);
    if (m) projectsOnDisk.projects.push(
        { uuid: 'new' + m[1], name: 'NEW', index: Number(m[1]), color: 1 });
    return 0;
};
globalThis.host_read_file = (path) =>
    String(path).indexOf('projects') >= 0 ? JSON.stringify(projectsOnDisk) : '';
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
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
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

/* ⚠ Everything below lives in main(): the bundler emits CJS, where a top-level
 * await is a build error, not a runtime one — the test simply never runs. */
async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { projectPadPickerTap } = await import('../../ui/ui_dialogs.mjs');

function mkPicker(currentIdx) {
    return {
        projects: [], current: currentIdx,
        byIndex: {
            0: { uuid: 'a', name: 'A', index: 0, color: 2 },
            1: { uuid: 'b', name: 'B', index: 1, color: 0 },
            /* pad 2 deliberately EMPTY */
        },
        touchedIdx: -1, copySrcIdx: -1, deleteIdx: -1,
        menu: null, colorPick: null, confirmNew: null,
        renameActive: false, restarting: false,
    };
}
function step(l, fn) {
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

/* CONTROL FIRST — the protection this feature must not remove. */
step('control: a PLAIN tap still does not load (2026-08-11 spec)', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = false;
    S.pendingProjectSwitch = -1;
    projectPadPickerTap(1);
    if (S.pendingProjectSwitch === 1)
        throw new Error('a plain tap loaded the project — the accidental-load guard is gone');
    if (!S.projectPadPicker.menu)
        throw new Error('a plain tap on an occupied pad should open its menu');
});

step('control: a plain tap on an EMPTY pad still asks before creating', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = false;
    cmds.length = 0;
    projectPadPickerTap(2);
    if (cmds.some((c) => c.indexOf('new-at') >= 0))
        throw new Error('a plain tap created a project without asking');
    if (!S.projectPadPicker.confirmNew)
        throw new Error('a plain tap on an empty pad should raise the create confirm');
});

step('Shift+tap on an OCCUPIED pad loads it immediately', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = true;
    S.pendingProjectSwitch = -1;
    projectPadPickerTap(1);
    if (S.pendingProjectSwitch !== 1)
        throw new Error('Shift+tap did not request the switch; pending=' + S.pendingProjectSwitch);
});

step('Shift+tap on an EMPTY pad CREATES it, then loads it', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = true;
    S.pendingProjectSwitch = -1;
    cmds.length = 0;
    projectPadPickerTap(2);
    if (!cmds.some((c) => c.indexOf('new-at 2') >= 0))
        throw new Error('no create was issued for the empty pad: ' + JSON.stringify(cmds));
    if (S.pendingProjectSwitch !== 2)
        throw new Error('created but did not load; pending=' + S.pendingProjectSwitch);
});

step('a create that FAILS reports it and does not load', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = true;
    S.pendingProjectSwitch = -1;
    S.actionPopupEndTick = -1;
    const realCmd = globalThis.host_system_cmd;
    globalThis.host_system_cmd = (c) => { cmds.push(c); return 1; };   /* creates nothing */
    try {
        projectPadPickerTap(3);
        if (S.pendingProjectSwitch === 3)
            throw new Error('loaded a project the create never made');
        if (S.actionPopupEndTick < 0)
            throw new Error('a failed create said nothing');
    } finally { globalThis.host_system_cmd = realCmd; }
});

/* Delete and Copy are checked BEFORE Shift, so a held Delete keeps its meaning
 * rather than becoming ambiguous with the new gesture. */
step('a held Delete still wins over Shift', () => {
    S.projectPadPicker = mkPicker(0);
    S.shiftHeld = true;
    S.deleteHeld = true;
    S.pendingProjectSwitch = -1;
    projectPadPickerTap(1);
    if (S.pendingProjectSwitch === 1)
        throw new Error('Shift+Delete+tap loaded the project instead of arming the delete');
    S.deleteHeld = false;
});

if (failed) process.exit(1);
console.log('test_project_shift_load: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
