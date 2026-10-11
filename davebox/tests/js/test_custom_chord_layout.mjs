/* tests/js/test_custom_chord_layout.mjs — the melodic CUSTOM layout: the
 * bottom row is eight chords the user builds, the other three rows are the
 * Scale layout.
 *
 * Through the real gestures: Shift + Step 8 and the Layout row to get there;
 * hold a chord pad + tap scale pads to build it; the octave buttons; Delete +
 * chord pad; hold a step + chord pad. The notes are read off the tN_padmap and
 * tN_chord_revoice the engine is sent, the colours off the LED packets, the
 * notices off the screen. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
let afterStep = () => {};
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } finally { afterStep(); } }
function assert(c, m) { if (!c) throw new Error(m); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sets = [];
for (const fn of ['host_system_cmd', 'host_write_file', 'host_ensure_dir', 'host_remove_dir',
    'shadow_set_param', 'shadow_save_state_now', 'host_vol_block',
    'host_edit_cc_block', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'stipple_rect', 'draw_line',
    'set_pixel', 'flush_display', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi'])
    globalThis[fn] = () => 0;
globalThis.host_module_set_param = (k, v) => { sets.push([k, String(v)]); return 0; };
let sidecarFile = '';
globalThis.host_read_file = (p) => (/ui-state/.test(p) ? sidecarFile : '');
globalThis.host_file_exists = (p) => /ui-state/.test(p) && sidecarFile !== '';
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => String(t).length * 6;

const ledState = {};
/* Pad LEDs are note-ons; a button LED is a CC with the same number space. */
globalThis.move_midi_internal_send = (pkt) => { if ((pkt[1] & 0xF0) === 0x90) ledState[pkt[2]] = pkt[3]; return true; };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const SC = await import('/data/UserData/schwung/shared/constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const CU = await import('../../ui/ui_custom_chords.mjs');

const T = 2;
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.midiInChannel = 0; S.padKey = 0; S.padScale = 0; S.dspInboundEnabled = true;   /* C major */
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
const note = (n, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 100 : 0]));
const pad = (i, on) => note(C.TRACK_PAD_BASE + i, on);
const tap = (i) => { pad(i, true); pad(i, false); };
const shiftStep8 = () => { cc(49, 127); note(16 + 7, true); note(16 + 7, false); cc(49, 0); ticks(1); };
const octUp = () => { cc(SC.MoveUp, 127); cc(SC.MoveUp, 0); };
const octDown = () => { cc(SC.MoveDown, 127); cc(SC.MoveDown, 0); };
const lastPadmap = () => {
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i][0] === 't2_padmap') return sets[i][1].split(' ');
    return null;
};
const revoices = () => sets.filter((x) => x[0] === 't2_chord_revoice').map((x) => x[1]);
const layout = () => S.padLayoutCustom[T] ? 'custom' : S.padLayoutChord[T] ? 'chord' : S.padLayoutPiano[T] ? 'piano'
    : S.padLayoutChromatic[T] ? 'chrom' : 'scale';
const padLeds = () => { leds.invalidateLEDCache(); leds.updateTrackLEDs(); const o = []; for (let i = 0; i < 32; i++) o.push(ledState[C.TRACK_PAD_BASE + i]); return o; };
const popup = () => (S.actionPopupEndTick > S.clockMs ? (S.actionPopupLines || []).join(' / ') : '');
function screenText() {
    const out = [];
    /* Kit text draws through fill_rect (the trace); a notice card prints. */
    const wasPrint = globalThis.print;
    globalThis.print = (x, y, t) => { out.push(String(t)); };
    fonts.setKitTextTrace((t) => out.push(t));
    try { globalThis.clear_screen(); render.drawUI(); } finally { fonts.setKitTextTrace(null); globalThis.print = wasPrint; }
    return out;
}
/* What scale pad i sounds: the Scale layout's rule, restarted at the root on
 * row 2 (C major, root from the pad octave, the track octave on top). */
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const scalePitch = (i) => {
    const deg = (i % 8) + (Math.floor(i / 8) - 1) * 3;
    return (S.padOctave[T] | 0) * 12 + Math.floor(deg / 7) * 12 + MAJ[deg % 7] + (S.trackOctave[T] | 0) * 12;
};
afterStep = () => {
    cc(SC.MoveDelete, 0); cc(SC.MoveCopy, 0); cc(49, 0);
    for (let i = 0; i < 32; i++) pad(i, false);
    ticks(60);            /* past any notice's window */
};
const clearAll = () => { S.customChords[T] = Array.from({ length: 8 }, () => []); S.customChordOctave[T] = 0; S.customOctRegion[T] = 0; ticks(2); };

