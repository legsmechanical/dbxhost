/* tests/js/test_preflight_notice.mjs — CONFIRM BEFORE EXIT (Josh, 2026-09-05: "add
 * confirmation before davebox exit").
 *
 * Every door out of the session — hold-Back, the menu's Suspend and Quit, the
 * host's Shift+Back (onSessionExitRequest) — must raise the modal FIRST and do
 * nothing else; the exit runs only from its Yes, and Back / No leave the user
 * exactly where they were. The failure this guards is silent: an exit that
 * still fires directly looks like a working exit. So every step asserts BOTH
 * that the modal is up AND that the exit's own flag did not move. */

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
const MoveBack = 51;                   /* the Back button's CC */
const JOG_CLICK = 3, JOG_TURN = 14;    /* jog click / jog step CCs */

S.clockFollowTicks = true;             /* time in tests is driven by S.tickCount */
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; tickmod._tickImpl(); } }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
function armed() {
    /* Neither exit may have moved: suspend arms pendingSuspendManaged, quit arms
     * pendingExitAfterSave. */
    return !!(S.pendingSuspendManaged || S.pendingExitAfterSave);
}
function reset() {
    S.confirmExit = null; S.confirmExitSel = 1;
    S.pendingSuspendManaged = false; S.pendingExitAfterSave = false;
    S.pendingSuspendSave = false; S.exitFarewell = 0;
    S.globalMenuOpen = false; S.awaitingProjectSelect = false;
    S.backPressTick = -1; S.backHoldFired = false; S.moveCoRunTrack = -1;
}
/* A held Back: press, then tick past the ~450 ms threshold (the hold fires
 * from the TICK, not the release), then release. */
function holdBack() {
    cc(MoveBack, 127);
    S.tickCount += 60; ticks(2);          /* 62 ticks ≈ 657 ms ≥ BACK_HOLD_MS */
    cc(MoveBack, 0);
}
function menuAction(label) {
    menu.openGlobalMenu();                 /* builds S.globalMenuItems for the active track */
    const item = S.globalMenuItems.find((it) => it && it.label === label);
    if (!item) throw new Error('no menu item "' + label + '"');
    item.onAction();
}

/* ⚠ THE GAP THIS PINS (hygiene, 2026-09-05): preflight.sh wrote
 * $DBX_DIR/preflight_failed (+ preflight_report.txt) and NOTHING read it — a
 * stock update that broke what we share was invisible without an ssh. The
 * notice is one read at init and one footer line on the project picker. */
const dlg = await import('../../ui/ui_dialogs.mjs');
const FLAG = '/data/UserData/dbx-host/preflight_failed';
const REPORT = '/data/UserData/dbx-host/preflight_report.txt';
let flagPresent = false;
const PROJECTS = JSON.stringify({ current: 5, projects: [
    { uuid: 'u0', name: 'No Color',     index: 0, color: null },   // the crash shape
    { uuid: 'u1', name: 'Colored',      index: 5, color: 2 },
    { uuid: 'u2', name: 'Out Of Range', index: 9, color: 99 },     // future palette shrink
]});
const _exists = globalThis.host_file_exists, _read = globalThis.host_read_file;
globalThis.host_file_exists = (p) => (p === FLAG ? flagPresent : (typeof p === 'string' && p.endsWith('projects.json')) ? true : _exists(p));
globalThis.host_read_file = (p) => (p === REPORT ? 'FAIL heal binary is not setuid (bless.sh)\nFAIL shared/x.mjs missing\n' : (typeof p === 'string' && p.endsWith('projects.json')) ? PROJECTS : _read(p));
/* The notice goes through the host `print` binding (the rig stubs it as a
 * no-op), so it is observed by spying on that call. */
const prints = [];
const _print = globalThis.print;
globalThis.print = (x, y, txt, c) => { prints.push({ y, txt: String(txt) }); return _print ? _print(x, y, txt, c) : undefined; };

function openPicker() {
    S.awaitingProjectSelect = true; S.projectPadPicker = null; S.pendingOpenProjectPicker = true;
    S.ledInitComplete = true; S.stateLoading = false; S.sessionView = false;
    for (let i = 0; i < 4; i++) globalThis.tick();
    if (!S.projectPadPicker) dlg.openProjectPadPicker();      /* the boot rig's own door */
    if (!S.projectPadPicker) throw new Error('control failed: the picker did not open');
}

step('flag ABSENT: init reads nothing, the picker shows no notice', () => {
    flagPresent = false;
    globalThis.init(); openPicker(); prints.length = 0;
    dlg.drawProjectPadPicker();
    if (S.preflightNotice !== null) throw new Error('notice set without a flag: ' + S.preflightNotice);
    if (prints.some(p => p.txt.indexOf('PREFLIGHT') >= 0)) throw new Error('a PREFLIGHT line without a failure');
});

step('flag PRESENT: init keeps the first FAIL line, the picker prints it in the footer, truncated', () => {
    flagPresent = true;
    globalThis.init(); openPicker(); prints.length = 0;
    if (!S.preflightNotice || S.preflightNotice.indexOf('heal binary') !== 0) throw new Error('notice=' + JSON.stringify(S.preflightNotice));
    dlg.drawProjectPadPicker();
    const line = prints.find(p => p.txt.indexOf('PREFLIGHT') === 0);
    if (!line) throw new Error('no PREFLIGHT line printed: ' + JSON.stringify(prints.slice(0, 6)));
    if (line.y !== 57) throw new Error('not in the footer row: y=' + line.y);
    if (line.txt.length > 21) throw new Error('not truncated to the width: ' + JSON.stringify(line.txt));
    if (line.txt.indexOf('HEAL') < 0) throw new Error('the report text is not in the line: ' + line.txt);
    /* the text itself: the source pin — one line, PREFLIGHT prefix, truncated to the width */
    const src = readFileSync('ui/ui_dialogs.mjs', 'utf8');
    if (!/print\(2, MV_FOOTER_Y, msg\.length > 21 \? msg\.slice\(0, 20\) \+ '~' : msg, 1\);/.test(src)) throw new Error('the footer line is not the truncated PREFLIGHT print');
});

step('the read happens at INIT only — ticks and draws never re-read the files', () => {
    let reads = 0; const r2 = globalThis.host_file_exists;
    globalThis.host_file_exists = (p) => { if (p === FLAG) reads++; return r2(p); };
    for (let i = 0; i < 50; i++) globalThis.tick();
    dlg.drawProjectPadPicker();
    globalThis.host_file_exists = r2;
    if (reads !== 0) throw new Error(reads + ' preflight reads from ticks/draws');
});

}

main().then(
    () => { if (!failed) console.log('PASS: test_preflight_notice.mjs'); process.exit(failed); },
    (e) => { bad('unexpected', e); process.exit(1); },
);
