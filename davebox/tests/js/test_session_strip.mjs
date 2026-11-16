import './_bulk_get_stub.mjs';
/* tests/js/test_session_strip.mjs — THE CHANNEL STRIP in Session View (Josh,
 * 2026-11-15: "propose 2 new mixer banks: EQ, and Compress both on the 2nd
 * column. and move the FX column over to the 4th column" · "EQ is 4 pages -
 * Low, Mid, Mid Freq, High" · "just jog to switch pages" · the EQ curve pop-up
 * "when any of those are adjusted" · gain reduction "a point that moves on the
 * knob itself").
 *
 * Through the real entry points: the map pads (bankMapPadTap), the jog and the
 * knobs (onMidiMessageInternal), the tick that owns the engine reads/writes. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const reads = [], writes = [];
const PV = {
    'move_fx:2:eq_low': '-3.000', 'move_fx:2:strip': '-3.00 2.00 0.5000 0.00 0.0000',
    'slot:eq_low': '0.000', 'slot:strip': '0.00 0.00 0.5000 0.00 0.0000',
    'strip_gr:s4': '-6.00', 'strip_gr:m2': '-1.50',
};
globalThis.host_system_cmd = () => 0;
globalThis.host_ui_publish = () => false;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return PV[key] !== undefined ? PV[key] : ''; };
globalThis.shadow_set_param = (slot, key, val) => { writes.push(key + '=' + val); PV[key] = String(val); };
/* the bulk read, as the host answers it (count + length-prefixed items) */
function dec(blob) { const out = []; if (!blob) return out; const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
const bulks = [];
globalThis.shadow_get_params = (slot, marker, blob) => {
    const ks = dec(blob); bulks.push(ks);
    let out = ks.length + '\n';
    for (const k of ks) { const v = PV[k]; out += v === undefined ? '?\n' : v.length + '\n' + v; }
    return out;
};
globalThis.shadow_set_params = () => true;
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.draw_line = () => {}; globalThis.set_pixel = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {}; globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { NUM_TRACKS } = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const eng = await import('../../ui/ui_engine.mjs');
const { SESS_PAD_MAP, bankMapPadForCell } = await import('../../ui/ui_pure.mjs');
const cc = await import('../../ui/ui_input_cc.mjs');
const render = await import('../../ui/ui_render.mjs');
const kitm = await import('../../ui/ui_movy.mjs');

const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const ticks = (n) => { for (let i = 0; i < n; i++) tickmod._tickImpl(); };
const jog = (dir) => midi(0xB0, 14, dir > 0 ? 1 : 127);
const knob = (k, n) => { for (let i = 0; i < Math.abs(n); i++) midi(0xB0, 71 + k, n > 0 ? 1 : 127); };
const mapTap = (col, row) => { S.bankMapKind = 'session'; cc.bankMapPadTap(bankMapPadForCell(col, row)); };
const mode = () => eng.SESS_KNOB_MODES[S.sessKnobMode];

step('setup: Session View, track 1 on Move bus 2, track 5 a Schwung chain', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.sessionView = true; S.ledInitComplete = true;
    for (let t = 0; t < NUM_TRACKS; t++) { S.trackRoute[t] = 1; S.trackChannel[t] = 4; }
    S.trackChannel[0] = 2; S.trackRoute[4] = 0;
    ticks(64);
    assert(S.sessVolBus[0] === 2 && S.sessVolBus[4] === 0, 'routes resolved');
});

step('the map: the strip in the SECOND column (EQ over COMPRESS), FX moved to the FOURTH', () => {
    assert(SESS_PAD_MAP.strip.col === 1 && SESS_PAD_MAP.fx.col === 3, 'columns: strip ' + SESS_PAD_MAP.strip.col + ', fx ' + SESS_PAD_MAP.fx.col);
    assert(SESS_PAD_MAP.strip.modes[0] === eng.SESS_EQ_MODE0 && SESS_PAD_MAP.strip.modes[1] === eng.SESS_COMP_MODE,
           'the map\'s literal mode indices match ui_engine (' + SESS_PAD_MAP.strip.modes + ' vs ' + eng.SESS_EQ_MODE0 + ',' + eng.SESS_COMP_MODE + ')');
    const it = (S.bankMapKind = 'session', render.bankMapItems());
    assert(it.cols[1] && it.cols[1].cells.join() === 'EQ,COMP', 'the map screen\'s second column: ' + JSON.stringify(it.cols[1]));
    assert(it.cols[3] && it.cols[3].cells[0] === 'MASTER', 'FX in the fourth: ' + JSON.stringify(it.cols[3]));
    assert(it.cols[2] === null, 'the third column is the gap');
});