step('⭐ Shift + Step 8 walks Scale → Chrom → Piano → Chord → Custom → Scale, and says where it landed', () => {
    const seen = [layout()];
    let said = '';
    for (let i = 0; i < 5; i++) {
        shiftStep8(); seen.push(layout());
        if (layout() === 'custom') said = popup();
        if (S.chordPopupOpen) { cc(3, 127); cc(3, 0); ticks(2); }
    }
    assert(eq(seen, ['scale', 'chrom', 'piano', 'chord', 'custom', 'scale']), 'walk: ' + seen);
    assert(said === 'CUSTOM CHORDS', 'landing notice: "' + said + '"');
    assert(S.trackActiveBank[T] !== C.BANK_CHORD && S.activeBank !== C.BANK_CHORD, 'the CHORD bank stayed after leaving Chord');
});

step('⭐ the Layout row offers Custom last, sets it and reads it; another value leaves it', () => {
    const r = snd.configRowsForTest(T).find((x) => x.key === 'layout');
    assert(eq(r.opts, [0, 1, 3, 2, 4]), 'options ' + r.opts);
    r.set(4); ticks(1);
    assert(layout() === 'custom' && r.fmt(r.get()) === 'Custom', layout() + ' / ' + r.fmt(r.get()));
    assert(!S.chordPopupOpen, 'the Chord explainer came up for Custom');
    r.set(2); ticks(1);
    assert(layout() === 'chord' && !S.padLayoutCustom[T], 'row Chord: ' + layout());
    cc(3, 127); cc(3, 0); ticks(2);
    r.set(4); ticks(1);
    assert(layout() === 'custom' && !S.padLayoutChord[T] && !S.chordPopupOpen, 'row back to Custom: ' + layout());
});

step('⭐⭐ a fresh track: the chord row is silent and dimly lit; rows 2-4 are the Scale layout from the root', () => {
    assert(layout() === 'custom', 'not on Custom');
    ticks(2);
    const pm = lastPadmap();
    for (let i = 0; i < 8; i++) assert(pm[i] === '255', 'chord pad ' + i + ' not silent: ' + pm[i]);
    for (let i = 8; i < 32; i++) assert(pm[i] === String(scalePitch(i)), 'pad ' + i + ': ' + pm[i] + ' want ' + scalePitch(i));
    assert(pm[8] === String((S.padOctave[T] | 0) * 12 + (S.trackOctave[T] | 0) * 12), 'row 2 does not start on the root: ' + pm[8]);
    const L = padLeds();
    /* silent, but dimly lit: the row shows where the chord slots are */
    for (let i = 0; i < 8; i++) assert(L[i] === 107, 'empty chord pad ' + i + ' is not dim purple: ' + L[i]);
    /* not a shade of the stored-chord colour (Cyan 14, its dims 91 / 92) */
    assert([14, 91, 92].indexOf(L[0]) < 0, 'an empty pad is a shade of the stored colour');
    assert(L[8] === leds.trackColor(T), 'the root pad is not the track colour: ' + L[8]);
    assert(L[9] !== L[8] && L[9] !== 0, 'a scale pad: ' + L[9]);
});

step('⭐ pressing an empty chord pad plays nothing and says how to fill it', () => {
    pad(3, true);
    assert(S.liveActiveNotes.size === 0, 'an empty chord booked notes');
    assert(popup() === 'EMPTY CHORD / HOLD + TAP NOTES', 'notice: "' + popup() + '"');
    assert(screenText().some((x) => x === 'EMPTY CHORD'), 'the notice is not on screen: ' + screenText().join('|'));
    pad(3, false);
});

