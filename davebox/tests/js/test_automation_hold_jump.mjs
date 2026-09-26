import './_bulk_get_stub.mjs';
/* tests/js/test_automation_hold_jump.mjs — HOLD A POINT, EDIT IT, RELEASE, BACK.
 *
 * Josh, 2026-09-24: "When an automation lane is selected, either by having the
 * cursor over it or being in it's overlay menu, holding a step with an
 * automation point from that lane should temporarily take you to the bank that
 * param lives on, allowing you to quickly edit the automation value on that
 * point. Releasing the step takes you back to where you were."
 *
 * Performs it on the real UI: the menu, the cursor on a DELAY lane, the held
 * step (a point) → the DELAY card is on screen and marked temporary, the knob
 * writes the point AT THAT STEP, release → the AUTOMATION menu, row, page and
 * ops as they were, and the track's remembered bank never became DELAY. Plus:
 * a step with no point stays put, the ops overlay also jumps, a module lane
 * says NO EDITOR, the alt page is shown for Clock Feedback, and a hold ended by
 * another path (a track switch) still comes back.
 *
 * ---- the rig's header (test_automation_playhead.mjs): ----
 * THE SELECTED LANE'S OWN PLAYHEAD.
 *
 * Josh, 2026-09-24: "we'd need to add a playhead - i dont' think there's one
 * there now". While a lane is selected, the step row's White is where THAT
 * lane is in its own cycle — not the clip's step — and the page bar's tick
 * follows it. The position comes from the DSP (tN_pa_view names the lane;
 * state_snapshot 57..64 reports it), so the view is sent once per selection
 * change and cleared with "-", and no read is added.
 *
 * ---- the rig's original header (test_automation_bank_gradient.mjs): ----
 * THE STEP ROW SHOWS WHAT THE LANE PLAYS.
 *
 * Josh, 2026-09-24: no notes on the step buttons in automation mode — instead
 * Legacy's intensity gradient: each step coloured by the value the selected
 * lane plays there (seven levels), a step holding a real point blinking OFF
 * briefly, DarkGrey outside the cycle. The values come from ONE read per page
 * (tN_cC_pa_vals_<base>_<tps>), never per tick.
 *
 * (Rig shared with test_automation_bank_cycle.mjs.)
 *
 * ---- original header of the rig: ----
 * THE GRID FOLLOWS THE SELECTED ROW.
 *
 * Josh, 2026-09-24: with a lane selected on the AUTOMATION bank, the step
 * buttons, Left/Right, the page bar ("mimic the style used in track overview")
 * and the header are THAT lane's cycle — a 4-bar lane under a 2-bar clip has
 * four pages; a 13-step lane leaves 14–16 dark — and no notes, which cannot be
 * edited there. Back → the clip's grid again, exactly as before.
 *
 * Performs the gestures on the real UI (jog click, jog turn, Right/Left, Back)
 * and asserts what is ON SCREEN (the header text, found pixel-exact; the page
 * bar's pixels) and ON THE STEP BUTTONS (the LED stream). */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let fb = new Uint8Array(128 * 64);
