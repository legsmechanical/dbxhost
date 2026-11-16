import './_bulk_get_stub.mjs';
/* tests/js/test_channel_strip.mjs — THE CHANNEL STRIP on MIX page 2 (Josh,
 * 2026-11-15: "3 band eq (with mid freq) and single knob bus compressor on
 * each track bus" · "second page of mix" · "a pop-up visual EQ curve" · gain
 * reduction "a point that moves on the knob itself").
 *
 * Real gestures on sound mode's MIX card (soundOnCC / soundOnNote / soundTick
 * against a shadow_get_param stub): the jog turns the page, K1-K5 are Low /
 * Mid / Freq / High / Comp written to `slot:` keys, the gains stop at 0 dB on
 * the way across, an EQ knob in hand raises the curve card, the comp's gain
 * reduction rides its arc as a dot. Plus: the JS mirror of mix_strip.h's
 * constants, and the curve maths against the voicing. */
import fs from 'fs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let reads = [];
const ENG = { 'slot:strip': '0.00 0.00 0.5000 0.00 0.0000', 'slot:comp_gr': '0.00' };
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ENG[key] || ''; };
let writes = [];
globalThis.shadow_set_param = (slot, key, val) => { writes.push({ key, val }); ENG[key] = String(val); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
let fills = [], px = [], seq = 0;
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v, seq: seq++ }); };
globalThis.draw_rect = () => {};
globalThis.stipple_rect = () => {};
globalThis.set_pixel = (x, y) => { px.push({ x, y, seq: seq++ }); };
globalThis.clear_screen = () => { fills = []; px = []; seq = 0; };
globalThis.print = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.host_module_set_params = () => true;
globalThis.host_ui_publish = () => false;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_autosave_hold = () => {};
globalThis.shadow_save_state_now = () => 1;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const strip = await import('../../ui/ui_strip.mjs');

const cc = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const touch = (k, on) => snd.soundOnNote(on ? 0x90 : 0x80, k, on ? 127 : 0);
const turnBy = (k, n) => cc(71 + k, n > 0 ? n : 128 + n);
const jog = (n) => cc(14, n > 0 ? n : 128 + n);
const lastWrite = (key) => { const w = writes.filter((x) => x.key === key); return w.length ? w[w.length - 1].val : null; };
const ticks = (n) => { for (let i = 0; i < n; i++) { snd.soundTick(); bridge.tickPrefetch(); auto.automationTick(); } };
const draw = () => { globalThis.clear_screen(); snd.soundRender(); };
const labels = () => snd.soundLevelCellsForTest().map((c) => c.label || '');

step('setup: a Schwung track on its MIX card', () => {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
    GS.activeTrack = 2; GS.activeBank = GS.trackActiveBank[2] = 11;
    snd.soundEnter(2, 2); ticks(3);
    GS.bankCardLatched = true;
    assert(snd.soundPickStateForTest().view === 18, 'on the MIX card, view ' + snd.soundPickStateForTest().view);
    assert(labels().slice(0, 4).join() === 'Vol,Pan,SndA,SndB', 'page 1 is the levels: ' + labels());
});

step('the jog turns MIX to page 2: Low · Mid · Freq · High · Comp, K6-K8 blank; seeded in ONE `strip` read', () => {
    reads = [];
    jog(1); ticks(2);
    assert(snd.soundMixPageForTest() === 1, 'on page 2');
    assert(labels().join() === 'Low,Mid,Freq,High,Comp,,,', 'page 2 cells: ' + labels());
    jog(1); ticks(1);
    assert(snd.soundMixPageForTest() === 1, 'a second right turn stays on page 2 (no wrap)');
    assert(!reads.some((k) => /eq_|:comp$/.test(k)), 'no per-key strip reads: ' + reads);
    draw();
    assert(px.length > 200, 'the page draws');
});

