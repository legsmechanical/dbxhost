import './_bulk_get_stub.mjs';
/* tests/js/test_automation_hold_value.mjs — HOLDING A STEP SHOWS WHAT EACH
 * AUTOMATED PARAMETER PLAYS THERE, ON WHATEVER SCREEN DRAWS IT.
 *
 * Josh, 2026-10-20: "Show automated value on step hold. When holding a step
 * with a real or interpolated automation value, if you're on a screen that
 * shows that param, have the param temporarily change to show the value at
 * that step." (The jump destinations already did, for the one lane jumped
 * from — test_automation_lane_pin / _hold_jump; this is every screen, with no
 * jump.)
 *
 * On the real UI, with the step pressed on the clip's own step row: a NOTE FX
 * card knob shows the lane's value at the held step and goes back on release;
 * a step with no value shows the knob's own; a step on page 2 reads page 2;
 * the module editor reached from the pad map shows it on its cell, with no
 * highlight; a knob turned during the hold is followed at once, and on a
 * scaled lane the display waits for the read instead of showing the knob.
 * (Rig from test_automation_lane_pin.mjs.) */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let LIST = '';
const HIER = JSON.stringify({
    levels: {
        root: {
            name: 'Nusaw',
            params: [
                ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(k => ({ key: 'osc_' + k, name: 'Osc ' + k, type: 'float', min: 0, max: 1 })),
                { level: 'filter', label: 'Filter' },
            ],
            knobs: ['osc_a', 'osc_b', 'osc_c', 'osc_d', 'osc_e', 'osc_f', 'osc_g', 'osc_h'],
        },
        filter: { name: 'Filter',
                  params: [{ key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1 },
                           { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1 }],
                  knobs: ['cutoff', 'reso'] },
    },
});
const CHAIN = {
    'synth:module': 'nusaw',
    'synth:ui_hierarchy': HIER,
    'synth:chain_params': JSON.stringify([
        ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(k => ({ key: 'osc_' + k, name: 'Osc ' + k, type: 'float', min: 0, max: 1, step: 0.01 })),
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'reso', name: 'Reso', type: 'float', min: 0, max: 1, step: 0.01 },
    ]),
};
/* An FX 1 loaded too, so the map's FX 1 pad opens an editor. */
CHAIN['fx1:module'] = 'nusaw'; CHAIN['fx1:ui_hierarchy'] = HIER; CHAIN['fx1:chain_params'] = CHAIN['synth:chain_params'];
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sets = [];
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_param = (k, v) => { sets.push(k + '=' + v); };
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) sets.push(it[i] + '=' + it[i + 1]); return true; };
let STEPS = '';
const valReads = [];
let listReads = 0;
let VALS = () => '';
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') { listReads++; return LIST; }
    if (/_pa_steps$/.test(k)) return STEPS;
    const v = /^t\d+_c\d+_pa_vals_(\d+)_(\d+)$/.exec(k);
    if (v) { valReads.push(v[1] + '_' + v[2]); return VALS(parseInt(v[1], 10), parseInt(v[2], 10)); }
    return '';
};
const BUSCHAIN = {
    'move_fx:2:fx1:module': 'nusaw',
    'move_fx:2:fx1:ui_hierarchy': HIER,
    'move_fx:2:fx1:chain_params': CHAIN['synth:chain_params'],
};
globalThis.shadow_get_param = (slot, key) => (slot === 1 && key in CHAIN ? CHAIN[key]
    : (key in BUSCHAIN ? BUSCHAIN[key] : (/:(osc_|cutoff|reso|volume)/.test(key) ? '0.5' : '')));
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};
/* ⚠ Shift is read from the host by the grid; the JS test build defaults it to
 * HELD, which turns every grid click into the section picker. */
