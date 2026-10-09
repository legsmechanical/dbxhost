import './_bulk_get_stub.mjs';
/* tests/js/test_capture_ext_on_move_track.mjs — external MIDI played on a
 * Move-routed track reaches the Capture ring (Josh, 2026-10-08: "capture
 * doesn't work on external midi in").
 *
 * Move sounds those notes itself, so the UI never sent them to the engine and
 * Capture had nothing to take. Runs the whole UI: a note arrives at
 * onMidiMessageExternal, a tick drains the queue, and the tN_live_notes write
 * is read back.
 *   Move track     → "con p v" / "coff p": capture-only, never played.
 *   CONTROL: a Schwung track → "eon" / "eoff": played (and captured) as before.
 *   A note played into a held step is an edit and is not taken.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let STEP_VEL = '40';
const leds = {};                     /* note -> colour, NoteOn only */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => (/^t0_l0_step_\d+_vel$/.test(k) ? STEP_VEL : /_step_\d+_/.test(k) ? '0' : '');
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
S.trackPadMode[1] = 0; S.activeTrack = 1; S.midiInChannel = 0;
const ext = (st, n, v) => globalThis.onMidiMessageExternal(new Uint8Array([st, n, v]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const live = (t) => sets.filter(([k]) => k === 't' + t + '_live_notes').map(([, v]) => v).join(' | ');
const is = (got, want, what) => assert(got === want, what + ': got "' + got + '", want "' + want + '"');

step('⭐ a Move track: an external note goes to the Capture ring only', () => {
    S.trackRoute[1] = 1; sets.length = 0;
    ext(0x90, 60, 100); ticks(1);
    is(live(1), 'con 60 100', 'note-on');
    sets.length = 0;
    ext(0x80, 60, 0); ticks(1);
    is(live(1), 'coff 60', 'note-off');
});
step('a Move track: a chord arrives as one write, in order', () => {
    sets.length = 0;
    ext(0x90, 60, 100); ext(0x90, 64, 90); ext(0x90, 67, 80); ticks(1);
    is(live(1), 'con 60 100 con 64 90 con 67 80', 'chord');
    ext(0x80, 60, 0); ext(0x80, 64, 0); ext(0x80, 67, 0); ticks(1);
});
step('a Move track: a note played in unison with the playing clip is still captured', () => {
    sets.length = 0;
    S.seqActiveNotes.add(72);
    ext(0x90, 72, 100); ticks(1);
    ext(0x80, 72, 0); ticks(1);
    S.seqActiveNotes.delete(72);
    is(live(1), 'con 72 100 | coff 72', 'unison');
});
step('a Move track: a note played into a HELD step is an edit, not a take', () => {
    sets.length = 0;
    S.heldStep = 3; S.shiftHeld = false;
    ext(0x90, 67, 100); ticks(1);
    S.heldStep = -1;
    ext(0x80, 67, 0); ticks(1);
    is(live(1), '', 'held-step entry');
    assert(sets.some(([k]) => /_step_3_toggle$/.test(k)), 'control: the note did edit the held step');
});
step('a Move track: a pitch a pad is already sounding is not captured a second time', () => {
    sets.length = 0;
    S.liveActiveNotes.add(65);
    ext(0x90, 65, 100); ticks(1);
    S.liveActiveNotes.delete(65);
    ext(0x80, 65, 0); ticks(1);
    is(live(1), '', 'pad-held pitch');
});
step('a Move track that is armed: recording owns the input, nothing goes to Capture', () => {
    sets.length = 0;
    S.recordArmed = true; S.recordArmedTrack = 1;
    ext(0x90, 62, 100); ticks(1);
    ext(0x80, 62, 0); ticks(1);
    S.recordArmed = false; S.recordArmedTrack = -1;
    assert(!/con |coff /.test(live(1)), 'capture tokens were sent: "' + live(1) + '"');
});
step('CONTROL: a Schwung track plays the note, as before (eon / eoff)', () => {
    S.trackRoute[1] = 0; sets.length = 0;
    ext(0x90, 60, 100); ticks(1);
    ext(0x80, 60, 0); ticks(1);
    is(live(1), 'eon 60 100 | eoff 60', 'played');
});
step('a drum Move track: the hit goes to the Capture ring only', () => {
    S.trackRoute[0] = 1; S.trackPadMode[0] = PAD_MODE_DRUM; S.activeTrack = 0; sets.length = 0;
    ext(0x90, 36, 110); ticks(1);
    ext(0x80, 36, 0); ticks(1);
    is(live(0), 'con 36 110 | coff 36', 'drum hit');
});
if (failed) { console.log('FAIL: Capture and external MIDI on a Move track'); process.exit(1); }
console.log('PASS: external MIDI on a Move track reaches Capture without being played');
}
main().catch((e) => { console.error(e); process.exit(1); });
