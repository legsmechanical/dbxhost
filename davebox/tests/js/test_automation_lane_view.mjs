import './_bulk_get_stub.mjs';
/* tests/js/test_automation_lane_view.mjs — THE AUTOMATION LANE ON SCREEN.
 *
 * Two places show a lane (agreed design, 2026-10-22):
 *   · the lane's OPS pop-up: the pop-up moves up over the lower half of the
 *     header, gets short (four rows in the bank-header 4x5 face, no hints), and
 *     the lower half is the lane's whole window as a graph — a rule on row 36,
 *     the curve, the page bar as its bottom edge on rows 60..63 (x 1..126, the
 *     graph's own span), the playhead through both. The lane LIST is unchanged:
 *     no graph, its hints.
 *   · a HOLD (or Shift + click) jump to the parameter's kit page: the lane's
 *     CURRENT step page over the half of the screen the parameter is not in —
 *     a top-row parameter gets it over the lower half (rows 31..55), a
 *     bottom-row one over the upper half (rows 9..31); the held step between
 *     dotted rails.
 *
 * Performed on the real UI (jog click, jog turn, a held step, Right, release)
 * and asserted on the framebuffer, plus the reads: the shape is read ONCE when
 * the pop-up opens, never from a MIDI handler, never on the lane list. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
const at = (x, y) => fb[y * 128 + x];
let LIST = '';
let STEPS = {};
const reads = [];                     /* every get_param key, in order */
let VALS = () => '';
let SHAPE = '';
let PAGESHAPE = null;                 /* (t0, len) -> the ranged read's answer */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => {
    reads.push(k);
    if (k === 'pa_list') return LIST;
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
    const v = /^t\d+_c\d+_pa_vals_(\d+)_(\d+)$/.exec(k);
    if (v) return VALS(parseInt(v[1], 10));
    if (/^t0_c0_pa_shape_126$/.test(k)) return SHAPE;
    const r = /^t0_c0_pa_shape_112_(\d+)_(\d+)$/.exec(k);
    if (r) return PAGESHAPE ? PAGESHAPE(+r[1], +r[2]) : '';
    return '';
};
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => { for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); } };
globalThis.stipple_rect = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((x + i) + (y + j)) % 2) px(x + i, y + j, 0); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y, c) => px(x, y, c);
globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const render = await import('../../ui/ui_render.mjs');
const { fontPrint4x5, fontWidth4x5, setKitTextTrace } = await import('../../ui/ui_fonts_pp.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true;
const T = 0, C = 0, DELAY = 3;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const right = () => { cc(63, 127); cc(63, 0); };
const left = () => { cc(62, 127); cc(62, 0); };
const shift = (on) => cc(49, on ? 127 : 0);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const STEP = (i) => 16 + i;
const shapeReads = () => reads.filter(k => /_pa_shape_/.test(k)).length;
let traced = [];
setKitTextTrace((s) => traced.push(s));
/* Draw the screen with the lane playing at lane tick `lt` (the poll would
 * overwrite a position set before the tick, so it is set right here). */
function draw(lt) {
    if (lt != null) { S.playing = true; S.autoLanePos[T] = lt; } else { S.playing = false; S.autoLanePos[T] = -1; }
    traced = [];
    globalThis.clear_screen(); render.drawUI();
}
const rowFull = (y, x0 = 0, x1 = 127) => { for (let x = x0; x <= x1; x++) if (!at(x, y)) return false; return true; };
/* the page graph's bottom edge: full but for the 1-px gaps between pages */
const barRow = (y) => { let n = 0; for (let x = 0; x < 128; x++) n += at(x, y) ? 1 : 0; return n >= 126; };
/* `text` in the 4x5 face at exactly (x, y), ink `pol` on its own cell. */
function text4At(text, x, y, pol) {
    const save = fb; fb = new Uint8Array(128 * 64);
    fontPrint4x5(0, 0, text, 1);
    const ink = fb; fb = save;
    const w = fontWidth4x5(text);
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < w; xx++)
        if ((at(x + xx, y + yy) === pol) !== !!ink[yy * 128 + xx]) return false;
    return true;
}

