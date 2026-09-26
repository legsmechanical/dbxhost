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
const { BANKS, BANK_AUTOMATION, BANK_SOUND, BANK_MACROS, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const bank = await import('../../ui/ui_automation_bank.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const render = await import('../../ui/ui_render.mjs');
globalThis.__inp = await import('../../ui/ui_input_cc.mjs');
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
    const w = sets.filter(x => x.indexOf('_pa_set2=') >= 0 && x.indexOf(TARGETS.seq) >= 0);
    assert(w.length >= 1, 'no lock written for the lane, got ' + JSON.stringify(sets));
    const f = w[w.length - 1].split('=')[1].split(' ');
    assert(f[2] === '120' && f[3] === '143', 'the lock is not on step 6 (ticks 120..143): ' + w[w.length - 1]);
    note(STEP(5), 0); ticks(1);
    back(); ticks(2); back(); ticks(1);
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

if (swallowed !== null) { console.error('  FAIL — a SWALLOWED exception reached the jserr log:\n' + swallowed); failed = 1; }
if (failed) process.exit(1);
console.log('test_automation_lane_pin: all ok');
}
main().catch(e => { console.error(e); process.exit(1); });