step('K1 Low: 0.5 dB a detent; across 0 dB it STOPS on 0 (the centre detent), then goes on', () => {
    writes = [];
    turnBy(0, 3); ticks(1);
    assert(lastWrite('slot:eq_low') === '1.500', 'three detents = +1.5 dB, got ' + lastWrite('slot:eq_low'));
    turnBy(0, -5); ticks(1);
    assert(lastWrite('slot:eq_low') === '0.000', 'crossing 0 stops on it, got ' + lastWrite('slot:eq_low'));
    turnBy(0, -1); ticks(1);
    assert(lastWrite('slot:eq_low') === '-0.500', 'then on below, got ' + lastWrite('slot:eq_low'));
    assert(snd.soundLevelCellsForTest()[0].text === '-0.5dB', 'reads -0.5dB, got ' + snd.soundLevelCellsForTest()[0].text);
    turnBy(0, -60); ticks(1);
    assert(lastWrite('slot:eq_low') === '-15.000', 'clamped at -15, got ' + lastWrite('slot:eq_low'));
    turnBy(0, 30); ticks(1);
});

step('K2 Mid / K3 Freq / K4 High / K5 Comp: each to its own slot: key; Freq reads in Hz, Comp OFF at 0', () => {
    writes = [];
    turnBy(1, 8); turnBy(2, 20); turnBy(3, -4); turnBy(4, 50); ticks(1);
    assert(lastWrite('slot:eq_mid') === '4.000', 'mid, got ' + lastWrite('slot:eq_mid'));
    assert(lastWrite('slot:eq_mid_freq') === '0.600', 'freq, got ' + lastWrite('slot:eq_mid_freq'));
    assert(lastWrite('slot:eq_high') === '-2.000', 'high, got ' + lastWrite('slot:eq_high'));
    assert(lastWrite('slot:comp') === '0.500', 'comp, got ' + lastWrite('slot:comp'));
    const c = snd.soundLevelCellsForTest();
    assert(c[2].text === strip.STRIP_HZ_FMT(0.6) && /k$/.test(c[2].text), 'freq text ' + c[2].text);
    assert(c[4].text === '50%', 'comp text ' + c[4].text);
    assert(c[1].kind === 'arcbip' && c[2].kind === 'arc', 'gains are bipolar arcs, freq a plain arc');
    assert(strip.STRIP_COMP_FMT(0) === 'OFF', 'comp at 0 reads OFF');
});

step('the comp\'s gain reduction rides its arc as a DOT, read from comp_gr while the page is up', () => {
    reads = [];
    ENG['slot:comp_gr'] = '-6.00';
    ticks(20);
    const n = reads.filter((k) => k === 'slot:comp_gr').length;
    assert(n >= 1 && n <= 4, 'comp_gr read every few ticks, not every tick: ' + n + ' in 20');
    const dot = snd.soundLevelCellsForTest()[4].dot;
    assert(Math.abs(dot - 6 / strip.STRIP_GR_ARC_DB) < 1e-6, 'dot at 6 dB of the arc, got ' + dot);
    turnBy(4, -60); ticks(1);
    assert(lastWrite('slot:comp') === '0.000', 'comp back to 0');
    reads = []; ticks(20);
    assert(!reads.includes('slot:comp_gr'), 'comp off: no gain-reduction reads');
    assert(snd.soundLevelCellsForTest()[4].dot === undefined, 'and no dot');
});

step('an EQ knob in hand raises the curve card; it goes after the release (the comp raises none)', () => {
    touch(1, true); ticks(1);
    assert(snd.soundStripCardForTest() === 'eq_mid', 'card for the mid, got ' + snd.soundStripCardForTest());
    draw();
    assert(px.length > 400, 'the card draws a curve over the page');
    touch(1, false); ticks(1);
    GS.tickCount += 100; ticks(1);              /* past the linger (the clock follows the tick count) */
    assert(snd.soundStripCardForTest() === null, 'gone after the release');
    touch(4, true); ticks(1);
    assert(snd.soundStripCardForTest() === null, 'the comp raises no curve card');
    touch(4, false); ticks(1);
});

