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
const sent = [];
/* ⚠⚠ THE STUB MUST HONOUR THE CLEAR, or the test models a DSP that ignores it
 * and no refresh can ever look correct. `tN_pa_clear <clip>` drops every lane of
 * that (track, clip); `tN_pa_clear_key <clip> <target>` drops one — exactly what
 * sp_track_paramauto.c does, and what tests/test_param_auto.c already pins.
 * Without this the resurrection test is unfalsifiable.
 * [[fixtures-must-be-real-modules-not-my-shape]] */
function dspClear(key, val) {
    const m = /^t(\d+)_pa_clear(_key)?$/.exec(key);
    if (!m) return;
    const tr = m[1], parts = String(val).split(' ');
    const clip = parts[0], target = m[2] ? parts.slice(1).join(' ') : null;
    LIST = LIST.split('\n').filter(line => {
        if (!line) return false;
        const f = line.split(' ');
        if (f[0] !== tr || f[1] !== clip) return true;
        return target ? f[4] !== target : false;
    }).map(l => l + '\n').join('');
}
globalThis.host_module_set_param = (k, v) => { sent.push(k + '=' + v); dspClear(k, v); };
globalThis.host_module_set_params = () => true;
let listReads = 0;
globalThis.host_module_get_param = (k) => { if (k === 'pa_list') { listReads++; return LIST; } return ''; };
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
const { BANKS, BANK_AUTOMATION, BANK_STEP, SEQ_AUTO_TARGETS, seqAutoTargetForKnob } = await import('../../ui/ui_constants.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const editops = await import('../../ui/ui_editops.mjs');

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
        /* AUTOMATABLE targets on this bank. An entry can exist for the MACRO
         * picker and still be closed to automation (ARP IN, 2026-09-12), so the
         * flag is the question, not membership. */
        .filter(k => SEQ_AUTO_TARGETS[k].bank === b && SEQ_AUTO_TARGETS[k].automatable !== false)
        .map(k => 'seq:' + T + ':' + k);
}
const B0 = targetsOfBank(0), B1 = targetsOfBank(1), B3 = targetsOfBank(3), B5 = targetsOfBank(5);
assert(B0.length && B1.length && B3.length,
       'the fixture needs automatable params on banks 0, 1 and 3');
/* ⛔ B5 is EXPECTED to be empty — ARP IN is not automatable (2026-09-12). It is
 * still seeded into the fixture list below so the test proves a lane recorded
 * before that ruling is RETIRED rather than left listed and silent. */

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

step('Shift+Delete + jog click resets the MIDI FX CHAIN — banks 1-4 and their automation', () => {
    reset();
    withShiftDelete(jogClick);
    const got = clearKeysFor(queued());
    for (const tg of [...B1, ...B3])
        assert(got.indexOf(tg) >= 0, 'expected ' + tg + ' cleared, got: ' + got.join(' | '));
});

step('⚠⚠ CONTROL: Shift leaves CLIP alone — it defines the clip, not the MIDI processing', () => {
    reset();
    withShiftDelete(jogClick);
    const got = clearKeysFor(queued());
    for (const tg of B0)
        assert(got.indexOf(tg) < 0,
               'Josh, 2026-09-12: "leave clip, drum lane, and all lanes out of shift+delete+click" — ' +
               tg + ' was cleared');
    assert(!queued().some(x => /_clip_playback_dir=|_clip_playback_audio_reverse=|_at_clear=/.test(x)),
           'Shift must no longer write Playback Dir / RvSt / aftertouch either: ' + queued().join(' | '));
});

step('⚠ CONTROL: and NOT the synth-chain lane it does not reset', () => {
    reset();
    withShiftDelete(jogClick);
    assert(clearKeysFor(queued()).indexOf(CHAIN_TGT) < 0,
           'a bank reset must not touch chain automation — that is owned by the sound chain');
});