step('⭐⭐ hold a chord pad + tap three scale pads builds the chord; the empty pad is never re-voiced', () => {
    clearAll(); sets.length = 0;
    pad(2, true);
    tap(8); tap(10); tap(12);                       /* C  E  G */
    assert(revoices().length === 0, 'a pad that pressed silent was re-voiced: ' + revoices());
    const want = [scalePitch(8), scalePitch(10), scalePitch(12)];
    assert(eq(S.customChords[T][2], want), 'chord: ' + S.customChords[T][2] + ' want ' + want);
    const L = padLeds();
    assert(L[8] === SC.White && L[10] === SC.White && L[12] === SC.White, 'the held chord\'s notes are not white on the scale rows');
    assert(L[9] !== SC.White, 'a note outside the chord is white');
    assert(L[2] === SC.White, 'the held chord pad is not white');
    pad(2, false); ticks(3);
    assert(lastPadmap()[2] === want.join('+'), 'padmap token: ' + lastPadmap()[2]);
    assert(S.liveActiveNotes.size === 0, 'notes left held: ' + [...S.liveActiveNotes]);
    assert(padLeds()[2] === SC.Cyan, 'a filled chord pad is not the chord colour: ' + padLeds()[2]);
    assert(padLeds()[8] !== SC.White, 'the chord\'s notes stayed lit after release');
});

step('⭐⭐ a filled chord plays whole; an edit while it sounds re-voices it in place', () => {
    sets.length = 0;
    const c = S.customChords[T][2].slice();
    pad(2, true);
    assert(eq([...S.liveActiveNotes].sort((a, b) => a - b), c), 'held notes: ' + [...S.liveActiveNotes]);
    assert(screenText().some((x) => /^\[.*C.*\]$/.test(x)), 'the header does not name the chord: ' + screenText().filter((x) => x[0] === '['));
    tap(14);                                         /* + B */
    const withB = c.concat([scalePitch(14)]);
    assert(eq(revoices(), ['2 ' + withB.join('+')]), 're-voice: ' + revoices());
    assert(S.liveActiveNotes.has(scalePitch(14)), 'the added note is not booked as sounding');
    tap(10);                                         /* - E */
    const noE = withB.filter((p) => p !== scalePitch(10));
    assert(revoices()[1] === '2 ' + noE.join('+'), 're-voice after a removal: ' + revoices()[1]);
    assert(!S.liveActiveNotes.has(scalePitch(10)), 'the removed note is still booked');
    assert(eq(S.customChords[T][2], noE), 'stored: ' + S.customChords[T][2]);
    pad(2, false); ticks(3);
    assert(S.liveActiveNotes.size === 0, 'notes left held: ' + [...S.liveActiveNotes]);
    assert(lastPadmap()[2] === noE.join('+'), 'padmap: ' + lastPadmap()[2]);
});

step('⭐ an edit tap is a preview, not a take: nothing is recorded from it', () => {
    S.recordArmed = true; S.recordArmedTrack = T;
    const before = S._recNoteOns ? S._recNoteOns.length : 0;
    try {
        S.customChords[T][5] = [];
        pad(5, true); tap(9); pad(5, false);
        assert((S._recNoteOns ? S._recNoteOns.length : 0) === before, 'an edit tap queued a recorded note');
        pad(5, true);
        assert(S._recNoteOns.length === before + 1, 'a chord pad press was not recorded');
        pad(5, false);
    } finally { S.recordArmed = false; S.recordArmedTrack = -1; if (S._recNoteOns) S._recNoteOns.length = 0; if (S._recNoteOffs) S._recNoteOffs.length = 0; }
    S.customChords[T][5] = [];
});

step('⭐ a seventh note is refused, on screen, and nothing is sent', () => {
    clearAll();
    pad(0, true);
    for (const i of [8, 9, 10, 11, 12, 13]) tap(i);
    assert(S.customChords[T][0].length === 6, 'six notes: ' + S.customChords[T][0]);
    ticks(60); sets.length = 0;
    pad(14, true);
    assert(S.customChords[T][0].length === 6, 'a seventh note got in');
    assert(popup() === 'CHORD FULL / 6 NOTES MAX', 'notice: "' + popup() + '"');
    assert(screenText().some((x) => x === 'CHORD FULL'), 'not on screen');
    assert(revoices().length === 0, 'a refused tap re-voiced');
    pad(14, false); pad(0, false);
});

