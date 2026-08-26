/* tests/js/test_knob_feel.mjs — the bank-param knobs must read the batch
 * MAGNITUDE, not just its sign.
 *
 * Josh, 2026-08-25, on hardware: dAVEBOx's bank knobs feel "slow as hell" while
 * the host's generated canvas editors feel right, on the same hardware and the
 * same physical knob.
 *
 * The cause is a false premise in the old curve's own comment: "The Move knobs
 * fire ~2-4 ±1 detent messages per physical click ... so timing can't tell slow
 * from fast." That is the RAW HARDWARE STREAM. A tool never sees it. shadow_ui
 * accumulates encoder CCs and flushes ONE synthetic message per knob per FRAME
 * carrying the summed detent count -- "modules reading the raw value get the
 * magnitude for acceleration" (shadow_ui.js, overtake flush). ccKnobDelta() read
 * only the SIGN of that sum, so six detents landing in one frame moved a
 * parameter exactly as far as one did. Measured on the device 2026-08-26: a fast
 * flick sends values up to +-6, and 48% of detents carry more than 1.
 *
 * ⚠ THE ASSERTION IS DELIBERATELY RELATIVE, not a tuned number. Pinning "a
 * batch of 6 moves 6 steps" would freeze a curve Josh may still want retuned;
 * pinning "a batch of 6 moves FARTHER than a batch of 1, for the same number of
 * events" is the property that was broken and the one that must never regress.
 * Under the old code those two were IDENTICAL, so this fails against it.
 *
 * ⚠ This covers the bank-param path (ccKnobDelta / knobPick). dAVEBOx has a
 * THIRD knob accumulator -- knobAccumSteps/KNOB_SENS, used by the session mixer
 * strips and sound mode's level -- which already reads the magnitude and is
 * tuned separately. test_session_level_knob covers that one. A green suite there
 * says nothing about this one; that is why this file exists.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const writes = [];
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { writes.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
globalThis.draw_line = () => {};
globalThis.set_pixel = () => {};
globalThis.flush_display = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_open_service = () => {};
globalThis.host_close_service = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const { PAD_MODE_MELODIC_SCALE, PAD_MODE_DRUM, BANKS } = await import('../../ui/ui_constants.mjs');
const { DRUM_NOTEFX_SITES } = await import('../../ui/ui_input_cc.mjs');

function ticks(n) { for (let i = 0; i < n; i++) tickmod._tickImpl(); }

/* Park a knob's param mid-range and clear its curve state before measuring.
 * ⚠ Without this the steps interfere: the knobs are now fast enough to slam a
 * param into its max, and every later measurement on it reads 0 movement — which
 * looks exactly like "the knob is broken". Four assertions failed that way the
 * moment the rate was corrected, and none of them were about the rate. */
function park(knobIdx, value) {
    S.bankParams[0][1][knobIdx] = value;
    S.knobAccelAcc[knobIdx] = 0;
    S.knobAccelLast[knobIdx] = 0;
    S.knobAccum[knobIdx] = 0;
}

function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass without running.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* Drive the REAL entry point the host calls, exactly as the overtake flush does:
 * one message per knob per frame, value = the frame's summed detent count. */
/* NOTE FX bank, K3 = Velocity Offset: range -127..127 with no picker format, so
 * knobClass() calls it 'cont' — the class the report was about. Chosen over a
 * small-range param deliberately: a 'pick' knob would mask the magnitude behind
 * its fixed divisor. */
const KNOB_CC = 73;
/* ⚠ In MELODIC mode a NOTE FX knob writes the track key `t0_noteFX_velocity`.
 * In DRUM mode the same knob writes a per-LANE override
 * (`t0_l0_pfx_set=velocity_offset <n>`) through an entirely different branch.
 * Asserting the wrong one reports "the knob never moved" while it moves
 * perfectly — measure the key the code actually writes, in the mode you set. */
const PARAM = 'noteFX_velocity';
function flick(magnitude, frames) {
    for (let i = 0; i < frames; i++) {
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, KNOB_CC, magnitude]));
        ticks(1);
    }
}

/* Total absolute movement the turn produced, read off the params it wrote.
 * Keyed by param name so an unrelated write cannot inflate the measurement. */
