/* tests/js/test_sound_overlay_input.mjs — prove, through the REAL dispatch,
 * that an overlay drawn above sound mode also RECEIVES the input.
 *
 * The bug (Josh, on hardware): Shift+Step2 from sound mode drew the global
 * menu and the jog did nothing. drawUI puts sound mode below every overlay,
 * but the MIDI dispatch put sound mode's hooks FIRST — so the menu was visible
 * while sound mode was steering, and every turn vanished into a screen nobody
 * could see. A grep pin can only prove the gate is spelled in the source; this
 * drives `globalThis.onMidiMessageInternal`, the exact entry point the host
 * calls, and watches where a jog turn actually lands.
 *
 * Observables, both real state rather than instrumentation:
 *   sound mode took it  → soundDirty() (soundOnCC sets S.dirty on every turn)
 *   the menu took it    → S.globalMenuState.selectedIndex moved
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

/* Host globals must exist before any ui module body runs (same contract as
 * test_picker_boot.mjs). */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
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
globalThis.fill_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};

async function main() {
await import('../../ui/ui.js');                 /* installs onMidiMessageInternal */
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const menu = await import('../../ui/ui_menu.mjs');
const render = await import('../../ui/ui_render.mjs');

const jog = (v) => new Uint8Array([0xB0, 14, v]);   /* MoveMainKnob, +1 detent */
const turn = () => globalThis.onMidiMessageInternal(jog(1));

function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

step('setup: sound mode is active, nothing covering it', () => {
    S.sessionView = false;
    snd.soundEnter(0, 0);
    if (!snd.soundActive()) throw new Error('sound mode did not enter');
    if (render.soundModeCovered()) throw new Error('nothing is open, yet sound mode reads as covered');
});

step('baseline: uncovered, the jog reaches sound mode', () => {
    snd.soundDirty();                            /* consume, then look for a fresh one */
    turn();
    if (!snd.soundDirty()) throw new Error('sound mode did not react to the jog with no overlay up');
});

step('the global menu opens OVER sound mode (which stays active)', () => {
    menu.openGlobalMenu();
    if (!S.globalMenuOpen) throw new Error('menu did not open');
    if (!snd.soundActive()) throw new Error('opening the menu must not exit sound mode');
    if (!render.soundModeCovered()) throw new Error('menu is open but sound mode does not read as covered');
});

step('THE BUG: with the menu drawn, sound mode must NOT see the jog', () => {
    snd.soundDirty();
    turn();
    if (snd.soundDirty())
        throw new Error('sound mode swallowed the jog while the menu was drawn — the menu is input-dead');
});

step('...and the menu cursor actually moves', () => {
    const before = S.globalMenuState.selectedIndex;
    turn(); turn();
    if (S.globalMenuState.selectedIndex === before)
        throw new Error('the jog reached nothing: cursor still at ' + before);
});

step('closing the menu hands the jog back to sound mode', () => {
    S.globalMenuOpen = false;
    if (render.soundModeCovered()) throw new Error('still covered after the menu closed');
    snd.soundDirty();
    turn();
    if (!snd.soundDirty()) throw new Error('sound mode did not get the jog back');
});

console.log(failed ? 'test_sound_overlay_input: FAIL' : 'test_sound_overlay_input: PASS');
process.exit(failed);
}

main();
