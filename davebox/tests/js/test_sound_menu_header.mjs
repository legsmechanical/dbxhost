/* tests/js/test_sound_menu_header.mjs — the sound menu wears the bank header: T<n>[ABBR]
 * channel sound menu needs all relevant params exposed (anything from the other
 * track type sound menus that would also apply to midi tracks)."
 *
 * A MIDI-routed track's sound menu used to be its destination row alone. It now
 * carries the CONFIG door, and the config screen offers every davebox-side
 * track setting that is a property of the note stream — all but the Looper,
 * which records an instrument the track does not have. NONE stays collapsed;
 * a Schwung track's menu is untouched. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => 0;

/* Josh, 2026-09-05: "sound menu should show the track number on the header
 * along with the instrument abbreviation just like track view banks." The
 * menu (and the CONFIG / SOUND CONTROL stacks drawn over it) wears the bank
 * card's header — glyph, name, T<n>[ABBR] — through the SAME helpers. */
async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');
const R = await import('../../ui/ui_render.mjs');
const sound = await import('../../ui/ui_sound.mjs');
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function ticks(n) { for (let i = 0; i < n; i++) globalThis.tick(); }
function draw() { globalThis.clear_screen(); R.drawUI(); }

step('setup', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.trackRoute[2] = 0; S.activeTrack = 2;
    ticks(2);
});
step('the sound MENU on a Schwung track wears the bank header: audio glyph, SOUND+CFG, T3[<abbr>]', () => {
    sound.soundEnter(2, 2); sound.soundShowMenu(); ticks(2);
    R.refreshInstrAbbrev();
    draw();
    const h = sound.soundMenuHeaderForTest();
    if (!h) throw new Error('no header drawn');
    if (h.glyph !== 'audio' || h.name !== 'SOUND+CFG') throw new Error('header ' + JSON.stringify(h));
    const want = R.bankHeaderRight(false);
    if (h.right !== want) throw new Error('right ' + JSON.stringify(h.right) + ' vs the bank card\'s ' + JSON.stringify(want));
    if (!/^T3\[.+\]$/.test(h.right)) throw new Error('right label is not T3[ABBR]: ' + h.right);
    if (h.right.indexOf(' ') >= 0) throw new Error('a space crept in: ' + h.right);
});
step('...and the CONFIG screen stacked over it keeps that header', () => {
    sound.soundQueueActionForTest({ t: 'slotcfg', which: 'config' }); ticks(2);
    draw();
    const h = sound.soundMenuHeaderForTest();
    if (!h || h.right !== R.bankHeaderRight(false)) throw new Error('config header ' + JSON.stringify(h));
    sound.soundExit(); ticks(2);
});
step('a NONE track reads T4[NONE]', () => {
    B.applyInstrChoice(3, C.INSTR_NONE);
    S.activeTrack = 3; S.instrAbbrevAt = 0; ticks(2);
    sound.soundEnter(3, 3); sound.soundShowMenu(); ticks(2);
    R.refreshInstrAbbrev();
    draw();
    const h = sound.soundMenuHeaderForTest();
    if (!h || h.right !== 'T4[NONE]') throw new Error('header ' + JSON.stringify(h));
    sound.soundExit(); ticks(2);
});
step('a GLOBAL bus (Send FX A) is not a track: its own title, no track label', () => {
    S.activeTrack = 2; S.trackRoute[2] = 0;
    sound.soundEnter(2, 2); ticks(1);
    sound.soundQueueActionForTest({ t: 'bus', bus: { id: 'sendA', kind: 'global', title: 'SEND FX A', prefix: 'send_fx:a:', levels: [] } });
    ticks(2);
    draw();
    const h = sound.soundMenuHeaderForTest();
    if (!h || h.name !== 'SEND FX A' || h.right !== '') throw new Error('bus header ' + JSON.stringify(h));
    sound.soundExit(); ticks(2);
});
if (failed) process.exit(1);
console.log('PASS: test_sound_menu_header.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
