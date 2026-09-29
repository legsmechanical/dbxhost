import './_bulk_get_stub.mjs';
/* tests/js/test_move_settings_corun.mjs — MOVE'S OWN SETTINGS, from Project
 * Settings, in co-run.
 *
 * Josh, 2026-09-28: "Need a co-run path into move's settings menu that can be
 * accessed from the global menu. need to have those settings be separate from
 * the main move install. shift+step 2 opens that settings menu in move native.
 * only needs back, jog turn and jog click for navigation."
 *
 * Performs the real gesture — Shift+Step 2 opens Project Settings, the jog
 * walks to "Move Settings...", a click opens it — and asserts what reaches the
 * host: the move_native service with a mask that cedes only the jog and Back,
 * Move's own Shift+Step 2 injected as ONE Shift pair with the hardware gaps,
 * and nothing from the track co-run's pad injection. Then every way out:
 * Back at the top of Move's menu (the host drops move_ui_mode SETTINGS),
 * Shift+Step 2 (Move's own close, sent only while its menu is up), and
 * Note/Session (to the overview). And the one retry when Move never
 * announces the menu.
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

let opened = [], closes = 0, onReturn = null, injected = [], uiMode = 0, shiftHeld = 0;
globalThis.host_register_primary = (o) => { onReturn = o.onServiceReturn; return true; };
globalThis.host_open_service = (id, opts) => { opened.push({ id, opts }); return true; };
globalThis.host_close_service = () => { closes++; return true; };
globalThis.shadow_get_move_ui_mode = () => uiMode;
globalThis.shadow_get_shift_held = () => shiftHeld;
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.host_module_set_params = () => true;
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {}; globalThis.draw_line = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true; globalThis.move_midi_external_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* shadow_constants.h CORUN_GRP_* (pinned against the header by test_corun_mask). */
const GRP = { PADS: 1 << 1, STEPS: 1 << 2, JOG: 1 << 4, TRACK: 1 << 5, KNOBS: 1 << 6,
    SHIFT: 1 << 8, BACK: 1 << 9, MENU: 1 << 10, TOUCH: 1 << 11, MUTE: 1 << 12,
    PLAY: 1 << 13, REC: 1 << 14, KEEP_BACK: 1 << 15, SAMPLE: 1 << 16, LOOP: 1 << 17,
    DELETE: 1 << 19 };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S, nowMs } = await import('../../ui/ui_state.mjs');
const corun = await import('../../ui/ui_corun.mjs');
corun.initPrimarySurface();
globalThis.move_midi_inject_to_move = (b) => { injected.push({ at: nowMs(), pkt: Array.from(b) }); };

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
/* init() builds this on the device; the LED repaint on the way out reads it. */
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const click = () => { cc(3, 127); cc(3, 0); };
const jog = (d) => cc(14, d > 0 ? 1 : 127);
const shiftStep2 = () => { cc(49, 127); shiftHeld = 1; note(17, 127); note(17, 0); cc(49, 0); shiftHeld = 0; };
const noteSession = () => { cc(50, 127); cc(50, 0); };
const selected = () => S.globalMenuItems && S.globalMenuState ? (S.globalMenuItems[S.globalMenuState.selectedIndex] || {}).label : null;
const ms = (n) => ticks(Math.ceil(n / 10.6) + 1);

/* Menu -> the row -> click: the gesture Josh does. */
function openMoveSettings() {
    shiftStep2(); ticks(2);
    assert(S.globalMenuOpen, 'Shift+Step 2 did not open Project Settings');
    for (let g = 0; g < 80 && selected() !== 'Move Settings...'; g++) { jog(1); ticks(1); }
    assert(selected() === 'Move Settings...', 'no "Move Settings..." row in Project Settings; last row: ' + selected());
    opened = []; injected = [];
    click(); ticks(1);
}
/* What the shim does when Move's service is popped. */
function serviceReturned() { onReturn('move_native', null); ticks(3); }

step('⭐ Shift+Step 2 → jog to "Move Settings..." → click opens Move in co-run', () => {
    openMoveSettings();
    assert(opened.length === 1 && opened[0].id === 'move_native', 'opened: ' + JSON.stringify(opened));
    assert(S.moveSettingsOpen && !S.globalMenuOpen, 'not in Move settings: open=' + S.moveSettingsOpen + ' menu=' + S.globalMenuOpen);
    assert(S.moveCoRunTrack === -1, 'the TRACK co-run is on (' + S.moveCoRunTrack + ') — its pad injections would fire');
});