step('⛔ ARP IN is NOT AUTOMATABLE, so there is no lane for it to have', () => {
    /* Josh, 2026-09-12: "put all of arp-in on the automation not allowed list."
     * Its params are per-TRACK while a lane is per-CLIP, so a lane could only
     * ever be right for the clip you were looking at. */
    assert(B5.length === 0, 'ARP IN still offers automation targets: ' + B5.join(' | '));
    /* ⭑ Its entries still EXIST — ARP IN remains a MACRO destination, which Josh
     * did not ask to remove. Deleting them from BANK_MACRO_ALLOW took it off the
     * macro picker too, and test_macros_bank caught that. So the invariant is
     * the FLAG, plus the fact that no automation key can be derived for it. */
    const five = Object.keys(SEQ_AUTO_TARGETS).filter(k => SEQ_AUTO_TARGETS[k].bank === 5);
    assert(five.length > 0, 'ARP IN must still be offered as a MACRO destination');
    for (const k of five)
        assert(SEQ_AUTO_TARGETS[k].automatable === false, k + ' is not marked non-automatable');
    for (let k = 0; k < 8; k++)
        assert(seqAutoTargetForKnob(T, 5, k, false) === null,
               'an ARP IN knob still resolves to an automation target (knob ' + k + ')');
});

step('Delete + jog click on ARP IN resets its params and clears NO automation', () => {
    reset(5);
    withDelete(jogClick);
    const q = queued();
    assert(q.some(x => /_tarp_reset=/.test(x)), 'ARP IN was not reset: ' + q.join(' | '));
    assert(clearKeysFor(q).length === 0,
           'nothing on ARP IN can be automated, so nothing may be cleared: ' + q.join(' | '));
});

step('⚠ CONTROL: a param clear lands after the param reset that snapshots it', () => {
    /* On NOTE FX, which IS automatable — the ordering rule still has to hold. */
    reset(1);
    withDelete(jogClick);
    const q = queued();
    const rst = idxOf(q, /_pfx_noteFx_reset=/);
    const autoAt = idxOf(q, /_pa_clear_key=/);
    assert(rst >= 0, 'no NOTE FX reset queued: ' + q.join(' | '));
    assert(autoAt > rst, 'the automation clear must follow the reset (reset@' + rst + ', auto@' + autoAt + ')');
});

/* ---- the CLIP bank, completed (Josh, 2026-09-13: "reset it with the rest") --
 *
 * Resolution was held back as destructive. It is not: `clip_resolution` rescales
 * every note proportionally and calls `pa_link_scale`, so the pattern keeps its
 * step positions and only the tick granularity changes. */
step('⭐ Delete + jog click on CLIP resets Res and InQ too, not just Dir/SqFl', () => {
    reset(0);
    withDelete(jogClick);
    const q = queued();
    assert(q.some(x => x === 't' + T + '_clip_resolution=1'),
           'Resolution was not reset to its default index: ' + q.join(' | '));
    assert(q.some(x => x === 't' + T + '_diq=0'),
           'InQ was not reset: ' + q.join(' | '));
    /* the two that already worked, so this cannot pass by replacing them */
    assert(q.some(x => /_clip_playback_dir=0$/.test(x)), 'Playback Dir stopped being reset');
    assert(q.some(x => /_clip_seq_follow|_clip_playback_audio_reverse=0$/.test(x)),
           'the rest of the bank stopped being reset: ' + q.join(' | '));
});

step('⚠ CONTROL: the CLIP bank\'s three ACTION knobs are not fired by a reset', () => {
    /* K2 Strch / K3 Shft / K4 Lgto are one-shot note transforms with no stored
     * value. "Reset the bank" must not mean "perform them" — Lgto is
     * destructive and normally guarded by a confirm dialog. */
    reset(0);
    withDelete(jogClick);
    const q = queued();
    for (const re of [/_beat_stretch/, /_clock_shift/, /_lgto_apply/])
        assert(!q.some(x => re.test(x)),
               'a reset fired an ACTION knob (' + re + '): ' + q.join(' | '));
});

step('⚠⚠ CONTROL: Shift+Delete still leaves Res and InQ alone', () => {
    /* Josh, 2026-09-12: "leave clip ... out of shift+delete+click." Adding two
     * writes to the Delete arm must not leak into the Shift arm. */
    reset(0);
    withShiftDelete(jogClick);
    const q = queued();
    assert(!q.some(x => /_clip_resolution=|_diq=/.test(x)),
           'Shift+Delete reached into the CLIP bank: ' + q.join(' | '));
});