/* A two-page (32-step) clip; two DELAY lanes: Level (K2, the TOP row) and
 * Pitch Feedback (K5, the BOTTOM row). */
S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 32; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 0;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
assert(BANKS[DELAY].knobs[1].dspKey === 'delay_level' && BANKS[DELAY].knobs[4].dspKey === 'delay_pitch_fb', 'rig: DELAY K2 Level, K5 Pitch Fb');
LIST = '0 0 1 3 seq:0:delay_level 0 5 100\n0 0 1 3 seq:0:delay_pitch_fb 0 5 100\n';
STEPS = { t0_c0: 'seq:0:delay_level 1\nseq:0:delay_pitch_fb 1\n' };
/* The shape: Level a ramp 0 → 254 across the lane, Pitch Fb flat at half. */
const ramp = Array.from({ length: 126 }, (_, c) => Math.round(c * 254 / 125));
SHAPE = 'seq:0:delay_level ' + ramp.map(v => v.toString(16).padStart(2, '0')).join('') + '\n'
      + 'seq:0:delay_pitch_fb ' + '7f'.repeat(126) + '\n';
/* Per-step values: page 1 (base 0) all 0, step 1 full (a glide to look at);
 * page 2 (base 16) all full scale. */
const hex16 = (arr) => arr.map(v => v.toString(16).padStart(4, '0')).join('');
VALS = (base) => {
    const W = base === 0 ? Array.from({ length: 16 }, (_, s) => s === 1 ? 16383 : 0) : new Array(16).fill(16383);
    return 'seq:0:delay_level ' + hex16(W) + '\nseq:0:delay_pitch_fb ' + hex16(W) + '\n';
};
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
S.altMode = false;

function toLane(target) {
    for (let i = 0; i < 4 && (!S.autoCycle || S.autoCycle.target !== target); i++) { jog(1); ticks(2); }
    assert(S.autoCycle && S.autoCycle.target === target, 'cursor on ' + target + ': ' + JSON.stringify(S.autoCycle));
}

step('the lane LIST is unchanged: no graph, its hints, and no shape read', () => {
    click(); ticks(2);
    toLane('seq:0:delay_level');
    ticks(5);
    draw();
    assert(shapeReads() === 0, 'the list read the shape ' + shapeReads() + ' times');
    assert(!rowFull(36), 'a rule across row 36 on the list');
    assert(traced.includes('CLK') && traced.includes('OPS'), 'the list\'s hints are drawn: ' + JSON.stringify(traced));
    assert(rowFull(50, 4, 62), 'the two-page lane\'s page bar sits at row 50 on the list, as before');
});

step('⭐ the OPS pop-up: ONE shape read, none from the click itself', () => {
    const before = reads.length;
    click();                                            /* the MIDI handler only */
    assert(reads.length === before, 'the jog click read in its handler: ' + JSON.stringify(reads.slice(before)));
    assert(S.autoBank.ops, 'setup: the ops are open');
    ticks(6);
    assert(shapeReads() === 1, 'exactly one shape read while the pop-up sits open, got ' + shapeReads());
    jog(1); ticks(4); jog(-1); ticks(4);                /* moving inside the pop-up reads nothing new */
    assert(shapeReads() === 1, 'moving the pop-up\'s cursor re-read the shape: ' + shapeReads());
});

step('⭐ the graph: a rule on row 36, the curve between it and the bar, the page bar on rows 60..63 — NOT at 50', () => {
    draw();
    assert(rowFull(36), 'no full-width rule on row 36');
    /* the ramp: bottom curve row (58) at x 1, top curve row (38) at x 126 */
    assert(at(1, 58) && at(126, 38), 'the curve does not run 58 → 38 across x 1..126');
    assert(!at(0, 58) && !at(127, 38), 'the curve spills outside x 1..126');
    for (let y = 37; y <= 59; y++) assert(!at(0, y), 'column 0 is not part of the graph (row ' + y + ')');
    /* page bar: viewed page solid at x 1..62 on rows 60..63; the other page
     * an underline on row 63 from x 64 */
    for (let y = 60; y <= 63; y++) assert(rowFull(y, 1, 62), 'the viewed page is not solid on row ' + y);
    assert(rowFull(63, 64, 125) && !at(80, 61), 'the second page is an underline');
    assert(!rowFull(50, 4, 62), 'the page bar was ALSO drawn at row 50');
});

