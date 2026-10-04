import './_bulk_get_stub.mjs';
import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_delete_click_menu.mjs — Delete + click in the TRACK MENU does
 * nothing (Josh, 2026-10-01: *"if you delete+click anywhere in the track menu it
 * falls down to the bank and resets it."*).
 *
 * The menu is a list: its click means "open this row", which Delete does not
 * mean. Sound mode reset the level knobs there (its reset is the BANK's), or —
 * opened from a bank whose knobs are not levels — declined the click and let
 * dAVEBOx's own Delete+jog reset the bank underneath. Now it is consumed. The
 * bank's own card keeps Delete + click = reset (control). Real gestures:
 * Shift + Note/Session opens the menu, Delete is held, the jog clicks. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
function assert(c, m) { if (!c) throw new Error(m); }
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};


async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { BANK_SOUND, BANK_CONFIG } = await import('../../ui/ui_constants.mjs');
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => new Array(8).fill(0)));
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const SHIFT = 49, NS = 50, DEL = 119, BACK = 51;
const resets = () => sets.concat(S.pendingDefaultSetParams.map(p => [p.key, p.val]))
    .filter(s => /reset|_clear|_def/.test(String(s[0])));
const popup = () => (S.actionPopupLines || []).join(' / ');
function leave() { for (let i = 0; i < 4; i++) { cc(BACK, 127); cc(BACK, 0); ticks(2); } }
function openMenu(track, drum, bank) {
    leave();
    S.activeTrack = track; S.trackPadMode[track] = drum ? 1 : 0;
    S.activeBank = bank; S.trackActiveBank[track] = bank;
    openTrackConfigViaMap(); ticks(3);
    assert(snd.soundOpen(), 'rig: the track menu did not open');
}
function deleteClickEveryRow(label) {
    for (let row = 0; row < 8; row++) {
        sets.length = 0; S.pendingDefaultSetParams.length = 0; S.actionPopupLines = [];
        cc(DEL, 127); cc(3, 127); cc(3, 0); cc(DEL, 0); ticks(2);
        assert(popup() === '' && resets().length === 0,
               label + ', row ' + row + ': Delete + click did something: ' + popup() + ' ' + JSON.stringify(resets()));
        assert(snd.soundOpen(), label + ', row ' + row + ': the menu closed');
        cc(14, 1); ticks(1);
    }
}

for (const [label, track, drum, bank] of [
        ['melodic track, menu opened from the FX bank', 2, false, 2],
        ['melodic track, from CLIP', 3, false, 0],
        ['drum track, from DRUM LANE', 0, true, 0],
        ['melodic track, from the CONFIG bank', 4, false, BANK_CONFIG]]) {
    step('⭐ ' + label + ': Delete + click on every row does nothing', () => {
        openMenu(track, drum, bank);
        deleteClickEveryRow(label);
    });
}

/* The control — on the SOUND + CONFIG card itself Delete + click still resets
 * the levels — is test_sound_config_reset.mjs's whole subject; not repeated. */

if (failed) { console.log('FAIL: test_delete_click_menu'); process.exit(1); }
console.log('PASS: test_delete_click_menu');
}
main().catch(e => { console.error(e); process.exit(1); });