function travel(before, after, filterKey = PARAM) {
    /* Two write shapes reach here: `key=<number>` and the per-clip override
     * `key=<name> <number>`. Fold the name into the key for the second, so two
     * different overrides on one key cannot be differenced against each other. */
    const num = (arr) => {
        const last = {};
        for (const w of arr) {
            const eq = w.lastIndexOf('=');
            if (eq < 0) continue;
            let k = w.slice(0, eq);
            const rhs = w.slice(eq + 1).trim().split(/\s+/);
            const v = parseFloat(rhs[rhs.length - 1]);
            if (!isFinite(v)) continue;
            if (rhs.length > 1) k += ':' + rhs.slice(0, -1).join(' ');
            last[k] = v;
        }
        return last;
    };
    const a = num(before), b = num(after);
    let sum = 0;
    for (const k of Object.keys(b))
        if (k.indexOf(filterKey) >= 0 && a[k] !== undefined) sum += Math.abs(b[k] - a[k]);
    return sum;
}

let slowTravel = 0, fastTravel = 0;

step('setup: the NOTE FX bank live, melodic pads, knobs unlocked', () => {
    globalThis.init();
    S.awaitingProjectSelect = false;
    S.ledInitComplete = true;
    S.sessionView = false;
    S.activeBank = 1;
    S.activeTrack = 0;
    /* ⚠⚠ MELODIC, explicitly. Bank 1 has a whole separate DRUM branch (K1/K2 =
     * lane octave/note, per-LANE writes) that never reaches the generic
     * bank-param handler this file is about. The first draft of this test ran in
     * drum mode without noticing: the magnitude assertions passed — that path
     * uses ccKnobDelta too — while the range assertions measured a code path
     * that had not been touched. The tell was `t0_l0_...` (a LANE key) in the
     * writes. */
    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    S.knobLocked.fill(false);
    ticks(16);
    /* Prove the stimulus lands on the param before measuring how FAR it lands —
     * a test that measures nothing reports "no movement" for both curves and
     * would pass the equality check by accident. */
    const before = writes.slice();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, KNOB_CC, 1]));
    ticks(1);
    if (!writes.slice(before.length).some((w) => w.indexOf(PARAM) >= 0))
        throw new Error('the knob never reached ' + PARAM + '; last writes=' +
                        JSON.stringify(writes.slice(-3)));
});

step('a SLOW turn: one detent per frame', () => {
    /* Settle first so the gesture starts cold, the way a real one does. */
    park(2, 0);
    ticks(64);
    const before = writes.slice();
    flick(1, 6);
    slowTravel = travel(before, writes);
    if (slowTravel === 0) throw new Error('a 24-frame turn moved nothing at all: ' + JSON.stringify(writes.slice(-4)));
});

step('a FAST turn: six detents per frame, SAME number of frames', () => {
    park(2, 0);
    ticks(64);
    const before = writes.slice();
    flick(6, 6);
    fastTravel = travel(before, writes);
    if (fastTravel === 0) throw new Error('a fast turn moved nothing: ' + JSON.stringify(writes.slice(-4)));
});

/* THE REGRESSION PIN. Same event count, six times the physical motion. Under the
 * sign-only curve these two were equal, which is precisely the reported bug. */
step('the fast turn travels FARTHER — the magnitude is not discarded', () => {
    if (!(fastTravel > slowTravel))
        throw new Error('fast=' + fastTravel + ' slow=' + slowTravel +
                        ' — equal or worse means the batch magnitude is being thrown away');
});

step('...and by a real margin, not a rounding crumb', () => {
    if (!(fastTravel >= slowTravel * 2))
        throw new Error('fast=' + fastTravel + ' slow=' + slowTravel +
                        ' — a 6x faster spin should cover appreciably more ground');
});

/* Exact dialing must SURVIVE the change: that was the whole point of the trade
 * this replaces (1738ffdd, "slow turns always ±1 so exact values are dialable").
 * The engine's cold-start divisor of 1 is what preserves it.
 *
 * ⚠ Uses a DIFFERENT knob on purpose. The acceleration state is per knob, and
 * "cold start" means that knob's own state is untouched — CC 73 has been spun
 * hard by the steps above and is mid-curve, so asking it for a cold single
 * detent measures the leftover accumulator, not the rule. Simulating the 2 s
 * staleness reset instead would put a real 2 s sleep in the suite for the same
 * assertion.
 * NOTE FX K4 = Quantize (0-100), also a 'cont' knob, never touched until here. */
step('a FRESH knob moves on its very first detent — exact dialing survives', () => {
    const FRESH_CC = 74;
    const before = writes.slice();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, FRESH_CC, 1]));
    ticks(1);
    /* A WRITE is the observable here, not a difference: this knob has never
     * been turned, so there is no earlier value to difference against — and
     * travel() would report 0 for "no baseline" exactly as it does for "did not
     * move". Two different facts must not share one reading. */
    const moved = writes.slice(before.length).filter((w) => w.indexOf('quantize') >= 0);
    if (moved.length === 0)
        throw new Error('a deliberate single detent did nothing — exact dialing is gone; ' +
                        'writes=' + JSON.stringify(writes.slice(before.length).slice(-3)));
});


