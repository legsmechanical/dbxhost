
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
    if (PARAM_VALUES[slot + ':' + key] !== undefined) return PARAM_VALUES[slot + ':' + key];   /* per-slot override */
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
globalThis.host_snapshot_take   = (dir, slot) => { snapCalls.push(['take', dir, slot]); return JSON.stringify({ ok: true, skipped: 0, positions: 12 }); };
/* The 3rd arg is the Undo before-image dir: the host takes it INSIDE the
 * recall, scoped to the positions the plan will write (2026-09-06), and
 * reports back whether it landed. The stub models both — a recall asked for a
 * before-image records the take, so a test can still see one happen. */
globalThis.host_snapshot_recall = (dir, slot, undoDir) => {
    /* The before-image is taken INSIDE the recall and strictly before any
     * write — record it in that order, so the ordering assertion below still
     * pins the real sequence of effects rather than the stub's convenience. */
    if (undoDir) snapCalls.push(['take', undoDir, slot]);
    snapCalls.push(['recall', dir, slot]);
    recallPending = true;
    return JSON.stringify({ ok: true, pending: true, undoOk: !!undoDir && !undoTakeFails });
};
let statusSkipped = 1, statusAdded = 0;
let undoTakeFails = false;   /* the host could not write the before-image */
globalThis.host_snapshot_status = () => JSON.stringify({ pending: recallPending, skipped: statusSkipped, added: statusAdded, addedList: statusAdded ? ['master_fx:fx1'] : [] });
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p) && files[p] !== '';
globalThis.host_write_file = (p, c) => { files[p] = c; writes.push('FILE ' + p); return true; };
globalThis.host_read_file = (p) => (files[p] !== undefined ? files[p] : '');
globalThis.host_ensure_dir = () => true;
const leds = {};
globalThis.set_led = (n, c) => { leds[n] = c; };
globalThis.move_midi_internal_send = (a) => { if ((a[1] & 0xF0) === 0x90) leds[a[2]] = a[3]; };


/* ---- tests/js/test_snapshot_save_blink.mjs ------------------------------
 * SAVING A SNAPSHOT BLINKS ALL SIXTEEN STEPS, IN GREEN (Josh: "we need the
 * visual elements on the different snapshots to be consistent with mute's
 * implementation (all steps blink to confirm save)" + "a more readable colour
 * for state saves — suggests GREEN").
 *
 * ⚠⚠ The flash was never missing. updateTrackLEDs has painted all sixteen for
 * months; the SNAPSHOT LAYER repainted its own slot colours over it every
 * single tick, so the two passes fought and no blink was visible. Mute's save
 * looked right only because the screen under it does not repaint the row every
 * tick. So the observable here is not "does the flash exist" but "does the row
 * ALTERNATE" — the thing a user calls a blink.
 *
 * ⭑ The clock is deterministic (`clockFollowTicks`), because a blink is a
 * phase and a rig on wall-clock time samples whichever half it happens to land
 * in — which is exactly how the first version of this passed while solid.
 */
let ledTrace = [];
globalThis.move_midi_internal_send = (m) => { const a = Array.from(m); if (a.length >= 4) ledTrace.push([a[2], a[3]]); return true; };

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snap = await import('../../ui/ui_devsnap.mjs');
const { Green } = await import('/data/UserData/schwung/shared/constants.mjs');
const ledsMod = await import('../../ui/ui_leds.mjs');

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
S.tickCount = 400; S.currentSetUuid = 'snap-uuid'; S.clockFollowTicks = true;
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); } };
ticks(3);

/* One tick, and what it painted on the step row. */
function tickRow() {
    ledTrace = [];
    S.tickCount++; globalThis.tick();
    const st = ledTrace.filter(([n]) => n >= 16 && n <= 31);
    return { count: st.length, colours: [...new Set(st.map((l) => l[1]))] };
}
const allGreen = (r) => r.count === 16 && r.colours.length === 1 && r.colours[0] === Green;

step('setup: the snapshot layer is open over a track view', () => {
    /* ⚠ The module's OWN entry, not a hand-built S.devSnap: the real state
     * carries a slots array that devSnapSave writes into, and a fixture of my
     * shape threw inside the save. [[fixtures-must-be-real-modules-not-my-shape]] */
    snap.devSnapEnter(2);
    ticks(2);
    if (!snap.devSnapOpen()) throw new Error('rig: layer not open');
});

step('⭐⭐ a SAVE is TWO blinks: green, dark, green, dark — the same gesture Mute\'s save makes', () => {
    /* Josh, 2026-09-10: "blink works, but it'd be good to do a double blink
     * like mute snapshot does". It always WAS two blinks (425 ms in 106 ms
     * phases); what differed was the OFF phase — the snapshot layer repainted
     * its slot colours into it, so the eye read one green pulse against a
     * bright row instead of two against a dark one. Both halves are painted
     * now, so the gesture is identical on every screen. */
    snap.devSnapSave(0);
    /* ⚠ Classify by COLOUR, not by count: setLED caches, so a phase that only
     * has to change some of the sixteen sends only those. And stop when the
     * flash does — the layer repainting afterwards is correct, not noise. */
    const phases = [];
    for (let k = 0; k < 80 && ledsMod.stepSaveFlashLive(); k++) {
        const r = tickRow();
        if (!r.count) continue;
        if (r.colours.length === 1 && r.colours[0] === Green) phases.push('green');
        else if (r.colours.length === 1 && r.colours[0] === 0) phases.push('dark');
        else phases.push('other:' + JSON.stringify(r.colours));
    }
    /* ⚠ Trim a trailing paint from the boundary tick: the flash can end DURING
     * the tick the loop admitted, and the layer taking its row back is correct
     * behaviour, not something interfering mid-gesture. */
    while (phases.length && phases[phases.length - 1].indexOf('other') === 0) phases.pop();
    const seq = phases.filter((p, i) => p !== phases[i - 1]);   /* collapse runs */
    const greens = seq.filter((p) => p === 'green').length;
    if (greens < 2)
        throw new Error('⭑ ' + greens + ' green phase(s) — a DOUBLE blink is two, got ' + JSON.stringify(seq));
    if (!seq.some((p) => p === 'dark'))
        throw new Error('⭑ the off phase never went dark — against a bright row two blinks read as one: '
            + JSON.stringify(seq));
    if (seq.some((p) => p.indexOf('other') === 0))
        throw new Error('⭑ something else painted the row DURING the flash: ' + JSON.stringify(seq));
});
step('⚠ CONTROL: with no save in flight the layer owns the row, and nothing is green', () => {
    S.stepSaveFlashStartTick = -1; S.stepSaveFlashEndTick = -1;
    let green = 0;
    for (let k = 0; k < 12; k++) if (allGreen(tickRow())) green++;
    if (green) throw new Error('the row went green with no save — the flash is not gated on a save');
});

process.exit(failed);
}
main();