const px = (x, y, c) => { if (x >= 0 && x < 128 && y >= 0 && y < 64) fb[y * 128 + x] = c ? 1 : 0; };
let LIST = '';
let STEPS = {};
let SNAP = () => '';
const valReads = [];
let VALS = () => '';
const leds = {};
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    if (k === 'state_snapshot') return SNAP();
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
    const v = /^t\d+_c\d+_pa_vals_(\d+)_(\d+)$/.exec(k);
    if (v) { valReads.push(v[1] + '_' + v[2]); return VALS(parseInt(v[1], 10)); }
    return '';
};
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
globalThis.print = (x, y, t, c) => { for (let i = 0; i < String(t).length * 6; i++) px(x + i, y, c); };
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
const { BANKS, BANK_AUTOMATION, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const render = await import('../../ui/ui_render.mjs');
globalThis.__movy = await import('../../ui/ui_movy.mjs');
const { fontPrint4x5 } = await import('../../ui/ui_fonts_pp.mjs');

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
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const STEP = (i) => 16 + i;
function drawnHdr(text) {
    const save = fb; fb = new Uint8Array(128 * 64);
    fontPrint4x5(0, 0, text, 1);
    const ink = []; for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (fb[y * 128 + x]) ink.push([x, y]);
    fb = save;
    const w = Math.max(...ink.map(p => p[0])) + 1, h = Math.max(...ink.map(p => p[1])) + 1;
    const on = new Set(ink.map(([x, y]) => y * 128 + x));
    for (const pol of [1, 0]) for (let oy = 0; oy + h <= 64; oy++) for (let ox = 0; ox + w <= 128; ox++) {
        let m = true;
        for (let y = 0; y < h && m; y++) for (let x = 0; x < w; x++) if ((fb[(oy + y) * 128 + ox + x] === pol) !== on.has(y * 128 + x)) { m = false; break; }
        if (m) return true;
    }
    return false;
}

S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
S.clipLength[T][C] = 16; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = 0;
S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1;
/* Rows sort by label: Dly>Clock Feedback, Dly>Level, then the module lane. */
LIST = '0 0 1 1 seq:0:delay_clock_fb 0 5 100\n0 0 1 1 seq:0:delay_level 0 5 100\n0 0 1 1 0:synth:cutoff 0 5 100\n';
const m6 = '0000001';
STEPS = { t0_c0: 'seq:0:delay_clock_fb ' + m6 + '\nseq:0:delay_level ' + m6 + '\n0:synth:cutoff ' + m6 + '\n' };
VALS = () => '';
auto.automationRefreshPresence();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
S.altMode = false;

let levelRow = -1;
step('setup: the menu, cursor on the DELAY Level lane', () => {
    click(); ticks(2);
    for (let i = 0; i < 3 && (!S.autoCycle || S.autoCycle.target !== 'seq:0:delay_level'); i++) { jog(1); ticks(2); }
    assert(S.autoCycle && S.autoCycle.target === 'seq:0:delay_level', 'cursor on the Level lane: ' + JSON.stringify(S.autoCycle));
    levelRow = S.autoBank.sel;
});

step('⭐ an EMPTY step jumps too, and its knob writes a NEW point there (Josh, 2026-09-25)', () => {
    note(STEP(3), 127); ticks(3);
    assert(S.activeBank === DELAY, 'an empty step did not jump, bank ' + S.activeBank);
    sets.length = 0;
    cc(72, 1); ticks(2);                               /* K2 = DELAY Level */
    const w = sets.find(x => x.startsWith('t0_pa_set2=0 seq:0:delay_level '));
    assert(w && w.split(' ').slice(2, 4).join(' ') === '72 95', 'no new point on step 4 (ticks 72..95): ' + JSON.stringify(sets));
    note(STEP(3), 0); ticks(2);
    assert(S.activeBank === BANK_AUTOMATION, 'release did not come back, bank ' + S.activeBank);
});

/* The Level lane plays full scale at step 7 (the knob itself sits elsewhere). */
const LEVEL_AT7 = SEQ_AUTO_TARGETS.delay_level.max;
step('setup: the lane\'s values, full scale at step 7', () => {
    const W = new Array(16).fill(-1); W[6] = 16383;
    const hex = W.map(v => (v < 0 ? 0xffff : v).toString(16).padStart(4, '0')).join('');
    VALS = () => 'seq:0:delay_level ' + hex + '\n';
    S.bankParams[T][DELAY][1] = SEQ_AUTO_TARGETS.delay_level.min;
    auto.automationRefreshPresence(); ticks(3);
});

step('⭐ holding the point jumps to DELAY, marked temporary; the track still remembers AUTOMATION', () => {
    note(STEP(6), 127); ticks(3);
    assert(S.activeBank === DELAY, 'the DELAY card is up, bank ' + S.activeBank);
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the remembered bank stays AUTOMATION, got ' + S.trackActiveBank[T]);
    globalThis.clear_screen(); render.drawUI();
    assert(drawnHdr('<AUTO S7'), 'the header says "<AUTO S7"');
});

step('⭐ the lane\'s knob is MARKED and HIGHLIGHTED and shows the value the lane plays at the held step', () => {
    const movy = globalThis.__movy;
    globalThis.clear_screen(); render.drawUI();
    const kc = movy.kitCellsForTest();
    assert(kc && kc.cells[1] && kc.cells[1].lock, 'the Level cell carries no lock mark: ' + JSON.stringify(kc));
    assert(kc.touched === 1, 'the Level cell is not highlighted (touched ' + (kc && kc.touched) + ')');
    assert(!kc.cells.some((c, i) => i !== 1 && c && c.lock), 'another cell is marked');
    assert(kc.cells[1].lit && !kc.cells.some((c, i) => i !== 1 && c && c.lit), 'the Level cell is not the highlighted one: ' + JSON.stringify(kc));
    const f = bank.autoLaneFocus();
    assert(f && f.step === 6 && f.wire != null, 'no focus value for step 7: ' + JSON.stringify(f));
    assert(String(kc.cells[1].text).indexOf(String(LEVEL_AT7)) >= 0, 'the cell shows ' + kc.cells[1].text + ', not the lane\'s ' + LEVEL_AT7 + ' at step 7');
});

step('⭐ the knob writes the point AT THAT STEP (a span over step 7)', () => {
    sets.length = 0;
    cc(72, 1); ticks(2); cc(72, 1); ticks(2); cc(72, 1); ticks(3);
    const w = sets.filter(s => s.startsWith('t0_pa_set2=0 seq:0:delay_level 144 167 '));
    assert(w.length >= 1, 'a lock over ticks 144..167, got ' + JSON.stringify(sets.filter(s => s.indexOf('pa_') >= 0)));
    /* The cell shows the value just dialled at once — no read has happened. */
    const lastNorm = parseInt(w[w.length - 1].split(' ').pop(), 10);
    const f = bank.autoLaneFocus();
    assert(f && f.norm === lastNorm, 'the focus did not follow the knob: ' + JSON.stringify(f) + ' vs ' + lastNorm);
    globalThis.clear_screen(); render.drawUI();
    const kc = globalThis.__movy.kitCellsForTest();
    assert(String(kc.cells[1].text).indexOf(String(f.wire)) >= 0, 'the cell shows ' + kc.cells[1].text + ', not the dialled ' + f.wire);
});

step('⭐ release → the AUTOMATION menu, the same row, and nothing remembered DELAY', () => {
    note(STEP(6), 0); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION, 'back on AUTOMATION, bank ' + S.activeBank);
    assert(S.autoBank.menu && S.autoBank.sel === levelRow && !S.autoBank.ops, 'the menu, cursor on the row it left');
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'remembered bank still AUTOMATION');
    assert(S.heldStepAuto === false && S.heldStep === -1, 'the hold is over');
});

