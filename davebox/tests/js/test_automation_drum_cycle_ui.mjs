import './_bulk_get_stub.mjs';
/* tests/js/test_automation_drum_cycle_ui.mjs — A DRUM LANE'S CYCLE ON THE
 * AUTOMATION BANK.
 *
 * Josh, 2026-09-24: on a drum track every automation lane has its own cycle —
 * the pad it was recorded on, a snapshot — shown in the AUTO bank, and changed
 * only deliberately: Loop (in the lane's own steps) and Match pad. The DSP
 * lists the cycle's start and step (pa_list fields 9-10); here the UI must
 * count in THEM, not in the selected pad's grid:
 *   - a 13-step 1/32 lane reads "13 ST/32" under a 1/16 pad, and its grid is
 *     13 steps of 12 ticks;
 *   - Loop edits in the lane's steps (never CLIP on a drum track) and sends
 *     its start and step back unchanged;
 *   - Match pad shows the selected pad's cycle and, clicked, asks the DSP for
 *     it (pa_loop length 0);
 *   - a step held on the grid locks at the LANE's step (12 ticks), through the
 *     hold-jump to the parameter's bank.
 * Real gestures on the whole UI; asserts what is drawn and what is sent.
 *
 * (Rig from test_automation_bank_cycle.mjs.) */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
