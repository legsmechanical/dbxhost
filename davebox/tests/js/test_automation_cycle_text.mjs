import './_bulk_get_stub.mjs';
/* tests/js/test_automation_cycle_text.mjs — EVERY AUTOMATION ROW SHOWS ITS CYCLE.
 *
 * Josh, 2026-09-24: with lanes at different lengths, how long each one loops is
 * the thing people cannot remember — so the AUTOMATION bank's value column is
 * the lane's cycle: "4 BAR" for whole bars, else its length in its own steps
 * ("13 ST"), with the step unit when it is not 1/16 ("13 ST/32"); "CLIP" when
 * the lane follows its clip; "OFF" when muted.
 *
 * Two layers: the text rule (cycleText / rowCycle), and the SCREEN — the real
 * drawUI on the latched AUTOMATION card, with the expected string drawn by the
 * real font into a scratch buffer and FOUND, pixel for pixel, in the frame.
 * A test that only called rowCycle would pass with the column still reading
 * ON/SMTH (the old values) — the screen is the claim. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
let LIST = '';
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : '');
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
        { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1 },
        { key: 'drive', name: 'Drive', type: 'float', min: 0, max: 1 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {}; globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
const T = 0, C = 0;

/* The expected string's ink, by the real font, as offsets from its origin. */
function inkOf(text) {
    const save = fb; fb = new Uint8Array(128 * 64);
    movy.mvPrint(0, 0, String(text).toUpperCase(), 1);
    const pts = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (fb[y * 128 + x]) pts.push([x, y]);
    fb = save;
    return pts;
}
/* Is `text` drawn anywhere in the frame, EXACTLY — every ink pixel lit and
 * every other pixel of its bounding box dark? ⚠ Matching only the lit pixels
 * found every string inside any filled area (the footer's inverse boxes), so
 * the negative control could never say no. */
function drawn(text) {
    const ink = inkOf(text);
    if (!ink.length) throw new Error('the font drew nothing for ' + text);
    const w = Math.max(...ink.map(p => p[0])) + 1, h = Math.max(...ink.map(p => p[1])) + 1;
    const on = new Set(ink.map(([x, y]) => y * 128 + x));
    for (let oy = 0; oy + h <= 64; oy++) for (let ox = 0; ox + w <= 128; ox++) {
        let match = true;
        for (let y = 0; y < h && match; y++) for (let x = 0; x < w; x++) {
            if ((fb[(oy + y) * 128 + ox + x] === 1) !== on.has(y * 128 + x)) { match = false; break; }
        }
        if (match) return true;
    }
    return false;
}
const drawCard = () => { globalThis.clear_screen(); render.drawUI(); };

step('the text rule: whole bars, else steps in their own unit; never fractional bars', () => {
    const cases = [[16, 24, '1 BAR'], [64, 24, '4 BAR'], [13, 24, '13 ST'], [8, 24, '8 ST'],
                   [13, 12, '13 ST/32'], [32, 12, '1 BAR'], [6, 96, '6 ST/4'], [8, 48, '1 BAR'],
                   [3, 48, '3 ST/8']];
    for (const [st, tps, want] of cases) {
        const got = auto.cycleText(st, tps);
        assert(got === want, `cycleText(${st}, ${tps}) = ${got}, want ${want}`);
    }
});

step('rowCycle: a lane with its own Loop is that window; one without follows the clip ("CLIP")', () => {
    /* "<t> <c> <flags> <count> <target> <loop_ticks> <res> <scale>" */
    LIST = '0 0 1 4 0:synth:cutoff 768 5 100\n0 0 1 4 0:synth:reso 0 5 100\n0 0 1 4 0:synth:drive 312 5 100\n';
    auto.automationRefreshPresence();
    S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.clipTPS[T][C] = 24;
    const a = auto.rowCycle(T, C, '0:synth:cutoff');
    assert(a && a.len === 32 && a.pages === 2 && a.text === '2 BAR' && !a.follows, 'cutoff: ' + JSON.stringify(a));
    const b = auto.rowCycle(T, C, '0:synth:reso');
    assert(b && b.follows && b.text === 'CLIP' && b.len === 16 && b.pages === 1, 'reso: ' + JSON.stringify(b));
    const d = auto.rowCycle(T, C, '0:synth:drive');
    assert(d && d.len === 13 && d.pages === 1 && d.text === '13 ST', 'drive: ' + JSON.stringify(d));
    assert(auto.rowCycle(T, C, '0:synth:nope') === null, 'an unknown target has no cycle');
});

step('⭐ ON SCREEN: the AUTOMATION card\'s value column reads each lane\'s cycle', () => {
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    drawCard();
    assert(drawn('2 BAR'), 'the 2-bar lane\'s "2 BAR" is not on the card');
    assert(drawn('13 ST'), 'the 13-step lane\'s "13 ST" is not on the card');
    assert(drawn('CLIP'), 'the follow-the-clip lane\'s "CLIP" is not on the card');
    /* CONTROL: the finder must be able to say no — the old column's word is gone. */
    assert(!drawn('SMTH'), 'control: the old SMTH value is still drawn (or the finder cannot say no)');
});

step('muted reads OFF; the pads\' aftertouch row still reads PADS', () => {
    LIST = '0 0 0 4 0:synth:cutoff 768 5 100\n';   /* flags 0 = muted */
    auto.automationRefreshPresence();
    S.clipAtHas[T][C] = true;
    drawCard();
    assert(drawn('OFF'), 'a muted lane reads OFF');
    assert(drawn('PADS'), 'the aftertouch row reads PADS');
    assert(!drawn('2 BAR'), 'a muted lane does not also read its cycle');
    S.clipAtHas[T][C] = false;
});

step('a drum lane without its own Loop follows the selected pad\'s window, and reads CLIP', () => {
    S.trackPadMode[T] = PAD_MODE_DRUM; S.drumLaneLength[T] = 24; S.drumLaneTPS[T] = 24; S.drumLaneLoopStart[T] = 0;
    LIST = '0 0 1 4 0:synth:reso 0 5 100\n';
    auto.automationRefreshPresence();
    const r = auto.rowCycle(T, C, '0:synth:reso');
    assert(r && r.follows && r.len === 24 && r.pages === 2 && r.text === 'CLIP', 'drum follow: ' + JSON.stringify(r));
    S.trackPadMode[T] = 0;
});

if (failed) { console.error('FAIL: test_automation_cycle_text'); process.exit(1); }
console.log('PASS: test_automation_cycle_text');
}
main().catch(e => { console.error(e); process.exit(1); });
