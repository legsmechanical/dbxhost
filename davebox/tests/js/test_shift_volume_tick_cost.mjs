/* tests/js/test_shift_volume_tick_cost.mjs — WHAT does the Shift+volume gesture
 * cost the tick?
 *
 * Josh, 2026-08-25: the track-select pad LEDs linger ~0.5 s after Shift is
 * released during a Shift+volume turn. The stuck-Shift reconcile heals it and is
 * correct, but it runs INSIDE the tick that is stalled, so it cannot be fast.
 * The half second IS the stall.
 *
 * ⚠⚠ The cause on the board — "each per-detent level read costs a full SPI
 * frame" — is WRONG, verified 2026-08-26: the CC handler accumulates deltas and
 * ui_tick performs ONE read-modify-write per tick, seeding once per gesture.
 * Rather than guess a second time, this MEASURES.
 *
 * ⭑ The currency is SPI round-trips, not milliseconds. Every host_module_get_param
 * / shadow_get_param is a full frame (~2.9 ms, [[schwung-param-roundtrip-is-the-cost]]),
 * and the harness mocks them as instant — so wall-clock here is meaningless but
 * the COUNT is exactly what the device pays. 0.5 s ÷ 2.9 ms ≈ 170 round-trips is
 * the budget the symptom implies.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const reads = [];          /* every param round-trip, in order */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = (k) => { reads.push('dsp:' + k); return ''; };
globalThis.shadow_get_param = (slot, k) => { reads.push('shadow:' + k); return ''; };
globalThis.shadow_set_param = () => {};
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
/* ⚠⚠ LEDs do NOT go through set_led. setLED()/setButtonLED() in
 * src/shared/input_filter.mjs emit a MIDI note-on / CC through
 * move_midi_internal_send — so a probe on set_led reads zero for a screen
 * blazing with light. Cost one wrong measurement here before it was noticed.
 * [[schwung-observable-must-match-the-mechanism]] */
const leds = [];
globalThis.__ledsEverSeen = 0;
globalThis.move_midi_internal_send = (m) => {
    leds.push(m[2] + ':' + m[3]);
    globalThis.__ledsEverSeen++;
    /* Track-select pads are notes 68..75 (TRACK_PAD_BASE + track). Those are the
     * eight Josh watched linger, so they get their own log. */
    if (m[2] >= 68 && m[2] <= 75) globalThis.__trackPadWrites.push({ note: m[2], color: m[3] });
};
globalThis.__trackPadWrites = [];
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};
globalThis.shadow_get_shift_held = () => globalThis.__shiftHardware ? 1 : 0;
globalThis.__shiftHardware = false;

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const ledmod = await import('../../ui/ui_leds.mjs');

function tick() { tickmod._tickImpl(); }

/* Round-trips attributable to ONE tick, with the busiest keys named. */
function costOfTicks(n, label) {
    reads.length = 0;
    for (let i = 0; i < n; i++) tick();
    const per = reads.length / n;
    const byKey = {};
    for (const r of reads) byKey[r] = (byKey[r] || 0) + 1;
    const top = Object.entries(byKey).sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`     ${label}: ${reads.length} round-trips over ${n} ticks = ${per.toFixed(1)}/tick`);
    for (const [k, c] of top) console.log(`         ${String(c).padStart(5)}  ${k}`);
    return per;
}

let idle = 0, gesture = 0;

function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('async step');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

step('setup: track view, a project loaded', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    for (let i = 0; i < 64; i++) tick();
});

step('baseline: what an IDLE tick costs', () => {
    idle = costOfTicks(40, 'idle');
});

step('the gesture: Shift held, volume turning', () => {
    globalThis.__shiftHardware = true;
    /* Shift down (CC 49), then a detent per frame like the real flush. */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 49, 127]));
    tick();
    /* ⚠ Prove the stimulus LANDED before trusting any measurement of it. A null
     * result from a gesture that never happened looks identical to a gesture
     * that costs nothing. */
    console.log(`     shiftHeld=${S.shiftHeld} shiftTrackLEDActive=${S.shiftTrackLEDActive} ` +
                `route[0]=${S.trackRoute[0]} activeTrack=${S.activeTrack}`);
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 79, 3]));
    console.log(`     after one detent: tvDeltaAcc=${S.tvDeltaAcc}`);
    tick();
    console.log(`     after the tick:   tvDeltaAcc=${S.tvDeltaAcc} tvSeeded=${S.tvSeeded} tvLevel=${S.tvLevel}`);
    reads.length = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 79, 3]));
        tick();
    }
    const per = reads.length / N;
    const byKey = {};
    for (const r of reads) byKey[r] = (byKey[r] || 0) + 1;
    const top = Object.entries(byKey).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`     gesture: ${reads.length} round-trips over ${N} ticks = ${per.toFixed(1)}/tick`);
    for (const [k, c] of top) console.log(`         ${String(c).padStart(5)}  ${k}`);
    gesture = per;
});

