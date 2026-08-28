/* tests/js/test_picker_boot.mjs — drive the project picker's whole surface
 * (boot open, draw, LED paint, menu, color, confirm-new, rename entry) with
 * REAL modules and a realistic projects.json.
 *
 * Why this exists: the picker's entry points are _pppGuard-wrapped and its LED
 * painter runs inside the tick, so an exception here is SILENT on hardware —
 * the guard eats it (three strikes = fail-open auto-load) or the tick dies
 * every frame (LOADING pinned, pads dark). Both happened on 2026-08-12: a
 * project whose `color` was null crashed `projectColorLED` because
 * `null >= 0` is TRUE in JS, so `PROJECT_COLORS[null].led` threw — and the
 * shell-grep pins could not see it. This test evals the real code paths.
 *
 * DISCIPLINE: the fixture MUST keep a null-color project, a colored one, and
 * an out-of-range color — those are the three shapes `list` can emit. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const PROJECTS = JSON.stringify({ current: 5, projects: [
    { uuid: 'u0', name: 'No Color',     index: 0, color: null },   // the crash shape
    { uuid: 'u1', name: 'Colored',      index: 5, color: 2 },
    { uuid: 'u2', name: 'Out Of Range', index: 9, color: 99 },     // future palette shrink
]});

/* Host + draw globals BEFORE the dynamic imports below — module bodies run at
 * import time and the picker calls these from its entry points. */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (typeof p === 'string' && p.endsWith('projects.json')) ? PROJECTS : '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};

/* Dynamic imports inside an async main: the runner bundles to CJS, where
 * top-level await is unavailable — and the globals above must be installed
 * before any ui module body runs. */
async function main() {
const dlg = await import('../../ui/ui_dialogs.mjs');
const { S } = await import('../../ui/ui_state.mjs');
const leds = await import('../../ui/ui_leds.mjs');

S.awaitingProjectSelect = true;
S.ledInitComplete = true;

function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

step('boot open populates the picker', () => {
    dlg.openProjectPadPicker();
    if (!S.projectPadPicker) throw new Error('picker did not open');
});
step('grid draw survives all color shapes', () => dlg.drawProjectPadPicker());
step('LED paint survives all color shapes (the 2026-08-12 wedge)', () => {
    leds.updateSessionLEDs();
});
step('tap occupied pad opens the menu', () => {
    dlg.projectPadPickerTap(0);                 // the NULL-color project
    if (!S.projectPadPicker.menu) throw new Error('no menu');
});
step('menu draw + LED paint with menu open', () => {
    dlg.drawProjectPadPicker(); leds.updateSessionLEDs();
});
step('Color on a null-color project opens at palette 0', () => {
    dlg.projectPadPickerRotate(1); dlg.projectPadPickerRotate(1);   // -> Color
    dlg.projectPadPickerClick();
    const cp = S.projectPadPicker.colorPick;
    if (!cp || cp.sel !== 0) throw new Error('colorPick=' + JSON.stringify(cp));
});
step('color draw + live LED preview', () => {
    dlg.drawProjectPadPicker(); leds.updateSessionLEDs();
    dlg.projectPadPickerRotate(1);
    dlg.drawProjectPadPicker(); leds.updateSessionLEDs();
});
step('color commit refreshes and closes the sub-picker', () => {
    dlg.projectPadPickerClick();
    if (S.projectPadPicker.colorPick) throw new Error('colorPick still open');
});
step('out-of-range color clamps to default everywhere', () => {
    dlg.projectPadPickerTap(9);
    dlg.projectPadPickerRotate(1); dlg.projectPadPickerRotate(1);
    dlg.projectPadPickerClick();
    const cp = S.projectPadPicker.colorPick;
    if (!cp || cp.sel !== 0) throw new Error('colorPick=' + JSON.stringify(cp));
    dlg.drawProjectPadPicker(); leds.updateSessionLEDs();
    dlg.projectPadPickerClick();
});
step('empty pad tap opens the create confirm', () => {
    dlg.projectPadPickerTap(3);
    if (!S.projectPadPicker.confirmNew) throw new Error('no confirmNew');
    dlg.drawProjectPadPicker(); leds.updateSessionLEDs();
});
step('jog click with no overlay opens the menu on current', () => {
    S.projectPadPicker.confirmNew = null;
    dlg.projectPadPickerClick();
    const m = S.projectPadPicker.menu;
    if (!m || m.k !== 5) throw new Error('menu=' + JSON.stringify(m));
});
step('Rename opens the shared keyboard and its draw takes over', () => {
    dlg.projectPadPickerRotate(1);              // -> Rename
    dlg.projectPadPickerClick();
    if (!S.projectPadPicker.renameActive) throw new Error('rename not active');
    dlg.drawProjectPadPicker();
    leds.updateSessionLEDs();                   // painter must yield, not crash
});
step('restarting locks EVERY picker entry point (the teardown race)', () => {
    /* Rename-of-current sets p.restarting and then Move dies ~1-2 s later;
     * any gesture accepted in that window races the teardown — on hardware
     * a recolor + Load fired in the gap and wedged the session. */
    const p = S.projectPadPicker;
    /* Mirror _pppDoRename's arming: overlays closed, then the lock. */
    p.renameActive = false;
    p.menu = null; p.colorPick = null; p.confirmNew = null;
    p.restarting = true;
    dlg.projectPadPickerTap(0);
    if (p.menu || p.confirmNew) throw new Error('tap acted while restarting');
    dlg.projectPadPickerClick();
    if (p.menu || p.colorPick) throw new Error('click acted while restarting');
    dlg.projectPadPickerRotate(1);
    const swallowed = dlg.projectPadPickerBack();
    if (swallowed !== true) throw new Error('Back not swallowed while restarting');
    if (!S.projectPadPicker) throw new Error('picker closed while restarting');
    dlg.drawProjectPadPicker();                  // the RENAMING screen
    leds.updateSessionLEDs();
});

}

main().then(
    () => process.exit(failed),
    (e) => { bad('unexpected', e); process.exit(1); },
);
