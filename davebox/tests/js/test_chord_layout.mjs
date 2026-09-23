/* tests/js/test_chord_layout.mjs — the melodic Chord layout.
 *
 * Two halves:
 *   1. THE MUSIC (ui_chord_model.mjs). Every slot in every key and scale stays
 *      in key; the default palette spells I ii iii IV V vi vii° I; stacks,
 *      inversions, spread, bass, Smooth and the strum/scale rows.
 *   2. THE SURFACE, through the real handlers: Shift + step 8 walks Scale →
 *      Chrom → Chord and raises the explainer; the pad map the ENGINE receives
 *      carries whole chords; a slot press shows "[vi · AMIN]"; a held modifier
 *      changes the next chord; a tap on a held chord re-voices it in place;
 *      hold a slot + knob edits it; Select mode; the sidecar round trip.
 */
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
    'set_pixel', 'flush_display', 'move_midi_internal_send', 'move_midi_inject_to_move', 'set_led',
    'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
    'host_ext_midi_remap_enable', 'host_send_midi'])
    globalThis[fn] = () => 0;
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
const M = await import('../../ui/ui_chord_model.mjs');
const { SCALE_INTERVALS } = await import('../../ui/ui_pure.mjs');

/* ---------------- 1. the music ---------------- */
const set0 = M.defaultChordSettings();
const chordAt = (key, scale, slot, extra) => M.slotChord(Object.assign(
    { key, scale, root: 48 + key, slot, settings: set0 }, extra || {}));