/* ---- Range normalisation (Josh, 2026-08-26, after feeling the fix above) ----
 * "does the param min/max affect the speed? b/c it feels like larger ranges move
 * slower from min to max than smaller ranges." They did, exactly: one knob unit
 * was one integer value, so crossing a param cost detents in proportion to its
 * range. A knob unit is now scaled by the range, so the GESTURE that sweeps a
 * narrow param also sweeps a wide one.
 *
 * ⚠ Asserted as a RATIO between two real params rather than as step sizes, so
 * SWEEP_UNITS stays tunable without a test edit. NOTE FX K6 = Gate (0-400) is
 * the widest continuous param on the bank; K3 = Velocity (-127..127) is the
 * anchor range whose step must stay exactly 1. */
step('a WIDE param sweeps in a comparable gesture, not 3x the travel', () => {
    const GATE_CC = 76;        /* NOTE FX K6, range 0-400  */
    const VEL_CC  = 73;        /* NOTE FX K3, range -127..127 (the 128 anchor) */
    const spin = (cc, key) => {
        park(cc - 71, 0);
        /* Seed the key first: travel() differences against a BASELINE, and a
         * param that has never been written has none — it would read 0, which is
         * indistinguishable from "did not move". */
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, cc, 1]));
        ticks(1);
        ticks(8);
        const before = writes.slice();
        for (let i = 0; i < 6; i++) {
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, cc, 4]));
            ticks(1);
        }
        return travel(before, writes, key);
    };
    const velTravel  = spin(VEL_CC,  'noteFX_velocity');
    const gateTravel = spin(GATE_CC, 'noteFX_gate');
    if (velTravel === 0 || gateTravel === 0)
        throw new Error('a spin moved nothing: vel=' + velTravel + ' gate=' + gateTravel +
                        ' writes=' + JSON.stringify(writes.slice(-3)));
    /* Gate's range is ~1.6x Velocity's, so its step should be ~2-3x — the point
     * is that it moves MORE per gesture, not the same. Before the fix these were
     * identical, since both moved one integer per unit. */
    if (!(gateTravel > velTravel))
        throw new Error('gate travelled ' + gateTravel + ' vs velocity ' + velTravel +
                        ' — a wider param is not being scaled, so it still crawls');
});

/* A NARROW param must keep a step of exactly 1 — that is what every existing
 * feel was tuned against, and speeding it up would be a regression dressed as a
 * fix. Only ranges WIDER than SWEEP_UNITS are scaled.
 *
 * ⚠ Uses NOTE FX K2 = Note Offset (-24..24), untouched until here, so its knob
 * state is genuinely cold (divisor 1 → exactly one knob unit). Velocity is NOT
 * the anchor despite spanning ±127: its RANGE is 254, wide enough to be scaled.
 * That mistake was in this test first and the assertion caught it. */
step('a narrow param keeps a step of exactly 1', () => {
    const RAND_CC = 72;        /* NOTE FX K2 = Note Offset, -24..24 */
    const before = writes.slice();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, RAND_CC, 1]));
    ticks(1);
    const w = writes.slice(before.length).filter((x) => x.indexOf('noteFX_offset') >= 0);
    if (w.length === 0)
        throw new Error('the narrow knob wrote nothing: ' + JSON.stringify(writes.slice(before.length).slice(-3)));
    const v = Math.abs(parseFloat(w[0].trim().split(/[=\s]+/).pop()));
    if (v !== 1)
        throw new Error('one cold detent on a narrow param produced ' + v + ' (' + w[0] + '), expected 1');
});


/* ---- DECELERATION: the step SHRINKS as the turn slows ----
 * Josh, 2026-08-26: "a consistent speed feel across the whole range ... like an
 * analog pot when turning normally (for large continuous value params) but can
 * be dialed in to a single dent when turning pretty slowly."
 *
 * Those are two different step sizes from one knob, chosen by speed. The range
 * scaling above delivers the pot half; this pins the OTHER half, which the
 * scaling alone would have broken — a wide param whose smallest possible move is
 * 3 cannot be dialled to an exact value.
 *
 * ⚠⚠ Every other step in this file runs at ZERO elapsed time, so they all sit in
 * the fast band and CANNOT see this. Nothing here was observable until the clock
 * was controllable — a green suite was not evidence either way. Date.now is
 * stubbed rather than slept: the real gaps would add ~7 s to the suite.
 */
