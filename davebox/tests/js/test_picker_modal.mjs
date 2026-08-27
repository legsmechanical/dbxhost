/* tests/js/test_picker_modal.mjs — the SET MANAGER is MODAL (Josh,
 * 2026-08-23): "it should stand apart from the rest of davebox. right now
 * things like menu button and other things trigger stuff on the underlying
 * project."
 *
 * Every failure here is silent on hardware: a leaked button quietly mutates
 * the loaded project behind a screen that is about something else, and a
 * pad tap sounds the underlying instrument through the DSP padmap — the JS
 * gate alone cannot stop that. Drives globalThis.onMidiMessageInternal, the
 * entry point the host calls, with the picker genuinely open.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const PROJECTS = JSON.stringify({ current: 5, projects: [
    { uuid: 'u0', name: 'Alpha', index: 0, color: 1 },
    { uuid: 'u1', name: 'Beta',  index: 5, color: 2 },
]});

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (typeof p === 'string' && p.endsWith('projects.json')) ? PROJECTS : '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const dlg = await import('../../ui/ui_dialogs.mjs');
const dm  = await import('../../ui/ui_drummodel.mjs');

const send = (st, d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([st, d1, d2]));
const cc   = (d1, d2) => send(0xB0, d1, d2);

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

S.ledInitComplete = true;
S.stateLoading = false; S.bootSplashTicks = 0; S.awaitingProjectSelect = false;
S.sessionView = false; S.activeTrack = 2; S.activeBank = 0;
if (!S.bankParams)
    S.bankParams = Array.from({ length: 8 }, () =>
        Array.from({ length: 12 }, () => new Array(8).fill(0)));

step('control: Note/Session flips the view while the picker is CLOSED', () => {
    /* Positive control — proves the probe can see a leak before trusting the
     * negatives below. */
    cc(50, 127); cc(50, 0);
    if (!S.sessionView) throw new Error('probe blind: CC 50 did not flip the view');
    cc(50, 127); cc(50, 0);
    if (S.sessionView) throw new Error('probe blind: CC 50 did not flip back');
});

step('picker opens; DSP pad dispatch mutes (pads stop sounding the instrument)', () => {
    if (dm._padDispatchMutedNow()) throw new Error('control: pads muted before open');
    dlg.openProjectPadPicker();
    if (!S.projectPadPicker) throw new Error('picker did not open');
    if (!dm._padDispatchMutedNow()) throw new Error('padmap not muted with the picker open');
});

step('⭑ Note/Session is swallowed while the picker is open', () => {
    cc(50, 127); cc(50, 0);
    if (S.sessionView) throw new Error('the view flipped under the picker');
});

step('⭑ jog drives the PICKER, not the bank walk', () => {
    const b0 = S.activeBank;
    cc(14, 1);
    if (S.activeBank !== b0) throw new Error('jog turn changed the bank underneath: ' + S.activeBank);
    if (!S.projectPadPicker) throw new Error('picker vanished on a jog turn');
});

step('⭑ Shift+jog does NOT switch the track underneath', () => {
    cc(49, 127);
    const t0 = S.activeTrack;
    cc(14, 1);
    cc(49, 0);
    if (S.activeTrack !== t0) throw new Error('Shift+jog switched the track: ' + S.activeTrack);
    if (S.shiftHeld) throw new Error('shift state stale after release');
});

step('⭑ a pad tap is a PROJECT tap (and never a note)', () => {
    send(0x90, 68 + 5, 100); send(0x80, 68 + 5, 0);   /* pad 5 = Beta */
    const p = S.projectPadPicker;
    if (!p) throw new Error('picker gone after a pad tap');
    if (p.touchedIdx !== 5 && !p.menu) throw new Error('tap did not reach the picker');
});

step('Back still closes the picker (its own control keeps working)', () => {
    /* Peel any overlay the tap opened, then close from the grid. */
    for (let g = 0; g < 6 && S.projectPadPicker; g++) { cc(51, 127); cc(51, 0); }
    if (S.projectPadPicker) throw new Error('Back never closed the picker');
    if (dm._padDispatchMutedNow()) throw new Error('pads still muted after close');
});

step('...and the swallowed controls work again after close', () => {
    cc(50, 127); cc(50, 0);
    if (!S.sessionView) throw new Error('CC 50 dead after the picker closed');
    cc(50, 127); cc(50, 0);
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