step('⭐⭐ the octave buttons move the region last touched; each has its own octave, and says so', () => {
    clearAll();
    S.customChords[T][1] = [60, 64, 67]; ticks(2);
    const to0 = S.trackOctave[T];
    tap(9);                                          /* a scale pad: region = pads */
    octUp();
    assert(S.trackOctave[T] === to0 + 1 && S.customChordOctave[T] === 0, 'pads octave: ' + S.trackOctave[T] + ' / ' + S.customChordOctave[T]);
    assert(popup() === 'PADS OCTAVE / +1', 'notice: "' + popup() + '"');
    ticks(2);
    assert(lastPadmap()[1] === '60+64+67', 'the chord row moved with the pads: ' + lastPadmap()[1]);
    assert(lastPadmap()[8] === String(scalePitch(8)), 'scale row: ' + lastPadmap()[8]);
    octDown(); ticks(60);
    tap(1);                                          /* a chord pad: region = chords */
    const pad8 = lastPadmap()[8];
    octDown();
    assert(S.customChordOctave[T] === -1 && S.trackOctave[T] === to0, 'chords octave: ' + S.customChordOctave[T] + ' / ' + S.trackOctave[T]);
    assert(popup() === 'CHORDS OCTAVE / -1', 'notice: "' + popup() + '"');
    ticks(2);
    assert(lastPadmap()[1] === '48+52+55', 'chord row down an octave: ' + lastPadmap()[1]);
    assert(lastPadmap()[8] === pad8, 'the scale rows moved with the chords');
    assert(eq(S.customChords[T][1], [60, 64, 67]), 'the stored chord changed');
});

step('⭐⭐ a tapped pad adds the pitch it SOUNDS, whatever the chord row\'s octave', () => {
    /* chords octave is -1 here */
    S.customChords[T][4] = []; ticks(2);
    pad(4, true); tap(8); pad(4, false); ticks(3);
    assert(lastPadmap()[4] === String(scalePitch(8)), 'chord pad plays ' + lastPadmap()[4] + ', the tapped pad sounds ' + scalePitch(8));
    pad(4, true);
    assert(padLeds()[8] === SC.White, 'the note is not shown on the pad that sounds it');
    pad(4, false);
    S.customChordOctave[T] = 0; S.customChords[T][4] = []; ticks(2);
});

step('⭐⭐ hold a chord + Octave moves THAT chord, re-voices it, and leaves both octaves alone', () => {
    clearAll();
    S.customChords[T][1] = [60, 64, 67]; S.customChords[T][6] = [50, 57]; ticks(2);
    const to0 = S.trackOctave[T];
    sets.length = 0;
    pad(1, true);
    octUp();
    assert(eq(S.customChords[T][1], [72, 76, 79]), 'chord: ' + S.customChords[T][1]);
    assert(eq(S.customChords[T][6], [50, 57]), 'another chord moved');
    assert(S.trackOctave[T] === to0 && S.customChordOctave[T] === 0, 'a region octave moved');
    assert(eq(revoices(), ['1 72+76+79']), 're-voice: ' + revoices());
    assert(eq([...S.liveActiveNotes].sort((a, b) => a - b), [72, 76, 79]), 'held notes: ' + [...S.liveActiveNotes]);
    octDown(); octDown();
    assert(eq(S.customChords[T][1], [48, 52, 55]), 'chord after two down: ' + S.customChords[T][1]);
    pad(1, false); ticks(3);
    assert(S.liveActiveNotes.size === 0, 'notes left held: ' + [...S.liveActiveNotes]);
    assert(lastPadmap()[1] === '48+52+55', 'padmap: ' + lastPadmap()[1]);
});

step('⭐ at the edge the octave move is refused, and says so', () => {
    S.customChords[T][1] = [100, 120]; ticks(2);
    pad(1, true);
    octUp();
    assert(eq(S.customChords[T][1], [100, 120]), 'moved past the top: ' + S.customChords[T][1]);
    assert(popup() === 'OUT OF RANGE', 'notice: "' + popup() + '"');
    pad(1, false);
});