step('the EQ pad opens EQ LOW; the cache seeds negative gains (held offset, -3 dB reads -3 dB)', () => {
    reads.length = 0;
    mapTap(1, 0); ticks(16);
    assert(mode().key === 'eq_low' && mode().label === 'EQ LOW', 'mode ' + mode().key);
    assert(reads.includes('move_fx:2:eq_low') && reads.includes('slot:eq_low'), 'seeded from both strips: ' + reads.filter((k) => /eq/.test(k)));
    const cells = render.sessMixerCells(mode());
    assert(cells[0].text === '-3.0DB' && cells[0].kind === 'arcbip' && Math.abs(cells[0].signed + 0.2) < 1e-6,
           'track 1 at -3 dB, bipolar: ' + JSON.stringify(cells[0]));
    assert(cells[4].text === '0DB', 'track 5 at 0 dB: ' + cells[4].text);
});

step('the jog walks Low -> Mid -> Freq -> High, clamped at both ends; the EQ pad reopens the band last on', () => {
    jog(1); ticks(1); assert(mode().key === 'eq_mid', 'mid, got ' + mode().key);
    jog(1); jog(1); jog(1); ticks(1); assert(mode().key === 'eq_high', 'clamped at high, got ' + mode().key);
    mapTap(0, 0); ticks(2); assert(mode().key === 'volume', 'the VOLUME pad');
    jog(1); ticks(1); assert(mode().key === 'volume', 'the jog walks nothing outside EQ');
    mapTap(1, 0); ticks(2); assert(mode().key === 'eq_high', 'EQ reopens on High, got ' + mode().key);
    jog(-1); jog(-1); jog(-1); jog(-1); ticks(1); assert(mode().key === 'eq_low', 'clamped at low, got ' + mode().key);
});

step('EQ is a paged bank and says so: "1/4" .. "4/4" on the header, JOG PAGE in the footer (Josh, 2026-11-16)', () => {
    const marks = [];
    for (let i = 0; i < 4; i++) { marks.push(render.sessMixerPageMark(mode())); jog(1); ticks(1); }
    assert(marks.join() === '1/4,2/4,3/4,4/4', 'marks: ' + marks);
    for (let i = 0; i < 3; i++) { jog(-1); ticks(1); }
    ticks(16);
    assert(mode().key === 'eq_low', 'back on Low: ' + mode().key);
    assert(render.sessMixerPageMark(eng.SESS_KNOB_MODES[eng.SESS_COMP_MODE]) === undefined, 'COMPRESS has one page: no mark');
    const hdr = [];
    S.jogTouched = true; kitm.setKitHudSink((fam, d) => { if (fam === 'KitBankHeader') hdr.push(d); });
    render.drawUI();
    kitm.setKitHudSink(null); S.jogTouched = false;
    assert(hdr.length && hdr[hdr.length - 1].right === '1/4', 'header: ' + JSON.stringify(hdr[hdr.length - 1]));
    const h = kitm.kitHintsForTest();
    assert(h && h[0][0] === 'JOG' && h[0][1] === 'PAGE', 'hints: ' + JSON.stringify(h));
});

step('a turn writes the strip key in real units: Move bus -3 dB +2 detents = -2 dB; across 0 it stops on 0', () => {
    writes.length = 0;
    knob(0, 2); ticks(2);
    const w = writes.filter((x) => x.startsWith('move_fx:2:eq_low='));
    assert(w.length && w[w.length - 1] === 'move_fx:2:eq_low=-2.000', 'wrote ' + JSON.stringify(w));
    midi(0xB0, 71, 6); ticks(2);                 /* ONE fast turn of six detents */
    const w2 = writes.filter((x) => x.startsWith('move_fx:2:eq_low='));
    assert(w2[w2.length - 1] === 'move_fx:2:eq_low=0.000', 'a fast turn across 0 stops on it: ' + JSON.stringify(w2));
    knob(4, -3); ticks(2);
    const w3 = writes.filter((x) => x.startsWith('slot:eq_low='));
    assert(w3.length && w3[w3.length - 1] === 'slot:eq_low=-1.500', 'chain track writes slot:eq_low: ' + JSON.stringify(w3));
});