step('from the row\'s OPS overlay too: it comes back with the ops open', () => {
    click(); ticks(2);                                   /* ops of the Level lane */
    assert(S.autoBank.ops, 'setup: ops open');
    note(STEP(6), 127); ticks(3);
    assert(S.activeBank === DELAY, 'jumped from the ops');
    note(STEP(6), 0); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION && S.autoBank.ops && S.autoBank.ops.row.target === 'seq:0:delay_level', 'ops restored');
    back(); ticks(2);                                    /* close the ops */
});

step('Clock Feedback lives on DELAY\'s ALT page: the jump shows it, and release restores alt', () => {
    jog(-5); ticks(2);                                   /* to the first row */
    assert(S.autoCycle.target === 'seq:0:delay_clock_fb', 'cursor on Clock Feedback');
    note(STEP(6), 127); ticks(3);
    assert(S.activeBank === DELAY && S.altMode === true, 'DELAY, alt page');
    note(STEP(6), 0); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION && S.altMode === false, 'alt restored to off');
});

step('a module lane whose module is not loaded: no jump, and the bank stays', () => {
    jog(2); ticks(2);                                    /* Clock Fb → Level → the module lane */
    assert(S.autoCycle.target === '0:synth:cutoff', 'cursor on the module lane');
    note(STEP(6), 127); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION, 'no jump');
    note(STEP(6), 0); ticks(2);
});

step('a hold ended by ANOTHER path (a track switch) still comes back, and corrects the remembered bank', () => {
    jog(-5); jog(1); ticks(2);
    assert(S.autoCycle.target === 'seq:0:delay_level', 'on Level again');
    note(STEP(6), 127); ticks(3);
    assert(S.activeBank === DELAY, 'jumped');
    S.trackActiveBank[T] = DELAY;                        /* as if something recorded the jump */
    S.heldStep = -1; S.heldStepBtn = -1; S.heldStepAuto = false;   /* a clear site, not our release */
    ticks(3);
    assert(S.activeBank === BANK_AUTOMATION, 'the tick edge brought it back');
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the recorded jump was corrected');
});

if (failed) { console.error('FAIL: test_automation_hold_jump'); process.exit(1); }
console.log('PASS: test_automation_hold_jump');
}
main().catch(e => { console.error(e); process.exit(1); });
