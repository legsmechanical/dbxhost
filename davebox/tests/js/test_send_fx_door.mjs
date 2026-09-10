
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub */
/* tests/js/test_send_fx_door.mjs — SHIFT+CLICK A SEND OPENS ITS FX MENU, AND
 * BACK COMES HOME (Josh, 2026-09-10: "shift+click on send a/b should land you
 * on the corresponding send fx menu. from there, back should take you back to
 * the track's sound menu").
 *
 * ⚠⚠ WHY THIS FILE EXISTS AT ALL. A bus screen HAD two doors once, the code
 * worked out which one from `S.slot`, and slot 0 is a VALID slot — so Back from
 * a Master FX effect landed on track 1's sound page. leaveBus's own comment
 * records it. Adding the second door back is therefore the exact change that
 * broke it before, so BOTH doors are driven here, by the real gesture, and the
 * SESSION door is the control: if it ever lands on a track page again, this
 * fails.
 *
 * Every step drives onMidiMessageInternal + the real tick and asserts what is
 * on screen, never that a function was called ([[wired-is-not-reachable]]).
 */

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}

const ENGINE = {
    'synth:module': 'nusaw',
    'slot:volume': '1.000', 'slot:pan': '0.500',
    'slot:send_a': '0.250', 'slot:send_b': '0.100',
    'slot:muted': '0', 'slot:soloed': '0',
};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => (ENGINE[key] != null ? ENGINE[key] : '');
globalThis.shadow_set_param = (slot, key, v) => { ENGINE[key] = String(v); return 1; };
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
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.tickCount = 500; S.pendingDspSync = 0; S.pendingSetLoad = false; S.currentSetUuid = 'door-uuid';

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const jog   = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const shift = (on) => cc(49, on ? 127 : 0);
const rows  = () => snd.soundPickStateForTest();
const view  = () => snd.soundViewForTest();
const VIEW_BLOCKS = 0, VIEW_BUSES = 9;

/* Walk the cursor onto the row whose label matches, and say so if it is absent
 * — "the gesture did nothing" and "the row was never there" are different
 * failures and must not read the same. */
function cursorTo(label) {
    const st = rows();
    const i = st.labels.indexOf(label);
    if (i < 0) throw new Error('no "' + label + '" row: ' + JSON.stringify(st.labels));
    for (let g = 0; g < 24 && rows().row !== i; g++) jog(rows().row > i ? -1 : 1);
    if (rows().row !== i) throw new Error('cursor would not land on ' + label);
    return i;
}

step('setup: a Schwung track\'s sound menu lists Send A and Send B', () => {
    snd.soundEnter(2, 2); ticks(4);
    snd.soundShowMenu(); ticks(3);
    if (view() !== VIEW_BLOCKS) throw new Error('not on the menu, view ' + view());
    const labels = rows().labels;
    if (labels.indexOf('Send A') < 0 || labels.indexOf('Send B') < 0)
        throw new Error('no send rows: ' + JSON.stringify(labels));
});

step('⭐ CONTROL FIRST: a PLAIN click on Send A still edits the level — the new gesture spends nothing', () => {
    cursorTo('Send A');
    click(); ticks(2);
    if (view() !== VIEW_BLOCKS) throw new Error('a plain click left the menu, view ' + view());
    if (!snd.soundBusLevelEditingForTest()) throw new Error('a plain click did not open the level edit');
    click(); ticks(2);                                  /* close the edit again */
});

step('⭐⭐ SHIFT+click Send A lands on SEND FX A', () => {
    cursorTo('Send A');
    shift(true); click(); shift(false); ticks(4);
    const bus = snd.soundBusForTest();
    if (!bus) throw new Error('no bus screen opened, view ' + view());
    if (bus.id !== 'sendA') throw new Error('landed on ' + bus.id + ', wanted sendA');
    if (view() !== VIEW_BLOCKS) throw new Error('bus screen should be the block list, view ' + view());
});

step('⭐⭐ BACK from there returns to the TRACK\'s sound menu — not the session FX list', () => {
    back(); ticks(4);
    if (snd.soundBusForTest()) throw new Error('still on a bus');
    if (view() === VIEW_BUSES) throw new Error('⭑ Back went to the SESSION FX list — the door was not honoured');
    if (view() !== VIEW_BLOCKS) throw new Error('view ' + view() + ', wanted the track menu');
    const labels = rows().labels;
    if (labels.indexOf('Send A') < 0) throw new Error('not the track menu: ' + JSON.stringify(labels));
    if (labels[rows().row] !== 'Send A')
        throw new Error('cursor came back on "' + labels[rows().row] + '", wanted the row we left from');
});

step('⭐⭐ Send B goes to SEND FX B, and comes home too', () => {
    cursorTo('Send B');
    shift(true); click(); shift(false); ticks(4);
    const bus = snd.soundBusForTest();
    if (!bus || bus.id !== 'sendB') throw new Error('landed on ' + (bus && bus.id) + ', wanted sendB');
    back(); ticks(4);
    if (snd.soundBusForTest()) throw new Error('still on a bus');
    if (rows().labels[rows().row] !== 'Send B') throw new Error('cursor did not come back to Send B');
});

step('⚠⚠ THE OLD REGRESSION: a bus opened from the SESSION list still goes BACK to the session list', () => {
    /* This is the failure leaveBus's comment records — two doors, the code
     * inferring which from `S.slot`, and slot 0 being valid. If the session
     * door ever lands on a track page again, it fails HERE. */
    snd.soundExit(); ticks(2);
    /* ⚠ The session FX list belongs to SESSION view — sound mode stands it down
     * on a track view and the rig's own tick exits it, which reads as "no bus
     * opened" rather than as the setup being wrong. */
    S.sessionView = true;
    snd.soundEnterBuses(); ticks(3);
    if (view() !== VIEW_BUSES) throw new Error('rig: not on the session FX list, view ' + view());
    click(); ticks(4);                                  /* open MASTER FX */
    const bus = snd.soundBusForTest();
    if (!bus) throw new Error('rig: no bus opened from the session list');
    back(); ticks(4);
    if (snd.soundBusForTest()) throw new Error('still on a bus');
    if (view() !== VIEW_BUSES)
        throw new Error('⭑⭑ Back from a SESSION-opened bus went to view ' + view()
            + ' — this is the 2026 regression, returning');
    S.sessionView = false;
});

process.exit(failed);
}
main();
