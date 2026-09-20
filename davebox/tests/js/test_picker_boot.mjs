/* tests/js/test_picker_boot.mjs — drive the project picker's whole surface
 * (boot open, draw, LED paint, menu, color, confirm-new, rename entry) with
 * REAL modules and a realistic projects.json.
 *
 * Why this exists: the picker's entry points are _pppGuard-wrapped and its LED
 * painter runs inside the tick, so an exception here is SILENT on hardware —
 * the guard eats it (three strikes = the NO PROJECT LIST card) or the tick dies
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
/* ⭑ "Current" means CONFIRMED OPEN since 2026-09-16 — the picker no longer
 * falls back to Move's song index, because that index is a guess about which
 * pad Move sits on, not a statement about which project it opened, and it fed
 * the one shortcut that loads without making a request. So a test that expects
 * a current project must say the host CONFIRMED one. */
globalThis.shadow_get_param = (slot, k) => {
    if (k === 'active_set_state') return 'open\n\n5';
    if (k === 'active_set') return 'u1\nColored';
    return '';
};
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
/* ⭐⭐ EVERY project-cmd CALL MUST NAME AN ALLOWED VERB FIRST.
 *
 * host_system_cmd refuses anything whose first word is not one of `sh cp mv
 * mkdir rm ls test chmod tar` (js_host_system_cmd, shadow_ui.c), and prints
 * the refusal to stderr, which nothing collects. Two calls put an environment
 * assignment in front — `DBX_OPEN_UUID=... sh project-cmd ...` — so they were
 * silently REJECTED and never ran. On hardware that was a rename that reported
 * RENAME FAILED, and a delete of the open project that left the device frozen
 * on DELETING / RESTARTING waiting for a teardown nobody had requested.
 *
 * Pinned at the command STRING, because it is the shape of the string that the
 * host judges. A test that only checked "a command was issued" passes while
 * the command is refused — which is exactly how this shipped. */
const ALLOWED_VERBS = ['sh ', 'cp ', 'mv ', 'mkdir ', 'rm ', 'ls ', 'test ', 'chmod ', 'tar '];
function issuedCommands(fn) {
    const real = globalThis.host_system_cmd;
    const seen = [];
    globalThis.host_system_cmd = (c) => { seen.push(String(c)); return 0; };
    try { fn(); } finally { globalThis.host_system_cmd = real; }
    return seen;
}

step('⭐ every command the picker issues starts with a verb the host ALLOWS', () => {
    const p = S.projectPadPicker;
    p.restarting = null; p.deleteIdx = -1; p.copySrcIdx = -1;
    p.menu = null; p.colorPick = null; p.confirmNew = null;
    S.currentSetUuid = '';                 /* the boot picker: nothing loaded */
    const cmds = [];
    /* delete of the project the host says is open -> the env-prefixed call */
    S.deleteHeld = true;
    cmds.push(...issuedCommands(() => {
        dlg.projectPadPickerTap(5);        /* arm  (pad 5 is `current`) */
        dlg.projectPadPickerTap(5);        /* confirm */
    }));
    S.deleteHeld = false;
    if (!cmds.length) throw new Error('precondition: the gesture issued no command at all');
    for (const c of cmds) {
        if (!ALLOWED_VERBS.some((v) => c.startsWith(v)))
            throw new Error('command would be REFUSED by host_system_cmd: ' + c);
    }
});

/* ⭐⭐ THE TWO DECIDERS. project-cmd decides for itself which project is open —
 * on purpose, because one JS-side decider is the shape that caused the loss the
 * identity work exists to fix. At the BOOT PICKER the two halves disagree by
 * construction: dAVEBOx has nothing loaded, Move is still holding the set it
 * had. The script then QUEUES the work and restarts, so nothing has changed on
 * disk when this side looks.
 *
 * It used to guess again from that: a deferred rename reported RENAME FAILED,
 * and a deferred delete reported PROJECT DELETED without re-reading anything.
 * Both wrong in the word, and worse in the tail — the real rename/rm landed
 * silently at the NEXT LAUNCH, which reads as the box acting on its own.
 * (Josh, on hardware 2026-09-20: "just tried renaming project 1 and it gave me
 * rename failed"; delete reproduced the same way.)
 *
 * The queue file is the script's own answer, so these drive the real gesture
 * with a stubbed project-cmd that DEFERS, and assert we follow it. */
function withDeferringScript(fn) {
    const realCmd = globalThis.host_system_cmd;
    const realRead = globalThis.host_read_file;
    let queue = '';
    globalThis.host_system_cmd = (c) => {
        const s = String(c);
        /* the script's deferral: queue the work, change nothing else */
        if (/project-cmd\.sh (rename|delete)/.test(s)) queue += 'mv or rm queued\n';
        return 0;
    };
    globalThis.host_read_file = (f) => {
        const s = String(f);
        if (s.endsWith('relaunch_patch.sh')) return queue;
        return realRead(f);
    };
    try { return fn(); }
    finally { globalThis.host_system_cmd = realCmd; globalThis.host_read_file = realRead; }
}

step('⭐ a DEFERRED delete is not a completed one', () => {
    const p = S.projectPadPicker;
    p.restarting = null; p.menu = null; p.colorPick = null; p.confirmNew = null;
    p.deleteIdx = -1;
    S.deleteHeld = true;
    withDeferringScript(() => {
        dlg.projectPadPickerTap(9);      /* arm on a project that is NOT loaded */
        dlg.projectPadPickerTap(9);      /* confirm -> script defers */
    });
    S.deleteHeld = false;
    if (p.restarting !== 'DELETING')
        throw new Error('a deferred delete did not take the restarting path: ' + JSON.stringify(p.restarting));
});

step('⚠ CONTROL: a delete the script really performed still reads as done', () => {
    const p = S.projectPadPicker;
    p.restarting = null; p.deleteIdx = -1;
    S.deleteHeld = true;
    const realCmd = globalThis.host_system_cmd;
    globalThis.host_system_cmd = () => 0;        /* no queue written = not deferred */
    try {
        dlg.projectPadPickerTap(9);
        dlg.projectPadPickerTap(9);
    } finally { globalThis.host_system_cmd = realCmd; S.deleteHeld = false; }
    if (p.restarting === 'DELETING')
        throw new Error('an immediate delete was reported as deferred — the check cries wolf');
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