step('⭐ the pop-up: box rows 3..33 at x 10..117, rows in the 4x5 face, the selection inverted, no hints', () => {
    draw();
    assert(rowFull(3, 10, 117) && rowFull(33, 10, 117), 'the box\'s top/bottom edges are not on rows 3 and 33');
    assert(at(10, 20) && at(117, 20), 'the box\'s sides are not at x 10 and 117');
    assert(text4At('MUTE', 14, 6, 0), 'MUTE is not in the 4x5 face, inverted, on the first row');
    assert(rowFull(5, 12, 112), 'the selection band is not 101 px on rows 5..11');
    assert(text4At('WRAP', 14, 13, 1) && text4At('LINK', 14, 20, 1) && text4At('LOOP', 14, 27, 1), 'rows 2..4 are not WRAP / LINK / LOOP at 7-px pitch');
    const wv = 'RESET';
    const wrapReset = S.autoBank.ops.rows.find(o => o.op === 'wrap').value.toUpperCase();
    assert(text4At(wrapReset, 111 - fontWidth4x5(wrapReset), 13, 1), 'the Wrap value is not right-aligned to x 110 (' + wrapReset + ', e.g. ' + wv + ')');
    assert(!text4At('RATE', 14, 34, 1), 'a fifth row is drawn');
    assert(!traced.some(t => t === 'CLK' || t === 'JOG' || t === 'BACK'), 'hints drawn with the pop-up open: ' + JSON.stringify(traced));
    /* the scroll thumb: 1 px at x 115, 8 rows, 4 visible */
    assert(at(115, 5) && !at(114, 5) && !at(116, 5), 'no 1-px scroll thumb at x 115');
});

step('⭐ the playhead: one column from the rule to the bar, and the bar\'s dot moves by TICK', () => {
    const lt = 400;                                     /* step 16.67 of 32: px 1 + floor(16.67*126/32) = 66 */
    draw(lt);
    for (let y = 37; y <= 59; y++) assert(at(66, y), 'the playhead column (x 66) is missing at row ' + y);
    assert(at(66, 61) && at(66, 62), 'the page bar\'s dot is not at x 66 (by tick)');
    /* by STEP the dot would sit at 1 + floor(16*125/32) = 63 (the gap) */
    assert(!at(63, 61) && !at(65, 61), 'a dot by STEP (x 63) — it must move by tick');
    draw(-1);
    let col = 0; for (let y = 37; y <= 59; y++) col += at(66, y);
    assert(col < 5, 'the playhead stays when the lane is not playing');
});

step('Back closes the pop-up: the list, its hints and its row-50 bar again; no graph', () => {
    back(); ticks(3);
    draw();
    assert(!S.autoBank.ops && !rowFull(36), 'still showing the graph after Back');
    assert(traced.includes('CLK'), 'the list\'s hints are back');
    assert(rowFull(50, 4, 62), 'the list\'s page bar is back at row 50');
});

