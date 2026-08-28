/* tests/js/test_session_level_knob.mjs — prove, through the REAL knob dispatch,
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
globalThis.host_module_set_param = () => {};
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

async function main() {
await import('../../ui/ui.js');                 /* installs onMidiMessageInternal */
const { S } = await import('../../ui/ui_state.mjs');
const { NUM_TRACKS } = await import('../../ui/ui_constants.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { SLOT_LEVEL_MAX, SESS_KNOB_MODES, SWEEP_UNITS } = await import('../../ui/ui_engine.mjs');

/* Knob 1 = CC 71, one detent clockwise. */
/* ⚠ A turn is TWO detents since the mixer knobs adopted canvaskit's feel
 * (KNOB_SENS = 2 — one detent buys nothing, two buy one of 255 positions). This
 * helper used to send ONE and every assertion below failed when the law
 * changed. The fix is the STIMULUS, not the assertions: "a turn moves the
 * level" is still exactly what this test is for. The one-detent case is now
 * covered deliberately, below. */
const turnKnob1 = () => {
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71, 1]));
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71, 1]));
};

/* The resolver and the engine writes both live in the tick, deliberately: they
 * are synchronous SHM round-trips and do not belong in a MIDI handler. Run
 * enough ticks to cross a POLL_INTERVAL boundary. */
function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }

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

step('setup: session view, track 1 routed to Move instrument 2', () => {
    globalThis.init();                           /* the real init the host calls */
    S.awaitingProjectSelect = false;             /* a project is loaded */
    S.sessionView = true;
    S.ledInitComplete = true;
    /* Every other track parks on Move 4, so a read of bus 1 can only mean
     * somebody derived the bus from the TRACK INDEX (track 1 -> bus 1). */
    for (let t = 0; t < NUM_TRACKS; t++) { S.trackRoute[t] = 1; S.trackChannel[t] = 4; }
    S.trackChannel[0] = 2;                       /* track 1 plays Move 2 */
    S.trackRoute[4] = 0;                         /* track 5 stays a Schwung chain */
    reads.length = 0; writes.length = 0;
    ticks(64);
    if (S.sessVolBus[0] !== 2)
        throw new Error('track 1 resolved to bus ' + S.sessVolBus[0] + ', expected 2');
    if (S.sessVolBus[4] !== 0)
        throw new Error('a Schwung-routed track resolved to bus ' + S.sessVolBus[4]);
});

step('the bus level is SEEDED from the bus the track actually plays', () => {
    if (!reads.includes('move_fx:2:volume'))
        throw new Error('never read the bus fader; reads=' + JSON.stringify(reads.slice(0, 12)));
    if (reads.includes('move_fx:1:volume'))
        throw new Error('read bus 1 — the bus is the CHANNEL, not the track index');
    if (Math.abs(S.sessVolLevel[0] - 0.75) > 1e-6)
        throw new Error('seeded level ' + S.sessVolLevel[0] + ', expected the bus value 0.75');
});

step('a knob turn on a MOVE-routed track moves its level (the reported bug)', () => {
    const before = S.sessVolLevel[0];
    turnKnob1();
    if (S.sessVolLevel[0] <= before)
        throw new Error('level did not move: ' + before + ' -> ' + S.sessVolLevel[0]);
    if (!S.sessVolPending[0]) throw new Error('no write was queued for the tick');
});

step('the tick writes it to the BUS fader, not a chain slot', () => {
    writes.length = 0;
    ticks(1);
    const busWrites = writes.filter((w) => w.startsWith('move_fx:2:volume='));
    if (busWrites.length !== 1)
        throw new Error('bus writes=' + JSON.stringify(writes.filter((w) => w.indexOf('volume') >= 0)));
    if (writes.some((w) => w.startsWith('slot:')))
        throw new Error('a bus level leaked into the slot namespace: ' + JSON.stringify(writes));
    if (Math.abs(parseFloat(busWrites[0].split('=')[1]) - S.sessVolLevel[0]) > 1e-3)
        throw new Error('wrote ' + busWrites[0] + ' but the level is ' + S.sessVolLevel[0]);
});

