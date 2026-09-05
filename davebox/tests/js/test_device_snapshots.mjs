
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_device_snapshots.mjs — DEVICE-WIDE SNAPSHOTS (item 18b)
 * that a track's session-view level knob reaches whichever mixer position that
 * track occupies: a Schwung chain slot OR a Move FX bus.
 *
 * The bug (Josh, on hardware, 2026-08-13): "in session mode, the knobs don't
 * control move bus level." `_sessionKnobVolume` bailed unless the track was
 * Schwung-routed, and tracks 1-4 are Move-routed by DEFAULT — so half the
 * session view had no level control at all, silently. That predates the unified
 * slot model, where a Move bus is a mixer position exactly like a chain slot.
 *
 * A grep pin can only prove the gate is spelled a certain way. This drives
 * `globalThis.onMidiMessageInternal` — the entry point the host calls — and
 * then the tick that owns the engine writes, and watches which param key the
 * turn actually lands on.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

/* Every shadow param read/write the modules make, in order. The whole point of
 * the test is WHICH KEY a turn reaches, so this is the observable. */
const reads = [], writes = [];
const PARAM_VALUES = {
    'move_fx:2:volume': '0.750',        /* track 1 plays Move 2 */
    'slot:volume': '1.000',
};

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;   /* the strip's turn reaches the automation owner (2026-09-04) */
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = (slot, key) => {
    reads.push(key);
    return PARAM_VALUES[key] !== undefined ? PARAM_VALUES[key] : '';
};
globalThis.shadow_set_param = (slot, key, val) => { writes.push(key + '=' + val); };
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
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
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;   /* returning nothing reads as a FAILED registration */
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

/* Item 18 (Josh, 2026-09-05): hold CAPTURE in session view → the 16 steps are
 * device snapshots: tap recalls, hold saves, Delete+step clears. The host half
 * (host_snapshot_take/recall/status) is stubbed here and its calls recorded. */