step('the RELEASE: how many LED writes does it emit, and over how many ticks?', () => {
    /* ⚠⚠ CONTROL FIRST. A "zero repaints after release" reading is worthless
     * unless the probe can see a repaint at all — and this probe has already
     * been wrong once tonight (it watched set_led, which LEDs do not use). So
     * count what the HOLD emits on the same notes, with the same probe. */
    globalThis.__trackPadWrites.length = 0;
    for (let i = 0; i < 60; i++) tick();
    globalThis.__heldColors = globalThis.__trackPadWrites.slice(-8);
    console.log(`     (control) track-pad writes during 60 ticks of HOLD: ${globalThis.__trackPadWrites.length}`);
    if (globalThis.__trackPadWrites.length === 0)
        throw new Error('the probe sees no track-pad writes even while Shift is HELD — it is blind');
    leds.length = 0;
    const perTick = [];
    globalThis.__shiftHardware = false;
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 49, 0]));
    globalThis.__perTickTrackPads = [];
    for (let i = 0; i < 30; i++) {
        const before = leds.length;
        globalThis.__trackPadWrites.length = 0;
        tick();
        perTick.push(leds.length - before);
        globalThis.__perTickTrackPads.push(globalThis.__trackPadWrites.length);
    }
    console.log(`     LED writes emitted by the release: ${leds.length}`);
    console.log(`     track pads (68-75) repainted on tick: ` +
                globalThis.__perTickTrackPads.slice(0, 12).map((n, i) => `t${i}=${n}`).join(' '));
    /* Decisive: is the painter NOT RUNNING for these notes, or running and being
     * deduped by the LED cache? Force the cache open and see what colour the
     * normal painter actually wants. If it differs from what the blink left on
     * the hardware, those pads are stale and that IS the linger. */
    const held = {};
    for (const w of globalThis.__heldColors) held[w.note] = w.color;
    globalThis.__trackPadWrites.length = 0;
    ledmod.invalidateLEDCache();
    tick();
    const after = {};
    for (const w of globalThis.__trackPadWrites) after[w.note] = w.color;
    const diffs = [];
    for (let n = 68; n <= 75; n++)
        if (after[n] !== undefined && after[n] !== held[n])
            diffs.push(`${n}: shift-left ${held[n]} → normal ${after[n]}`);
    console.log(`     with the cache forced open, the normal painter writes: ` +
                (diffs.length ? diffs.join(' · ') : '(the same colours the blink left)'));
    /* ⚠ Control: if the HOLD emitted none either, this rig never lights the
     * track LEDs and the zero above measures nothing. */
    console.log(`     (control) LED writes seen anywhere so far: ${globalThis.__ledsEverSeen}`);
    console.log(`     per tick after release: [${perTick.join(', ')}]`);
    const settle = perTick.findIndex((n, i) => i > 0 && n === 0 && perTick[i - 1] === 0);
    console.log(`     ticks until LED traffic stops: ${settle < 0 ? '>12' : settle}`);
});

/* THE REGRESSION GUARD this file leaves behind. The gesture must not add param
 * round-trips per tick: each one is a full SPI frame (~2.9 ms) and the LED
 * linger was blamed on exactly that cost for a day. If someone adds a per-detent
 * readback later, this fails immediately instead of becoming a hardware report. */
step('the gesture adds NO param round-trips per tick', () => {
    if (gesture > idle + 0.5)
        throw new Error(`idle ${idle.toFixed(1)}/tick but gesture ${gesture.toFixed(1)}/tick — ` +
                        `the gesture has grown a per-detent readback, worth ~2.9 ms each`);
});

step('VERDICT', () => {
    const extra = gesture - idle;
    console.log(`     idle ${idle.toFixed(1)}/tick · gesture ${gesture.toFixed(1)}/tick · ` +
                `gesture costs ${extra.toFixed(1)} EXTRA round-trips per tick`);
    console.log(`     at ~2.9 ms per round-trip that is ${(gesture * 2.9).toFixed(1)} ms per tick ` +
                `during the gesture (idle ${(idle * 2.9).toFixed(1)} ms)`);
});

if (failed) process.exit(1);
console.log('test_shift_volume_tick_cost: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