/* The chain flavour writes the slot's OUTPUT (`slot:volume`), not the sound
 * generator's own level. It was `slot:synth_volume` while Move tracks were
 * routed through Schwung slots and the fader would have moved a Move track
 * sharing the slot; Move tracks own their own buses now, so there is no second
 * signal in the slot and the fader IS the track's level. Asserting the exact key
 * is the point of this step — writing the wrong one is inaudible in a unit test
 * and reads as a working knob on the device. */
step('a Schwung-routed track writes its slot OUTPUT, not the synth level', () => {
    writes.length = 0;
    S.sessVolLevel[4] = 1;                       /* seeded; masks resolved above */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 75, 1]));   /* knob 5 */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 75, 1]));   /* …2 detents */
    ticks(1);
    if (!writes.some((w) => w.startsWith('slot:volume=')))
        throw new Error('chain flavour lost its write: ' + JSON.stringify(writes));
    if (writes.some((w) => w.startsWith('slot:synth_volume=')))
        throw new Error('still writing the sound generator level: ' + JSON.stringify(writes));
    if (writes.some((w) => w.startsWith('move_fx:')))
        throw new Error('a chain level leaked onto a bus: ' + JSON.stringify(writes));
});

/* ⚠ REWRITTEN 2026-08-26. This step used to assert "ONE detent moves nothing —
 * two detents per step", which pinned the flat `knobAccumSteps(.., KNOB_SENS)`
 * law the mixer no longer uses. That law cost 255 * 2 = 510 counts for a full
 * sweep while the bank knobs beside it were tuned to 100 — the strips were 5.1x
 * slower than their neighbours. The old assertion was not wrong about the code;
 * it was faithfully pinning the bug.
 *
 * The two properties below are what the law is FOR, so they are pinned instead
 * of a step count: exact dialing at the slow end, and a human-sized sweep at the
 * fast one. */
step('a COLD detent moves exactly ONE position — exact dialing survives', () => {
    S.trackChannel[0] = 2;
    ticks(64);
    /* Cold means "first motion after idle": knobDivisor returns 1 when there is
     * no previous timestamp, and that branch is deliberately unscaled. Forcing
     * it here rather than sleeping keeps the test deterministic. */
    S.knobAccelLast[0] = 0;
    S.knobAccelAcc[0] = 0;
    const before = S.sessVolLevel[0];
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71, 1]));
    const moved = S.sessVolLevel[0] - before;
    const onePos = SESS_KNOB_MODES[0].step;   /* volume's own unit: 0.01 */
    if (Math.abs(moved - onePos) > onePos / 100)
        throw new Error('a cold detent should move exactly ONE unit (' + onePos +
                        ', what the readout prints), moved ' + moved);
});

/* ⭑ THE ASSERTIONS ARE RANGES, not the tuned numbers. Josh is hunting the sweet
 * spot by ear (80 -> 100 -> 120 so far), so pinning an exact count would turn
 * every tuning pass into a test edit. The properties that must never regress are
 * that a sweep is a HUMAN GESTURE rather than four revolutions, and that VOLUME
 * is deliberately slower than the rest.
 *
 * ⚠ These two steps are a PAIR. Volume carries its own `sweep` override, so a
 * test that only drove volume would say nothing about the universal law, and one
 * that only drove a send would not notice the override being dropped. */
