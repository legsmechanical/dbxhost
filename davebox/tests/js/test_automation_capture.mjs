
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_automation_capture.mjs — AUTOMATION CAPTURE, the GESTURE (plan 6e).
 *
 * Josh, 2026-09-11: automation capture, "same as move native and davebox
 * retrospective note capture", and — his ruling — committed by the SAME bare
 * Capture tap that commits notes.
 *
 * ⚠⚠ THIS DRIVES THE BUTTON, not the helper. A test that called
 * automationCaptureCommit() directly would pass whether or not any tap can
 * reach it, which is exactly the failure [[wired-is-not-reachable]] records —
 * a feature built three times on screens no session can open. So every step
 * below sends the real CC through `onMidiMessageInternal` and then runs the
 * tick that owns the automation writes, and asserts on the param keys that
 * actually left.
 *
 * The DSP half is pinned separately in tests/test_param_auto_capture.c.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];                 /* single set_param writes (the note half) */
const bulk = [];                 /* bulk pairs (the pa_ writes go here) */
globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
/* ⚠ The automation writes do NOT come through host_module_set_param — they are
 * queued and flushed as ONE bulk SET by automationTick. A rig stubbing only the
 * single-write binding sees nothing and reads as "the feature did not fire". */
let bulkDecodeFn = null;         /* set once ui_automation is imported */
globalThis.host_module_set_params = (payload) => {
    /* ⚠ The payload is LENGTH-PREFIXED, not "k=v" lines — asserting on the raw
     * string finds nothing and reads as "the write never happened". Decode it
     * with the module's own decoder so the assertions below are honest. */
    const items = bulkDecodeFn ? bulkDecodeFn(payload) : [];
    for (let i = 0; i + 1 < items.length; i += 2) bulk.push(items[i] + '=' + items[i + 1]);
    return true;
};
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {}; globalThis.clear_screen = () => {};
globalThis.print = () => {}; globalThis.fill_rect = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { MoveCapture } = await import('../../ui/ui_constants.mjs');
bulkDecodeFn = (await import('../../ui/ui_automation.mjs')).bulkDecode;

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));
S.trackActiveClip[2] = 0;

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
/* The bare tap, as the hardware sends it. */
function tapCapture() {
    sets.length = 0; bulk.length = 0;
    S.captureUsedAsModifier = false;
    cc(MoveCapture, 127); cc(MoveCapture, 0);
    globalThis.tick();                       /* automationTick flushes the queue */
}
const bulkHas = (frag) => bulk.some((l) => l.indexOf(frag) >= 0);
const setsHas = (frag) => sets.some(([k]) => k.indexOf(frag) >= 0);

step('⭐ THE GESTURE: playing with knob sweeps buffered, a bare Capture tap commits them', () => {
    S.playing = true; S.shiftHeld = false;
    S.capturePending = 0; S.paCapturePending = 2;      /* sweeps, no notes */
    tapCapture();
    if (!bulkHas('t2_pa_capture_commit=0'))
        throw new Error('no pa_capture_commit for the focused clip: ' + JSON.stringify(bulk));
    if (S.paCapturePending !== 0) throw new Error('pending not cleared');
});

step('⭑ ...and it books ONE undo checkpoint FIRST — a capture undoes like any other automation edit', () => {
    S.playing = true; S.capturePending = 0; S.paCapturePending = 1;
    tapCapture();
    const ck = bulk.findIndex((l) => l.indexOf('t2_c0_undo_checkpoint') >= 0);
    const cm = bulk.findIndex((l) => l.indexOf('t2_pa_capture_commit') >= 0);
    if (ck < 0) throw new Error('no undo checkpoint: ' + JSON.stringify(bulk));
    if (cm < 0) throw new Error('no commit: ' + JSON.stringify(bulk));
    if (ck > cm) throw new Error('checkpoint queued AFTER the commit — it would snapshot the result');
});

step('⭐ ONE TAP COMMITS BOTH HALVES (Josh\'s ruling) — notes to the clip, sweeps to their lanes', () => {
    S.playing = true; S.capturePending = 5; S.paCapturePending = 2;
    tapCapture();
    if (!setsHas('t2_capture_commit')) throw new Error('the NOTE half did not commit: ' + JSON.stringify(sets));
    if (!bulkHas('t2_pa_capture_commit')) throw new Error('the AUTOMATION half did not commit: ' + JSON.stringify(bulk));
    if (S.capturePending !== 0 || S.paCapturePending !== 0) throw new Error('a half was left pending');
});

step('⚠ CONTROL: notes buffered but NO sweeps — the tap must not send a pa commit', () => {
    S.playing = true; S.capturePending = 5; S.paCapturePending = 0;
    tapCapture();
    if (!setsHas('t2_capture_commit')) throw new Error('the note half regressed');
    if (bulkHas('pa_capture_commit'))
        throw new Error('committed automation that was never captured: ' + JSON.stringify(bulk));
});

step('⚠ CONTROL: nothing buffered at all — no commit of either kind', () => {
    S.playing = true; S.capturePending = 0; S.paCapturePending = 0;
    tapCapture();
    if (setsHas('capture_commit') || bulkHas('pa_capture_commit'))
        throw new Error('committed with an empty buffer: ' + JSON.stringify(sets.concat(bulk)));
});

step('Shift+Capture clears the sweeps too, and commits NOTHING', () => {
    S.playing = true; S.capturePending = 0; S.paCapturePending = 3;
    S.shiftHeld = true;
    tapCapture();
    S.shiftHeld = false;
    if (!bulkHas('t2_pa_capture_clear'))
        throw new Error('no pa_capture_clear: ' + JSON.stringify(bulk));
    if (bulkHas('pa_capture_commit')) throw new Error('Shift+Capture COMMITTED');
    if (S.paCapturePending !== 0) throw new Error('pending not cleared');
});

{
    /* captureArmed is what the tick's LED pass blinks on, and it is computed in
     * the DSP-mirror poll — so drive the poll with a real DSP answer rather
     * than asserting the expression that computes it. */
    const mod = await import('../../ui/ui_dsp_bridge.mjs');
    step('⚠ the Capture LED arms on captured sweeps alone — not only on notes', () => {
        S.capturePending = 0; S.paCapturePending = 0; S.captureArmed = false;
        globalThis.host_module_get_param = (k) => (k === 'capture_pending' ? '0 2 0' : '');
        mod.pollDSP();
        if (S.paCapturePending !== 2)
            throw new Error('the second token of capture_pending was not read: ' + S.paCapturePending);
        if (!S.captureArmed)
            throw new Error('LED not armed by sweeps alone — a user would never know to tap');
        globalThis.host_module_get_param = () => '';
    });
}

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
