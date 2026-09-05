/* tests/js/test_track_switch_follows_editor_cc.mjs — ITEM 20 (Josh, 2026-09-05:
 * "Yes, follow into the editor", then "tracks should switch under everything
 * except where it just doesn't make any sense"). A track switch made from ANY
 * sound-mode screen lands on the same KIND of screen on the new track where
 * it has one (editor → editor, menu → menu, CONFIG → CONFIG, LFO → LFO,
 * MACROS → MACROS, prompt → prompt), route-aware; a global bus and a Conduct
 * target still close; outside sound mode nothing opens.
 *
 * Drives `_switchActiveTrack` directly — it is the ONE dispatch every switch
 * site (Shift+jog, Shift+pad, launchers, remote UI) goes through — and reads
 * the outcome through sound mode's test accessors, never by rendering. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

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
globalThis.shadow_restore_knob_leds = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
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
globalThis.set_led = () => {};
/* ⚠⚠ These matter more than they look. `tick()` wraps _tickImpl in a
 * try/catch, so a MISSING host binding throws on the first line that touches it
 * and every later stage of the tick — including sound mode's track-follow —
 * silently never runs. The whole tick looks like it executed. A fourth version
 * of the one-shot step passed against its mutation purely because
 * host_ext_midi_remap_clear was undefined and the follow was unreachable. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
/* A loaded generator on every chain slot: engineLoadedModule() reads
 * `<comp>:module`, and the editor only opens on a block that has something in
 * it. The PARKED chain of a MIDI / NONE track answers the same — which is
 * exactly why those routes must NOT reopen an editor. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { BANK_SOUND, ROUTE_NONE, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const { MoveShift, MoveMainKnob } = await import('/data/UserData/schwung/shared/constants.mjs');

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_NOEDITOR = 21;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (down) => cc(MoveShift, down ? 127 : 0);
const jog = (delta) => cc(MoveMainKnob, delta > 0 ? delta : 128 + delta);
const view = () => snd.soundPickStateForTest().view;
const settle = () => { globalThis.tick(); globalThis.tick(); globalThis.tick(); };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function enterEditor(t) {
    S.activeTrack = t;
    snd.soundEnter(t, t);
    snd.soundQueueActionForTest({ t: 'open', comp: 'synth' });
    globalThis.tick();
    if (!snd.soundOpen() || view() !== VIEW_EDIT) throw new Error('control failed: editor did not open on track ' + t + ' (view ' + view() + ')');
}
/* THE DEVICE PATH (build-21 pass, Josh 2026-09-05): the harness next door drives
 * _switchActiveTrack directly and passes; on the device a NONE track landed on
 * its SOUND MENU and a fast Shift+scroll dumped him to the overview. This one
 * sends what the hardware sends — Shift CC + jog CC 14 detents — through
 * onMidiMessageInternal, with and without ticks between detents. */
step('setup: routes — 2,3 Schwung · 4 MIDI · 5 NONE · 6 Move · 7 Schwung', () => {
    S.sessionView = false; S.globalMenuOpen = false; S.ledInitComplete = true;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackActiveBank[t] = t % 3; S.trackSoundOrigin[t] = -1; }
    S.trackRoute[4] = 2; S.trackRoute[5] = ROUTE_NONE; S.trackRoute[6] = 1;
    S.playing = true;
    if (!globalThis.onMidiMessageInternal) throw new Error('no CC entry point');
});

step('control: Shift+jog from the editor onto the next Schwung track opens ITS editor', () => {
    enterEditor(2); settle();
    shift(true); jog(1); settle();
    if (S.activeTrack !== 3) throw new Error('track did not switch: ' + S.activeTrack);
    if (view() !== VIEW_EDIT || snd.soundTrack() !== 3) throw new Error('view ' + view() + ' track ' + snd.soundTrack());
});

step('⭑ device caveat (i): Shift+jog on through MIDI onto the NONE track → the MESSAGE, not the menu', () => {
    jog(1); settle();                                   /* → 4 MIDI */
    if (view() !== VIEW_NOEDITOR) throw new Error('MIDI: view ' + view());
    jog(1); settle();                                   /* → 5 NONE */
    if (S.activeTrack !== 5) throw new Error('track ' + S.activeTrack);
    if (view() !== VIEW_NOEDITOR) throw new Error('NONE landed on view ' + view() + ' (0 = the sound menu) — the device caveat');
    for (let i = 0; i < 6; i++) globalThis.tick();     /* and it STAYS the message */
    if (view() !== VIEW_NOEDITOR) throw new Error('NONE message replaced after more ticks: view ' + view());
    shift(false); settle();
    if (view() !== VIEW_NOEDITOR) throw new Error('Shift release changed the view: ' + view());
});

step('⭑ device caveat (i), direct: editor → NONE in ONE detent (Schwung track 4 made NONE)', () => {
    snd.soundExit(); settle();
    S.trackRoute[4] = ROUTE_NONE;
    enterEditor(3); settle();
    shift(true); jog(1); settle();
    if (S.activeTrack !== 4 || view() !== VIEW_NOEDITOR) throw new Error('track ' + S.activeTrack + ' view ' + view());
    shift(false); settle();
    S.trackRoute[4] = 2;
});

step('⭑ device caveat (ii): a FAST Shift+scroll (no tick between detents) from the editor across every kind keeps sound mode open on the last track', () => {
    snd.soundExit(); settle();
    enterEditor(2); settle();
    shift(true);
    jog(1); jog(1); jog(1); jog(1); jog(1);            /* 2 → 7 with no tick between */
    if (!snd.soundOpen()) throw new Error('sound mode CLOSED mid-burst (the overview dump)');
    settle();
    if (S.activeTrack !== 7) throw new Error('track ' + S.activeTrack);
    if (!snd.soundOpen()) throw new Error('sound mode CLOSED after the burst settled — the overview dump');
    if (view() !== VIEW_EDIT || snd.soundTrack() !== 7) throw new Error('view ' + view() + ' track ' + snd.soundTrack());
    shift(false); settle();
});

step('⭑ device caveat (ii), the other way: fast burst BACK through NONE/MIDI onto Schwung 3', () => {
    shift(true);
    jog(-1); jog(-1); jog(-1); jog(-1);                /* 7 → 3 */
    settle();
    if (S.activeTrack !== 3) throw new Error('track ' + S.activeTrack);
    if (!snd.soundOpen()) throw new Error('sound mode CLOSED — the overview dump');
    if (view() !== VIEW_EDIT) throw new Error('view ' + view());
    shift(false); settle();
});

step('⭑ fast burst that ENDS on the NONE track: the message, sound mode open', () => {
    shift(true);
    jog(1); jog(1);                                    /* 3 → 5 */
    settle();
    if (S.activeTrack !== 5 || !snd.soundOpen()) throw new Error('track ' + S.activeTrack + ' open ' + snd.soundOpen());
    if (view() !== VIEW_NOEDITOR) throw new Error('view ' + view());
    shift(false); settle();
});

if (failed) process.exit(1);
console.log('PASS: test_track_switch_follows_editor_cc.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
