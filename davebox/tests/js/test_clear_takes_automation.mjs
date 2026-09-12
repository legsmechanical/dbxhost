import './_bulk_get_stub.mjs';
/* tests/js/test_clear_takes_automation.mjs — AUTOMATION FOLLOWS WHAT IT
 * AUTOMATES (Josh, 2026-09-12; plan Block 2b).
 *
 * His words: "clip reset and sequence clear should also clear all automation -
 * as should bank param clear on the automation bank. bank param clear
 * elsewhere should clear automation associated with params on that bank."
 *
 * Two rulings turn those four rules into one principle (Josh, 2026-09-12):
 *   · a NOTE clear empties the clip, so ALL of that clip's automation goes
 *     ("all of the clip/row ones");
 *   · a PARAM clear takes only the automation for the params IT resets.
 *
 * ⚠⚠ EVERY CHECK HERE PERFORMS THE REAL GESTURE — Delete + track button,
 * Shift+Delete + jog click, Delete + jog click — and reads the queue the
 * device would drain. Calling the helpers would pass against a screen no
 * session can reach; that mistake has been made in this tree three times.
 * [[wired-is-not-reachable]]
 *
 * ⚠ AND THE ORDER IS AN ASSERTION, not an accident. The undo unit is the
 * clip snapshot `undo_begin_single` takes, and it INCLUDES the automation
 * (pa_undo_capture). So the automation clear must arrive AFTER the clear that
 * took the snapshot — otherwise undo restores the notes and leaves the
 * automation gone, which is half a clear and worse than either outcome.
 */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}
function assert(c, m) { if (!c) throw new Error(m); }

let LIST = '';
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
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.shadow_send_midi_to_dsp = () => {};
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
const { BANKS, BANK_AUTOMATION, SEQ_AUTO_TARGETS } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const snd = await import('../../ui/ui_sound.mjs');

/* ⚠ Track 2 (index 1). Track 1 is a DRUM track by default, and a "melodic"
 * gesture on it edits a hidden clip while every store check still passes.
 * [[harness-track-1-is-a-drum-track]] */
const T = 1;
const CHAIN_TGT = T + ':synth:cutoff';

/* ⭑ The bank->target map is DERIVED from the fork's own declaration, never
 * from literals: SEQ_AUTO_TARGETS comes from BANK_MACRO_ALLOW which comes from
 * BANKS[b].knobs[k]. A test with its own list would pass while the real
 * ownership table said something else. */
function targetsOfBank(b) {
    return Object.keys(SEQ_AUTO_TARGETS)
        .filter(k => SEQ_AUTO_TARGETS[k].bank === b)
        .map(k => 'seq:' + T + ':' + k);
}
const B0 = targetsOfBank(0), B1 = targetsOfBank(1), B3 = targetsOfBank(3), B5 = targetsOfBank(5);
assert(B0.length && B1.length && B3.length && B5.length,
       'the fixture needs automatable params on banks 0, 1, 3 and 5');

/* Every lane above, in clip 0 AND in clip 1 — clip 1 is the CONTROL that a
 * clear is scoped to the clip it was performed on. */
const ALL = [...B0, ...B1, ...B3, ...B5, CHAIN_TGT];
function seedList() {
    LIST = '';
    for (const c of [0, 1]) for (const tg of ALL) LIST += T + ' ' + c + ' 1 4 ' + tg + ' 0 0 100\n';
    auto.automationRefreshPresence();
}

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = T;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000; S.pendingDspSync = 0; S.pendingSetLoad = false;
S.trackActiveClip[T] = 0; S.trackQueuedClip[T] = -1; S.sceneRow = 0;

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const CC_JOG_CLICK = 3, CC_SHIFT = 49, CC_DELETE = 119, CC_TRACK_BTN_CLIP0 = 43;

/* The queue the device drains, as key strings, in order. */
function queued() { return S.pendingDefaultSetParams.map(e => e.key + '=' + e.val); }
function reset(bank) {
    if (snd.soundOpen()) snd.soundExit();
    S.pendingDefaultSetParams.length = 0;
    S.clearDrainHold = 0;
    S.activeBank = (bank === undefined) ? 0 : bank;
    S.trackActiveBank[T] = S.activeBank;
    S.bankCardLatched = false;
    S.deleteHeld = false; S.shiftHeld = false; shiftHeld = 0;
    seedList();
}
const withDelete = (fn) => { cc(CC_DELETE, 127); try { fn(); } finally { cc(CC_DELETE, 0); } };
const withShiftDelete = (fn) => {
    cc(CC_SHIFT, 127); shiftHeld = 1; cc(CC_DELETE, 127);
    try { fn(); } finally { cc(CC_DELETE, 0); cc(CC_SHIFT, 0); shiftHeld = 0; }
};
const jogClick = () => { cc(CC_JOG_CLICK, 127); cc(CC_JOG_CLICK, 0); };
const trackBtn = () => { cc(CC_TRACK_BTN_CLIP0, 127); cc(CC_TRACK_BTN_CLIP0, 0); };

