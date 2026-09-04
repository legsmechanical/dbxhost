/* tests/js/test_confirm_exit.mjs — CONFIRM BEFORE EXIT (Josh, 2026-09-05: "add
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

step('setup: a booted session in track view', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeTrack = 0;
    reset();
});
step('hold-Back raises the SUSPEND confirm and does not suspend', () => {
    holdBack();
    if (S.confirmExit !== 'suspend') throw new Error('confirmExit=' + S.confirmExit);
    if (armed()) throw new Error('the hold suspended without asking');
    if (S.confirmExitSel !== 1) throw new Error('the modal must open on No');
});
step('Back on the modal is No — nothing armed, modal gone', () => {
    cc(MoveBack, 127); cc(MoveBack, 0); ticks(1);
    if (S.confirmExit) throw new Error('modal still up');
    if (armed()) throw new Error('Back armed an exit');
});
step('CONTROL: without the modal, the hold used to suspend directly — it must not now', () => {
    reset(); holdBack(); ticks(2);
    if (armed()) throw new Error('suspend fired past the confirm');
});
step('jog-click on No dismisses; jog turn flips to Yes; click on Yes SUSPENDS', () => {
    reset(); holdBack();
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (S.confirmExit || armed()) throw new Error('No did not just dismiss');
    holdBack();
    cc(JOG_TURN, 1);                       /* one detent: No → Yes */
    if (S.confirmExitSel !== 0) throw new Error('turn did not move to Yes');
    cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (S.confirmExit) throw new Error('modal still up after Yes');
    if (!S.pendingSuspendManaged) throw new Error('Yes did not suspend');
    if (S.pendingExitAfterSave) throw new Error('suspend must not QUIT');
});
step("the menu's Suspend session asks first", () => {
    reset();
    menuAction('Suspend session');
    if (S.confirmExit !== 'suspend') throw new Error('confirmExit=' + S.confirmExit);
    if (S.globalMenuOpen) throw new Error('the menu should close under the modal');
    if (armed()) throw new Error('menu Suspend fired without asking');
});
step("the menu's Quit asks first, and Yes QUITS (not suspends)", () => {
    reset();
    menuAction('Quit');
    if (S.confirmExit !== 'quit') throw new Error('confirmExit=' + S.confirmExit);
    if (armed()) throw new Error('menu Quit fired without asking');
    cc(JOG_TURN, 1); cc(JOG_CLICK, 127); cc(JOG_CLICK, 0);
    if (!S.pendingExitAfterSave) throw new Error('Yes did not quit');
    if (S.pendingSuspendManaged) throw new Error('quit must not SUSPEND');
});
step("the host's Shift+Back (onSessionExitRequest) is TAKEN and asks first", () => {
    reset();
    const taken = globalThis.onSessionExitRequest();
    if (taken !== true) throw new Error('must return true so the host does not tear down');
    if (S.confirmExit !== 'quit') throw new Error('confirmExit=' + S.confirmExit);
    if (armed()) throw new Error('Shift+Back exited without asking');
});
step('a second request while the modal is up changes nothing', () => {
    reset(); holdBack();
    cc(JOG_TURN, 1);                       /* on Yes */
    globalThis.onSessionExitRequest();      /* a quit request over a suspend modal */
    if (S.confirmExit !== 'suspend' || S.confirmExitSel !== 0)
        throw new Error('the second request rewrote the modal');
});
step('knobs and Note/Session are declined under the modal (source pins)', () => {
    const src = readFileSync('ui/ui_input_cc.mjs', 'utf8');
    if (!/S\.confirmStateWipe \|\| S\.confirmExit \|\| S\.bpmMoveInfo\) return;/.test(src))
        throw new Error('knob guard does not list confirmExit');
    if (!/S\.confirmStateWipe \|\| S\.confirmExit \|\| \(S\.projectPadPicker/.test(src))
        throw new Error('Note/Session decline does not list confirmExit');
});

process.exit(failed);
}
main();