step('an EQ knob in hand: the curve card for THAT track, from ONE strip read', () => {
    reads.length = 0;
    S.knobTouched = 0; ticks(1);
    assert(reads.filter((k) => k === 'move_fx:2:strip').length === 1, 'one strip read: ' + reads);
    assert(render.sessStripCardTrack() === 0, 'card for track 1, got ' + render.sessStripCardTrack());
    S.knobTouched = -1; ticks(1);
    ticks(90);                                   /* past the linger (the clock follows the ticks) */
    assert(render.sessStripCardTrack() === -1, 'gone after the release');
});

step('COMPRESS: every track\'s gain reduction in ONE bulk read, each a dot on its knob', () => {
    mapTap(1, 1); ticks(2);
    assert(mode().key === 'comp' && mode().label === 'COMPRESS', 'mode ' + mode().key);
    bulks.length = 0;
    /* the page on screen: knob 1 TOUCHED (its touch note), as a finger holds it */
    midi(0x90, 0, 127);
    ticks(24);
    const grReads = bulks.filter((b) => b.some((k) => k.startsWith('strip_gr:')));
    assert(grReads.length >= 2 && grReads.length <= 4, 'one bulk read every few ticks, got ' + grReads.length + ' in 24');
    assert(grReads[0].includes('strip_gr:m2') && grReads[0].includes('strip_gr:s4'), 'both strips in one request: ' + grReads[0]);
    assert(S.sessCompGr[0] === -1.5 && S.sessCompGr[4] === -6, 'gains: ' + S.sessCompGr);
    /* the dot shows only on a comp that is on */
    knob(4, 40); ticks(2);
    const cells = render.sessMixerCells(mode());
    assert(Math.abs(cells[4].dot - 0.5) < 1e-6, 'track 5\'s dot at 6 of 12 dB: ' + cells[4].dot);
    assert(cells[0].dot === undefined, 'track 1\'s comp is off: no dot');
    midi(0x90, 0, 0); ticks(1);
});

step('COMPRESS shown by a JOG TOUCH (no knob in hand): the dots still move (Josh\'s Move, 2026-11-16)', () => {
    S.sessCompGr.fill(0); S.knobTouched = -1;
    PV['strip_gr:s4'] = '-9.00';
    bulks.length = 0;
    S.jogTouched = true;
    ticks(24);
    S.jogTouched = false;
    assert(bulks.some((b) => b.includes('strip_gr:s4')), 'read while the page shows: ' + JSON.stringify(bulks));
    assert(S.sessCompGr[4] === -9, 'track 5 at -9 dB: ' + S.sessCompGr);
    PV['strip_gr:s4'] = '-6.00';
});

/* ⚠ MIX page 2 through the REAL dispatch, at REST (Josh's Move, 2026-11-15:
 * the jog turned nothing — at rest on MIX only the knobs reach sound mode, so
 * a test calling sound mode's handler directly passed while the device did
 * not). Track View, MIX picked from the bank map, the jog turned. */
const snd = await import('../../ui/ui_sound.mjs');
const C = await import('../../ui/ui_constants.mjs');
step('Track View, at rest on MIX: the jog turns MIX to page 2 and back (real dispatch)', () => {
    S.sessionView = false; S.activeTrack = 4; S.trackRoute[4] = 0;
    S.bankMapKind = 'track';
    cc.bankMapPadTap(bankMapPadForCell(1, 3));            /* MIX: the CTRL column's bottom pad */
    ticks(10);
    assert(S.activeBank === C.BANK_SOUND, 'MIX picked: bank ' + S.activeBank);
    assert(snd.soundOpen() && snd.soundMixPageForTest() === 0, 'sound mode open on MIX page 1');
    jog(1); ticks(2);
    assert(snd.soundMixPageForTest() === 1, 'the jog turned MIX to page 2 (at rest), page ' + snd.soundMixPageForTest());
    writes.length = 0;
    midi(0x90, 0, 127); knob(0, 2); ticks(3); midi(0x90, 0, 0);
    assert(writes.some((x) => x.startsWith('slot:eq_low=1.000')), 'K1 at rest on page 2 is Low: ' + writes.filter((x) => /slot:/.test(x)));
    jog(-1); ticks(2);
    assert(snd.soundMixPageForTest() === 0, 'back to page 1');
    writes.length = 0;
    knob(0, -2); ticks(3);
    assert(writes.some((x) => x.startsWith('slot:eq_low=0.000')) === false, 'page 1 again: K1 is not Low');
});

if (failed) { console.log('FAIL: session strip'); process.exit(1); }
console.log('PASS: the channel strip in Session View — EQ / COMPRESS on the map, the jog\'s bands, real-unit writes, curve card, gain-reduction dots');
}
main().catch((e) => { console.error(e); process.exit(1); });