step('turning SLOWLY on a wide param moves ONE unit at a time', () => {
    const GATE_CC = 76;                 /* NOTE FX K6, range 0-400 → scaled step 3 */
    const realNow = Date.now;
    try {
        park(GATE_CC - 71, 100);
        let clock = realNow.call(Date) + 10_000;
        globalThis.Date.now = () => clock;
        /* A gap over KNOB_ACCEL_MED_MS (150) is the "fine" band. Start beyond
         * KNOB_STALE_MS so the first detent is the cold-start click, then keep
         * every following gap slow. */
        clock += 5_000;
        const seen = [];
        let prev = null;
        for (let i = 0; i < 40; i++) {
            const before = writes.length;
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, GATE_CC, 1]));
            ticks(1);
            for (const w of writes.slice(before)) {
                if (w.indexOf('noteFX_gate') < 0) continue;
                const v = parseFloat(w.split('=').pop());
                if (!isFinite(v)) continue;
                if (prev !== null) seen.push(Math.abs(v - prev));
                prev = v;
            }
            clock += 200;               /* a slow, deliberate turn */
        }
        if (seen.length === 0)
            throw new Error('a slow turn never moved the param at all');
        const biggest = Math.max(...seen);
        if (biggest !== 1)
            throw new Error('a slow turn stepped by ' + biggest +
                            ' — a wide param cannot be dialled exactly (steps seen: ' +
                            JSON.stringify(seen.slice(0, 8)) + ')');
    } finally {
        globalThis.Date.now = realNow;
    }
});

/* The other end of the same knob: at speed it must move in the RANGE-SCALED step,
 * or the analog-pot half is gone and we are back to 400 detents for a sweep. */
step('...and turning FAST on the same param moves in bigger steps', () => {
    const GATE_CC = 76;
    const realNow = Date.now;
    try {
        park(GATE_CC - 71, 100);
        let clock = realNow.call(Date) + 50_000;
        globalThis.Date.now = () => clock;
        const seen = [];
        let prev = null;
        for (let i = 0; i < 40; i++) {
            const before = writes.length;
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, GATE_CC, 4]));
            ticks(1);
            for (const w of writes.slice(before)) {
                if (w.indexOf('noteFX_gate') < 0) continue;
                const v = parseFloat(w.split('=').pop());
                if (!isFinite(v)) continue;
                if (prev !== null) seen.push(Math.abs(v - prev));
                prev = v;
            }
            clock += 10;                /* well inside the fast band */
        }
        if (seen.length === 0) throw new Error('a fast turn never moved the param');
        const biggest = Math.max(...seen);
        if (!(biggest > 1))
            throw new Error('a fast turn still moved one unit at a time (' +
                            JSON.stringify(seen.slice(0, 8)) + ') — the range scaling is not reaching it');
    } finally {
        globalThis.Date.now = realNow;
    }
});


/* ---- DRUM mode must feel the same as MELODIC on the same param ----
 * Josh, 2026-08-26: "velocity knob in drum track notefx bank is slower by a good
 * bit... it does have twice the parameter range, though." The range was a red
 * herring — melodic Velocity has the identical -127..127. The difference was
 * that bank 1's DRUM branch is separate code with its own hardcoded clamps, and
 * it called ccKnobDelta with no range scale at all: one value per count (254 to
 * cross) against melodic's scaled ~100.
 *
 * ⚠ This is the second bug caused by that branch being invisible to a test
 * written for the generic path. The parity assertion is the durable fix: it does
 * not care what either rate IS, only that the same gesture on the same parameter
 * moves it the same distance in both modes. Retuning cannot break it; forgetting
 * one of the two paths will. */
step('the same knob on the same param feels the same in DRUM mode', () => {
    const VEL_CC = 73, IDX = 2;
    const gesture = (key) => {
        park(IDX, 0);
        /* Seed the key: travel() differences against a baseline and a param that
         * has never been written has none — it reads 0, which is
         * indistinguishable from "did not move". Third time this bit in this
         * file; it is why the throw below prints the raw writes. */
        globalThis.onMidiMessageInternal(new Uint8Array([0xB0, VEL_CC, 1]));
        ticks(1);
        ticks(4);
        const before = writes.slice();
        for (let i = 0; i < 6; i++) {
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, VEL_CC, 4]));
            ticks(1);
        }
        return travel(before, writes, key);
    };

    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    ticks(4);
    const melodic = gesture('noteFX_velocity');

    S.trackPadMode.fill(PAD_MODE_DRUM);
    ticks(4);
    const drum = gesture('velocity_offset');

    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    ticks(4);

    if (melodic === 0 || drum === 0)
        throw new Error('a mode moved nothing: melodic=' + melodic + ' drum=' + drum +
                        ' lane=' + S.activeDrumLane[0] +
                        ' last=' + JSON.stringify(writes.slice(-4)));
    /* One unit of slack for where each lands on its accumulator's remainder. */
    if (Math.abs(melodic - drum) > 1)
        throw new Error('same gesture, same param: melodic moved ' + melodic +
                        ' but drum moved ' + drum + ' — the two branches have drifted');
});