let topFrame = null;
step('⭐ HOLD a step on a TOP-row lane (Level, K2): the page over the LOWER half, rows 31..55, rails at the held step', () => {
    const before = reads.length;
    note(STEP(4), 127);
    /* ⚠ The jump to a davebox bank already reads that bank's knobs in the
     * handler (readBankParams, the existing hold jump). The lane view adds
     * nothing there: no automation read of any kind before the tick. */
    const inHandler = reads.slice(before);
    assert(!inHandler.some(k => /_pa_/.test(k)), 'the note-on read automation in its handler: ' + JSON.stringify(inHandler));
    assert(inHandler.every(k => /^t0_delay_/.test(k)), 'the handler read something besides the DELAY knobs: ' + JSON.stringify(inHandler));
    ticks(3);
    assert(S.activeBank === DELAY, 'the hold jumped to DELAY, bank ' + S.activeBank);
    draw();
    assert(rowFull(31) && barRow(55), 'the frame is not on rows 31 and 55');
    for (let y = 31; y <= 55; y++) assert(at(0, y) && at(127, y), 'the frame sides at row ' + y);
    assert(!rowFull(30) && !barRow(56), 'the frame is taller than 31..55');
    /* ⭑ the bottom edge is the PAGE BAR: two pages, a gap at x 63, page 1 two rows thick */
    assert(!at(63, 55) && at(10, 54) && at(62, 54) && !at(64, 54) && !at(100, 54), 'page 1 is not the thick segment of the bar');
    /* rails: x 8 + 4*7 = 36 and 43, dotted from row 33 */
    for (let y = 33; y <= 51; y += 2) assert(at(36, y) && at(43, y), 'a rail dot missing at row ' + y);
    assert(!at(36, 34) && !at(43, 34), 'the rails are solid, not dotted');
    /* beat ticks under the floor (row 53) every 4 steps */
    for (const x of [8, 36, 64, 92, 119]) assert(at(x, 53), 'a beat tick missing at x ' + x);
    /* page 1: 0 everywhere but step 2 (full): a glide up into step 2 and down out of it */
    assert(at(8, 52) && at(15, 33), 'the curve: step 1 at the floor (52), step 2 at the top (33)');
    let mid = false; for (let y = 36; y <= 50; y++) if (at(11, y)) mid = true;
    assert(mid, 'a continuous lane glides between step values (x 11 has no mid-height ink)');
    assert(traced.includes('BANKS') || traced.length > 0, 'the hint row still draws');
    topFrame = fb.slice();
});

step('⭐ Right while held: the graph is PAGE 2 (its own values), not page 1', () => {
    right(); ticks(4);
    assert(S.autoCycle && S.autoCycle.page === 1, 'Right did not page the lane: ' + JSON.stringify(S.autoCycle));
    assert(reads.some(k => k === 't0_c0_pa_vals_16_24'), 'page 2\'s values were never read');
    draw();
    assert(at(50, 33) && !at(50, 52), 'page 2 (all full scale) is not drawn flat at the top');
    assert(at(100, 54) && !at(10, 54), 'the bar does not show page 2');
    for (let y = 33; y <= 51; y += 2) assert(!at(36, y) || y === 33, 'the held step\'s rails show on a page it is not on');
});

step('release: the overlay is gone, back on the lane list', () => {
    note(STEP(4), 0); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION, 'release came back, bank ' + S.activeBank);
    draw();
    assert(!rowFull(31) && !barRow(55), 'the overlay frame survived the release');
});

step('⭐ HOLD on a BOTTOM-row lane (Pitch Fb, K5): the page over the UPPER half, rows 9..31', () => {
    toLane('seq:0:delay_pitch_fb');
    S.autoBank.cyclePage = 0; ticks(2);
    note(STEP(4), 127); ticks(3);
    assert(S.activeBank === DELAY, 'jumped');
    draw();
    assert(rowFull(9) && barRow(31), 'the frame is not on rows 9 and 31');
    assert(!barRow(55), 'the lower-half frame drew too');
    for (let y = 11; y <= 27; y += 2) assert(at(36, y) && at(43, y), 'a rail dot missing at row ' + y);
    note(STEP(4), 0); ticks(3);
});

step('Shift + click (the pin): the same page graph, no rails (no step held)', () => {
    jog(-1); ticks(2);
    assert(S.autoCycle.target === 'seq:0:delay_level', 'on Level again');
    shift(true); click(); shift(false); ticks(4);
    assert(bank.autoLanePinActive() && S.activeBank === DELAY, 'the pin is up on DELAY');
    draw();
    assert(rowFull(31) && barRow(55), 'the pin draws the lower-half page graph');
    let rail = 0; for (let y = 33; y <= 51; y += 2) rail += at(36, y) && at(43, y) && !at(36, y + 1) ? 1 : 0;
    assert(rail < 3, 'rails drawn with no step held');
    back(); ticks(3);
});

