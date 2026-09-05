
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_session_knob_parity.mjs — session knobs at PARITY with the track-view knobs
 * every view; plain volume = Move's native main output (Josh, 2026-08-24:
 * "volume to control main output and shift+volume to control active track
 * volume. should apply across all modes").
 *
 * Silent failure modes everywhere: a missed claim leaks the first detent into
 * Move's master; a per-detent save is an invisible I/O storm; an EXT track
 * doing nothing looks identical to the gesture being broken. Drives
 * globalThis.onMidiMessageInternal + the real tick. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const ENGINE = { };
let setCalls = [], volBlockCalls = [], saveCalls = 0;
globalThis.shadow_get_param = (slot, key) => (ENGINE[slot + '|' + key] != null ? ENGINE[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, val) => { setCalls.push([slot, key, val]); ENGINE[slot + '|' + key] = String(val); return 1; };
globalThis.host_vol_block = (on) => { volBlockCalls.push(on); };
globalThis.shadow_save_state_now = () => { saveCalls++; return 1; };
let extSends = [];
globalThis.move_midi_external_send = (pkt) => { extSends.push(pkt.slice ? pkt.slice() : pkt); };

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
let modSets = [];
globalThis.host_module_set_param = (k, v) => { modSets.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* ⚠ THE ASK (Josh, 2026-09-05): "session view knobs … should work just like
 * the track view knobs (including the delete/mute led rings)". The turn already
 * recorded; this pins the TOUCH gestures and the RING on the session mixer:
 *   Delete + touch  → the strip's automation in the clip is cleared, one popup
 *   Mute + touch    → deactivate / reactivate (Mute marked a MODIFIER, so the
 *                     track is not muted on release); a strip with NO
 *                     automation keeps the older session meaning (mute)
 *   ring LED        → an ACTIVE lane blinks at the 440 ms law; an inactive
 *                     one and a plain strip keep their colour */
let ledPk = [];
globalThis.move_midi_internal_send = (a) => { ledPk.push(Array.from(a)); return true; };
globalThis.shadow_get_ui_flags = () => 0;
globalThis.shadow_clear_ui_flags = () => {};
globalThis.shadow_get_shift_held = () => 0;
async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const A = await import('../../ui/ui_automation.mjs');
const L = await import('../../ui/ui_leds.mjs');
const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (n, on) => globalThis.onMidiMessageInternal(new Uint8Array([on ? 0x90 : 0x80, n, on ? 127 : 0]));
const MUTE = 88, DELETE = 119;
let lastRing = {};
/* the automation the DSP reports: track 4's slot-4 volume and pan, active */
let paList = '4 0 3 8 4:slot:volume 0 4 100\n4 0 3 8 4:slot:pan 0 4 100\n';
const _g = globalThis.host_module_get_param;
globalThis.host_module_get_param = (k) => (k === 'pa_list' ? paList : _g(k));
const popups = [];
const { showActionPopup } = await import('../../ui/ui_persistence.mjs');
/* the popup is observed through the state it sets */

step('setup: session view, mixer on VOLUME, track 4 on slot 4 with active volume automation', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.playing = false;
    S.sessionView = true; S.sessKnobMode = 0; S.sessMixerLatched = true; S.bankSelectTick = -1;
    S.trackRoute[4] = 0; S.sessVolSlots[4] = 1 << 4; S.sessVolLevel[4] = 0.7;
    S.trackRoute[5] = 0; S.sessVolSlots[5] = 1 << 5; S.sessVolLevel[5] = 0.7;
    S.activeBank = 0;
    /* the LED painter returns early under the picker, so close it as a load would */
    S.projectPadPicker = null; S.pendingOpenProjectPicker = false; S.tapTempoOpen = false;
    A.automationRefreshPresence();
    const st = A.automationStateFor(4, S.trackActiveClip[4] | 0, '4:slot:volume');
    if (!st || !st.active) throw new Error('rig: track 4 volume is not an active lane');
});

step('a plain touch (no modifier) changes nothing', () => {
    note(4, true); note(4, false);
    const st = A.automationStateFor(4, S.trackActiveClip[4] | 0, '4:slot:volume');
    if (!st || !st.active) throw new Error('a plain touch changed the lane: ' + JSON.stringify(st));
    if (S.trackMuted[4]) throw new Error('a plain touch muted the track');
});

step('⭑ Mute + touch on an AUTOMATED strip MUTES the track and leaves the lane alone (Josh, 2026-09-05: "mute touch to mute track is the thing we need to keep")', () => {
    S.muteUsedAsModifier = false;
    cc(MUTE, 127); note(4, true); note(4, false); cc(MUTE, 0);
    if (!S.trackMuted[4]) throw new Error('Mute+touch on an automated strip did not mute the track');
    const st = A.automationStateFor(4, S.trackActiveClip[4] | 0, '4:slot:volume');
    if (!st || !st.active) throw new Error('Mute+touch toggled the lane: ' + JSON.stringify(st));
    if (S.actionPopupLines && S.actionPopupLines.join(' ').match(/AUTOMATION|OFF/)) throw new Error('an automation popup fired: ' + JSON.stringify(S.actionPopupLines));
    cc(MUTE, 127); note(4, true); note(4, false); cc(MUTE, 0);      /* unmute */
    if (S.trackMuted[4]) throw new Error('second Mute+touch did not unmute');
});

step('⭑ the ring LED of an ACTIVE lane BLINKS at the 440 ms law; a plain strip does not', () => {
    /* The shared setButtonLED dedupes on ITS cache, so a ring that did not
     * change emits nothing: carry the last known value forward. */
    const ring = (ms) => {
        S.clockMs = ms; L.invalidateLEDCache(); ledPk = [];
        L.updateTrackLEDs();
        const v = Object.assign({}, lastRing);
        for (const p of ledPk) if ((p[1] & 0xF0) === 0xB0 && p[2] >= 71 && p[2] <= 78) v[p[2] - 71] = p[3];
        lastRing = v;
        return v;
    };
    const a = ring(1000), b = ring(1000 + 440);      /* opposite blink phases */
    if (a[4] === undefined) { const ccs = {}; for (const p of ledPk) if ((p[1] & 0xF0) === 0xB0) ccs[p[2]] = p[3]; throw new Error('no ring packets; CCs painted this frame: ' + JSON.stringify(ccs) + ' ledInit=' + S.ledInitComplete + ' picker=' + !!S.projectPadPicker); }
    if (a[4] === undefined || b[4] === undefined) throw new Error('strip 4 ring not painted: ' + JSON.stringify([a, b]));
    if (!((a[4] === 0) !== (b[4] === 0))) throw new Error('strip 4 ring does not blink: ' + a[4] + ' / ' + b[4]);
    if (a[5] === undefined || a[5] === 0 || a[5] !== b[5]) throw new Error('plain strip 5 ring changed or went dark: ' + a[5] + ' / ' + b[5]);
});

step('⭑ an INACTIVE lane keeps a steady ring', () => {
    A.automationToggleActive(4, S.trackActiveClip[4] | 0, '4:slot:volume');   /* deactivate (the AUTOMATION bank's op) */
    const ring = (ms) => { S.clockMs = ms; L.invalidateLEDCache(); ledPk = []; L.updateTrackLEDs(); const v = Object.assign({}, lastRing); for (const p of ledPk) if ((p[1] & 0xF0) === 0xB0 && p[2] >= 71 && p[2] <= 78) v[p[2] - 71] = p[3]; lastRing = v; return v; };
    const a = ring(2000), b = ring(2440);
    if (a[4] === undefined || a[4] === 0 || a[4] !== b[4]) throw new Error('inactive lane ring not steady: ' + a[4] + ' / ' + b[4]);
    A.automationToggleActive(4, S.trackActiveClip[4] | 0, '4:slot:volume');   /* back on */
});

step('⭑ Mute + touch on a strip with NO automation keeps its session meaning: mute the track', () => {
    S.muteUsedAsModifier = false;
    cc(MUTE, 127); note(5, true); note(5, false); cc(MUTE, 0);
    if (!S.trackMuted[5]) throw new Error('a strip without automation did not mute on Mute+touch');
    cc(MUTE, 127); note(5, true); note(5, false); cc(MUTE, 0);      /* unmute */
});

step('⭑ Delete + touch CLEARS the strip\'s automation in the clip, with the popup', () => {
    cc(DELETE, 127); note(4, true); note(4, false); cc(DELETE, 0);
    if (A.automationStateFor(4, S.trackActiveClip[4] | 0, '4:slot:volume')) throw new Error('the lane survived Delete+touch');
    if (S.actionPopupLines.join(' ').indexOf('CLEARED') < 0) throw new Error('no CLEARED popup: ' + JSON.stringify(S.actionPopupLines));
});

if (failed) process.exit(1);
console.log('PASS: test_session_knob_parity.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