step('⭐ Delete + chord pad clears it, says so, and Undo brings it back', () => {
    clearAll();
    S.customChords[T][3] = [60, 63, 67]; ticks(2);
    cc(SC.MoveDelete, 127); pad(3, true); pad(3, false); cc(SC.MoveDelete, 0);
    assert(eq(S.customChords[T][3], []), 'not cleared: ' + S.customChords[T][3]);
    assert(popup() === 'CHORD CLEARED', 'notice: "' + popup() + '"');
    assert(S.liveActiveNotes.size === 0, 'the cleared pad booked notes');
    ticks(3);
    assert(lastPadmap()[3] === '255', 'padmap: ' + lastPadmap()[3]);
    cc(SC.MoveUndo, 127); cc(SC.MoveUndo, 0); ticks(3);
    assert(eq(S.customChords[T][3], [60, 63, 67]), 'undo: ' + S.customChords[T][3]);
    assert(lastPadmap()[3] === '60+63+67', 'padmap after undo: ' + lastPadmap()[3]);
});

step('⭐⭐ hold notes + tap an EMPTY chord pad stores them; a FILLED pad just plays and keeps its chord', () => {
    clearAll(); sets.length = 0;
    pad(8, true); pad(10, true); pad(12, true);      /* C E G held on the upper rows */
    pad(4, true);
    const want = [scalePitch(8), scalePitch(10), scalePitch(12)];
    assert(eq(S.customChords[T][4], want), 'stored: ' + S.customChords[T][4] + ' want ' + want);
    assert(revoices().length === 0, 'a pad that pressed silent was re-voiced');
    assert(padLeds()[4] === SC.White, 'the pad being held is not white');
    pad(4, false);
    assert(eq([...S.liveActiveNotes].sort((x, y) => x - y), want), 'letting go of the chord pad dropped notes still held: ' + [...S.liveActiveNotes]);
    pad(8, false); pad(10, false); pad(12, false); ticks(3);
    assert(lastPadmap()[4] === want.join('+'), 'padmap: ' + lastPadmap()[4]);
    assert(S.liveActiveNotes.size === 0, 'notes left held');
    /* a filled pad: a held melody note must not overwrite it */
    pad(14, true);
    pad(4, true);
    assert(eq(S.customChords[T][4], want), 'a filled chord was overwritten by a held note: ' + S.customChords[T][4]);
    assert(S.liveActiveNotes.has(want[0]) && S.liveActiveNotes.has(scalePitch(14)), 'the chord did not play over the held note');
    pad(4, false); pad(14, false);
    /* more than six held notes: the lowest six */
    S.customChords[T][5] = []; ticks(2);
    for (const i of [8, 9, 10, 11, 12, 13, 14]) pad(i, true);
    pad(5, true);
    assert(eq(S.customChords[T][5], [8, 9, 10, 11, 12, 13].map(scalePitch)), 'seven held: ' + S.customChords[T][5]);
});