step('the jog back: page 1, K1 is Volume again', () => {
    writes = [];
    jog(-1); ticks(1);
    assert(snd.soundMixPageForTest() === 0 && labels()[0] === 'Vol', 'page 1');
    turnBy(0, 2); ticks(1);
    assert(lastWrite('slot:volume') !== null && lastWrite('slot:eq_low') === null, 'K1 wrote volume only');
});

step('the menu screens keep the levels (page 1) even with MIX left on page 2', () => {
    jog(1); ticks(1);
    assert(snd.soundMixPageForTest() === 1, 'page 2 on the card');
    snd.soundShowMenu(); ticks(1);
    writes = [];
    turnBy(0, 2); ticks(1);
    assert(lastWrite('slot:volume') !== null && lastWrite('slot:eq_low') === null, 'K1 is Volume in the menu');
});

/* ---- the JS mirror of mix_strip.h ---- */
step('ui_strip.mjs mirrors mix_strip.h\'s voicing (corners, span, Q, ±15 dB)', () => {
    const h = fs.readFileSync('../src/host/mix_strip.h', 'utf8')   /* the suite runs from davebox/ */;
    const def = (n) => { const m = h.match(new RegExp('#define ' + n + '\\s+\\(?(-?[0-9.]+)f?')); return m ? parseFloat(m[1]) : NaN; };
    assert(def('MIX_STRIP_LOW_HZ') === strip.STRIP_LOW_HZ, 'low corner');
    assert(def('MIX_STRIP_HIGH_HZ') === strip.STRIP_HIGH_HZ, 'high corner');
    assert(def('MIX_STRIP_MID_LO_HZ') === strip.STRIP_MID_LO_HZ, 'mid bottom');
    assert(def('MIX_STRIP_MID_SPAN') === strip.STRIP_MID_SPAN, 'mid span');
    assert(def('MIX_STRIP_MID_Q') === strip.STRIP_MID_Q, 'mid Q');
    assert(def('MIX_STRIP_EQ_DB_MAX') === strip.STRIP_EQ_DB_MAX, '±dB');
    assert(def('MIX_STRIP_FREQ_DEF') === strip.STRIP_SPECS[2].def, 'mid default position');
    const keys = (h.match(/MIX_STRIP_KEYS\[MIX_STRIP_NPARAMS\] = \{([^}]*)\}/) || [])[1] || '';
    assert(JSON.stringify(keys.match(/"([a-z_]+)"/g).map((k) => k.slice(1, -1))) === JSON.stringify(strip.STRIP_KEYS), 'key order: ' + keys);
});

step('the curve card\'s maths is the voicing: +15 dB mid peaks +15 at its frequency, shelves half-way at their corners', () => {
    const near = (a, b, e) => Math.abs(a - b) < e;
    assert(near(strip.stripEqDb({ eq_mid: 15, eq_mid_freq: 0.5 }, 1000), 15, 0.05), 'mid at 1 kHz');
    assert(near(strip.stripEqDb({ eq_mid: 15, eq_mid_freq: 1 }, 8000), 15, 0.05), 'mid at 8 kHz');
    assert(near(strip.stripEqDb({ eq_low: 15 }, 80), 7.5, 0.3), 'low shelf at 80 Hz');
    assert(near(strip.stripEqDb({ eq_high: 15 }, 12000), 7.5, 0.3), 'high shelf at 12 kHz');
    assert(near(strip.stripEqDb({ eq_low: 15 }, 5000), 0, 0.05), 'low shelf leaves 5 kHz');
    assert(strip.stripEqCurve({}, 50).every((d) => d === 0), 'flat is 0 dB everywhere');
});

if (failed) { console.log('FAIL: channel strip'); process.exit(1); }
console.log('PASS: the channel strip on MIX page 2 — gestures, curve card, gain-reduction dot, the host\'s voicing');
}
main().catch((e) => { console.error(e); process.exit(1); });