/* ---- ENUMERATED coverage: every table-driven knob, no site named twice ------
 * This is the payoff of making the drum bank declarative. The if-chain it
 * replaced could not be enumerated by a test, which is exactly why the same bug
 * reached Josh twice from two screens — so the assertions below do not name a
 * knob at all. They iterate whatever the table declares, and a knob added to it
 * later is covered the moment it is added.
 */
step('every declared drum NOTE FX knob writes the param it declares', () => {
    S.trackPadMode.fill(PAD_MODE_DRUM);
    ticks(4);
    for (const idx of Object.keys(DRUM_NOTEFX_SITES).map(Number)) {
        const site = DRUM_NOTEFX_SITES[idx];
        site.set(0, S.activeDrumLane[0] | 0, BANKS[1].knobs[idx].min);
        S.knobAccelAcc[idx] = 0; S.knobAccelLast[idx] = 0; S.knobAccum[idx] = 0;
        ticks(2);
        const before = writes.length;
        for (let i = 0; i < 8; i++) {
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71 + idx, 4]));
            ticks(1);
        }
        const mine = writes.slice(before).filter((w) => w.indexOf('pfx_set') >= 0);
        if (mine.length === 0)
            throw new Error(`K${idx + 1} (${site.pfx}) wrote nothing at all`);
        const wrong = mine.filter((w) => w.indexOf(site.pfx) < 0);
        if (wrong.length)
            throw new Error(`K${idx + 1} declares "${site.pfx}" but wrote ${JSON.stringify(wrong[0])}`);
    }
    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    ticks(4);
});

/* Each entry must respect the RANGE its metadata declares — the clamp now comes
 * from BANKS[1] rather than a copy beside each branch, and this is what proves
 * the two are actually connected. Drive well past the top and check where it
 * stops. */
step('every declared knob clamps to its metadata range, not a private copy', () => {
    S.trackPadMode.fill(PAD_MODE_DRUM);
    ticks(4);
    for (const idx of Object.keys(DRUM_NOTEFX_SITES).map(Number)) {
        const site = DRUM_NOTEFX_SITES[idx], pm = BANKS[1].knobs[idx];
        /* ⚠ Park through the TABLE's own setter, not park(): each drum entry
         * declares its own storage (velocity lives at bankParams[t][1][1], not
         * [2]), and that difference is the entire reason the table exists.
         * Using the melodic layout here left velocity pinned at its ceiling from
         * the previous step and the knob read as dead. */
        site.set(0, S.activeDrumLane[0] | 0, pm.min);
        S.knobAccelAcc[idx] = 0; S.knobAccelLast[idx] = 0; S.knobAccum[idx] = 0;
        ticks(2);
        const before = writes.length;
        /* Enough travel to pin any of these against the ceiling. */
        for (let i = 0; i < 200; i++) {
            globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 71 + idx, 20]));
            ticks(1);
        }
        const mine = writes.slice(before).filter((w) => w.indexOf(site.pfx) >= 0);
        if (mine.length === 0) throw new Error(`K${idx + 1} (${site.pfx}) wrote nothing`);
        const last = parseFloat(mine[mine.length - 1].trim().split(/\s+/).pop());
        if (last !== pm.max)
            throw new Error(`K${idx + 1} (${site.pfx}) topped out at ${last}, but its metadata says max ${pm.max}`);
    }
    S.trackPadMode.fill(PAD_MODE_MELODIC_SCALE);
    ticks(4);
});

/* A table entry pointing at a knob the bank calls a stub would be a silent
 * no-op on hardware: the LED ring and the label strip both read the metadata. */
step('no table entry points at a stub or blocked knob', () => {
    for (const idx of Object.keys(DRUM_NOTEFX_SITES).map(Number)) {
        const pm = BANKS[1].knobs[idx];
        if (!pm) throw new Error(`K${idx + 1} has no metadata in BANKS[1]`);
        if (pm.scope === 'stub' || !pm.abbrev)
            throw new Error(`K${idx + 1} is declared in the table but is a stub in BANKS[1]`);
    }
});

if (failed) process.exit(1);
console.log('test_knob_feel: PASS');
}

main().catch((e) => { bad('unhandled', e); process.exit(1); });