step('⭐⭐ Copy + chord pad then another pastes it; Shift + Copy moves it; Undo takes the paste back', () => {
    clearAll();
    S.customChords[T][0] = [60, 64, 67]; S.customChords[T][2] = [50, 57]; ticks(2);
    cc(SC.MoveCopy, 127);
    pad(0, true); pad(0, false);
    assert(popup() === 'COPIED', 'notice: "' + popup() + '"');
    assert(S.liveActiveNotes.size === 0, 'the copied pad booked notes');
    assert(padLeds()[0] === SC.White, 'the copy source is not marked');
    pad(2, true); pad(2, false);
    assert(popup() === 'PASTED', 'notice: "' + popup() + '"');
    assert(eq(S.customChords[T][2], [60, 64, 67]) && eq(S.customChords[T][0], [60, 64, 67]), 'paste: ' + JSON.stringify(S.customChords[T].slice(0, 3)));
    pad(3, true); pad(3, false);
    assert(eq(S.customChords[T][3], [60, 64, 67]), 'a second paste from the same source: ' + S.customChords[T][3]);
    S.customChords[T][3].push(72);
    assert(eq(S.customChords[T][0], [60, 64, 67]), 'a paste shares its notes with the source');
    cc(SC.MoveCopy, 0); ticks(3);
    assert(padLeds()[0] !== SC.White, 'the source stayed marked after Copy was let go');
    assert(lastPadmap()[2] === '60+64+67', 'padmap: ' + lastPadmap()[2]);
    /* undo the last paste only */
    cc(SC.MoveUndo, 127); cc(SC.MoveUndo, 0); ticks(3);
    assert(eq(S.customChords[T][3], []), 'undo of the paste: ' + S.customChords[T][3]);
    /* an empty pad is not a source */
    cc(SC.MoveCopy, 127);
    pad(6, true); pad(6, false);
    assert(!S.copySrc && popup() === 'EMPTY CHORD', 'an empty pad became the copy source: ' + JSON.stringify(S.copySrc) + ' "' + popup() + '"');
    cc(SC.MoveCopy, 0); ticks(60);
    /* move: Shift + Copy */
    cc(49, 127); cc(SC.MoveCopy, 127);
    pad(2, true); pad(2, false);
    assert(popup() === 'CUT', 'notice: "' + popup() + '"');
    pad(7, true); pad(7, false);
    assert(eq(S.customChords[T][7], [60, 64, 67]) && eq(S.customChords[T][2], []), 'move: ' + JSON.stringify([S.customChords[T][2], S.customChords[T][7]]));
    cc(SC.MoveCopy, 0); cc(49, 0); ticks(3);
    cc(SC.MoveUndo, 127); cc(SC.MoveUndo, 0); ticks(3);
    assert(eq(S.customChords[T][7], []) && eq(S.customChords[T][2], [60, 64, 67]), 'undo of the move: ' + JSON.stringify([S.customChords[T][2], S.customChords[T][7]]));
});

step('⭐ chord pads have a colour of their own — never the root pad\'s, on any track colour', () => {
    clearAll();
    S.customChords[T][1] = [60, 64, 67]; ticks(2);
    const L = padLeds();
    assert(L[1] !== L[8], 'a chord pad is the root note pad\'s colour: ' + L[1]);
    assert(L[1] !== L[9] && L[1] !== C.LED_OFF && L[1] !== SC.White, 'a chord pad reads as a plain note / dark / held: ' + L[1]);
    assert(L[0] !== L[1] && L[0] !== C.LED_OFF && L[0] !== L[8] && L[0] !== L[9] && L[0] !== SC.White, 'an empty chord pad is not its own dim colour: ' + L[0]);
    for (const col of C.TRACK_COLORS.concat(C.TRACK_DIM_COLORS)) assert(L[0] !== col, 'the empty-pad colour is a track colour: ' + col);
    for (const col of C.TRACK_COLORS) assert(L[1] !== col, 'the chord colour is a track colour: ' + col);
});

step('⭐ hold a step + tap a chord pad writes the chord into the step, and edits nothing', () => {
    clearAll();
    S.customChords[T][3] = [60, 63, 67]; ticks(2);
    sets.length = 0;
    note(16 + 3, true); ticks(40);
    pad(3, true); pad(3, false);
    ticks(3);
    const w = sets.filter((x) => /^t2_c\d+_step_3_/.test(x[0]));
    assert(w.some((x) => /_toggle$/.test(x[0]) && x[1].split(' ')[0] === '60'), 'no toggle of the first note: ' + JSON.stringify(w));
    assert(w.some((x) => /_set_notes$/.test(x[0]) && x[1] === '60 63 67'), 'no set_notes: ' + JSON.stringify(w));
    /* ...and a scale pad under a held step edits the STEP, not a chord. */
    pad(9, true); pad(9, false);
    assert(eq(S.customChords[T][3], [60, 63, 67]), 'the chord was edited under a held step');
    note(16 + 3, false); ticks(2);
});

step('⭐ a chord held while the layout changes still lets go of its notes', () => {
    clearAll();
    S.customChords[T][1] = [60, 64, 67]; ticks(2);
    pad(1, true);
    assert(S.liveActiveNotes.size === 3, 'setup');
    snd.configRowsForTest(T).find((x) => x.key === 'layout').set(0); ticks(1);
    pad(1, false); ticks(2);
    assert(S.liveActiveNotes.size === 0, 'notes stuck: ' + [...S.liveActiveNotes]);
    snd.configRowsForTest(T).find((x) => x.key === 'layout').set(4); ticks(1);
});