let LIST = '';
let STEPS = {};
const leds = {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
    const l = /^t\d+_l(\d+)_(length|loop_start|tps)$/.exec(k);
    if (l && LANES[l[1]]) return String(LANES[l[1]][l[2]]);
    return '';
};
let LANES = {};                          /* lane -> { length, loop_start, tps }, the DSP's per-pad answers */
globalThis.shadow_get_param = (slot, key) => {
    if (key === 'synth:chain_params') return JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
        { key: 'drive', name: 'Drive', type: 'float', min: 0, max: 1 },
        { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1 }]);
    return '';
};
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
const printed = [];
globalThis.print = (x, y, t, c) => { printed.push(String(t)); for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const { White, DarkGrey } = await import('/data/UserData/schwung/shared/constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');
const { fontPrint4x5 } = await import('../../ui/ui_fonts_pp.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
const T = 0, C = 0;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const right = () => { cc(63, 127); cc(63, 0); };
const left  = () => { cc(62, 127); cc(62, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };

function inkOf(text, hdr) {
    const save = fb; fb = new Uint8Array(128 * 64);
    /* the bank header's right label is the small 4x5 face (drawKitBankHeader) */
    (hdr ? fontPrint4x5 : movy.mvPrint)(0, 0, String(text).toUpperCase(), 1);
    const pts = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (fb[y * 128 + x]) pts.push([x, y]);
    fb = save;
    return pts;
}
/* `text` drawn anywhere, EXACTLY (lit AND dark pixels of its box) — in the
 * header's inverse band the text is dark on light, so try both polarities. */
function drawn(text, hdr) {
    const ink = inkOf(text, hdr);
    if (!ink.length) throw new Error('the font drew nothing for ' + text);
    const w = Math.max(...ink.map(p => p[0])) + 1, h = Math.max(...ink.map(p => p[1])) + 1;
    const on = new Set(ink.map(([x, y]) => y * 128 + x));
    for (const pol of [1, 0]) for (let oy = 0; oy + h <= 64; oy++) for (let ox = 0; ox + w <= 128; ox++) {
        let match = true;
        for (let y = 0; y < h && match; y++) for (let x = 0; x < w; x++) {
            const lit = fb[(oy + y) * 128 + ox + x] === pol;
            if (lit !== on.has(y * 128 + x)) { match = false; break; }
        }
        if (match) return true;
    }
    return false;
}
const drawScreen = () => { globalThis.clear_screen(); render.drawUI(); };
/* The colours each step button showed over ~1.2 s (both blink phases). */
function watchLeds() {
    const seen = Array.from({ length: 16 }, () => new Set());
    for (let n = 0; n < 120; n++) { ticks(1); for (let i = 0; i < 16; i++) seen[i].add(leds[16 + i]); }
    return seen;
}

const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const STEP = (i) => 16 + i;
const ALL_LANES = 7;   /* a drum track's one automatable dAVEBOx knob: ALL LANES Dir, K7 */

/* A drum track, the selected pad 16 steps of 1/16. Two lanes: ALL LANES Dir
 * at 13 steps of 1/32 (156 ticks, a point on step 3), and Cutoff at 4 bars. */
S.trackPadMode[T] = PAD_MODE_DRUM; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.drumLaneLength[T] = 16; S.drumLaneTPS[T] = 24; S.drumLaneLoopStart[T] = 0;
S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1; S.altMode = false;
LIST = '0 0 1 2 seq:0:all_lanes_playback_dir 156 5 100 0 12\n0 0 1 1 0:synth:cutoff 1536 5 100 0 24\n';
STEPS = { t0_c0: 'seq:0:all_lanes_playback_dir 001\n0:synth:cutoff 1\n' };
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('⭐ the rows read each lane\'s OWN cycle: "13 ST/32" under a 1/16 pad, and "4 BAR"', () => {
    click(); ticks(2);
    drawScreen();
    assert(drawn('13 ST/32'), 'the 13-step 1/32 lane reads 13 ST/32 (the pad\'s grid would say 7 ST)');
    assert(drawn('4 BAR'), 'the 4-bar lane reads 4 BAR');
});

step('its grid is 13 steps of 12 ticks', () => {
    for (let i = 0; i < 3 && (!S.autoCycle || S.autoCycle.target !== 'seq:0:all_lanes_playback_dir'); i++) { jog(1); ticks(2); }
    assert(S.autoCycle && S.autoCycle.target === 'seq:0:all_lanes_playback_dir', 'cursor on the Dir lane: ' + JSON.stringify(S.autoCycle));
    assert(S.autoCycle.tps === 12 && S.autoCycle.len === 13 && S.autoCycle.off === 0,
           'the cycle is 13 steps of 12 from 0, got ' + JSON.stringify(S.autoCycle));
});

step('⭐ a step held on the grid locks at the LANE\'s step: step 3 = ticks 24..35', () => {
    sets.length = 0;
    note(STEP(2), 127); ticks(3);
    assert(S.activeBank === ALL_LANES, 'jumped to ALL LANES, bank ' + S.activeBank);
    cc(77, 1); ticks(3);
    const w = sets.filter(s => s.startsWith('t0_pa_set2=0 seq:0:all_lanes_playback_dir '));
    assert(w.length && w.every(s => s.startsWith('t0_pa_set2=0 seq:0:all_lanes_playback_dir 24 35 ')),
           'the lock spans ticks 24..35 (the pad\'s 1/16 would be 48..71), got ' + JSON.stringify(w));
    note(STEP(2), 0); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION, 'back on AUTOMATION');
});

step('⭐ Loop edits in the lane\'s steps and keeps its start and step; never CLIP on a drum track', () => {
    click(); ticks(1);                                       /* the row's ops */
    const a = S.autoBank;
    assert(a.ops, 'ops open');
    const li = a.ops.rows.findIndex(o => o.op === 'loop');
    assert(li >= 0 && a.ops.rows[li].value === '13 ST/32', 'the Loop row reads the cycle, got ' + JSON.stringify(a.ops.rows[li]));
    jog(li - a.ops.sel); ticks(1);
    click(); ticks(1);                                       /* edit */
    sets.length = 0;
    jog(1); ticks(2);
    assert(sets.some(s => s === 't0_pa_loop=0 seq:0:all_lanes_playback_dir 168 0 5 12'),
           '14 steps x 12 ticks, start 0, rate 5, step 12, got ' + JSON.stringify(sets.filter(s => s.indexOf('pa_loop') >= 0)));
    assert(a.ops.rows[li].value === '14 ST/32', 'reads 14 ST/32, got ' + a.ops.rows[li].value);
    for (let i = 0; i < 20; i++) { jog(-1); ticks(1); }
    assert(a.loopVal === 1 && a.ops.rows[li].value === '1 ST/32', 'the floor is ONE step, never CLIP, got ' + a.loopVal + ' / ' + a.ops.rows[li].value);
    click(); ticks(1);                                       /* done */
});

step('Rate keeps the lane\'s cycle, start and step (x2 on the 1-step cycle)', () => {
    click(); ticks(1);                                       /* ops again */
    const a = S.autoBank;
    const ri = a.ops.rows.findIndex(o => o.op === 'rate');
    jog(ri - a.ops.sel); ticks(1);
    click(); ticks(1);                                       /* edit */
    sets.length = 0;
    jog(1); ticks(2);
    assert(sets.some(s => s === 't0_pa_loop=0 seq:0:all_lanes_playback_dir 12 0 6 12'),
           'length 12, start 0, x2 (6), step 12, got ' + JSON.stringify(sets.filter(s => s.indexOf('pa_loop') >= 0)));
    click(); ticks(1);
});

step('⭐ Match pad shows the selected pad\'s cycle and, clicked, asks for it', () => {
    click(); ticks(1);
    const a = S.autoBank;
    const mi = a.ops.rows.findIndex(o => o.op === 'match');
    assert(mi >= 0 && a.ops.rows[mi].value === '1 BAR', 'Match pad reads the 16-step 1/16 pad: 1 BAR, got ' + JSON.stringify(a.ops.rows[mi]));
    jog(mi - a.ops.sel); ticks(1);
    printed.length = 0; drawScreen();
    assert(printed.some(x => /^match pad$/i.test(x)), 'the row\'s label is drawn, got ' + JSON.stringify(printed));
    sets.length = 0;
    click(); ticks(2);
    assert(sets.some(s => s === 't0_pa_loop=0 seq:0:all_lanes_playback_dir 0 0 6'), 'pa_loop length 0 = match the pad (the x2 rate kept), got ' + JSON.stringify(sets));
    const lr = a.ops.rows.find(o => o.op === 'loop');
    assert(lr && lr.value === '1 BAR', 'the Loop row now reads the pad\'s 1 BAR, got ' + JSON.stringify(lr));
    back(); back();
});

step('⭐ a pad TAPPED while the pop-up is open changes what Match pad shows and does', () => {
    LANES = { 0: { length: 12, loop_start: 0, tps: 24 }, 1: { length: 7, loop_start: 0, tps: 24 } };
    note(68, 100); note(68, 0); ticks(2);            /* pad 1 = lane 0, the 12-step pad */
    click(); ticks(2); click(); ticks(1);            /* the list, then the lane's pop-up */
    const a = S.autoBank;
    let mi = a.ops.rows.findIndex(o => o.op === 'match');
    jog(mi - a.ops.sel); ticks(1);
    printed.length = 0; drawScreen();
    const mv = () => a.ops.rows.find(o => o.op === 'match').value;   /* what the drawn row carries */
    assert(mv() === '12 ST', 'Match pad reads the 12-step pad, got ' + mv());
    note(69, 100); note(69, 0); ticks(2);            /* pad 2 = lane 1, the 7-step pad */
    assert(S.activeDrumLane[T] === 1 && S.drumLaneLength[T] === 7, 'setup: lane 1 (7 steps) selected, got lane ' + S.activeDrumLane[T] + ' len ' + S.drumLaneLength[T]);
    assert(a.ops, 'the pop-up is still open after the pad tap');
    printed.length = 0; drawScreen();
    assert(mv() === '7 ST', 'Match pad now reads the 7-step pad, got ' + mv());
    sets.length = 0;
    click(); ticks(2);
    assert(sets.some(s => s.startsWith('t0_pa_loop=0 seq:0:all_lanes_playback_dir 0 0')), 'the match was sent, got ' + JSON.stringify(sets));
    const lr = a.ops.rows.find(o => o.op === 'loop');
    assert(lr && lr.value === '7 ST', 'the Loop row takes the 7-step pad, got ' + JSON.stringify(lr));
    back(); back();
    LANES = {};
});

step('CONTROL: a melodic track has no Match pad and its Loop can be CLIP', () => {
    S.trackPadMode[T] = 0;
    LIST = '0 0 1 1 0:synth:reso 0 5 100\n';
    STEPS = { t0_c0: '0:synth:reso 1\n' };
    auto.automationRefreshPresence();
    click(); ticks(2); click(); ticks(1);
    const a = S.autoBank;
    assert(a.ops && !a.ops.rows.some(o => o.op === 'match'), 'no Match pad on a melodic lane');
    assert(a.ops.rows.find(o => o.op === 'loop').value === 'CLIP', 'melodic Loop reads CLIP');
    back(); back();
});

if (failed) { console.error('FAIL: test_automation_drum_cycle_ui'); process.exit(1); }
console.log('PASS: test_automation_drum_cycle_ui');
}
main().catch(e => { console.error(e); process.exit(1); });