const snapCalls = [];
const files = {};
let recallPending = false;
globalThis.host_snapshot_take   = (dir) => { snapCalls.push(['take', dir]); return JSON.stringify({ ok: true, skipped: 0, positions: 12 }); };
globalThis.host_snapshot_recall = (dir) => { snapCalls.push(['recall', dir]); recallPending = true; return JSON.stringify({ ok: true, pending: true }); };
let statusSkipped = 1;
globalThis.host_snapshot_status = () => JSON.stringify({ pending: recallPending, skipped: statusSkipped });
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p) && files[p] !== '';
globalThis.host_write_file = (p, c) => { files[p] = c; writes.push('FILE ' + p); return true; };
globalThis.host_read_file = (p) => (files[p] !== undefined ? files[p] : '');
globalThis.host_ensure_dir = () => true;
const leds = {};
globalThis.set_led = (n, c) => { leds[n] = c; };
globalThis.move_midi_internal_send = (a) => { if ((a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; };

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const C = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const D = await import('../../ui/ui_devsnap.mjs');
const P = await import('../../ui/ui_persistence.mjs');
const scene = await import('../../ui/ui_scene.mjs');
const { White, DarkGrey, Cyan } = await import('/data/UserData/schwung/shared/constants.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }
/* The test clock FOLLOWS TICKS (S.clockFollowTicks): time moves by bumping
 * S.tickCount, and every duration the code reads through nowMs() follows. */
function advance(ms) { S.tickCount += Math.max(1, Math.round(ms / 10.6)); ticks(2); }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([v ? 0x90 : 0x80, n, v]));
const capture = (down) => cc(52, down ? 127 : 0);      /* MoveCapture = 52 */
const del = (down) => cc(119, down ? 127 : 0);          /* MoveDelete = 119 */
const step = (i, down) => note(16 + i, down ? 127 : 0);   /* the step buttons are NOTES 16-31 */
function step_(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

step_('setup: session view, a project, three kinds of track', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = true; S.activeTrack = 0;
    S.currentSetUuid = 'aaaa-bbbb'; S.clockFollowTicks = true;
    S.trackRoute[0] = 0; S.trackRoute[1] = 1; S.trackChannel[1] = 0; S.trackRoute[2] = 2;
    PARAM_VALUES['slot:volume'] = '0.8'; PARAM_VALUES['slot:pan'] = '0.5'; PARAM_VALUES['slot:send_a'] = '0.1'; PARAM_VALUES['slot:send_b'] = '0';
    ticks(4);
    if (D.devSnapOpen()) throw new Error('layer open at rest');
});

step_('a Capture + row within the hold keeps its meaning — the layer does NOT open', () => {
    capture(true); advance(100);
    cc(40, 127); cc(40, 0);                              /* Capture + a track/row button = scene capture */
    if (!S.captureUsedAsModifier) throw new Error('control: Capture+row did not mark Capture used');
    advance(600);
    if (D.devSnapOpen()) throw new Error('the layer opened over a Capture+row gesture');
    capture(false); advance(20);
});

step_('⭑ holding Capture past the threshold OPENS the layer, and the release runs no tap action', () => {
    S.capturePending = 0;
    capture(true); advance(200);
    if (D.devSnapOpen()) throw new Error('opened too early (200 ms)');
    advance(300);
    if (!D.devSnapOpen()) throw new Error('the layer did not open after ' + D.DEVSNAP_HOLD_MS + ' ms');
    if (!S.captureUsedAsModifier) throw new Error('Capture not marked used — the release would run the tap');
    const h = JSON.stringify(D.devSnapHints());
    if (h !== JSON.stringify([['STEP TAP', 'RECALL'], ['HOLD', 'STORE']])) throw new Error('footer (Josh, 2026-09-05: Step tap:recall · Hold:store): ' + h);
    /* No entry flash (Josh, 2026-09-05): the SNAPSHOTS row + footer name the mode. */
    if (S.actionPopupEndTick >= 0 && S.actionPopupLines.some((l) => /SNAPSHOTS/.test(String(l))))
        throw new Error('the entry popup is back: ' + JSON.stringify(S.actionPopupLines));
});

step_('⭑ HOLD a step = SAVE: the host takes into the slot dir and davebox writes its json (mixer, every kind of track)', () => {
    snapCalls.length = 0; writes.length = 0;
    S.trackMuted[1] = true; S.trackSoloed[3] = true;           /* a mute and a solo to carry */
    step(2, true); advance(800); step(2, false); advance(20);
    const take = snapCalls.find(c => c[0] === 'take');
    if (!take) throw new Error('host_snapshot_take not called: ' + JSON.stringify(snapCalls));
    if (take[1] !== P.deviceSnapDir('aaaa-bbbb', 2)) throw new Error('wrong dir ' + take[1]);
    const json = JSON.parse(files[take[1] + '/davebox.json']);
    if (!json || !Array.isArray(json.mixer)) throw new Error('no davebox.json mixer');
    const t0 = json.mixer[0], t2 = json.mixer[2];
    if (t0.route !== 0 || t0.volume !== 0.8 || t0.send_a !== 0.1) throw new Error('Schwung track levels not captured: ' + JSON.stringify(t0));
    if (t2.route !== 2 || typeof t2.cc7 !== 'number') throw new Error('MIDI track cc7 not captured: ' + JSON.stringify(t2));
    /* Mutes ride too (Josh, 2026-09-05). */
    if (!json.mutes || !Array.isArray(json.mutes.mute)) throw new Error('no mutes in davebox.json');
    if (json.mutes.mute[1] !== true || json.mutes.solo[3] !== true) throw new Error('mutes not captured: ' + JSON.stringify(json.mutes));
    if (!D.devSnapState().slots[2]) throw new Error('slot 2 not marked filled');
});

step_('⭑ LEDs: the saved slot is WHITE (last), empties DIM', () => {
    scene.updateSceneMapLEDs();
    if (leds[18] !== White) throw new Error('slot 2 led ' + leds[18] + ' expected White ' + White);
    if (leds[16] !== DarkGrey) throw new Error('empty slot led ' + leds[16]);
});

step_('⭑ TAP a filled step = RECALL: the host recalls that dir; davebox applies its mixer once the host says done', () => {
    snapCalls.length = 0; writes.length = 0;
    S.trackRoute[0] = 0;
    S.trackMuted[1] = false; S.trackSoloed[3] = false;         /* changed since the save */
    step(2, true); advance(100); step(2, false); advance(20);
    const rc = snapCalls.find(c => c[0] === 'recall');
    if (!rc || rc[1] !== P.deviceSnapDir('aaaa-bbbb', 2)) throw new Error('host_snapshot_recall not called with the slot dir: ' + JSON.stringify(snapCalls));
    if (D.devSnapState().recalling !== 2) throw new Error('not recalling while the host is pending');
    if (writes.some(w => w.indexOf('slot:volume') >= 0)) throw new Error('mixer applied BEFORE the host finished');
    recallPending = false; advance(30);
    if (D.devSnapState().recalling !== -1) throw new Error('recall did not finish when the host said done');
    if (!writes.some(w => w.indexOf('slot:volume=0.800') >= 0)) throw new Error('Schwung level not re-applied: ' + JSON.stringify(writes.slice(0, 12)));
    /* the mutes come back through the Mute button's own setters */
    if (!writes.includes('t1_mute=1')) throw new Error('track 2 mute not re-applied: ' + JSON.stringify(writes.filter(w => /_mute=|_solo=/.test(w))));
    if (!writes.includes('t3_solo=1')) throw new Error('track 4 solo not re-applied');
    if (!S.trackMuted[1] || !S.trackSoloed[3]) throw new Error('mirror not updated');
    const lines = S.actionPopupLines.map(String);
    if (lines[0] !== 'SNAPSHOT 3' || lines[1] !== 'RESTORED' || lines[2] !== '1 skipped') throw new Error('RESTORED card: ' + JSON.stringify(lines));
    if (S.actionPopupEndTick < S.clockMs + D.DEVSNAP_CARD_MS - 50) throw new Error('the RESTORED card is a glance, not a card');
});

step_('⚠ RESTORED with NOTHING skipped: two lines, never the word "undefined" (device, 2026-09-05)', () => {
    statusSkipped = 0;
    step(2, true); advance(100); step(2, false); advance(20);   /* the stub marks the recall pending */
    recallPending = false; advance(30);                           /* the host says done */
    const lines = S.actionPopupLines.map(String);
    if (lines.length !== 2 || lines.some((l) => /undefined|null/.test(l))) throw new Error('card: ' + JSON.stringify(lines));
    statusSkipped = 1;
});

step_('a tap on an EMPTY step does nothing', () => {
    snapCalls.length = 0;
    step(5, true); advance(100); step(5, false); advance(20);
    if (snapCalls.length) throw new Error('recalled an empty slot: ' + JSON.stringify(snapCalls));
});

step_('⭑ DELETE + step clears the slot', () => {
    del(true); step(2, true); step(2, false); del(false); advance(20);
    if (D.devSnapState().slots[2]) throw new Error('slot 2 still filled');
    scene.updateSceneMapLEDs();
    if (leds[18] !== DarkGrey) throw new Error('cleared slot led ' + leds[18]);
});

step_('⭑ releasing Capture CLOSES the layer, and steps are scene rows again', () => {
    capture(false); advance(20);
    if (D.devSnapOpen()) throw new Error('layer still open after Capture release');
    if (S.sessionStepHeld !== -1) throw new Error('a step hold survived');
});

step_('⚠ the layer never opens in TRACK view', () => {
    S.sessionView = false;
    capture(true); advance(700);
    if (D.devSnapOpen()) throw new Error('opened in track view');
    capture(false); advance(20); S.sessionView = true;
});

if (failed) process.exit(1);
console.log('PASS: test_device_snapshots.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