const idxOf = (q, re) => q.findIndex(s => re.test(s));
const clearKeysFor = (q) => q.filter(s => s.indexOf('_pa_clear_key=') >= 0)
                             .map(s => s.slice(s.indexOf('=') + 1).split(' ').slice(1).join(' '));

/* ---- RULE 1+2: a NOTE clear takes the whole clip's automation ----------- */

step('Delete + track button (the SEQUENCE clear) queues the clip\'s automation clear', () => {
    reset();
    withDelete(trackBtn);
    const q = queued();
    assert(q.some(s => s === 't' + T + '_pa_clear=0'),
           'expected t' + T + '_pa_clear=0 in the queue, got: ' + q.join(' | '));
});

step('⚠ and it lands AFTER the note clear, so undo restores BOTH', () => {
    reset();
    withDelete(trackBtn);
    const q = queued();
    const note = idxOf(q, /_c0_clear(_keep)?=/);
    const autoAt = idxOf(q, /_pa_clear=0$/);
    assert(note >= 0, 'no note clear queued at all: ' + q.join(' | '));
    assert(autoAt > note, 'the automation clear must follow the note clear (note@' + note + ', auto@' + autoAt + ')');
});

step('⚠ CONTROL: the OTHER clip keeps its automation', () => {
    reset();
    withDelete(trackBtn);
    assert(auto.automationStateFor(T, 1, CHAIN_TGT), 'clip 1 lost its automation to clip 0\'s clear');
    assert(!auto.automationStateFor(T, 0, CHAIN_TGT), 'clip 0 kept its automation through its own clear');
});

step('⚠ CONTROL: the automation half books NO second undo checkpoint', () => {
    reset();
    withDelete(trackBtn);
    const ck = queued().filter(s => s.indexOf('_undo_checkpoint=') >= 0);
    assert(ck.length === 0, 'a second checkpoint would split the gesture into two undo units: ' + ck.join(' | '));
});

/* ---- RULE 4: a PARAM clear takes only the params IT resets -------------- */

step('Shift+Delete + jog click (CLIP PARAMS RESET) takes the banks it resets', () => {
    reset();
    withShiftDelete(jogClick);
    const got = clearKeysFor(queued());
    for (const tg of [...B1, ...B3, ...B0])
        assert(got.indexOf(tg) >= 0, 'expected ' + tg + ' cleared, got: ' + got.join(' | '));
});

step('⚠ CONTROL: and NOT the synth-chain lane it does not reset', () => {
    reset();
    withShiftDelete(jogClick);
    assert(clearKeysFor(queued()).indexOf(CHAIN_TGT) < 0,
           'a bank reset must not touch chain automation — that is owned by the sound chain');
});

step('Delete + jog click on ARP IN takes bank 5 and ONLY bank 5', () => {
    reset(5);
    withDelete(jogClick);
    const got = clearKeysFor(queued());
    for (const tg of B5) assert(got.indexOf(tg) >= 0, 'expected ' + tg + ' cleared, got: ' + got.join(' | '));
    for (const tg of B1)
        assert(got.indexOf(tg) < 0, '⚠ ' + tg + ' belongs to another bank and must have been left alone');
    assert(got.indexOf(CHAIN_TGT) < 0, 'and the chain lane stays');
});

step('⚠ CONTROL: a param clear lands after the param reset that snapshots it', () => {
    reset(5);
    withDelete(jogClick);
    const q = queued();
    const rst = idxOf(q, /_tarp_reset=/);
    const autoAt = idxOf(q, /_pa_clear_key=/);
    assert(rst >= 0, 'no tarp reset queued: ' + q.join(' | '));
    assert(autoAt > rst, 'the automation clear must follow the reset (reset@' + rst + ', auto@' + autoAt + ')');
});

step('⚠ CONTROL: with nothing automated, a clear queues no automation write', () => {
    reset();
    LIST = ''; auto.automationRefreshPresence();
    S.pendingDefaultSetParams.length = 0;
    withDelete(trackBtn);
    const q = queued();
    assert(!q.some(s => s.indexOf('_pa_clear') >= 0),
           'an empty store must send nothing — a write here is a round-trip for no reason: ' + q.join(' | '));
    assert(q.length > 0, 'the note clear itself should still be queued');
});

step('⭐ and nothing was swallowed into the JS error log', () => {
    assert(swallowed === null, 'a handler threw: ' + swallowed);
});

console.log(failed ? 'FAIL: test_clear_takes_automation' : 'PASS: test_clear_takes_automation');
if (failed) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