step('⭐ the page graph is the page\'s SHAPE: a punch on step 5 draws flat with hard edges, not a ramp (Josh, 2026-10-22)', () => {
    const hex = (v) => v.toString(16).padStart(2, '0');
    let asked = null;
    /* 112 samples: 0, then full scale across step 5 (columns 28..34), then 0 */
    PAGESHAPE = (t0, len) => { asked = [t0, len]; let h = ''; for (let c = 0; c < 112; c++) h += hex(c >= 28 && c < 35 ? 254 : 0); return 'seq:0:delay_level ' + h + '\n'; };
    S.autoBank.cyclePage = 0; ticks(2);
    /* the pin above read this page moments ago: let that read age out */
    S.tickCount += 50;
    note(STEP(9), 127); ticks(3);
    assert(S.activeBank === DELAY, 'jumped');
    assert(asked && asked[0] === 0 && asked[1] === 16 * S.autoCycle.tps, 'the page was not asked for in lane ticks: ' + JSON.stringify(asked) + ' tps ' + S.autoCycle.tps);
    draw();
    for (const y of [34, 40, 46, 52]) assert(at(36, y) && at(43, y), 'no hard edge at x 36 / 43, row ' + y);
    for (let y = 36; y <= 50; y++) assert(!at(33, y) && !at(46, y), 'a ramp beside the punch at row ' + y);
    assert(at(39, 33) && at(30, 52) && at(50, 52), 'the punch is not flat at the top with the floor either side');
    note(STEP(9), 0); ticks(3);
    PAGESHAPE = null;
});

step('⭐ SEQ FOLLOW: the lane\'s page follows its playhead like the note steps; a held step stays; a hand page pauses it (Josh, 2026-10-22)', () => {
    const run = (lt) => { S.playing = true; S.trackClipPlaying[T] = true; S.autoLanePos[T] = lt; ticks(1); S.autoLanePos[T] = lt; ticks(1); };
    S.seqFollowOn = true; S.followPaused = false;
    toLane('seq:0:delay_level');
    S.autoBank.cyclePage = 0; ticks(2);
    run(20 * 24);                                        /* step 21: page 2 */
    assert(S.autoCycle.page === 1, 'the lane did not follow to page 2: ' + S.autoCycle.page);
    run(3 * 24);
    assert(S.autoCycle.page === 0, 'back to page 1 with the playhead: ' + S.autoCycle.page);
    /* a held step pins the page: the playhead moving on does not page it */
    note(STEP(4), 127); ticks(3);
    run(20 * 24); run(21 * 24);
    assert(S.autoCycle.page === 0, 'the page moved under a held step: ' + S.autoCycle.page);
    note(STEP(4), 0); ticks(3);
    run(20 * 24);
    assert(S.autoCycle.page === 1, 'following again after the release: ' + S.autoCycle.page);
    /* paging by hand pauses it, as on the note steps */
    left(); ticks(1);
    assert(S.followPaused, 'Left did not pause Seq Follow');
    run(22 * 24);
    assert(S.autoCycle.page === 0, 'the page followed after a hand page: ' + S.autoCycle.page);
    /* the switch off: no follow */
    S.followPaused = false; S.seqFollowOn = false;
    run(22 * 24);
    assert(S.autoCycle.page === 0, 'followed with Seq Follow off: ' + S.autoCycle.page);
    S.seqFollowOn = true; S.playing = false; S.autoLanePos[T] = -1; ticks(1);
});

step('stepped targets are known without a read (the engine\'s table)', () => {
    assert(auto.automationTargetStepped('seq:0:delay_retrig') === true, 'Retrig is a choice');
    assert(auto.automationTargetStepped('seq:0:delay_level') === false, 'Level glides');
});

if (failed) { console.error('FAIL: test_automation_lane_view'); process.exit(1); }
console.log('PASS: test_automation_lane_view');
}
main().catch(e => { console.error(e); process.exit(1); });
