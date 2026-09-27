/* tests/js/test_piano_layout.mjs — the melodic PIANO pad layout (Josh,
 * 2026-09-26): "Add a piano pad mode to melodic tracks (alongside chord,
 * in-scale, chromatic) that lays the pads out like to 2 piano octaves. Top 2
 * pad rows are higher octave, bottom two are lower." Black keys "between the
 * whites" (C# over D). And: "chord mode instructions and confirmation should go
 * away when you switch to a different pad mode."
 *
 * Through the real gestures (Shift + Step 8, the TRACK CONFIG Layout row); the
 * notes are read off the tN_padmap the engine is sent, the colours off the LED
 * packets. */
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
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.text_width = (t) => String(t).length * 6;


const ledState = {};
globalThis.move_midi_internal_send = (pkt) => { ledState[pkt[2]] = pkt[3]; return true; };

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const persist = await import('../../ui/ui_persistence.mjs');
const leds = await import('../../ui/ui_leds.mjs');
const snd = await import('../../ui/ui_sound.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; S.trackPadMode[i] = C.PAD_MODE_MELODIC_SCALE; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: C.BANKS.length }, () => new Array(8).fill(0)));
S.midiInChannel = 0; S.padKey = 0; S.padScale = 0; S.dspInboundEnabled = true;   /* C major */
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
ticks(3);
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
const note = (n, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 100 : 0]));
const shiftStep8 = () => { cc(49, 127); note(16 + 7, true); note(16 + 7, false); cc(49, 0); ticks(1); };
const lastPadmap = () => {
    for (let i = sets.length - 1; i >= 0; i--) if (sets[i][0] === 't2_padmap') return sets[i][1].split(' ');
    return null;
};
const oct = () => (S.trackOctave[2] | 0) * 12;
const layout = () => S.padLayoutChord[2] ? 'chord' : S.padLayoutPiano[2] ? 'piano' : S.padLayoutChromatic[2] ? 'chrom' : 'scale';
const padLeds = () => { leds.invalidateLEDCache(); leds.updateTrackLEDs(); const o = []; for (let i = 0; i < 32; i++) o.push(ledState[C.TRACK_PAD_BASE + i]); return o; };

step('⭐ Shift + Step 8 walks Scale → Chrom → Piano → Chord → Scale', () => {
    const seen = [layout()];
    for (let i = 0; i < 4; i++) { shiftStep8(); seen.push(layout()); if (S.chordPopupOpen) { cc(3, 127); cc(3, 0); ticks(2); } }
    assert(JSON.stringify(seen) === JSON.stringify(['scale', 'chrom', 'piano', 'chord', 'scale']), 'walk: ' + seen);
});

step('⭐⭐ the Piano pads: two octaves from C, white rows C..C, black keys between the whites, gaps silent; top two rows an octave up', () => {
    shiftStep8(); shiftStep8();
    assert(layout() === 'piano', 'not on Piano: ' + layout());
    ticks(2);
    const pm = lastPadmap().slice(0, 32);
    const base = (S.padOctave[2] | 0) * 12 + oct();
    const W = [0, 2, 4, 5, 7, 9, 11, 12], B = [-1, 1, 3, -1, 6, 8, 10, -1];
    for (let i = 0; i < 32; i++) {
        const col = i % 8, row = Math.floor(i / 8);
        const st = (row & 1) ? B[col] : W[col];
        const want = st < 0 ? '255' : String(base + (row >= 2 ? 12 : 0) + st);
        assert(pm[i] === want, 'pad ' + i + ' (row ' + row + ' col ' + col + '): ' + pm[i] + ' want ' + want);
    }
});

step('⭐ Piano colours: root in the track colour, in-scale keys brighter than out-of-scale, gaps dark', () => {
    const L = padLeds();
    const root = L[0], inScale = L[1], outScale = L[9], gap = L[8];   /* C, D, C#, the pad over the first C */
    assert(root === leds.trackColor(2), 'root C: ' + root);
    assert(inScale !== outScale && inScale !== gap && outScale !== gap, 'in/out/gap indistinct: ' + [inScale, outScale, gap]);
    assert(L[11] === gap && L[15] === gap, 'the other gaps (over F, over the last C): ' + [L[11], L[15]]);
    assert(outScale !== 0, 'an out-of-scale key is dark — the keyboard must stay readable');
});

step('⭐ the Layout row reads Piano and sets it; Scale from the row clears it', () => {
    const rows = snd.configRowsForTest ? snd.configRowsForTest(2) : null;
    const r = rows && rows.find((x) => x.key === 'layout');
    if (!r) throw new Error('no configRowsForTest export or no layout row');
    assert(r.fmt(r.get()) === 'Piano', 'row reads ' + r.fmt(r.get()));
    assert(JSON.stringify(r.opts) === JSON.stringify([0, 1, 3, 2]), 'options ' + r.opts);
    r.set(0); ticks(1);
    assert(layout() === 'scale', 'row Scale: ' + layout());
    r.set(3); ticks(1);
    assert(layout() === 'piano', 'row Piano: ' + layout());
});

step('⭐ the sidecar keeps the Piano layout per track', () => {
    let written = null;
    const was = globalThis.host_write_file;
    globalThis.host_write_file = (p, s) => { if (/ui-state/.test(p)) written = s; return 0; };
    S.currentSetUuid = S.currentSetUuid || 'test-uuid';
    try { persist.writeSidecar(); } finally { globalThis.host_write_file = was; }
    assert(written, 'no sidecar written');
    const j = JSON.parse(written);
    assert(Array.isArray(j.ppno) && j.ppno[2] === 1 && j.ppno[1] === 0, 'ppno ' + JSON.stringify(j.ppno));
});

step('⭐ leaving Chord takes its explainer with it — by Shift + Step 8 and by the Layout row', () => {
    shiftStep8();
    assert(layout() === 'chord' && S.chordPopupOpen, 'setup: Chord with its card');
    shiftStep8();
    assert(layout() === 'scale', 'left Chord: ' + layout());
    assert(!S.chordPopupOpen, 'the Chord card stayed up after leaving Chord');
    const r = snd.configRowsForTest(2).find((x) => x.key === 'layout');
    r.set(2); ticks(1);
    assert(S.chordPopupOpen, 'setup: the row onto Chord raises the card');
    r.set(3); ticks(1);
    assert(!S.chordPopupOpen, 'the card stayed up after the Layout row left Chord');
    r.set(0); ticks(1);
});

if (failed) { console.log('FAIL: piano layout'); process.exit(1); }
console.log('PASS: the Piano layout, and the Chord card leaves with Chord');
}
main().catch((e) => { console.error(e); process.exit(1); });