step('the mask cedes only the jog and Back; the session keeps everything else', () => {
    const m = opened[0].opts.keep_mask;
    for (const g of ['PADS', 'STEPS', 'MENU', 'SHIFT', 'TRACK', 'KNOBS', 'TOUCH', 'MUTE',
                     'PLAY', 'REC', 'SAMPLE', 'LOOP', 'DELETE', 'KEEP_BACK'])
        assert(m & GRP[g], 'does not keep ' + g);
    for (const g of ['JOG', 'BACK']) assert(!(m & GRP[g]), 'keeps ' + g + ' — Move cannot navigate');
    assert(opened[0].opts.led_keep_mask === (m | GRP.TRACK), 'LED mask drifted');
});

step('⭐ Move is sent its own Shift+Step 2: ONE Shift pair, with the hardware gaps', () => {
    ms(1000);
    const p = injected.map(x => x.pkt);
    assert(p.length === 4, 'injected ' + JSON.stringify(p));
    assert(p[0].join() === '11,176,49,127', 'Shift down first: ' + p[0]);
    assert(p[1][0] === 0x09 && p[1][1] === 0x90 && p[1][2] === 17 && p[1][3] > 0, 'Step 2 down: ' + p[1]);
    assert(p[2][0] === 0x08 && p[2][1] === 0x80 && p[2][2] === 17, 'Step 2 up: ' + p[2]);
    assert(p[3].join() === '11,176,49,0', 'Shift up last: ' + p[3]);
    const t = injected.map(x => x.at);
    assert(t[1] - t[0] >= 250 && t[2] - t[1] >= 120 && t[3] - t[2] >= 100,
           'gaps too short: ' + [t[1] - t[0], t[2] - t[1], t[3] - t[2]].join(', ') + ' ms');
});

step('while it is up, a pad press injects nothing to Move (the session plays on)', () => {
    uiMode = 4; ticks(2);                                  /* Move announced a Settings row */
    assert(S.moveSettingsSeen, 'the Settings announcement was not seen');
    injected = [];
    note(68, 100); note(68, 0); ticks(2);
    assert(injected.length === 0, 'a pad press reached Move: ' + JSON.stringify(injected));
});

step('⭐ Back at the top of Move\'s menu: Move leaves, and so do we — back to Project Settings on the row', () => {
    closes = 0; injected = [];
    uiMode = 0; ticks(2);                                  /* Move announced "Set 29" */
    assert(closes === 1, 'service not closed: ' + closes);
    assert(injected.length === 0, 'a close was sent to a menu Move already left (it would REOPEN it): ' + JSON.stringify(injected));
    serviceReturned();
    assert(!S.moveSettingsOpen, 'still marked open');
    assert(S.globalMenuOpen && selected() === 'Move Settings...', 'not back on the row: menu=' + S.globalMenuOpen + ' row=' + selected());
});

step('⭐ Shift+Step 2 closes it: Move\'s own close is sent, then back to Project Settings', () => {
    S.globalMenuOpen = false;
    openMoveSettings(); ms(1000); uiMode = 4; ticks(2);
    closes = 0; injected = [];
    shiftStep2(); ticks(1);
    assert(closes === 1, 'service not closed: ' + closes);
    assert(!S.globalMenuOpen, 'Project Settings opened on top of Move instead of closing it');
    ms(1000);
    const p = injected.map(x => x.pkt.join());
    assert(p.length === 4 && p[0] === '11,176,49,127' && p[3] === '11,176,49,0', 'Move\'s close not sent: ' + JSON.stringify(p));
    uiMode = 0;
    serviceReturned();
    assert(S.globalMenuOpen && selected() === 'Move Settings...', 'not back on the row');
});

step('Note/Session leaves for the overview', () => {
    S.globalMenuOpen = false;
    openMoveSettings(); ms(1000); uiMode = 4; ticks(2);
    closes = 0;
    noteSession(); ticks(1);
    assert(closes === 1, 'service not closed');
    uiMode = 0;
    serviceReturned();
    assert(!S.moveSettingsOpen && !S.globalMenuOpen, 'menu=' + S.globalMenuOpen);
});

step('Move never announces the menu: the open is tried ONCE more, then left alone', () => {
    uiMode = 0;
    openMoveSettings(); ms(1000);
    const first = injected.length;
    assert(first === 4, 'first open: ' + first);
    ms(2500);
    assert(injected.length === 8, 'no retry after 2 s: ' + injected.length);
    ms(5000);
    assert(injected.length === 8, 'retried more than once: ' + injected.length);
    noteSession(); ticks(1); serviceReturned();
});

step('control: the entry needs a chosen project', () => {
    S.awaitingProjectSelect = true; opened = [];
    corun.enterMoveSettingsCoRun();
    assert(opened.length === 0 && !S.moveSettingsOpen, 'opened before a project was chosen');
    S.awaitingProjectSelect = false;
});

if (failed) { console.error('FAIL: test_move_settings_corun'); process.exit(1); }
console.log('PASS: test_move_settings_corun');
}
main().catch((e) => { console.error(e); process.exit(1); });
