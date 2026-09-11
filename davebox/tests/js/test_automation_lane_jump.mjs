import './_bulk_get_stub.mjs';
/* tests/js/test_automation_lane_jump.mjs — SHIFT + CLICK A LANE JUMPS TO ITS
 * PARAMETER (plan 6c2).
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
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? LIST : '');
globalThis.shadow_get_param = (slot, key) => (slot === 1 && key in CHAIN ? CHAIN[key] : (/:(osc_|cutoff|reso)/.test(key) ? '0.5' : ''));
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
globalThis.move_midi_internal_send = () => true;
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
const VIEW_EDIT = 1;

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
const TARGETS = { seq: 'seq:' + T + ':' + seq.key, chain: T + ':synth:cutoff', level: T + ':slot:volume', midi: 'cc:74' };
S.trackActiveClip[T] = 0; S.trackQueuedClip[T] = -1;
LIST = Object.values(TARGETS).map(tg => T + ' 0 1 2 ' + tg + ' 0').join('\n') + '\n';
auto.automationRefreshPresence();

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
/* A gesture entry does NOT record the bank it lands on (the rule since
 * 2026-09-05: only the jog's walk records) — or leaving without Back would
 * leave the track sitting on a bank it was sent to.
 * ⚠ NOT asserted for the MACROS landing: writeSidecar records any bank reached
 * while the card is LATCHED ("latched means the jog walked there",
 * ui_persistence), and the jump keeps the card up. The return corrects it
 * (asserted above), so the wrinkle is confined to leaving by another route. */
function assertNotRecorded(what) {
    assert(S.trackActiveBank[T] === BANK_AUTOMATION,
           what + ': the jump RECORDED bank ' + S.trackActiveBank[T] + ' on the track');
}

step('CONTROL: a PLAIN click on a lane still opens its ops', () => {
    openMenuOn(TARGETS.chain);
    click();
    assert(S.autoBank.ops && S.activeBank === BANK_AUTOMATION, 'the plain click no longer opens the ops');
    back();
});

step('⭐ seq lane -> its davebox BANK; Back -> the AUTOMATION menu on that lane', () => {
    const idx = openMenuOn(TARGETS.seq);
    shiftClick(); ticks(3);
    assert(S.activeBank === seq.bank && S.bankCardLatched, 'landed on bank ' + S.activeBank + ', wanted ' + seq.bank);
    assertBackToLane(idx, 'seq', true);
    back(); ticks(1);
    assert(!S.autoBank.menu, 'CONTROL: the next Back closes the menu as always');
});

step('⭐⭐ module lane -> the EDITOR, on the page holding the parameter; Back -> the menu on that lane', () => {
    const idx = openMenuOn(TARGETS.chain);
    shiftClick(); ticks(10);
    assert(snd.soundOpen() && snd.soundViewForTest() === VIEW_EDIT, 'not in the module editor: view ' + snd.soundViewForTest());
    assertNotRecorded('module');
    const pp = snd.soundPPForTest();
    assert(pp.on && pp.page, 'the grid is not up');
    assert((pp.page.keys || []).indexOf('cutoff') >= 0,
           'landed on "' + pp.page.name + '" (' + JSON.stringify(pp.page.keys) + '), not the page holding cutoff');
    assertBackToLane(idx, 'module', true);
});

step('⭐ level lane -> SOUND + CONFIG; Back -> the menu on that lane', () => {
    const idx = openMenuOn(TARGETS.level);
    shiftClick(); ticks(4);
    assert(snd.soundOpen() && S.activeBank === BANK_SOUND, 'not on SOUND + CONFIG: bank ' + S.activeBank);
    assertNotRecorded('level');
    assertBackToLane(idx, 'level', true);
});

step('⭐ MIDI lane -> MACROS; Back -> the menu on that lane', () => {
    const idx = openMenuOn(TARGETS.midi);
    shiftClick(); ticks(4);
    assert(snd.soundOpen() && S.activeBank === BANK_MACROS, 'not on MACROS: bank ' + S.activeBank);
    assertBackToLane(idx, 'midi', true);
});

step('⭐ HOLDING SHIFT KEEPS THE LANE LIST ON SCREEN — it does not fall to the track overview', () => {
    /* Josh, 2026-09-11, testing the jump: "holding shift puts the oled in track
     * overview mode, which is really confusing." Shift is the track-switch
     * modifier and the overview is its read-out, but the jump is a gesture ON
     * the list, so the list has to survive the modifier. */
    openMenuOn(TARGETS.chain);
    cc(49, 127); shiftHeld = 1;
    assert(render.bankCardVisible(), 'the menu vanished the moment Shift went down');
    cc(49, 0); shiftHeld = 0;
    assert(render.bankCardVisible(), 'the menu did not come back');
    /* CONTROL: with no menu open, Shift still shows the overview, as always. */
    bank.autoBankReset();
    cc(49, 127); shiftHeld = 1;
    assert(!render.bankCardVisible(), 'the plain card no longer obeys the Shift read-out rule');
    cc(49, 0); shiftHeld = 0;
});

step('CONTROL: with the ops pop-up open, Shift + click is NOT a jump', () => {
    openMenuOn(TARGETS.chain);
    click();                                           /* the lane -> its ops */
    assert(S.autoBank.ops, 'rig: the ops did not open');
    shiftClick(); ticks(3);
    assert(S.activeBank === BANK_AUTOMATION && !snd.soundOpen(),
           'the jump fired from inside the ops pop-up (bank ' + S.activeBank + ')');
    back(); back();
});

step('CONTROL: walking off the destination bank spends the return — Back is the bank\'s own', () => {
    openMenuOn(TARGETS.seq);
    shiftClick(); ticks(3);
    const other = seq.bank === 0 ? 1 : 0;
    S.activeBank = other; S.trackActiveBank[T] = other;   /* as a jog walk leaves it */
    back(); ticks(2);
    assert(S.activeBank === other && !S.bankCardLatched, 'a stale return fired from a bank it never sent you to');
    assert(S.autoReturn === null, 'the crumb survived the Back');
});

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
if (failed) process.exit(1);
console.log('test_automation_lane_jump: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
