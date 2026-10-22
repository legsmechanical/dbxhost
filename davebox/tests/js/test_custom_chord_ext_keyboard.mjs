/* tests/js/test_custom_chord_ext_keyboard.mjs — Custom chords from an
 * external keyboard: the keys do what tapping a scale pad does.
 *
 *   hold a chord pad + play keys        each key goes in, or comes out (six at most)
 *   hold keys + tap an EMPTY chord pad  the pad takes the held keys
 *
 * Through the real gestures: Shift + Step 8 to the layout, pads through
 * onMidiMessageInternal, keys through onMidiMessageExternal. The chord is read
 * off the tN_padmap and tN_chord_revoice the engine is sent; that an edit is
 * not recorded off the recorder's own queue, and not captured off tN_live_notes.
 * Each "stays out" case has a control showing the same key DOES reach it
 * without a chord pad held. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
let afterStep = () => {};
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } finally { afterStep(); } }
function assert(c, m) { if (!c) throw new Error(m); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sets = [];
let injected = 0;
for (const fn of ['host_system_cmd', 'host_write_file', 'host_ensure_dir', 'host_remove_dir',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'set_led', 'move_midi_internal_send', 'move_midi_external_send',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi'])
    globalThis[fn] = () => 0;
globalThis.move_midi_inject_to_move = () => { injected++; return 0; };
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); return 0; };
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const CU = await import('../../ui/ui_custom_chords.mjs');
const { extHeldNotes } = await import('../../ui/ui_record.mjs');

const T = 2;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.midiInChannel = 0; S.padKey = 0; S.padScale = 0; S.dspInboundEnabled = true;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
const note = (n, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 100 : 0]));
const pad = (i, on) => note(C.TRACK_PAD_BASE + i, on);
const tap = (i) => { pad(i, true); pad(i, false); };
const key = (p, on, ch) => globalThis.onMidiMessageExternal(new Uint8Array([(on ? 0x90 : 0x80) | ((ch || 1) - 1), p, on ? 100 : 0]));
const keys = (ps) => { for (const p of ps) key(p, true); for (const p of ps) key(p, false); };
const shiftStep8 = () => { cc(49, 127); note(16 + 7, true); note(16 + 7, false); cc(49, 0); ticks(1); };
const chord = (k) => CU.customChordGet(T, k);
const lastPadmap = () => {
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i][0] === 't2_padmap') return sets[i][1].split(' ');
    return null;
};
const revoices = () => sets.filter((x) => x[0] === 't2_chord_revoice').map((x) => x[1]);
const live = () => sets.filter((x) => x[0] === 't2_live_notes').map((x) => x[1]).join(' | ');
const popup = () => (S.actionPopupEndTick > S.clockMs ? (S.actionPopupLines || []).join(' / ') : '');
const clearAll = () => { S.customChords[T] = Array.from({ length: 8 }, () => []); S.customChordOctave[T] = 0; ticks(2); };
afterStep = () => {
    for (let i = 0; i < 32; i++) pad(i, false);
    for (const p of Array.from(extHeldNotes.keys())) key(p, false);
    S.heldStep = -1; S.recordArmed = false; S.recordArmedTrack = -1; S.midiInChannel = 0;
    S.trackRoute[T] = 0; S._recNoteOns.length = 0; S._recNoteOffs.length = 0;
    ticks(60);
    clearAll();
};

for (let i = 0; i < 4; i++) {
    shiftStep8();
    if (S.chordPopupOpen) { cc(3, 127); cc(3, 0); ticks(2); }
}
assert(CU.customLayoutOn(T), 'setup: not on the Custom layout');

step('⭐⭐ hold a chord pad + play three keys: the pad holds that chord, and the engine is sent it', () => {
    sets.length = 0;
    pad(0, true);
    keys([60, 64, 67]);
    pad(0, false);
    assert(eq(chord(0), [60, 64, 67]), 'chord ' + JSON.stringify(chord(0)));
    ticks(2);
    assert(lastPadmap()[0] === '60+64+67', 'pad map pad 0: ' + lastPadmap()[0]);
    assert(/eon 60 100/.test(live()) && /eoff 67/.test(live()), 'the keys did not sound: "' + live() + '"');
});

step('⭐ the same keys again, into the same pad, take the notes back out (as tapping pads does)', () => {
    CU.customChordSet(T, 0, [60, 64, 67]); ticks(2);
    pad(0, true); keys([60, 64, 67]); pad(0, false);
    assert(eq(chord(0), []), 'chord ' + JSON.stringify(chord(0)));
});

step('keys add to a chord the pad already has; they never replace it', () => {
    CU.customChordSet(T, 3, [48, 55]); ticks(2);
    pad(3, true); keys([64]); pad(3, false);
    assert(eq(chord(3), [48, 55, 64]), 'chord ' + JSON.stringify(chord(3)));
});

step('every key played while the pad is held counts, held together or one by one', () => {
    pad(1, true); keys([60]); keys([62]); key(65, true); key(69, true); key(65, false); key(69, false); pad(1, false);
    assert(eq(chord(1), [60, 62, 65, 69]), 'chord ' + JSON.stringify(chord(1)));
});

step('the chord row\'s octave: a key is stored as heard minus it, and the pad sounds it back where it was played', () => {
    S.customChordOctave[T] = 1;
    pad(0, true); keys([72]); pad(0, false);
    assert(eq(chord(0), [60]), 'stored ' + JSON.stringify(chord(0)));
    ticks(2);
    assert(lastPadmap()[0] === '72', 'pad map pad 0: ' + lastPadmap()[0]);
});

step('a seventh note is refused with the pads\' notice', () => {
    pad(2, true); keys([60, 62, 64, 65, 67, 69, 71]);
    const said = popup();
    pad(2, false);
    assert(chord(2).length === 6 && chord(2).indexOf(71) < 0, 'chord ' + JSON.stringify(chord(2)));
    assert(said === 'CHORD FULL / 6 NOTES MAX', 'notice: "' + said + '"');
});

step('⭐ a sounding chord is re-voiced in place by a key', () => {
    CU.customChordSet(T, 0, [60, 64]); ticks(2);
    sets.length = 0;
    pad(0, true);
    key(67, true);
    assert(eq(revoices(), ['0 60+64+67']), 're-voice: ' + revoices());
    key(67, false); pad(0, false);
});

step('⭐⭐ an edit stays out of the recording; CONTROL: the same key with no chord pad held is recorded', () => {
    S.recordArmed = true; S.recordArmedTrack = T; S.recordCountingIn = false;
    pad(0, true); key(62, true);
    const rec = extHeldNotes.get(62);
    assert(S._recNoteOns.length === 0, 'recorded: ' + JSON.stringify(S._recNoteOns));
    assert(rec && rec.recording === false && rec.cap === false, 'held book: ' + JSON.stringify(rec));
    key(62, false); pad(0, false);
    assert(S._recNoteOffs.length === 0, 'a record note-off was queued: ' + JSON.stringify(S._recNoteOffs));
    assert(eq(chord(0), [62]), 'the key was not an edit: ' + JSON.stringify(chord(0)));
    key(69, true);
    assert(S._recNoteOns.some((n) => n.pitch === 69), 'control: not recorded: ' + JSON.stringify(S._recNoteOns));
    key(69, false);
});

step('⭐ a Move track: an edit is neither captured nor injected; CONTROL: an unheld key is captured', () => {
    S.trackRoute[T] = 1; sets.length = 0; injected = 0;
    pad(0, true); keys([64]); pad(0, false); ticks(1);
    assert(eq(chord(0), [64]), 'chord ' + JSON.stringify(chord(0)));
    assert(!/con |coff /.test(live()), 'captured: "' + live() + '"');
    assert(injected === 0, 'injected to Move ' + injected + 'x');
    keys([65]); ticks(1);
    assert(/con 65 100/.test(live()), 'control: not captured: "' + live() + '"');
});

step('the MIDI-in channel filter still applies: a key on another channel does nothing', () => {
    S.midiInChannel = 2;
    pad(0, true); keys([60]);
    assert(eq(chord(0), []), 'channel 1 edited the chord: ' + JSON.stringify(chord(0)));
    key(60, true, 2); key(60, false, 2);
    pad(0, false);
    assert(eq(chord(0), [60]), 'control: channel 2 did not: ' + JSON.stringify(chord(0)));
});

step('a held step wins over a held chord pad: the key edits the step, the chord is untouched', () => {
    pad(0, true);
    S.heldStep = 3; S.heldStepBtn = 3; sets.length = 0;
    keys([62]);
    assert(eq(chord(0), []), 'chord ' + JSON.stringify(chord(0)));
    assert(sets.some(([k]) => /_step_3_toggle$/.test(k)), 'the step was not edited');
});

step('⭐⭐ hold keys + tap an EMPTY chord pad: the pad takes them, silent until its next press', () => {
    sets.length = 0;
    key(60, true); key(64, true);
    tap(5);
    key(60, false); key(64, false);
    assert(eq(chord(5), [60, 64]), 'chord ' + JSON.stringify(chord(5)));
    assert(revoices().length === 0, 'the empty pad was re-voiced: ' + revoices());
});

step('hold keys + tap a chord pad that HAS a chord: it just plays, the chord is kept', () => {
    CU.customChordSet(T, 6, [50]); ticks(2);
    key(60, true); tap(6); key(60, false);
    assert(eq(chord(6), [50]), 'chord ' + JSON.stringify(chord(6)));
});

step('CONTROL: no chord pad held, a key plays as always and edits nothing', () => {
    sets.length = 0;
    key(60, true); ticks(1);
    const rec = extHeldNotes.get(60);
    key(60, false); ticks(1);
    for (let k = 0; k < 8; k++) assert(chord(k).length === 0, 'chord ' + k + ' edited');
    assert(rec && rec.live === true, 'held book: ' + JSON.stringify(rec));
    assert(/eon 60 100.*eoff 60/.test(live()), 'the key did not play: "' + live() + '"');
});

if (failed) { console.error('FAIL: test_custom_chord_ext_keyboard'); process.exit(1); }
console.log('PASS: test_custom_chord_ext_keyboard');
}
main().catch((e) => { console.error(e); process.exit(1); });