step('⭐ property: every slot, every stack, inversion, spread and octave, in every key and scale, stays IN KEY', () => {
    let n = 0; const errs = [];
    for (let scale = 0; scale < SCALE_INTERVALS.length; scale++) for (let key = 0; key < 12; key++) {
        const inKey = new Set(SCALE_INTERVALS[scale].map((i) => (i + key) % 12));
        for (let deg = -2; deg < 10; deg++) for (let stack = 0; stack < M.STACKS.length; stack++)
        for (const inv of [-2, 0, 1, 3]) for (const spread of [0, 1]) for (const bass of [0, 1, 2, 3]) {
            const c = chordAt(key, scale, { deg, stack, inv, spread, bass, oct: 0 });
            n++;
            if (!c.notes.length) { errs.push('empty'); continue; }
            if (c.notes.length > M.PAD_CHORD_MAX) errs.push(c.notes.length + ' notes');
            for (const p of c.notes) if (!inKey.has(p % 12) && errs.length < 6)
                errs.push(`scale ${scale} key ${key} deg ${deg} ${M.STACKS[stack]}: ${p} out of key`);
            if (!eq(c.notes, [...c.notes].sort((a, b) => a - b))) errs.push('not ascending');
        }
    }
    assert(!errs.length, errs.slice(0, 6).join('; '));
    assert(n > 50000, 'only ' + n + ' chords checked');
});
step('the default palette in C major is I ii iii IV V vi vii° I, by name and numeral', () => {
    const got = [];
    for (let k = 0; k < 8; k++) { const c = chordAt(0, 0, M.defaultSlot(k)); got.push(c.numeral + ':' + c.name); }
    assert(eq(got, ['I:C', 'ii:DMIN', 'iii:EMIN', 'IV:F', 'V:G', 'vi:AMIN', 'vii°:BDIM', 'I:C']), got.join(' '));
});
step('in A minor the numerals follow the scale: i ii° III iv v VI VII', () => {
    const got = [];
    for (let k = 0; k < 7; k++) got.push(chordAt(9, 1, M.defaultSlot(k)).numeral);
    assert(eq(got, ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']), got.join(' '));
});
step('stacks name what they build: V7 = G7, ii7 = DMIN7, I9 = CMAJ9, vi + 7 held = AMIN7', () => {
    assert(chordAt(0, 0, { deg: 4, stack: 1, inv: 0, spread: 0, bass: 0, oct: 0 }).name === 'G7', 'V7');
    assert(chordAt(0, 0, { deg: 1, stack: 1, inv: 0, spread: 0, bass: 0, oct: 0 }).name === 'DMIN7', 'ii7');
    assert(chordAt(0, 0, { deg: 0, stack: 2, inv: 0, spread: 0, bass: 0, oct: 0 }).name === 'CMAJ9', 'I9');
    assert(chordAt(0, 0, M.defaultSlot(5), { mods: [0] }).name === 'AMIN7', 'vi + held 7');
});
step('a stack with no in-key form plays the plain chord and says so: SUS4 on IV of C major', () => {
    const c = chordAt(0, 0, { deg: 3, stack: 4, inv: 0, spread: 0, bass: 0, oct: 0 });
    assert(c.name === 'F' && eq(c.plain, ['SUS4']), c.name + ' ' + JSON.stringify(c.plain));
    const d = chordAt(0, 0, { deg: 1, stack: 4, inv: 0, spread: 0, bass: 0, oct: 0 });
    assert(d.name === 'DSUS4' && !d.plain.length, 'SUS4 on ii exists: ' + d.name);
});
step('the known root names an inversion: vi7 first inversion is AMIN7/C, not C6', () => {
    const c = chordAt(0, 0, { deg: 5, stack: 1, inv: 1, spread: 0, bass: 0, oct: 0 });
    assert(c.name === 'AMIN7/C', c.name);
});
step('inversions walk one note at a time, up and down', () => {
    assert(eq(M.invert([48, 52, 55], 1), [52, 55, 60]), 'up one');
    assert(eq(M.invert([48, 52, 55], 3), [60, 64, 67]), 'up an octave');
    assert(eq(M.invert([48, 52, 55], -1), [43, 48, 52]), 'down one');
});
step('Smooth picks the voicing nearest the last chord (C → F lands as F/C)', () => {
    const c = chordAt(0, 0, M.defaultSlot(3), { settings: Object.assign({}, set0, { smooth: 1 }), prev: [48, 52, 55] });
    assert(eq(c.notes, [48, 53, 57]), JSON.stringify(c.notes));
});
step('bass: the slot\'s own tone below the chord, else the bank\'s root', () => {
    const c = chordAt(0, 0, { deg: 5, stack: 0, inv: 0, spread: 0, bass: 2, oct: 0 });
    assert(c.notes[0] === 48 && c.name === 'AMIN/C', c.notes + ' ' + c.name);
    const d = chordAt(0, 0, M.defaultSlot(4), { settings: Object.assign({}, set0, { bass: 1, bassOct: 2 }) });
    assert(d.notes[0] === 55 - 24, 'two octaves below: ' + d.notes);
});
step('the strum row is the chord\'s own notes rising; the scale row is the scale', () => {
    assert(eq(M.strumRow([57, 60, 64], 48), [48, 52, 57, 60, 64, 69, 72, 76]), M.strumRow([57, 60, 64], 48).join(' '));
    assert(eq(M.scaleRow(0, 60), [60, 62, 64, 65, 67, 69, 71, 72]), 'C major from C3');
});

/* ---------------- 2. the surface ---------------- */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, TRACK_PAD_BASE, BANK_CHORD } = await import('../../ui/ui_constants.mjs');
const render = await import('../../ui/ui_render.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const CP = await import('../../ui/ui_chord_pads.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
globalThis.__dm = await import('../../ui/ui_drummodel.mjs');
globalThis.__pure = await import('../../ui/ui_pure.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.midiInChannel = 0; S.padKey = 0; S.padScale = 0; S.dspInboundEnabled = true;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);

function screenText() {
    const out = [];
    fonts.setKitTextTrace((t) => out.push(t));
    try { globalThis.clear_screen(); render.drawUI(); } finally { fonts.setKitTextTrace(null); }
    return out;
}
const bracketed = () => screenText().filter((t) => /^\[.*\]$/.test(t) && t !== '[--]');
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
const note = (n, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 100 : 0]));
const pad = (i, on) => note(TRACK_PAD_BASE + i, on);
const knob = (k, d) => { note(k, true); cc(71 + k, d > 0 ? 10 : 118); };
const knobUp = (k) => note(k, false);
/* The last tN_padmap the ENGINE was sent, as 35 tokens. */
const lastPadmap = () => {
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i][0] === 't2_padmap') return sets[i][1].split(' ');
    return null;
};
const oct = () => (S.trackOctave[2] | 0) * 12;
const shiftStep8 = () => { cc(49, 127); note(16 + 7, true); note(16 + 7, false); cc(49, 0); ticks(1); };
afterStep = () => {
    for (let i = 0; i < 32; i++) pad(i, false);
    ticks(2);
};

