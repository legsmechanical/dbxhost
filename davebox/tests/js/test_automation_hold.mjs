import './_bulk_get_stub.mjs';
/* tests/js/test_automation_hold.mjs — WITH A LANE SELECTED, A STEP PRESS IS AN
 * AUTOMATION HOLD: it never toggles, creates or clears a note.
 *
 * The step buttons show the selected lane's cycle (not the notes), so a press
 * there is about the LANE. Before this, a tap on the AUTOMATION bank toggled a
 * note on a page the user could not see. Taps AND holds, melodic AND drum, with
 * the control that the same tap with no row selected still edits a note.
 *
 * ---- original header of the rig (test_automation_bank_cycle.mjs): ----
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
    const m = /^(t\d+_c\d+)_pa_steps$/.exec(k);
    if (m) return STEPS[m[1]] || '';
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
const { BANKS, BANK_AUTOMATION, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 0;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.clockFollowTicks = true; S.playing = false;
const T = 0, C = 0;
const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note  = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const right = () => { cc(63, 127); cc(63, 0); };
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
const STEP = (i) => 16 + i;
const tap  = (i) => { note(STEP(i), 127); ticks(1); note(STEP(i), 0); ticks(3); };
const hold = (i) => { note(STEP(i), 127); ticks(60); note(STEP(i), 0); ticks(3); };
const noteWrites = () => sets.filter(s => /_step_\d+_|_l\d+_step_/.test(s));

function seedMelodic() {
    S.trackPadMode[T] = 0; S.trackActiveClip[T] = C; S.trackQueuedClip[T] = -1;
    S.clipLength[T][C] = 32; S.clipLoopStart[T][C] = 0; S.trackCurrentPage[T] = 0; S.clipTPS[T][C] = 24;
    for (let i = 0; i < S.clipSteps[T][C].length; i++) S.clipSteps[T][C][i] = (i === 4 || i === 20) ? 1 : 0;
    S.lastPlayedNote = 60;
    S.stepRecActive = false; S.copyHeld = false; S.heldStep = -1; S.heldStepBtn = -1;
}
LIST = '0 0 1 3 0:synth:cutoff 1536 5 100\n';
auto.automationRefreshPresence();
seedMelodic();
S.activeBank = BANK_AUTOMATION; S.trackActiveBank[T] = BANK_AUTOMATION; S.bankCardLatched = true;

step('CONTROL: with NO row selected, a tap on a filled step still clears the note', () => {
    ticks(2);
    assert(S.autoCycle === null, 'setup: no row');
    sets.length = 0;
    tap(4);
    assert(noteWrites().length > 0, 'the tap should edit a note, got ' + JSON.stringify(sets));
    seedMelodic();
});

step('⭐ with a row selected, taps on empty and filled steps write NO note edit', () => {
    click(); ticks(2);
    assert(S.autoCycle && S.autoCycle.pages === 4, 'setup: the lane is selected');
    sets.length = 0;
    tap(4); tap(9);
    right(); ticks(1); tap(4);                   /* step 21: a filled step of the clip */
    assert(noteWrites().length === 0, 'no note writes, got ' + JSON.stringify(noteWrites()));
    assert(S.clipSteps[T][C][4] === 1 && S.clipSteps[T][C][20] === 1 && S.clipSteps[T][C][9] === 0,
           'the clip\'s steps are untouched');
});

step('a HOLD is an automation hold on the lane\'s step, and its release commits nothing', () => {
    sets.length = 0;
    note(STEP(6), 127); ticks(30);
    assert(S.heldStep === 22 && S.heldStepAuto === true, 'held step 23 of the lane (page 2), got ' + S.heldStep + ' auto=' + S.heldStepAuto);
    note(STEP(6), 0); ticks(3);
    assert(S.heldStep === -1 && S.heldStepAuto === false, 'released');
    assert(noteWrites().length === 0, 'no note writes on release, got ' + JSON.stringify(noteWrites()));
});

step('the flag does not leak: after Back, a plain tap edits notes again', () => {
    back(); ticks(2); seedMelodic();
    sets.length = 0;
    tap(4);
    assert(noteWrites().length > 0, 'a normal tap works after an automation hold');
    seedMelodic();
});

step('DRUM: with a row selected, a tap does not toggle a hit', () => {
    S.trackPadMode[T] = PAD_MODE_DRUM; S.drumLaneLength[T] = 16; S.drumLaneTPS[T] = 24; S.drumLaneLoopStart[T] = 0;
    S.drumStepPage[T] = 0;
    const lane = S.activeDrumLane[T] | 0;
    S.drumLaneSteps[T][lane] = '0'.repeat(256);
    click(); ticks(2);
    assert(S.autoCycle, 'setup: drum row selected');
    sets.length = 0;
    tap(2); hold(3);
    assert(noteWrites().length === 0, 'no drum step writes, got ' + JSON.stringify(noteWrites()));
    assert(S.drumLaneSteps[T][lane][2] === '0', 'the lane\'s step stays empty');
    back(); S.trackPadMode[T] = 0;
});

if (failed) { console.error('FAIL: test_automation_hold'); process.exit(1); }
console.log('PASS: test_automation_hold');
}
main().catch(e => { console.error(e); process.exit(1); });