step('⭐ Delete + jog click resets ONLY the bank you are on (the 1(4) regression)', () => {
    reset(1);
    withDelete(jogClick);
    const got = clearKeysFor(queued());
    for (const tg of B1)
        assert(got.indexOf(tg) >= 0, 'NOTE FX lane not cleared: ' + tg);
    for (const tg of B3)
        assert(got.indexOf(tg) < 0,
               '⚠⚠ THE REGRESSION: on the card for NOTE FX, MIDI DLY\'s automation went too (' + tg + ')');
});

step('⛔⛔ STEP is NEVER reset — it IS the sequencer data', () => {
    /* Josh, 2026-09-12: "step bank IS the sequencer data, so we shouldn't ever
     * clear anything there." Clearing notes has its own gestures.
     * ⚠ This pins the BEHAVIOUR, not resetBankParams's early return — STEP is
     * bank 12 and falls past every range in the dispatcher, so removing that
     * guard SURVIVES this test today (verified). The value of this case is the
     * slice that adds SOUND / MACROS / AUTOMATION, where a generic path could
     * reach STEP and nothing else would notice. */
    reset(BANK_STEP);
    withDelete(jogClick);
    const q = queued();
    assert(q.length === 0, 'Delete + jog click on STEP queued something: ' + q.join(' | '));
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

/* ---- THE DEVICE BUG (Josh, 2026-09-12): the list came back ------------- */

step('⚠⚠ REGRESSION: a lane must not be RESURRECTED by the refresh that races the write', () => {
    reset();
    withDelete(trackBtn);
    /* The gesture queued the clear. It has NOT been sent yet — the default
     * queue drains ONE per tick and clearDrainHold defers it a further tick.
     * Meanwhile the tick refreshes the lane list from the DSP, which still
     * reports every lane because nobody has told it anything. THAT is the
     * device symptom: "lanes still there ... but none are playing back" —
     * the rows are a stale mirror, and the DSP clears them a few ticks later. */
    sent.length = 0;
    for (let i = 0; i < 12; i++) { S.tickCount++; globalThis.tick(); }
    /* FIRST: did the write reach the DSP at all? The queue is not the wire. */
    assert(sent.some(x => x === 't' + T + '_pa_clear=0'),
           'the pa_clear was NEVER SENT in 12 ticks — sent: ' + sent.join(' | '));
    /* THEN: the row must not be back. Before the fix the refresh ran BEFORE the
     * write drained, re-read the un-cleared list, and restored every deleted row
     * permanently — listed and silent at once, which is what Josh saw. */
    assert(!auto.automationStateFor(T, 0, CHAIN_TGT),
           'the cleared lane came BACK into the list (the refresh won the race)');
    assert(auto.automationStateFor(T, 1, CHAIN_TGT),
           'control: the other clip is still listed, so the refresh really ran');
});

/* ---- a COPIED clip's lanes must become VISIBLE ------------------------- */

step('⭐ a clip COPY asks for the lane list to be re-read', () => {
    /* Josh, device, 2026-09-12: a clip copied to another slot "plays back the
     * automation from clip a but doesn't show it as a lane on the automation
     * window", and a bank reset on the copy "didn't clear the automation" until
     * something else forced a refresh.
     *
     * The DSP copies the lanes; this module's mirror is fed only by pa_list. So
     * the lane played while stateByKey had never heard of it — and every gesture
     * that checks the mirror first (the bank clears do) silently did NOTHING.
     * ⚠ copyClip's own _markLocalTouch refreshes the AFTERTOUCH mirror, which is
     * a different store wearing the same word. */
    reset();
    listReads = 0;
    editops.copyClip(T, 0, T, 5);
    for (let i = 0; i < 6; i++) { S.tickCount++; globalThis.tick(); }
    assert(listReads > 0,
           'the copy never asked for a pa_list re-read, so the copied lane is invisible to the bank');
});

step('⭐ and nothing was swallowed into the JS error log', () => {
    assert(swallowed === null, 'a handler threw: ' + swallowed);
});

console.log(failed ? 'FAIL: test_clear_takes_automation' : 'PASS: test_clear_takes_automation');
if (failed) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