step('a SEND sweep costs a human gesture, not four revolutions', () => {
    S.trackChannel[0] = 2;
    ticks(64);
    S.sessKnobMode = 2;                          /* SEND A — the universal law */
    S.knobAccelLast[0] = 0;
    S.knobAccelAcc[0] = 0;
    S.sessVolLevel[0] = 0;
    const max = SESS_KNOB_MODES[2].max;
    let counts = 0;
    while (S.sessVolLevel[0] < max && counts < 2000) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71, 1]));
        counts++;
    }
    if (S.sessVolLevel[0] < max)
        throw new Error('the knob never reached full scale in ' + counts + ' counts');
    /* ⚠ BOUNDS ARE RATIOS OF THE LIVE SWEEP_UNITS, never literals. Josh tunes this
     * by ear (80 -> 100 -> 120 so far) and asked that retuning not become "a big
     * thing" — hard-coded bounds would fail the suite on every real change and
     * make a one-number edit into a test-editing session. */
    const hi = SWEEP_UNITS * 2, lo = SWEEP_UNITS * 0.4;
    if (counts > hi)
        throw new Error('a full send sweep cost ' + counts + ' encoder counts against a ' +
                        'SWEEP_UNITS of ' + SWEEP_UNITS + ' — it is not tracking the tunable');
    if (counts < lo)
        throw new Error('a full sweep cost only ' + counts + ' counts against a SWEEP_UNITS ' +
                        'of ' + SWEEP_UNITS + ' — the range scaling has overshot');
    /* Control: the retired flat law (255 positions x sens 2) must still exceed the
     * upper bound, or this step would pass against the bug it exists to catch. */
    if (510 <= hi)
        throw new Error('control broke: at SWEEP_UNITS ' + SWEEP_UNITS + ' the old 510-count ' +
                        'law no longer exceeds the bound — this step has stopped discriminating');
});

/* Josh, 2026-08-26, having felt the universal rate on all four banks: "volume
 * can be reverted. the rest feel great." A fader wants travel where a pan wants
 * reach — so volume keeps its own, slower sweep, and that override is a DECISION
 * to be defended, not an accident to be tidied away. */
step('VOLUME is deliberately SLOWER than the universal law', () => {
    S.trackChannel[0] = 2;
    ticks(64);
    const volSweep  = SESS_KNOB_MODES[0].sweep;
    const sendSweep = SESS_KNOB_MODES[2].sweep;
    if (!volSweep)
        throw new Error('volume lost its sweep override — it is back on the universal ' +
                        'rate Josh judged wrong for a fader');
    if (sendSweep)
        throw new Error('a send grew its own sweep override — the whole point is that ' +
                        'everything except volume shares one tunable');
    if (volSweep < 2 * SWEEP_UNITS)
        throw new Error('volume is no longer meaningfully slower than the universal rate ' +
                        '(SWEEP_UNITS ' + SWEEP_UNITS + '): sweep ' + volSweep);
    /* Drive it, so the override is proven to REACH the knob rather than merely
     * being present in the table — the failure mode a pure data assertion misses. */
    S.sessKnobMode = 0;
    S.knobAccelLast[0] = 0;
    S.knobAccelAcc[0] = 0;
    S.sessVolLevel[0] = 0;
    let counts = 0;
    while (S.sessVolLevel[0] < SLOT_LEVEL_MAX && counts < 4000) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71, 1]));
        counts++;
    }
    if (counts < SWEEP_UNITS * 2)
        throw new Error('volume swept in ' + counts + ' counts, under 2x SWEEP_UNITS (' +
                        SWEEP_UNITS + ') — the override is in the table but is not reaching ' +
                        'the knob');
});

step('re-pointing the track at another Move instrument RE-SEEDS the level', () => {
    PARAM_VALUES['move_fx:3:volume'] = '0.250';
    S.trackChannel[0] = 3;                       /* now plays Move 3 */
    ticks(64);
    if (S.sessVolBus[0] !== 3) throw new Error('bus did not follow the channel');
    if (Math.abs(S.sessVolLevel[0] - 0.25) > 1e-6)
        throw new Error('stale level ' + S.sessVolLevel[0] + ' — the first detent would jump');
});

if (failed) process.exit(1);
console.log('test_session_level_knob: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
