/* S5: the session-fader idle-save case in ui_tick.mjs (:1298-1312) calls the
 * host's host_autosave_kick() instead of engineSaveState() for the ordinary
 * "gesture ended, wait out the quiet gap" case — engineSaveState()
 * (shadow_save_state_now) is a synchronous full sweep of EVERY slot/bus and
 * was the whole autosave-stall this campaign exists to fix. The suspend case
 * (S.pendingSuspendSave) keeps calling engineSaveState(), because suspend
 * needs everything flushed before the device sleeps.
 *
 * This drives the REAL _tickImpl via globalThis.tick() (not a stub of the
 * save logic) with S.clockFollowTicks so time advances deterministically off
 * S.tickCount, and asserts on call COUNTS recorded by the stubs — a positive
 * assertion in both directions, not merely "did not throw".
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
async function step(l, fn) { try { await fn(); ok(l); } catch (e) { bad(l, e); } }

let kickCalls = 0, saveCalls = 0, holdCalls = [];
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => '';
globalThis.shadow_set_params = () => true;
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.shadow_save_state_now = () => { saveCalls++; return 1; };
globalThis.move_midi_external_send = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_autosave_kick = () => { kickCalls++; };
globalThis.host_autosave_hold = (on) => { holdCalls.push(on); };
globalThis.host_write_file = () => true;
for (const fn of ['host_read_file', 'host_file_exists', 'host_ensure_dir', 'host_remove_dir',
                  'host_system_cmd', 'host_module_set_param', 'host_module_get_param',
                  'host_send_midi', 'move_midi_inject_to_move', 'host_set_led', 'set_led',
                  'host_get_setting', 'host_set_setting', 'move_midi_internal_send',
                  'host_edit_cc_block', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_register_primary',
                  'host_open_service', 'host_close_service'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.pixel_print = () => {};
globalThis.text_width = (t) => String(t).length * 6; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.draw_line = () => {}; globalThis.set_pixel = () => {};
globalThis.stipple_rect = () => {}; globalThis.flush_display = () => {};
globalThis.shadow_get_ui_flags = () => 0; globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S, TICK_MS_FOR_TESTS } = await import('../../ui/ui_state.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
S.clockFollowTicks = true;
S.pendingDspSync = 0; S.pendingSetLoad = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }

const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
/* Cross the 500 ms idle gap: TICK_MS_FOR_TESTS * n >= 500 */
const IDLE_TICKS = Math.ceil(500 / TICK_MS_FOR_TESTS) + 2;

/* Prime the clock so S.clockMs exists before we stamp sessVolLastTurn off it. */
S.tickCount = 100; ticks(1);

await step('fader turn + idle => host_autosave_kick() fires, shadow_save_state_now does NOT', () => {
    kickCalls = 0; saveCalls = 0;
    S.sessVolSaveOwed = true;
    S.sessVolPending.fill(false);
    S.sessVolLastTurn = S.clockMs;
    S.pendingSuspendSave = false;
    ticks(IDLE_TICKS);
    if (kickCalls !== 1) throw new Error('expected exactly one host_autosave_kick() call, got ' + kickCalls);
    if (saveCalls !== 0) throw new Error('shadow_save_state_now must NOT be called for the ordinary idle case, got ' + saveCalls + ' calls');
    if (S.sessVolSaveOwed) throw new Error('sessVolSaveOwed was not cleared');
});

await step('a recent turn (not yet idle) defers the save — no kick fires early', () => {
    kickCalls = 0; saveCalls = 0;
    S.sessVolSaveOwed = true;
    S.sessVolPending.fill(false);
    S.sessVolLastTurn = S.clockMs;   /* turn "just happened" */
    ticks(1);                         /* nowhere near SESSVOL_SAVE_IDLE_MS yet */
    if (kickCalls !== 0 || saveCalls !== 0)
        throw new Error('a fresh turn should defer BOTH kick and save, got kick=' + kickCalls + ' save=' + saveCalls);
    /* ...and still owed, so it fires once the idle gap is crossed. */
    ticks(IDLE_TICKS);
    if (kickCalls !== 1) throw new Error('expected the deferred save to kick exactly once, got ' + kickCalls);
    S.sessVolSaveOwed = false;
});

await step('suspend still forces the FULL flush (shadow_save_state_now), not a kick', () => {
    kickCalls = 0; saveCalls = 0;
    S.sessVolSaveOwed = true;
    S.sessVolPending.fill(false);
    S.sessVolLastTurn = S.clockMs;         /* not idle yet */
    S.pendingSuspendSave = true;
    ticks(1);
    if (saveCalls !== 1) throw new Error('suspend must call shadow_save_state_now(), got ' + saveCalls + ' calls');
    if (kickCalls !== 0) throw new Error('suspend must not ALSO kick, got ' + kickCalls);
    S.pendingSuspendSave = false;
});

await step('no save owed => neither kick nor full save fires', () => {
    kickCalls = 0; saveCalls = 0;
    S.sessVolSaveOwed = false;
    S.sessVolPending.fill(false);
    ticks(IDLE_TICKS);
    if (kickCalls !== 0 || saveCalls !== 0)
        throw new Error('nothing owed should call neither, got kick=' + kickCalls + ' save=' + saveCalls);
});

/* Host pin: kick never bypasses hold / preset-preview / set-change
 * suppression. Those gates live host-side (autosaveHold, isPresetPreviewActive,
 * autosaveSuppressUntil) and are checked at the moment the dirty-driven save
 * actually runs, not inside host_autosave_kick() itself — verified by the
 * SOURCE shape of the host binding, since this JS-side rig stubs the host and
 * cannot observe the host's own gating. */
await step('source pin: host_autosave_kick only moves autosaveNotBefore, never touches hold/preview/suppression', () => {
    const fs_mod = 'node:fs';
    return import(fs_mod).then(({ readFileSync }) => {
        const src = readFileSync('../src/shadow/shadow_ui.js', 'utf8');
        const start = src.indexOf('globalThis.host_autosave_kick = function()');
        if (start < 0) throw new Error('host_autosave_kick binding not found');
        const body = src.slice(start, src.indexOf('\n    };', start));
        if (!/autosaveNotBefore\s*=\s*Date\.now\(\)/.test(body))
            throw new Error('host_autosave_kick does not set autosaveNotBefore: ' + body);
        if (/autosaveHold\s*=/.test(body) || /isPresetPreviewActive/.test(body) || /autosaveSuppressUntil\s*=/.test(body))
            throw new Error('host_autosave_kick touches a hold/preview/suppression gate directly — it must only move autosaveNotBefore: ' + body);
    });
});

if (failed) { console.log('FAIL: session-fader idle save uses host_autosave_kick, not a full flush'); process.exit(1); }
console.log('PASS: session-fader idle save kicks the dirty-driven autosave instead of a full flush');
}

main().catch((e) => { console.error('FAIL (uncaught): ' + (e && e.stack ? e.stack : e)); process.exit(1); });
