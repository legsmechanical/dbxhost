/* tests/js/test_low_battery.mjs — the LOW BATTERY card (Josh, 2026-10-29: "on
 * low battery can we pop up a low battery pop-up over anywhere in davebox
 * every 5 minutes that requires a "click to dismiss" ? (make sure the click
 * doesn't fall through to screens below it)"; wording A).
 *
 * Through the real hook, tick, input and draw, over Project Settings (where a
 * click edits a row and the jog moves the cursor — both visible if anything
 * falls through): Move's low flag raises the card; the jog and the click and
 * its release reach nothing below; a release still passes; it comes back 5
 * minutes after a dismiss, not before; the charger takes it down. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => ''; globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_params = () => ''; globalThis.shadow_set_params = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {}; globalThis.host_autosave_hold = () => {};
/* The card's lines go through the host's print; collect them. */
let printed = [];
globalThis.print = (x, y, t) => { printed.push(String(t)); };

async function main() {
await import('../../ui/ui.js');
const { S, nowMs } = await import('../../ui/ui_state.mjs');
const menu = await import('../../ui/ui_menu.mjs');
const R = await import('../../ui/ui_render.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { MoveMainButton, MoveMainKnob } = await import('../../ui/ui_constants.mjs');
const { LOW_BATTERY_EVERY_MS } = await import('../../ui/ui_battery.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.currentSetUuid = 'low-uuid';
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.clockFollowTicks = true;   /* nowMs() follows the tick count */
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
/* by the UI's own clock: the tick advances the count too */
const ticksForMs = (ms) => { const end = nowMs() + ms; while (nowMs() < end) ticks(1); };
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const click = () => { midi(0xB0, MoveMainButton, 127); midi(0xB0, MoveMainButton, 0); };
const jog = (d) => midi(0xB0, MoveMainKnob, d > 0 ? 1 : 127);
const screen = () => { printed = []; R.drawUI(); return printed; };
const cardUp = () => screen().indexOf('LOW BATTERY') >= 0;

menu.openGlobalMenu();
ticks(2);

step('positive control: in Project Settings the jog moves the cursor and a click edits', () => {
    const at = S.globalMenuState.selectedIndex;
    jog(1); ticks(1);
    assert(S.globalMenuState.selectedIndex !== at, 'the jog did not move the cursor');
    jog(-1); ticks(1);
    click(); ticks(1);
    assert(S.globalMenuState.editing, 'a click did not edit');
    click(); ticks(1);
    assert(!S.globalMenuState.editing, 'a second click did not leave the edit');
});

step('a report on battery, not low: no card', () => {
    globalThis.onPowerReport(0x00, 12); ticks(2);
    assert(!cardUp(), 'card at 12% without the low flag');
});

step('Move flags it low (0x40, 6%): the card is up, "6% left"', () => {
    globalThis.onPowerReport(0x40, 6); ticks(2);
    const t = screen();
    assert(t.indexOf('LOW BATTERY') >= 0 && t.indexOf('6% left') >= 0 && t.indexOf('Click to dismiss') >= 0,
        'card text: ' + JSON.stringify(t.slice(-4)));
});

step('while it is up, the jog reaches nothing below', () => {
    const at = S.globalMenuState.selectedIndex;
    jog(1); jog(1); ticks(1);
    assert(S.globalMenuState.selectedIndex === at, 'the menu cursor moved under the card');
    assert(cardUp(), 'the jog took the card down');
});

step('a click dismisses it, and neither the click nor its release edits the row below', () => {
    midi(0xB0, MoveMainButton, 127); ticks(1);
    assert(!cardUp(), 'the click did not dismiss it');
    assert(!S.globalMenuState.editing, 'the click fell through and started an edit');
    midi(0xB0, MoveMainButton, 0); ticks(1);
    assert(!S.globalMenuState.editing, 'the release fell through');
    click(); ticks(1);
    assert(S.globalMenuState.editing, 'the NEXT click no longer reaches the menu');
    click(); ticks(1);
});

step('it stays down for 5 minutes, then comes back while still low', () => {
    ticksForMs(LOW_BATTERY_EVERY_MS - 2000);
    assert(!cardUp(), 'back before 5 minutes');
    ticksForMs(3000);
    assert(cardUp(), 'not back after 5 minutes');
});

step('the charger takes it down', () => {
    globalThis.onPowerReport(0x61, 7); ticks(2);
    assert(!cardUp(), 'still up on the charger');
});

process.exit(failed);
}
main();
