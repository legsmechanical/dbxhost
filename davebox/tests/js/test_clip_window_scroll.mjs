import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_clip_window_scroll.mjs — Shift + TOP track button scrolls the
 * clip window up one row, Shift + BOTTOM scrolls it down, in TRACK view (Josh,
 * 2026-09-24). The window is shared by every track, so a track switch keeps it.
 *
 * Driven through onMidiMessageInternal + the real tick. CONTROL first: a plain
 * track-button press still launches its clip, so the Shift branch is what the
 * positives below measure — and Shift + a scroll press must launch NOTHING.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
globalThis.shadow_save_state_now = () => 1;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { _switchActiveTrack } = await import('../../ui/ui_editops.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.tickCount = 500; S.pendingDspSync = 0; S.pendingSetLoad = false; S.currentSetUuid = 'scroll-uuid';

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const shift = (on) => cc(49, on ? 127 : 0);
const TOP = 43, BOTTOM = 40;
const press = (b) => { cc(b, 127); cc(b, 0); };
const launches = () => sets.filter(([k]) => /_launch_clip$/.test(k));
ticks(3);

step('CONTROL: a plain press of the TOP track button launches its clip (row sceneRow)', () => {
    S.sceneRow = 4; sets.length = 0;
    press(TOP); ticks(2);
    assert(launches().length === 1 && launches()[0][1] === '4', 'no launch of clip 4: ' + JSON.stringify(launches()));
    assert(S.sceneRow === 4, 'a plain press moved the window');
});
step('⭐ Shift + BOTTOM scrolls the window DOWN one row, and launches nothing', () => {
    S.sceneRow = 4; sets.length = 0;
    shift(true); press(BOTTOM); shift(false); ticks(2);
    assert(S.sceneRow === 5, 'sceneRow ' + S.sceneRow + ', wanted 5');
    assert(launches().length === 0, 'Shift + scroll launched: ' + JSON.stringify(launches()));
});
step('⭐ Shift + TOP scrolls it UP one row', () => {
    shift(true); press(TOP); press(TOP); shift(false); ticks(2);
    assert(S.sceneRow === 3, 'sceneRow ' + S.sceneRow + ', wanted 3');
    assert(launches().length === 0, 'Shift + scroll launched');
});
step('clamped at both ends', () => {
    S.sceneRow = 0;
    shift(true); press(TOP); shift(false);
    assert(S.sceneRow === 0, 'scrolled above row 0: ' + S.sceneRow);
    S.sceneRow = 12;
    shift(true); press(BOTTOM); shift(false);
    assert(S.sceneRow === 12, 'scrolled past the last window: ' + S.sceneRow);
});
step('the window is shared: a track switch keeps it', () => {
    S.sceneRow = 7;
    _switchActiveTrack(5); ticks(3);
    assert(S.activeTrack === 5, 'rig: the switch did not happen');
    assert(S.sceneRow === 7, 'a track switch moved the window to ' + S.sceneRow);
    _switchActiveTrack(2); ticks(3);
});
step('the MIDDLE track buttons keep their meaning under Shift (only top/bottom scroll)', () => {
    S.sceneRow = 4; sets.length = 0;
    shift(true); press(41); shift(false); ticks(2);
    assert(S.sceneRow === 4, 'a middle button scrolled');
});

process.exit(failed);
}
main();