let shiftHeld = 0;
globalThis.shadow_get_shift_held = () => shiftHeld;
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.stipple_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.pixel_print = () => {}; globalThis.flush_display = () => {};
const leds = {};
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m);
    if (a.length >= 4 && (a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; return true; };
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const _selectTrack = (await import('../../ui/ui_input_pads.mjs')).selectTrackFromPad;
const { BANKS, BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, SEQ_AUTO_TARGETS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');
globalThis.__inp = await import('../../ui/ui_input_cc.mjs');
const VIEW_EDIT = 1;
const LEDK = await import('/data/UserData/schwung/shared/constants.mjs');

const T = 1;                                           /* track 2: melodic */
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const STEP = (i) => 16 + i;
const wait = (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) {} };

/* NOTE FX K3's lane (Velocity: a wide range, so a few detents always show)
 * and a module parameter on the editor's first page. */
const K = 2;
const NFX = Object.values(SEQ_AUTO_TARGETS).find(e => e.bank === 1 && e.k === K && !e.alt);
const SEQ = 'seq:' + T + ':' + NFX.key, CHN = T + ':synth:osc_c';
const DIR = 'seq:' + T + ':all_lanes_playback_dir', MAC = 'mac:' + T + ':2';
S.trackActiveClip[T] = 0; S.trackQueuedClip[T] = -1;
let SCALE = 100;
const setList = () => {
    LIST = [SEQ, CHN, DIR, MAC].map(tg => T + ' 0 1 2 ' + tg + ' 0 0 ' + (tg === SEQ ? SCALE : 100)).join('\n') + '\n';
    auto.automationRefreshPresence();
};
setList();
STEPS = '';
/* Per page: { target: { step: v14 } }; every other step plays nothing (ffff). */
let PAGES = {};
const hex4 = (x) => ('000' + x.toString(16)).slice(-4);
VALS = (base) => {
    const pg = PAGES[base] || {};
    return Object.keys(pg).map(tg => tg + ' ' + Array.from({ length: 16 }, (_, s) => hex4(pg[tg][s] != null ? pg[tg][s] : 0xffff)).join('')).join('\n') + '\n';
};
const HI = 0x3000, P2 = 0x1000;
PAGES = { 0: { [SEQ]: { 3: HI }, [CHN]: { 3: HI }, [DIR]: { 3: 16383 }, [MAC]: { 3: 0x2000 } }, 16: { [SEQ]: { 4: P2 } } };

/* What NOTE FX K3's cell reads with the knob at `v` — the reference for "the
 * cell shows the lane's value". */
function kTextAt(v) {
    /* With NO step held: a held step would draw its lane's value whatever
     * the knob says, and the reference would agree with anything. */
    const keep = S.bankParams[T][1][K], held = S.heldStep;
    S.bankParams[T][1][K] = v; S.heldStep = -1;
    globalThis.clear_screen(); render.drawUI();
    const tx = movy.kitCellsForTest().cells[K].text;
    S.bankParams[T][1][K] = keep; S.heldStep = held;
    return tx;
}
function kText() { globalThis.clear_screen(); render.drawUI(); return movy.kitCellsForTest().cells[K].text; }
function onNoteFx() {
    if (snd.soundOpen()) snd.soundExit();
    S.activeBank = 1; S.trackActiveBank[T] = 1; S.bankCardLatched = true;
    S.trackCurrentPage[T] = 0;
    ticks(2);
}

step('⭐ NOTE FX: holding a step shows what K3\'s lane plays there; release -> the knob again', () => {
    onNoteFx();
    S.bankParams[T][1][K] = 0;
    const live = kText();
    const want = kTextAt(Number(auto.automationWireValue(SEQ, HI)));
    assert(want !== live, 'rig: the lane value draws like the knob\'s (' + live + ')');
    valReads.length = 0;
    note(STEP(3), 127); ticks(2);
    assert(S.heldStep === 3 && !S.heldStepAuto, 'rig: step 4 is not held on the clip row (' + S.heldStep + ')');
    assert(valReads.length === 1 && valReads[0] === '0_24', 'one read of page 1 on the clip grid, got ' + JSON.stringify(valReads));
    assert(kText() === want, 'K3 shows ' + kText() + ', not the lane\'s ' + want);
    const kc = movy.kitCellsForTest();
    assert(!kc.cells.some(c => c && c.lock), 'a cell is marked as a jump\'s lane: ' + JSON.stringify(kc));
    ticks(4);
    assert(valReads.length === 1, 'the hold re-read every tick: ' + JSON.stringify(valReads));
    note(STEP(3), 0); ticks(2);
    assert(kText() === live, 'after release K3 shows ' + kText() + ', not the knob\'s ' + live);
});

step('CONTROL: a held step with no value on the lane shows the knob\'s own', () => {
    onNoteFx();
    const live = kText();
    note(STEP(5), 127); ticks(2);
    assert(S.heldStep === 5, 'rig: step 6 held');
    assert(kText() === live, 'K3 shows ' + kText() + ' on a step with no value');
    note(STEP(5), 0); ticks(2);
});

step('⭐ a step on PAGE 2 reads page 2 and shows its value', () => {
    onNoteFx();
    S.trackCurrentPage[T] = 1; ticks(1);
    const want = kTextAt(Number(auto.automationWireValue(SEQ, P2)));
    valReads.length = 0;
    note(STEP(4), 127); ticks(2);
    assert(S.heldStep === 20, 'rig: step 21 held (' + S.heldStep + ')');
    assert(valReads.indexOf('16_24') >= 0, 'page 2 not read: ' + JSON.stringify(valReads));
    assert(kText() === want, 'K3 shows ' + kText() + ', not page 2\'s ' + want);
    note(STEP(4), 0); ticks(2);
    S.trackCurrentPage[T] = 0;
});

step('⭐ the module editor from the pad map (no jump): the held step\'s value on its cell, no highlight', () => {
    onNoteFx();
    S.bankCardLatched = false;
    cc(3, 127); ticks(60); note(90, 127); ticks(2); note(90, 0); ticks(2); cc(3, 0); ticks(10);
    assert(snd.soundInEditor(), 'rig: the instrument editor is up');
    const pp = snd.soundPPForTest();
    const ci = (pp.page.keys || []).indexOf('osc_c');
    assert(ci >= 0, 'rig: osc_c is not on the page: ' + JSON.stringify(pp.page.keys));
    note(STEP(3), 127); ticks(3);
    const want = auto.automationWireValue(CHN, HI);
    const held = snd.soundPPForTest().decorations;
    assert(held && held[ci] && held[ci].value === want && !held[ci].highlight,
           'the editor\'s osc_c cell does not show ' + want + ': ' + JSON.stringify(held));
    assert(Object.keys(held).length === 1, 'another cell is decorated: ' + JSON.stringify(held));
    note(STEP(3), 0); ticks(3);
    const after = snd.soundPPForTest().decorations;
    assert(!after || !after[ci], 'release left the value on the cell: ' + JSON.stringify(after));
    snd.soundExit(); ticks(2);
});

step('⭐ a knob turned during the hold: the cell follows at once', () => {
    onNoteFx();
    note(STEP(3), 127); ticks(2);
    const before = kText();
    sets.length = 0;
    cc(71 + K, 5); ticks(1);
    const w = sets.filter(x => x.indexOf('_pa_hold_write=') >= 0 && x.indexOf(SEQ) >= 0);
    assert(w.length >= 1, 'rig: the knob wrote no lock: ' + JSON.stringify(sets));
    const norm = parseInt(w[w.length - 1].split(' ')[5], 10);
    assert(kText() === kTextAt(Number(auto.automationWireValue(SEQ, norm))) && kText() !== before,
           'K3 shows ' + kText() + ' after the turn (was ' + before + ')');
    note(STEP(3), 0); ticks(2);
});

step('⭐ a lock from an EARLIER hold of the step yields to a newer read (e.g. after an undo)', () => {
    onNoteFx();
    const UNDONE = 0x0800;
    PAGES[0][SEQ][3] = UNDONE;          /* the lane changed since the last hold's lock */
    note(STEP(3), 127); ticks(2);
    assert(kText() === kTextAt(Number(auto.automationWireValue(SEQ, UNDONE))),
           'K3 shows ' + kText() + ': the earlier hold\'s lock, not what the lane plays now');
    note(STEP(3), 0); ticks(2);
    PAGES[0][SEQ][3] = HI;
});

step('a hold on the AUTOMATION steps reuses the lane\'s page read: no second read', () => {
    if (snd.soundOpen()) snd.soundExit();
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    setList();                     /* a new list generation: no page read is cached */
    bank.autoBankReset(); ticks(2);
    cc(3, 127); cc(3, 0);                                   /* card -> menu */
    const rows = bank.autoBankRows(T, 0);
    const idx = rows.findIndex(r => r.target === SEQ);
    for (let g = 0; g < 10 && S.autoBank.sel !== idx; g++) cc(14, S.autoBank.sel < idx ? 1 : 127);
    ticks(2);
    assert(S.autoCycle && S.autoCycle.target === SEQ, 'rig: the steps are not the lane');
    valReads.length = 0;
    note(STEP(3), 127); ticks(3);
    assert(S.heldStepAuto && S.heldStep === 3, 'rig: an automation hold on step 4');
    assert(valReads.length === 0, 'the hold read the page again: ' + JSON.stringify(valReads));
    assert(bank.autoHeldValue(SEQ) && bank.autoHeldValue(SEQ).norm === HI, 'no held value from the lane\'s read');
    note(STEP(3), 0); ticks(2);
    cc(51, 127); cc(51, 0); ticks(2);
    S.activeBank = 1; S.trackActiveBank[T] = 1;
});

/* Review, 2026-10-21: a page read left over from an earlier visit to
 * AUTOMATION is never refreshed once the list is off screen; a hold must not
 * reuse it, or its values go stale for the whole hold. */
step('a held step after LEAVING AUTOMATION reads afresh, not the old list\'s page read', () => {
    if (snd.soundOpen()) snd.soundExit();
    setList();
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    bank.autoBankReset(); ticks(2);
    cc(3, 127); cc(3, 0);
    const idx = bank.autoBankRows(T, 0).findIndex(r => r.target === SEQ);
    for (let g = 0; g < 10 && S.autoBank.sel !== idx; g++) cc(14, S.autoBank.sel < idx ? 1 : 127);
    ticks(3);
    assert(S.autoCycle && S.autoCycle.target === SEQ, 'rig: the list read the lane\'s page');
    cc(51, 127); cc(51, 0); ticks(1);
    onNoteFx();
    const NOW = 0x0400;
    PAGES[0][SEQ][3] = NOW;                 /* the lane changed after that read */
    valReads.length = 0;
    note(STEP(3), 127); ticks(2);
    assert(valReads.indexOf('0_24') >= 0, 'the hold reused the old read: ' + JSON.stringify(valReads));
    assert(kText() === kTextAt(Number(auto.automationWireValue(SEQ, NOW))), 'K3 shows the stale value ' + kText());
    note(STEP(3), 0); ticks(2);
    PAGES[0][SEQ][3] = HI;
});

step('⭐ Scale 50 %: the turn is NOT shown from the knob; the read after it rests is', () => {
    SCALE = 50; setList();
    onNoteFx();
    PAGES[0][SEQ][3] = HI;
    S.bankParams[T][1][K] = NFX.min;   /* the turn starts far from the lane's value */
    note(STEP(3), 127); ticks(2);
    const before = kText();
    sets.length = 0;
    cc(71 + K, 5); ticks(1);
    assert(kText() === before, 'a scaled lane showed the knob\'s raw lock: ' + kText() + ' (was ' + before + ')');
    /* The engine now plays the new (scaled) value; the read lands once the knob rests. */
    const NEW = 0x2000;
    PAGES[0][SEQ][3] = NEW;
    valReads.length = 0;
    wait(80); ticks(2);
    assert(valReads.length >= 1, 'no read after the knob rested on a scaled lane');
    assert(kText() === kTextAt(Number(auto.automationWireValue(SEQ, NEW))), 'K3 shows ' + kText() + ', not the read value');
    note(STEP(3), 0); ticks(2);
    SCALE = 100; setList(); PAGES[0][SEQ][3] = HI;
});

step('⭐ a drum track\'s ALL LANES Dir (its one bank-knob lane): the held step\'s direction', () => {
    if (snd.soundOpen()) snd.soundExit();
    S.trackPadMode[T] = PAD_MODE_DRUM;
    S.drumLaneLength[T] = 16; S.drumLaneTPS[T] = 24; S.drumLaneLoopStart[T] = 0;
    S.activeBank = 7; S.trackActiveBank[T] = 7; S.bankCardLatched = true;
    S.bankParams[T][7][6] = 0;
    ticks(2);
    const dirText = () => { globalThis.clear_screen(); render.drawUI(); return movy.kitCellsForTest().cells[6].text; };
    const live = dirText();
    S.bankParams[T][7][6] = Number(auto.automationWireValue(DIR, 16383));
    const want = dirText();
    S.bankParams[T][7][6] = 0;
    assert(want !== live, 'rig: the lane\'s direction draws like the knob\'s (' + live + ')');
    note(STEP(3), 127); ticks(2);
    assert(S.heldStep === 3, 'rig: drum step 4 held (' + S.heldStep + ')');
    assert(dirText() === want, 'Dir shows ' + dirText() + ', not the lane\'s ' + want);
    note(STEP(3), 0); ticks(2);
    assert(dirText() === live, 'after release Dir shows ' + dirText());
    S.trackPadMode[T] = 0;
});

step('⭐ a SnapMorph knob on MACROS: the held step\'s position', () => {
    S.activeBank = 1; S.trackActiveBank[T] = 1; ticks(1);
    if (!S.trackMacros[T]) S.trackMacros[T] = new Array(8).fill(null);
    S.trackMacros[T][2] = { v: 0, legs: [{ kind: 'morph', snaps: [0, 1], lo: 0, hi: 1 }] };
    snd.soundEnter(T, T); ticks(3); snd.soundSetBank(BANK_MACROS); ticks(3);
    const mText = () => { globalThis.clear_screen(); render.drawUI(); return movy.kitCellsForTest().cells[2].text; };
    const live = mText();
    assert(live === '0%', 'rig: the SnapMorph knob at 0% (' + live + ', ' + JSON.stringify(movy.kitCellsForTest().cells[2]) + ')');
    note(STEP(3), 127); ticks(2);
    assert(S.heldStep === 3, 'rig: step 4 held (' + S.heldStep + ')');
    assert(mText() === Math.round(0x2000 / 16383 * 100) + '%', 'MORPH shows ' + mText() + ', not the lane\'s position');
    note(STEP(3), 0); ticks(2);
    assert(mText() === live, 'after release MORPH shows ' + mText());
    snd.soundExit(); ticks(2);
});

/* Josh, 2026-10-21: "i could swear that i doubled a melodic loop and the
 * automation wasn't there on the new portion". The engine copies it; the UI
 * never re-read the lane list, so the step buttons showed the old lane. Every
 * note-moving edit's re-read now marks the list stale. */
step('Shift + Step 15 (loop double) makes the lane list re-read', () => {
    if (snd.soundOpen()) snd.soundExit();
    S.trackPadMode[T] = 0; onNoteFx();
    S.clipLength[T][0] = 16; S.clipLoopStart[T][0] = 0;
    ticks(6);
    listReads = 0;
    cc(49, 127); shiftHeld = 1; note(16 + 14, 127); note(16 + 14, 0); cc(49, 0); shiftHeld = 0;
    ticks(8);
    assert(sets.some(x => x.indexOf('_loop_double_fill') >= 0), 'rig: the double was not sent: ' + JSON.stringify(sets.slice(-5)));
    assert(listReads >= 1, 'the lane list was not re-read after the double');
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
if (failed) process.exit(1);
console.log('test_automation_hold_value: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