step('control: a fresh track is on the Scale layout, one note per pad', () => {
    assert(!S.padLayoutChord[2] && !S.padLayoutChromatic[2], 'fresh track not on Scale');
    const pm = lastPadmap();
    assert(pm && pm.slice(0, 32).every((t) => t.indexOf('+') < 0), 'a plain map carries no chords');
});
step('⭐ Shift + step 8 walks Scale → Chrom → Chord, and landing on Chord raises the explainer', () => {
    shiftStep8();
    assert(S.padLayoutChromatic[2] && !S.padLayoutChord[2], 'first press: Chrom');
    assert(!S.chordPopupOpen, 'no explainer on Chrom');
    shiftStep8();
    assert(S.padLayoutChord[2], 'second press: Chord');
    assert(S.chordPopupOpen, 'the explainer is up');
    const t = screenText();
    assert(t.some((s) => s === 'CHORD MODE'), 'explainer title on screen: ' + JSON.stringify(t.slice(0, 8)));
    assert(t.some((s) => /STRUM/.test(s)), 'it explains the strum row');
});
step('⭐ while the explainer is up the pads are muted in the ENGINE (padmap mute token) and do nothing', () => {
    ticks(2);
    const pm = lastPadmap();
    assert(pm[32] === '1', 'mute token ' + pm[32]);
    pad(5, true); ticks(1);
    assert(S.liveActiveNotes.size === 0, 'a pad under the explainer played');
    pad(5, false);
});
step('⭐ jog click is OK: the explainer closes and the engine gets whole chords on the bottom row', () => {
    cc(3, 127); cc(3, 0); ticks(2);
    assert(!S.chordPopupOpen, 'still up');
    const pm = lastPadmap();
    assert(pm[32] === '0', 'pads still muted after OK');
    const want = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => M.slotChord({ key: 0, scale: 0, root: (S.padOctave[2] | 0) * 12,
        slot: M.defaultSlot(k), settings: set0 }).notes.map((p) => p + oct()).join('+'));
    assert(eq(pm.slice(0, 8), want), 'slots ' + pm.slice(0, 8).join(' ') + ' want ' + want.join(' '));
    assert(pm.slice(8, 16).every((t) => t === '255'), 'the modifier row is silent in the engine: ' + pm.slice(8, 16));
    assert(pm.slice(24, 32).every((t) => t.indexOf('+') < 0 && t !== '255'), 'the scale row is one note a pad');
});
step('⭐ a slot press: the held notes are the chord, the screen reads [vi · AMIN]', () => {
    pad(5, true); ticks(1);
    const pcs = [...S.liveActiveNotes].map((p) => p % 12).sort((a, b) => a - b);
    assert(eq(pcs, [0, 4, 9]), 'held ' + [...S.liveActiveNotes]);
    const b = bracketed();
    assert(eq(b, ['[vi · AMIN]']), JSON.stringify(b));
    pad(5, false); ticks(1);
    assert(S.liveActiveNotes.size === 0, 'released, still held: ' + [...S.liveActiveNotes]);
    assert(bracketed().length === 0, 'indicator left behind');
});
step('⭐ the strum row follows the last chord — even after release — on the next padmap push', () => {
    pad(5, true); pad(5, false); ticks(2);
    const pm = lastPadmap();
    const strum = pm.slice(16, 24).map(Number);
    assert(strum.every((p) => [0, 4, 9].indexOf(p % 12) >= 0), 'strum row ' + strum);
    assert(eq(strum, [...strum].sort((a, b) => a - b)), 'rising');
});
step('⭐ a strum pad re-striking a held chord note does not drop it from the held notes when it lets go', () => {
    pad(5, true); ticks(1);
    const pm = lastPadmap();
    const strumA = Number(pm[16]);
    assert(S.liveActiveNotes.has(strumA) || [...S.liveActiveNotes].some((p) => p % 12 === strumA % 12), 'setup');
    const shared = [...S.liveActiveNotes].find((p) => pm.slice(16, 24).map(Number).indexOf(p) >= 0);
    assert(shared !== undefined, 'no strum pad shares a pitch with the held chord');
    const si = 16 + pm.slice(16, 24).map(Number).indexOf(shared);
    pad(si, true); pad(si, false); ticks(1);
    assert(S.liveActiveNotes.has(shared), 'the chord still holds ' + shared + ' but it left the held notes');
    pad(5, false); ticks(1);
    assert(!S.liveActiveNotes.has(shared), 'the last holder let go and it is still held');
});
step('⭐ HOLD a modifier (7) and the engine\'s slots become sevenths before the slot is pressed', () => {
    sets.length = 0;
    pad(8, true);
    const pm = lastPadmap();
    assert(pm, 'the modifier did not push a padmap from its own handler');
    const i7 = pm[0].split('+').map((p) => Number(p) % 12).sort((a, b) => a - b);
    assert(eq(i7, [0, 4, 7, 11]), 'I with 7 held: ' + pm[0]);
    pad(0, true); ticks(1);
    assert(eq(bracketed(), ['[I · CMAJ7]']), JSON.stringify(bracketed()));
    pad(0, false); pad(8, false); ticks(2);
    const back = lastPadmap()[0].split('+').length;
    assert(back === 3, 'let go of 7: the slot is a triad again (' + lastPadmap()[0] + ')');
});
step('⭐ a stack pressed WHILE a chord is held re-voices it in place (tN_chord_revoice), and back on release', () => {
    pad(3, true); ticks(1);                               /* IV = F */
    sets.length = 0;
    pad(8, true);                                         /* + 7 */
    const rv = sets.filter((s) => s[0] === 't2_chord_revoice');
    assert(rv.length === 1, 'revoice sent: ' + JSON.stringify(sets));
    const [pd, ps] = rv[0][1].split(' ');
    assert(pd === '3', 'revoice names the held pad: ' + pd);
    assert(eq(ps.split('+').map((p) => Number(p) % 12).sort((a, b) => a - b), [0, 4, 5, 9]), 'FMAJ7: ' + ps);
    assert(eq(bracketed(), ['[IV · FMAJ7]']), JSON.stringify(bracketed()));
    assert([...S.liveActiveNotes].some((p) => p % 12 === 4), 'the added 7th is held');
    sets.length = 0;
    pad(8, false);
    const rv2 = sets.filter((s) => s[0] === 't2_chord_revoice');
    assert(rv2.length === 1 && rv2[0][1].split(' ')[1].split('+').length === 3, 'back to the triad: ' + JSON.stringify(rv2));
    assert(![...S.liveActiveNotes].some((p) => p % 12 === 4), 'the 7th left the held notes');
    pad(3, false);
});
step('⭐ Inv+ tapped on a held chord walks it one note, and each tap walks further', () => {
    pad(0, true); ticks(1);
    const start = CP.padPitches(0, oct());
    sets.length = 0;
    pad(15, true); pad(15, false);
    let rv = sets.filter((s) => s[0] === 't2_chord_revoice').map((s) => s[1].split(' ')[1]);
    assert(rv.length === 1 && eq(rv[0].split('+').map(Number), M.invert(start, 1)), 'one tap: ' + rv + ' from ' + start);
    sets.length = 0;
    pad(15, true); pad(15, false);
    rv = sets.filter((s) => s[0] === 't2_chord_revoice').map((s) => s[1].split(' ')[1]);
    assert(rv.length === 1 && eq(rv[0].split('+').map(Number), M.invert(start, 2)), 'second tap: ' + rv);
    assert(bracketed()[0] === '[I · C/G]', JSON.stringify(bracketed()));
    pad(0, false); ticks(1);
    assert(S.liveActiveNotes.size === 0, 'the walked notes were released: ' + [...S.liveActiveNotes]);
});
step('⭐ off the CHORD bank, a held chord leaves the knobs to their bank', () => {
    S.activeBank = 1; S.trackActiveBank[2] = 1;                /* NOTE FX */
    const before = JSON.stringify(S.chordPalette[2][4]);
    pad(4, true); ticks(1);
    knob(1, +1); knobUp(1); ticks(1);
    assert(JSON.stringify(S.chordPalette[2][4]) === before, 'a held chord was edited from NOTE FX');
    assert(!screenText().some((x) => x === 'V · G'), 'the slot card showed off the CHORD bank');
    pad(4, false); ticks(1);
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('⭐ on the CHORD bank, holding a chord shows its settings at once; K2 makes it a seventh and it sounds', () => {
    S.activeBank = BANK_CHORD; S.trackActiveBank[2] = BANK_CHORD;
    pad(4, true); ticks(1);
    assert(screenText().some((x) => x === 'V · G'), 'no slot card on hold, before any knob');
    sets.length = 0;
    knob(1, +1); ticks(1);
    const t = screenText();
    assert(t.some((s) => /V · G7/.test(s)), 'card title: ' + JSON.stringify(t.slice(0, 6)));
    assert(t.some((s) => s === '7'), 'Stack cell reads 7');
    assert(S.chordPalette[2][4].stack === 1, 'saved stack ' + S.chordPalette[2][4].stack);
    assert(sets.some((s) => s[0] === 't2_chord_revoice'), 'the held chord did not sound the edit');
    knobUp(1); pad(4, false); ticks(2);
    assert(lastPadmap()[4].split('+').length === 4, 'the next press plays V7: ' + lastPadmap()[4]);
    assert(!screenText().some((s) => /V · G7/.test(s)), 'the card outlived the hold');
    /* K8 resets it. */
    pad(4, true); knob(7, +1); knobUp(7); pad(4, false); ticks(2);
    assert(S.chordPalette[2][4].stack === 0 && lastPadmap()[4].split('+').length === 3, 'reset');
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('the CHORD bank sits on this track\'s walk, after LIVE ARP; Slots → Select silences the slots', () => {
    S.activeBank = BANK_CHORD; S.trackActiveBank[2] = BANK_CHORD;
    knob(6, +1); knobUp(6); ticks(2);
    assert(S.chordSettings[2].select === 1, 'Select not set');
    const pm = lastPadmap();
    assert(pm.slice(0, 8).every((t) => t === '255'), 'Select: the engine must not sound the slots: ' + pm.slice(0, 8));
    pad(5, true); ticks(1);
    assert(S.liveActiveNotes.size === 0, 'a Select slot sounded');
    assert(eq(bracketed(), []) || bracketed()[0] === '[vi · AMIN]', 'held select slot: ' + bracketed());
    pad(5, false); ticks(2);
    assert(eq(bracketed(), ['[vi · AMIN]']), 'Select, nothing sounding: the selected chord shows: ' + JSON.stringify(bracketed()));
    const strum = lastPadmap().slice(16, 24).map(Number);
    assert(strum.every((p) => [0, 4, 9].indexOf(p % 12) >= 0), 'the strum row follows the selection: ' + strum);
    knob(6, -1); knobUp(6); ticks(2);
    assert(S.chordSettings[2].select === 0 && lastPadmap()[0].indexOf('+') > 0, 'back to Play');
    S.activeBank = 0; S.trackActiveBank[2] = 0;
});
step('⭐ the sidecar keeps the layout and the palette, and a project without them restores plain', () => {
    S.chordPalette[2][6].stack = 1; S.chordSettings[2].bass = 1;
    let written = null;
    const was = globalThis.host_write_file;
    globalThis.host_write_file = (p, s) => { if (/ui-state/.test(p)) written = s; return 0; };
    S.currentSetUuid = S.currentSetUuid || 'test-uuid';
    try { persist.writeSidecar(); } finally { globalThis.host_write_file = was; }
    assert(written, 'no sidecar written');
    const js = JSON.parse(written);
    assert(js.pchd && js.pchd[2] === 1, 'pchd ' + JSON.stringify(js.pchd));
    assert(js.chd && js.chd[2] && js.chd[2].p[6][1] === 1 && js.chd[2].s.bass === 1, 'chd ' + JSON.stringify(js.chd && js.chd[2]));
    assert(js.chd[0] === null, 'a track never on Chord saves nothing');
    CP.restoreChordSidecar(null);
    assert(S.chordPalette[2] === undefined, 'absent chd → no palette');
    CP.restoreChordSidecar(js.chd);
    assert(S.chordPalette[2][6].stack === 1 && S.chordSettings[2].bass === 1, 'round trip');
    S.chordPalette[2][6].stack = 0; S.chordSettings[2].bass = 0;
});
step('⭐ recording: a re-voice books the note it adds and ends the note it drops', () => {
    S.recordArmed = true; S.recordArmedTrack = 2;
    S._recNoteOns.length = 0; S._recNoteOffs.length = 0;
    pad(0, true); ticks(0);
    const start = CP.padPitches(0, oct());
    const ons0 = S._recNoteOns.map((e) => e.pitch);
    assert(start.every((p) => ons0.indexOf(p) >= 0), 'the chord press was not recorded: ' + ons0);
    S._recNoteOns.length = 0;
    pad(15, true); pad(15, false);                       /* Inv+: C E G → E G C' */
    const ons = S._recNoteOns.map((e) => e.pitch), offs = S._recNoteOffs.map((e) => e.pitch);
    assert(eq(ons, [start[0] + 12]), 'the added note was not recorded: ' + ons);
    assert(offs.indexOf(start[0]) >= 0, 'the dropped note was not ended: ' + offs);
    pad(0, false);
    S.recordArmed = false; S._recNoteOns.length = 0; S._recNoteOffs.length = 0;
});
step('⭐ recording: a strum pad re-striking a held chord note does not end its recording', () => {
    S.recordArmed = true; S.recordArmedTrack = 2;
    pad(5, true); ticks(1);
    const pm = lastPadmap();
    const shared = [...S.liveActiveNotes].find((p) => pm.slice(16, 24).map(Number).indexOf(p) >= 0);
    const si = 16 + pm.slice(16, 24).map(Number).indexOf(shared);
    S._recNoteOffs.length = 0;
    pad(si, true); pad(si, false);
    assert(S._recNoteOffs.every((e) => e.pitch !== shared), 'the strum release ended ' + shared + ' while the chord holds it');
    pad(5, false);
    assert(S._recNoteOffs.some((e) => e.pitch === shared), 'the last holder did not end it');
    S.recordArmed = false; S._recNoteOns.length = 0; S._recNoteOffs.length = 0;
});
step('⭐ a held chord released AFTER a layout switch still leaves the held notes', () => {
    pad(3, true); ticks(1);
    assert(S.liveActiveNotes.size === 3, 'setup');
    CP.setChordLayout(2, false); ticks(1);               /* the layout changed under the finger */
    pad(3, false); ticks(1);
    assert(S.liveActiveNotes.size === 0, 'stranded: ' + [...S.liveActiveNotes]);
    CP.setChordLayout(2, true); CP.closeChordPopup(); ticks(2);
});
step('Inv held for the press, let go, then tapped: the walk goes on from the pressed voicing', () => {
    const start = CP.padPitches(0, oct());
    pad(15, true); ticks(1);                              /* Inv+ held: the map is inverted */
    pad(0, true); pad(15, false);
    sets.length = 0;
    pad(15, true); pad(15, false);
    const rv = sets.filter((x) => x[0] === 't2_chord_revoice').map((x) => x[1].split(' ')[1]);
    assert(rv.length === 1 && eq(rv[0].split('+').map(Number), M.invert(start, 2)), 'walked to ' + rv + ' from ' + start);
    pad(0, false); ticks(2);
});
step('the padmap checksum matches the engine\'s arithmetic (the numbers test_chord_pads.c pins)', () => {
    const dm = globalThis.__dm;
    assert(dm.padmapSig('60+64+67 57+60+64 72 73 74 75 76 77 67 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101 0 0 0') === 2088178764, 'chord map');
    assert(dm.padmapSig(new Array(32).fill('255').join(' ')) === 831651072, 'all unmapped');
});
step('⭐ a LOST padmap push heals: the tick reads the engine\'s checksum and re-pushes on a mismatch', () => {
    ticks(10);
    const was = globalThis.host_module_get_param;
    let asked = 0;
    globalThis.host_module_get_param = (k) => { if (k === 'padmap_sig') { asked++; return '12345'; } return was(k); };
    sets.length = 0;
    try { ticks(10); } finally { globalThis.host_module_get_param = was; }
    assert(asked > 0, 'the tick never asked the engine');
    assert(sets.some((x) => x[0] === 't2_padmap'), 'a mismatch did not re-push the map');
    /* CONTROL: agreeing checksums push nothing. */
    /* (the muted-flag heal beside it must agree too, or IT re-pushes) */
    globalThis.host_module_get_param = (k) => (k === 'padmap_sig' ? String(S.lastPadmapSig)
        : k === 'pad_dispatch_muted' ? '0' : was(k));
    sets.length = 0;
    try { ticks(10); } finally { globalThis.host_module_get_param = was; }
    assert(!sets.some((x) => x[0] === 't2_padmap'), 'a matching checksum re-pushed anyway: ' + sets.length);
});
step('⭐ the CHORD bank is on the jog walk ONLY of a track on the Chord layout', () => {
    const pure = globalThis.__pure;
    assert(pure.bankCycleForMode(0, 2).indexOf(BANK_CHORD) >= 0, 'missing on the Chord track');
    assert(pure.bankCycleForMode(0, 3).indexOf(BANK_CHORD) < 0, 'on the walk of a Scale track');
});
step('Shift + step 8 again leaves Chord for Scale; the map is plain again', () => {
    S.activeBank = BANK_CHORD; S.trackActiveBank[2] = BANK_CHORD;
    shiftStep8();
    assert(!S.padLayoutChord[2] && !S.padLayoutChromatic[2], 'not back on Scale');
    assert(S.activeBank !== BANK_CHORD, 'left on the CHORD bank of a track without the layout');
    const pm = lastPadmap();
    assert(pm.slice(0, 32).every((t) => t.indexOf('+') < 0), 'chords left in the map');
});

if (failed) process.exit(1);
console.log('test_chord_layout: all ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
