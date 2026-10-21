import './_bulk_get_stub.mjs';
/* tests/js/test_automation_lane_pin.mjs — AFTER A SHIFT + CLICK JUMP THE STEPS
 * KEEP SHOWING THE LANE, UNTIL BACK.
 *
 * Josh, 2026-09-25: "YES [keep showing the lane after a Shift + jog click
 * jump, until you press Back] ... this should work on any automated param."
 * For every kind of target, on the real UI: after the jump the step row is
 * the lane's (its colours, not the clip's), a held step there is an
 * automation hold (a seq knob writes a lock at that step, with no second
 * jump), Back returns to the menu with the lane still on the steps, and the
 * next Back clears them. CONTROLS: a view switch ends the pin; a bank picked
 * by hand ends it.
 *
 * (Rig from test_automation_lane_jump.mjs, which pins the jumps themselves.)
 *
 * Josh, 2026-09-11: "Shift+automation lane in automation menu top level jumps
 * to the bank/mode with that param on it." RULED: Back after a jump returns to
 * the AUTOMATION MENU, cursor on the lane you jumped from — once; then the
 * destination's Back is its own again.
 *
 * Performs the gesture for every kind of target, on the real UI:
 *   seq:<t>:<key>        -> that davebox bank's card
 *   <slot>:synth:<key>   -> the module editor, ON THE PAGE HOLDING THE KEY (it
 *                           is on the SECOND page, so landing on page 1 fails)
 *   <slot>:slot:volume   -> SOUND + CONFIG
 *   cc:74                -> MACROS
 * and Back from each, asserting the bank, the menu and the cursor. CONTROLS: a
 * plain click still opens the lane's ops; after the return, Back closes the
 * menu as it always did. */
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
let STEPS = '', VALS = '';
globalThis.host_module_get_param = (k) => {
    if (k === 'pa_list') return LIST;
    if (/_pa_steps$/.test(k)) return STEPS;
    if (/_pa_vals_\d+_\d+$/.test(k)) return VALS;
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
const { BANKS, BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const movy = await import('../../ui/ui_movy.mjs');
globalThis.__inp = await import('../../ui/ui_input_cc.mjs');
const VIEW_EDIT = 1;
const LEDK = await import('/data/UserData/schwung/shared/constants.mjs');

const T = 1;                                           /* track 2: melodic by default */
S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false; S.clockFollowTicks = true;
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const click = () => { cc(3, 127); cc(3, 0); };
const back = () => { cc(51, 127); cc(51, 0); };
const jog = (d) => cc(14, d > 0 ? d : 128 + d);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const shiftClick = () => { cc(49, 127); shiftHeld = 1; click(); cc(49, 0); shiftHeld = 0; };

const seq = Object.values(SEQ_AUTO_TARGETS)[0];
const TARGETS = { seq: 'seq:' + T + ':' + seq.key, chain: T + ':synth:cutoff', level: T + ':slot:volume', midi: 'cc:74',
                  morph: 'mac:' + T + ':2' };
S.trackActiveClip[T] = 0; S.trackQueuedClip[T] = -1;
LIST = Object.values(TARGETS).map(tg => T + ' 0 1 2 ' + tg + ' 0').join('\n') + '\n';
/* Every lane: a point on step 4, and every step plays the top value — so the
 * lane's step row is solid top-level colour, which the clip (no notes) never is. */
STEPS = Object.values(TARGETS).map(tg => tg + ' 0001000000000000').join('\n') + '\n';
VALS = Object.values(TARGETS).map(tg => tg + ' ' + '7f'.repeat(16)).join('\n') + '\n';
auto.automationRefreshPresence();
const L = await import('../../ui/ui_leds.mjs');
const TOP = L.AUTO_GRAD[6];
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const STEP = (i) => 16 + i;
/* The lane owns the step row: the pin's cycle is this lane's, and a step
 * with no point shows the lane's top-level colour (sampled over both blink
 * phases). */
function assertLaneOnSteps(target, what) {
    ticks(1);
    assert(S.autoCycle && S.autoCycle.target === target, what + ': the steps are not the lane (' + JSON.stringify(S.autoCycle) + ')');
    for (let n = 0; n < 40; n++) ticks(1);
    assert(leds[STEP(0)] === TOP && leds[STEP(9)] === TOP,
           what + ': step LEDs are not the lane\'s colour (' + leds[STEP(0)] + ', ' + leds[STEP(9)] + ', want ' + TOP + ')');
}

/* The AUTOMATION card, its menu open, the cursor on `target`. Returns the row. */
function openMenuOn(target) {
    if (snd.soundOpen()) snd.soundExit();
    S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;
    bank.autoBankReset();
    ticks(2);
    click();                                           /* card -> menu */
    const rows = bank.autoBankRows(T, 0);
    const idx = rows.findIndex(r => r.target === target);
    assert(idx >= 0, 'rig: no row for ' + target + ' in ' + JSON.stringify(rows.map(r => r.target)));
    for (let g = 0; g < 10 && S.autoBank.sel !== idx; g++) jog(S.autoBank.sel < idx ? 1 : -1);
    assert(S.autoBank.menu && S.autoBank.sel === idx, 'rig: cursor not on ' + target);
    return idx;
}
/* AUTOMATION the way the device reaches it: the pad map's AUTOMATION door
 * ([1,1] = pad 85) from CLIP, which stamps the door's way home — and while a
 * door is up a map pick does NOT tear the screen down (bankMapLeaveScreen). */
function openMenuViaMap(target) {
    if (snd.soundOpen()) snd.soundExit();
    __inp.closeDoorScreen(); bank.autoBankReset();
    S.activeBank = 0; S.trackActiveBank[T] = 0; S.bankCardLatched = false;
    ticks(2);
    cc(3, 127); ticks(60); note(85, 127); ticks(2); note(85, 0); ticks(2); cc(3, 0); ticks(6);
    assert(__inp.doorScreenUp() && bank.autoMenuUp(), 'rig: the AUTOMATION door is not up (bank ' + S.activeBank + ')');
    const rows = bank.autoBankRows(T, 0);
    const idx = rows.findIndex(r => r.target === target);
    assert(idx >= 0, 'rig: no row for ' + target);
    for (let g = 0; g < 10 && S.autoBank.sel !== idx; g++) jog(S.autoBank.sel < idx ? 1 : -1);
    assert(S.autoBank.sel === idx, 'rig: cursor not on ' + target);
    return idx;
}
/* `cleared`: the menu state was dropped while you were away — what a bank walk
 * does to it (applyBankPick calls autoBankReset). The return has to rebuild it,
 * not rely on it having survived. */
function assertBackToLane(idx, what, cleared) {
    /* ⚠ Move the cursor too: autoBankReset keeps `sel`, so without this the
     * cursor assertion below could not fail. */
    if (cleared) { bank.autoBankReset(); S.autoBank.sel = (idx === 0) ? 1 : 0; }
    back(); ticks(4);
    assert(S.activeBank === BANK_AUTOMATION, what + ': Back did not return to AUTOMATION (bank ' + S.activeBank + ')');
    assert(!snd.soundOpen(), what + ': sound mode still open after the return');
    assert(S.bankCardLatched && S.autoBank && S.autoBank.menu && !S.autoBank.ops,
           what + ': not on the menu: ' + JSON.stringify(S.autoBank));
    assert(S.autoBank.sel === idx, what + ': cursor on row ' + S.autoBank.sel + ', not the lane (' + idx + ')');
    /* And the track is recorded back on AUTOMATION — soundExit's landOn — so a
     * later track switch or reload comes back to the bank you were on. */
    assert(S.trackActiveBank[T] === BANK_AUTOMATION,
           what + ': the track is left recorded on bank ' + S.trackActiveBank[T]);
}
/* The MODULE-editor jump opens an editor, which is not a bank: it records
 * nothing. */
function assertNotRecorded(what) {
    assert(S.trackActiveBank[T] === BANK_AUTOMATION,
           what + ': the jump RECORDED bank ' + S.trackActiveBank[T] + ' on the track');
}
/* A jump onto a BANK records it, SOUND+CFG and MACROS included, like the
 * davebox-bank jump always has (Josh, 2026-09-25, call c, 2026-09-25). */
function assertRecorded(what, bank) {
    assert(S.trackActiveBank[T] === bank,
           what + ': the jump did not record bank ' + bank + ' (track on ' + S.trackActiveBank[T] + ')');
}


const KINDS = [
    ['seq', 'a davebox BANK'],
    ['chain', 'the module EDITOR'],
    ['level', 'SOUND + CONFIG'],
    ['midi', 'MACROS'],
    ['morph', 'MACROS (a SnapMorph knob)'],
];
for (const [kind, where] of KINDS) {
    step('⭐ ' + kind + ' lane -> ' + where + ': the steps KEEP the lane; Back keeps it on the menu; the next Back clears it', () => {
        const target = TARGETS[kind];
        const idx = openMenuOn(target);
        ticks(2);
        shiftClick(); ticks(kind === 'chain' ? 10 : 4);
        assert(S.activeBank !== BANK_AUTOMATION || snd.soundOpen(), 'rig: the jump did not leave the AUTOMATION card');
        assertLaneOnSteps(target, kind + ' after the jump');
        /* A held step here is an automation hold ON THIS SCREEN — no second jump. */
        const bankBefore = S.activeBank, openBefore = snd.soundOpen();
        S.actionPopupLines = [];
        note(STEP(3), 127); ticks(1);
        assert(!(S.actionPopupLines || []).some(l => /NO EDITOR/.test(l)), kind + ': the hold tried a second jump: ' + JSON.stringify(S.actionPopupLines));
        assert(S.heldStepAuto && S.heldStep === 3, kind + ': the press is not an automation hold of step 4 (' + S.heldStep + ')');
        assert(S.activeBank === bankBefore && snd.soundOpen() === openBefore, kind + ': the hold jumped somewhere else');
        note(STEP(3), 0); ticks(1);
        assert(S.heldStep < 0, kind + ': the release did not end the hold');
        assertBackToLane(idx, kind, false);
        assertLaneOnSteps(target, kind + ' back on the menu');
        back(); ticks(2);
        assert(!S.autoBank.menu && !S.autoCycle, kind + ': the next Back left the lane on the steps');
    });
}

step('⭐ a seq knob turned with a step held on the pinned lane writes the lock at THAT step', () => {
    openMenuOn(TARGETS.seq); ticks(2);
    shiftClick(); ticks(4);
    assert(S.activeBank === seq.bank, 'rig: on the seq bank');
    note(STEP(5), 127); ticks(1);
    sets.length = 0;
    cc(71 + seq.k, 1); ticks(2);
    const w = sets.filter(x => x.indexOf('_pa_hold_write=') >= 0 && x.indexOf(TARGETS.seq) >= 0);
    assert(w.length >= 1, 'no lock written for the lane, got ' + JSON.stringify(sets));
    const f = w[w.length - 1].split('=')[1].split(' ');
    assert(f[2] === '5' && f[3] === '5' && f[4] === '24', 'the lock is not on step 6: ' + w[w.length - 1]);
    note(STEP(5), 0); ticks(1);
    back(); ticks(2); back(); ticks(1);
});

step('⭐ HOLD a Volume point -> SOUND + CONFIG while held; its knob writes THAT step; release -> the same row', () => {
    const idx = openMenuOn(TARGETS.level); ticks(2);
    note(STEP(3), 127); ticks(4);
    assert(snd.soundOpen() && S.activeBank === BANK_SOUND, 'not on SOUND + CONFIG while held: bank ' + S.activeBank + ' open ' + snd.soundOpen());
    /* The Volume cell: marked, highlighted, showing the lane's value (full
     * scale at every step) rather than the knob's. */
    snd.soundLevelValSetForTest(0, 0.25);              /* the knob's own value, pinned for the comparison */
    globalThis.clear_screen(); render.drawUI();
    const kc = movy.kitCellsForTest();
    assert(kc && kc.cells[0] && kc.cells[0].lock && kc.touched === 0, 'Volume is not marked and highlighted: ' + JSON.stringify(kc));
    const heldText = kc.cells[0].text;
    const fo = bank.autoLaneFocus();
    assert(fo && fo.norm === 16383, 'the focus is not the lane\'s full-scale value: ' + JSON.stringify(fo));
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the hold RECORDED bank ' + S.trackActiveBank[T] + ' on the track');
    assert(S.autoCycle && S.autoCycle.target === TARGETS.level, 'the steps left the lane during the hold');
    sets.length = 0;
    cc(71, 1); ticks(2);                               /* K1 = Volume */
    const w = sets.filter(x => x.indexOf('_pa_hold_write=') >= 0 && x.indexOf(TARGETS.level) >= 0);
    assert(w.length >= 1, 'K1 wrote no lock for the lane, got ' + JSON.stringify(sets));
    const f = w[w.length - 1].split('=')[1].split(' ');
    assert(f[2] === '3' && f[3] === '3' && f[4] === '24', 'the lock is not on step 4: ' + w[w.length - 1]);
    note(STEP(3), 0); ticks(2);
    assert(S.activeBank === BANK_AUTOMATION && !snd.soundOpen(), 'release did not come back: bank ' + S.activeBank + ' open ' + snd.soundOpen());
    assert(S.autoBank.menu && S.autoBank.sel === idx, 'not on the same row: ' + JSON.stringify(S.autoBank));
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the track is left on bank ' + S.trackActiveBank[T]);
    /* CONTROL: the same cell with NO step held (a Shift+click jump) shows the
     * knob's own value — so the held value above was the lane's. */
    shiftClick(); ticks(4);
    snd.soundLevelValSetForTest(0, 0.25);
    globalThis.clear_screen(); render.drawUI();
    const kc2 = movy.kitCellsForTest();
    assert(kc2.cells[0].lock && kc2.touched !== 0, 'the pinned, unheld Volume cell: ' + JSON.stringify(kc2));
    /* No corner mark any more: the pinned lane's cell is HIGHLIGHTED even with no step held. */
    assert(kc2.cells[0].lit && !kc2.cells.some((c, i) => i !== 0 && c && c.lit), 'the pinned lane\'s cell is not the one highlighted: ' + JSON.stringify(kc2));
    assert(kc2.cells[0].text !== heldText, 'the held cell showed the knob\'s own value (' + heldText + ')');
    back(); ticks(4);
    back(); ticks(1);
});

step('⭐ HOLD a module point -> its EDITOR on the page holding the key; the knob writes THAT step; release -> the same row', () => {
    const idx = openMenuOn(TARGETS.chain); ticks(2);
    note(STEP(3), 127); ticks(10);
    assert(snd.soundOpen() && snd.soundViewForTest() === VIEW_EDIT, 'not in the editor while held: view ' + snd.soundViewForTest());
    const pp = snd.soundPPForTest();
    assert(pp.on && pp.page && (pp.page.keys || []).indexOf('cutoff') >= 0, 'not on the page holding cutoff: ' + JSON.stringify(pp.page && pp.page.keys));
    /* The cutoff cell: HIGHLIGHTED (no lock corner — a lock would stand the
     * module's graphics down) with the lane's value at the held step. */
    ticks(1);
    const ci = pp.page.keys.indexOf('cutoff');
    const dec = JSON.parse(snd.soundPPForTest().focusDec || 'null');
    const want = auto.automationWireValue(TARGETS.chain, 16383);
    assert(dec && dec[ci] && dec[ci].highlight && !dec[ci].locked && dec[ci].value === want,
           'the editor does not mark cutoff with the lane\'s value ' + want + ': ' + JSON.stringify(dec));
    assert(Object.keys(dec).length === 1, 'another cell is marked: ' + JSON.stringify(dec));
    /* ...and it reached the editor's controller, not just dAVEBOx's memo. */
    const held = snd.soundPPForTest().decorations;
    assert(held && held[ci] && held[ci].highlight && held[ci].value === want, 'the controller holds ' + JSON.stringify(held));
    assert(S.trackActiveBank[T] === BANK_AUTOMATION && S.activeBank === BANK_AUTOMATION, 'a bank moved: ' + S.activeBank + '/' + S.trackActiveBank[T]);
    assert(S.autoCycle && S.autoCycle.target === TARGETS.chain, 'the steps left the lane during the hold');
    sets.length = 0;
    cc(71 + pp.page.keys.indexOf('cutoff'), 1); ticks(2);
    const w = sets.filter(x => x.indexOf('_pa_hold_write=') >= 0 && x.indexOf(TARGETS.chain) >= 0);
    assert(w.length >= 1, 'the editor knob wrote no lock, got ' + JSON.stringify(sets));
    const f = w[w.length - 1].split('=')[1].split(' ');
    assert(f[2] === '3' && f[3] === '3' && f[4] === '24', 'the lock is not on step 4: ' + w[w.length - 1]);
    note(STEP(3), 0); ticks(2);
    assert(!snd.soundOpen() && S.activeBank === BANK_AUTOMATION, 'release did not close the editor');
    assert(S.autoBank.menu && S.autoBank.sel === idx, 'not on the same row: ' + JSON.stringify(S.autoBank));
    back(); ticks(1);
});

step('a press and release inside ONE tick never opens sound mode', () => {
    openMenuOn(TARGETS.level); ticks(2);
    note(STEP(3), 127); note(STEP(3), 0); ticks(4);
    assert(!snd.soundOpen() && S.activeBank === BANK_AUTOMATION, 'a tap opened SOUND + CONFIG: bank ' + S.activeBank + ' open ' + snd.soundOpen());
    back(); ticks(1);
});

step('⭐ HOLD a MIDI point -> MACROS while held; release -> the same row', () => {
    const idx = openMenuOn(TARGETS.midi); ticks(2);
    note(STEP(3), 127); ticks(4);
    assert(snd.soundOpen() && S.activeBank === BANK_MACROS, 'not on MACROS while held: bank ' + S.activeBank);
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the hold RECORDED bank ' + S.trackActiveBank[T]);
    note(STEP(3), 0); ticks(2);
    assert(S.activeBank === BANK_AUTOMATION && !snd.soundOpen() && S.autoBank.sel === idx, 'release did not come back to the row');
    back(); ticks(1);
});

/* Josh, 2026-09-28: a SnapMorph lane said NO EDITOR to Shift + click and did
 * nothing on a hold — "it should take me to the macro screen for the track". */
step('⭐ HOLD a SnapMorph point -> MACROS while held; release -> the same row', () => {
    const idx = openMenuOn(TARGETS.morph); ticks(2);
    S.actionPopupLines = [];
    note(STEP(3), 127); ticks(4);
    assert(!(S.actionPopupLines || []).some(l => /NO EDITOR/.test(l)), 'NO EDITOR: ' + JSON.stringify(S.actionPopupLines));
    assert(snd.soundOpen() && S.activeBank === BANK_MACROS, 'not on MACROS while held: bank ' + S.activeBank);
    assert(S.trackActiveBank[T] === BANK_AUTOMATION, 'the hold RECORDED bank ' + S.trackActiveBank[T]);
    note(STEP(3), 0); ticks(2);
    assert(S.activeBank === BANK_AUTOMATION && !snd.soundOpen() && S.autoBank.sel === idx, 'release did not come back to the row');
    back(); ticks(1);
});

step('a SnapMorph lane of ANOTHER track has no home here', () => {
    assert(bank.laneHome('mac:' + T + ':2', T) && bank.laneHome('mac:' + T + ':2', T).kind === 'macros', 'own track: not MACROS');
    assert(bank.laneHome('mac:' + (T + 1) + ':2', T) === null, 'another track\'s knob placed on this one');
});

step('⭐ a MOVE-routed track (its lanes on slot 0, by BUS): Volume and an insert reach their screens by both gestures', () => {
    const savedList = LIST, savedSteps = STEPS, savedVals = VALS;
    const MV = '0:move_fx:2:volume', MFX = '0:move_fx:2:fx1:cutoff';
    S.trackRoute[T] = 1; S.trackChannel[T] = 2;        /* Move 2 = bus 2 */
    LIST = [MV, MFX].map(tg => T + ' 0 1 2 ' + tg + ' 0').join('\n') + '\n';
    STEPS = [MV, MFX].map(tg => tg + ' 0001000000000000').join('\n') + '\n';
    VALS = [MV, MFX].map(tg => tg + ' ' + '7f'.repeat(16)).join('\n') + '\n';
    auto.automationRefreshPresence();
    try {
        let idx = openMenuOn(MV); ticks(2);
        shiftClick(); ticks(4);
        assert(snd.soundOpen() && S.activeBank === BANK_SOUND, 'Shift+click on the bus Volume lane: not SOUND + CONFIG (bank ' + S.activeBank + ')');
        assertLaneOnSteps(MV, 'bus Volume after the jump');
        back(); ticks(4); back(); ticks(1);
        idx = openMenuOn(MV); ticks(2);
        note(STEP(3), 127); ticks(4);
        assert(snd.soundOpen() && S.activeBank === BANK_SOUND, 'holding a bus Volume point: not SOUND + CONFIG (bank ' + S.activeBank + ')');
        note(STEP(3), 0); ticks(2);
        assert(S.activeBank === BANK_AUTOMATION && !snd.soundOpen() && S.autoBank.sel === idx, 'bus Volume release did not come back');
        back(); ticks(1);
        idx = openMenuOn(MFX); ticks(2);
        note(STEP(3), 127); ticks(10);
        assert(snd.soundOpen() && snd.soundViewForTest() === VIEW_EDIT, 'holding a bus insert point: not in its editor (view ' + snd.soundViewForTest() + ')');
        const pp = snd.soundPPForTest();
        assert(pp.on && pp.page && (pp.page.keys || []).indexOf('cutoff') >= 0, 'the insert editor is not on the page holding cutoff');
        const bus = snd.soundBusForTest();
        assert(bus && bus.id === 'move2', 'the insert editor was entered as a chain slot, not through bus 2: ' + JSON.stringify(bus));
        note(STEP(3), 0); ticks(2);
        assert(!snd.soundOpen() && S.autoBank.sel === idx, 'bus insert release did not come back');
        back(); ticks(1);
    } finally {
        S.trackRoute[T] = 0; S.trackChannel[T] = T + 1;
        LIST = savedList; STEPS = savedSteps; VALS = savedVals; auto.automationRefreshPresence();
    }
});

step('⭐ leaving the track leaves the AUTOMATION menu: back on it, the card shows and a click opens the list', () => {
    openMenuOn(TARGETS.seq); ticks(2);
    assert(S.autoBank.menu, 'rig: menu open');
    /* The bank map's track pick (Shift + bottom-row pad was retired 2026-10-08). */
    const swap = (t) => { _selectTrack(t); ticks(2); };
    swap(0);
    assert(S.activeTrack === 0, 'rig: on track 1');
    swap(T);
    assert(S.activeTrack === T && S.activeBank === BANK_AUTOMATION, 'rig: back on AUTOMATION');
    assert(!S.autoBank.menu && !S.autoBank.ops, 'the menu was still open on return: ' + JSON.stringify(S.autoBank));
    assert(!S.autoCycle, 'the lane was still on the steps on return');
    click(); ticks(1);
    assert(S.autoBank.menu, 'one click did not open the list');
    back(); ticks(1);
});

step('⭐ a CLEARED (empty, kept) lane: its steps are dark, and holding one still jumps to add a value', () => {
    const savedList = LIST, savedSteps = STEPS, savedVals = VALS;
    LIST = LIST.split('\n').map(l => l.indexOf(' ' + TARGETS.seq + ' ') >= 0 ? l.replace(/^(\d+ \d+ )(\d+) (\d+)/, (m, a, f) => a + (parseInt(f, 10) | 32) + ' 0') : l).join('\n');
    STEPS = STEPS.split('\n').filter(l => l.indexOf(TARGETS.seq) < 0).join('\n');
    VALS = VALS.split('\n').filter(l => l.indexOf(TARGETS.seq) < 0).join('\n');
    auto.automationRefreshPresence();
    try {
        const idx = openMenuOn(TARGETS.seq); ticks(2);
        for (let n = 0; n < 40; n++) ticks(1);
        assert(S.autoCycle && S.autoCycle.target === TARGETS.seq, 'the empty lane is not on the steps');
        assert(S.autoLaneVals && S.autoLaneVals.every(v => v < 0), 'the empty lane has values: ' + JSON.stringify(S.autoLaneVals));
        assert(leds[STEP(0)] === 0 && leds[STEP(9)] === 0, 'the empty lane\'s steps are not dark: ' + leds[STEP(0)] + ', ' + leds[STEP(9)]);
        note(STEP(6), 127); ticks(3);
        assert(S.activeBank === seq.bank, 'holding a step of the empty lane did not jump: bank ' + S.activeBank);
        sets.length = 0;
        cc(71 + seq.k, 1); ticks(2);
        assert(sets.some(x => x.indexOf('_pa_hold_write=') >= 0 && x.indexOf(TARGETS.seq + ' 6 6 24 ') >= 0), 'no new value on step 7: ' + JSON.stringify(sets));
        note(STEP(6), 0); ticks(2);
        assert(S.activeBank === BANK_AUTOMATION && S.autoBank.sel === idx, 'release did not come back');
        back(); ticks(1);
    } finally {
        LIST = savedList; STEPS = savedSteps; VALS = savedVals; auto.automationRefreshPresence();
    }
});

step('CONTROL: deleting the pinned lane ends the pin', () => {
    openMenuOn(TARGETS.level); ticks(2);
    shiftClick(); ticks(4);
    assert(bank.autoLanePinActive() && S.autoCycle, 'rig: pinned');
    const saved = LIST;
    LIST = LIST.split('\n').filter(l => l.indexOf(TARGETS.level) < 0).join('\n');
    auto.automationRefreshPresence(); ticks(2);
    assert(!bank.autoLanePinActive() && !S.autoCycle, 'a deleted lane stayed on the steps');
    LIST = saved; auto.automationRefreshPresence();
    back(); ticks(2); back(); ticks(1);
});

step('CONTROL: a view switch ends the pin (and its Back crumb)', () => {
    openMenuOn(TARGETS.seq); ticks(2);
    shiftClick(); ticks(4);
    assert(S.autoCycle && S.autoCycle.target === TARGETS.seq, 'rig: pinned');
    for (let k = 0; k < 3 && !S.sessionView; k++) { cc(50, 127); ticks(1); cc(50, 0); ticks(2); }   /* Note/Session: to Session view */
    assert(S.sessionView, 'rig: in Session view');
    assert(!bank.autoLanePinActive() && !S.autoCycle, 'the lane survived a view switch');
    assert(S.autoReturn === null, 'the Back crumb survived a view switch');
    S.sessionView = false; ticks(1);
});

step('CONTROL: a bank picked by hand ends the pin', () => {
    assert(!S.sessionView, 'rig: back in track view');
    openMenuOn(TARGETS.seq); ticks(2);
    shiftClick(); ticks(4);
    assert(bank.autoLanePinActive(), 'rig: pinned');
    const inp = globalThis.__inp;
    S.bankPickerSel = 0; inp.applyBankPick(); ticks(2);
    assert(!bank.autoLanePinActive(), 'a hand-picked bank kept the lane on the steps');
});

/* Josh, 2026-10-20: "Steps should revert to note mode when I leave the
 * automation areas (note, this doesn't include when I shift click jog to view
 * the automated [param] in its context - that should remain in automation mode
 * until I leave the place it jumped me to)". A jump into SOUND mode — SOUND +
 * CONFIG, MACROS, a module's editor — is left by a pad-map pick of ANOTHER bank
 * even when sound mode itself stays open (SOUND -> MACROS). */
/* [kind, bank, its pad on the map]: MACROS [1,0] = pad 93, SOUND [1,3] = 69,
 * NOTE FX [3,0] = 95 (row 0 is the top pad row). */
for (const [kind, to, pad] of [['level', BANK_MACROS, 93], ['midi', BANK_SOUND, 69], ['chain', 1, 95]]) {
    step('⭐ ' + kind + ' jump, then the PAD MAP to another bank: the steps go back to notes', () => {
        openMenuOn(TARGETS[kind]); ticks(2);
        shiftClick(); ticks(kind === 'chain' ? 10 : 4);
        assert(bank.autoLanePinActive() && S.autoCycle, 'rig: pinned');
        cc(3, 127); ticks(60);                          /* hold the jog: the map */
        note(pad, 127); ticks(2); note(pad, 0); ticks(2);
        cc(3, 0); ticks(6);
        assert(S.activeBank === to, 'rig: on bank ' + to + ' (got ' + S.activeBank + ')');
        assert(!bank.autoLanePinActive() && !S.autoCycle, kind + ': the lane stayed on the steps after leaving (bank ' + S.activeBank + ', sound ' + snd.soundOpen() + ')');
        if (snd.soundOpen()) snd.soundExit();
        ticks(2);
    });
}

/* Josh, 2026-10-20, on device: "shift plus click on the automation row, then
 * pad map>instrument". The map's MODULE pads (right 4x4: MIDI FX, INSTRUMENT,
 * FX 1-4) open an editor without picking a bank, so the bank-pick path that
 * ends the pin never ran. INSTRUMENT [6,1] = pad 90, FX 1 [7,0] = pad 99. */
for (const [kind, pad, what] of [['seq', 90, 'INSTRUMENT'], ['seq', 99, 'FX 1'], ['morph', 90, 'INSTRUMENT'], ['level', 90, 'INSTRUMENT'], ['midi', 90, 'INSTRUMENT'], ['chain', 90, 'INSTRUMENT'], ['level', 99, 'FX 1']]) {
    step('⭐ ' + kind + ' jump, then the PAD MAP to ' + what + ': the steps go back to notes', () => {
        openMenuOn(TARGETS[kind]); ticks(2);
        shiftClick(); ticks(kind === 'chain' ? 10 : 4);
        assert(bank.autoLanePinActive() && S.autoCycle, 'rig: pinned');
        cc(3, 127); ticks(60);                          /* hold the jog: the map */
        note(pad, 127); ticks(2); note(pad, 0); ticks(2);
        cc(3, 0); ticks(10);                            /* the module pad opens on release */
        assert(!bank.autoLanePinActive() && !S.autoCycle, kind + ' -> ' + what + ': the lane stayed on the steps (bank ' + S.activeBank + ', sound ' + snd.soundOpen() + ')');
        if (snd.soundOpen()) snd.soundExit();
        ticks(2);
    });
}

/* Josh, 2026-10-20, on device, after the pin fix: "pad map inst > still shows
 * automation on steps, and when i hold jog to reveal pad map again, it says
 * i'm on automation". An editor opened from the map sits OVER the AUTOMATION
 * bank, its list still open underneath — the list must not drive the steps. */
for (const viaMap of [false, true])
for (const [kind, jump] of [['chain', true], ['chain', false], ['level', false]]) {
    step('⭐ ' + (jump ? kind + ' jump' : 'the AUTOMATION list (' + kind + ')') + (viaMap ? ' opened from the map' : '') + ', then the map\'s INSTRUMENT: the steps go back to notes', () => {
        (viaMap ? openMenuViaMap : openMenuOn)(TARGETS[kind]); ticks(2);
        if (jump) { shiftClick(); ticks(10); }
        assert(S.autoCycle, 'rig: the lane on the steps');
        cc(3, 127); ticks(60);
        note(90, 127); ticks(2); note(90, 0); ticks(2);
        cc(3, 0); ticks(10);
        assert(snd.soundOpen(), 'rig: the instrument editor opened (bank ' + S.activeBank + ')');
        assert(!S.autoCycle, 'the lane stayed on the steps behind the editor (bank ' + S.activeBank + ', pin ' + bank.autoLanePinActive() + ')');
        snd.soundExit(); ticks(4);
    });
}

/* The device state the rig's map cannot reach (on the Move the map's pick left
 * the list open under the editor): an editor up over the OPEN list, no pin. */
step('⭐ an editor over the open AUTOMATION list, no pin: the list does not drive the steps', () => {
    openMenuOn(TARGETS.chain); ticks(2);
    shiftClick(); ticks(10);
    assert(snd.soundOpen() && bank.autoMenuUp() && bank.autoLanePinActive() && S.autoCycle, 'rig: the jump, list open underneath');
    bank.autoLanePinClear(); ticks(3);
    assert(bank.autoMenuUp(), 'rig: the list is still open underneath');
    assert(!S.autoCycle, 'the list drove the steps from behind the editor');
    snd.soundExit(); ticks(4);
    assert(bank.autoMenuUp() && S.autoCycle, 'the editor gone, the list did not take the steps back (menu ' + bank.autoMenuUp() + ')');
});

/* Josh, 2026-10-20: "now when i jump from instrument view back to automation,
 * it stays on instrument. and when i'm IN instrument view it says i'm in
 * automation on the map ... (same thing happens with fx automation and
 * jumping to fx module editor on map)". AUTOMATION [1,1] = pad 85,
 * INST [2,3] = 70, FX 1 [7,0] = 99. */
for (const viaMap of [false, true])
/* Josh, later: "it shows that i'm in instrument mode on the pads when viewing
 * it in the automation context" — a JUMP's editor is still AUTOMATION's. */
for (const [how, pad, curWant] of [['the jump', null, { c: 1, r: 1 }], ['the map\'s FX 1', 99, null]]) {
    step('⭐ in an editor over AUTOMATION (' + how + (viaMap ? ', AUTOMATION opened from the map' : '') + '): the map marks the editor, and its AUTOMATION pad goes back to the list', () => {
        (viaMap ? openMenuViaMap : openMenuOn)(TARGETS.chain); ticks(2);
        if (pad === null) { shiftClick(); ticks(10); }
        else { cc(3, 127); ticks(60); note(pad, 127); ticks(2); note(pad, 0); ticks(2); cc(3, 0); ticks(10); }
        assert(snd.soundInEditor(), 'rig: an editor is up (comp ' + snd.soundCompForTest() + ')');
        cc(3, 127); ticks(60);                          /* the map, over the editor */
        assert(S.bankMapUp, 'rig: the map is up');
        const cur = render.bankMapItems().cur;
        assert(JSON.stringify(cur) === JSON.stringify(curWant), 'the map marks ' + JSON.stringify(cur) + ', wanted ' + JSON.stringify(curWant) + ' (AUTOMATION is [1,1])');
        const W = LEDK.White, lit = (p) => leds[p] === W;
        assert(pad === null ? lit(85) && !lit(90) && !lit(70) : !lit(85) && lit(99) && !lit(90), 'the editor\'s pad is not the White one (90 ' + leds[90] + ', 70 ' + leds[70] + ', 99 ' + leds[99] + ')');
        note(85, 127); ticks(2); note(85, 0); ticks(2);
        cc(3, 0); ticks(10);
        assert(!snd.soundOpen(), 'the editor stayed up after picking AUTOMATION');
        assert(S.activeBank === BANK_AUTOMATION && bank.autoMenuUp() && S.autoCycle, 'not back on the lane list (bank ' + S.activeBank + ', menu ' + bank.autoMenuUp() + ')');
        back(); ticks(4); back(); ticks(4);
    });
}

/* Josh, 2026-10-21: "Automation lane picker. Need to add hints for shift. Get
 * rid of jog:row and back:card (those are self explanatory)". */
step('the lane list\'s footer: CLK OPS, and SHFT JUMP on a lane that has a place to jump to; no JOG ROW / BACK CARD', () => {
    const idx = openMenuOn(TARGETS.seq); ticks(1);
    globalThis.clear_screen(); render.drawUI();
    const h = () => JSON.stringify(movy.kitHintsForTest());
    assert(h() === JSON.stringify([['CLK', 'OPS'], ['SHFT', 'JUMP']]), 'on a lane row: ' + h());
    S.autoBank.sel = bank.autoBankRows(T, 0).length;                 /* + Add lane */
    globalThis.clear_screen(); render.drawUI();
    assert(h() === JSON.stringify([['CLK', 'ADD']]), 'on + Add lane: ' + h());
    S.autoBank.sel = bank.autoBankRows(T, 0).length + 1;             /* the Clear all row */
    globalThis.clear_screen(); render.drawUI();
    assert(h() === JSON.stringify([['CLK', 'CLEAR']]), 'on Clear all (a click clears the clip, nothing to jump to): ' + h());
    S.autoBank.sel = idx;
    back(); ticks(1); back(); ticks(1);
});

/* Review, 2026-10-21: a jump that LANDS ON A BANK (a seq knob -> its bank,
 * a level -> SOUND + CONFIG) is the automation context too: the map marks
 * AUTOMATION, not the bank the jump landed on. */
for (const kind of ['seq', 'level']) {
    step('after a ' + kind + ' jump the map marks AUTOMATION, not the bank it landed on', () => {
        openMenuOn(TARGETS[kind]); ticks(2);
        shiftClick(); ticks(10);
        assert(bank.autoLanePinActive() && S.activeBank !== BANK_AUTOMATION, 'rig: jumped off AUTOMATION (bank ' + S.activeBank + ')');
        cc(3, 127); ticks(60);
        assert(S.bankMapUp, 'rig: the map is up');
        const cur = render.bankMapItems().cur;
        assert(JSON.stringify(cur) === JSON.stringify({ c: 1, r: 1 }), 'the map marks ' + JSON.stringify(cur) + ', not AUTOMATION [1,1]');
        assert(leds[85] === LEDK.White, 'the AUTOMATION pad is not the White one (' + leds[85] + ')');
        cc(3, 0); ticks(10);
        if (snd.soundOpen()) snd.soundExit();
        back(); ticks(4); back(); ticks(4);
    });
}

/* Josh, 2026-10-20: "BACK from instrument mode puts me back into the
 * automation list when entered through automation context". A module pick off
 * the map LEAVES AUTOMATION: Back from that editor returns to the bank the
 * AUTOMATION door was opened from (CLIP), not to the list. */
for (const jump of [false, true]) {
    step('⭐ AUTOMATION from the map' + (jump ? ', a jump' : '') + ', the map\'s INSTRUMENT, then Back: CLIP, not the lane list', () => {
        openMenuViaMap(TARGETS.chain); ticks(2);
        if (jump) { shiftClick(); ticks(10); }
        cc(3, 127); ticks(60); note(90, 127); ticks(2); note(90, 0); ticks(2); cc(3, 0); ticks(10);
        assert(snd.soundInEditor(), 'rig: the instrument editor is up');
        assert(!__inp.doorScreenUp() && S.activeBank === 0, 'AUTOMATION is still under the editor (bank ' + S.activeBank + ')');
        back(); ticks(6);
        assert(!snd.soundOpen() && S.activeBank === 0 && !bank.autoMenuUp(), 'Back did not land on CLIP (bank ' + S.activeBank + ', menu ' + bank.autoMenuUp() + ', sound ' + snd.soundOpen() + ')');
    });
}

step('CONTROL: AUTOMATION from the map, a jump, then Back (no map): the lane list, as ruled', () => {
    openMenuViaMap(TARGETS.chain); ticks(2);
    shiftClick(); ticks(10);
    assert(snd.soundInEditor(), 'rig: the jump opened the editor');
    back(); ticks(6);
    assert(!snd.soundOpen() && S.activeBank === BANK_AUTOMATION && bank.autoMenuUp(), 'Back from the jump did not return to the list (bank ' + S.activeBank + ')');
    back(); ticks(4);
});

/* The same for an ordinary bank: CLIP [2,1] = pad 86. */
step('⭐ CLIP, the map\'s INSTRUMENT, then the map\'s CLIP: the editor closes and CLIP is shown', () => {
    __inp.bankMapEnd();
    S.bankPickerSel = -1;
    const mapPick = (p) => { cc(3, 127); ticks(60); note(p, 127); ticks(2); note(p, 0); ticks(2); cc(3, 0); ticks(10); };
    mapPick(86);
    assert(S.activeBank === 0 && !snd.soundOpen(), 'rig: on CLIP (bank ' + S.activeBank + ')');
    mapPick(90);
    assert(snd.soundInEditor(), 'rig: the instrument editor is up');
    mapPick(86);
    assert(!snd.soundOpen() && S.activeBank === 0, 'the editor stayed up after picking CLIP (bank ' + S.activeBank + ')');
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
if (failed) process.exit(1);
console.log('test_automation_lane_pin: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