step('⭐ a lost pad map is noticed by its checksum and pushed again (and a good one is left alone)', () => {
    assert(CU.chordPadsOn(T) && S.lastPadmapSig >= 0, 'setup: ' + S.lastPadmapSig);
    const was = globalThis.host_module_get_param;
    const pushes = () => sets.filter((x) => x[0] === 't2_padmap').length;
    try {
        globalThis.host_module_get_param = (k) => (k === 'padmap_sig' ? String(S.lastPadmapSig) : k === 'pad_dispatch_muted' ? '0' : '');
        ticks(12); sets.length = 0; ticks(24);
        assert(pushes() === 0, 'a pad map the engine holds was pushed again ' + pushes() + ' times');
        globalThis.host_module_get_param = (k) => (k === 'padmap_sig' ? String(S.lastPadmapSig + 1) : k === 'pad_dispatch_muted' ? '0' : '');
        ticks(24);
        assert(pushes() > 0, 'a lost pad map was never pushed again');
    } finally { globalThis.host_module_get_param = was; }
});

step('⭐⭐ the sidecar keeps the layout, the chords and the chord octave; a bad file is cleaned; an absent one is empty', () => {
    clearAll();
    S.customChords[T][1] = [60, 64, 67]; S.customChordOctave[T] = 2;
    let written = null;
    const was = globalThis.host_write_file;
    globalThis.host_write_file = (p, s) => { if (/ui-state/.test(p)) written = s; return 0; };
    S.currentSetUuid = S.currentSetUuid || 'test-uuid';
    try { persist.writeSidecar(); } finally { globalThis.host_write_file = was; }
    const j = JSON.parse(written);
    assert(j.v === 9, 'the sidecar version moved');
    assert(j.pcus[T] === 1 && j.pcus[0] === 0, 'pcus ' + JSON.stringify(j.pcus));
    assert(eq(j.cch[T][1], [60, 64, 67]) && j.cch[0] === null, 'cch ' + JSON.stringify(j.cch));
    assert(j.cco[T] === 2, 'cco ' + JSON.stringify(j.cco));
    CU.restoreCustomSidecar(null);
    assert(!S.padLayoutCustom[T] && S.customChords[T] === null && S.customChordOctave[T] === 0, 'absent fields left state behind');
    CU.restoreCustomSidecar(j);
    assert(S.padLayoutCustom[T] && eq(S.customChords[T][1], [60, 64, 67]) && S.customChordOctave[T] === 2, 'round trip');
    j.cch[T] = [[67, 60, 60, 200, -1, 'x', 1.5], 'junk', [1, 2, 3, 4, 5, 6, 7, 8]]; j.cco[T] = 9;
    CU.restoreCustomSidecar(j);
    assert(eq(S.customChords[T][0], [60, 67]), 'cleaned: ' + JSON.stringify(S.customChords[T][0]));
    assert(eq(S.customChords[T][1], []) && S.customChords[T][2].length === 6 && S.customChords[T].length === 8, 'shape: ' + JSON.stringify(S.customChords[T]));
    assert(S.customChordOctave[T] === 0, 'octave not clamped: ' + S.customChordOctave[T]);
});

step('⭐ a template keeps the layout and drops the chords', () => {
    S.customChords[T][1] = [60, 64, 67];
    const tpl = persist.templateSidecar();
    assert(tpl.pcus[T] === 1, 'pcus ' + JSON.stringify(tpl.pcus));
    assert(tpl.cch.every((x) => x === null) && tpl.cco.every((x) => x === 0), 'cch/cco ' + JSON.stringify([tpl.cch, tpl.cco]));
    const fresh = persist.freshSidecar();
    assert(fresh.pcus.every((x) => x === 0) && fresh.cch.every((x) => x === null), 'a fresh project is on Custom or has chords');
});

if (failed) { console.log('FAIL: custom chord layout'); process.exit(1); }
console.log('PASS: the Custom chord layout');
}
main().catch((e) => { console.error(e); process.exit(1); });
